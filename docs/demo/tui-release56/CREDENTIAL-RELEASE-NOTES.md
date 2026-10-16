# v0.1.6 — actionable missing-credential guidance

Submitting a task without the configured environment API key now shows which variable is missing and how to configure or restart Pan. The task stays failed; no request is sent without credentials. Keychain-specific guidance does not incorrectly ask users to set an environment variable. Unknown provider errors remain generic; raw errors and secrets are never included in the new notice.

Download `pan-agent-0.1.6.tgz` and `SHA256SUMS`, then follow the [installation README](https://github.com/pym96/Pan-agent/blob/v0.1.6/README.md). No compiler, repository checkout, Python or new runtime dependency is required. MIT license; existing Markdown and prior demonstration releases remain available.

This is a narrow presentation fix discovered by independent installation/configuration testing. It does not change authentication, model/tool execution, retry or archive semantics. [Evidence](https://github.com/pym96/Pan-agent/blob/v0.1.6/docs/evidence/tui-release56/CREDENTIAL-GUIDANCE.md).
