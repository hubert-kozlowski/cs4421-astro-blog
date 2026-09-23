import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, test } from 'vitest';
import TagList from './TagList.astro';

test('renders tags as links to their slugged pages', async () => {
	const container = await AstroContainer.create();
	const result = await container.renderToString(TagList, {
		props: { tags: ['Astro JS', 'Web'] },
	});

	expect(result).toContain('href="/tags/astro-js/"');
	expect(result).toContain('>Astro JS</a>');
	expect(result).toContain('href="/tags/web/"');
});