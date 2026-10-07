import { expect, test } from '@playwright/test';

test('homepage presents the NFL overview and navigates to standings', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle(/NFL games this week \| NFL Weekend/);
	await expect(page.getByRole('heading', { name: 'Every game. One clear view.' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'The schedule is not connected yet' })).toBeVisible();

	await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Standings' }).click();
	await expect(page).toHaveURL(/\/standings$/);
	await expect(page.getByRole('heading', { name: 'Standings', exact: true })).toBeVisible();
});

test('NFL sections and detail routes show clear data states', async ({ page }) => {
	for (const route of [
		'/games',
		'/games/example-game',
		'/teams',
		'/teams/example-team',
		'/players',
		'/players/example-player',
		'/compare',
	]) {
		const response = await page.goto(route);
		expect(response?.status(), `${route} should render successfully`).toBe(200);
		await expect(page.locator('main')).toBeVisible();
		await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
	}
});

test('homepage fits a narrow mobile viewport without horizontal overflow', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');

	await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
	const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
	expect(documentWidth).toBeLessThanOrEqual(390);
});
