import type { APIRoute } from 'astro';
import { getDashboard } from '../../utils/cloudwatch-metrics';

export const GET: APIRoute = async () =>
	new Response(JSON.stringify(await getDashboard()), {
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
	});
