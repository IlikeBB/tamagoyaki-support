import { Surface } from './surface.js';
import ProfileContent from './components/ProfileContent.vue';

export class ProfileContentView {
  constructor(root) { this.surface = new Surface(root, ProfileContent); this.clear(); }
  clear() { this.props = { profile: null, items: null, content: {} }; this.surface.update(this.props); }
  render(data, tab, editing, draft) {
    Object.assign(this.props, { profile: { ...data.profile }, tab, editing, draft: draft ? { ...draft } : null, items: null, next: null });
    this.surface.update({ ...this.props });
  }
  records(items, tab, total, next, content, historyBusy) {
    Object.assign(this.props, { items: items.map(item => ({ ...item })), tab, total, next, content: { ...content }, historyBusy });
    this.surface.update({ ...this.props });
  }
  selectTab(tab) { this.props.tab = tab; this.props.items = null; this.props.next = null; this.surface.update({ ...this.props }); }
}
