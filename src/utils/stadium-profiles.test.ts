import { describe, expect, it } from 'vitest';
import { getStadiumProfile, NFL_TEAM_STADIUM_ABBREVIATIONS } from './stadium-profiles';

describe('stadium profiles', () => {
	it('provides venue-specific original outlines for every NFL team', () => {
		const profiles = NFL_TEAM_STADIUM_ABBREVIATIONS.map((abbr) => getStadiumProfile(abbr));

		expect(profiles).toHaveLength(32);
		expect(new Set(profiles.map(({ outline }) => outline)).size).toBe(30);
		expect(profiles.every(({ details }) => details.length > 0)).toBe(true);
		expect(getStadiumProfile('NYG')).toEqual(getStadiumProfile('NYJ'));
		expect(getStadiumProfile('LAR')).toEqual(getStadiumProfile('LAC'));
		expect(getStadiumProfile('LA')).toEqual(getStadiumProfile('LAR'));
	});

	it('uses distinct overhead footprints for recognizable roof and bowl designs', () => {
		const profiles = ['ARI', 'ATL', 'CHI', 'DAL', 'LV', 'MIN', 'NO', 'SEA'].map((abbr) =>
			getStadiumProfile(abbr).outline,
		);

		expect(new Set(profiles).size).toBe(profiles.length);
		expect(getStadiumProfile('NO').outline).toContain('M180 20C245 20 302 47');
		expect(getStadiumProfile('SEA').outline).toContain('M57 28H303');
		expect(getStadiumProfile('SEA').outline).not.toMatch(/Z$/);
	});
});
