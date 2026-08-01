# LAFEA Non-Bucket NB-T3 — Registry v2 and Composition Root

## Scope

NB-T3 binds each current non-bucket LAFEA stage to one registry-v2 authority path. It consolidates route identity without adding numerical, lifecycle, code, report or release authority.

## Registry v2 bindings

Every stage entry now binds:

- one composition-root identity;
- exact source-normalizer, canonical-input, calculator, result-acceptance and lifecycle-producer component identities;
- one lifecycle profile identity;
- one benchmark-manifest identity for implemented stages;
- one release state and governing gate policy.

LAFEA.1–LAFEA.5 remain `RELEASE_NOT_QUALIFIED`. LAFEA.6 retains an explicit unsupported composition route, no calculator, no producer and no benchmark manifest.

## Single composition authority

`src/workspace/lafea-stage-composition-root.js` is the only workspace module that binds stage identity to current-core functions. The workbench model delegates normalization, canonical-input creation, calculation and result acceptance to this root. Existing qualified core packages and numerical behavior are unchanged.

## Benchmark authority

The registry binds five stage manifests covering the minimum independent gate catalog:

- `NB-BM-01` through `NB-BM-16`;
- `NB-AD-01` through `NB-AD-16`.

Every gate is `REQUIRED_UNBOUND`. Expected values remain subject to independent expected-evidence authority. Any required gate failure or missing binding blocks release. No expected numerical values are authored in NB-T3 and no manifest is qualified.

## Lifecycle and producer binding

Registry lifecycle-profile identities must match the retained NB-T1 profiles. Current NB-T2 producer references must begin with the registry-bound producer component identity. Accepted current-core calculations remain distinct from code and release qualification.

## Preserved authority

- LAFEA.1 load-transfer and pressure-baseline authority is unchanged.
- LAFEA.2 nominal pipe-section screening authority is unchanged.
- LAFEA.3 T3/T6/Q8 linear-continuum authority is unchanged.
- LAFEA.4 remains the legacy five-DOF `CST_DKT_TRI3_THIN_SHELL_V1` route.
- LAFEA.5 remains caller-authored host-shell footprint only.
- LAFEA.6 remains `ENGINE_NOT_IMPLEMENTED`.
- No numerical core, lifecycle contract, controller, view, presenter or release file is changed.
- No convergence, code-assessment, report or release evidence is synthesized.

## Release disposition

NB-T3 establishes registration and composition identity only. It does not establish `CODE_READY` or `RELEASE_QUALIFIED`. Independent benchmark evidence and later authorized vertical-completion packages remain required.
