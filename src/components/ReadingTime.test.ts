import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { expect, test, describe } from 'vitest';
import ReadingTime from './ReadingTime.astro';

describe('ReadingTime component', () => {
	test('displays "1 min read" for articles with fewer than 200 words', async () => {
		const container = await AstroContainer.create();
		const shortText = 'This is a short article with just a few words.';
		const result = await container.renderToString(ReadingTime, {
			props: { body: shortText },
		});

		expect(result).toContain('1 min read');
		expect(result).not.toContain('0 min read');
	});

	test('calculates reading time correctly for articles with exactly 200 words', async () => {
		const container = await AstroContainer.create();
		// Create a body with exactly 200 words
		const words = Array(200).fill('word').join(' ');
		const result = await container.renderToString(ReadingTime, {
			props: { body: words },
		});

		expect(result).toContain('1 min read');
	});

	test('calculates reading time correctly for articles with 201 words (rounds up)', async () => {
		const container = await AstroContainer.create();
		// Create a body with 201 words
		const words = Array(201).fill('word').join(' ');
		const result = await container.renderToString(ReadingTime, {
			props: { body: words },
		});

		expect(result).toContain('2 mins read');
	});

	test('calculates reading time correctly for longer articles', async () => {
		const container = await AstroContainer.create();
		// Create a body with 500 words (should be 3 minutes: 500/200 = 2.5, rounds up to 3)
		const words = Array(500).fill('word').join(' ');
		const result = await container.renderToString(ReadingTime, {
			props: { body: words },
		});

		expect(result).toContain('3 mins read');
	});

	test('handles empty body gracefully', async () => {
		const container = await AstroContainer.create();
		const result = await container.renderToString(ReadingTime, {
			props: { body: '' },
		});

		expect(result).toContain('1 min read');
	});

	test('uses correct singular "min" for 1 minute', async () => {
		const container = await AstroContainer.create();
		const shortText = 'Short article';
		const result = await container.renderToString(ReadingTime, {
			props: { body: shortText },
		});

		expect(result).toContain('1 min read');
		expect(result).not.toContain('mins');
	});

	test('uses correct plural "mins" for multiple minutes', async () => {
		const container = await AstroContainer.create();
		// Create a body with 400 words (should be 2 minutes)
		const words = Array(400).fill('word').join(' ');
		const result = await container.renderToString(ReadingTime, {
			props: { body: words },
		});

		expect(result).toContain('2 mins read');
	});

	test('ignores multiple consecutive spaces (words separated by multiple spaces)', async () => {
		const container = await AstroContainer.create();
		// Create a body with multiple spaces between words
		const text = 'word1     word2     word3     word4     word5'; // 5 words
		const result = await container.renderToString(ReadingTime, {
			props: { body: text },
		});

		// Should still be 1 min read (fewer than 200 words)
		expect(result).toContain('1 min read');
	});

	test('counts words correctly with various punctuation', async () => {
		const container = await AstroContainer.create();
		// Create text with punctuation: "word." should still count as one word
		const words = Array.from({ length: 200 }, (_, i) => `word${i % 5}.`).join(' ');
		const result = await container.renderToString(ReadingTime, {
			props: { body: words },
		});

		expect(result).toContain('1 min read');
	});

	test('handles very large articles correctly', async () => {
		const container = await AstroContainer.create();
		// Create a body with 10,000 words (should be 50 minutes: 10000/200 = 50)
		const words = Array(10000).fill('word').join(' ');
		const result = await container.renderToString(ReadingTime, {
			props: { body: words },
		});

		expect(result).toContain('50 mins read');
	});

	test('renders reading time in correct format', async () => {
		const container = await AstroContainer.create();
		const words = Array(500).fill('word').join(' ');
		const result = await container.renderToString(ReadingTime, {
			props: { body: words },
		});

		// Should contain the format "X mins read"
		expect(result).toMatch(/\d+\s+mins?\s+read/);
	});
});
