import { describe, expect, it } from 'vitest';
import { getMatchupTypeLabel } from './game-presentation';

describe('getMatchupTypeLabel', () => {
	it.each(['WC', 'WILD', 'WILDCARD', 'DIV', 'CON', 'SB', 'POST'])(
		'labels %s as postseason',
		(gameType) => {
			expect(getMatchupTypeLabel(gameType)).toBe('Postseason');
		},
	);

	it('keeps preseason and regular-season labels distinct', () => {
		expect(getMatchupTypeLabel('PRE')).toBe('Preseason');
		expect(getMatchupTypeLabel('REG')).toBe('Regular season');
		expect(getMatchupTypeLabel('REG', true)).toBe('Division game');
	});
});
