export function GET() {
	if (process.env.DEFENSE_DRILL_FAIL_READINESS === 'true') {
		return new Response(JSON.stringify({ status: 'not_ready', reason: 'defense_drill' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	return new Response(JSON.stringify({ status: 'ready' }), {
		headers: { 'Content-Type': 'application/json' },
	});
}
