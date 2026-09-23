import { describe, expect, test } from 'vitest';
import { slugifyTag } from './tags';

describe('slugifyTag', () => {
	test('trims, lowercases, and joins words', () => {
		expect(slugifyTag('  Astro JS  ')).toBe('astro-js');
	});

	test('removes punctuation at the edges and between words', () => {
		expect(slugifyTag('Web & Accessibility!')).toBe('web-accessibility');
	});

	test('returns an empty slug for a punctuation-only tag', () => {
		expect(slugifyTag('---')).toBe('');
	});
});