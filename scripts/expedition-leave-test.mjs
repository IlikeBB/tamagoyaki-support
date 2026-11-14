import { chromium, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
const origin = process.env.QA_ORIGIN;
if (origin !== 'http://127.0.0.1:8079') throw Error('Membership changes require isolated QA port 8079.');
const browser = await chromium.launch({ headless: true, executablePath: process.env.QA_CHROMIUM || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const errors = [], departures = [], checks = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (request.method() === 'DELETE' && request.url().endsWith('/membership')) departures.push(new URL(request.url()).pathname);
  });
  async function api(path, method = 'GET', data) {
    const response = await page.request.fetch(origin + '/api' + path, { method, data, headers: { 'X-Tamago-Client': 'web', Origin: origin } });
    expect(response.ok()).toBe(true);
    return response.json();
  }
  await api('/auth/register', 'POST', { username: 'leave_' + randomBytes(6).toString('hex'), nickname: '退出測試', password: 'Isolated expedition departure password 2026!' });
  const room = await api('/expeditions', 'POST', { name: '<img src=x onerror=alert(1)> 遠征隊', venue: 'taiwan' });
  const other = await api('/expeditions', 'POST', { name: '保留的遠征隊', venue: 'japan' });
  await page.goto(origin + '/#expeditions');
  await expect(page.locator('[data-expedition-mine-list] .expedition-entry')).toHaveCount(2);
  await page.evaluate(async id => { await enterRoom(state.rooms.find(item => item.id === id), state.user); showExpeditionPage(); clearInterval(pollTimer); }, room.id);
  const leave = page.locator('.expedition-entry.is-current [data-action=leave]');
  await leave.click();
  await expect(page.locator('#dialog-body h2')).toHaveText('結束這一段遠征？');
  await expect(page.locator('#dialog-body strong')).toHaveText(room.name);
  await expect(page.locator('#dialog-body img')).toHaveCount(0);
  await expect(page.locator('[data-action=confirm-leave]')).toHaveAttribute('data-id', room.id);
  for (const dark of [false, true]) {
    await page.evaluate(value => TamagoTheme.set(value), dark);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.locator('#dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/vue-leave-confirmation-390.png', animations: 'disabled' });
  await page.locator('#dialog-body [data-action=close]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#dialog')).toBeHidden();
  expect((await api('/me')).expeditions.map(item => item.id).sort()).toEqual([room.id, other.id].sort());
  expect(departures).toEqual([]);
  checks.push('Vue departure confirmation safely renders the room name, fits light/dark breakpoints and cancels by keyboard without changing membership');
  await leave.click();
  await page.locator('[data-action=confirm-leave]').click();
  await expect(page.locator('#dialog')).toBeHidden();
  await expect.poll(async () => (await api('/me')).expeditions.map(item => item.id)).toEqual([other.id]);
  expect(departures).toEqual(['/api/expeditions/' + room.id + '/membership']);
  expect(errors).toEqual([]);
  checks.push('Confirming leaves the displayed expedition once, refreshes state and preserves other memberships');
  console.log(JSON.stringify({ ok: true, checks, errors }));
} finally { await browser.close(); }
