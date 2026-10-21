import { describe, expect, it } from 'vitest';
import { DEFAULT_SPORT, SPORTS, getSportDefinition } from '../config/sports';
import { SportProviderUnavailableError, getSportProvider } from './sport-provider';

describe('sport configuration', () => {
	it('defaults to an active red NFL experience', () => {
		expect(DEFAULT_SPORT).toBe('nfl');
		expect(getSportDefinition()).toMatchObject({ id: 'nfl', status: 'active', accent: 'red' });
		expect(SPORTS.nfl.capabilities).toEqual({
			players: true,
			compare: true,
			liveScores: true,
			calendar: true,
		});
	});

	it('keeps CFB planned, blue, and capability-gated', () => {
		expect(SPORTS.cfb).toMatchObject({ id: 'cfb', status: 'planned', accent: 'blue' });
		expect(Object.values(SPORTS.cfb.capabilities).every((available) => !available)).toBe(true);
	});
});

describe('sport provider registry', () => {
	it('registers the NFL provider', () => {
		expect(getSportProvider().id).toBe('nfl');
	});

	it('fails closed for a sport without a provider', () => {
		expect(() => getSportProvider('cfb')).toThrow(SportProviderUnavailableError);
	});
});

