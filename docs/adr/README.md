# Architecture Decisions

Architecture decisions record target structure and trade-offs; they do not prove implementation.

- ADR-0001, ADR-0003, and ADR-0007 are superseded historical research-product decisions.
- ADR-0002, ADR-0004, ADR-0005, ADR-0006, and ADR-0008 are accepted decisions from the current history.
- [`0009-general-runtime-and-vertical-domain-packs.md`](0009-general-runtime-and-vertical-domain-packs.md) is Human-accepted and supersedes the single Local Workspace product assumption in ADR-0008. Its implementation candidate remains pending independent verification.
- [`0010-external-and-vertical-evaluation-lanes.md`](0010-external-and-vertical-evaluation-lanes.md) is Human-accepted. It keeps PinchBench compatibility and the local 30-case vertical campaign above the Runtime seam; no Adapter or score exists yet.
- [`0011-react-mvp-before-swe-aci.md`](0011-react-mvp-before-swe-aci.md) is Human-accepted. It froze a five-case bash-only Act/ReAct learning smoke before any SWE-agent-style ACI expansion; a sixth independent review reproduced the ordinary candidate-Evidence boundary without creating a VPF or score.
- [`0012-freeze-protocol-reliability-v1.md`](0012-freeze-protocol-reliability-v1.md) is Human-accepted. It freezes fixed-context JSON/Strict transport and one-repair reliability measurement before coding ACI treatments; implementation and any result require independent review.
- [`0013-typed-native-history-translation-adapter.md`](0013-typed-native-history-translation-adapter.md) is Human-accepted after WorkOrder #4's offline candidate passed its independent Gate on 2026-08-25. It places complete provider history translation, correlation validation, separate reasoning, and ModelProfile-owned output ceilings behind one typed Adapter; no live Provider compatibility or project fact is implied.
- [`0014-evented-agent-loop-and-behavioral-eval.md`](0014-evented-agent-loop-and-behavioral-eval.md) is Human-accepted after WorkOrder #3's design-freeze candidate passed its independent Gate on 2026-08-25. It makes the Run Event Log authoritative, places Provider lifecycle behind one ModelGateway Interface, keeps TUI as a consumer, and freezes the shared adaptive Context policy plus Behavioral Eval v0; downstream implementation and execution require separate WorkOrders.
