import { Surface } from './surface.js';
import TargetCard from './components/TargetCard.vue';
import RadarChips from './components/RadarChips.vue';
import PlaceResults from './components/PlaceResults.vue';
import FinderBody from './components/FinderBody.vue';
const views = new WeakMap();
function update(root, component, model, events = {}) {
  if (!views.has(root)) views.set(root, new Surface(root, component));
  views.get(root).update({ model, ...events });
}
export const renderTarget = (root, model) => update(root, TargetCard, model);
export const renderRadar = (root, model) => update(root, RadarChips, model);
export const renderFinderBody = (root, model) => update(root, FinderBody, model);
export const renderPlaces = (root, model, events) => update(root, PlaceResults, model, events);
