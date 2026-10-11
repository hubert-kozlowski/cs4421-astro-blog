const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
export const LIVE_SCOREBOARD_CACHE_TTL_MS = 15_000;
export const LIVE_SUMMARY_CACHE_TTL_MS = 60_000;
const LIVE_REQUEST_TIMEOUT_MS = 8_000;
const LIVE_WINDOW_BEFORE_MS = 12 * 60 * 60 * 1000;
const LIVE_WINDOW_AFTER_MS = 8 * 24 * 60 * 60 * 1000;

export type LiveGameState = 'scheduled' | 'in_progress' | 'halftime' | 'final' | 'delayed';

export interface LiveStatAthlete {
	name: string;
	jersey?: string;
	stats: string[];
}

export interface LivePlayerCategory {
	name: string;
	labels: string[];
	athletes: LiveStatAthlete[];
}

export interface LiveTeamBoxScore {
	team: string;
	categories: LivePlayerCategory[];
	stats: { label: string; value: string }[];
}

export interface LiveGame {
	eventId: string;
	kickoffAt: string;
	homeTeam: string;
	awayTeam: string;
	homeScore: number;
	awayScore: number;
	state: LiveGameState;
	status: string;
	period: number | null;
	clock: string | null;
	boxScoreUpdatedAt: string | null;
	lastPlay: {
		id: string;
		text: string;
		scoring: boolean;
		keyAction: boolean;
	} | null;
	situation: {
		downDistance: string | null;
		possession: string | null;
		redZone: boolean;
		yardLine: number | null;
	} | null;
	boxScore: LiveTeamBoxScore[];
}

export interface LiveGamesResult {
	games: LiveGame[];
	fetchedAt: string;
	stale: boolean;
}

interface CachedValue {
	fetchedAt: number;
	value: unknown;
}

const responseCache = new Map<string, CachedValue>();
const requests = new Map<string, Promise<unknown>>();

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) return parsed;
	}
	return undefined;
}

function recordArray(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value) ? value.filter(isRecord) : [];
}

function textArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function teamAbbreviation(value: unknown): string | undefined {
	return isRecord(value) ? stringValue(value.abbreviation) : undefined;
}

function getEventTeams(event: Record<string, unknown>): {
	homeTeam: string;
	awayTeam: string;
	homeScore: number;
	awayScore: number;
	competition: Record<string, unknown>;
} | undefined {
	const competitions = recordArray(event.competitions);
	const competition = competitions[0];
	if (!competition) return undefined;
	const competitors = recordArray(competition.competitors);
	const home = competitors.find((competitor) => competitor.homeAway === 'home');
	const away = competitors.find((competitor) => competitor.homeAway === 'away');
	if (!home || !away) return undefined;
	const homeTeam = teamAbbreviation(home.team);
	const awayTeam = teamAbbreviation(away.team);
	if (!homeTeam || !awayTeam) return undefined;
	return {
		homeTeam,
		awayTeam,
		homeScore: numberValue(home.score) ?? 0,
		awayScore: numberValue(away.score) ?? 0,
		competition,
	};
}

function statusRecord(event: Record<string, unknown>, competition: Record<string, unknown>): Record<string, unknown> {
	const competitionStatus = isRecord(competition.status) ? competition.status : undefined;
	const eventStatus = isRecord(event.status) ? event.status : undefined;
	return competitionStatus ?? eventStatus ?? {};
}

function classifyState(status: Record<string, unknown>): LiveGameState {
	const type = isRecord(status.type) ? status.type : {};
	const name = (stringValue(type.name) ?? '').toUpperCase();
	const state = (stringValue(type.state) ?? '').toLowerCase();
	if (type.completed === true || name.includes('FINAL')) return 'final';
	if (name.includes('HALFTIME') || name.includes('HALF_TIME')) return 'halftime';
	if (name.includes('DELAY') || name.includes('POSTPON')) return 'delayed';
	if (state === 'in' || name.includes('IN_PROGRESS') || name.includes('LIVE')) return 'in_progress';
	return 'scheduled';
}

function parseBoxScore(value: unknown): LiveTeamBoxScore[] {
	if (!isRecord(value)) return [];
	const boxscore = isRecord(value.boxscore) ? value.boxscore : undefined;
	if (!boxscore) return [];
	const teamStatsByTeam = new Map<string, { label: string; value: string }[]>();
	for (const teamStats of recordArray(boxscore.teams)) {
		const team = teamAbbreviation(teamStats.team);
		if (!team) continue;
		const stats = recordArray(teamStats.statistics).flatMap((stat) => {
			const label = stringValue(stat.label) ?? stringValue(stat.name);
			const valueText = stringValue(stat.displayValue);
			return label && valueText ? [{ label, value: valueText }] : [];
		});
		teamStatsByTeam.set(team, stats);
	}

	const playerStatsByTeam = new Map<string, LivePlayerCategory[]>();
	for (const playerGroup of recordArray(boxscore.players)) {
		const team = teamAbbreviation(playerGroup.team);
		if (!team) continue;
		const categories = recordArray(playerGroup.statistics).flatMap((category) => {
			const name = stringValue(category.name);
			if (!name) return [];
			const labels = textArray(category.labels);
			const athletes = recordArray(category.athletes).flatMap((entry) => {
				const athlete = isRecord(entry.athlete) ? entry.athlete : {};
				const athleteName = stringValue(athlete.displayName) ?? stringValue(athlete.fullName);
				return athleteName
					? [{
							name: athleteName,
							jersey: stringValue(athlete.displayName) ? stringValue(athlete.jersey) : undefined,
							stats: textArray(entry.stats),
						}]
					: [];
			});
			return [{ name, labels, athletes }];
		});
		playerStatsByTeam.set(team, categories);
	}

	const teams = new Set([...teamStatsByTeam.keys(), ...playerStatsByTeam.keys()]);
	return [...teams].map((team) => ({
		team,
		categories: playerStatsByTeam.get(team) ?? [],
		stats: teamStatsByTeam.get(team) ?? [],
	}));
}

function parseLiveEvent(event: Record<string, unknown>, now: number): LiveGame | undefined {
	const eventId = stringValue(event.id);
	const date = stringValue(event.date);
	if (!eventId || !date || !Number.isFinite(Date.parse(date))) return undefined;
	const match = getEventTeams(event);
	if (!match) return undefined;
	const status = statusRecord(event, match.competition);
	const state = classifyState(status);
	const kickoffAt = stringValue(match.competition.date) ?? date;
	const kickoffTime = Date.parse(kickoffAt);
	if (!Number.isFinite(kickoffTime) || kickoffTime < now - LIVE_WINDOW_BEFORE_MS || kickoffTime > now + LIVE_WINDOW_AFTER_MS) {
		return undefined;
	}
	const type = isRecord(status.type) ? status.type : {};
	const period = numberValue(status.period);
	const clock = stringValue(status.displayClock);
	const competitionSituation = isRecord(match.competition.situation) ? match.competition.situation : undefined;
	const lastPlay = competitionSituation && isRecord(competitionSituation.lastPlay)
		? competitionSituation.lastPlay
		: undefined;
	const playText = stringValue(lastPlay?.text);
	const playType = lastPlay && isRecord(lastPlay.type) ? stringValue(lastPlay.type.text) : undefined;
	const scoreValue = numberValue(lastPlay?.scoreValue) ?? 0;
	const statusText =
		stringValue(type.detail) ??
		stringValue(type.description) ??
		(state === 'in_progress' && period ? `${clock ?? ''} · Q${period}`.trim() : state);
	const situation = competitionSituation
		? {
				downDistance: stringValue(competitionSituation.downDistanceText) ?? null,
				possession: stringValue(competitionSituation.possessionText) ?? null,
				redZone: competitionSituation.isRedZone === true,
				yardLine: (() => {
					const yardLine = numberValue(competitionSituation.yardLine);
					return yardLine !== undefined &&
						Number.isInteger(yardLine) &&
						yardLine >= 0 &&
						yardLine <= 100
						? yardLine
						: null;
				})(),
			}
		: null;
	return {
		eventId,
		kickoffAt,
		homeTeam: match.homeTeam,
		awayTeam: match.awayTeam,
		homeScore: match.homeScore,
		awayScore: match.awayScore,
		state,
		status: statusText,
		period: period ?? null,
		clock: clock ?? null,
		boxScoreUpdatedAt: null,
		lastPlay: playText
			? {
					id: stringValue(lastPlay?.id) ?? `${eventId}-${playText}`,
					text: `${playType ? `${playType}: ` : ''}${playText.trim()}`,
					scoring: scoreValue > 0,
					keyAction: scoreValue > 0 || /\b(touchdown|interception|fumble|safety|field goal|two-point)\b/i.test(playText),
				}
			: null,
		situation,
		boxScore: [],
	};
}

async function fetchJson(url: string, cacheKey: string, ttlMs: number): Promise<{ value: unknown; fetchedAt: number }> {
	const cached = responseCache.get(cacheKey);
	if (cached && Date.now() - cached.fetchedAt < ttlMs) return cached;
	let pending = requests.get(cacheKey);
	if (!pending) {
		pending = fetch(url, {
			headers: { Accept: 'application/json' },
			signal: AbortSignal.timeout(LIVE_REQUEST_TIMEOUT_MS),
		}).then(async (response) => {
			if (!response.ok) throw new Error(`Live provider returned HTTP ${response.status}.`);
			return response.json() as Promise<unknown>;
		});
		requests.set(cacheKey, pending);
	}
	try {
		const value = await pending;
		const entry = { value, fetchedAt: Date.now() };
		responseCache.set(cacheKey, entry);
		return entry;
	} finally {
		requests.delete(cacheKey);
	}
}

function dayKey(date: Date): string {
	return date.toISOString().slice(0, 10).replaceAll('-', '');
}

async function fetchScoreboard(date: string): Promise<{ events: Record<string, unknown>[]; fetchedAt: number }> {
	const query = new URLSearchParams({ dates: date });
	const { value, fetchedAt } = await fetchJson(
		`${ESPN_BASE_URL}/scoreboard?${query}`,
		`live-scoreboard-${date}`,
		LIVE_SCOREBOARD_CACHE_TTL_MS,
	);
	if (!isRecord(value) || !Array.isArray(value.events) || !value.events.every(isRecord)) {
		throw new Error('Live provider returned a scoreboard with an unexpected shape.');
	}
	return { events: value.events, fetchedAt };
}

async function fetchSummary(eventId: string): Promise<{ value: unknown; fetchedAt: number }> {
	const query = new URLSearchParams({ event: eventId });
	const result = await fetchJson(
		`${ESPN_BASE_URL}/summary?${query}`,
		`live-summary-${eventId}`,
		LIVE_SUMMARY_CACHE_TTL_MS,
	);
	if (!isRecord(result.value)) throw new Error('Live provider returned a game summary with an unexpected shape.');
	return result;
}

export async function getLiveGames(date = new Date()): Promise<LiveGamesResult> {
	const days = [-1, 0, 1].map((offset) => {
		const day = new Date(date);
		day.setUTCDate(day.getUTCDate() + offset);
		return dayKey(day);
	});
	const fetched = await Promise.allSettled(days.map((day) => fetchScoreboard(day)));
	const successful = fetched.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
	if (successful.length === 0) {
		const errors = fetched.flatMap((result) => result.status === 'rejected' ? [result.reason] : []);
		throw new Error(`Live scoreboard unavailable (${errors.length} date requests failed).`);
	}

	const uniqueEvents = new Map<string, LiveGame>();
	for (const result of successful) {
		for (const event of result.events) {
			const game = parseLiveEvent(event, date.getTime());
			if (game) uniqueEvents.set(game.eventId, game);
		}
	}

	let stale = successful.length !== days.length;
	const games = [...uniqueEvents.values()].sort((left, right) => Date.parse(left.kickoffAt) - Date.parse(right.kickoffAt));
	const summaries = await Promise.all(
		games.filter((game) => game.state === 'in_progress' || game.state === 'halftime').map(async (game) => {
			try {
				return { eventId: game.eventId, value: await fetchSummary(game.eventId) };
			} catch (error) {
				stale = true;
				console.warn(
					JSON.stringify({
						level: 'warn',
						event: 'live_game_summary_unavailable',
						eventId: game.eventId,
						error: error instanceof Error ? error.name : 'UnknownError',
					}),
				);
				return undefined;
			}
		}),
	);
	for (const summary of summaries) {
		if (!summary) continue;
		const game = uniqueEvents.get(summary.eventId);
		if (game) {
			game.boxScore = parseBoxScore(summary.value.value);
			game.boxScoreUpdatedAt = new Date(summary.value.fetchedAt).toISOString();
		}
	}

	const fetchedAt = new Date(Math.max(...successful.map((result) => result.fetchedAt))).toISOString();
	return { games, fetchedAt, stale };
}
