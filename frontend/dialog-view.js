import { Surface } from './surface.js';
import ServiceFrame from './components/ServiceFrame.vue';
import DialogContent from './components/DialogContent.vue';
const frames = new WeakMap();
const dialogs = new WeakMap();
let revision = 0;
export function renderFrame(root, model) {
  if (!frames.has(root)) frames.set(root, new Surface(root, ServiceFrame));
  frames.get(root).update({ model: { ...model }, key: ++revision });
}
export function renderDialog(root, model) {
  if (!model || typeof model.kind !== 'string') throw new TypeError('A structured dialog model is required.');
  if (!dialogs.has(root)) dialogs.set(root, new Surface(root, DialogContent));
  dialogs.get(root).update({ model: { ...model }, key: ++revision });
}
