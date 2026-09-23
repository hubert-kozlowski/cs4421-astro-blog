import { getViteConfig } from 'astro/config';

export default getViteConfig({
	test: {
		exclude: ['tests/**', 'node_modules/**'],
	},
});
