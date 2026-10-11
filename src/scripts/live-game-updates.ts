import { getLivePollInterval } from '../utils/live-update-policy';

interface LiveStatAthlete {
	name: string;
	jersey?: string;
	stats: string[];
}

interface LivePlayerCategory {
	name: string;
	labels: string[];
	athletes: LiveStatAthlete[];
}

interface LiveTeamBoxScore {
	team: string;
	categories: LivePlayerCategory[];
	stats: { label: string; value: string }[];
}

interface LiveGame {
	eventId: string;
	kickoffAt: string;
	homeTeam: string;
	awayTeam: string;
	homeScore: number;
	awayScore: number;
	state: 'scheduled' | 'in_progress' | 'halftime' | 'final' | 'delayed';
	status: string;
	period: number | null;
	clock: string | null;
	boxScoreUpdatedAt: string | null;
	lastPlay: { id: string; text: string; scoring: boolean; keyAction: boolean } | null;
	situation: { downDistance: string | null; possession: string | null; redZone: boolean } | null;
	boxScore: LiveTeamBoxScore[];
}

interface LiveGamesResponse {
	games: LiveGame[];
	fetchedAt: string;
	stale: boolean;
}

const liveCards = [...document.querySelectorAll<HTMLElement>('[data-live-center]')];
const previousStates = new Map<string, {
	homeScore: number;
	awayScore: number;
	lastPlayId: string | null;
}>();
const recentEvents = new Map<string, { title: string; score: string; detail: string; expiresAt: number }>();
let pollTimer: number | undefined;
let polling = false;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLiveGame(value: unknown): value is LiveGame {
	return (
		isRecord(value) &&
		typeof value.eventId === 'string' &&
		typeof value.homeTeam === 'string' &&
		typeof value.awayTeam === 'string' &&
		typeof value.homeScore === 'number' &&
		typeof value.awayScore === 'number' &&
		['scheduled', 'in_progress', 'halftime', 'final', 'delayed'].includes(String(value.state)) &&
		typeof value.status === 'string' &&
		Array.isArray(value.boxScore)
	);
}

function normalizedTeam(value: string | undefined): string {
	if (value === 'LAR') return 'LA';
	if (value === 'WAS') return 'WSH';
	return value ?? '';
}

function sameGameDate(left: string | undefined, right: string): boolean {
	if (!left) return true;
	return Math.abs(Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right.slice(0, 10)}T00:00:00Z`)) <= 86_400_000;
}

function appendText(parent: ParentNode, tag: string, text: string, className?: string): HTMLElement {
	const element = document.createElement(tag);
	element.textContent = text;
	if (className) element.className = className;
	parent.append(element);
	return element;
}

function isRelevantGameForCard(card: HTMLElement, game: LiveGame): boolean {
	const home = normalizedTeam(card.dataset.liveHome);
	const away = normalizedTeam(card.dataset.liveAway);
	if (!home || !away) return false;
	if (home !== normalizedTeam(game.homeTeam) || away !== normalizedTeam(game.awayTeam)) return false;
	return sameGameDate(card.dataset.liveDate, game.kickoffAt);
}

function updateScheduleCard(game: LiveGame, changed: boolean) {
	document.querySelectorAll<HTMLElement>('[data-live-home][data-live-away]').forEach((card) => {
		if (!isRelevantGameForCard(card, game)) return;
		const status = card.querySelector<HTMLElement>('.game-status');
		if (status) {
			status.classList.remove('game-status--final', 'game-status--score', 'game-status--pending', 'game-status--live');
			const label = game.state === 'in_progress'
				? `LIVE${game.period ? ` · Q${game.period}${game.clock ? ` ${game.clock}` : ''}` : ''}`
				: game.state === 'halftime'
					? 'HALFTIME'
					: game.state === 'final'
						? 'FINAL'
						: game.state === 'delayed'
							? 'DELAYED'
							: game.status.toUpperCase();
			status.textContent = '';
			if (game.state === 'in_progress' || game.state === 'halftime') {
				status.classList.add('game-status--live');
			} else if (game.state === 'final') {
				status.classList.add('game-status--final');
			}
			const dot = document.createElement('span');
			dot.className = 'game-status__dot';
			dot.setAttribute('aria-hidden', 'true');
			status.append(dot, document.createTextNode(label));
		}
		if (game.state === 'in_progress' || game.state === 'halftime' || game.state === 'final') {
			card.querySelectorAll<HTMLElement>('[data-score-team]').forEach((score) => {
				const team = normalizedTeam(score.dataset.scoreTeam);
				if (team === normalizedTeam(game.homeTeam)) score.textContent = String(game.homeScore);
				if (team === normalizedTeam(game.awayTeam)) score.textContent = String(game.awayScore);
			});
			card.setAttribute('aria-label', `${game.awayTeam} ${game.awayScore}, ${game.homeTeam} ${game.homeScore}, ${game.status}`);
		}
		if (changed) {
			card.classList.remove('game-card--live-change');
			void card.offsetWidth;
			card.classList.add('game-card--live-change');
			window.setTimeout(() => card.classList.remove('game-card--live-change'), 1300);
		}
	});
}

function updateGameDetail(game: LiveGame, changed: boolean) {
	const scoreboard = document.querySelector<HTMLElement>('[data-detail-home][data-detail-away]');
	if (
		!scoreboard ||
		normalizedTeam(scoreboard.dataset.detailHome) !== normalizedTeam(game.homeTeam) ||
		normalizedTeam(scoreboard.dataset.detailAway) !== normalizedTeam(game.awayTeam) ||
		!sameGameDate(scoreboard.dataset.detailDate, game.kickoffAt)
	) {
		return;
	}
	const score = scoreboard.querySelector<HTMLElement>('[data-live-game-score]');
	if (score && (game.state === 'in_progress' || game.state === 'halftime' || game.state === 'final')) {
		score.classList.remove('game-score__versus');
		score.replaceChildren();
		appendText(score, 'span', String(game.awayScore), 'live-score__value');
		appendText(score, 'i', '–');
		appendText(score, 'span', String(game.homeScore), 'live-score__value');
		if (changed) {
			score.classList.remove('live-score--changed');
			void score.offsetWidth;
			score.classList.add('live-score--changed');
		}
	}

	const status = document.querySelector<HTMLElement>('[data-game-live-status]');
	if (status) {
		status.classList.remove('game-status--final', 'game-status--score', 'game-status--pending', 'game-status--live');
		const label = game.state === 'in_progress'
			? `LIVE${game.period ? ` · Q${game.period}${game.clock ? ` ${game.clock}` : ''}` : ''}`
			: game.state === 'halftime'
				? 'HALFTIME'
				: game.state === 'final'
					? 'FINAL'
					: game.state === 'delayed'
						? 'DELAYED'
						: game.status.toUpperCase();
		status.replaceChildren();
		const dot = document.createElement('span');
		dot.setAttribute('aria-hidden', 'true');
		status.append(dot, document.createTextNode(label));
		if (game.state === 'in_progress' || game.state === 'halftime') status.classList.add('game-status--live');
		if (game.state === 'final') status.classList.add('game-status--final');
	}
}

function possessionMatchesTeam(possession: string | null | undefined, team: string): boolean {
	if (!possession) return false;
	const normalizedPossession = normalizedTeam(possession.trim().toUpperCase());
	const normalizedAbbr = normalizedTeam(team);
	return normalizedPossession === normalizedAbbr ||
		new RegExp(`(?:^|\\W)${normalizedAbbr}(?:$|\\W)`).test(possession.toUpperCase());
}

function renderLiveRow(
	game: LiveGame,
	event: { title: string; score: string; detail: string } | undefined,
	scoreChanged: boolean,
): HTMLElement {
	const row = document.createElement('article');
	row.className = 'live-game-row';
	const possession = game.situation?.possession;
	const possessionTeam = possessionMatchesTeam(possession, game.awayTeam)
		? game.awayTeam
		: possessionMatchesTeam(possession, game.homeTeam)
			? game.homeTeam
			: undefined;
	row.setAttribute(
		'aria-label',
		`${game.awayTeam} ${game.awayScore}, ${game.homeTeam} ${game.homeScore}, ${game.status}${possessionTeam ? `, ${possessionTeam} has possession` : ''}`,
	);
	const teams = appendText(row, 'div', '', 'live-game-row__teams');
	const away = appendText(teams, 'strong', game.awayTeam, 'live-game-row__team');
	if (possessionTeam === game.awayTeam) {
		away.classList.add('live-game-row__team--possession');
		away.setAttribute('aria-label', `${game.awayTeam}, has possession`);
	}
	appendText(teams, 'span', '@');
	const home = appendText(teams, 'strong', game.homeTeam, 'live-game-row__team');
	if (possessionTeam === game.homeTeam) {
		home.classList.add('live-game-row__team--possession');
		home.setAttribute('aria-label', `${game.homeTeam}, has possession`);
	}
	const score = appendText(
		row,
		'div',
		'',
		`live-game-row__score${scoreChanged ? ' live-game-row__score--changed' : ''}`,
	);
	appendText(score, 'strong', String(game.awayScore));
	appendText(score, 'span', '–');
	appendText(score, 'strong', String(game.homeScore));
	const clock = game.state === 'in_progress' || game.state === 'halftime'
		? `${game.state === 'halftime' ? 'HALFTIME' : game.period ? `Q${game.period}` : 'LIVE'}${game.clock && game.state === 'in_progress' ? ` · ${game.clock}` : ''}`
		: game.state === 'final'
			? 'FINAL'
			: game.status;
	appendText(row, 'div', clock, 'live-game-row__clock');
	if (game.situation?.downDistance) {
		appendText(
			row,
			'p',
			`${game.situation.downDistance}${game.situation.redZone ? ' · RED ZONE' : ''}`,
			'live-game-row__situation',
		);
	}
	if (event) {
		const alert = appendText(row, 'div', '', 'live-event-alert');
		alert.setAttribute('role', 'status');
		alert.setAttribute('aria-live', 'assertive');
		appendText(alert, 'strong', event.title, 'live-event-alert__title');
		appendText(alert, 'span', event.score, 'live-event-alert__score');
		if (event.detail) appendText(alert, 'span', event.detail, 'live-event-alert__detail');
	}
	return row;
}

function renderLiveCenters(games: LiveGame[], eventIds: Set<string>, scoreChangedIds: Set<string>) {
	for (const center of liveCards) {
		const home = normalizedTeam(center.dataset.gameHome);
		const away = normalizedTeam(center.dataset.gameAway);
		const relevant = games.filter((game) => {
			if (game.state !== 'in_progress' && game.state !== 'halftime') return false;
			return (!home || home === normalizedTeam(game.homeTeam)) && (!away || away === normalizedTeam(game.awayTeam));
		});
		const list = center.querySelector<HTMLElement>('[data-live-games-list]');
		if (!list) continue;
		center.hidden = relevant.length === 0;
		if (center.hidden) {
			list.replaceChildren();
			continue;
		}
		const fragment = document.createDocumentFragment();
		for (const game of relevant) {
			const recentEvent = recentEvents.get(game.eventId);
			const event = recentEvent && recentEvent.expiresAt > Date.now()
				? recentEvent
				: undefined;
			fragment.append(renderLiveRow(game, event, scoreChangedIds.has(game.eventId)));
		}
		list.replaceChildren(fragment);
		center.setAttribute('aria-live', eventIds.size > 0 ? 'polite' : 'off');
	}
}

function renderBoxScore(game: LiveGame) {
	const container = document.querySelector<HTMLElement>('[data-live-boxscore]');
	const targetHome = normalizedTeam(container?.dataset.gameHome);
	const targetAway = normalizedTeam(container?.dataset.gameAway);
	if (!container || targetHome !== normalizedTeam(game.homeTeam) || targetAway !== normalizedTeam(game.awayTeam)) return;
	const statsContainer = container.querySelector<HTMLElement>('[data-live-stats]');
	if (!statsContainer) return;
	container.hidden = game.state !== 'in_progress' && game.state !== 'halftime';
	if (container.hidden) return;

	const fragment = document.createDocumentFragment();
	const teams = appendText(fragment, 'div', '', 'live-boxscore__teams');
	for (const team of game.boxScore) {
		const panel = appendText(teams, 'section', '', 'live-boxscore__team');
		appendText(panel, 'h3', `${team.team} TEAM TOTALS`);
		const totals = appendText(panel, 'div', '', 'live-boxscore__totals');
		for (const stat of team.stats) appendText(totals, 'span', `${stat.label} ${stat.value}`, 'live-boxscore__total');
		for (const category of team.categories) {
			if (category.athletes.length === 0) continue;
			const disclosure = document.createElement('details');
			const summary = document.createElement('summary');
			summary.textContent = category.name;
			disclosure.append(summary);
			const table = document.createElement('table');
			const head = document.createElement('thead');
			const headerRow = document.createElement('tr');
			appendText(headerRow, 'th', 'Player');
			for (const label of category.labels) appendText(headerRow, 'th', label);
			head.append(headerRow);
			table.append(head);
			const body = document.createElement('tbody');
			for (const athlete of category.athletes) {
				const row = document.createElement('tr');
				appendText(row, 'th', athlete.name);
				for (const stat of athlete.stats) appendText(row, 'td', stat);
				body.append(row);
			}
			table.append(body);
			disclosure.append(table);
			panel.append(disclosure);
		}
	}
	if (game.boxScore.length === 0) {
		appendText(fragment, 'p', 'Live box-score stats are not available from the provider yet.', 'live-boxscore__empty');
	}
	statsContainer.replaceChildren(fragment);
	const updated = container.querySelector<HTMLElement>('[data-live-updated]');
	if (updated && game.boxScoreUpdatedAt) {
		updated.textContent = `Stats updated ${new Date(game.boxScoreUpdatedAt).toLocaleTimeString(undefined, {
			hour: 'numeric',
			minute: '2-digit',
			second: '2-digit',
		})}`;
	}
}

async function pollLiveGames() {
	if (polling || document.visibilityState === 'hidden') return;
	polling = true;
	try {
		const response = await fetch('/api/live/games', {
			headers: { Accept: 'application/json' },
			cache: 'no-store',
		});
		if (!response.ok) throw new Error(`Live game request returned HTTP ${response.status}.`);
		const payload: unknown = await response.json();
		if (!isRecord(payload) || !Array.isArray(payload.games) || !payload.games.every(isLiveGame)) {
			throw new Error('Live game response had an unexpected format.');
		}
		const result = payload as unknown as LiveGamesResponse;
		const eventIds = new Set<string>();
		const scoreChangedIds = new Set<string>();
		for (const game of result.games) {
			const previous = previousStates.get(game.eventId);
			const scoreChanged = previous !== undefined &&
				(previous.homeScore !== game.homeScore || previous.awayScore !== game.awayScore);
			const newKeyPlay = previous !== undefined &&
				game.lastPlay?.keyAction === true &&
				game.lastPlay.id !== previous.lastPlayId;
			if (scoreChanged) scoreChangedIds.add(game.eventId);
			if (scoreChanged || newKeyPlay) {
				const title = scoreChanged
					? game.lastPlay?.scoring
						? /touchdown/i.test(game.lastPlay.text)
							? 'TOUCHDOWN'
							: /field goal/i.test(game.lastPlay.text)
								? 'FIELD GOAL'
								: /safety/i.test(game.lastPlay.text)
									? 'SAFETY'
									: 'SCORE UPDATE'
						: 'SCORE UPDATE'
					: 'KEY PLAY';
				recentEvents.set(game.eventId, {
					title,
					score: `${game.awayTeam} ${game.awayScore} – ${game.homeTeam} ${game.homeScore}`,
					detail: game.lastPlay?.keyAction ? game.lastPlay.text : '',
					expiresAt: Date.now() + 12_000,
				});
				eventIds.add(game.eventId);
			}
			previousStates.set(game.eventId, {
				homeScore: game.homeScore,
				awayScore: game.awayScore,
				lastPlayId: game.lastPlay?.id ?? null,
			});
			updateScheduleCard(game, scoreChanged || newKeyPlay);
			updateGameDetail(game, scoreChanged);
			renderBoxScore(game);
		}
		for (const [eventId, event] of recentEvents) {
			if (event.expiresAt <= Date.now()) recentEvents.delete(eventId);
		}
		renderLiveCenters(result.games, eventIds, scoreChangedIds);
		if (result.stale) {
			liveCards.forEach((center) => {
				center.classList.add('live-center--stale');
				const freshness = center.querySelector<HTMLElement>('[data-live-freshness]');
				if (freshness) freshness.textContent = 'Feed may be delayed';
			});
		} else {
			liveCards.forEach((center) => {
				center.classList.remove('live-center--stale');
				const freshness = center.querySelector<HTMLElement>('[data-live-freshness]');
				if (freshness) freshness.textContent = `Updated ${new Date(result.fetchedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
			});
		}
		pollTimer = window.setTimeout(() => void pollLiveGames(), getLivePollInterval(result.games));
	} catch (error) {
		console.error('Live NFL updates could not be refreshed.', error);
		liveCards.forEach((center) => {
			center.classList.add('live-center--stale');
			const freshness = center.querySelector<HTMLElement>('[data-live-freshness]');
			if (freshness) freshness.textContent = 'Feed unavailable — retrying';
		});
		pollTimer = window.setTimeout(() => void pollLiveGames(), 30_000);
	} finally {
		polling = false;
	}
}

if (liveCards.length > 0) {
	void pollLiveGames();
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			if (pollTimer !== undefined) window.clearTimeout(pollTimer);
			void pollLiveGames();
		} else if (pollTimer !== undefined) {
			window.clearTimeout(pollTimer);
		}
	});
}
