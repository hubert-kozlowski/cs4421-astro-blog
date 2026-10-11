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
});
