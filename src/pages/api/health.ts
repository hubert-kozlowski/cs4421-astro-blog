export function GET() {
	const memoryUsage = process.memoryUsage();

	return new Response(
		JSON.stringify({
			status: 'ok',
			timestamp: new Date().toISOString(),
			uptimeSeconds: process.uptime(),
			process: {
				pid: process.pid,
				nodeVersion: process.version,
				platform: process.platform,
				architecture: process.arch,
			},
			memory: {
				rssBytes: memoryUsage.rss,
				heapTotalBytes: memoryUsage.heapTotal,
				heapUsedBytes: memoryUsage.heapUsed,
				externalBytes: memoryUsage.external,
				arrayBuffersBytes: memoryUsage.arrayBuffers,
			},
		}),
		{
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store',
			},
		},
	);
}
