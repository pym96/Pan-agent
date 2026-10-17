# Upstream pin and license

Runtime: `@earendil-works/pi-coding-agent@1.3.0`, MIT, installed exactly via `pi/package-lock.json` including all transitive integrities. Main-package SHA512: `V/WoCjA2hQSe3QLWIUB24cTRdtEdeLiIzkDqU5RMXV6VWuD+KGZnzVBMhglwdnQTySkehZsjt8a3g6Jd2g4nnw==`.

The official [npm provenance attestation](https://registry.npmjs.org/-/npm/v1/attestations/@earendil-works%2fpi-coding-agent@1.3.0) resolves tag `v1.3.0` to **71023aec1546d6d677a65669c5665c0927ce0dd0** in [earendil-works/pi](https://github.com/earendil-works/pi/tree/71023aec1546d6d677a65669c5665c0927ce0dd0). This differs from the initially inspected moving main `8efd314fa3d3232ce197d8d7a6a5660530b9d83e`; the package/tag is the execution identity. Attestation content is retained as source evidence; no claim of independent Sigstore signature verification.

Integration follows the package's shipped `docs/sdk.md` and exported `createAgentSession`, `ModelRuntime`, `SettingsManager`, `SessionManager`, `DefaultResourceLoader`. No Pi source is copied or forked. Published1.3.0 does not export AuthStorage; an explicit empty read-only CredentialStore is supplied via the documented runtime option. A configured local provider key is a fixture value, not an ambient credential.

Pi and its dependencies retain upstream licenses in installed packages. Go pgx/v5 v5.7.6 is MIT; indirect module versions and checksums are in go.mod/go.sum. PostgreSQL uses its upstream PostgreSQL License. The small existing Python base image is used only as an OS container here; Python is an optional probe-script dependency, not part of Go/Pi runtime orchestration. Container images are digest pinned in Compose. Pan's repository MIT license applies to the new adapter/service code.
