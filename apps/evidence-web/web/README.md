# React page

React19, bundled with esbuild into same-origin static assets served by Go. The interface needs no routing library or separate development server. package-lock.json pins dependencies; `npm ci && npm run build` regenerates ignored dist/. React text rendering and server CSP keep uploaded HTML/script as data. No dangerouslySetInnerHTML, remote scripts, model calls or provider credentials.

This choice keeps login/upload/statistics/source inspection in one small component while the Go API owns authentication and imports. Backend authorization still applies to direct API calls; hiding buttons is not a security boundary. Browser behavior tests live in ../scripts/browser-test.mjs. See [app README](../README.md).

#107 adds Analysis.jsx for question submission, persisted status/history, computed answer, source links, CSV and canonical trace/usage. Polling reads the same account-gated APIs as direct clients. Offline/Faux labels remain visible; browser107.mjs checks both accounts and a modified synthetic report.

#108 Analysis.jsx adds conversation selection/creation, append while running, retained request IDs across uncertain submission, ordered task history and exact public context/hash. Prior independent tasks remain selectable. No HTML execution or client-side authorization assumptions.
