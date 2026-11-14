# Vue runtime tasks

- [x] Session/UI stores, explicit module imports and one Vue application entry.
- [x] Vue-owned resources for all services, requests, timers, events and GPS.
- [x] Vue shell bindings, action dispatch, navigation and form event ownership.
- [x] No independent business scripts or production testing globals.
- [x] Unmount/remount, stale callbacks and existing functional regressions pass.
- [x] Build, dependency audit, secret scan and documentation.
- [x] Back up production, deploy without replacing its database and verify public UI.
- [x] Push the final implementation and verification record to vue-version.

Validation: all 38 core checks passed across the full run and the corrected Google Places rerun. After the unread indicators were bound to the UI store, chat, friend requests, News and lifecycle checks passed again. The strict squad invitation link unit check passed. A read-only preview on the actual HTTPS origin loaded the new local bundle under the existing CSP and verified live Google Maps, venue overlays/markers, zoom, navigation, settings and responsive light/dark layouts without writes. The asset audit reports 37 reachable Vue components, 31 referenced static assets and zero independent business scripts.

Deployment: the existing Vue directory now serves the managed runtime at the original HTTPS origin. The latest database was backed up before shutdown and after shutdown, kept in place throughout source deployment, and passed SQLite integrity checking after restart. The live browser check verified bundle 8d87d9d496aa, existing CSP, absence of application testing globals, Google Maps, venue navigation and responsive light/dark layouts; all API writes were blocked and none were attempted. Production is launched outside the terminal job through the hidden detached launcher. Local runtime metadata records the external backup path.
