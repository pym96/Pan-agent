# ADR-0016: Make TypeScript/Pi the authoritative product path

- Status: Proposed
- Date: 2026-09-05
- Decision owner: Human/Master promotion of WorkOrder #24 (Criteria-Version `1.0`, C-CUT-01…10)
- Base: accepted main `3dc834ef3405564d8eeff802ca54cb5874079df3`

## Context

The repository retained two runnable implementations and several experiments without one unambiguous default. The TypeScript/Pi stack already owns the current Human entry, trusted-local workspace and authority disclosure, attributable outcomes, and three-lane memory. The older implementation and experiment code remain useful, but presenting them alongside the product route makes navigation, maintenance responsibility, and acceptance boundaries ambiguous.

The cutover must not erase the learning trail. Retained inner ideas include canonical tool semantics, Context behavior, cancellation, and events. Retained outer ideas include explicit workspace and authority disclosure plus attributable outcomes. Those ideas need a language-neutral contract so the product can be tested without importing another implementation.

## Decision

1. The TypeScript/Pi `GeneralAgentSession`, TUI, DeepSeek Adapter, trusted-local tools, and memory lanes are the authoritative product path and the only default install/run route.
2. The Python evented runtime and TUI are reference-only. They remain runnable and inspectable, but are not product dependencies or an alternative default.
3. ReAct, protocol-reliability, DeepSeek campaign, proof-pack/evaluator, and benchmark machinery are experiment/reference lanes. They retain their original scopes and do not define the current product architecture.
4. Versioned JSON fixtures under `conformance/` express canonical tool semantics, terminal kinds, active-tool cancellation, and cross-task Context behavior. The TypeScript runner exercises them through the public `GeneralAgentSession` Interface.
5. TypeScript product tests and conformance checks must run when the reference implementation package is physically absent. No duplicated AgentLoop or task-specific experiment logic is copied into the product.
6. All historical Evidence, Wiki pages, benchmark locks, reports, and the Verified Project Fact register are preserved byte-identically by this cutover.

## Consequences

- Root navigation leads with the TypeScript install and TUI command and labels every retained lane.
- The implementation-neutral fixtures become the narrow translation boundary between retained semantics and the authoritative product.
- Reference and experiment code may still regress under the full repository suite, but it cannot be imported by TypeScript product code or required for its focused tests.
- This decision makes no sandbox, containment, benchmark, model-quality, or capability-equivalence claim.
- WorkOrder #24 remains a candidate until the Human trial and independent Regulator review complete.

## Rejected alternatives

- **Keep two co-equal product paths:** operators and future agents would continue to receive conflicting defaults and ownership signals.
- **Delete the reference and experiments:** this would destroy useful provenance and violate the requirement to preserve historical Evidence.
- **Port the prior AgentLoop wholesale:** duplicated orchestration would undermine the Pi-owned session Interface and make the cutover nominal rather than architectural.
- **Test conformance by importing the reference package:** this would leave the authoritative product dependent on the implementation it supersedes.
