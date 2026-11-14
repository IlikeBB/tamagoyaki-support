import { chromium, expect } from '@playwright/test';

const origin = process.env.QA_ORIGIN;
if (origin !== 'http://127.0.0.1:8079') throw new Error('Use the isolated Vue QA server on port 8079.');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const errors = [], writes = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.vueCspViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.vueCspViolations.push(event.violatedDirective));
  });
  const a = { id: 'vue-a', username: 'vue_a', nickname: '第一位夥伴' };
  const b = { id: 'vue-b', username: 'vue_b', nickname: '第二位夥伴' };
  const roomA = { id: 'vue-room-a', name: '原帳號遠征隊', owner: a.id, venue: 'makuhari', event_date: '' };
  const roomB = { id: 'vue-room-b', name: '新帳號遠征隊', owner: b.id, venue: 'taiwan', event_date: '' };
  let user = a, rooms = [roomA], hold = null;
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (new URL(request.url()).origin !== origin) return route.continue();
    if (request.method() !== 'GET') { writes.push(path); return route.abort(); }
    if (path === '/api/config') return route.continue();
    if (path === '/api/me') {
      const response = { user, expeditions: [...rooms], help_rooms: [] };
      if (hold) { const waiting = hold; hold = null; waiting.started(); await waiting.promise; }
      return route.fulfill({ json: response });
    }
    if (path === '/api/friends') return route.fulfill({ json: { friends: [], incoming: [], outgoing: [], sharing: false } });
    if (path === '/api/chat') return route.fulfill({ json: { conversations: [], unread: 0 } });
    if (path === '/api/expeditions/' + roomA.id) return route.fulfill({ json: { room: roomA, me: { user: a.id, scope: 'off', squad: null }, members: [], squads: [], tasks: [], pins: [], help_rooms: [] } });
    return route.fulfill({ json: { expeditions: [], items: [] } });
  });
  const response = await page.goto(origin + '/#expeditions', { waitUntil: 'domcontentloaded' });
  expect(response.headers()['content-security-policy']).not.toContain('unsafe-eval');
  await expect(page.locator('#expeditions-page[data-v-app]')).toBeVisible();
  await expect(page.locator('[data-expedition-mine-list]')).toContainText(roomA.name);
  await expect(page.locator('[data-expedition-refresh=joined]')).toBeEnabled();
  await page.evaluate(() => clearInterval(pollTimer));

  const row = await page.locator('[data-expedition-mine-list] .expedition-entry').elementHandle();
  const preview = page.locator(`[data-expedition-preview=${roomA.id}]`);
  await preview.focus();
  rooms = [{ ...roomA, name: roomA.name + ' · 已更新' }];
  await page.evaluate(async () => { await expeditionPage.loadMine(); });
  await expect(page.locator('[data-expedition-mine-list]')).toContainText('已更新');
  expect(await row.evaluate(element => element.isConnected)).toBe(true);
  await expect(preview).toBeFocused();

  let release, started;
  const pending = new Promise(resolve => { started = resolve; });
  hold = { started, promise: new Promise(resolve => { release = resolve; }) };
  await page.locator('[data-expedition-refresh=joined]').click();
  await pending;
  user = b; rooms = [roomB];
  await page.evaluate(({ user, room }) => {
    state.user = user; state.rooms = [room]; state.room = room; render();
  }, { user: b, room: roomB });
  await expect(page.locator('[data-expedition-mine-list]')).toContainText(roomB.name);
  const oldResponse = page.waitForResponse(async response => new URL(response.url()).pathname === '/api/me' && (await response.json()).user?.id === a.id);
  release();
  await (await oldResponse).finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  await expect.poll(() => page.evaluate(() => expeditionPage.state.loadingMine)).toBe(false);
  await expect(page.locator('[data-expedition-mine-list]')).not.toContainText(roomA.name);
  expect(await page.evaluate(() => state.rooms.map(room => room.id))).toEqual([roomB.id]);
  expect(await page.evaluate(() => window.vueCspViolations)).toEqual([]);
  expect(errors).toEqual([]); expect(writes).toEqual([]);
  console.log(JSON.stringify({ ok: true, checks: [
    'compiled Vue mounts under the existing CSP without unsafe-eval or violations',
    'keyed room updates preserve the row and keyboard focus',
    'switching accounts clears private rooms and discards an older in-flight response',
  ], errors, writes }));
} finally { await browser.close(); }
