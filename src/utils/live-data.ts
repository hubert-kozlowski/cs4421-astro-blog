const ESPN_BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';
export const LIVE_SCOREBOARD_CACHE_TTL_MS = 10_000;
export const LIVE_SUMMARY_CACHE_TTL_MS = 60_000;
const LIVE_REQUEST_TIMEOUT_MS = 8_000;
const LIVE_WINDOW_BEFORE_MS = 12 * 60 * 60 * 1000;
const LIVE_WINDOW_AFTER_MS = 8 * 24 * 60 * 60 * 1000;

export type LiveGameState = 'scheduled' | 'in_progress' | 'halftime' | 'final' | 'delayed';
export type LiveGameNotice = 'flag' | 'under_review';
export type LiveGameMoment = 'two_minute_warning';

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
	moment: LiveGameMoment | null;
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
	notice: LiveGameNotice | null;
	situation: {
		downDistance: string | null;
		possession: string | null;
		redZone: boolean;
		yardLine: number | null;
		direction: 'left' | 'right' | null;
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

function identifier(value: unknown): string | undefined {
	if (typeof value === 'string' && value.trim() !== '') return value.trim();
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	return undefined;
}

function isPositiveAdvance(play: Record<string, unknown>): boolean {
	const type = isRecord(play.type) ? stringValue(play.type.text) : undefined;
	const text = stringValue(play.text) ?? '';
	if (/penalt|no play|incomplete|sack|loss of/i.test(`${type ?? ''} ${text}`)) return false;
	const yards = text.match(/\bfor\s+(\d+)\s+yards?\b/i);
	return Boolean(yards && Number(yards[1]) > 0);
}

function getEventTeams(event: Record<string, unknown>): {
	homeTeam: string;
	homeTeamId: string | undefined;
	awayTeam: string;
	awayTeamId: string | undefined;
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
		homeTeamId: identifier(home.id),
		awayTeam,
		awayTeamId: identifier(away.id),
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

function classifyMoment(
	status: Record<string, unknown>,
	period: number | undefined,
	clock: string | undefined,
	playType: string | undefined,
	playText: string | undefined,
): LiveGameMoment | null {
	const type = isRecord(status.type) ? status.type : {};
	const statusAndPlayText = [
		stringValue(status.name),
		stringValue(status.detail),
		stringValue(status.description),
		stringValue(type.name),
		stringValue(type.detail),
		stringValue(type.description),
		playType,
		playText,
	].filter(Boolean).join(' ');
	if (/\b(?:two|2)[ -]minute warning\b/i.test(statusAndPlayText)) return 'two_minute_warning';
	return (period === 2 || period === 4) && clock?.trim() === '2:00'
		? 'two_minute_warning'
		: null;
}

function classifyLiveNotice(
	status: Record<string, unknown>,
	playType: string | undefined,
	playText: string | undefined,
): LiveGameNotice | null {
	const type = isRecord(status.type) ? status.type : {};
	const statusText = [
		stringValue(status.name),
		stringValue(status.detail),
		stringValue(status.description),
		stringValue(type.name),
		stringValue(type.detail),
		stringValue(type.description),
	].filter(Boolean).join(' ');
	const playDescription = [playType, playText].filter(Boolean).join(' ');
	if (
		/\b(?:under review|replay review|booth review|review in progress|challenged)\b/i.test(statusText) ||
		/\b(?:under review|replay review|booth review|review in progress|challenged by|challenge initiated)\b/i.test(playDescription) ||
		/\breview\b/i.test(playType ?? '')
	) return 'under_review';
	if (
		/\b(?:penalty|flag)\b/i.test(playType ?? '') ||
		/\bPENALTY\s+on\b|\bflag (?:on the play|thrown|picked up)\b/i.test(playText ?? '')
	) return 'flag';
	return null;
}

function liveFieldDirection(
	situation: Record<string, unknown> | undefined,
	possessionId: string | undefined,
): 'left' | 'right' | null {
	const play = situation && isRecord(situation.lastPlay) ? situation.lastPlay : undefined;
	if (!play || !isPositiveAdvance(play)) return null;
	const start = play && isRecord(play.start) ? numberValue(play.start.yardLine) : undefined;
	const end = play && isRecord(play.end) ? numberValue(play.end.yardLine) : undefined;
	if (
		start === undefined ||
		end === undefined ||
		!Number.isInteger(start) ||
		!Number.isInteger(end) ||
		start < 0 ||
		start > 100 ||
		end < 0 ||
		end > 100 ||
		start === end
	) return null;

	const teamRecord = play && isRecord(play.team) ? play.team : undefined;
	const startRecord = play && isRecord(play.start) && isRecord(play.start.team) ? play.start.team : undefined;
	const playTeamId = identifier(teamRecord?.id) ?? identifier(startRecord?.id);
	if (!possessionId || !playTeamId || possessionId !== playTeamId) return null;
	const playMovesRight = end > start;
	return playMovesRight ? 'right' : 'left';
}

function summaryFieldDirection(summary: unknown, possession: string | null): 'left' | 'right' | null {
	if (!possession || !isRecord(summary)) return null;
	const header = isRecord(summary.header) ? summary.header : undefined;
	const competition = recordArray(header?.competitions)[0];
	if (!competition) return null;
	const competitors = recordArray(competition.competitors);
	const possessionId = competitors.find((competitor) =>
		teamAbbreviation(competitor.team)?.toUpperCase() === possession.toUpperCase(),
	);
	const possessionTeamId = possessionId ? identifier(possessionId.id) : undefined;
	if (!possessionTeamId) return null;

	const drives = isRecord(summary.drives) ? summary.drives : undefined;
	const currentDrive = drives && isRecord(drives.current) ? drives.current : undefined;
	if (!currentDrive) return null;
	const plays = recordArray(currentDrive.plays);
	for (let index = plays.length - 1; index >= 0; index -= 1) {
		const play = plays[index];
		if (!isPositiveAdvance(play)) continue;
		const start = isRecord(play.start) ? numberValue(play.start.yardLine) : undefined;
		const end = isRecord(play.end) ? numberValue(play.end.yardLine) : undefined;
		if (
			start === undefined ||
			end === undefined ||
			!Number.isInteger(start) ||
			!Number.isInteger(end) ||
			start < 0 ||
			start > 100 ||
			end < 0 ||
			end > 100 ||
			start === end
		) continue;
		const offense = recordArray(play.teamParticipants).find((participant) => participant.type === 'offense');
		const offenseId = identifier(offense?.id) ??
			(isRecord(play.start) && isRecord(play.start.team) ? identifier(play.start.team.id) : undefined);
		if (!offenseId || offenseId !== possessionTeamId) continue;
		return end > start ? 'right' : 'left';
	}
	return null;
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
	const possessionId = identifier(competitionSituation?.possession);
	const possessionText = stringValue(competitionSituation?.possessionText)?.trim().toUpperCase();
	const possessionTeam = possessionId && possessionId === match.homeTeamId
		? match.homeTeam
		: possessionId && possessionId === match.awayTeamId
			? match.awayTeam
			: possessionText === match.homeTeam.toUpperCase()
				? match.homeTeam
				: possessionText === match.awayTeam.toUpperCase()
					? match.awayTeam
					: null;
	const lastPlay = competitionSituation && isRecord(competitionSituation.lastPlay)
		? competitionSituation.lastPlay
		: undefined;
	const playText = stringValue(lastPlay?.text);
	const playType = lastPlay && isRecord(lastPlay.type) ? stringValue(lastPlay.type.text) : undefined;
	const moment = classifyMoment(status, period, clock, playType, playText);
	const scoreValue = numberValue(lastPlay?.scoreValue) ?? 0;
	const statusText =
		stringValue(type.detail) ??
		stringValue(type.description) ??
		(state === 'in_progress' && period ? `${clock ?? ''} · Q${period}`.trim() : state);
	const situation = competitionSituation
		? {
				downDistance: stringValue(competitionSituation.downDistanceText) ?? null,
				possession: possessionTeam,
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
				direction: liveFieldDirection(competitionSituation, possessionId),
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
		moment,
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
		notice: classifyLiveNotice(status, playType, playText),
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
			if (game.situation && !game.situation.direction) {
				game.situation.direction = summaryFieldDirection(summary.value.value, game.situation.possession);
			}
		}
	}

	const fetchedAt = new Date(Math.max(...successful.map((result) => result.fetchedAt))).toISOString();
	return { games, fetchedAt, stale };
}
