export function GET() {
	return new Response(JSON.stringify({ status: 'ready' }), {
		headers: { 'Content-Type': 'application/json' },
	});
}
