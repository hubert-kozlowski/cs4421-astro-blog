import { describe, expect, it } from 'vitest';
import { isAuthorized } from './metrics-auth';
import { getDailySeries, isHealthProbe, recordRequest } from './runtime-metrics';
import { computeTrend, utilizationSeverity } from './trend';

describe('computeTrend', () => {
	it('colours increases green for good metrics and red for bad ones', () => {
		expect(computeTrend(120, 100)).toEqual({ percent: 20, direction: 'up', tone: 'good' });
		expect(computeTrend(120, 100, true).tone).toBe('bad');
		expect(computeTrend(80, 100, true)).toEqual({ percent: -20, direction: 'down', tone: 'good' });
	});
	it('handles missing previous data', () => {
		expect(computeTrend(5, 0).percent).toBeNull();
	});
});

describe('utilizationSeverity', () => {
	it('uses thresholds', () => {
		expect(utilizationSeverity(50)).toBe('ok');
		expect(utilizationSeverity(75)).toBe('warn');
		expect(utilizationSeverity(90)).toBe('critical');
	});
});

describe('runtime metrics', () => {
	it('buckets requests per day', () => {
		const now = Date.UTC(2030, 0, 10, 12);
		recordRequest(200, 10, now);
		recordRequest(500, 30, now);
		const last = getDailySeries(3, now).at(-1)!;
		expect(last).toMatchObject({ date: '2030-01-10', requests: 2, errors: 1, avgLatencyMs: 20 });
	});
});

describe('isAuthorized', () => {
	const header = (p: string) => `Basic ${Buffer.from(`u:${p}`).toString('base64')}`;
	it('checks the password', () => {
		expect(isAuthorized(header('pw'), 'pw')).toBe(true);
		expect(isAuthorized(header('bad'), 'pw')).toBe(false);
		expect(isAuthorized(null, 'pw')).toBe(false);
	});
});

it('excludes health probes but keeps live game API traffic', () => {
	expect(['/api/health', '/api/ready/', '/api/live'].every(isHealthProbe)).toBe(true);
	expect(isHealthProbe('/api/live/games')).toBe(false);
	expect(isHealthProbe('/')).toBe(false);
});
