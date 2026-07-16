import { expect, test, type Page } from '@playwright/test';

async function completeOnboarding(page: Page) {
  await page.goto('/');
  const skip = page.getByRole('button', { name: 'Skip' });
  const homeHeading = page.getByRole('heading', { name: 'Hybrid Tracker' });
  await expect(skip.or(homeHeading)).toBeVisible({ timeout: 10_000 });
  if (await skip.isVisible()) await skip.click();
  await expect(homeHeading).toBeVisible();
  const dismissOffline = page.getByRole('button', { name: 'Dismiss' });
  if (await dismissOffline.isVisible()) await dismissOffline.click();
}

test.beforeEach(async ({ page }) => {
  await completeOnboarding(page);
});

test('complete a gym session and preserve it after reload', async ({ page }) => {
  await page.getByRole('link', { name: /Workouts/ }).click();
  const gymCard = page.locator('.schedule-card').filter({ hasText: /Push|Pull|Legs|Upper/ }).first();
  await gymCard.click();
  await expect(page.getByText('WORKOUT IN PROGRESS')).toBeVisible();
  await page.getByRole('button', { name: 'Finish workout' }).click();
  await page.getByRole('button', { name: 'Complete session' }).click();
  await page.getByRole('button', { name: 'Complete anyway' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page.getByText('Latest session')).toBeVisible();
});

test('log an easy run and show calculated pace', async ({ page }) => {
  await page.getByRole('link', { name: /Workouts/ }).click();
  await page.locator('.schedule-card').filter({ hasText: 'Easy Run' }).click();
  await page.getByRole('spinbutton', { name: /Distance/ }).fill('10');
  await page.getByLabel('Minutes').fill('50');
  await expect(page.getByText('5:00 /km')).toBeVisible();
  await page.getByRole('button', { name: 'Complete run' }).click();
  await expect(page.getByText('Latest session')).toBeVisible();
});

test('log body weight for pull-up calculations', async ({ page }) => {
  await page.getByRole('button', { name: /Log weight/ }).click();
  await page.getByRole('spinbutton', { name: /Weight/ }).fill('72.5');
  await page.getByRole('button', { name: 'Save weight' }).click();
  await page.getByRole('link', { name: /Weight/ }).click();
  await expect(page.getByText('72.5', { exact: false }).first()).toBeVisible();
});

test('create a local backup from settings', async ({ page }) => {
  await page.getByRole('link', { name: /Settings/ }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Create local backup/ }).click();
  expect((await download).suggestedFilename()).toMatch(/hybrid-tracker-backup-.*\.json/);
});

test('rescheduling to an occupied day asks for confirmation', async ({ page }) => {
  await page.getByRole('link', { name: /Workouts/ }).click();
  await page.locator('.schedule-card').first().getByRole('button').click();
  const occupiedDate = await page.locator('.schedule-card').nth(1).evaluate((element) => element.closest('.week-day')?.querySelector('.day-label strong')?.textContent);
  expect(occupiedDate).toBeTruthy();
  const today = new Date(); const monday = new Date(today); monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const target = new Date(monday); target.setDate(monday.getDate() + 1);
  await page.getByLabel('New date').fill(target.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Reschedule workout' }).click();
  await expect(page.getByText('Another workout is already scheduled for this day. Schedule both workouts?')).toBeVisible();
});

test('core screens fit an iPhone viewport without horizontal overflow', async ({ page }) => {
  for (const href of ['/', '/workouts', '/statistics', '/weight', '/settings']) {
    await page.goto(href);
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client + 1);
  }
});
