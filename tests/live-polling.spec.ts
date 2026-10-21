import { expect, test } from '@playwright/test';

test('idle polling pauses when hidden or offline and resumes without duplicate timers', async ({ page }) => {
	await page.clock.install();
	let requests = 0;
	await page.route('**/api/live/games', async (route) => {
		requests++;
		await route.fulfill({ json: { games: [], fetchedAt: new Date().toISOString(), stale: false } });
	});
	await page.goto('/');
	await expect.poll(() => requests).toBe(1);
	await page.clock.fastForward(29 * 60_000);
	expect(requests).toBe(1);
	await page.clock.fastForward(60_000);
	await expect.poll(() => requests).toBe(2);
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await page.clock.fastForward(60 * 60_000);
	expect(requests).toBe(2);
	await page.evaluate(() => {
		Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
		document.dispatchEvent(new Event('visibilitychange'));
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect.poll(() => requests).toBe(3);
	await page.evaluate(() => {
		Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
		window.dispatchEvent(new Event('offline'));
	});
	await page.clock.fastForward(60 * 60_000);
	expect(requests).toBe(3);
	await page.evaluate(() => {
		Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
		window.dispatchEvent(new Event('online'));
	});
	await expect.poll(() => requests).toBe(4);
	await page.clock.fastForward(30 * 60_000);
	await expect.poll(() => requests).toBe(5);
});

test('failed polls back off and successful responses reset the retry interval', async ({ page }) => {
	await page.clock.install();
	let requests = 0;
	await page.route('**/api/live/games', async (route) => {
		requests++;
		await route.fulfill(requests < 3
			? { status: 503, json: { error: 'offline' } }
			: { json: { games: [], fetchedAt: new Date().toISOString(), stale: false } });
	});
	await page.goto('/');
	await expect.poll(() => requests).toBe(1);
	await page.clock.fastForward(30_000);
	await expect.poll(() => requests).toBe(2);
	await page.clock.fastForward(30_000);
	expect(requests).toBe(2);
	await page.clock.fastForward(30_000);
	await expect.poll(() => requests).toBe(3);
	await page.clock.fastForward(5 * 60_000);
	expect(requests).toBe(3);
});
