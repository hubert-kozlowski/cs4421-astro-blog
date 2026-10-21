// @ts-check

import mdx from '@astrojs/mdx';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import process from 'node:process';

// https://astro.build/config
export default defineConfig({
	// Set SITE_URL to the public HTTPS origin at build time when a custom domain is ready.
	site: process.env.SITE_URL ?? 'https://example.com',
	output: 'server',
	adapter: node({ mode: 'standalone' }),
	integrations: [mdx(), sitemap()],
});
