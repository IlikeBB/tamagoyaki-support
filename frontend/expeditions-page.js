import { Surface } from './surface.js';
import { VueService } from './runtime/resources.js';
import { reactive, shallowRef, nextTick } from 'vue';
import ExpeditionsView from './components/ExpeditionsPage.vue';

// Vue expedition feature; application commands are injected by useApplication.
export class ExpeditionsPage extends VueService {
  constructor(root, actions) {
    super(); const resources = this.resources; resources.defer(()=>this.app?.clear());
    this.root = root;
    this.actions = actions;
    this.state = reactive({
      uid: undefined, generation: 0, catalogGeneration: 0, openedForUser: false,
      query: '', mode: 'joined', venue: null, catalog: [],
      loadingMine: false, loadingCatalog: false, mineError: '', catalogError: '', busy: null,
    });
    this.context = shallowRef(actions.context());
    this.app = new Surface(root, ExpeditionsView);
    this.app.update({ controller: this }); root.setAttribute("data-v-app", "");
  }

  get mode() { return this.state.mode; }
  visible() { return !this.root.hidden; }

  sync() {
    const ctx = this.actions.context(), uid = ctx.user?.id || null;
    const state = this.state, changed = uid !== state.uid;
    this.context.value = { ...ctx, rooms: [...ctx.rooms], venues: [...ctx.venues] };
    if (changed) {
      Object.assign(state, {
        uid, generation: state.generation + 1, catalogGeneration: state.catalogGeneration + 1,
        openedForUser: false, catalog: [], query: '', mineError: '', catalogError: '',
        loadingMine: false, loadingCatalog: false, busy: null,
        mode: uid && ctx.rooms.length ? 'joined' : 'browse',
      });
    }
    if (!ctx.venues.some(venue => venue.id === state.venue)) state.venue = ctx.venue || ctx.venues[0]?.id;
    if (changed && this.visible()) { this.loadMine(); this.loadCatalog(); }
  }

  open({ focus = true } = {}) {
    this.sync();
    const state = this.state;
    if (!state.openedForUser) {
      state.openedForUser = true;
      this.selectMode(state.uid && this.context.value.rooms.length ? 'joined' : 'browse');
    }
    if (!state.loadingMine) this.loadMine();
    if (!state.loadingCatalog) this.loadCatalog();
    if (focus) nextTick(() => { if (this.visible()) this.root.querySelector('h1')?.focus({ preventScroll: true }); });
  }

  selectMode(mode) { this.state.mode = mode === 'browse' ? 'browse' : 'joined'; }
  selectVenue(id) { this.state.venue = id; this.loadCatalog(); }

  matches(room) {
    const venue = this.context.value.venues.find(venue => venue.id === room.venue);
    const query = this.state.query.toLocaleLowerCase().trim();
    return [room.name, venue?.name, room.event_date, room.event_end_date].some(value => value?.toLocaleLowerCase().includes(query));
  }

  rename(room) {
    this.state.catalog = this.state.catalog.map(item => item.id === room.id ? { ...item, name: room.name } : item);
    this.sync();
  }

  manage(id) {
    const room = this.actions.context().rooms.find(room => room.id === id);
    if (room) this.actions.manage(room);
  }

  preview(id) {
    const ctx = this.actions.context();
    const room = [...ctx.rooms, ...this.state.catalog].find(room => room.id === id);
    if (room) this.actions.preview({ ...room, joined: ctx.rooms.some(item => item.id === id) });
  }

  async loadMine() {
    const state = this.state;
    if (!state.uid || state.loadingMine) return;
    const uid = state.uid, generation = state.generation;
    state.loadingMine = true; state.mineError = '';
    try {
      const data = await this.actions.api('/me');
      if (generation !== state.generation || uid !== this.actions.context().user?.id) return;
      if (data.user?.id !== uid) { this.actions.expired(); return; }
      this.actions.rooms(data.expeditions);
      this.sync();
    } catch (error) {
      if (generation === state.generation) state.mineError = error.message;
    } finally {
      if (generation === state.generation) state.loadingMine = false;
    }
  }

  async loadCatalog() {
    const state = this.state;
    if (!state.venue) return;
    const venue = state.venue, uid = state.uid, generation = ++state.catalogGeneration;
    state.loadingCatalog = true; state.catalogError = ''; state.catalog = [];
    try {
      const data = await this.actions.api(`/venues/${encodeURIComponent(venue)}/expeditions`);
      if (generation !== state.catalogGeneration || venue !== state.venue || uid !== (this.actions.context().user?.id || null)) return;
      state.catalog = data.expeditions;
    } catch (error) {
      if (generation === state.catalogGeneration) state.catalogError = error.message;
    } finally {
      if (generation === state.catalogGeneration) state.loadingCatalog = false;
    }
  }

  async admit(id, joined) {
    const state = this.state;
    if (state.busy) return;
    if (!state.uid) { this.actions.login(); return; }
    const uid = state.uid, generation = state.generation;
    state.busy = id;
    try { await (joined ? this.actions.enter(id, uid) : this.actions.join(id, uid)); }
    catch (error) { if (generation === state.generation) this.actions.toast(error.message); }
    finally { if (generation === state.generation) { state.busy = null; this.sync(); } }
  }

  destroy() {
    this.state.generation++; this.state.catalogGeneration++;
    this.app.clear();
  }
}
