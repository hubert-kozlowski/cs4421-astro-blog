import { defineMiddleware } from 'astro:middleware';
import { log } from './utils/logger';
import { isAuthorized, isMetricsPath, unauthorizedResponse } from './utils/metrics-auth';
import { isHealthProbe, recordRequest } from './utils/runtime-metrics';

export const onRequest = defineMiddleware(async ({ request, url }, next) => {
	const startedAt = performance.now();
	const requestId = crypto.randomUUID();
	const base = { event: 'http_request', requestId, method: request.method, path: url.pathname };

	if (isMetricsPath(url.pathname) && !isAuthorized(request.headers.get('authorization'))) {
		log('warn', { ...base, status: 401, durationMs: 0, reason: 'metrics_auth_failed' });
		return unauthorizedResponse();
	}

	try {
		const response = await next();
		const status = response.status;
		const durationMs = Math.round(performance.now() - startedAt);
		if (!isHealthProbe(url.pathname)) recordRequest(status, durationMs);
		log(status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', { ...base, status, durationMs });
		return response;
	} catch (error) {
		const durationMs = Math.round(performance.now() - startedAt);
		if (!isHealthProbe(url.pathname)) recordRequest(500, durationMs);
		log('error', {
			...base,
			status: 500,
			durationMs,
			error: error instanceof Error ? error.name : 'UnknownError',
		});
		throw error;
	}
});
