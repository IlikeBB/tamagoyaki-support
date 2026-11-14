import { getCurrentScope, onScopeDispose } from 'vue';

const liveScopes = new Set();
const documentOwners = new WeakMap();
const abortError = () => new DOMException('Application scope was disposed.', 'AbortError');

export function resourceStats() {
  return [...liveScopes].reduce((result, scope) => {
    result.scopes++; result.listeners += scope.listeners; result.timers += scope.timers.size;
    result.requests += scope.requests.size; result.watches += scope.watches.size;
    return result;
  }, { scopes: 0, listeners: 0, timers: 0, requests: 0, watches: 0 });
}

export class Resources {
  constructor() {
    this.active = true; this.cleanups = new Set(); this.listeners = 0;
    this.timers = new Map(); this.requests = new Set(); this.watches = new Set(); this.listenerRecords = new WeakMap();
    liveScopes.add(this);
    if (getCurrentScope()) onScopeDispose(() => this.dispose());
  }
  defer(cleanup) {
    if (!this.active) { cleanup(); return () => {}; }
    this.cleanups.add(cleanup);
    return () => this.cleanups.delete(cleanup);
  }
  listen(target, name, handler, options) {
    if (!target || !this.active) return () => {};
    const guarded = event => { if (this.active) handler.call(target, event); };
    target.addEventListener(name, guarded, options); this.listeners++;
    const targetRef = new WeakRef(target), guardedRef = new WeakRef(guarded), originalRef = new WeakRef(handler);
    let removed = false;
    const remove = () => {
      if (removed) return; removed = true;
      targetRef.deref()?.removeEventListener(name, guardedRef.deref(), options);
      this.listenerRecords.get(targetRef.deref())?.get(name)?.delete(originalRef.deref());
      this.listeners--; this.cleanups.delete(remove);
    };
    if (!this.listenerRecords.has(target)) this.listenerRecords.set(target, new Map());
    const records = this.listenerRecords.get(target);
    if (!records.has(name)) records.set(name, new Map());
    records.get(name).set(handler, remove);
    this.defer(remove); return remove;
  }
  unlisten(target, name, handler) { this.listenerRecords.get(target)?.get(name)?.get(handler)?.(); }
  bind(target, property, handler) {
    if (!target || !this.active) return handler;
    const previous = target[property];
    const guarded = typeof handler === 'function' ? function (...args) { if (owner.active) return handler.apply(this, args); } : handler;
    const owner = this;
    target[property] = guarded;
    const targetRef=new WeakRef(target),guardedRef=typeof guarded==='function'?new WeakRef(guarded):null,previousRef=typeof previous==='function'?new WeakRef(previous):null;
    const guardedValue=guardedRef?null:guarded,previousValue=previousRef?null:previous;
    this.defer(() => {
      const element=targetRef.deref(),current=guardedRef?guardedRef.deref():guardedValue;
      if(element&&element[property]===current)element[property]=previousRef?previousRef.deref()||null:previousValue;
    });
    return handler;
  }
  timeout(callback, delay, ...args) {
    if (!this.active) return null;
    const id = setTimeout(() => { this.timers.delete(id); if (this.active) callback(...args); }, delay);
    this.timers.set(id, () => clearTimeout(id)); return id;
  }
  interval(callback, delay, ...args) {
    if (!this.active) return null;
    const id = setInterval(() => { if (this.active) callback(...args); }, delay);
    this.timers.set(id, () => clearInterval(id)); return id;
  }
  frame(callback) {
    if (!this.active) return null;
    const id = requestAnimationFrame(time => { this.timers.delete(id); if (this.active) callback(time); });
    this.timers.set(id, () => cancelAnimationFrame(id)); return id;
  }
  clearTimeout(id) { this.timers.get(id)?.(); this.timers.delete(id); }
  clearInterval(id) { this.clearTimeout(id); }
  cancelAnimationFrame(id) { this.clearTimeout(id); }
  watchPosition(success, failure, options) {
    if (!this.active) return null;
    const id = navigator.geolocation.watchPosition(value => { if (this.active) success(value); }, error => { if (this.active) failure(error); }, options);
    this.watches.add(id); return id;
  }
  clearWatch(id) { navigator.geolocation?.clearWatch(id); this.watches.delete(id); }
  getCurrentPosition(success, failure, options) {
    if (this.active) navigator.geolocation.getCurrentPosition(value => { if (this.active) success(value); }, error => { if (this.active) failure(error); }, options);
  }
  async fetch(input, options = {}) {
    if (!this.active) throw abortError();
    const controller = new AbortController(); this.requests.add(controller);
    const relay = () => controller.abort(options.signal.reason);
    if (options.signal?.aborted) relay(); else options.signal?.addEventListener('abort', relay, { once: true });
    const release = () => { this.requests.delete(controller); options.signal?.removeEventListener('abort', relay); };
    try {
      const response = await fetch(input, { ...options, signal: controller.signal });
      if (!this.active) throw abortError();
      if (!response.ok || !response.body) release();
      return new Proxy(response, { get: (target, key) => {
        const value = Reflect.get(target, key, target);
        if (['json', 'text', 'blob', 'arrayBuffer', 'formData'].includes(key)) return async (...args) => {
          try { const result = await value.apply(target, args); if (!this.active) throw abortError(); return result; } finally { release(); }
        };
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    } catch (error) { release(); throw error; }
  }
  dispose() {
    if (!this.active) return;
    this.active = false;
    for (const controller of this.requests) controller.abort(); this.requests.clear();
    for (const id of this.watches) navigator.geolocation?.clearWatch(id); this.watches.clear();
    for (const cancel of this.timers.values()) cancel(); this.timers.clear();
    for (const cleanup of [...this.cleanups].reverse()) { try { cleanup(); } catch (error) { console.error(error); } }
    this.cleanups.clear(); liveScopes.delete(this);
  }
}

export class VueService {
  constructor() { this.resources = new Resources(); }
}
export function ownDocument(document, resources) {
  if (documentOwners.get(document)?.active) throw new Error('This document already has a Vue application owner.');
  documentOwners.set(document, resources);
  resources.defer(() => { if (documentOwners.get(document) === resources) documentOwners.delete(document); });
}
export const documentResources = element => documentOwners.get(element.ownerDocument);
