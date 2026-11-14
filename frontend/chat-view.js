import { Surface } from './surface.js';
import { VueService } from './runtime/resources.js';
import { reactive, nextTick } from 'vue';
import ChatDialog from './components/ChatDialog.vue';

export class ChatView extends VueService {
  constructor(root, actions) {
    super(); const resources = this.resources; resources.defer(()=>this.app?.clear());
    this.root = root; this.actions = actions; this.revision = 0;
    this.state = reactive({
      filter: 'all', contacts: [], active: null, messages: [], uid: null, draft: '',
      busy: false, online: navigator.onLine, status: '每 5 秒同步', retry: false,
      error: '', empty: '', hasOlder: false, newMessages: false,
    });
    this.app = new Surface(root, ChatDialog);
    this.app.update({ controller: this }); root.setAttribute("data-v-app", "");
    resources.listen(root, 'close', () => {
      this.fit(); actions.closed();
      document.querySelector('#chat-launcher').focus({ preventScroll: true });
    });
    const fit = () => this.fit();
    resources.listen(window.visualViewport, 'resize', fit);
    resources.listen(window.visualViewport, 'scroll', fit);
    resources.listen(window, 'resize', fit);
    resources.listen(root, 'focusin', fit);
    resources.listen(root, 'focusout', () => resources.frame(fit));
  }

  get filter() { return this.state.filter; }
  set filter(value) { this.state.filter = value; }
  get input() { return this.root.querySelector('#chat-input'); }
  get form() { return this.root.querySelector('#chat-form'); }
  get scroll() { return this.root.querySelector('#chat-scroll'); }

  open() { if (!this.root.open) this.root.showModal(); this.fit(); }

  // The launcher belongs to the outer application; Vue owns the dialog only.
  badge(count) {
    this.actions.badge(count);
  }

  status(message, error = false) { this.state.status = message; this.state.retry = error; }
  error(message = '') { this.state.error = message; }

  threads(contacts, active) {
    this.state.contacts = contacts.map(contact => ({ ...contact, latest: contact.latest ? { ...contact.latest } : null }));
    this.state.active = active ? { ...active } : null;
    this.composer(this.state.busy);
  }

  select(contact, draft = '') {
    const revision = ++this.revision;
    this.root.dataset.view = contact ? 'conversation' : 'list';
    Object.assign(this.state, {
      active: contact ? { ...contact } : null, uid: null, draft, messages: [], newMessages: false,
      hasOlder: false, empty: contact ? '正在載入對話…' : '', error: '', busy: false,
    });
    this.composer(false);
    nextTick(() => {
      if (revision === this.revision && this.root.open) this.root.querySelector('#chat-title').focus({ preventScroll: true });
    });
  }

  nearBottom() { return this.scroll.scrollHeight - this.scroll.scrollTop - this.scroll.clientHeight < 72; }

  async messages(messages, uid, { initial = false, prepend = false, hasOlder = false } = {}) {
    const near = this.nearBottom(), top = this.scroll.scrollTop, height = this.scroll.scrollHeight;
    const existing = new Set(this.state.messages.map(message => message.id)), revision = this.revision;
    this.state.messages = messages.map(message => ({ ...message }));
    this.state.uid = uid; this.state.hasOlder = hasOlder;
    this.state.empty = '還沒有訊息，傳句話打個招呼吧。';
    await nextTick();
    if (revision !== this.revision) return;
    if (prepend) this.scroll.scrollTop = top + this.scroll.scrollHeight - height;
    else if (initial || near) { this.scroll.scrollTop = this.scroll.scrollHeight; this.state.newMessages = false; }
    else if (messages.some(message => !existing.has(message.id))) this.state.newMessages = true;
  }

  composer(busy = false) {
    this.state.busy = busy; this.state.online = navigator.onLine;
    nextTick(() => this.resizeInput());
  }

  inputChanged(value) { this.actions.draft(value); this.resizeInput(); }
  clearDraft(value) { if (this.input.value === value) this.state.draft = ''; }
  resizeInput() {
    if (!this.resources.active || !this.input) return;
    this.input.style.height = '0px';
    this.input.style.height = Math.min(112, Math.max(48, this.input.scrollHeight)) + 'px';
  }
  scrolled() { if (this.nearBottom()) { this.state.newMessages = false; this.actions.read(); } }
  latest() { this.scroll.scrollTop = this.scroll.scrollHeight; this.state.newMessages = false; this.actions.read(); }

  fit() {
    if (!this.resources.active) return;
    const viewport = window.visualViewport, focused = this.root.contains(document.activeElement) && document.activeElement.matches('textarea,input');
    const full = document.body.getBoundingClientRect().height;
    const keyboard = this.root.open && focused && viewport && Math.abs(viewport.scale - 1) < .01 && viewport.height < full - 150;
    this.root.classList.toggle('chat-keyboard', !!keyboard);
    if (keyboard) {
      this.root.style.setProperty('--chat-height', `${Math.round(viewport.height)}px`);
      this.root.style.setProperty('--chat-top', `${Math.round(viewport.offsetTop)}px`);
    } else { this.root.style.removeProperty('--chat-height'); this.root.style.removeProperty('--chat-top'); }
  }
}
