# LAFEA Non-Bucket NB-T2 — Source and Producer Integration

## Work package

`NB-T2 — SOURCE AND PRODUCER INTEGRATION`

## Baseline

- Accepted NB-T1 merge/current main: `59a27f9872f67a2c436089fbb7d339cffb2a7554`
- Branch: `feat/lafea-nb-t2-source-producers`
- Numerical-core authority changed: **No**
- Registry v2 implemented: **No — deferred to NB-T3**
- Shell authority changed: **No**
- LAFEA.6 enabled: **No**
- Code or release authority promoted: **No**

## Source authority

`lafea-source-authority/v1` binds one normalized stage document to:

- exact stage identity;
- `LAFEA_CANNICAL_JSON_SHA256_V1` canonicalization;
- a `sha256:<64-hex>` engineering source hash;
- the editor's `fnv1a64` document digest retained only as a revision token;
- an explicit origin reference.

Root `meshConfig` is excluded from engineering source authority. Display, render-packet and visual-mesh data are not promoted as engineering source or analysis-mesh evidence.

## Typed source lifecycle events

Every governed edit transition issues `lafea-source-authority-event/v1` with:

- previous and current SHA-256 source hashes;
- previous and current document revision digests;
- exact stage and invalidation class;
- a bound `lafea-lifecycle-event/v1` source event.

Descriptor-owned invalidation classes are retained for direct edits. Undo and redo reuse the recorded transition class. Restoring an earlier source hash does not restore prior artifact qualification; evidence remains stale or requires revalidation until a new accepted calculation produces current records.

## Current-core producer adapters

`lafea-lifecycle-producer-batch/v1` translates an already accepted workbench execution into explicit profile-authorized records. It does not invoke a numerical kernel.

Analytical LAFEA.1 and LAFEA.2 produce:

- `CANONICAL_MODEL`;
- `EXECUTION`;
- `RESULT_EVIDENCE`;
- LAFEA.2 `SCREENING_ASSESSMENT` from retained accepted screening envelopes.

FEA-profile LAFEA.3, LAFEA.4 and LAFEA.5 produce:

- `CANONICAL_MODEL`;
- `ANALYSIS_GEOMETRY`;
- `ANALYSIS_MESH` from caller-authored source mesh plus retained accepted mesh evidence;
- `EXECUTION`;
- `RECOVERY` from retained accepted core result evidence.

The adapters do not produce `CONVERGENCE`, `CODE_ASSESSMENT` or `REPORT_EVIDENCE`. LAFEA.6 produces no engineering artifacts.

## Hash authority

Every source, artifact and opaque parent/profile hash emitted by NB-T2 is canonical SHA-256. Existing core-internal FNV semantic hashes may remain inside retained result payloads, but they are not used as lifecycle artifact identities or parent hashes.

## Terminology

The workbench now exposes distinct states:

- `CALCULATION_ACCEPTED_BY_STAGE_CONTRACT`;
- `RESULT_READY` / `RESULT_NOT_READY`;
- `CODE_READY` / `CODE_NOT_READY`;
- `RELEASE_QUALIFIED` / `RELEASE_NOT_QUALIFIEK`.

A qualified base calculation does not itself establish result, code or release readiness. Result readiness requires successful explicit producer registration under current source authority and exact parent lineage. NB-T2 never emits `RELEASE_QUALIFIED`.

## Compatibility boundary

Manual lifecycle initialization and producer-record registration remain available for governed test and externally supplied evidence scenarios. Normal document import remains evidence-neutral. Product source authority is issued on the first governed engineering edit or accepted calculation, preserving template/import composition boundaries.

## Files in scope

- `src/workspace/lafea-canonical-sha256.js`
- `src/workspace/lafea-source-authority.js`
- `src/workspace/lafea-lifecycle-producers.js`
- `src/workspace/lafea-lifecycle-workbench-store.js`
- `src/workspace/lafea-lifecycle-panel.js`
- `src/workspace/lafea-workbench.js`
- `scripts/lafea-nb-t2-source-producer-check.mjs`
- `scripts/lafea-u3a-public-surface-check.mjs`
- `scripts/lafea-u3b-live-lifecycle-check.mjs`
- `scripts/lafea-nonbucket-stack-check.mjs`
- `scripts/lafea-nonbucket-scope-guard.mjs`
- this document

## Prohibited write sets not touched

- numerical cores, solver formulations, benchmark expected values and tolerances;
- stage-registry v2 and component/benchmark/release bindings;
- LFEA piping Issue #116 sources;
- Agent 2 templates/buckets;
- first-cut, sequential-sketcher and accessory-panel product logic;
- shell formulation labels or dispatch;
- LAFEA.6 engine/edit/result implementation.

## Acceptance gate

The exact PR head must pass:

- dedicated NB-T2 source/producer check;
- bounded non-bucket stack;
- retained numerical core, foundation, meshing, solver, workbench and canvas checks;
- scoped hybrid Chromium;
- strict syntax and import checks;
- production build and bundle policy;
- exact patch hygiene and clean tree.

Repository integration remains separately attributed. An Issue #116-only failure remains `REPOSITORY_INTEGRATION_BLOCKED_ISSUE_116` and does not become an NB-T2 defect.
