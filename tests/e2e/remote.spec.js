// tests/e2e/remote.spec.js
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

// ── Layout: elements present ───────────────────────────────────────────────

test('page has correct title', async ({ page }) => {
  await expect(page).toHaveTitle('TV Remote');
});

test('status dot is present in the power row', async ({ page }) => {
  await expect(page.locator('#status-dot')).toBeAttached();
});

test('remote body is visible', async ({ page }) => {
  await expect(page.locator('.remote')).toBeVisible();
});

test('navigation ring is visible with all direction buttons', async ({ page }) => {
  await expect(page.locator('.nav-ring')).toBeVisible();
  await expect(page.locator('.nav-up')).toBeVisible();
  await expect(page.locator('.nav-down')).toBeVisible();
  await expect(page.locator('.nav-left')).toBeVisible();
  await expect(page.locator('.nav-right')).toBeVisible();
  await expect(page.locator('.nav-ok')).toBeVisible();
});

test('power button is visible', async ({ page }) => {
  await expect(page.locator('.btn-power')).toBeVisible();
});

test('icon row has three buttons (Back, Home, Play)', async ({ page }) => {
  const icons = page.locator('.icon-row .btn-icon');
  await expect(icons).toHaveCount(3);
});

test('VOL and CH rockers are visible', async ({ page }) => {
  await expect(page.locator('.rockers')).toBeVisible();
  const rockerBtns = page.locator('.btn-rocker');
  await expect(rockerBtns).toHaveCount(4); // VOL+, VOL-, CH+, CH-
});

// ── Layout: sizing ─────────────────────────────────────────────────────────

test('remote body is narrower than 200px', async ({ page }) => {
  const box = await page.locator('.remote').boundingBox();
  expect(box.width).toBeLessThanOrEqual(200);
});

test('remote body is taller than it is wide (pill shape)', async ({ page }) => {
  const box = await page.locator('.remote').boundingBox();
  expect(box.height).toBeGreaterThan(box.width);
});

test('power button meets 44px touch target minimum', async ({ page }) => {
  const box = await page.locator('.btn-power').boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('OK button meets 44px touch target minimum', async ({ page }) => {
  const box = await page.locator('.nav-ok').boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test('rocker buttons meet 44px height minimum', async ({ page }) => {
  const buttons = page.locator('.btn-rocker');
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const box = await buttons.nth(i).boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

