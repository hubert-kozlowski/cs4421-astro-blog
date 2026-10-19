import { describe, expect, it } from 'vitest';
import { getTeamDisplayName } from './team-names';

describe('getTeamDisplayName', () => {
	it('returns a consistent city and nickname for each NFL abbreviation', () => {
		const abbreviations = [
			'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB',
			'HOU', 'IND', 'JAX', 'KC', 'LA', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
			'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS', 'WSH',
		];

		for (const abbreviation of abbreviations) {
			expect(getTeamDisplayName(abbreviation)).toMatch(/.+ .+/);
		}
	});

	it('normalizes known aliases and preserves unknown provider abbreviations', () => {
		expect(getTeamDisplayName(' la ')).toBe('Los Angeles Rams');
		expect(getTeamDisplayName('WSH')).toBe('Washington Commanders');
		expect(getTeamDisplayName('XYZ')).toBe('XYZ');
		expect(getTeamDisplayName(undefined)).toBe('NFL');
	});
});
