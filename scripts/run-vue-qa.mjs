import { spawn, execFileSync } from 'node:child_process';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'http://127.0.0.1:8079';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const core = ['profiles-test', 'profile-content-test', 'wall-history-test', 'landmark-delete-test', 'landmark-reports-test',
  'squad-roster-test', 'squad-friend-invites-test', 'squad-chat-test', 'friends-ui-test', 'friends-vue-test',
  'chat-test', 'chat-vue-test', 'chat-friend-news-test', 'expedition-members-test', 'event-range-test',
  'expeditions-vue-test', 'vue-lifecycle-test', 'expedition-leave-test', 'expeditions-page-test', 'expedition-admin-test', 'expedition-permissions-test',
  'news-ui-test', 'place-search-test', 'map-actions-test', 'map-presence-test', 'finder-ui-test',
  'location-audience-test', 'assistance-test', 'background-location-test', 'theme-test', 'ios-viewport-test',
  'interface-zoom-test', 'app-display-test', 'app-viewport-test', 'venue-map-test', 'landmark-zoom-test', 'google-places-test', 'site-admin-test'];
const requested = process.argv.slice(2);
const tests = (!requested.length || requested[0] === '--core' ? core : requested).map(name => name.replace(/\.mjs$/, ''));
if (tests.some(name => !/^[a-z0-9-]+$/.test(name))) throw Error('Expected test basenames.');
try { await fetch(origin + '/api/config'); throw Error('Port 8079 is occupied; stop the owned QA server first.'); }
catch (error) { if (!error.cause) throw error; }
const output = execFileSync('powershell', ['-NoProfile', '-Command', 'conda run -n agent python -c "import sys; print(sys.executable)"'], { cwd: root, encoding: 'utf8', windowsHide: true });
const python = output.split(/\r?\n/).map(line => line.trim()).find(line => /python(?:\.exe)?$/.test(line));
if (!python) throw Error('Cannot resolve the shared agent Python environment.');
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
const run = Date.now(), results = [];
for (const name of tests) {
  const log = await open(new URL(`../artifacts/vue-qa-${run}-${name}.log`, import.meta.url), 'a');
  const database = fileURLToPath(new URL(`../artifacts/vue-qa-${run}-${name}.sqlite3`, import.meta.url));
  const launch = () => spawn(python, ['-m', 'backend.server'], { cwd: root, windowsHide: true,
    env: { ...process.env, TAMAGO_DB: database, TAMAGO_PORT: '8079', TAMAGO_ORIGIN: origin, TAMAGO_MAP_PROVIDER: 'leaflet' },
    stdio: ['ignore', log.fd, log.fd] });
  let server = launch(), stopped = once(server, 'exit');
  let adminFixture;
  try {
    async function ready() {
      for (let attempt = 0; attempt < 150; attempt++) {
      if (server.exitCode !== null) throw Error('QA server exited during startup.');
      try { if ((await fetch(origin + '/api/config')).ok) return; } catch {}
      await pause(100);
      }
      throw Error('QA server did not start.');
    }
    await ready();
    if (name === 'site-admin-test') {
      const credentials = { username: 'momo', password: 'Vue admin fixture ' + crypto.randomUUID() };
      const response = await fetch(origin + '/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Tamago-Client': 'web', Origin: origin }, body: JSON.stringify({ ...credentials, nickname: 'QA 管理員' }) });
      if (!response.ok) throw Error('Cannot prepare isolated admin fixture.');
      adminFixture = fileURLToPath(new URL(`../artifacts/vue-admin-${run}.local.json`, import.meta.url));
      await writeFile(adminFixture, JSON.stringify(credentials), 'utf8');
      server.kill(); await stopped; server = launch(); stopped = once(server, 'exit'); await ready();
    }
    console.log(`RUN ${name}`);
    const test = spawn(process.execPath, ['scripts/' + name + '.mjs'], { cwd: root, windowsHide: true, stdio: 'inherit', env: { ...process.env, QA_ORIGIN: origin, ...(adminFixture ? { QA_ADMIN_FIXTURE: adminFixture } : {}) } });
    const [code] = await once(test, 'exit'); results.push({ name, code });
    if (code !== 0) process.exitCode = 1;
  } finally {
    // The process was created here, with this unique test database; no shared
    // server or production listener is searched for or terminated.
    if (server.exitCode === null) server.kill();
    await stopped; await log.close();
  }
}
const report = JSON.stringify({ run, results }, null, 2);
await writeFile(new URL(`../artifacts/vue-qa-${run}-results.json`, import.meta.url), report, 'utf8');
await writeFile(new URL('../artifacts/vue-qa-results.json', import.meta.url), report, 'utf8');
console.log(JSON.stringify({ run, results }));
