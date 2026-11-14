import { chromium, expect } from '@playwright/test';
const origin = process.env.QA_ORIGIN;
if (origin !== 'http://127.0.0.1:8079') throw new Error('Use the isolated Vue QA server on port 8079.');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
const errors = [], writes = [], checks = [];
const user = { id: 'chat-vue-me', username: 'chat_vue', nickname: '小玉' };
const room = { id: 'chat-vue-room', name: '遠征隊聊天', owner: user.id, venue: 'makuhari', event_date: '' };
const friend = { id: 'friend:chat-vue-friend', kind: 'friend', target: 'chat-vue-friend', title: '同行夥伴', unread: 0, can_send: true };
const muted = { id: 'expedition:' + room.id, kind: 'expedition', target: room.id, title: room.name, unread: 0, can_send: false };
const makeMessage = id => ({ id, sender: friend.target, sender_name: friend.title, body: `現場訊息 ${id}\n第二行：入口附近會合。`, created: 1794614400 + id });
const history = Array.from({ length: 20 }, (_, index) => makeMessage(index + 11));
let reads = 0, sends = 0;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.chatCspViolations = [];
    document.addEventListener('securitypolicyviolation', event => window.chatCspViolations.push(event.violatedDirective));
  });
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (url.origin !== origin) return route.continue();
    if (path === '/api/chat/friend/' + friend.target + '/read' && request.method() === 'POST') { reads++; return route.fulfill({ json: { unread: 0 } }); }
    if (path === '/api/chat/friend/' + friend.target + '/messages' && request.method() === 'POST') {
      sends++; const message = { ...makeMessage(history.at(-1).id + 1), sender: user.id, sender_name: user.nickname, body: request.postDataJSON().body };
      history.push(message); return route.fulfill({ json: message });
    }
    if (request.method() !== 'GET') { writes.push(path); return route.abort(); }
    if (path === '/api/config') return route.continue();
    if (path === '/api/me') return route.fulfill({ json: { user, expeditions: [room], help_rooms: [] } });
    if (path === '/api/friends') return route.fulfill({ json: { friends: [], incoming: [], outgoing: [], sharing: false } });
    if (path === '/api/chat') return route.fulfill({ json: { conversations: [friend, muted], unread: 0 } });
    if (path === '/api/expeditions/' + room.id) return route.fulfill({ json: { room, me: { user: user.id, scope: 'off', squad: null }, members: [], squads: [], tasks: [], pins: [], help_rooms: [] } });
    if (path === '/api/chat/friend/' + friend.target + '/messages') {
      const before = Number(url.searchParams.get('before') || 0), after = Number(url.searchParams.get('after') || 0);
      const messages = before ? Array.from({ length: 10 }, (_, index) => makeMessage(index + 1)) : history.filter(message => message.id > after);
      return route.fulfill({ json: { messages, has_more: !before && !after } });
    }
    return route.fulfill({ json: { messages: [], has_more: false, items: [], expeditions: [] } });
  });
  const response = await page.goto(origin, { waitUntil: 'domcontentloaded' });
  expect(response.headers()['content-security-policy']).not.toContain('unsafe-eval');
  await expect.poll(() => page.evaluate(() => chat?.owner === state.user.id && state.authenticated)).toBe(true);
  await page.evaluate(() => clearInterval(pollTimer));
  await page.evaluate(target => chat.open('friend', target), friend.target);
  await expect(page.locator('#chat-dialog[data-v-app]')).toBeVisible();
  await expect(page.locator('#chat-messages>li')).toHaveCount(20);
  await expect.poll(() => reads).toBeGreaterThan(0);
  await page.locator('#chat-input').fill('同步時保留焦點的草稿');await page.locator('#chat-input').focus();await page.evaluate(() => chat.sync());
  await expect(page.locator('#chat-input')).toHaveValue('同步時保留焦點的草稿');await expect(page.locator('#chat-input')).toBeFocused();
  checks.push('compiled chat mounts with the existing CSP and synchronization preserves the draft and input focus');

  const anchor = await page.evaluate(() => {
    const scroll = document.querySelector('#chat-scroll');scroll.scrollTop = 160;
    const row = [...document.querySelectorAll('#chat-messages>li')].find(row => row.getBoundingClientRect().top >= scroll.getBoundingClientRect().top);
    return { id: row.dataset.messageId, top: row.getBoundingClientRect().top };
  });
  await page.evaluate(() => chat.loadOlder());await expect(page.locator('#chat-messages>li')).toHaveCount(30);
  const afterTop = await page.locator(`[data-message-id="${anchor.id}"]`).evaluate(row => row.getBoundingClientRect().top);
  expect(Math.abs(afterTop - anchor.top)).toBeLessThan(2);
  await page.locator('#chat-scroll').evaluate(scroll => { scroll.scrollTop = 0; });
  const priorReads = reads;history.push(makeMessage(31));await page.evaluate(() => chat.fetchMessages());
  await expect(page.locator('#chat-new')).toBeVisible();expect(reads).toBe(priorReads);
  expect(await page.locator('#chat-scroll').evaluate(scroll => scroll.scrollTop)).toBeLessThan(2);
  await page.locator('#chat-new').click();await expect(page.locator('#chat-new')).toBeHidden();await expect.poll(() => reads).toBeGreaterThan(priorReads);
  checks.push('older history preserves its visible anchor; incoming messages leave reading position intact and become read after jumping to the latest');

  await page.locator('#chat-input').fill('');
  await page.locator('#chat-input').evaluate(input => {
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));input.value = '集';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true, inputType: 'insertCompositionText', data: '集' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', ctrlKey: true, isComposing: true }));
  });
  expect(sends).toBe(0);
  await page.locator('#chat-input').evaluate(input => { input.value = '集合';input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '集合' })); });
  await expect(page.locator('#chat-send')).toBeEnabled();await page.locator('#chat-input').press('Control+Enter');
  await expect(page.locator('#chat-input')).toHaveValue('');expect(sends).toBe(1);
  await page.evaluate(key => chat.choose(key), muted.id);await expect(page.locator('#chat-input')).toBeDisabled();await expect(page.locator('#chat-send')).toHaveText('已禁言');
  await page.evaluate(key => chat.choose(key), friend.id);await page.locator('#chat-input').fill('離線草稿');
  await context.setOffline(true);await expect(page.locator('#chat-send')).toBeDisabled();await context.setOffline(false);
  await expect(page.locator('#chat-send')).toBeEnabled();await expect(page.locator('#chat-input')).toHaveValue('離線草稿');
  checks.push('IME composition does not submit; Ctrl+Enter sends after composition, muted rooms remain read-only and offline drafts survive reconnecting');

  for (const dark of [false, true]) {
    await page.evaluate(dark => TamagoTheme.set(dark), dark);
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.locator('#chat-dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      if (width === 390 || width === 1440) await page.screenshot({ path: `artifacts/chat-vue-${dark ? 'dark' : 'light'}-${width}.png` });
    }
  }
  expect(await page.evaluate(() => window.chatCspViolations)).toEqual([]);expect(errors).toEqual([]);expect(writes).toEqual([]);
  console.log(JSON.stringify({ ok: true, checks, errors, unexpected_writes: writes }));
} finally { await browser.close(); }
