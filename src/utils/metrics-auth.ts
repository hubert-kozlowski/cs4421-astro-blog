import { timingSafeEqual } from 'node:crypto';

const DEFAULT_PASSWORD = 'password';

export function isMetricsPath(pathname: string): boolean {
	return pathname === '/metrics' || pathname === '/metrics/' || pathname.startsWith('/api/metrics');
}

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function isAuthorized(header: string | null, password = process.env.METRICS_PASSWORD || DEFAULT_PASSWORD): boolean {
	if (!header?.startsWith('Basic ')) return false;
	const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
	const idx = decoded.indexOf(':');
	return idx >= 0 && safeEqual(decoded.slice(idx + 1), password);
}

export function unauthorizedResponse(): Response {
	return new Response('Authentication required', {
		status: 401,
		headers: { 'WWW-Authenticate': 'Basic realm="Metrics", charset="UTF-8"', 'Cache-Control': 'no-store' },
	});
}
