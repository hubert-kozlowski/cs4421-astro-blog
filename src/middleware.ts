import { defineMiddleware } from 'astro:middleware';

export const onRequest = defineMiddleware(async ({ request, url }, next) => {
	const startedAt = performance.now();
	const timestamp = new Date().toISOString();
	const requestId = crypto.randomUUID();

	try {
		const response = await next();
		const status = response.status;
		const log = {
			timestamp,
			level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
			requestId,
			method: request.method,
			path: url.pathname,
			status,
			durationMs: Math.round(performance.now() - startedAt),
		};

		if (status >= 500) {
			console.error(JSON.stringify(log));
		} else if (status >= 400) {
			console.warn(JSON.stringify(log));
		} else {
			console.log(JSON.stringify(log));
		}

		return response;
	} catch (error) {
		console.error(
			JSON.stringify({
				timestamp,
				level: 'error',
				requestId,
				method: request.method,
				path: url.pathname,
				status: 500,
				durationMs: Math.round(performance.now() - startedAt),
				error: error instanceof Error ? error.name : 'UnknownError',
			}),
		);
		throw error;
	}
});
