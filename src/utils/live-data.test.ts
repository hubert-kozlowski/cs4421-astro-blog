import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	getLiveGames,
	LIVE_SCOREBOARD_CACHE_TTL_MS,
	LIVE_SUMMARY_CACHE_TTL_MS,
} from './live-data';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('getLiveGames', () => {
	it('maps live scoreboard, play, and box-score data from ESPN', async () => {
		const date = new Date('2032-01-08T18:00:00.000Z');
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(date);
		const event = {
			id: 'live-test-event-2032',
			date: '2032-01-08T20:00:00.000Z',
			competitions: [{
				date: '2032-01-08T20:00:00.000Z',
				status: {
					type: { name: 'STATUS_IN_PROGRESS', state: 'in', detail: '2nd Quarter' },
					period: 2,
					displayClock: '8:42',
				},
				competitors: [
					{ homeAway: 'home', score: '14', team: { abbreviation: 'KC' } },
					{ homeAway: 'away', score: '10', team: { abbreviation: 'BUF' } },
				],
				situation: {
					downDistanceText: '3rd & 4',
					possessionText: 'KC',
					yardLine: 34,
					isRedZone: true,
					lastPlay: {
						id: 'play-1',
						text: 'Mahomes pass to Kelce for a touchdown',
						type: { text: 'Passing Touchdown' },
						scoreValue: 6,
					},
				},
			}],
		};
		const fetchMock = vi.fn(async (input: string | URL | Request) => {
			const url = new URL(input.toString());
			if (url.pathname.endsWith('/scoreboard')) {
				return new Response(JSON.stringify({
					events: url.searchParams.get('dates') === '20320108' ? [event] : [],
				}));
			}
			return new Response(JSON.stringify({
				boxscore: {
					teams: [{
						team: { abbreviation: 'KC' },
						statistics: [{ label: 'Total Yards', displayValue: '250' }],
					}],
					players: [{
						team: { abbreviation: 'KC' },
						statistics: [{
							name: 'passing',
							labels: ['C/ATT', 'YDS'],
							athletes: [{
								athlete: { displayName: 'Patrick Mahomes' },
								stats: ['15/20', '180'],
							}],
						}],
					}],
				},
			}));
		});
		vi.stubGlobal('fetch', fetchMock);

		const result = await getLiveGames(date);

		expect(result.stale).toBe(false);
		expect(result.games).toHaveLength(1);
		expect(result.games[0]).toMatchObject({
			eventId: 'live-test-event-2032',
			homeTeam: 'KC',
			awayTeam: 'BUF',
			homeScore: 14,
			awayScore: 10,
			state: 'in_progress',
			period: 2,
			clock: '8:42',
			boxScoreUpdatedAt: '2032-01-08T18:00:00.000Z',
			lastPlay: {
				scoring: true,
				keyAction: true,
			},
			situation: {
				downDistance: '3rd & 4',
				possession: 'KC',
				redZone: true,
				yardLine: 34,
			},
		});
		expect(result.games[0]?.boxScore[0]).toMatchObject({
			team: 'KC',
			stats: [{ label: 'Total Yards', value: '250' }],
			categories: [{
				name: 'passing',
				labels: ['C/ATT', 'YDS'],
				athletes: [{ name: 'Patrick Mahomes', stats: ['15/20', '180'] }],
			}],
		});

		expect(LIVE_SCOREBOARD_CACHE_TTL_MS).toBe(15_000);
		expect(LIVE_SUMMARY_CACHE_TTL_MS).toBe(60_000);
		expect(fetchMock).toHaveBeenCalledTimes(4);

		await getLiveGames(date);
		expect(fetchMock).toHaveBeenCalledTimes(4);

		vi.setSystemTime(new Date(date.getTime() + LIVE_SCOREBOARD_CACHE_TTL_MS + 1));
		await getLiveGames(date);
		expect(fetchMock).toHaveBeenCalledTimes(7);

		vi.setSystemTime(new Date(date.getTime() + LIVE_SUMMARY_CACHE_TTL_MS + 1));
		await getLiveGames(date);
		expect(fetchMock).toHaveBeenCalledTimes(11);
	});

	it('uses ESPN possession team IDs instead of the yard-line team in possessionText', async () => {
		const date = new Date('2034-01-08T18:00:00.000Z');
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(date);
		const event = {
			id: 'phi-jax-possession-regression',
			date: '2034-01-08T20:00:00.000Z',
			competitions: [{
				date: '2034-01-08T20:00:00.000Z',
				status: { type: { name: 'STATUS_IN_PROGRESS', state: 'in' } },
				competitors: [
					{ id: '30', homeAway: 'home', score: '14', team: { abbreviation: 'JAX' } },
					{ id: '21', homeAway: 'away', score: '10', team: { abbreviation: 'PHI' } },
				],
				situation: {
					possession: '30',
					possessionText: 'PHI 24',
					yardLine: 76,
					downDistanceText: '1st & 20 at PHI 24',
				},
			}],
		};
		vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
			const url = new URL(input.toString());
			if (url.pathname.endsWith('/scoreboard')) {
				return new Response(JSON.stringify({
					events: url.searchParams.get('dates') === '20340108' ? [event] : [],
				}));
			}
			return new Response(JSON.stringify({ boxscore: {} }));
		}));

		const result = await getLiveGames(date);
		expect(result.games).toHaveLength(1);
		expect(result.games[0]).toMatchObject({
			homeTeam: 'JAX',
			awayTeam: 'PHI',
			situation: {
				possession: 'JAX',
				yardLine: 76,
				downDistance: '1st & 20 at PHI 24',
			},
		});
	});

	it('uses absolute play coordinates and reverses direction for the new team after a turnover', async () => {
		const date = new Date('2036-01-08T18:00:00.000Z');
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(date);
		const makeEvent = (
			id: string,
			possession: string,
			playTeam: string,
			start: number,
			end: number,
		) => ({
			id,
			date: '2036-01-08T20:00:00.000Z',
			competitions: [{
				date: '2036-01-08T20:00:00.000Z',
				status: { type: { name: 'STATUS_IN_PROGRESS', state: 'in' } },
				competitors: [
					{ id: '30', homeAway: 'home', score: '10', team: { abbreviation: 'JAX' } },
					{ id: '21', homeAway: 'away', score: '14', team: { abbreviation: 'PHI' } },
				],
				situation: {
					possession,
					yardLine: end,
					lastPlay: {
						id: `${id}-play`,
						text: 'Live play',
						team: { id: playTeam },
						start: { yardLine: start, team: { id: playTeam } },
						end: { yardLine: end, team: { id: possession } },
					},
				},
			}],
		});
		const events = [
			makeEvent('pickup-moving-left', '21', '21', 74, 56),
			makeEvent('turnover-to-phi', '21', '30', 46, 74),
		];
		vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
			const url = new URL(input.toString());
			if (url.pathname.endsWith('/scoreboard')) {
				return new Response(JSON.stringify({
					events: url.searchParams.get('dates') === '20360108' ? events : [],
				}));
			}
			return new Response(JSON.stringify({ boxscore: {} }));
		}));

		const result = await getLiveGames(date);
		expect(result.games.map((game) => game.situation?.direction)).toEqual(['left', 'left']);
	});

	it('uses the recent drive movement when the latest scoreboard play did not advance', async () => {
		const date = new Date('2037-01-08T18:00:00.000Z');
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(date);
		const event = {
			id: 'latest-play-no-movement',
			date: '2037-01-08T20:00:00.000Z',
			competitions: [{
				date: '2037-01-08T20:00:00.000Z',
				status: { type: { name: 'STATUS_IN_PROGRESS', state: 'in' } },
				competitors: [
					{ id: '30', homeAway: 'home', score: '10', team: { abbreviation: 'JAX' } },
					{ id: '21', homeAway: 'away', score: '14', team: { abbreviation: 'PHI' } },
				],
				situation: {
					possession: '21',
					yardLine: 54,
					lastPlay: {
						id: 'incomplete',
						text: 'Pass incomplete',
						team: { id: '21' },
						start: { yardLine: 54, team: { id: '21' } },
						end: { yardLine: 54, team: { id: '21' } },
					},
				},
			}],
		};
		vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
			const url = new URL(input.toString());
			if (url.pathname.endsWith('/scoreboard')) {
				return new Response(JSON.stringify({
					events: url.searchParams.get('dates') === '20370108' ? [event] : [],
				}));
			}
			return new Response(JSON.stringify({
				header: {
					competitions: [{
						competitors: [
							{ id: '30', team: { abbreviation: 'JAX' } },
							{ id: '21', team: { abbreviation: 'PHI' } },
						],
					}],
				},
				drives: {
					current: {
						plays: [{
							start: { yardLine: 56, team: { id: '21' } },
							end: { yardLine: 54, team: { id: '21' } },
							teamParticipants: [{ id: '21', type: 'offense' }],
						}],
					},
				},
				boxscore: {},
			}));
		}));

		const result = await getLiveGames(date);
		expect(result.games[0]?.situation?.direction).toBe('left');
	});

	it('marks explicit penalties and replay reviews without flagging ordinary plays', async () => {
		const date = new Date('2035-01-08T18:00:00.000Z');
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(date);
		const makeEvent = (
			id: string,
			statusDetail: string,
			playType: string,
			playText: string,
		) => ({
			id,
			date: '2035-01-08T20:00:00.000Z',
			competitions: [{
				date: '2035-01-08T20:00:00.000Z',
				status: {
					type: { name: 'STATUS_IN_PROGRESS', state: 'in', detail: statusDetail },
					period: 2,
					displayClock: '8:42',
				},
				competitors: [
					{ homeAway: 'home', score: '7', team: { abbreviation: 'KC' } },
					{ homeAway: 'away', score: '3', team: { abbreviation: 'BUF' } },
				],
				situation: {
					possession: 'KC',
					yardLine: 34,
					lastPlay: { id: `${id}-play`, type: { text: playType }, text: playText, scoreValue: 0 },
				},
			}],
		});
		const events = [
			makeEvent('flag-event', '2nd Quarter', 'Penalty', 'Holding on defense'),
			makeEvent('review-event', 'Under Review', 'Penalty', 'Holding on defense'),
			makeEvent('ordinary-event', '2nd Quarter', 'Pass', 'Pass complete for 8 yards'),
			makeEvent('replay-assisted-play', '2nd Quarter', 'Pass Reception', 'The penalty was assisted by replay'),
		];
		vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
			const url = new URL(input.toString());
			if (url.pathname.endsWith('/scoreboard')) {
				return new Response(JSON.stringify({
					events: url.searchParams.get('dates') === '20350108' ? events : [],
				}));
			}
			return new Response(JSON.stringify({ boxscore: {} }));
		}));

		const result = await getLiveGames(date);
		expect(result.games.map(({ eventId, notice }) => [eventId, notice])).toEqual([
			['flag-event', 'flag'],
			['review-event', 'under_review'],
			['ordinary-event', null],
			['replay-assisted-play', null],
		]);
	});

	it('keeps field position when valid even if possession is ambiguous, and rejects invalid yard lines', async () => {
		const date = new Date('2033-01-08T18:00:00.000Z');
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(date);
		const event = {
			id: 'position-validation-event',
			date: '2033-01-08T20:00:00.000Z',
			competitions: [{
				date: '2033-01-08T20:00:00.000Z',
				status: { type: { name: 'STATUS_IN_PROGRESS', state: 'in' } },
				competitors: [
					{ homeAway: 'home', score: '0', team: { abbreviation: 'KC' } },
					{ homeAway: 'away', score: '0', team: { abbreviation: 'BUF' } },
				],
				situation: { possessionText: 'Unknown', yardLine: 100.5, isRedZone: false },
			}],
		};
		const events = [
			{
				...event,
				id: 'invalid-yard-line-event',
				competitions: [{
					...event.competitions[0],
					situation: { possessionText: 'KC', yardLine: 100.5, isRedZone: false },
				}],
			},
			event,
			{
				...event,
				id: 'own-goal-line-event',
				competitions: [{
					...event.competitions[0],
					situation: { possessionText: 'BUF', yardLine: 0, isRedZone: false },
				}],
			},
			{
				...event,
				id: 'ambiguous-possession-valid-yard-line-event',
				competitions: [{
					...event.competitions[0],
					situation: { possessionText: 'Unknown', yardLine: 100, isRedZone: false },
				}],
			},
		];
		vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
			const url = new URL(input.toString());
			return new Response(JSON.stringify({
				events: url.pathname.endsWith('/scoreboard') && url.searchParams.get('dates') === '20330108'
					? events
					: [],
			}));
		}));

		const result = await getLiveGames(date);
		expect(result.games).toHaveLength(4);
		expect(result.games.find((game) => game.eventId === 'invalid-yard-line-event')?.situation).toMatchObject({
			possession: 'KC',
			yardLine: null,
		});
		expect(result.games.find((game) => game.eventId === 'position-validation-event')?.situation).toMatchObject({
			possession: null,
			yardLine: null,
		});
		expect(result.games.find((game) => game.eventId === 'ambiguous-possession-valid-yard-line-event')?.situation).toMatchObject({
			possession: null,
			yardLine: 100,
		});
		expect(result.games.find((game) => game.eventId === 'own-goal-line-event')?.situation).toMatchObject({
			possession: 'BUF',
			yardLine: 0,
		});
	});
});
