import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveProviderCache } from './live-provider-cache';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('LiveProviderCache', () => {
	it('shares concurrent fetches, caches validated values, and refreshes at expiry', async () => {
		vi.useFakeTimers();
		const cache = new LiveProviderCache();
		const load = vi.fn(async () => ({ score: 7 }));
		const get = () => cache.get('live-scoreboard-test', load, (v) => typeof v === 'object', 10_000);
		await Promise.all([get(), get(), get()]);
		await get();
		expect(load).toHaveBeenCalledTimes(1);
		vi.advanceTimersByTime(10_000);
		await get();
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('returns old summaries immediately while one background refresh is pending', async () => {
		vi.useFakeTimers();
		const cache = new LiveProviderCache();
		let release!: (value: unknown) => void;
		const load = vi.fn<() => Promise<unknown>>().mockResolvedValueOnce({ score: 7 })
			.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
		const get = () => cache.get('summary', load, () => true, 60_000, true);
		await get();
		vi.advanceTimersByTime(60_000);
		expect(await get()).toMatchObject({ value: { score: 7 }, stale: true });
		expect(await get()).toMatchObject({ value: { score: 7 }, stale: true });
		expect(load).toHaveBeenCalledTimes(2);
		release({ score: 14 });
		await vi.waitFor(async () => expect(await get()).toMatchObject({ value: { score: 14 }, stale: false }));
	});

	it('keeps valid data on failure and retries only after the cooldown', async () => {
		vi.useFakeTimers();
		const cache = new LiveProviderCache();
		const load = vi.fn().mockResolvedValueOnce({ score: 7 }).mockRejectedValue(new Error('offline'));
		const get = () => cache.get('scoreboard', load, () => true, 10_000);
		await get();
		vi.advanceTimersByTime(10_000);
		expect((await get()).stale).toBe(true);
		await get();
		expect(load).toHaveBeenCalledTimes(2);
		vi.advanceTimersByTime(30_000);
		await get();
		expect(load).toHaveBeenCalledTimes(3);
	});

	it('rejects malformed data before caching it and cools down cold failures', async () => {
		const cache = new LiveProviderCache();
		const load = vi.fn(async () => null);
		const get = () => cache.get('scoreboard', load, (v) => v !== null, 10_000);
		await expect(get()).rejects.toThrow('unexpected shape');
		await expect(get()).rejects.toThrow('cooldown');
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('expires day-old fallback data and bounds retained entries', async () => {
		vi.useFakeTimers();
		const cache = new LiveProviderCache();
		const load = vi.fn(async () => ({}));
		for (let i = 0; i < 257; i++) await cache.get(String(i), load, () => true, 86_400_000);
		await cache.get('0', load, () => true, 86_400_000);
		expect(load).toHaveBeenCalledTimes(258);
		vi.advanceTimersByTime(86_400_000);
		await expect(cache.get('0', async () => { throw new Error('offline'); }, () => true, 86_400_000)).rejects.toThrow('offline');
	});
});
