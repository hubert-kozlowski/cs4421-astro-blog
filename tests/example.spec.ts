import { expect, test } from '@playwright/test';

test('dashboard brings games, standings, player search, and matchups together', async ({ page }) => {
	await page.goto('/');

	await expect(page).toHaveTitle(/NFL dashboard \| Gridiron Atlas/);
	await expect(page.getByRole('heading', { name: 'Every game. One place.' })).toBeVisible();
	await expect(page.locator('.hero-score')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Next session starts in' })).toBeVisible();
	await expect(page.locator('[data-countdown]')).toHaveText(/^\d+:\d{2}:\d{2}$/);
	await expect(page.locator('[data-session-matchups]')).not.toHaveText(/^\d+ games?$/);
	expect(
		await page.locator('[data-next-session]').evaluate((element) => {
			const sessions = JSON.parse(element.getAttribute('data-sessions') ?? '[]');
			return Array.isArray(sessions) && sessions.length > 0;
		}),
	).toBe(true);
	await expect(page.getByRole('navigation', { name: 'Jump to a dashboard feature' }).getByRole('link')).toHaveCount(4);
	await expect(page.getByRole('heading', { name: 'Pick your game.' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'See who’s climbing.' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Find your player.' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Set up a matchup.' })).toBeVisible();
	await expect(page.getByRole('searchbox', { name: 'Search NFL player names' })).toBeVisible();

	await page.getByRole('navigation', { name: 'Jump to a dashboard feature' }).getByRole('link', { name: 'Standings' }).click();
	await expect(page).toHaveURL(/#standings$/);
});

test('live game center stays visible while the next kickoff countdown advances', async ({ page }) => {
	let apiRequests = 0;
	const game = {
		eventId: 'live-phi-jax',
		kickoffAt: '2026-10-11T13:00:00.000Z',
		homeTeam: 'JAX',
		awayTeam: 'PHI',
		homeScore: 0,
		awayScore: 0,
		state: 'in_progress',
		status: '1st Quarter',
		period: 1,
		clock: '4:19',
		boxScoreUpdatedAt: '2026-10-11T13:59:45.000Z',
		lastPlay: {
			id: 'play-1',
			text: 'Rush up the middle for 4 yards',
			scoring: false,
			keyAction: false,
		},
		situation: { downDistance: '1st & Goal', possession: 'JAX', redZone: true },
		boxScore: [],
	};
	await page.route('**/api/live/games', async (route) => {
		apiRequests += 1;
		await route.fulfill({
			json: {
				fetchedAt: '2026-10-11T14:00:00.000Z',
				stale: false,
				games: [game],
			},
		});
	});

	await page.goto('/');

	const liveCenter = page.locator('[data-live-center]');
	await expect(liveCenter).toBeVisible();
	await expect(liveCenter.locator('.live-game-row')).toContainText('PHI');
	await expect(liveCenter.locator('.live-game-row')).toContainText('JAX');
	await expect(liveCenter.locator('.live-game-row')).toContainText('Q1 · 4:19');
	await expect(liveCenter.locator('.live-game-row__situation')).toHaveText('1st & Goal · RED ZONE');
	await expect(liveCenter.locator('.live-game-row__team--possession')).toHaveAttribute('aria-label', 'JAX, has possession');
	await expect(liveCenter.locator('.live-event-alert')).toHaveCount(0);
	await expect.poll(() => apiRequests).toBe(1);
	expect(
		await liveCenter.locator('.live-center__indicator i').evaluate((element) => getComputedStyle(element).animationName),
	).toBe('none');
	await expect(liveCenter.locator('.live-game-row')).toHaveCSS('min-height', '38px');
	expect(await liveCenter.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(105);
	await expect(page.getByRole('heading', { name: 'Next session starts in' })).toBeVisible();
	expect(
		await liveCenter.evaluate((element) => {
			const nextSession = document.querySelector('[data-next-session]');
			return Boolean(nextSession && nextSession.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING);
		}),
	).toBe(true);

	game.clock = '3:56';
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await expect.poll(() => apiRequests).toBe(2);
	await expect(liveCenter.locator('.live-game-row__clock')).toHaveText('Q1 · 3:56');
	await expect(liveCenter.locator('.live-event-alert')).toHaveCount(0);
	await expect(liveCenter.locator('.live-game-row__score')).not.toHaveClass(/--changed/);

	game.homeScore = 7;
	game.lastPlay = {
		id: 'play-2',
		text: 'Touchdown run into the end zone',
		scoring: true,
		keyAction: true,
	};
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await expect.poll(() => apiRequests).toBe(3);
	await expect(liveCenter.locator('.live-event-alert__title')).toHaveText('TOUCHDOWN');
	await expect(liveCenter.locator('.live-event-alert__score')).toHaveText('PHI 0 – JAX 7');
	await expect(liveCenter.locator('.live-event-alert__detail')).toContainText('Touchdown');
	await expect(liveCenter.locator('.live-game-row__score')).toHaveClass(/live-game-row__score--changed/);
});

test('game, team, player, and directory routes respond', async ({ page }) => {
	for (const route of [
		'/games',
		'/games/example-game',
		'/teams',
		'/players',
		'/players/00-0033873',
		'/compare',
		'/standings',
	]) {
		const response = await page.goto(route);
		expect(response?.status(), `${route} should render successfully`).toBe(200);
		await expect(page.locator('main')).toBeVisible();
		await expect(
			page.getByRole('heading', { level: 1 }).or(page.getByRole('alert').getByRole('heading')),
		).toBeVisible();
	}

	await page.goto('/teams');
	const availableTeam = page.locator('main a[href^="/teams/"]').first();
	if (await availableTeam.count() > 0) {
		await availableTeam.click();
		await expect(page.locator('main')).toBeVisible();
	}
});

test('team badges use team-specific colors', async ({ page }) => {
	await page.goto('/');
	const badge = page.locator('.game-card svg.team-mark').first();

	await expect(badge).toHaveAttribute('style', /--team-primary:\s*#[0-9a-f]{6}/i);
	await expect(badge).toHaveAttribute('style', /--team-accent:\s*#[0-9a-f]{6}/i);
});

test('standings use individual team colors when provider records are available', async ({ page }) => {
	await page.goto('/');
	const afc = page.getByRole('region', { name: 'AFC standings snapshot' });
	const teams = afc.locator('a.record-list__team');

	if (await teams.count() >= 2) {
		const firstColor = await teams.nth(0).getAttribute('style');
		const secondColor = await teams.nth(1).getAttribute('style');
		expect(firstColor).toBeTruthy();
		expect(secondColor).toBeTruthy();
		expect(firstColor).not.toBe(secondColor);
	} else {
		await expect(page.getByText('Records will take shape after the first final.')).toBeVisible();
	}
});

test('dashboard game cards receive a subtle Motion hover lift', async ({ page }) => {
	await page.goto('/');
	const card = page.locator('[data-motion-hover]').first();
	await card.scrollIntoViewIfNeeded();
	const initialY = await card.evaluate((element) => element.getBoundingClientRect().y);
	await card.hover();

	await expect.poll(() => card.evaluate((element) => element.getBoundingClientRect().y)).toBeLessThan(initialY);
});

test('player profile displays current provider stats', async ({ page }) => {
	await page.goto('/players/00-0033873');

	await expect(page.getByText('SEASON 2026')).toBeVisible();
	await expect(page.getByText('Passing yards', { exact: true })).toBeVisible();
	await expect(page.locator('.performance-feature__value')).toHaveText('1,037');
	await expect(page.getByRole('img', { name: /Completion rate/ })).toBeVisible();
	await expect(page.locator('.stat-list__item').filter({ hasText: 'Passing TDs' })).toContainText('9');
});

test('player with no current-season line shows the latest available season stats', async ({ page }) => {
	await page.goto('/players/00-0036212');

	await expect(page.getByText('SEASON 2025')).toBeVisible();
	await expect(page.locator('.performance-feature__value')).toHaveText('2,660');
});

test('player stat presentation remains visible with reduced motion enabled', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/players/00-0033873');
	await page.locator('[data-featured-stat]').scrollIntoViewIfNeeded();

	await expect(page.locator('.performance-feature__value')).toBeVisible();
	await expect(page.getByRole('img', { name: /Completion rate/ })).toBeVisible();
});

test('player stats animate into view without client errors', async ({ page }) => {
	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	await page.goto('/players/00-0033873');
	const feature = page.locator('[data-featured-stat]');
	await feature.scrollIntoViewIfNeeded();

	await expect(feature).toHaveCSS('opacity', '1');
	expect(pageErrors).toEqual([]);
});

test('player search results show provider-backed profiles', async ({ page }) => {
	await page.goto('/?player=Patrick%20Mahomes#players');

	await expect(page.getByRole('heading', { name: 'Find your player.' })).toBeVisible();
	await expect(page.getByRole('link', { name: /Patrick Mahomes/ }).first()).toBeVisible();
});

test('player search suggests close matches and stays near the search', async ({ page }) => {
	await page.goto('/');
	const search = page.getByRole('searchbox', { name: 'Search NFL player names' });
	await search.scrollIntoViewIfNeeded();
	await search.fill('Pattrick Mahmoes');
	await search.press('Enter');

	await expect(page).toHaveURL(/#players$/);
	await expect(page.getByText('Closest matches for “Pattrick Mahmoes”', { exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: /Patrick Mahomes/ }).first()).toBeVisible();
	await expect(page.locator('#players')).toBeInViewport();
});

test('player directory search keeps its search form in view after submit', async ({ page }) => {
	await page.goto('/players');
	const search = page.getByRole('searchbox', { name: 'Search NFL players' });
	await search.scrollIntoViewIfNeeded();
	await search.fill('Pattrick Mahmoes');
	await search.press('Enter');

	await expect(page).toHaveURL(/#player-search-form$/);
	await expect(page.getByRole('heading', { name: 'Closest matches for “Pattrick Mahmoes”' })).toBeVisible();
	await expect(page.locator('#player-search-form')).toBeInViewport();
});

test('dashboard fits a narrow mobile viewport without horizontal overflow', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');

	await expect(page.getByRole('navigation', { name: 'Jump to a dashboard feature' })).toBeVisible();
	const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
	expect(documentWidth).toBeLessThanOrEqual(390);
});
