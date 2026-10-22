import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isAbsoluteTimestamp } from './local-game-time';

const API_BASE_URL = process.env.NFL_DATA_API_BASE_URL ?? 'https://api.nfldata.org/v1';
const ESPN_SCOREBOARD_URL =
	process.env.NFL_ESPN_SCOREBOARD_URL ?? 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
const CACHE_TTL_MS = 15 * 60 * 1000;
const METADATA_TTL_MS = 24 * 60 * 60 * 1000;
const SCOREBOARD_TTL_MS = 15 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 30_000;
const REQUEST_TIMEOUT_MS = 8_000;

export interface NflTeam {
	abbr: string;
	name: string;
	conf: string;
	division: string;
}

export interface NflGame {
	game_id: string;
	season?: number | null;
	week?: number | null;
	game_type?: string | null;
	gameday?: string | null;
	gametime?: string | null;
	kickoff_at?: string | null;
	home_team?: string | null;
	away_team?: string | null;
	home_score?: number | null;
	away_score?: number | null;
	spread_line?: number | null;
	overtime?: boolean | null;
	stadium?: string | null;
	div_game?: boolean | null;
}

export interface NflPlayer {
	gsis_id: string;
	display_name: string;
	first_name?: string | null;
	last_name?: string | null;
	position?: string | null;
	position_group?: string | null;
	birth_date?: string | null;
	height?: number | null;
	weight?: number | null;
	college?: string | null;
	draft_year?: number | null;
	draft_round?: number | null;
	draft_pick?: number | null;
	draft_club?: string | null;
	status?: string | null;
	years_exp?: number | null;
	rookie_year?: number | null;
}

export interface NflPlayerSeasonStats {
	player_id: string;
	player_name: string;
	player_display_name?: string | null;
	position?: string | null;
	position_group?: string | null;
	season: number;
	season_type?: string | null;
	recent_team?: string | null;
	games: number;
	completions?: number | null;
	attempts?: number | null;
	carries?: number | null;
	passing_yards?: number | null;
	passing_tds?: number | null;
	passing_interceptions?: number | null;
	rushing_yards?: number | null;
	rushing_tds?: number | null;
	receptions?: number | null;
	targets?: number | null;
	receiving_yards?: number | null;
	receiving_tds?: number | null;
	def_tackles_solo?: number | null;
	def_sacks?: number | null;
	def_fumbles_forced?: number | null;
	def_interceptions?: number | null;
	def_qb_hits?: number | null;
}

export interface ApiResult<T> {
	value: T;
	fetchedAt: string;
	stale: boolean;
}

export interface TeamRecord extends NflTeam {
	wins: number;
	losses: number;
	ties: number;
	gamesPlayed: number;
	winPercentage: number;
}

export interface NflDashboardData {
	season: number;
	week: number;
	availableWeeks: number[];
	games: NflGame[];
	upcomingGames: NflGame[];
	countdownGames: NflGame[];
	teams: NflTeam[];
	records: TeamRecord[];
	fetchedAt: string;
	stale: boolean;
}

interface ApiMetadata {
	seasons: number[];
	teams: NflTeam[];
}

interface PaginatedResponse<T> {
	data: T[];
	total: number;
	limit: number;
	offset: number;
}

export interface HeadToHead {
	team1: string;
	team2: string;
	total_games: number;
	record: Record<string, { wins: number; losses: number; ties: number }>;
	games: NflGame[];
}

interface CacheRecord {
	fetchedAt: string;
	value: unknown;
}

interface EspnScoreboard {
	events: EspnEvent[];
}

interface EspnEvent {
	date?: string;
	competitions?: EspnCompetition[];
}

interface EspnCompetition {
	date?: string;
	status?: { type?: { completed?: boolean; name?: string } };
	competitors?: EspnCompetitor[];
}

interface EspnCompetitor {
	team?: { abbreviation?: string };
	score?: string;
	homeAway?: string;
}

const memoryCache = new Map<string, CacheRecord>();
const inFlight = new Map<string, Promise<CacheRecord>>();
const failureCache = new Map<string, { until: number; error: NflDataError }>();

export class NflDataError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NflDataError';
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
	return value === null || typeof value === 'string';
}

function isNullableNumber(value: unknown): value is number | null {
	return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isAbsoluteDateTime(value: string | undefined): value is string {
	return isAbsoluteTimestamp(value);
}

function isGame(value: unknown): value is NflGame {
	return (
		isObject(value) &&
		typeof value.game_id === 'string' &&
		(value.season === undefined || isNullableNumber(value.season)) &&
		(value.week === undefined || isNullableNumber(value.week)) &&
		(value.game_type === undefined || isNullableString(value.game_type)) &&
		(value.gameday === undefined || isNullableString(value.gameday)) &&
		(value.gametime === undefined || isNullableString(value.gametime)) &&
		(value.kickoff_at === undefined || isNullableString(value.kickoff_at)) &&
		(value.home_team === undefined || isNullableString(value.home_team)) &&
		(value.away_team === undefined || isNullableString(value.away_team)) &&
		(value.home_score === undefined || isNullableNumber(value.home_score)) &&
		(value.away_score === undefined || isNullableNumber(value.away_score)) &&
		(value.spread_line === undefined || isNullableNumber(value.spread_line)) &&
		(value.div_game === undefined || value.div_game === null || typeof value.div_game === 'boolean')
	);
}

function isEspnCompetitor(value: unknown): value is EspnCompetitor {
	return (
		isObject(value) &&
		(value.team === undefined ||
			(isObject(value.team) &&
				(value.team.abbreviation === undefined || typeof value.team.abbreviation === 'string'))) &&
		(value.score === undefined || typeof value.score === 'string') &&
		(value.homeAway === undefined || typeof value.homeAway === 'string')
	);
}

function isEspnCompetition(value: unknown): value is EspnCompetition {
	if (!isObject(value)) return false;
	if (value.date !== undefined && typeof value.date !== 'string') return false;
	if (value.status !== undefined) {
		if (!isObject(value.status)) return false;
		if (value.status.type !== undefined) {
			if (!isObject(value.status.type)) return false;
			if (
				(value.status.type.completed !== undefined &&
					typeof value.status.type.completed !== 'boolean') ||
				(value.status.type.name !== undefined && typeof value.status.type.name !== 'string')
			) {
				return false;
			}
		}
	}
	return (
		value.competitors === undefined ||
		(Array.isArray(value.competitors) && value.competitors.every(isEspnCompetitor))
	);
}

function isEspnScoreboard(value: unknown): value is EspnScoreboard {
	return (
		isObject(value) &&
		Array.isArray(value.events) &&
		value.events.every(
			(event) =>
				isObject(event) &&
				(event.date === undefined || typeof event.date === 'string') &&
				(event.competitions === undefined ||
					(Array.isArray(event.competitions) && event.competitions.every(isEspnCompetition))),
		)
	);
}

function isTeam(value: unknown): value is NflTeam {
	return (
		isObject(value) &&
		typeof value.abbr === 'string' &&
		typeof value.name === 'string' &&
		typeof value.conf === 'string' &&
		typeof value.division === 'string'
	);
}

function isPlayer(value: unknown): value is NflPlayer {
	return (
		isObject(value) &&
		typeof value.gsis_id === 'string' &&
		typeof value.display_name === 'string'
	);
}

function isPlayerSeasonStats(value: unknown): value is NflPlayerSeasonStats {
	return (
		isObject(value) &&
		typeof value.player_id === 'string' &&
		typeof value.player_name === 'string' &&
		typeof value.season === 'number' &&
		typeof value.games === 'number' &&
		[
			'completions',
			'attempts',
			'carries',
			'passing_yards',
			'passing_tds',
			'passing_interceptions',
			'rushing_yards',
			'rushing_tds',
			'receptions',
			'targets',
			'receiving_yards',
			'receiving_tds',
			'def_tackles_solo',
			'def_sacks',
			'def_fumbles_forced',
			'def_interceptions',
			'def_qb_hits',
		].every((key) => value[key] === undefined || isNullableNumber(value[key]))
	);
}

function isPaginated<T>(value: unknown, isItem: (item: unknown) => item is T): value is PaginatedResponse<T> {
	return (
		isObject(value) &&
		Array.isArray(value.data) &&
		value.data.every(isItem) &&
		typeof value.total === 'number' &&
		typeof value.limit === 'number' &&
		typeof value.offset === 'number'
	);
}

function isMetadata(value: unknown): value is ApiMetadata {
	return (
		isObject(value) &&
		Array.isArray(value.seasons) &&
		value.seasons.every((season) => typeof season === 'number') &&
		Array.isArray(value.teams) &&
		value.teams.every(isTeam)
	);
}

function isHeadToHead(value: unknown): value is HeadToHead {
	return (
		isObject(value) &&
		typeof value.team1 === 'string' &&
		typeof value.team2 === 'string' &&
		typeof value.total_games === 'number' &&
		isObject(value.record) &&
		Object.values(value.record).every(
			(record) =>
				isObject(record) &&
				typeof record.wins === 'number' &&
				typeof record.losses === 'number' &&
				typeof record.ties === 'number',
		) &&
		Array.isArray(value.games) &&
		value.games.every(isGame)
	);
}

function cacheDirectory(): string {
	return join(process.env.NFL_DATA_DIR ?? '.data', 'api-cache');
}

function cacheFile(key: string): string {
	const digest = createHash('sha256').update(key).digest('hex');
	return join(cacheDirectory(), `${digest}.json`);
}

async function readDiskCache(key: string): Promise<CacheRecord | undefined> {
	try {
		const content = await readFile(cacheFile(key), 'utf8');
		const parsed: unknown = JSON.parse(content);
		if (isObject(parsed) && typeof parsed.fetchedAt === 'string' && 'value' in parsed) {
			return { fetchedAt: parsed.fetchedAt, value: parsed.value };
		}
		console.warn(JSON.stringify({ level: 'warn', event: 'nfl_cache_invalid', key }));
	} catch (error) {
		if (isObject(error) && error.code !== 'ENOENT') {
			console.warn(
				JSON.stringify({
					level: 'warn',
					event: 'nfl_cache_read_failed',
					key,
					error: error instanceof Error ? error.name : 'UnknownError',
				}),
			);
		}
	}
	return undefined;
}

async function writeDiskCache(key: string, record: CacheRecord): Promise<void> {
	try {
		await mkdir(cacheDirectory(), { recursive: true });
		await writeFile(cacheFile(key), JSON.stringify(record), 'utf8');
	} catch (error) {
		console.warn(
			JSON.stringify({
				level: 'warn',
				event: 'nfl_cache_write_failed',
				key,
				error: error instanceof Error ? error.name : 'UnknownError',
			}),
		);
	}
}

async function fetchAndValidate(key: string, url: string, isValid: (value: unknown) => boolean): Promise<CacheRecord> {
	const response = await fetch(url, {
		headers: { Accept: 'application/json' },
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
	if (!response.ok) {
		throw new NflDataError(`NFL data provider returned HTTP ${response.status}.`);
	}
	const value: unknown = await response.json();
	if (!isValid(value)) {
		throw new NflDataError('NFL data provider returned a response with an unexpected shape.');
	}
	const record = { fetchedAt: new Date().toISOString(), value };
	memoryCache.set(key, record);
	failureCache.delete(key);
	await writeDiskCache(key, record);
	return record;
}

async function getCached<T>(
	key: string,
	url: string,
	isValid: (value: unknown) => value is T,
	ttlMs = CACHE_TTL_MS,
): Promise<ApiResult<T>> {
	const now = Date.now();
	const memoryRecord = memoryCache.get(key);
	if (memoryRecord && isValid(memoryRecord.value) && now - Date.parse(memoryRecord.fetchedAt) < ttlMs) {
		return { value: memoryRecord.value, fetchedAt: memoryRecord.fetchedAt, stale: false };
	}

	const diskRecord = await readDiskCache(key);
	if (diskRecord && isValid(diskRecord.value)) {
		memoryCache.set(key, diskRecord);
		if (Date.now() - Date.parse(diskRecord.fetchedAt) < ttlMs) {
			return { value: diskRecord.value, fetchedAt: diskRecord.fetchedAt, stale: false };
		}
	}

	const cachedFailure = failureCache.get(key);
	if (cachedFailure && cachedFailure.until > Date.now()) {
		const fallback = diskRecord && isValid(diskRecord.value) ? diskRecord : memoryRecord;
		if (fallback && isValid(fallback.value)) {
			return { value: fallback.value, fetchedAt: fallback.fetchedAt, stale: true };
		}
		throw cachedFailure.error;
	}

	let pending = inFlight.get(key);
	if (!pending) {
		pending = fetchAndValidate(key, url, isValid);
		inFlight.set(key, pending);
	}

	try {
		const record = await pending;
		if (!isValid(record.value)) {
			throw new NflDataError('Cached NFL data did not match the expected response shape.');
		}
		return { value: record.value, fetchedAt: record.fetchedAt, stale: false };
	} catch (error) {
		const fallback = diskRecord && isValid(diskRecord.value) ? diskRecord : memoryRecord;
		if (fallback && isValid(fallback.value)) {
			failureCache.set(key, {
				until: Date.now() + FAILURE_COOLDOWN_MS,
				error: error instanceof NflDataError ? error : new NflDataError('NFL data provider could not be reached.'),
			});
			console.warn(
				JSON.stringify({
					level: 'warn',
					event: 'nfl_data_stale_fallback',
					key,
					error: error instanceof Error ? error.name : 'UnknownError',
					fetchedAt: fallback.fetchedAt,
				}),
			);
			return { value: fallback.value, fetchedAt: fallback.fetchedAt, stale: true };
		}
		console.error(
			JSON.stringify({
				level: 'error',
				event: 'nfl_data_request_failed',
				key,
				error: error instanceof Error ? error.name : 'UnknownError',
			}),
		);
		const providerError =
			error instanceof NflDataError ? error : new NflDataError('NFL data provider could not be reached.');
		failureCache.set(key, { until: Date.now() + FAILURE_COOLDOWN_MS, error: providerError });
		if (error instanceof NflDataError) {
			throw error;
		}
		throw providerError;
	} finally {
		inFlight.delete(key);
	}
}

function urlFor(path: string): string {
	return `${API_BASE_URL}${path}`;
}

export function getApiMetadata(): Promise<ApiResult<ApiMetadata>> {
	return getCached('metadata', urlFor('/meta'), isMetadata, METADATA_TTL_MS);
}

export function getSeasonGames(season: number): Promise<ApiResult<PaginatedResponse<NflGame>>> {
	const query = new URLSearchParams({ season: String(season), limit: '1000' });
	const key = `games-${season}`;
	return getCached(
		key,
		urlFor(`/games?${query}`),
		(value): value is PaginatedResponse<NflGame> => isPaginated(value, isGame),
	).then(enrichGameResults);
}

export async function getGame(gameId: string): Promise<ApiResult<NflGame>> {
	if (!/^[A-Za-z0-9_-]{1,40}$/.test(gameId)) {
		throw new NflDataError('Invalid game identifier.');
	}
	return enrichSingleGame(
		await getCached(`game-${gameId}`, urlFor(`/games/${encodeURIComponent(gameId)}`), isGame),
	);
}

function canonicalTeamAbbreviation(abbreviation: string | null | undefined): string {
	if (abbreviation === 'LAR') return 'LA';
	if (abbreviation === 'WAS') return 'WSH';
	return abbreviation ?? '';
}

export function mergeEspnFinalScores(games: NflGame[], scoreboard: unknown): NflGame[] {
	if (!isEspnScoreboard(scoreboard)) return games;

	return games.map((game) => {
		if (
			!game.gameday ||
			!game.home_team ||
			!game.away_team
		) {
			return game;
		}
		const scheduledDay = Date.parse(`${game.gameday}T00:00:00Z`);
		for (const event of scoreboard.events) {
			if (!event.date || !event.competitions) continue;
			const eventDay = Date.parse(`${event.date.slice(0, 10)}T00:00:00Z`);
			if (!Number.isFinite(eventDay) || Math.abs(eventDay - scheduledDay) > 86_400_000) continue;
			for (const competition of event.competitions) {
				const competitors = competition.competitors ?? [];
				const home = competitors.find((competitor) => competitor.homeAway === 'home');
				const away = competitors.find((competitor) => competitor.homeAway === 'away');
				if (
					canonicalTeamAbbreviation(home?.team?.abbreviation) !== canonicalTeamAbbreviation(game.home_team) ||
					canonicalTeamAbbreviation(away?.team?.abbreviation) !== canonicalTeamAbbreviation(game.away_team)
				) {
					continue;
				}
				const kickoffAt = isAbsoluteDateTime(competition.date)
					? competition.date
					: isAbsoluteDateTime(event.date)
						? event.date
						: undefined;
				if (typeof game.home_score === 'number' || typeof game.away_score === 'number') {
					return kickoffAt ? { ...game, kickoff_at: kickoffAt } : game;
				}
				if (
					competition.status?.type?.completed !== true &&
					competition.status?.type?.name !== 'STATUS_FINAL'
				) {
					return kickoffAt ? { ...game, kickoff_at: kickoffAt } : game;
				}
				const homeScore = Number(home?.score);
				const awayScore = Number(away?.score);
				if (
					home?.score !== undefined &&
					away?.score !== undefined &&
					Number.isInteger(homeScore) &&
					Number.isInteger(awayScore) &&
					homeScore >= 0 &&
					awayScore >= 0
				) {
					return {
						...game,
						home_score: homeScore,
						away_score: awayScore,
						...(kickoffAt ? { kickoff_at: kickoffAt } : {}),
					};
				}
				return kickoffAt ? { ...game, kickoff_at: kickoffAt } : game;
			}
		}
		return game;
	});
}

async function getEspnScoreboard(gameday: string): Promise<ApiResult<EspnScoreboard>> {
	const date = gameday.replaceAll('-', '');
	const query = new URLSearchParams({ dates: date });
	return getCached(
		`espn-scoreboard-${date}`,
		`${ESPN_SCOREBOARD_URL}?${query}`,
		isEspnScoreboard,
		SCOREBOARD_TTL_MS,
	);
}

async function enrichGames(
	games: NflGame[],
	baseResult: ApiResult<unknown>,
	includeUpcomingGameDate = false,
): Promise<ApiResult<NflGame[]>> {
	const today = new Date().toISOString().slice(0, 10);
	const missingPastGames = games.filter(
		(game) =>
			typeof game.home_score !== 'number' &&
			typeof game.away_score !== 'number' &&
			Boolean(game.gameday && game.gameday < today),
	);
	const now = Date.now();
	const kickoffDays = games
		.filter((game) => game.game_type === 'REG' && game.gameday && game.gameday >= today)
		.filter((game) =>
			includeUpcomingGameDate || Date.parse(`${game.gameday}T00:00:00Z`) <= now + 8 * 86_400_000,
		)
		.flatMap((game) => (game.gameday ? [game.gameday] : []));
	const gamedays = [
		...new Set([
			...missingPastGames.flatMap((game) => (game.gameday ? [game.gameday] : [])),
			...kickoffDays,
		]),
	];
	if (gamedays.length === 0) return { ...baseResult, value: games };
	const scoreboards = await Promise.all(
		gamedays.map(async (gameday) => {
			try {
				return { gameday, ok: true as const, result: await getEspnScoreboard(gameday) };
			} catch (error) {
				console.warn(
					JSON.stringify({
						level: 'warn',
						event: 'espn_scoreboard_unavailable',
						gameday,
						error: error instanceof Error ? error.name : 'UnknownError',
					}),
				);
				return { gameday, ok: false as const };
			}
		}),
	);

	let enrichedGames = games;
	for (const scoreboard of scoreboards) {
		if (scoreboard.ok) {
			enrichedGames = mergeEspnFinalScores(enrichedGames, scoreboard.result.value);
		}
	}
	const failedLookup = scoreboards.some((scoreboard) => !scoreboard.ok);
	const fetchedAt = scoreboards
		.flatMap((scoreboard) => (scoreboard.ok ? [scoreboard.result.fetchedAt] : []))
		.sort()
		.at(-1);
	const wasStale = scoreboards.some((scoreboard) => scoreboard.ok && scoreboard.result.stale);

	return {
		...baseResult,
		value: enrichedGames,
		fetchedAt: [baseResult.fetchedAt, fetchedAt].sort().at(-1) ?? baseResult.fetchedAt,
		stale: baseResult.stale || wasStale || failedLookup,
	};
}

async function enrichGameResults(
	result: ApiResult<PaginatedResponse<NflGame>>,
): Promise<ApiResult<PaginatedResponse<NflGame>>> {
	const enriched = await enrichGames(result.value.data, result);
	return {
		...result,
		value: { ...result.value, data: enriched.value },
		fetchedAt: enriched.fetchedAt,
		stale: enriched.stale,
	};
}

async function enrichSingleGame(result: ApiResult<NflGame>): Promise<ApiResult<NflGame>> {
	const enriched = await enrichGames([result.value], result, true);
	return { ...result, value: enriched.value[0]!, fetchedAt: enriched.fetchedAt, stale: enriched.stale };
}

export async function searchPlayers(name: string, limit = 20): Promise<ApiResult<PaginatedResponse<NflPlayer>>> {
	const queryText = name.trim();
	if (queryText.length < 2 || queryText.length > 80) {
		throw new NflDataError('Enter a player name with at least two characters.');
	}
	const resultLimit = Math.min(Math.max(limit, 1), 1000);
	const query = new URLSearchParams({ name: queryText, limit: String(resultLimit) });
	const key = `players-${queryText.toLocaleLowerCase()}-${resultLimit}`;
	return getCached(key, urlFor(`/players?${query}`), (value): value is PaginatedResponse<NflPlayer> =>
		isPaginated(value, isPlayer),
	);
}

function normalizePlayerName(name: string): string[] {
	return name.toLocaleLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function damerauLevenshtein(left: string, right: string): number {
	const rows = left.length + 1;
	const columns = right.length + 1;
	const distance = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
	for (let row = 0; row < rows; row += 1) distance[row]![0] = row;
	for (let column = 0; column < columns; column += 1) distance[0]![column] = column;

	for (let row = 1; row < rows; row += 1) {
		for (let column = 1; column < columns; column += 1) {
			const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
			distance[row]![column] = Math.min(
				distance[row - 1]![column]! + 1,
				distance[row]![column - 1]! + 1,
				distance[row - 1]![column - 1]! + substitutionCost,
			);
			if (
				row > 1 &&
				column > 1 &&
				left[row - 1] === right[column - 2] &&
				left[row - 2] === right[column - 1]
			) {
				distance[row]![column] = Math.min(
					distance[row]![column]!,
					distance[row - 2]![column - 2]! + 1,
				);
			}
		}
	}
	return distance[left.length]![right.length]!;
}

export function nearestPlayerMatches(query: string, players: NflPlayer[], limit = 5): NflPlayer[] {
	const queryTokens = normalizePlayerName(query);
	if (queryTokens.length === 0) return [];

	return players
		.map((player) => {
			const playerTokens = normalizePlayerName(player.display_name);
			const distances = queryTokens.map((queryToken) =>
				Math.min(...playerTokens.map((playerToken) => damerauLevenshtein(queryToken, playerToken))),
			);
			const withinTolerance = queryTokens.every(
				(token, index) => distances[index]! <= Math.max(1, Math.floor(token.length * 0.25)),
			);
			return { player, withinTolerance, distance: distances.reduce((sum, value) => sum + value, 0) };
		})
		.filter((match) => match.withinTolerance)
		.sort(
			(left, right) =>
				left.distance - right.distance ||
				left.player.display_name.localeCompare(right.player.display_name),
		)
		.slice(0, Math.max(1, limit))
		.map(({ player }) => player);
}

const POSITION_PROMINENCE: Readonly<Record<string, number>> = {
	QB: 6,
	RB: 4,
	WR: 4,
	TE: 3,
	K: 1,
	DE: 2,
	LB: 2,
	CB: 2,
	S: 2,
	DT: 2,
};

function playerPopularity(player: NflPlayer): number {
	let score = POSITION_PROMINENCE[player.position ?? ''] ?? 1;
	if (player.status === 'ACT') score += 12;
	else if (player.status === 'RES' || player.status === 'INA') score += 3;
	if (player.draft_round === 1) score += 5;
	else if (player.draft_round === 2) score += 3;
	else if (player.draft_round === 3) score += 1;
	if (player.draft_pick && player.draft_round === 1) score += Math.max(0, (33 - player.draft_pick) / 8);
	score += Math.min(player.years_exp ?? 0, 12) / 3;
	return score;
}

function nameRelevance(query: string, player: NflPlayer): number {
	const queryTokens = normalizePlayerName(query);
	const nameTokens = normalizePlayerName(player.display_name);
	const full = nameTokens.join(' ');
	const joinedQuery = queryTokens.join(' ');
	if (full === joinedQuery) return 30;
	if (full.startsWith(joinedQuery)) return 18;
	const last = nameTokens.at(-1) ?? '';
	if (queryTokens.length === 1 && last === queryTokens[0]) return 14;
	if (queryTokens.every((token) => nameTokens.some((part) => part.startsWith(token)))) return 8;
	return 0;
}

export function rankPlayers(query: string, players: NflPlayer[]): NflPlayer[] {
	return players
		.map((player) => ({ player, score: nameRelevance(query, player) + playerPopularity(player) }))
		.sort(
			(left, right) =>
				right.score - left.score || left.player.display_name.localeCompare(right.player.display_name),
		)
		.map(({ player }) => player);
}

export interface PlayerSearchResult extends ApiResult<PaginatedResponse<NflPlayer>> {
	suggested: boolean;
}

export async function searchPlayersWithSuggestions(
	name: string,
	limit = 20,
): Promise<PlayerSearchResult> {
	const exact = await searchPlayers(name, Math.max(limit, 100));
	if (exact.value.data.length > 0) {
		const data = rankPlayers(name, exact.value.data).slice(0, limit);
		return { ...exact, value: { ...exact.value, data }, suggested: false };
	}

	const fallbackTokens = normalizePlayerName(name)
		.filter((token) => token.length >= 3)
		.reverse()
		.slice(0, 2);
	if (fallbackTokens.length === 0) return { ...exact, suggested: false };

	for (const token of fallbackTokens) {
		const candidates = await searchPlayers(token.slice(0, 3), 100);
		const nearest = rankPlayers(
			name,
			nearestPlayerMatches(name, candidates.value.data, candidates.value.data.length),
		).slice(0, limit);
		if (nearest.length === 0) continue;

		return {
			value: { ...candidates.value, data: nearest, total: nearest.length },
			fetchedAt: candidates.fetchedAt,
			stale: exact.stale || candidates.stale,
			suggested: true,
		};
	}
	return { ...exact, suggested: false };
}

export async function getPlayer(playerId: string): Promise<ApiResult<NflPlayer>> {
	if (!/^[A-Za-z0-9-]{1,40}$/.test(playerId)) {
		throw new NflDataError('Invalid player identifier.');
	}
	return getCached(
		`player-${playerId}`,
		urlFor(`/players/${encodeURIComponent(playerId)}`),
		isPlayer,
		METADATA_TTL_MS,
	);
}

export async function getPlayerSeasonStats(
	playerId: string,
): Promise<ApiResult<PaginatedResponse<NflPlayerSeasonStats>>> {
	if (!/^[A-Za-z0-9-]{1,40}$/.test(playerId)) {
		throw new NflDataError('Invalid player identifier.');
	}
	const query = new URLSearchParams({
		player_id: playerId,
		season_type: 'REG',
		limit: '1000',
	});
	const key = `player-stats-${playerId}-regular-seasons`;
	return getCached(
		key,
		urlFor(`/stats/season?${query}`),
		(value): value is PaginatedResponse<NflPlayerSeasonStats> =>
			isPaginated(value, isPlayerSeasonStats),
	);
}

export function selectPlayerSeasonStats(
	seasons: NflPlayerSeasonStats[],
	throughSeason = currentNflSeason(),
): NflPlayerSeasonStats | undefined {
	return seasons
		.filter((stats) => stats.season <= throughSeason && (!stats.season_type || stats.season_type === 'REG'))
		.sort((left, right) => right.season - left.season)[0];
}

export async function compareTeams(team1: string, team2: string): Promise<ApiResult<HeadToHead>> {
	if (!/^[A-Z]{2,4}$/.test(team1) || !/^[A-Z]{2,4}$/.test(team2) || team1 === team2) {
		throw new NflDataError('Choose two different NFL teams.');
	}
	const query = new URLSearchParams({ team1, team2, top_n: '5' });
	const key = `matchup-${[team1, team2].sort().join('-')}`;
	return getCached(key, urlFor(`/games/head-to-head?${query}`), isHeadToHead);
}

export function currentNflSeason(date = new Date()): number {
	const year = date.getUTCFullYear();
	return date.getUTCMonth() < 2 ? year - 1 : year;
}

export function getGameStatus(game: NflGame, date = new Date()): 'Final' | 'Score posted' | 'Result pending' | 'Scheduled' {
	const hasScore = typeof game.home_score === 'number' && typeof game.away_score === 'number';
	if (hasScore) {
		return game.gameday && game.gameday < date.toISOString().slice(0, 10) ? 'Final' : 'Score posted';
	}
	return game.gameday && game.gameday < date.toISOString().slice(0, 10) ? 'Result pending' : 'Scheduled';
}

export function getGameBroadcastLabel(game: NflGame): string | undefined {
	if (!game.gameday) return undefined;

	const weekday = new Date(`${game.gameday}T00:00:00Z`).getUTCDay();
	if (weekday === 4) return 'Thursday Night Football';
	if (weekday === 1) return 'Monday Night Football';
	if (weekday !== 0 || !game.gametime) return undefined;

	const time = game.gametime.match(/(\d{1,2})(?::\d{2})?\s*(AM|PM)?/i);
	if (!time) return undefined;
	const hour = Number(time[1]);
	const hour24 = time[2]?.toUpperCase() === 'PM' ? (hour % 12) + 12 : time[2]?.toUpperCase() === 'AM' ? hour % 12 : hour;
	return hour24 >= 20 ? 'Sunday Night Football' : undefined;
}

export function getUpcomingGames(games: NflGame[], date = new Date(), limit = 5): NflGame[] {
	const today = date.toISOString().slice(0, 10);
	return games
		.filter(
			(game) =>
				game.game_type === 'REG' &&
				Boolean(game.gameday && game.gameday >= today) &&
				typeof game.home_score !== 'number' &&
				typeof game.away_score !== 'number',
		)
		.sort(
			(left, right) =>
				(left.kickoff_at ?? left.gameday ?? '').localeCompare(right.kickoff_at ?? right.gameday ?? '') ||
				(left.gametime ?? '').localeCompare(right.gametime ?? ''),
		)
		.slice(0, Math.max(0, Math.floor(limit)));
}

export function getGameUpset(game: NflGame): { team: string; spread: number } | undefined {
	if (
		typeof game.home_score !== 'number' ||
		typeof game.away_score !== 'number' ||
		typeof game.spread_line !== 'number' ||
		game.spread_line === 0 ||
		game.home_score === game.away_score
	) {
		return undefined;
	}

	const homeFavorite = game.spread_line > 0;
	const underdogWon = homeFavorite ? game.away_score > game.home_score : game.home_score > game.away_score;
	if (!underdogWon) return undefined;
	return {
		team: homeFavorite ? (game.away_team ?? 'Away team') : (game.home_team ?? 'Home team'),
		spread: Math.abs(game.spread_line),
	};
}

export function sortGamesByKickoffAndShock(games: NflGame[]): NflGame[] {
	return games
		.map((game, index) => ({ game, index }))
		.sort((left, right) => {
			const leftKickoff = left.game.kickoff_at ? Date.parse(left.game.kickoff_at) : Number.NaN;
			const rightKickoff = right.game.kickoff_at ? Date.parse(right.game.kickoff_at) : Number.NaN;
			if (Number.isFinite(leftKickoff) && Number.isFinite(rightKickoff) && leftKickoff !== rightKickoff) {
				return leftKickoff - rightKickoff;
			}
			const dayOrder = (left.game.gameday ?? '').localeCompare(right.game.gameday ?? '');
			if (dayOrder !== 0) return dayOrder;
			if (Number.isFinite(leftKickoff) !== Number.isFinite(rightKickoff)) {
				return Number.isFinite(leftKickoff) ? -1 : 1;
			}
			const sameKickoff =
				Number.isFinite(leftKickoff) &&
				leftKickoff === rightKickoff &&
				left.game.kickoff_at === right.game.kickoff_at;
			if (sameKickoff) {
				const leftUpset = getGameUpset(left.game)?.spread ?? 0;
				const rightUpset = getGameUpset(right.game)?.spread ?? 0;
				if (leftUpset !== rightUpset) return rightUpset - leftUpset;
			}
			return left.index - right.index;
		})
		.map(({ game }) => game);
}

export function getCountdownGames(games: NflGame[], date = new Date(), days = 8): NflGame[] {
	const now = date.getTime();
	const end = now + Math.max(0, days) * 86_400_000;
	return games
		.filter((game) => {
			const kickoffAt = game.kickoff_at ?? undefined;
			const kickoff = isAbsoluteDateTime(kickoffAt)
				? Date.parse(kickoffAt)
				: Number.NaN;
			const hasFinalScore =
				typeof game.home_score === 'number' &&
				typeof game.away_score === 'number' &&
				(game.home_score !== 0 || game.away_score !== 0);
			return (
				game.game_type === 'REG' &&
				Number.isFinite(kickoff) &&
				kickoff > now &&
				kickoff <= end &&
				!hasFinalScore
			);
		})
		.sort(
			(left, right) => Date.parse(left.kickoff_at!) - Date.parse(right.kickoff_at!),
		);
}

export function buildTeamRecords(games: NflGame[], teams: NflTeam[], date = new Date()): TeamRecord[] {
	const teamMap = new Map(teams.map((team) => [team.abbr, team]));
	const records = new Map<string, { wins: number; losses: number; ties: number }>();
	const today = date.toISOString().slice(0, 10);

	for (const game of games) {
		if (
			game.game_type !== 'REG' ||
			!game.gameday ||
			game.gameday >= today ||
			!game.home_team ||
			!game.away_team ||
			game.home_score === null ||
			game.home_score === undefined ||
			game.away_score === null ||
			game.away_score === undefined
		) {
			continue;
		}
		const home = records.get(game.home_team) ?? { wins: 0, losses: 0, ties: 0 };
		const away = records.get(game.away_team) ?? { wins: 0, losses: 0, ties: 0 };
		if (game.home_score > game.away_score) {
			home.wins += 1;
			away.losses += 1;
		} else if (game.home_score < game.away_score) {
			home.losses += 1;
			away.wins += 1;
		} else {
			home.ties += 1;
			away.ties += 1;
		}
		records.set(game.home_team, home);
		records.set(game.away_team, away);
	}

	return [...records].flatMap(([abbr, record]) => {
		const team = teamMap.get(abbr);
		if (!team) {
			return [];
		}
		const gamesPlayed = record.wins + record.losses + record.ties;
		return [
			{
				...team,
				...record,
				gamesPlayed,
				winPercentage: gamesPlayed === 0 ? 0 : (record.wins + record.ties / 2) / gamesPlayed,
			},
		];
	});
}

export function getDefaultWeek(games: NflGame[], date = new Date()): number {
	const today = date.toISOString().slice(0, 10);
	const nextGame = games
		.filter((game) => game.game_type === 'REG' && game.week !== null && game.gameday && game.gameday >= today)
		.sort((left, right) => (left.gameday ?? '').localeCompare(right.gameday ?? ''))[0];
	if (nextGame?.week) {
		return nextGame.week;
	}
	return Math.max(1, ...games.filter((game) => game.game_type === 'REG').map((game) => game.week ?? 1));
}

export function makeDashboard(
	season: number,
	allGames: NflGame[],
	teams: NflTeam[],
	week?: number,
	date = new Date(),
): NflDashboardData {
	const regularSeasonGames = allGames.filter(
		(game) => game.game_type === 'REG' && typeof game.week === 'number',
	);
	const availableWeeks = [...new Set(regularSeasonGames.flatMap((game) => (game.week ? [game.week] : [])))].sort(
		(a, b) => a - b,
	);
	const teamsByAbbr = new Map(teams.map((team) => [team.abbr, team]));
	const scheduledTeamAbbrs = [
		...new Set(
			regularSeasonGames.flatMap((game) => [game.home_team, game.away_team].filter((team): team is string => Boolean(team))),
		),
	].sort();
	const selectedWeek = week && availableWeeks.includes(week) ? week : getDefaultWeek(regularSeasonGames, date);
	return {
		season,
		week: selectedWeek,
		availableWeeks,
		games: sortGamesByKickoffAndShock(regularSeasonGames.filter((game) => game.week === selectedWeek)),
		upcomingGames: getUpcomingGames(regularSeasonGames, date),
		countdownGames: getCountdownGames(regularSeasonGames, date),
		// A schedule remains filterable even when the metadata provider omits team details.
		teams: scheduledTeamAbbrs.map((abbr) => teamsByAbbr.get(abbr) ?? { abbr, name: abbr, conf: '', division: '' }),
		records: buildTeamRecords(regularSeasonGames, teams, date),
		fetchedAt: '',
		stale: false,
	};
}

export async function getDashboardData(week?: number): Promise<ApiResult<NflDashboardData>> {
	const season = currentNflSeason();
	const [games, metadata] = await Promise.all([getSeasonGames(season), getApiMetadata()]);
	let stale = games.stale || metadata.stale;
	let fetchedAt = [games.fetchedAt, metadata.fetchedAt].sort().at(-1) ?? games.fetchedAt;
	const initialDashboard = makeDashboard(season, games.value.data, metadata.value.teams, week);
	const missingKickoffDays = [
		...new Set(
			initialDashboard.games
				.filter((game) => game.gameday && game.gameday < new Date().toISOString().slice(0, 10))
				.filter((game) => !game.kickoff_at)
				.flatMap((game) => (game.gameday ? [game.gameday] : [])),
		),
	];
	if (missingKickoffDays.length > 0) {
		const scoreboards = await Promise.all(
			missingKickoffDays.map(async (gameday) => {
				try {
					return { ok: true as const, result: await getEspnScoreboard(gameday) };
				} catch (error) {
					console.warn(
						JSON.stringify({
							level: 'warn',
							event: 'espn_scoreboard_unavailable',
							gameday,
							error: error instanceof Error ? error.name : 'UnknownError',
						}),
					);
					return { ok: false as const };
				}
			}),
		);
		for (const scoreboard of scoreboards) {
			if (!scoreboard.ok) {
				stale = true;
				continue;
			}
			games.value.data = mergeEspnFinalScores(games.value.data, scoreboard.result.value);
			fetchedAt = [fetchedAt, scoreboard.result.fetchedAt].sort().at(-1) ?? fetchedAt;
			stale ||= scoreboard.result.stale;
		}
	}
	const dashboard = makeDashboard(season, games.value.data, metadata.value.teams, week);
	return {
		value: dashboard,
		fetchedAt,
		stale,
	};
}
