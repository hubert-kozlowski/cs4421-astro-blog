import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, test } from 'vitest';
import Greeting from './Greeting.astro';

test('renders the provided name', async () => {
	const container = await AstroContainer.create();
	const result = await container.renderToString(Greeting, { props: { name: 'World' } });

	expect(result).toContain('Hello, World!');
});
