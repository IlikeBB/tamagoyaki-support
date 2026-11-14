import { Surface } from './surface.js';
import NewsList from './components/NewsList.vue';
import ContentList from './components/ContentList.vue';
import ManagementList from './components/ManagementList.vue';
import RoomSettingsContent from './components/RoomSettingsContent.vue';
const surfaces = new WeakMap();
export function renderList(root, kind, data = {}) {
  const component = ['news', 'invitations'].includes(kind) ? NewsList :
    kind === 'roomSettings' ? RoomSettingsContent :
      ['reports', 'review', 'blocked', 'squadInvites'].includes(kind) ? ContentList : ManagementList;
  if (!surfaces.has(root)) surfaces.set(root, new Surface(root, component));
  surfaces.get(root).update({ model: { ...data, kind, items: (data.items || []).map(item => ({ ...item })) } });
}
