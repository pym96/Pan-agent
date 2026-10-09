# React page

React19, bundled with esbuild into same-origin static assets served by Go. The interface needs no routing library or separate development server. package-lock.json pins dependencies; `npm ci && npm run build` regenerates ignored dist/. React text rendering and server CSP keep uploaded HTML/script as data. No dangerouslySetInnerHTML, remote scripts, model calls or provider credentials.

This choice keeps login/upload/statistics/source inspection in one small component while the Go API owns authentication and imports. Backend authorization still applies to direct API calls; hiding buttons is not a security boundary. Browser behavior tests live in ../scripts/browser-test.mjs. See [app README](../README.md).
