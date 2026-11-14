// Read-only live check: block writes to this origin; use a fresh guest session.
import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';

const origin = 'https://tamagoyaki-support.modoubletw.com';
const redact = value => String(value).replace(/AIza[A-Za-z0-9_-]+/g, '[REDACTED]');
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const errors = [], writes = [], checks = [], mapErrors = [];
fs.mkdirSync('artifacts', { recursive: true });
let page;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push(redact(error.message)));
  page.on('console', message => {
    if (message.type() === 'error' && /Google Maps|ApiNotActivated|RefererNotAllowed|BillingNotEnabled|InvalidKey|ApiTargetBlocked/i.test(message.text())) mapErrors.push(redact(message.text()));
  });
  await page.route(origin + '/**', route => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
      writes.push(new URL(route.request().url()).pathname);
      return route.abort();
    }
    return route.continue();
  });
  const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['content-security-policy']).not.toContain('unsafe-eval');
  const entry = page.locator('script[src^="/static/vue/app.js?v="]');
  await expect(entry).toHaveCount(1);
  const bundle = await page.request.get(origin + await entry.getAttribute('src'));
  expect(bundle.status()).toBe(200);
  const expectedHash = createHash('sha256').update(fs.readFileSync('static/vue/app.js')).digest('hex');
  expect(createHash('sha256').update(await bundle.body()).digest('hex')).toBe(expectedHash);
  await expect(page.locator('#account-label')).toHaveText('登入');
  expect(await page.evaluate(() => !!window.TamagoVue && !!document.body.__vue_app__)).toBe(true);
  checks.push('HTTPS serves the expected Vue bundle; shell mounts under the existing CSP and no-store policy');

  await expect.poll(() => page.evaluate(() => typeof map !== 'undefined' && !!map?.isGoogle), { timeout: 30000 }).toBe(true);
  await expect(page.locator('#map-provider-notice')).toBeHidden();
  await expect(page.locator('.google-facility-overlay')).toBeVisible();
  await expect.poll(() => page.locator('.google-facility-overlay').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.venue-map-point')).toHaveCount(5);
  const zoom = await page.evaluate(() => map.getZoom());
  await page.locator('[data-action=zoom-in]').click();
  await expect.poll(() => page.evaluate(() => map.getZoom())).toBeGreaterThan(zoom);
  await expect(page.locator('.venue-map-point')).toHaveCount(5);
  await page.locator('#region-venue').selectOption('tokyo-dome-city');
  await expect(page.locator('#region-venue')).toHaveValue('tokyo-dome-city');
  await expect.poll(() => page.evaluate(() => map.getCenter().lat)).toBeCloseTo(35.70332, 3);
  await page.locator('#region-venue').selectOption('makuhari');
  checks.push('Live Google Maps, venue artwork, five Vue venue markers, zoom and venue switching work');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.mobile-tabs [data-action=expeditions]').click();
  await expect(page.locator('#expeditions-page')).toBeVisible();
  await page.locator('[data-expedition-mode=browse]').click();
  await expect(page.locator('#expedition-page-venue')).toBeVisible();
  await page.locator('#expedition-page-venue').selectOption('taiwan');
  await expect(page.locator('[data-expedition-catalog-list]')).not.toContainText('正在載入');
  await page.locator('[data-expedition-back]').click();
  await page.locator('[data-action=settings]').click();
  await expect(page.locator('#dialog')).toBeVisible();
  await page.locator('#dialog [data-action=close]').click();
  await page.locator('#account-button').click();
  await expect(page.locator('#auth-form')).toBeVisible();
  await page.locator('[data-action=auth-register]').click();
  await expect(page.locator('#auth-password')).toHaveAttribute('minlength', '15');
  await page.locator('#dialog [data-action=close]').click();
  checks.push('Expeditions browse actual public data; settings and registration forms open without submitting');

  for (const dark of [false, true]) {
    await page.evaluate(value => TamagoTheme.set(value), dark);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width !== 320) await page.screenshot({ path: `artifacts/vue-production-${dark ? 'dark' : 'light'}-${width}.png`, animations: 'disabled' });
    }
  }
  checks.push('Light/dark layouts fit 320, 390 and 1440 pixels');
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  expect(mapErrors).toEqual([]);
  const report = { ok: true, origin, checks, errors, writes, mapErrors };
  fs.writeFileSync('artifacts/vue-production-smoke.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report));
} catch (error) {
  await page?.screenshot({ path: 'artifacts/vue-production-failure.png', animations: 'disabled' }).catch(() => {});
  console.error(JSON.stringify({ ok: false, error: redact(error.message), errors, writes, mapErrors }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
