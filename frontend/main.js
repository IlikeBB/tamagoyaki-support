import { createApp } from 'vue';
import AppShell from './components/AppShell.vue';

// Build-time compiled shell mounts before the deferred service controllers.
createApp(AppShell).mount(document.body);

export { ExpeditionsPage } from './expeditions-page.js';
export { ChatView } from './chat-view.js';
export { FriendsView } from './friends-view.js';
export { ProfileContentView } from './profile-view.js';
export { renderWorkspace, clearWorkspace } from './workspace-view.js';
export { renderList } from './list-views.js';
export { renderFrame, renderDialog } from './dialog-view.js';
export { renderTarget, renderRadar, renderFinderBody, renderPlaces } from './map-views.js';
export { createMapMarker, updatePresence, releaseMapMarker, renderControl } from './marker-view.js';
