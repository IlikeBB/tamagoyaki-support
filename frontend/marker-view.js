import { Surface } from './surface.js';
import MapMarker from './components/MapMarker.vue';
import SmallControls from './components/SmallControls.vue';
const markers = new WeakMap(), presence = new WeakMap(), controls = new WeakMap();
export function createMapMarker(data) {
  const element = document.createElement('span'); element.style.display = 'contents';
  const surface = new Surface(element, MapMarker), model = { ...data };
  surface.update({ model }); markers.set(element, surface);
  if (element.firstElementChild) presence.set(element.firstElementChild, { surface, model });
  return element;
}
export function updatePresence(root, angle) {
  const view = presence.get(root); if (!view) return;
  view.model = { ...view.model, angle }; view.surface.update({ model: view.model });
}
export function releaseMapMarker(element) { markers.get(element)?.clear(); markers.delete(element); }
export function renderControl(root, model) {
  if (!controls.has(root)) controls.set(root, new Surface(root, SmallControls));
  controls.get(root).update({ model });
}
