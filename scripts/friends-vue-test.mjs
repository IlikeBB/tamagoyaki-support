import { chromium, expect } from '@playwright/test';

const origin = process.env.QA_ORIGIN;
if (origin !== 'http://127.0.0.1:8079') throw new Error('Use the isolated Vue QA server on port 8079.');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const errors = [], writes = [], checks = [];
const a = { id: 'friends-vue-a', username: 'friends_a', nickname: '小玉' };
const b = { id: 'friends-vue-b', username: 'friends_b', nickname: '第二位夥伴' };
const bob = { id: 'friends-vue-bob', username: 'bob', nickname: '小狐 <img src=x>', location_visible: true,
  lat: 25.033, lng: 121.5654, located: Date.now() / 1000,
  avatar_url: '/api/profiles/friends-vue-bob/media/avatar?v=abcdef012345abcdef012345' };
const carol = { id: 'friends-vue-carol', username: 'carol', nickname: '同行好友' };
let user = a, data = { friends: [bob], incoming: [carol], outgoing: [], sharing: false };
let holdSync = null, holdInvite = null, rejectInvite = true, rejectAction = true;
const hold = () => {
  let started, release;
  return { started: new Promise(resolve => { started = resolve; }),
    gate: { started: () => started(), promise: new Promise(resolve => { release = resolve; }) },
    release: () => release() };
};

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.friendsCspViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.friendsCspViolations.push(event.violatedDirective));
  });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (url.origin !== origin) return route.continue();
    if (path === '/api/friends/requests' && request.method() === 'POST') {
      writes.push({ path, body: request.postDataJSON() });
      if (holdInvite) { const gate = holdInvite; holdInvite = null; gate.started(); await gate.promise; }
      if (rejectInvite) return route.fulfill({ status: 409, json: { detail: '已送出邀請，請稍後再試。' } });
      return route.fulfill({ json: { ok: true } });
    }
    if (path === '/api/friends/' + carol.id + '/accept' && request.method() === 'POST') {
      writes.push({ path });
      if (rejectAction) return route.fulfill({ status: 409, json: { detail: '邀請狀態已變更，請重試。' } });
      data = { ...data, incoming: [], friends: [...data.friends, carol] };
      return route.fulfill({ json: { ok: true } });
    }
    if (request.method() !== 'GET') throw new Error(`Unexpected write ${request.method()} ${path}`);
    if (path === '/api/config') return route.continue();
    if (path === '/api/me') return route.fulfill({ json: { user, expeditions: [], help_rooms: [] } });
    if (path === '/api/friends') {
      const snapshot = structuredClone(data);
      if (holdSync) { const gate = holdSync; holdSync = null; gate.started(); await gate.promise; }
      return route.fulfill({ json: snapshot });
    }
    if (path.includes('/media/avatar')) return route.fulfill({ status: 404, body: '' });
    if (path === '/api/chat') return route.fulfill({ json: { conversations: [], unread: 0 } });
    return route.fulfill({ json: { items: [], expeditions: [], messages: [] } });
  });
  const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
  expect(response.headers()['content-security-policy']).not.toContain('unsafe-eval');
  await expect.poll(() => page.evaluate(() => state.authenticated && friends?.ready())).toBe(true);
  await page.evaluate(() => clearInterval(pollTimer));
  await page.locator('[data-action=friends-preview]').click();
  await expect(page.locator('#panel-content[data-v-app] #friends-panel')).toBeVisible();
  await expect(page.locator('#friend-list .friend-info strong')).toHaveText(bob.nickname);
  await expect(page.locator('#friend-list img')).toHaveCount(0);
  await expect(page.locator('#friend-list script')).toHaveCount(0);
  await expect(page.locator('#friend-list [data-action=friend-find]')).toHaveCount(1);
  await expect(page.locator('#friend-share-toggle')).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => state.watch)).toBeNull();
  checks.push('friends Vue mounts under the existing CSP, escapes names, falls back from a failed avatar, and does not start GPS');

  const row = await page.locator('#friend-list .friend-row').elementHandle();
  const chat = page.locator('#friend-list [data-action=friend-chat]').first();
  await page.locator('#friend-username').fill('still_typing');
  await chat.focus();
  data.friends = [{ ...bob, nickname: bob.nickname + ' · 更新' }];
  await page.evaluate(() => friends.sync());
  await expect(chat).toBeFocused();
  expect(await row.evaluate(element => element.isConnected)).toBe(true);
  await expect(page.locator('#friend-username')).toHaveValue('still_typing');
  await page.locator('#search').fill('BOB');
  await expect(page.locator('#friend-list .friend-row')).toHaveCount(1);
  await page.locator('#search').fill('no_match');
  await expect(page.locator('#friend-list')).toContainText('沒有符合的好友');
  await expect(page.locator('#friend-requests .friend-row')).toHaveCount(1);
  await page.locator('#search').fill('');
  await page.evaluate(() => setTab('tasks'));
  expect(await page.evaluate(() => friends.view.root === null && !document.querySelector('#panel-content').__vue_app__)).toBe(true);
  await page.locator('[data-action=friends-preview]').click();
  await expect(page.locator('#friend-username')).toHaveValue('still_typing');
  checks.push('keyed polling preserves rows, keyboard focus and draft; search filters friends only and tab changes unmount and restore Vue cleanly');

  await page.locator('#friend-username').fill('retry_friend');
  await page.locator('#friend-invite-form [type=submit]').click();
  await expect(page.locator('#friend-invite-error')).toHaveText('已送出邀請，請稍後再試。');
  await expect(page.locator('#friend-invite-form [type=submit]')).toBeEnabled();
  await expect(page.locator('#friend-username')).toHaveValue('retry_friend');
  rejectInvite = false;
  const invite = hold(); holdInvite = invite.gate;
  await page.locator('#friend-invite-form [type=submit]').click(); await invite.started;
  await expect(page.locator('#friend-invite-form [type=submit]')).toBeDisabled();
  await page.locator('#friend-username').fill('next_friend');
  await page.evaluate(() => document.querySelector('#friend-invite-form').requestSubmit());
  expect(writes.filter(write => write.path.endsWith('/requests'))).toHaveLength(2);
  invite.release();
  await expect(page.locator('#friend-invite-form [type=submit]')).toBeEnabled();
  await expect(page.locator('#friend-username')).toHaveValue('next_friend');
  await expect(page.locator('#friend-invite-error')).toHaveText('');
  await page.locator('[data-action=friend-accept]').click();
  await expect(page.locator('#friends-panel > .form-error')).toHaveText('邀請狀態已變更，請重試。');
  rejectAction = false;
  await page.locator('[data-action=friend-accept]').click();
  await expect(page.locator('#friend-list .friend-row')).toHaveCount(2);
  await expect(page.locator('#friend-requests .friend-row')).toHaveCount(0);
  await expect(page.locator('#friend-share-toggle')).toBeFocused();
  checks.push('failed invites and acceptance recover; duplicate submit is blocked and a new draft survives an earlier successful response');

  data.friends[0].located = Date.now() / 1000 - 180;
  await page.evaluate(() => friends.sync());
  await expect(page.locator('#friend-list .friend-row').first()).toContainText('最後位置');
  data.friends[0].located = Date.now() / 1000 - 901;
  await page.evaluate(() => friends.sync());
  await expect(page.locator('#friend-list [data-action=friend-find]')).toHaveCount(0);
  data.friends[0].located = Date.now() / 1000;
  await page.evaluate(() => friends.sync());
  await expect(page.locator('#friend-list [data-action=friend-find]')).toHaveCount(1);
  await context.setOffline(true);
  await page.evaluate(() => renderPanel());
  await expect(page.locator('#friend-list [data-action=friend-find]')).toHaveCount(0);
  expect(await page.evaluate(() => friends.targets())).toEqual([]);
  await context.setOffline(false); await page.evaluate(() => friends.sync());
  await expect(page.locator('#friend-list [data-action=friend-find]')).toHaveCount(1);
  checks.push('stale locations show their age; expired and offline positions cannot be found');

  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    for (const width of [320, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const root = await page.locator('#panel-content').boundingBox();
      const bounds = await page.locator('#friend-invite-form [type=submit]').boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(root.x);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(root.x + root.width + 1);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      await page.locator('#panel-content').evaluate(root => { root.scrollTop = 0; });
      if ([320, 1440].includes(width)) await page.screenshot({ path: `artifacts/friends-vue-${theme}-${width}.png`, animations: 'disabled' });
    }
  }
  checks.push('light and dark layouts fit 320–1440 px screens with touch-sized controls');

  const oldSync = hold(), oldInvite = hold();
  holdSync = oldSync.gate;
  await page.evaluate(() => { void friends.sync(); }); await oldSync.started;
  holdInvite = oldInvite.gate;
  await page.locator('#friend-invite-form [type=submit]').click(); await oldInvite.started;
  user = b; data = { friends: [], incoming: [], outgoing: [], sharing: false };
  await page.evaluate(user => {
    friends.reset(); state.user = user; state.rooms = []; render(); void friends.sync();
  }, b);
  await expect(page.locator('#friends-panel .friends-intro')).toContainText('@' + b.username);
  await expect(page.locator('#friend-list .friend-row')).toHaveCount(0);
  await page.locator('#friend-username').fill('new_account_draft');
  const lateSync = page.waitForResponse(async response => new URL(response.url()).pathname === '/api/friends' &&
    (await response.json()).friends?.some(person => person.id === bob.id));
  const lateInvite = page.waitForResponse(response => new URL(response.url()).pathname === '/api/friends/requests');
  oldSync.release(); oldInvite.release();
  await Promise.all([(await lateSync).finished(), (await lateInvite).finished()]);
  await expect.poll(() => page.evaluate(() => friends.syncing)).toBe(false);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  await expect(page.locator('#friend-username')).toHaveValue('new_account_draft');
  await expect(page.locator('#friend-list .friend-row')).toHaveCount(0);
  expect(await page.evaluate(() => friends.ownerId)).toBe(b.id);
  await page.evaluate(() => { friends.reset(); state.authenticated = false; state.user = { id: 'me', nickname: '你' }; render(); });
  await expect(page.locator('#panel-content [data-action=account]')).toHaveText('登入或註冊');
  await expect(page.locator('#friends-panel')).toHaveCount(0);
  checks.push('account changes and logout clear private friends and drafts; earlier sync and invite responses cannot alter the new account');
  expect(await page.evaluate(() => window.friendsCspViolations)).toEqual([]);
  expect(errors).toEqual([]);
  expect(writes.map(write => write.body?.username).filter(Boolean)).toEqual(['retry_friend', 'retry_friend', 'next_friend']);
  console.log(JSON.stringify({ ok: true, checks, errors, writes }));
} finally { await browser.close(); }
