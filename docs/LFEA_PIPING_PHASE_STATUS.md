# LFEA Piping Phase Status

Exact Phase 2D development base: `main` at `7fad71186b92e27ccc24bf1e37239dec688166d5`.

Program disposition: `BLOCKED`.

## Implemented phase boundaries

- Phase 1A governance and exact-head policy are merged.
- Phase 1B formally retires the orphaned continuum `lfea-007` suite without using it as Priority 2 evidence.
- Phase 2A compiles explicit B-2.5 and B-3.0 source-authority inputs before the bounded T0 solve and recovery chain.
- Phase 2B seals exact CAESAR II InputXML text, recomputes canonical geometry and B-1 conditioning, and binds the resulting source and topology identities to the existing Phase 2A request.
- Phase 2B compares the actual caller-supplied conditioned geometry with the recomputed InputXML topology; retaining an approved hash string over different geometry is rejected.
- Phase 2B does not infer material states, pipe sections, local-axis policy, constraint behavior or load cases from raw file labels; those remain caller-approved engineering authorities.
- Phase 2C retains the exact validated B-2.5 compilation, B-3.0 physical load case and T0 result in `linear-piping-source-analysis-context/v1`.
- Phase 2C revalidates the compilation and load-case semantic/evidence identities against the T0 parent set and preserves the existing result-only Phase 2A API.
- Phase 2D seals the exact InputXML source authority, recomputed conditioned-topology identity, ingestion evidence and retained Phase 2C context in `linear-piping-inputxml-analysis-context/v1`.
- Phase 2D parses and conditions the raw source once, preserves the existing Phase 2B result-only API, and exposes a direct governed handoff to Phase 3.
- Phase 3 can consume the retained Phase 2D compilation, load case and analysis result directly; downstream callers no longer need to reconstruct governed parent objects from hashes.
- Phase 3 provides governed support, anchor and nozzle interfaces, explicit frames and offsets, B-3.3 reaction grouping, local transformations, reference-point transfer and deterministic envelopes.
- Phase 4 provides caller-supplied nozzle allowable profiles, configured nozzle assessments, sustained and occasional B31.3 application orchestration, explicit ordered displacement-stress-range case pairs and a sealed application result across analysis, interface, nozzle and code identities.
- Phase 5 provides a current-only presentation contract, a textContent-only read-only result view, deterministic current audit JSON and qualified-only interface, nozzle and B31.3 CSV exports.
- Phase 5B mounts that existing presentation authority in the active WORKSPACE properties panel through `linear-piping-workspace-result-package/v1`.
- Phase 5B exposes import, clear, current-state inspection, audit-export and qualified engineering-export operations through the public `AnalysisWorkspace` boundary.
- Invalid or stale replacement packages clear the previously displayed result rather than leaving an apparently current surface.
- Render and export operations revalidate the current application semantic and evidence identities; a previously valid presentation is rejected after an application change.
- Conditional current results remain reviewable in audit evidence but cannot produce engineering issue CSVs.
- Phase 6A provides a deterministic comparison harness for independently supplied project and commercial reference values; its committed fixtures remain explicitly ineligible as project evidence.
- `check:linear-piping-analysis-consumer`, `check:lfea-interfaces`, `check:lfea-code-application` and `check:lfea-presentation-export` are registered inside `check:lfea-core`.
- Phases 2B, 2C and 2D run under `check:linear-piping-analysis-consumer`; Phase 5B runs under `check:lfea-presentation-export` with a separate browser contract.
- Release readiness remains fail closed through the Section 9 findings ledger and G0-G10 release-evidence ledger.

## Still open

- Exact-head CI evidence remains unresolved while repository Actions jobs fail before exposing executable steps or retained logs.
- InputXML provenance is now sealed with the retained T0 context, but a complete project application still requires caller-approved B-2.2 material resolutions, B-2.3 section resolutions, B-2.4 axes, constraints, B-3.0 loads, interface definitions, nozzle allowable profiles and B31.3 datasets/checks.
- A complete multi-case orchestrator has not yet consumed retained InputXML contexts plus separately governed Phase 3 and Phase 4 authorities to produce the final application package.
- Phase 2B/2D accepts only metre-based InputXML. Unit conversion is a separate unresolved authority and is not performed silently.
- Real-model reconciliation and commercial corroboration have not been supplied.
- Performance qualification and rollback rehearsal remain unresolved.
- Real ASME B31.3/B31J datasets and equipment/nozzle allowable profiles remain caller-supplied project authorities; no licensed or vendor numerical tables are embedded in source.
- Nonlinear gap, lift-off, contact and friction behavior remains outside the linear release.

## Release rule

No downstream phase may change `programDisposition` to `QUALIFIED` until every gate in `release-evidence/lfea-piping-release-evidence.json` is `VERIFIED`, every required artifact path is populated, `npm run check:lfea-piping-release` passes at the exact release head, and project reconciliation evidence is retained.
