// @ts-check

import mdx from '@astrojs/mdx';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import process from 'node:process';

// https://astro.build/config
export default defineConfig({
	// SITE_URL can override the production domain for preview deployments.
	site: process.env.SITE_URL ?? 'https://gridironatlas.app',
	output: 'server',
	adapter: node({ mode: 'standalone' }),
	integrations: [mdx(), sitemap()],
});
