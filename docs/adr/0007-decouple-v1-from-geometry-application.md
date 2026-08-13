# ADR-0007: Decouple v1 from a preselected geometry application

- Status: Superseded by ADR-0008
- Date: 2026-08-12

## Context

The eight-week roadmap exists to produce inspectable Agent Infrastructure career evidence. Earlier documents named AutoGeoResearch as the first Research Application. That choice would reserve implementation and GPU time for 3D Vision before Harness Core, recovery, isolation, evaluation, and release evidence exists. It would also let an existing research background determine the future career roadmap instead of treating that background as reusable prior capability.

## Decision

Harness Core, Coding Benchmark, reliability experiments, and a reproducible release remain the only scheduled v1 mainline. No Research Application domain is preselected and no v1 time is reserved for geometry, 3DGS, point-cloud, or simulation-algorithm work.

A Research Application Candidate may be promoted only after the core gates pass. The qualification record must show all of the following:

1. the application adds distinct Agent Infrastructure career evidence rather than another domain-algorithm artifact;
2. its evaluator is objective, immutable to the agent, and cheap enough for repeated tests;
3. its setup, baseline, and reproduction fit the remaining time and compute budget;
4. it does not expose or depend on Protected Prior Work;
5. choosing it does not delay checkpoint/recovery, isolation, benchmark, CI, or release gates.

BVI remains Protected Prior Work and an existing research/GPU-engineering capability asset. This repository does not deny that experience, but it does not use BVI or a new geometry project to define the operator's target role.

## Consequences

Coding Benchmark may remain the only public application until the Harness is reliable. AutoGeoResearch can compete as one future candidate, but receives no default priority. Architecture must keep the Research Application seam domain-neutral, and career planning must report existing 3D research separately from future Agent Infra investment.
