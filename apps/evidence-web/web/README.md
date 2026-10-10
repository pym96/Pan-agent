# React page

React19, bundled with esbuild into same-origin static assets served by Go. The interface needs no routing library or separate development server. package-lock.json pins dependencies; `npm ci && npm run build` regenerates ignored dist/. React text rendering and server CSP keep uploaded HTML/script as data. No dangerouslySetInnerHTML, remote scripts, model calls or provider credentials.

This choice keeps login/upload/statistics/source inspection in one small component while the Go API owns authentication and imports. Backend authorization still applies to direct API calls; hiding buttons is not a security boundary. Browser behavior tests live in ../scripts/browser-test.mjs. See [app README](../README.md).

#107 adds Analysis.jsx for question submission, persisted status/history, computed answer, source links, CSV and canonical trace/usage. Polling reads the same account-gated APIs as direct clients. Offline/Faux labels remain visible; browser107.mjs checks both accounts and a modified synthetic report.

#108 Analysis.jsx adds conversation selection/creation, append while running, retained request IDs across uncertain submission, ordered task history and exact public context/hash. Prior independent tasks remain selectable. No HTML execution or client-side authorization assumptions.

#109 presents distinct cancel and replace controls. The replacement impact on queued follow-ups is stated before action. Polling includes cancelling; received intent is separate from confirmed stop. Old attempt usage/diagnostics remain labelled as historical, with unknowns not zero-filled. Control IDs survive uncertain request failure and change after acknowledged completion.

#110 adds an explicit owner-bound checkpoint resume action, truthful recoverable/resuming/completed states, distinct attempts and deduplicated known/unknown accounting. Private checkpoint/Provider state never enters the browser. Faux-only limits and unsupported real Kimi recovery are displayed beside the action.

#111 adds explicit “核对并恢复 · 重建环境”, unresolved feedback, successful reconciliation and actual tool accounting through the existing task/history view. No private receipt or provider continuation is projected.

#112 displays the selected task execution generation, Worker identity and revoked status; separate conversation selections retain independent result/source/CSV histories. `browser112.mjs` checks two real Workers and browser readback.

#113 keeps the existing task UI and adds a five-second stale-display notice.
Control responses remain PG-backed. `scripts/browser113.mjs` checks cached
answers, file downloads, source navigation and visible cancellation feedback.
