import { getLiveGames } from '../../../utils/live-data';

export async function GET({ request }: { request: Request }) {
	try {
		const requestedDate = new URL(request.url).searchParams.get('date');
		const date = requestedDate
			? new Date(`${requestedDate}T12:00:00.000Z`)
			: new Date();
		if (
			requestedDate &&
			(!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ||
				!Number.isFinite(date.getTime()) ||
				date.toISOString().slice(0, 10) !== requestedDate)
		) {
			return new Response(JSON.stringify({ error: 'A valid game date is required.' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
			});
		}
		const result = await getLiveGames(date);
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
