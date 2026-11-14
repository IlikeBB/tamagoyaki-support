import { createApp } from 'vue';
import AppShell from './components/AppShell.vue';
import { installQaBridge } from './runtime/qa-bridge.js';

let application;
function unmount() { application?.unmount(); application = null; }
function mount() {
  if (application) throw new Error('The Vue application is already mounted.');
  application = createApp(AppShell, { onApplication: app => installQaBridge(app, { mount, unmount }) });
  application.mount(document.body);
}
mount();
