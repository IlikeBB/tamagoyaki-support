import { reactive } from 'vue';

export function createSessionStore() {
  return reactive({
    demo: true, authenticated: false, user: { id: 'me', nickname: '你' },
    room: null, rooms: [], members: [], tasks: [], pins: [], squads: [],
    mine: { squad: null, scope: 'off' }, activeVenue: 'makuhari',
    tab: 'tasks', filter: 'all', query: '', position: null, heading: null,
    scope: 'off', watch: null, radar: true, target: null, online: true, pending: false,
  });
}
