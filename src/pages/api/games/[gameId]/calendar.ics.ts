import type { APIContext } from 'astro';
import { buildGameCalendarIcs, createGameCalendarEvent } from '../../../../utils/calendar';
import { getApiMetadata, getGame } from '../../../../utils/nfl-data';

export async function GET({ params }: APIContext): Promise<Response> {
	const gameId = params.gameId ?? '';

	try {
		const [gameResult, metadataResult] = await Promise.all([getGame(gameId), getApiMetadata()]);
		const event = createGameCalendarEvent(gameResult.value, metadataResult.value.teams);
		if (!event) {
			return new Response('This game is no longer available to add to a calendar.', {
				status: 404,
				headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
			});
		}

		return new Response(buildGameCalendarIcs(event), {
			headers: {
				'Content-Type': 'text/calendar; charset=utf-8; method=PUBLISH',
				'Content-Disposition': `attachment; filename="nfl-game-${event.gameId}.ics"`,
				'Cache-Control': 'private, max-age=300',
			},
		});
	} catch (error) {
		console.error(
			JSON.stringify({
				level: 'error',
				event: 'game_calendar_unavailable',
				gameId,
				error: error instanceof Error ? error.name : 'UnknownError',
			}),
		);
		return new Response('The calendar file could not be generated right now.', {
			status: 503,
			headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
		});
	}
}
