import { expect, test } from '@playwright/test';

test('blog page lists posts and opens a post', async ({ page }) => {
  await page.goto('/blog');

  await expect(page).toHaveTitle(/Astro Blog/);
  const firstPost = page.locator('#post-list > li').first();
  await expect(firstPost).toBeVisible();

  await firstPost.getByRole('link').click();
  await expect(page).toHaveURL(/\/blog\/[^/]+\/$/);
  await expect(page.locator('article .title h1')).toBeVisible();
});

test('search filters posts and shows an empty state', async ({ page }) => {
  await page.goto('/blog');
  const search = page.getByRole('searchbox', { name: 'Search posts' });
  const posts = page.locator('#post-list > li');

  await expect(posts.first()).toBeVisible();
  await search.fill('this will not match any post');

  await expect(page.locator('#no-results')).toBeVisible();
  await expect(posts.filter({ visible: true })).toHaveCount(0);
});
