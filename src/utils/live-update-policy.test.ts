import { describe, expect, it } from 'vitest';
import {
	ACTIVE_LIVE_POLL_INTERVAL_MS,
	getLivePollInterval,
	getLiveRetryInterval,
	IDLE_LIVE_POLL_INTERVAL_MS,
	NEAR_KICKOFF_POLL_INTERVAL_MS,
} from './live-update-policy';

describe('getLivePollInterval', () => {
	const now = Date.parse('2026-10-11T14:00:00Z');

	it('polls live games every 10 seconds', () => {
		expect(getLivePollInterval([{ state: 'in_progress', kickoffAt: '2026-10-11T13:00:00Z' }], now))
			.toBe(ACTIVE_LIVE_POLL_INTERVAL_MS);
	});

	it('polls upcoming games every minute inside the pregame window', () => {
		expect(getLivePollInterval([{ state: 'scheduled', kickoffAt: '2026-10-11T15:00:00Z' }], now))
			.toBe(NEAR_KICKOFF_POLL_INTERVAL_MS);
	});

	it('slows to thirty minutes when no kickoff is near', () => {
		expect(getLivePollInterval([{ state: 'scheduled', kickoffAt: '2026-10-11T16:00:00Z' }], now))
			.toBe(IDLE_LIVE_POLL_INTERVAL_MS);
		expect(getLivePollInterval([], now)).toBe(IDLE_LIVE_POLL_INTERVAL_MS);
	});
});

it('wakes at the pregame boundary rather than oversleeping it', () => {
	const now = Date.parse('2026-10-11T14:00:00Z');
	expect(getLivePollInterval([{ state: 'scheduled', kickoffAt: '2026-10-11T15:40:00Z' }], now)).toBe(10 * 60_000);
	expect(getLivePollInterval([{ state: 'scheduled', kickoffAt: '2026-10-11T13:59:00Z' }], now)).toBe(60_000);
	expect(getLivePollInterval([{ state: 'scheduled', kickoffAt: 'unknown' }], now)).toBe(IDLE_LIVE_POLL_INTERVAL_MS);
});

it('backs off failures and caps retries at five minutes', () => {
	expect([1, 2, 3, 4, 5, 10].map(getLiveRetryInterval)).toEqual([30_000, 60_000, 120_000, 240_000, 300_000, 300_000]);
});

it('schedules 48 idle polls per day while preserving 360 active polls per hour', () => {
	expect(86_400_000 / getLivePollInterval([])).toBe(48);
	expect(3_600_000 / getLivePollInterval([{ state: 'in_progress', kickoffAt: '' }])).toBe(360);
});
