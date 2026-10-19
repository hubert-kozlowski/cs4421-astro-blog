import { describe, expect, it } from 'vitest';
import { getStadiumProfile, NFL_TEAM_STADIUM_ABBREVIATIONS } from './stadium-profiles';

describe('stadium profiles', () => {
	it('provides venue-specific original outlines for every NFL team', () => {
		const profiles = NFL_TEAM_STADIUM_ABBREVIATIONS.map((abbr) => getStadiumProfile(abbr));

		expect(profiles).toHaveLength(32);
		expect(new Set(profiles.map(({ outline }) => outline)).size).toBe(30);
		expect(getStadiumProfile('NYG')).toEqual(getStadiumProfile('NYJ'));
		expect(getStadiumProfile('LAR')).toEqual(getStadiumProfile('LAC'));
		expect(getStadiumProfile('LA')).toEqual(getStadiumProfile('LAR'));
	});
});
