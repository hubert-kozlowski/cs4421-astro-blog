// @ts-check

import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
	site: 'https://example.com',
	srcDir: './src/static',
	outDir: './dist-static',
	output: 'static',
	integrations: [sitemap()],
});
