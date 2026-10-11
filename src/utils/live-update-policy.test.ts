import { describe, expect, it } from 'vitest';
import {
	ACTIVE_LIVE_POLL_INTERVAL_MS,
	getLivePollInterval,
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

	it('slows to five minutes when no kickoff is near', () => {
		expect(getLivePollInterval([{ state: 'scheduled', kickoffAt: '2026-10-11T16:00:00Z' }], now))
			.toBe(IDLE_LIVE_POLL_INTERVAL_MS);
		expect(getLivePollInterval([], now)).toBe(IDLE_LIVE_POLL_INTERVAL_MS);
	});
});
