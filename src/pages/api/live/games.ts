import { getLiveGames } from '../../../utils/live-data';

export async function GET() {
	try {
		const result = await getLiveGames();
		return new Response(JSON.stringify(result), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store',
			},
		});
	} catch (error) {
		console.error(
			JSON.stringify({
				level: 'error',
				event: 'live_games_unavailable',
				error: error instanceof Error ? error.name : 'UnknownError',
			}),
		);
		return new Response(JSON.stringify({ error: 'Live game data is temporarily unavailable.' }), {
			status: 503,
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store',
			},
		});
	}
}
