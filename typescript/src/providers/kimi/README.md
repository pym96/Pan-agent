# Kimi providers

- [kimi-profile.ts](kimi-profile.ts): closed legacy and K3 identities; historical #53 source pins.
- [kimi-transport.ts](kimi-transport.ts): fixed endpoint, lazy credential access and cancellable bytes.
- [pan-kimi-model-adapter.ts](pan-kimi-model-adapter.ts): canonical encoding and complete SSE admission.
- [kimi-continuation.ts](kimi-continuation.ts): K3 private exact-message/session provenance and disposal.
- [K3 design and limits](../../../../docs/design/kimi-k3-offline.md); [legacy design](../../../../docs/design/preview-kimi.md).

## WO89 structural observations

`kimi-structure.ts` defines an optional fixed-shape `onStructure` observation from
`PanKimiModelAdapter`. It reports parser stages, reasoning field-type counts,
assembly state, tool completeness, terminal and usage presence without retaining
provider strings. Sink exceptions cannot change protocol results. The evaluation
Session stores the snapshot with each completed/failed exchange; acceptance,
private continuation and unknown-usage semantics are unchanged.
See [decision matrix](../../../../docs/design/protocol-verifier-89.md).
