# Vue application ownership

Keep the existing product behavior and Python API while making Vue own the complete browser application. Work in this isolated checkout, verify against fresh QA databases, then publish the complete change on `vue-version` and update the existing production directory.

1. Introduce Vue session/UI stores and an application composable. Import browser services as modules rather than independent global scripts. Verify a single application entry and no business globals in production.
2. Give every service a Vue-owned resource scope. Track listeners, timers, requests, GPS watches, render surfaces and SDK objects; dispose them on unmount. Verify unmount/remount and late callbacks.
3. Bind shell state and action routing through Vue. Preserve authorization, account-generation guards, forms, drafts, focus, map gestures and background location rules. Verify existing functional browser tests.
4. Remove retired script entry files, update architecture checks and documentation, build and run isolated regressions. Back up the current database, deploy to the same root/origin, and run read-only live checks.

No new dependency or backend/schema change is required. Google Maps/Leaflet and browser permission APIs remain external SDKs, owned by the application composable. Native DOM work for canvas, focus, geometry and SDK overlays is retained at those boundaries. Plans are internal checkpoints under the user's standing authorization.
