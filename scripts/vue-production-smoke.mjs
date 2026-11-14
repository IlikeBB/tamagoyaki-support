// Read-only live check: block writes to this origin; use a fresh guest session.
import { chromium, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const origin = 'https://tamagoyaki-support.modoubletw.com';
const preview=process.argv.includes('--preview-local');
const redact = value => String(value).replace(/AIza[A-Za-z0-9_-]+/g, '[REDACTED]');
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const errors = [], writes = [], checks = [], mapErrors = [];
let blockedNonApiWrites=0;
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
      const pathname=new URL(route.request().url()).pathname;
      if(pathname.startsWith('/api/'))writes.push(pathname);else blockedNonApiWrites++;
      return route.abort();
    }
    if(preview){
      const url=new URL(route.request().url());
      if(url.pathname==='/')return (async()=>{
        const response=await route.fetch(),old=await response.text();
        const nonce=response.headers()['content-security-policy']?.match(/'nonce-([^']+)'/)?.[1]||old.match(/\bnonce="([^"]+)"/)?.[1];
        if(!nonce)throw Error('Public CSP nonce was not found; HTTP '+response.status()+'.');
        return route.fulfill({response,body:fs.readFileSync('static/index.html','utf8').replaceAll('__CSP_NONCE__',nonce)});
      })();
      if(url.pathname.startsWith('/static/')){
        const target=path.resolve('.'+url.pathname),base=path.resolve('static')+path.sep;
        if(!target.startsWith(base)||!fs.existsSync(target))return route.abort();
        const types={'.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
        return route.fulfill({body:fs.readFileSync(target),contentType:types[path.extname(target)]||'application/octet-stream'});
      }
    }
    return route.continue();
  });
  const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['content-security-policy']).not.toContain('unsafe-eval');
  const entry = page.locator('script[src^="/static/vue/app.js?v="]');
  await expect(entry).toHaveCount(1);
  const expectedHash = createHash('sha256').update(fs.readFileSync('static/vue/app.js')).digest('hex');
  const actualHash=await page.evaluate(async src=>{
    const response=await fetch(src);if(!response.ok)throw Error('Vue bundle did not load.');
    const bytes=await response.arrayBuffer(),digest=await crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
  },await entry.getAttribute('src'));
  expect(actualHash).toBe(expectedHash);
  await expect(page.locator('#account-label')).toHaveText('登入');
  expect(await page.evaluate(() => !!document.body.__vue_app__ && document.querySelector('#tamago-app')?.dataset.application==='vue')).toBe(true);
  expect(await page.evaluate(()=>['state','friends','pollTimer','TamagoTheme','TamagoGooglePlaces','TamagoTesting'].filter(key=>Object.hasOwn(window,key)))).toEqual([]);
  checks.push('HTTPS serves the expected Vue bundle; shell mounts under the existing CSP and no-store policy');

  await expect(page.locator('#tamago-app')).toHaveAttribute('data-map-provider','google',{timeout:30000});
  await expect(page.locator('#map-provider-notice')).toBeHidden();
  await expect(page.locator('.google-facility-overlay')).toBeVisible();
  await expect.poll(() => page.locator('.google-facility-overlay').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.venue-map-point')).toHaveCount(5);
  const zoom = Number(await page.locator('#tamago-app').getAttribute('data-map-zoom'));
  await page.locator('[data-action=zoom-in]').click();
  await expect.poll(async () => Number(await page.locator('#tamago-app').getAttribute('data-map-zoom'))).toBeGreaterThan(zoom);
  await expect(page.locator('.venue-map-point')).toHaveCount(5);
  await page.locator('#region-venue').selectOption('tokyo-dome-city');
  await expect(page.locator('#region-venue')).toHaveValue('tokyo-dome-city');
  await expect(page.locator('.venue-map-point.is-current')).toHaveText('東京巨蛋城');
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
    await page.locator('[data-action=settings]').click();
    await page.locator('[data-theme-toggle]').setChecked(dark);
    await page.locator('#dialog [data-action=close]').click();
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
  const report = { ok: true, origin, preview, checks, errors, writes, mapErrors, blockedNonApiWrites };
  fs.writeFileSync(preview?'artifacts/vue-production-preview.json':'artifacts/vue-production-smoke.json', JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report));
} catch (error) {
  await page?.screenshot({ path: 'artifacts/vue-production-failure.png', animations: 'disabled' }).catch(() => {});
  console.error(JSON.stringify({ ok: false, error: redact(error.message), errors, writes, mapErrors, blockedNonApiWrites }));
  process.exitCode = 1;
} finally {
  await browser.close();
}
