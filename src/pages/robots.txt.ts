import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
	const origin = site ?? new URL('https://example.com');
	const sitemap = new URL('/sitemap-index.xml', origin);

	return new Response(
		[
			'User-agent: *',
			'Allow: /',
			'Disallow: /api/',
			'Disallow: /metrics',
			`Sitemap: ${sitemap.href}`,
			'',
		].join('\n'),
		{ headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
	);
};
