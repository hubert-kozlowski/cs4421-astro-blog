import { animate } from 'motion';
import { getLivePollInterval, getLiveRetryInterval } from '../utils/live-update-policy';
import { teamPalette } from '../utils/team-colors';

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

import { getTeamDisplayName } from '../utils/team-names';

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
	moment?: 'two_minute_warning' | null;
	status: string;
	period: number | null;
	clock: string | null;
	boxScoreUpdatedAt: string | null;
	lastPlay: { id: string; text: string; scoring: boolean; keyAction: boolean } | null;
	notice: 'flag' | 'under_review' | null;
	situation: {
		downDistance: string | null;
		possession: string | null;
		redZone: boolean;
		yardLine: number | null;
		direction: 'left' | 'right' | null;
	} | null;
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
const teamScoringDirections = new Map<string, Map<string, 'left' | 'right'>>();
const recentEvents = new Map<string, {
	title: string;
	score: string;
	detail: string;
	scoringTeam?: string;
	touchdown: boolean;
	expiresAt: number;
}>();
const gameOrderByCenter = new WeakMap<HTMLElement, string[]>();
const compactGamesByCenter = new WeakMap<HTMLElement, Set<string>>();
const liveCenterInteractions = new WeakSet<HTMLElement>();
let suppressedClickRow: HTMLElement | null = null;
let suppressedClickUntil = 0;
let pollTimer: number | undefined;
let polling = false;
let pollFailures = 0;

function schedulePoll(delay: number) {
	if (pollTimer !== undefined) window.clearTimeout(pollTimer);
	pollTimer = undefined;
	if (document.visibilityState === 'hidden' || !navigator.onLine) return;
	pollTimer = window.setTimeout(() => void pollLiveGames(), delay);
}

function animateTouchdown(row: HTMLElement) {
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		delete row.dataset.touchdownMotion;
		return;
	}

	const alert = row.querySelector<HTMLElement>('.live-event-alert--touchdown');
	if (!alert) return;

	row.dataset.touchdownMotion = 'impact';
	const impact = animate(
		alert,
		{ opacity: [0, 1], y: [10, 0], scale: [0.93, 1] },
		{ type: 'spring', stiffness: 390, damping: 24 },
	);

	void impact.finished.then(() => {
		if (!row.isConnected || row.dataset.touchdownMotion !== 'impact') return;
		row.dataset.touchdownMotion = 'score-reveal';

		const scoringTeam = row.dataset.scoringTeam;
		const scoringValue = scoringTeam
			? [...row.querySelectorAll<HTMLElement>('[data-score-team]')]
				.find((score) => score.dataset.scoreTeam === scoringTeam)
			: undefined;
		const accent = scoringTeam ? teamPalette(scoringTeam)?.primary : undefined;
		if (scoringValue) {
			const originalColor = getComputedStyle(scoringValue).color;
			animate(
				scoringValue,
				{ scale: [1, 1.38, 1], color: accent ? [accent, originalColor] : ['#b52f3b', originalColor] },
				{ type: 'spring', stiffness: 420, damping: 19 },
			);
		}

		const detailScore = [...document.querySelectorAll<HTMLElement>('[data-live-game-score][data-touchdown-event-id]')]
			.find((score) => score.dataset.touchdownEventId === row.dataset.eventId);
		if (detailScore) {
			const detailValue = [...detailScore.querySelectorAll<HTMLElement>('[data-score-team]')]
				.find((score) => score.dataset.scoreTeam === scoringTeam);
			if (detailValue) {
				const originalColor = getComputedStyle(detailValue).color;
				animate(
					detailValue,
					{ scale: [1, 1.32, 1], color: accent ? [accent, originalColor] : ['#b52f3b', originalColor] },
					{ type: 'spring', stiffness: 390, damping: 20 },
				);
			}
		}
	});
}

interface LiveRowDrag {
	row: HTMLElement;
	pointerId: number;
	startY: number;
	startX: number;
	timer: number;
	dragging: boolean;
}

function oppositeDirection(direction: 'left' | 'right'): 'left' | 'right' {
	return direction === 'left' ? 'right' : 'left';
}

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

function liveStatusLabel(game: LiveGame): string {
	if (game.state === 'halftime') return 'HALFTIME';
	if (game.moment === 'two_minute_warning') {
		return `TWO-MINUTE WARNING${game.period ? ` · Q${game.period}` : ''}${game.clock ? ` ${game.clock}` : ''}`;
	}
	if (game.state === 'in_progress') {
		return `LIVE${game.period ? ` · Q${game.period}${game.clock ? ` ${game.clock}` : ''}` : ''}`;
	}
	if (game.state === 'final') return 'FINAL';
	if (game.state === 'delayed') return 'DELAYED';
	return game.status.toUpperCase();
}

function isRelevantGameForCard(card: HTMLElement, game: LiveGame): boolean {
	const home = normalizedTeam(card.dataset.liveHome);
	const away = normalizedTeam(card.dataset.liveAway);
	if (!home || !away) return false;
	if (home !== normalizedTeam(game.homeTeam) || away !== normalizedTeam(game.awayTeam)) return false;
	return sameGameDate(card.dataset.liveDate, game.kickoffAt);
}

function gameDetailHref(game: LiveGame): string | undefined {
	const scheduleCard = [...document.querySelectorAll<HTMLAnchorElement>('a.game-card[data-live-home][data-live-away]')]
		.find((card) =>
			normalizedTeam(card.dataset.liveHome) === normalizedTeam(game.homeTeam) &&
			normalizedTeam(card.dataset.liveAway) === normalizedTeam(game.awayTeam) &&
			sameGameDate(card.dataset.liveDate, game.kickoffAt),
		);
	return scheduleCard?.href;
}

function directLiveRows(list: HTMLElement): HTMLElement[] {
	return [...list.children].filter((child): child is HTMLElement =>
		child instanceof HTMLElement && child.classList.contains('live-game-row'),
	);
}

function moveLiveRow(center: HTMLElement, row: HTMLElement, destination: number): boolean {
	const list = center.querySelector<HTMLElement>('[data-live-games-list]');
	if (!list) return false;
	const rows = directLiveRows(list);
	const current = rows.indexOf(row);
	if (current < 0 || destination < 0 || destination >= rows.length || destination === current) return false;
	const previousPositions = new Map(rows.map((item) => [item, item.getBoundingClientRect().top]));
	const remaining = rows.filter((item) => item !== row);
	const reference = remaining[destination];
	if (reference) list.insertBefore(row, reference);
	else list.append(row);
	for (const item of directLiveRows(list)) {
		const shift = previousPositions.get(item);
		if (shift === undefined) continue;
		const offset = shift - item.getBoundingClientRect().top;
		if (offset === 0) continue;
		item.classList.remove('live-game-row--move-animated');
		item.style.transform = `translateY(${offset}px)`;
		void item.offsetHeight;
		requestAnimationFrame(() => {
			item.classList.add('live-game-row--move-animated');
			item.style.transform = '';
			window.setTimeout(() => item.classList.remove('live-game-row--move-animated'), 220);
		});
	}
	gameOrderByCenter.set(center, directLiveRows(list).map((item) => item.dataset.eventId ?? ''));
	return true;
}

function announceLiveRowPosition(center: HTMLElement, row: HTMLElement) {
	const list = center.querySelector<HTMLElement>('[data-live-games-list]');
	const status = center.querySelector<HTMLElement>('[data-live-reorder-status]');
	if (!list || !status) return;
	const position = directLiveRows(list).indexOf(row) + 1;
	const teams = row.dataset.gameTeams ?? 'Live game';
	status.textContent = `${teams} moved to position ${position} of ${directLiveRows(list).length}.`;
}

function startLiveRowDrag(center: HTMLElement, list: HTMLElement) {
	let drag: LiveRowDrag | undefined;
	const reorderAt = (clientY: number) => {
		if (!drag?.dragging) return;
		const rows = directLiveRows(list).filter((row) => row !== drag?.row);
		const destination = rows.findIndex((row) =>
			clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2,
		);
		const targetIndex = destination < 0 ? rows.length : destination;
		const currentIndex = directLiveRows(list).indexOf(drag.row);
		if (targetIndex !== currentIndex) moveLiveRow(center, drag.row, targetIndex);
	};
	const cancelDrag = () => {
		if (!drag) return;
		window.clearTimeout(drag.timer);
		drag.row.classList.remove('live-game-row--dragging');
		drag = undefined;
	};
	const finishDrag = (event?: PointerEvent) => {
		if (!drag) return;
		window.clearTimeout(drag.timer);
		if (drag.dragging) {
			if (event?.type === 'pointerup' && event.pointerId === drag.pointerId) reorderAt(event.clientY);
			drag.row.classList.remove('live-game-row--dragging');
			suppressedClickRow = drag.row;
			suppressedClickUntil = Date.now() + 500;
			announceLiveRowPosition(center, drag.row);
			window.setTimeout(() => {
				if (Date.now() >= suppressedClickUntil) suppressedClickRow = null;
			}, 510);
		}
		drag = undefined;
	};

	list.addEventListener('pointerdown', (event) => {
		if (event.button !== 0 || !(event.target instanceof Element)) return;
		if (event.target.closest('.live-game-row__collapse-toggle')) return;
		const row = event.target.closest<HTMLElement>('.live-game-row');
		if (!row || !list.contains(row) || !row.classList.contains('live-game-row--draggable')) return;
		cancelDrag();
		const pointerId = event.pointerId;
		drag = {
			row,
			pointerId,
			startY: event.clientY,
			startX: event.clientX,
			timer: window.setTimeout(() => {
				if (!drag || drag.pointerId !== pointerId) return;
				drag.dragging = true;
				row.classList.add('live-game-row--dragging');
			}, 220),
			dragging: false,
		};
	});

	document.addEventListener('pointermove', (event) => {
		if (!drag || event.pointerId !== drag.pointerId) return;
		if (!drag.dragging) {
			if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 8) cancelDrag();
			return;
		}
		event.preventDefault();
		reorderAt(event.clientY);
	}, { passive: false });

	document.addEventListener('pointerup', (event) => finishDrag(event));
	document.addEventListener('pointercancel', finishDrag);
	list.addEventListener('click', (event) => {
		if (!(event.target instanceof Element) || Date.now() > suppressedClickUntil) return;
		if (event.target.closest('.live-game-row') !== suppressedClickRow) return;
		event.preventDefault();
		event.stopPropagation();
		suppressedClickRow = null;
	}, true);
	list.addEventListener('keydown', (event) => {
		if (!event.altKey || !['ArrowUp', 'ArrowDown'].includes(event.key) || !(event.target instanceof Element)) return;
		if (event.target.closest('button')) return;
		const row = event.target.closest<HTMLElement>('.live-game-row--draggable');
		if (!row) return;
		const rows = directLiveRows(list);
		const current = rows.indexOf(row);
		const destination = current + (event.key === 'ArrowUp' ? -1 : 1);
		if (moveLiveRow(center, row, destination)) {
			event.preventDefault();
			announceLiveRowPosition(center, row);
		}
	});
}

function orderLiveGames(center: HTMLElement, games: LiveGame[]): LiveGame[] {
	const storedOrder = gameOrderByCenter.get(center) ?? [];
	const rank = new Map(storedOrder.map((eventId, index) => [eventId, index]));
	return [...games].sort((left, right) =>
		(rank.get(left.eventId) ?? Number.MAX_SAFE_INTEGER) - (rank.get(right.eventId) ?? Number.MAX_SAFE_INTEGER),
	);
}

function initializeLiveCenter(center: HTMLElement) {
	if (liveCenterInteractions.has(center)) return;
	liveCenterInteractions.add(center);
	compactGamesByCenter.set(center, new Set());
	const list = center.querySelector<HTMLElement>('[data-live-games-list]');
	if (center.dataset.liveLayout === 'ticker' && list) startLiveRowDrag(center, list);
}

function updateScheduleCard(game: LiveGame, changed: boolean) {
	document.querySelectorAll<HTMLElement>('[data-live-home][data-live-away]').forEach((card) => {
		if (!isRelevantGameForCard(card, game)) return;
		const status = card.querySelector<HTMLElement>('.game-status');
		if (status && game.state !== 'scheduled') {
			status.classList.remove('game-status--final', 'game-status--score', 'game-status--pending', 'game-status--live');
			const label = liveStatusLabel(game);
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
			card.setAttribute('aria-label', `${game.awayTeam} ${game.awayScore}, ${game.homeTeam} ${game.homeScore}, ${liveStatusLabel(game)}`);
		}
		if (changed) {
			card.classList.remove('game-card--live-change');
			void card.offsetWidth;
			card.classList.add('game-card--live-change');
			window.setTimeout(() => card.classList.remove('game-card--live-change'), 1300);
		}
	});
}

function updateGameDetail(game: LiveGame, changed: boolean, touchdown: boolean, scoringTeam?: string) {
	const scoreboard = document.querySelector<HTMLElement>('[data-detail-home][data-detail-away]');
	if (
		!scoreboard ||
		normalizedTeam(scoreboard.dataset.detailHome) !== normalizedTeam(game.homeTeam) ||
		normalizedTeam(scoreboard.dataset.detailAway) !== normalizedTeam(game.awayTeam) ||
		!sameGameDate(scoreboard.dataset.detailDate, game.kickoffAt)
	) {
		return;
	}
	const stadiumBall = document.querySelector<SVGGElement>('[data-stadium-live-ball]');
	if (stadiumBall) {
		const reportedYardLine = game.situation?.yardLine;
		const yardLine = typeof reportedYardLine === 'number' &&
			Number.isInteger(reportedYardLine) &&
			reportedYardLine >= 0 &&
			reportedYardLine <= 100
			? reportedYardLine
			: null;
		const isLive = game.state === 'in_progress' || game.state === 'halftime';
		stadiumBall.style.display = isLive && yardLine !== null ? 'block' : 'none';
		if (yardLine !== null) {
			const x = 114 + yardLine * 1.32;
			stadiumBall.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
		}
		const tip = stadiumBall.querySelector<SVGPathElement>('[data-stadium-live-ball-tip]');
		if (tip) {
			tip.style.display = game.situation?.direction ? 'block' : 'none';
			tip.setAttribute(
				'd',
				game.situation?.direction === 'left' ? 'M-2 90 -9 95 -2 100Z' : 'M2 90 9 95 2 100Z',
			);
		}
		if (yardLine !== null) {
			const direction = game.situation?.direction;
			stadiumBall.setAttribute(
				'aria-label',
				`Live ball position, provider coordinate ${yardLine} from left goal line${direction ? `, offense moving ${direction}` : ', direction unavailable'}`,
			);
		}
	}
	const score = scoreboard.querySelector<HTMLElement>('[data-live-game-score]');
	if (score && (game.state === 'in_progress' || game.state === 'halftime' || game.state === 'final')) {
		score.classList.remove('game-score__versus');
		score.classList.toggle('live-score--touchdown', touchdown);
		delete score.dataset.touchdownEventId;
		score.replaceChildren();
		const awayScore = appendText(score, 'span', String(game.awayScore), 'live-score__value');
		awayScore.dataset.scoreTeam = game.awayTeam;
		appendText(score, 'i', '–');
		const homeScore = appendText(score, 'span', String(game.homeScore), 'live-score__value');
		homeScore.dataset.scoreTeam = game.homeTeam;
		if (touchdown && scoringTeam) {
			score.dataset.touchdownEventId = game.eventId;
			score.dataset.touchdownScoringTeam = scoringTeam;
		}
		if (changed) {
			score.classList.remove('live-score--changed');
			void score.offsetWidth;
			score.classList.add('live-score--changed');
		}
	}

	const status = document.querySelector<HTMLElement>('[data-game-live-status]');
	if (status) {
		status.classList.remove('game-status--final', 'game-status--score', 'game-status--pending', 'game-status--live');
		const label = liveStatusLabel(game);
		status.replaceChildren();
		const dot = document.createElement('span');
		dot.setAttribute('aria-hidden', 'true');
		status.append(dot, document.createTextNode(label));
		if (game.state === 'in_progress' || game.state === 'halftime') status.classList.add('game-status--live');
		if (game.state === 'final') status.classList.add('game-status--final');
	}

	const snapshot = document.querySelector<HTMLElement>('[data-game-snapshot]');
	if (snapshot) {
		const eyebrow = snapshot.querySelector<HTMLElement>('[data-snapshot-eyebrow]');
		const title = snapshot.querySelector<HTMLElement>('[data-snapshot-title]');
		const summary = snapshot.querySelector<HTMLElement>('[data-snapshot-summary]');
		if (eyebrow && title && summary) {
			const homeName = snapshot.dataset.homeName ?? game.homeTeam;
			const awayName = snapshot.dataset.awayName ?? game.awayTeam;
			if (game.state === 'final') {
				eyebrow.textContent = 'THE RESULT';
				title.textContent = 'Final result';
				summary.textContent = game.homeScore === game.awayScore
					? 'The game ended in a tie.'
					: game.homeScore > game.awayScore
						? `${homeName} won by ${game.homeScore - game.awayScore}.`
						: `${awayName} won by ${game.awayScore - game.homeScore}.`;
			} else if (game.state === 'in_progress' || game.state === 'halftime') {
				eyebrow.textContent = 'LIVE UPDATE';
				title.textContent = game.state === 'halftime' ? 'Halftime' : 'Game in progress';
				summary.textContent = `${awayName} ${game.awayScore} · ${homeName} ${game.homeScore}.`;
			}
		}
	}
}

function possessionMatchesTeam(possession: string | null | undefined, team: string): boolean {
	if (!possession) return false;
	const normalizedPossession = normalizedTeam(possession.trim().toUpperCase());
	const normalizedAbbr = normalizedTeam(team);
	return normalizedPossession === normalizedAbbr;
}

function appendFieldGraphic(parent: HTMLElement, game: LiveGame, possessionTeam: string | undefined) {
	const reportedYardLine = game.situation?.yardLine;
	const yardLine = typeof reportedYardLine === 'number' &&
		Number.isInteger(reportedYardLine) &&
		reportedYardLine >= 0 &&
		reportedYardLine <= 100
		? reportedYardLine
		: null;
	const direction = game.situation?.direction;
	const offenseMovesRight = direction === 'right';
	const ownEndzoneOnLeft = direction === 'right';

	const svgNamespace = 'http://www.w3.org/2000/svg';
	const svg = document.createElementNS(svgNamespace, 'svg');
	svg.setAttribute('class', 'live-game-row__field');
	svg.id = `live-field-${game.eventId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
	svg.setAttribute('viewBox', '0 0 280 40');
	svg.setAttribute('role', 'img');
	const offenseYardLine = yardLine === null || direction === null || direction === undefined
		? null
		: direction === 'right'
			? yardLine
			: 100 - yardLine;
	const spot = yardLine === null
		? 'provider field position unavailable'
		: offenseYardLine === null
			? `provider coordinate ${yardLine} from left goal line`
		: offenseYardLine === 50
			? 'midfield'
			: offenseYardLine === 0
				? 'own goal line'
				: offenseYardLine === 100
					? 'opponent goal line'
					: offenseYardLine < 50
						? `own ${offenseYardLine}-yard line`
						: `opponent ${100 - offenseYardLine}-yard line`;
	svg.setAttribute(
		'aria-label',
		`${direction === null || direction === undefined
			? 'Play-derived field view; direction unavailable'
			: `Play-derived field view; offense moving ${offenseMovesRight ? 'left to right' : 'right to left'}`}; ${possessionTeam ? `${possessionTeam} possession, ` : ''}${spot}`,
	);

	const appendSvg = (tag: string, attributes: Record<string, string>) => {
		const element = document.createElementNS(svgNamespace, tag);
		for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
		svg.append(element);
		return element;
	};
	appendSvg('rect', { x: '0', y: '2', width: '280', height: '36', rx: '5', class: 'live-game-row__field-surface' });
	appendSvg('rect', { x: '0', y: '2', width: '20', height: '36', class: 'live-game-row__field-endzone' });
	appendSvg('rect', { x: '260', y: '2', width: '20', height: '36', class: 'live-game-row__field-endzone' });
	const leftEndzone = appendSvg('text', { x: '10', y: '23', class: 'live-game-row__field-endzone-label' });
	leftEndzone.textContent = direction === null || direction === undefined ? 'END' : ownEndzoneOnLeft ? 'OWN' : 'OPP';
	const rightEndzone = appendSvg('text', { x: '270', y: '23', class: 'live-game-row__field-endzone-label' });
	rightEndzone.textContent = direction === null || direction === undefined ? 'END' : ownEndzoneOnLeft ? 'OPP' : 'OWN';

	for (let yard = 0; yard <= 100; yard += 10) {
		const x = 20 + yard * 2.4;
		appendSvg('line', { x1: String(x), y1: '3', x2: String(x), y2: '37', class: 'live-game-row__field-mark' });
		if (yard > 0 && yard < 100) {
			const displayedYard = yard <= 50 ? yard : 100 - yard;
			const topLabel = appendSvg('text', { x: String(x), y: '9', class: 'live-game-row__field-yard' });
			topLabel.textContent = String(displayedYard);
			const bottomLabel = appendSvg('text', { x: String(x), y: '35', class: 'live-game-row__field-yard' });
			bottomLabel.textContent = String(displayedYard);
			const hash = appendSvg('line', {
				x1: String(x),
				y1: '18',
				x2: String(x),
				y2: '22',
				class: 'live-game-row__field-hash',
			});
			hash.setAttribute('aria-hidden', 'true');
			continue;
		}
	}

	if (yardLine !== null) {
		const ballPosition = 20 + yardLine * 2.4;
		const x = ballPosition.toFixed(1);
		const ball = appendSvg('circle', {
			cx: x,
			cy: '20',
			r: '2.5',
			class: 'live-game-row__field-ball',
		});
		ball.setAttribute('aria-hidden', 'true');
		if (direction) {
			const arrowStart = offenseMovesRight
				? Math.min(ballPosition + 3, 266)
				: Math.max(ballPosition - 3, 14);
			const arrowEnd = offenseMovesRight
				? Math.min(arrowStart + 9, 277)
				: Math.max(arrowStart - 9, 3);
			const start = arrowStart.toFixed(1);
			const end = arrowEnd.toFixed(1);
			appendSvg('path', {
				d: offenseMovesRight
					? `M ${start} 20 H ${end} M ${(arrowEnd - 3).toFixed(1)} 17 L ${end} 20 L ${(arrowEnd - 3).toFixed(1)} 23`
					: `M ${start} 20 H ${end} M ${(arrowEnd + 3).toFixed(1)} 17 L ${end} 20 L ${(arrowEnd + 3).toFixed(1)} 23`,
				class: 'live-game-row__field-direction',
			});
		}
	}
	parent.append(svg);
}

function renderLiveRow(
	center: HTMLElement,
	game: LiveGame,
	event: {
		title: string;
		score: string;
		detail: string;
		scoringTeam?: string;
		touchdown: boolean;
		announce: boolean;
	} | undefined,
	scoreChanged: boolean,
	showField: boolean,
): HTMLElement {
	const detailHref = showField ? gameDetailHref(game) : undefined;
	const row = document.createElement('article');
	row.className = 'live-game-row';
	row.dataset.eventId = game.eventId;
	row.dataset.gameTeams = `${game.awayTeam} at ${game.homeTeam}`;
	const link = detailHref ? document.createElement('a') : undefined;
	const content: HTMLElement = link ?? row;
	if (game.notice) row.dataset.hasNotice = 'true';
	if (event) row.dataset.hasEvent = 'true';
	if (
		game.situation?.downDistance ||
		game.state === 'halftime' ||
		game.state === 'final' ||
		game.moment === 'two_minute_warning'
	) {
		row.dataset.hasContext = 'true';
	}
	if (link && detailHref) {
		link.href = detailHref;
		link.className = 'live-game-row__link';
		row.append(link);
	}
	if (showField) {
		row.classList.add('live-game-row--draggable');
		const keyboardTarget = link ?? row;
		if (!link) row.tabIndex = 0;
		keyboardTarget.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
		keyboardTarget.setAttribute('aria-description', 'Hold and drag to reorder, or press Alt+ArrowUp or Alt+ArrowDown.');
	}
	const possession = game.situation?.possession;
	const possessionTeam = possessionMatchesTeam(possession, game.awayTeam)
		? game.awayTeam
		: possessionMatchesTeam(possession, game.homeTeam)
			? game.homeTeam
			: undefined;
	if (game.situation?.redZone) row.classList.add('live-game-row--red-zone');
	const noticeLabel = game.notice === 'under_review' ? 'under review' : game.notice === 'flag' ? 'flag' : '';
	const noticeDetail = game.notice === 'flag' && game.lastPlay?.text
		? game.lastPlay.text.replace(/^Penalty:\s*/i, '')
		: '';
	const phaseLabel = game.state === 'halftime'
		? 'HALFTIME'
		: game.moment === 'two_minute_warning'
			? 'TWO-MINUTE WARNING'
			: '';
	const awayName = getTeamDisplayName(game.awayTeam);
	const homeName = getTeamDisplayName(game.homeTeam);
	const accessibleLabel = `${awayName} ${game.awayScore}, ${homeName} ${game.homeScore}, ${liveStatusLabel(game)}${possessionTeam ? `, ${getTeamDisplayName(possessionTeam)} has possession` : ''}${phaseLabel ? `, ${phaseLabel.toLowerCase()}` : ''}${noticeLabel ? `, ${noticeLabel}${noticeDetail ? `: ${noticeDetail}` : ''}` : ''}`;
	row.setAttribute('aria-label', accessibleLabel);
	link?.setAttribute('aria-label', accessibleLabel);
	const teams = appendText(content, 'div', '', 'live-game-row__teams');
	const away = appendText(teams, 'strong', game.awayTeam, 'live-game-row__team');
	if (possessionTeam === game.awayTeam) {
		away.classList.add('live-game-row__team--possession');
		away.setAttribute('aria-label', `${awayName}, has possession`);
		const accent = teamPalette(game.awayTeam)?.accent;
		if (accent) away.style.setProperty('--possession-accent', accent);
	}
	appendText(teams, 'span', '@');
	const home = appendText(teams, 'strong', game.homeTeam, 'live-game-row__team');
	if (possessionTeam === game.homeTeam) {
		home.classList.add('live-game-row__team--possession');
		home.setAttribute('aria-label', `${homeName}, has possession`);
		const accent = teamPalette(game.homeTeam)?.accent;
		if (accent) home.style.setProperty('--possession-accent', accent);
	}
	const compactGames = compactGamesByCenter.get(center);
	const isCompact = compactGames?.has(game.eventId) ?? false;
	if (isCompact) row.classList.add('live-game-row--compact');
	if (showField) appendFieldGraphic(content, game, possessionTeam);
	const score = appendText(
		content,
		'div',
		'',
		`live-game-row__score${event?.touchdown ? ' live-game-row__score--touchdown' : scoreChanged ? ' live-game-row__score--changed' : ''}`,
	);
	const awayScore = appendText(score, 'strong', String(game.awayScore));
	awayScore.dataset.scoreTeam = game.awayTeam;
	appendText(score, 'span', '–');
	const homeScore = appendText(score, 'strong', String(game.homeScore));
	homeScore.dataset.scoreTeam = game.homeTeam;
	const clock = game.state === 'in_progress' || game.state === 'halftime'
		? `${game.state === 'halftime' ? 'HALFTIME' : game.period ? `Q${game.period}` : 'LIVE'}${game.clock && game.state === 'in_progress' ? ` · ${game.clock}` : ''}`
		: game.state === 'final'
			? 'FINAL'
			: game.status;
	appendText(content, 'div', clock, 'live-game-row__clock');
	const details = appendText(content, 'div', '', 'live-game-row__details');
	const context = appendText(details, 'div', '', 'live-game-row__context');
	if (phaseLabel) {
		appendText(
			context,
			'div',
			phaseLabel,
			`live-game-row__phase${game.state === 'halftime' ? ' live-game-row__phase--halftime' : ''}`,
		);
	}
	if (game.situation?.downDistance) {
		appendText(
			context,
			'p',
			`${game.situation.downDistance}${game.situation.redZone ? ' · RED ZONE' : ''}`,
			'live-game-row__situation',
		);
	}
	if (!context.childElementCount) context.remove();
	if (event) {
		if (event.touchdown) {
			row.dataset.scoringTeam = event.scoringTeam ?? '';
			if (event.announce) row.dataset.touchdownMotion = 'pending';
		}
		const alert = appendText(
			details,
			'div',
			'',
			`live-event-alert${event.touchdown ? ' live-event-alert--touchdown' : ''}${event.announce ? ' live-event-alert--new' : ''}`,
		);
		if (event.scoringTeam) {
			const accent = teamPalette(event.scoringTeam)?.primary;
			if (accent) alert.style.setProperty('--scoring-team-accent', accent);
		}
		alert.setAttribute('role', 'status');
		alert.setAttribute('aria-live', event.announce ? 'assertive' : 'off');
		appendText(alert, 'strong', event.title, 'live-event-alert__title');
		if (event.touchdown && event.scoringTeam) {
			appendText(alert, 'span', `${event.scoringTeam} SCORES`, 'live-event-alert__team');
		}
		appendText(alert, 'span', event.score, 'live-event-alert__score');
		if (event.detail) appendText(alert, 'span', event.detail, 'live-event-alert__detail');
	}
	if (game.notice) {
		const notice = game.notice === 'under_review' ? 'UNDER REVIEW' : 'FLAG';
		const banner = appendText(
			details,
			'div',
			'',
			`live-game-row__notice live-game-row__notice--${game.notice}`,
		);
		banner.setAttribute('role', 'status');
		appendText(banner, 'strong', notice, 'live-game-row__notice-label');
		if (noticeDetail) {
			appendText(banner, 'span', noticeDetail, 'live-game-row__notice-detail');
		}
	}
	if (showField) {
		const collapseToggle = document.createElement('button');
		collapseToggle.className = 'live-game-row__collapse-toggle';
		collapseToggle.type = 'button';
		collapseToggle.setAttribute('aria-expanded', String(!isCompact));
		collapseToggle.setAttribute('aria-controls', `live-field-${game.eventId.replace(/[^a-zA-Z0-9_-]/g, '-')}`);
		collapseToggle.setAttribute(
			'aria-label',
			`${isCompact ? 'Expand' : 'Collapse'} ${game.awayTeam} at ${game.homeTeam} live game details`,
		);
		collapseToggle.title = `${isCompact ? 'Expand' : 'Collapse'} this live game card`;
		const updateCollapseToggle = (compact: boolean) => {
			const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			chevron.setAttribute('viewBox', '0 0 16 16');
			chevron.setAttribute('aria-hidden', 'true');
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', compact ? 'm6 3 5 5-5 5' : 'm3 6 5 5 5-5');
			chevron.append(path);
			collapseToggle.replaceChildren(chevron);
			collapseToggle.setAttribute('aria-expanded', String(!compact));
			collapseToggle.setAttribute(
				'aria-label',
				`${compact ? 'Expand' : 'Collapse'} ${game.awayTeam} at ${game.homeTeam} live game details`,
			);
			collapseToggle.title = `${compact ? 'Expand' : 'Collapse'} this live game card`;
		};
		updateCollapseToggle(isCompact);
		collapseToggle.addEventListener('pointerdown', (event) => event.stopPropagation());
		collapseToggle.addEventListener('click', (event) => {
			event.preventDefault();
			event.stopPropagation();
			const compact = compactGames?.has(game.eventId) ?? false;
			if (compact) compactGames?.delete(game.eventId);
			else compactGames?.add(game.eventId);
			row.classList.toggle('live-game-row--compact', !compact);
			updateCollapseToggle(!compact);
		});
		row.append(collapseToggle);
	}
	return row;
}

function renderLiveCenters(games: LiveGame[], eventIds: Set<string>, scoreChangedIds: Set<string>) {
	for (const center of liveCards) {
		initializeLiveCenter(center);
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
		const isSummary = center.dataset.liveLayout === 'summary';
		const orderedGames = orderLiveGames(center, relevant);
		for (const game of isSummary ? orderedGames.slice(0, 1) : orderedGames) {
			const recentEvent = recentEvents.get(game.eventId);
			const event = recentEvent && recentEvent.expiresAt > Date.now()
				? { ...recentEvent, announce: eventIds.has(game.eventId) }
				: undefined;
			const row = renderLiveRow(
					center,
					game,
					event,
					scoreChangedIds.has(game.eventId),
					!isSummary && center.dataset.liveLayout !== 'game-detail',
				);
			if (isSummary) row.classList.add('live-game-row--compact');
			fragment.append(row);
		}
		list.replaceChildren(fragment);
		list.querySelectorAll<HTMLElement>('[data-touchdown-motion="pending"]').forEach(animateTouchdown);
		center.setAttribute('aria-live', 'off');
	}
}

function renderBoxScore(game: LiveGame) {
	const container = document.querySelector<HTMLElement>('[data-live-boxscore]');
	const targetHome = normalizedTeam(container?.dataset.gameHome);
	const targetAway = normalizedTeam(container?.dataset.gameAway);
	if (!container || targetHome !== normalizedTeam(game.homeTeam) || targetAway !== normalizedTeam(game.awayTeam)) return;
	const statsContainer = container.querySelector<HTMLElement>('[data-live-stats]');
	if (!statsContainer) return;
	container.hidden = game.state !== 'in_progress' && game.state !== 'halftime' && game.state !== 'final';
	if (container.hidden) return;
	const eyebrow = container.querySelector<HTMLElement>('[data-boxscore-eyebrow]');
	const title = container.querySelector<HTMLElement>('[data-boxscore-title]');
	const hint = container.querySelector<HTMLElement>('[data-boxscore-hint]');
	const details = container.querySelector<HTMLDetailsElement>('[data-boxscore-details]');
	if (eyebrow) eyebrow.textContent = game.state === 'final' ? 'FINAL BOX SCORE' : 'LIVE BOX SCORE';
	if (title) title.textContent = game.state === 'final' ? 'Final game stats' : 'Live game stats';
	if (hint) hint.textContent = game.state === 'final' ? 'View stats' : 'Hide stats';
	if (details && container.dataset.boxscoreState !== game.state) {
		details.open = game.state !== 'final';
		container.dataset.boxscoreState = game.state;
	}

	const fragment = document.createDocumentFragment();
	const teams = appendText(fragment, 'div', '', 'live-boxscore__teams');
	for (const team of game.boxScore) {
		const panel = appendText(teams, 'section', '', 'live-boxscore__team');
		const heading = appendText(panel, 'div', '', 'live-boxscore__team-heading');
		appendText(heading, 'h3', team.team);
		appendText(heading, 'span', 'TEAM', 'live-boxscore__team-label');
		if (team.stats.length > 0) {
			const totals = appendText(panel, 'dl', '', 'live-boxscore__totals');
			for (const stat of team.stats) {
				const metric = appendText(totals, 'div', '', 'live-boxscore__metric');
				appendText(metric, 'dt', stat.label);
				appendText(metric, 'dd', stat.value);
			}
		}
		for (const category of team.categories) {
			if (category.athletes.length === 0) continue;
			const categorySection = appendText(panel, 'section', '', 'live-boxscore__category');
			appendText(categorySection, 'h4', category.name);
			const table = document.createElement('table');
			table.className = 'live-boxscore__table';
			const caption = document.createElement('caption');
			caption.textContent = `${team.team} ${category.name} statistics`;
			table.append(caption);
			const head = document.createElement('thead');
			const headerRow = document.createElement('tr');
			const playerHeader = appendText(headerRow, 'th', 'PLAYER');
			playerHeader.setAttribute('scope', 'col');
			for (const label of category.labels) {
				const header = appendText(headerRow, 'th', label);
				header.setAttribute('scope', 'col');
			}
			head.append(headerRow);
			table.append(head);
			const body = document.createElement('tbody');
			for (const athlete of category.athletes) {
				const row = document.createElement('tr');
				const name = appendText(row, 'th', athlete.name);
				name.setAttribute('scope', 'row');
				for (const stat of athlete.stats) appendText(row, 'td', stat);
				body.append(row);
			}
			table.append(body);
			const tableWrap = appendText(categorySection, 'div', '', 'live-boxscore__table-wrap');
			tableWrap.append(table);
		}
	}
	if (game.boxScore.length === 0) {
		appendText(fragment, 'p', 'Player and team stats are not available from the provider yet.', 'live-boxscore__empty');
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
	if (polling || document.visibilityState === 'hidden' || !navigator.onLine) return;
	if (pollTimer !== undefined) window.clearTimeout(pollTimer);
	pollTimer = undefined;
	polling = true;
	try {
		const gameDate = document.querySelector<HTMLElement>('[data-live-boxscore]')?.dataset.gameDate;
		const endpoint = gameDate
			? `/api/live/games?date=${encodeURIComponent(gameDate)}`
			: '/api/live/games';
		const response = await fetch(endpoint, {
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
			const possession = normalizedTeam(game.situation?.possession ?? undefined);
			let direction = game.situation?.direction ?? null;
			if (possession && game.period !== null) {
				let directions = teamScoringDirections.get(game.eventId);
				if (!directions) {
					directions = new Map();
					teamScoringDirections.set(game.eventId, directions);
				}
				if (direction) {
					if (!directions.has(possession)) {
						const firstHalfDirection = game.period <= 2 ? direction : oppositeDirection(direction);
						const otherTeam = normalizedTeam(game.homeTeam) === possession
							? normalizedTeam(game.awayTeam)
							: normalizedTeam(game.homeTeam);
						directions.set(possession, firstHalfDirection);
						if (!directions.has(otherTeam)) {
							directions.set(otherTeam, oppositeDirection(firstHalfDirection));
						}
					}
				}
				const firstHalfDirection = directions.get(possession);
				direction = firstHalfDirection
					? game.period <= 2 ? firstHalfDirection : oppositeDirection(firstHalfDirection)
					: null;
			}
			if (game.situation && direction) game.situation.direction = direction;
			const scoreChanged = previous !== undefined &&
				(previous.homeScore !== game.homeScore || previous.awayScore !== game.awayScore);
			const newKeyPlay = previous !== undefined &&
				game.lastPlay?.keyAction === true &&
				game.lastPlay.id !== previous.lastPlayId;
			if (scoreChanged) scoreChangedIds.add(game.eventId);
			const touchdown = scoreChanged &&
				game.lastPlay?.scoring === true &&
				/\btouchdown\b/i.test(game.lastPlay.text);
			const scoringTeam = scoreChanged && previous
				? game.homeScore > previous.homeScore && game.awayScore <= previous.awayScore
					? game.homeTeam
					: game.awayScore > previous.awayScore && game.homeScore <= previous.homeScore
						? game.awayTeam
						: undefined
				: undefined;
			if (scoreChanged || newKeyPlay) {
				const title = touchdown
					? 'TOUCHDOWN'
					: scoreChanged
					? game.lastPlay?.scoring
						? /field goal/i.test(game.lastPlay.text)
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
					scoringTeam,
					touchdown,
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
			updateGameDetail(game, scoreChanged, touchdown, scoringTeam);
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
		pollFailures = 0;
		schedulePoll(getLivePollInterval(result.games));
	} catch (error) {
		console.error('Live NFL updates could not be refreshed.', error);
		liveCards.forEach((center) => {
			center.classList.add('live-center--stale');
			const freshness = center.querySelector<HTMLElement>('[data-live-freshness]');
			if (freshness) freshness.textContent = 'Feed unavailable — retrying';
		});
		schedulePoll(getLiveRetryInterval(++pollFailures));
	} finally {
		polling = false;
	}
}

if (liveCards.length > 0) {
	liveCards.forEach(initializeLiveCenter);
	void pollLiveGames();
	const resume = () => {
		if (pollTimer !== undefined) window.clearTimeout(pollTimer);
		pollTimer = undefined;
		void pollLiveGames();
	};
	document.addEventListener('visibilitychange', resume);
	window.addEventListener('online', resume);
	window.addEventListener('offline', resume);
}
