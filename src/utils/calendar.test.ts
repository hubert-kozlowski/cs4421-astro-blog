import { describe, expect, it } from 'vitest';
import { buildGameCalendarIcs, createGameCalendarEvent } from './calendar';
import type { NflGame, NflTeam } from './nfl-data';

const teams: NflTeam[] = [
	{ abbr: 'BUF', name: 'Buffalo Bills', conf: 'AFC', division: 'AFC East' },
	{ abbr: 'KC', name: 'Kansas City Chiefs', conf: 'AFC', division: 'AFC West' },
];

const game: NflGame = {
	game_id: '2026_08_BUF_KC',
	season: 2026,
	week: 8,
	home_team: 'KC',
	away_team: 'BUF',
	kickoff_at: '2026-11-01T18:00:00-04:00',
	stadium: 'Arrowhead Stadium',
};

describe('game calendar events', () => {
	it('builds a Google event with the absolute kickoff and a three-hour duration', () => {
		const event = createGameCalendarEvent(game, teams, new Date('2026-10-01T00:00:00Z'));

		expect(event).toMatchObject({
			title: 'Buffalo Bills at Kansas City Chiefs',
			startsAt: '2026-11-01T22:00:00.000Z',
			endsAt: '2026-11-02T01:00:00.000Z',
			location: 'Arrowhead Stadium',
			icsUrl: '/api/games/2026_08_BUF_KC/calendar.ics',
		});
		const googleUrl = new URL(event!.googleCalendarUrl);
		expect(googleUrl.searchParams.get('action')).toBe('TEMPLATE');
		expect(googleUrl.searchParams.get('text')).toBe('Buffalo Bills at Kansas City Chiefs');
		expect(googleUrl.searchParams.get('dates')).toBe('20261101T220000Z/20261102T010000Z');
		expect(googleUrl.searchParams.get('location')).toBe('Arrowhead Stadium');
	});

	it.each([
		['kickoff time is missing', { ...game, kickoff_at: null }],
		['kickoff time is invalid', { ...game, kickoff_at: 'not-a-date' }],
		['kickoff time has passed', { ...game, kickoff_at: '2026-10-01T18:00:00Z' }],
		['team data is missing', { ...game, away_team: null }],
	])('does not create an event when %s', (_reason, candidate) => {
		expect(createGameCalendarEvent(candidate, teams, new Date('2026-10-15T00:00:00Z'))).toBeUndefined();
	});

	it('writes escaped, UTC-based calendar data with RFC-compatible folded lines', () => {
		const event = createGameCalendarEvent(
			{
				...game,
				stadium: 'Arrowhead, Field; North\nKansas City',
			},
			teams,
			new Date('2026-10-01T00:00:00Z'),
		)!;
		const ics = buildGameCalendarIcs(event, new Date('2026-10-01T00:00:00Z'));
		const lines = ics.split('\r\n');

		expect(ics).toContain('BEGIN:VCALENDAR\r\n');
		expect(ics).toContain('DTSTART:20261101T220000Z\r\n');
		expect(ics).toContain('DTEND:20261102T010000Z\r\n');
		expect(ics).toContain('LOCATION:Arrowhead\\, Field\\; North\\nKansas City\r\n');
		expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
		expect(lines.filter(Boolean).every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
	});
});
