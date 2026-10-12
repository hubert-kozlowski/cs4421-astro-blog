import type { NflGame, NflTeam } from './nfl-data';
import { isAbsoluteTimestamp } from './local-game-time';

const GAME_DURATION_MS = 3 * 60 * 60 * 1000;
const GOOGLE_CALENDAR_URL = 'https://calendar.google.com/calendar/render';
const utf8Encoder = new TextEncoder();

export interface GameCalendarEvent {
	gameId: string;
	title: string;
	description: string;
	location?: string;
	startsAt: string;
	endsAt: string;
	googleCalendarUrl: string;
	icsUrl: string;
}

function compactUtcTimestamp(timestamp: string): string {
	return new Date(timestamp).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function foldIcsLine(line: string): string {
	const folded: string[] = [];
	let current = '';
	let byteLength = 0;

	for (const character of line) {
		const characterBytes = utf8Encoder.encode(character).length;
		if (byteLength + characterBytes > 75) {
			folded.push(current);
			current = ` ${character}`;
			byteLength = 1 + characterBytes;
		} else {
			current += character;
			byteLength += characterBytes;
		}
	}

	folded.push(current);
	return folded.join('\r\n');
}

function escapeIcsText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/\r\n|\r|\n/g, '\\n')
		.replace(/,/g, '\\,')
		.replace(/;/g, '\\;');
}

export function createGameCalendarEvent(
	game: NflGame,
	teams: NflTeam[],
	now = new Date(),
): GameCalendarEvent | undefined {
	const kickoffAt = game.kickoff_at ?? undefined;
	if (
		!game.home_team ||
		!game.away_team ||
		!isAbsoluteTimestamp(kickoffAt) ||
		Date.parse(kickoffAt) <= now.getTime()
	) {
		return undefined;
	}

	const homeTeam = teams.find((team) => team.abbr === game.home_team)?.name ?? game.home_team;
	const awayTeam = teams.find((team) => team.abbr === game.away_team)?.name ?? game.away_team;
	const title = `${awayTeam} at ${homeTeam}`;
	const weekDescription = game.week ? `NFL Week ${game.week}` : 'NFL game';
	const description = game.season ? `${weekDescription} · ${game.season} season` : weekDescription;
	const startsAt = new Date(kickoffAt);
	const endsAt = new Date(startsAt.getTime() + GAME_DURATION_MS);
	const googleParams = new URLSearchParams({
		action: 'TEMPLATE',
		text: title,
		dates: `${compactUtcTimestamp(startsAt.toISOString())}/${compactUtcTimestamp(endsAt.toISOString())}`,
		details: description,
		location: game.stadium ?? '',
	});

	return {
		gameId: game.game_id,
		title,
		description,
		location: game.stadium ?? undefined,
		startsAt: startsAt.toISOString(),
		endsAt: endsAt.toISOString(),
		googleCalendarUrl: `${GOOGLE_CALENDAR_URL}?${googleParams.toString()}`,
		icsUrl: `/api/games/${encodeURIComponent(game.game_id)}/calendar.ics`,
	};
}

export function buildGameCalendarIcs(event: GameCalendarEvent, createdAt = new Date()): string {
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Gridiron Atlas//NFL Game Calendar//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${escapeIcsText(event.gameId)}@gridiron-atlas`,
		`DTSTAMP:${compactUtcTimestamp(createdAt.toISOString())}`,
		`DTSTART:${compactUtcTimestamp(event.startsAt)}`,
		`DTEND:${compactUtcTimestamp(event.endsAt)}`,
		`SUMMARY:${escapeIcsText(event.title)}`,
		`DESCRIPTION:${escapeIcsText(event.description)}`,
		...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
		'END:VEVENT',
		'END:VCALENDAR',
	];

	return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}
