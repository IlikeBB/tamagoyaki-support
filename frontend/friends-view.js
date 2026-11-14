import { createApp, reactive, nextTick } from 'vue';
import FriendsPanel from './components/FriendsPanel.vue';

// Vue owns the shared panel only while the friends tab is selected.
// Location permissions and API synchronization remain in FriendsClient.
export class FriendsView {
  constructor(actions) {
    this.actions = actions;
    this.revision = 0;
    this.state = reactive({
      user: null, query: '', friends: [], incoming: [], outgoing: [],
      sharing: false, shareStatus: '', syncStatus: '', username: '',
      inviting: false, inviteError: '', pending: null, actionError: '',
    });
  }

  reset() {
    this.revision++;
    Object.assign(this.state, {
      user: null, friends: [], incoming: [], outgoing: [], username: '',
      sharing: false, shareStatus: '', syncStatus: '', inviting: false,
      inviteError: '', pending: null, actionError: '',
    });
  }

  update(context) {
    if (context.user?.id !== this.state.user?.id) this.reset();
    Object.assign(this.state, context);
  }

  mount(root) {
    if (this.root === root) return;
    this.unmount();
    this.root = root;
    this.app = createApp(FriendsPanel, { controller: this });
    this.app.mount(root);
  }

  unmount() {
    this.app?.unmount();
    this.app = null;
    this.root = null;
  }

  async invite() {
    const state = this.state;
    if (!state.user || state.inviting) return;
    const revision = this.revision, username = state.username;
    state.inviting = true; state.inviteError = '';
    try {
      await this.actions.invite(username);
      if (revision === this.revision && state.username === username) state.username = '';
    } catch (error) {
      if (revision === this.revision) state.inviteError = error.message;
    } finally {
      if (revision === this.revision) state.inviting = false;
    }
  }

  async act(action, id, button) {
    const state = this.state;
    if (!state.user || state.pending) return;
    const revision = this.revision;
    state.pending = `${action}:${id || ''}`; state.actionError = '';
    try { await this.actions.act(action, id); }
    catch (error) { if (revision === this.revision) state.actionError = error.message; }
    finally {
      if (revision === this.revision) {
        state.pending = null;
        await nextTick();
        if (revision === this.revision && !button?.isConnected && !document.querySelector('dialog[open]')) {
          this.root?.querySelector('#friend-share-toggle')?.focus({ preventScroll: true });
        }
      }
    }
  }
}
