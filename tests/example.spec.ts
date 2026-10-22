import { expect, test } from '@playwright/test';

const liveGameKickoff = new Date();
liveGameKickoff.setUTCDate(liveGameKickoff.getUTCDate() + 2);
liveGameKickoff.setUTCHours(19, 0, 0, 0);
const liveGameKickoffAt = liveGameKickoff.toISOString();

test('compact home brings games, standings, and player search together', async ({ browser }) => {
	const context = await browser.newContext({ timezoneId: 'Europe/Paris' });
	const page = await context.newPage();
	await page.goto('/');

	await expect(page).toHaveTitle(/NFL dashboard \| Gridiron Atlas/);
	await expect(page.getByRole('heading', { name: 'Every game. One place.' })).toBeVisible();
	await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png');
	await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
	const manifestResponse = await page.request.get('/manifest.webmanifest');
	expect(manifestResponse.ok()).toBe(true);
	expect(await manifestResponse.json()).toMatchObject({
		name: 'Gridiron Atlas',
		display: 'standalone',
		icons: [
			{ src: '/app-icon-192.png', sizes: '192x192' },
			{ src: '/app-icon-512.png', sizes: '512x512' },
		],
	});
	await expect(page.locator('.dashboard-hero__copy')).toHaveAttribute('data-motion-played', 'true');
	await expect(page.locator('.hero-score')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Next session starts in' })).toBeVisible();
	await expect(page.locator('[data-countdown]')).toHaveText(/^\d+:\d{2}:\d{2}$/);
	await expect(page.locator('[data-session-matchups]')).not.toHaveText(/^\d+ games?$/);
	const completedCard = page.locator('.game-card[href="/games/past-game-no-kickoff"]');
	await expect(completedCard).toHaveCount(1);
	await expect(completedCard.locator('.game-status')).toHaveText(/Final/);
	await expect(page.locator('.game-card').filter({ hasText: 'Kickoff time pending' })).toHaveCount(0);
	const scheduleKickoff = page.locator('.game-row__meta').first();
	await expect(scheduleKickoff).toHaveCSS('text-align', 'right');
	const kickoffTime = page.locator('time[data-device-time]').first();
	await expect(kickoffTime).not.toHaveText('Kickoff time');
	expect(await kickoffTime.evaluate((element) => {
		const time = element as HTMLTimeElement;
		return time.textContent === new Intl.DateTimeFormat(undefined, {
			hour: 'numeric',
			minute: '2-digit',
		}).format(new Date(time.dateTime));
	})).toBe(true);
	await expect(kickoffTime).not.toContainText(/EDT|EST|GMT|UTC|PDT|PST/);
	const compactDate = page.locator('time[data-device-game-date]').first();
	await expect(compactDate).toHaveText(/^[A-Z]{3} · [A-Z]{3} \d{1,2}$/);
	await expect(compactDate).not.toContainText(/AM|PM|EDT|EST|GMT|UTC/);
	expect(await compactDate.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(14);
	expect(await page.locator('time[data-device-time]').evaluateAll((times) =>
		times.every((element) => {
			const time = element as HTMLTimeElement;
			return time.textContent === new Intl.DateTimeFormat(undefined, {
				hour: 'numeric',
				minute: '2-digit',
			}).format(new Date(time.dateTime)) && !/EDT|EST|GMT|UTC|PDT|PST/.test(time.textContent ?? '');
		}),
	)).toBe(true);
	expect(
		await page.locator('[data-next-session]').evaluate((element) => {
			const sessions = JSON.parse(element.getAttribute('data-sessions') ?? '[]');
			return Array.isArray(sessions) && sessions.length > 0;
		}),
	).toBe(true);
	await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link')).toHaveCount(3);
	await expect(page.locator('.mobile-nav a')).toHaveCount(4);
	await expect(page.locator('.quick-nav')).toHaveCount(0);
	await expect(page.locator('.header-search')).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Games', exact: true })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'The soonest games' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'See who’s climbing.' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Find your player.' })).toBeVisible();
	await expect(page.locator('#matchups')).toHaveCount(0);
	await expect(page.getByRole('searchbox', { name: 'Search NFL player names' })).toBeVisible();
	await expect(page.locator('#team-filter-desktop option[value="JAX"]')).toHaveText('Jacksonville Jaguars');
	expect(await page.locator('.schedule-toolbar--desktop').evaluate((element) =>
		(element as HTMLElement).getBoundingClientRect().width,
	)).toBeLessThan(700);
	await expect(page.locator('.game-card .calendar-menu')).toHaveCount(0);
	await expect(page.locator('.upcoming-game .calendar-menu')).toHaveCount(0);

	await page.goto('/games/example-game');
	await expect(page.getByRole('heading', { name: 'Before kickoff' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Matchup briefing' })).toBeVisible();
	await expect(page.locator('.team-context-card')).toHaveCount(2);
	await expect(page.locator('.team-context-card').first()).toContainText('0-1');
	await expect(page.locator('.team-context-card').first()).toContainText('L 13-17 vs Jacksonville Jaguars');
	await expect(page.locator('.series-card')).toContainText('Last 3 seasons');
	await expect(page.locator('.series-card')).toContainText('PHI 0–1 JAX');
	await expect(page.locator('.series-card')).toContainText('1 meeting in provider data');
	await expect(page.getByRole('heading', { name: 'EverBank Stadium' })).toBeVisible();
	await expect(page.getByRole('img', { name: 'Top-down illustration of EverBank Stadium, home of the Jacksonville Jaguars in Jacksonville, Florida' })).toBeVisible();
	await expect(page.locator('.stadium-diagram').first()).toContainText('JAX');
	const calendarMenu = page.locator('.calendar-menu');
	await expect(calendarMenu.locator('summary')).toHaveText('Add to calendar');
	await expect(calendarMenu.locator('.calendar-menu__options')).toBeHidden();
	await calendarMenu.locator('summary').click();
	const googleCalendarLink = calendarMenu.getByRole('link', { name: 'Google Calendar' });
	const appleCalendarLink = calendarMenu.getByRole('link', { name: 'Apple Calendar (.ics)' });
	await expect(googleCalendarLink).toHaveAttribute('href', /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
	await expect(appleCalendarLink).toHaveAttribute('download', 'nfl-game-example-game.ics');
	const googleUrl = new URL((await googleCalendarLink.getAttribute('href'))!);
	expect(googleUrl.searchParams.get('text')).toBe('Philadelphia Eagles at Jacksonville Jaguars');
	const calendarResponse = await page.request.get((await appleCalendarLink.getAttribute('href'))!);
	expect(calendarResponse.ok()).toBe(true);
	expect(calendarResponse.headers()['content-type']).toContain('text/calendar');
	expect(await calendarResponse.text()).toContain('SUMMARY:Philadelphia Eagles at Jacksonville Jaguars');
	await page.goto('/games/past-game-no-kickoff');
	await expect(page.getByRole('heading', { name: 'Final result' })).toBeVisible();
	await expect(page.locator('.game-snapshot__summary')).toContainText('Kansas City Chiefs won by 7');
	await expect(page.locator('.venue-banner')).toBeVisible();
	expect(await page.locator('[data-live-boxscore]').evaluate((element) =>
		Boolean(element.compareDocumentPosition(document.querySelector('.venue-banner')!) & Node.DOCUMENT_POSITION_FOLLOWING),
	)).toBe(true);
	await expect(page.getByRole('img', { name: 'Top-down illustration of Arrowhead Stadium, home of the Kansas City Chiefs in Kansas City, Missouri' })).toBeVisible();
	await expect(page.locator('.stadium-diagram').first()).toContainText('KC');
	await expect(page.locator('.calendar-menu')).toHaveCount(0);

	await page.goto('/');
	await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Standings' }).click();
	await expect(page).toHaveURL(/#standings$/);
	await context.close();
});

test('publishes canonical, social, and answer-engine metadata', async ({ page }) => {
	await page.goto('/?week=1');

	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://gridironatlas.app/');
	await expect(page.locator('meta[name="author"]')).toHaveAttribute('content', 'Hubert Kozlowski');
	await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /max-image-preview:large/);
	await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
		'content',
		'https://gridironatlas.app/social-card.png',
	);
	await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');

	const graph = await page.locator('script[type="application/ld+json"]').evaluate((element) =>
		JSON.parse(element.textContent ?? '{}')['@graph'],
	);
	expect(graph).toEqual(expect.arrayContaining([
		expect.objectContaining({
			'@type': 'Person',
			name: 'Hubert Kozlowski',
			sameAs: ['https://github.com/hubert-kozlowski'],
		}),
		expect.objectContaining({
			'@type': 'WebSite',
			name: 'Gridiron Atlas',
			author: { '@id': 'https://gridironatlas.app/#author' },
		}),
		expect.objectContaining({
			'@type': 'WebPage',
			url: 'https://gridironatlas.app/',
			author: { '@id': 'https://gridironatlas.app/#author' },
		}),
	]));

	const robots = await page.request.get('/robots.txt');
	expect(robots.ok()).toBe(true);
	expect(await robots.text()).toContain('Sitemap: https://gridironatlas.app/sitemap-index.xml');
});

test('global styles load after a direct query navigation', async ({ page }) => {
	const failedStylesheets: string[] = [];
	page.on('requestfailed', (request) => {
		if (request.resourceType() === 'stylesheet') failedStylesheets.push(request.url());
	});

	for (const load of [() => page.goto('/?week=1#schedule'), () => page.reload()]) {
		await load();
		await expect(page.locator('#schedule .section-heading h2')).toHaveCSS('font-size', '25px');
	}
	expect(failedStylesheets).toEqual([]);
});

test('dashboard entrance motion is skipped for reduced-motion users', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/');
	await expect(page.locator('.dashboard-hero__copy')).toBeVisible();
	await expect(page.locator('.dashboard-hero__copy')).not.toHaveAttribute('data-motion-played', 'true');
});

test('game detail entrance and stadium reveal avoid layout shifts', async ({ page }) => {
	await page.goto('/games/example-game');
	await expect(page.locator('.game-hero')).toHaveAttribute('data-motion-played', 'true');
	const venue = page.locator('.venue-banner');
	const venueLayoutTop = await venue.evaluate((element) => (element as HTMLElement).offsetTop);
	await venue.scrollIntoViewIfNeeded();
	await expect(venue).toHaveAttribute('data-motion-played', 'true');
	const outline = venue.locator('[data-motion-stadium-outline]');
	await expect.poll(() => outline.evaluate((path) => getComputedStyle(path).strokeDashoffset)).toBe('0px');
	await expect.poll(() => outline.evaluate((path) => (path as SVGPathElement).style.strokeDasharray)).toBe('');
	await expect(page.getByRole('heading', { name: 'EverBank Stadium' })).toBeVisible();
	expect(await venue.evaluate((element) => (element as HTMLElement).offsetTop)).toBe(venueLayoutTop);
});

test('scheduled game detail keeps the center status compact after live polling', async ({ page }) => {
	await page.route('**/api/live/games?date=*', async (route) => {
		await route.fulfill({
			json: {
				games: [{
					eventId: 'scheduled-example',
					kickoffAt: liveGameKickoffAt,
					homeTeam: 'JAX',
					awayTeam: 'PHI',
					homeScore: 0,
					awayScore: 0,
					state: 'scheduled',
					status: 'Thu, October 22nd at 8:15 PM EDT',
					period: null,
					clock: null,
					boxScoreUpdatedAt: null,
					lastPlay: null,
					notice: null,
					situation: null,
					boxScore: [],
				}],
				fetchedAt: new Date().toISOString(),
				stale: false,
			},
		});
	});
	await page.goto('/games/example-game');
	await expect(page.locator('[data-game-live-status]')).toHaveText('SCHEDULED');
	await expect(page.locator('[data-game-live-status]')).not.toContainText(/October|EDT|8:15/);
	await expect(page.locator('.game-hero__date time')).not.toHaveText('Kickoff time');
});

test('stadium label stays clear and architectural strokes stay within the outline', async ({ page }) => {
	await page.goto('/games/example-game');
	const diagram = page.locator('.stadium-diagram');

	for (const width of [390, 1440]) {
		await page.setViewportSize({ width, height: 900 });
		const spacing = await diagram.evaluate((element) => {
			const label = element.querySelector('text')!.getBoundingClientRect();
			const outline = element.querySelector('[data-motion-stadium-outline]')!.getBoundingClientRect();
			return label.bottom < outline.top;
		});
		expect(spacing, `Stadium label overlaps at ${width}px`).toBe(true);
		await expect(diagram.locator('.stadium-architecture').locator('..')).toHaveAttribute(
			'clip-path',
			'url(#stadium-outline-clip)',
		);
	}
});

test('game detail matchup cards frame each team and keep the score between them', async ({ page }) => {
	await page.goto('/games/example-game');

	for (const viewport of [
		{ width: 320, height: 720 },
		{ width: 360, height: 800 },
		{ width: 390, height: 844 },
		{ width: 560, height: 900 },
		{ width: 561, height: 900 },
		{ width: 768, height: 900 },
		{ width: 1024, height: 900 },
		{ width: 1440, height: 900 },
		{ width: 1920, height: 1080 },
	]) {
		await page.setViewportSize(viewport);
		await page.locator('.game-status').evaluate((element) => {
			element.textContent = 'Sunday Night Football · 8:20 PM ET';
		});
		const minimumCardWidth = viewport.width < 380 ? 70 : 100;
		const matchup = page.locator('.game-matchup');
		const away = matchup.locator('.game-side').first();
		const score = matchup.locator('.game-score');
		const home = matchup.locator('.game-side').last();

		await expect(away).toBeVisible();
		await expect(home).toBeVisible();
		await expect(score).toBeVisible();
		const awayGeometry = await away.evaluate((element) => {
			const card = element.getBoundingClientRect();
			const mark = element.querySelector('.team-mark')!.getBoundingClientRect();
			return {
				cardWidth: card.width,
				cardHeight: card.height,
				cardLeft: card.left,
				cardRight: card.right,
				markLeft: mark.left,
				markRight: mark.right,
			};
		});
		expect(awayGeometry.cardWidth, `Away card at ${viewport.width}px`).toBeGreaterThanOrEqual(minimumCardWidth);
		expect(awayGeometry.cardHeight, `Away card at ${viewport.width}px`).toBeGreaterThanOrEqual(120);
		expect(awayGeometry.cardLeft).toBeLessThan(awayGeometry.markLeft);
		expect(awayGeometry.cardRight).toBeGreaterThan(awayGeometry.markRight);
		expect(await home.evaluate((element, minimumWidth) => {
			const card = element.getBoundingClientRect();
			const mark = element.querySelector('.team-mark')!.getBoundingClientRect();
			return card.width >= minimumWidth && card.height >= 120 && card.left < mark.left && card.right > mark.right;
		}, minimumCardWidth)).toBe(true);
		expect(await matchup.evaluate((element) => {
			const [awayCard, scoreCard, homeCard] = Array.from(
				element.querySelectorAll<HTMLElement>('.game-side, .game-score'),
			).map((item) => item.getBoundingClientRect());
			const bounds = element.getBoundingClientRect();
			const teamLabelsFitCards = Array.from(element.querySelectorAll('.game-side')).every((card) => {
				const cardBounds = card.getBoundingClientRect();
				const labelBounds = card.querySelector('strong')!.getBoundingClientRect();
				return labelBounds.left >= cardBounds.left && labelBounds.right <= cardBounds.right;
			});
			const scoreContents = Array.from(element.querySelectorAll('.game-score > *')).map((content) =>
				content.getBoundingClientRect(),
			);
			return scoreCard.width <= 112
				&& awayCard.left >= bounds.left
				&& homeCard.right <= bounds.right
				&& awayCard.right < scoreCard.left
				&& scoreCard.right < homeCard.left
				&& teamLabelsFitCards
				&& scoreContents.every((content) => content.left >= scoreCard.left && content.right <= scoreCard.right);
		})).toBe(true);
	}
});

test('game detail animations are skipped when reduced motion is enabled', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/games/example-game');
	await expect(page.locator('.game-hero')).toBeVisible();
	await expect(page.locator('.venue-banner')).toBeVisible();
	await expect(page.locator('.game-hero')).not.toHaveAttribute('data-motion-played', 'true');
	await expect(page.locator('.venue-banner')).not.toHaveAttribute('data-motion-played', 'true');
	const outline = page.locator('[data-motion-stadium-outline]');
	expect(await outline.evaluate((path) => (path as SVGPathElement).style.strokeDasharray)).toBe('');
});

test('calendar actions disappear when kickoff arrives', async ({ page }) => {
	await page.clock.install();
	await page.goto('/games/example-game');

	const calendarMenu = page.locator('.calendar-menu');
	await expect(calendarMenu).toBeVisible();
	const startsAt = await calendarMenu.getAttribute('data-calendar-starts-at');
	expect(startsAt).not.toBeNull();
	const delay = Date.parse(startsAt!) - await page.evaluate(() => Date.now());

	await page.clock.fastForward(delay + 1);
	await expect(calendarMenu).toBeHidden();
});

test('completed game details keep the final provider box score visible', async ({ page }) => {
	await page.route('**/api/live/games?date=*', async (route) => {
		await route.fulfill({
			json: {
				fetchedAt: '2026-10-12T13:00:00.000Z',
				stale: false,
				games: [{
					eventId: 'final-buf-kc',
					kickoffAt: '2026-10-09T20:00:00.000Z',
					homeTeam: 'KC',
					awayTeam: 'BUF',
					homeScore: 24,
					awayScore: 17,
					state: 'final',
					status: 'Final',
					period: 4,
					clock: '0:00',
					boxScoreUpdatedAt: '2026-10-09T23:00:00.000Z',
					lastPlay: null,
					situation: null,
					moment: null,
					notice: null,
					boxScore: [{
						team: 'KC',
						stats: [{ label: 'Total Yards', value: '350' }],
						categories: [{
							name: 'passing',
							labels: ['C/ATT', 'YDS'],
							athletes: [{ name: 'Patrick Mahomes', stats: ['22/30', '280'] }],
						}],
					}],
				}],
			},
		});
	});

	await page.goto('/games/past-game-no-kickoff');

	const boxScore = page.locator('[data-live-boxscore]');
	await expect(boxScore).toBeVisible();
	await expect(boxScore.locator('[data-boxscore-details]')).not.toHaveAttribute('open');
	await expect(boxScore.getByRole('heading', { name: 'Final game stats' })).toBeVisible();
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await boxScore.locator('summary').evaluate((element) => {
		const title = element.querySelector('h2');
		return title && title.scrollWidth <= title.clientWidth && element.scrollWidth <= element.clientWidth;
	})).toBe(true);
	await boxScore.locator('summary').click();
	await expect(boxScore.locator('[data-boxscore-details]')).toHaveAttribute('open');
	await expect(boxScore).toContainText('Total Yards');
	await expect(boxScore).toContainText('Patrick Mahomes');
	await expect(boxScore).toContainText('22/30');
	await expect(page.locator('[data-snapshot-summary]')).toContainText('Kansas City Chiefs won by 7');
});

test('game detail snapshot and statistics update from the live feed', async ({ page }) => {
	let requests = 0;
	await page.route('**/api/live/games?date=*', async (route) => {
		requests += 1;
		const final = requests > 1;
		await route.fulfill({
			json: {
				fetchedAt: '2026-10-14T13:00:00.000Z',
				stale: false,
				games: [{
					eventId: 'live-phi-jax-detail',
					kickoffAt: liveGameKickoffAt,
					homeTeam: 'JAX',
					awayTeam: 'PHI',
					homeScore: final ? 21 : 14,
					awayScore: final ? 17 : 10,
					state: final ? 'final' : 'in_progress',
					status: final ? 'Final' : '2nd Quarter',
					period: final ? 4 : 2,
					clock: final ? '0:00' : '8:42',
					boxScoreUpdatedAt: '2026-10-14T14:00:00.000Z',
					lastPlay: null,
					situation: final
						? null
						: { downDistance: '1st & 10', possession: 'JAX', redZone: false, yardLine: 0, direction: 'left' },
					moment: null,
					notice: null,
					boxScore: [{
						team: 'JAX',
						stats: [{ label: 'Total Yards', value: '220' }],
						categories: [],
					}],
				}],
			},
		});
	});

	await page.goto('/games/example-game');

	await expect(page.locator('[data-snapshot-title]')).toHaveText('Game in progress');
	await expect(page.locator('[data-snapshot-eyebrow]')).toHaveText('LIVE UPDATE');
	await expect(page.locator('[data-snapshot-summary]')).toContainText('Philadelphia Eagles 10 · Jacksonville Jaguars 14');
	const stadiumBall = page.locator('[data-stadium-live-ball]');
	await expect(stadiumBall).toBeVisible();
	await expect(stadiumBall).toHaveAttribute('transform', 'translate(114.0 0)');
	await expect(page.locator('[data-stadium-field]')).toHaveAttribute('x', '96');
	await expect(page.locator('[data-stadium-field]')).toHaveAttribute('width', '168');
	await expect(stadiumBall).toHaveAttribute(
		'aria-label',
		'Live ball position, provider coordinate 0 from left goal line, offense moving left',
	);
	await expect(stadiumBall.locator('circle')).toHaveCount(0);
	await expect(stadiumBall.locator('[data-stadium-live-ball-marker]')).toHaveAttribute('d', 'M4 89 -3 95 4 101');
	await expect(page.locator('[data-live-boxscore]')).toBeVisible();
	await expect(page.locator('[data-live-boxscore]')).toContainText('Total Yards');
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await expect.poll(() => requests).toBeGreaterThan(1);
	await expect(page.locator('[data-snapshot-title]')).toHaveText('Final result');
	await expect(page.locator('[data-snapshot-eyebrow]')).toHaveText('THE RESULT');
	await expect(page.locator('[data-snapshot-summary]')).toContainText('Jacksonville Jaguars won by 4');
	await expect(stadiumBall).toBeHidden();
	await expect(page.locator('[data-boxscore-title]')).toHaveText('Final game stats');
});

test('home live strip shows only the leading matchup and hides expanded field detail', async ({ page }) => {
	let apiRequests = 0;
	const games = [
		{
			eventId: 'live-leading-game', kickoffAt: '2026-10-11T13:00:00.000Z', homeTeam: 'JAX', awayTeam: 'PHI',
			homeScore: 14, awayScore: 10, state: 'in_progress', status: '2nd Quarter', period: 2, clock: '8:42',
			boxScoreUpdatedAt: null, lastPlay: null, notice: null,
			situation: { downDistance: '2nd & 4', possession: 'JAX', redZone: false, yardLine: 46, direction: 'right' }, boxScore: [],
		},
		{
			eventId: 'live-secondary-game', kickoffAt: '2026-10-11T13:05:00.000Z', homeTeam: 'DAL', awayTeam: 'TB',
			homeScore: 7, awayScore: 3, state: 'in_progress', status: '1st Quarter', period: 1, clock: '4:19',
			boxScoreUpdatedAt: null, lastPlay: null, notice: null, situation: null, boxScore: [],
		},
	];
	await page.route('**/api/live/games', async (route) => {
		apiRequests += 1;
		await route.fulfill({ json: { fetchedAt: '2026-10-11T14:00:00.000Z', stale: false, games } });
	});
	await page.goto('/');

	const liveCenter = page.locator('[data-live-center]');
	await expect(liveCenter).toBeVisible();
	await expect(liveCenter).toHaveAttribute('data-live-layout', 'summary');
	await expect(liveCenter.locator('.live-game-row')).toHaveCount(1);
	await expect(liveCenter.locator('.live-game-row')).toContainText('PHI');
	await expect(liveCenter.locator('.live-game-row')).toContainText('JAX');
	await expect(liveCenter.locator('.live-game-row__field')).toHaveCount(0);
	await expect(liveCenter.locator('.live-game-row__collapse-toggle')).toHaveCount(0);
	await expect(page.locator('[data-next-session-shell]')).toBeHidden();
	expect(await liveCenter.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(80);

	games[0].clock = '8:10';
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await expect.poll(() => apiRequests).toBeGreaterThan(1);
	await expect(liveCenter.locator('.live-game-row__clock')).toHaveText('Q2 · 8:10');
});

test('game detail touchdown motion leads into the scoring team score reveal', async ({ page }) => {
	let apiRequests = 0;
	const game = {
		eventId: 'live-phi-jax-touchdown-detail',
		kickoffAt: liveGameKickoffAt,
		homeTeam: 'JAX',
		awayTeam: 'PHI',
		homeScore: 14,
		awayScore: 10,
		state: 'in_progress',
		status: '3rd Quarter',
		period: 3,
		clock: '8:42',
		boxScoreUpdatedAt: null,
		lastPlay: { id: 'detail-play-1', text: 'Rush for 3 yards', scoring: false, keyAction: false },
		situation: null,
		moment: null,
		notice: null,
		boxScore: [],
	};
	await page.route('**/api/live/games?date=*', async (route) => {
		apiRequests += 1;
		await route.fulfill({
			json: {
				fetchedAt: '2026-10-14T14:00:00.000Z',
				stale: false,
				games: [game],
			},
		});
	});

	await page.goto('/games/example-game');
	const liveCenter = page.locator('[data-live-center]');
	await expect(liveCenter).toBeVisible();
	await expect(page.locator('[data-live-game-score]')).toContainText('10');
	await expect(page.locator('[data-live-game-score]')).toContainText('14');

	game.homeScore = 21;
	game.lastPlay = {
		id: 'detail-play-2',
		text: 'Touchdown pass to the end zone',
		scoring: true,
		keyAction: true,
	};
	const requestsBeforeTouchdown = apiRequests;
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await expect.poll(() => apiRequests).toBeGreaterThan(requestsBeforeTouchdown);
	const row = liveCenter.locator('.live-game-row');
	await expect(row.locator('.live-event-alert__title')).toHaveText('TOUCHDOWN');
	await expect(row).toHaveAttribute('data-touchdown-motion', 'impact');
	const heroScore = page.locator('[data-live-game-score]');
	await expect(heroScore).toHaveAttribute('data-touchdown-scoring-team', 'JAX');
	await expect(heroScore).toHaveAttribute('data-touchdown-event-id', 'live-phi-jax-touchdown-detail');
	await expect(heroScore).toContainText('21');
	await expect(row).toHaveAttribute('data-touchdown-motion', 'score-reveal');
	await expect(heroScore.locator('[data-score-team="JAX"]')).toBeVisible();
});

test('touchdown content remains visible without motion for reduced-motion users', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	let apiRequests = 0;
	const game = {
		eventId: 'live-reduced-motion-touchdown',
		kickoffAt: '2026-10-11T13:00:00.000Z',
		homeTeam: 'JAX',
		awayTeam: 'PHI',
		homeScore: 0,
		awayScore: 0,
		state: 'in_progress',
		status: '1st Quarter',
		period: 1,
		clock: '4:19',
		boxScoreUpdatedAt: null,
		lastPlay: { id: 'reduced-play-1', text: 'Rush for no gain', scoring: false, keyAction: false },
		situation: null,
		moment: null,
		notice: null,
		boxScore: [],
	};
	await page.route('**/api/live/games', async (route) => {
		apiRequests += 1;
		await route.fulfill({
			json: { fetchedAt: '2026-10-11T14:00:00.000Z', stale: false, games: [game] },
		});
	});
	await page.goto('/');

	game.homeScore = 7;
	game.lastPlay = {
		id: 'reduced-play-2',
		text: 'Touchdown run into the end zone',
		scoring: true,
		keyAction: true,
	};
	const requestsBeforeTouchdown = apiRequests;
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await expect.poll(() => apiRequests).toBeGreaterThan(requestsBeforeTouchdown);
	const row = page.locator('.live-game-row');
	await expect(row.locator('.live-event-alert__title')).toHaveText('TOUCHDOWN');
	await expect(row.locator('.live-event-alert__score')).toHaveText('PHI 0 – JAX 7');
	await expect(row).not.toHaveAttribute('data-touchdown-motion');
	await expect(row.locator('.live-event-alert')).toHaveCSS('animation-name', 'none');
});

test('game page shows live team and player stats without collapsing categories', async ({ page }) => {
	await page.route('**/api/live/games', async (route) => {
		await route.fulfill({
			json: {
				fetchedAt: '2026-10-11T14:00:00.000Z',
				stale: false,
				games: [{
					eventId: 'live-detail-fixture',
					kickoffAt: '2026-10-11T13:00:00.000Z',
					homeTeam: 'JAX',
					awayTeam: 'PHI',
					homeScore: 14,
					awayScore: 10,
					state: 'in_progress',
					status: '2nd Quarter',
					period: 2,
					clock: '8:42',
					boxScoreUpdatedAt: '2026-10-11T13:59:45.000Z',
					lastPlay: null,
					situation: { downDistance: '3rd & 4', possession: 'KC', redZone: false, yardLine: 34, direction: 'right' },
					boxScore: [
						{
							team: 'JAX',
							stats: [{ label: 'Total Yards', value: '250' }, { label: 'First Downs', value: '12' }],
							categories: [{
								name: 'passing',
								labels: ['C/ATT', 'YDS', 'TD'],
								athletes: [{ name: 'Patrick Mahomes', stats: ['15/20', '180', '2'] }],
							}],
						},
						{
							team: 'PHI',
							stats: [{ label: 'Total Yards', value: '190' }],
							categories: [{
								name: 'rushing',
								labels: ['CAR', 'YDS'],
								athletes: [{ name: 'James Cook', stats: ['8', '42'] }],
							}],
						},
					],
				}],
			},
		});
	});
	await page.goto('/');
	await page.evaluate(() => {
		const liveCenter = document.querySelector<HTMLElement>('[data-live-center]');
		if (!liveCenter) throw new Error('Live center is not present on the home page.');
		liveCenter.dataset.liveLayout = 'game-detail';
		liveCenter.dataset.gameHome = 'JAX';
		liveCenter.dataset.gameAway = 'PHI';
		document.dispatchEvent(new Event('visibilitychange'));
		const boxScore = document.createElement('section');
		for (const attribute of liveCenter.attributes) {
			if (attribute.name.startsWith('data-astro-cid-')) boxScore.setAttribute(attribute.name, '');
		}
		boxScore.className = 'live-boxscore';
		boxScore.dataset.liveBoxscore = '';
		boxScore.dataset.gameHome = 'JAX';
		boxScore.dataset.gameAway = 'PHI';
		boxScore.hidden = true;
		boxScore.innerHTML = '<div class="live-boxscore__header"><div><p class="eyebrow">LIVE BOX SCORE</p><h2>Live game stats</h2></div><span data-live-updated></span></div><div data-live-stats></div>';
		document.body.append(boxScore);
		document.dispatchEvent(new Event('visibilitychange'));
	});
	await expect(page.locator('[data-live-center] .live-game-row__field')).toHaveCount(0);
	await expect(page.locator('[data-live-center] .live-game-row__collapse-toggle')).toHaveCount(0);
	const liveStats = page.locator('.live-boxscore');
	await expect(liveStats).toBeVisible();
	await expect(liveStats.getByRole('heading', { name: 'Live game stats' })).toBeVisible();
	await expect(liveStats.locator('.live-boxscore__team')).toHaveCount(2);
	await expect(liveStats.locator('.live-boxscore__totals').first()).toContainText('Total Yards');
	await expect(liveStats.locator('.live-boxscore__totals').first()).toContainText('250');
	await expect(liveStats.locator('.live-boxscore__table tbody tr')).toHaveCount(2);
	await expect(liveStats.locator('.live-boxscore__category').nth(0)).toContainText('Patrick Mahomes');
	await expect(liveStats.locator('.live-boxscore__category').nth(1)).toContainText('James Cook');
	await expect(liveStats.locator('details, summary')).toHaveCount(0);
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

	await page.goto('/games/past-game-no-kickoff');
	await expect(page.locator('.game-hero__date')).toHaveText('Final');
	await expect(page.locator('.game-hero__date')).not.toContainText('Kickoff time pending');

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

test('mobile team filter opens as a focusable sheet and closes with Escape', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	await page.locator('[data-team-filter-open]').click();
	const dialog = page.locator('[data-team-filter-dialog]');
	await expect(dialog).toBeVisible();
	expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
	await expect(dialog.locator('select')).toHaveCount(0);
	const jaguars = dialog.getByRole('radio', { name: /JAX.*Jacksonville Jaguars/ });
	await jaguars.check();
	await expect(jaguars).toBeChecked();
	await dialog.getByRole('button', { name: 'Apply filter' }).click();
	await expect(page).toHaveURL(/team=JAX/);
	await page.locator('[data-team-filter-open]').click();
	await expect(dialog).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
});

test('team comparison handles empty, invalid, same-team, and populated matchups', async ({ page }) => {
	await page.goto('/compare');
	await expect(page.getByText('Pick a matchup')).toBeVisible();

	await page.goto('/compare?team1=BUF&team2=BUF');
	await expect(page.getByRole('alert')).toHaveText('Choose two different teams.');

	await page.goto('/compare?team1=BAD&team2=KC');
	await expect(page.getByRole('alert')).toHaveText('Choose teams from the NFL directory.');

	await page.goto('/compare?team1=BUF&team2=KC');
	await expect(page.getByRole('heading', { name: /\d+–\d+/ })).toBeVisible();
	await expect(page.locator('.comparison-games .game-row')).toHaveCount(1);
});

test('compact app fits target viewports without horizontal overflow', async ({ page }) => {
	for (const viewport of [
		{ width: 320, height: 720 },
		{ width: 390, height: 844 },
		{ width: 768, height: 900 },
		{ width: 1024, height: 900 },
		{ width: 1440, height: 900 },
	]) {
		await page.setViewportSize(viewport);
		await page.goto('/');
		const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
		expect(documentWidth, `horizontal overflow at ${viewport.width}px`).toBeLessThanOrEqual(viewport.width);
	}

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto('/');
	await expect(page.getByRole('navigation', { name: 'App navigation' })).toBeVisible();
	const mobileMoreAlignment = await page.locator('.mobile-more summary').evaluate((summary) => {
		const label = summary.firstChild instanceof Text ? summary : null;
		const chevron = summary.querySelector('.menu-chevron')?.getBoundingClientRect();
		const bounds = summary.getBoundingClientRect();
		return { hasText: Boolean(label?.textContent?.trim()), chevronCenter: chevron ? chevron.top + chevron.height / 2 : 0, controlCenter: bounds.top + bounds.height / 2 };
	});
	expect(mobileMoreAlignment.hasText).toBe(true);
	expect(Math.abs(mobileMoreAlignment.chevronCenter - mobileMoreAlignment.controlCenter)).toBeLessThan(2);
	const teamFilterAlignment = await page.locator('[data-team-filter-open]').evaluate((button) => {
		const label = button.querySelector('span:first-child')!.getBoundingClientRect();
		const chevron = button.querySelector('.control-chevron')!.getBoundingClientRect();
		return { labelCenter: label.top + label.height / 2, chevronCenter: chevron.top + chevron.height / 2, height: button.getBoundingClientRect().height };
	});
	expect(Math.abs(teamFilterAlignment.labelCenter - teamFilterAlignment.chevronCenter)).toBeLessThan(2);
	expect(teamFilterAlignment.height).toBeGreaterThanOrEqual(44);
	const compactControlTargets = await page.locator('.schedule-toolbar--mobile button, .schedule-toolbar--mobile select, .mobile-more summary').evaluateAll((controls) =>
		controls.map((control) => control.getBoundingClientRect().height),
	);
	expect(compactControlTargets.every((height) => height >= 44)).toBe(true);
	const visualFilterHeight = await page.locator('[data-team-filter-open]').evaluate((button) =>
		Number.parseFloat(getComputedStyle(button, '::before').height),
	);
	expect(visualFilterHeight).toBeLessThanOrEqual(28);
	const weekFilter = page.locator('#week-filter-mobile');
	await weekFilter.focus();
	const weekFocusStyle = await weekFilter.evaluate((select) => ({
		outline: getComputedStyle(select).outlineStyle,
		visualHeight: Number.parseFloat(getComputedStyle(select.parentElement!, '::before').height),
		visualShadow: getComputedStyle(select.parentElement!, '::before').boxShadow,
	}));
	expect(weekFocusStyle.outline).toBe('none');
	expect(weekFocusStyle.visualHeight).toBeLessThanOrEqual(28);
	expect(weekFocusStyle.visualShadow).not.toBe('none');
	const goButton = page.locator('.mobile-week-filter button');
	await goButton.focus();
	const goFocusStyle = await goButton.evaluate((button) => ({
		outline: getComputedStyle(button).outlineStyle,
		visualHeight: Number.parseFloat(getComputedStyle(button, '::before').height),
	}));
	expect(goFocusStyle.outline).toBe('none');
	expect(goFocusStyle.visualHeight).toBeLessThanOrEqual(28);
	const appNavStyle = await page.locator('.mobile-nav').evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		const style = getComputedStyle(element);
		return {
			left: bounds.left,
			right: window.innerWidth - bounds.right,
			bottom: window.innerHeight - bounds.bottom,
			borderRadius: Number.parseFloat(style.borderRadius),
			boxShadow: style.boxShadow,
			backdropFilter: style.backdropFilter || style.getPropertyValue('-webkit-backdrop-filter'),
		};
	});
	expect(appNavStyle.left).toBe(0);
	expect(appNavStyle.right).toBe(0);
	expect(appNavStyle.bottom).toBe(0);
	expect(appNavStyle.borderRadius).toBe(0);
	expect(appNavStyle.boxShadow).toContain('-1px 8px');
	expect(appNavStyle.backdropFilter).toContain('blur');
	const activeBottomItem = () => page.locator('.mobile-nav a[aria-current="page"]');
	await expect(activeBottomItem()).toHaveCount(1);
	await expect(activeBottomItem()).toHaveAttribute('data-mobile-nav-item', 'home');
	for (const section of ['schedule', 'standings', 'players']) {
		await page.locator(`#${section}`).evaluate((element, sectionName) => {
			document.documentElement.style.scrollBehavior = 'auto';
			const activationLine = Math.max(150, Math.min(window.innerHeight * 0.45, 380));
			const target = sectionName === 'schedule'
				? 101
				: sectionName === 'players'
					? document.documentElement.scrollHeight - window.innerHeight
					: window.scrollY + element.getBoundingClientRect().top - activationLine + 1;
			window.scrollTo(0, target);
		}, section);
		await expect(activeBottomItem()).toHaveCount(1);
		await expect(activeBottomItem()).toHaveAttribute('data-mobile-nav-item', section);
	}
	const visibleRows = await page.locator('[data-schedule-list] .game-row').evaluateAll((rows) =>
		rows.filter((row) => {
			const bounds = row.getBoundingClientRect();
			return bounds.top < window.innerHeight && bounds.bottom > 0;
		}).length,
	);
	expect(visibleRows).toBeGreaterThanOrEqual(3);

	await page.evaluate(() => {
		document.documentElement.dataset.displayMode = 'standalone';
	});
	const standaloneNavStyle = await page.locator('.mobile-nav').evaluate((element) => {
		const bounds = element.getBoundingClientRect();
		const style = getComputedStyle(element);
		return {
			left: bounds.left,
			right: window.innerWidth - bounds.right,
			bottom: window.innerHeight - bounds.bottom,
			borderRadius: Number.parseFloat(style.borderRadius),
		};
	});
	expect(standaloneNavStyle.left).toBeGreaterThanOrEqual(18);
	expect(standaloneNavStyle.right).toBeGreaterThanOrEqual(18);
	expect(standaloneNavStyle.bottom).toBeGreaterThanOrEqual(12);
	expect(standaloneNavStyle.borderRadius).toBeGreaterThanOrEqual(24);
});
