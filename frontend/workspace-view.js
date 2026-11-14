import { Surface } from './surface.js';
import WorkspacePanel from './components/WorkspacePanel.vue';
const views = new WeakMap();
export function renderWorkspace(root, context) {
  if (!views.has(root)) views.set(root, new Surface(root, WorkspacePanel));
  views.get(root).update({ context });
}
export function clearWorkspace(root) { views.get(root)?.clear(); }
