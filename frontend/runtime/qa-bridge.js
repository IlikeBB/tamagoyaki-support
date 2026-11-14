import { resourceStats } from './resources.js';

// Only the isolated loopback QA origin receives access to implementation state.
// Nothing is installed on the public website or production port 8078.
export function installQaBridge(app, controls) {
  if (!['127.0.0.1', 'localhost'].includes(location.hostname) || location.port !== '8079') return;
  for (const key of Object.keys(app)) {
    if (['resources', 'scope', 'ui'].includes(key)) continue;
    const get = () => app[key];
    Object.defineProperty(window, key, { configurable: true, get, set: value => { app[key] = value; } });
    app.resources.defer(() => { if (Object.getOwnPropertyDescriptor(window, key)?.get === get) delete window[key]; });
  }
  window.TamagoTesting = { ...controls, stats: resourceStats, application: () => app };
}
