# M035 BM4 Residual OPE Source-Level Audit and Fix Plan

## Purpose

This follow-up is stacked on the qualified M035/BM4 head and addresses only the remaining evidence/scope gaps and genuinely residual OPE discrepancies.

Frozen qualified baseline:

- PR: `#840`
- Exact head: `65acbd5ca6f13e431d913ae8b227148894171812`
- Qualified bend ingestion / real-arc bend path: **closed** for this audit unless new source evidence falsifies that conclusion.

This phase is an attribution and source-provenance gate. It does not authorize fitting the solver to BM4 output.

## Mechanics and convention freeze

Until a source-level cause is demonstrated, retain the qualified contracts unchanged:

- same structural equations and element formulations;
- same units and sign conventions;
- same support-on-pipe reaction convention;
- same local/global axis construction;
- same thermal strain authority and reference temperature policy;
- same prescribed-displacement treatment;
- same element-end action convention;
- same M035 bilateral linear-restraint scope;
- same M036 lift-off/contact iteration semantics;
- same convergence/equilibrium tolerances;
- same reducer fail-closed policy;
- friction remains unsupported rather than silently treated as zero when a nonzero coefficient is present in source data.

No benchmark tolerance may be widened to convert a failing row to pass.

## Audit scope

### Included

Audit every matched BM4 **OPE** row outside the current comparison target, covering:

- displacement;
- restraint force/moment;
- global element-end force/moment;
- normalized local element-end force/moment.

### Explicitly outside this mechanics-fix slice

- SUS and EXP rows already classified as unresolved CASE 19 history boundaries remain evidence/history work unless the missing load history becomes available.
- Direct rigid-element result rows remain a result-scope boundary unless a source record proves a required recoverable station.
- Reducer condensation remains disabled until reducer geometry/stiffness has an independently qualified formulation.
- Friction is not added inside this audit PR.

## Required source trace

For each residual OPE row, build a deterministic provenance chain:

`CAESAR source record`
`-> parsed source entity`
`-> canonical node/element/support/load`
`-> source node/element ID`
`-> feature-expanded analysis descendants`
`-> restraint/contact state`
`-> physical OPE load vector`
`-> assembled DOFs / element formulation`
`-> recovered result`
`-> comparison normalization / station mapping`
`-> residual row`

The audit output must preserve raw source identifiers. A discrepancy may not be attributed from node proximity alone when exact source lineage is available.

## Audit ledger

Add a deterministic machine-readable OPE ledger. Each failing row must record at least:

- case and result family;
- source node / element / end / station identifier;
- analysis node / element descendant identifiers;
- solver value and reference value;
- absolute and relative difference;
- active restraint/contact state relevant to the row;
- source component type and source properties;
- normalization transformations applied;
- nearest reducer/bend/rigid boundary only as secondary evidence;
- primary attribution category;
- evidence statement;
- proposed action;
- falsification status.

No failing OPE row may remain silently `UNKNOWN`.

## Attribution categories

Use the following primary categories:

1. `SOURCE_EVIDENCE_GAP`
   - The required source property, station, load primitive, history, or component semantic is absent or not recoverable.

2. `SOURCE_INGESTION_MISMATCH`
   - The source contains the required datum, but parser/adapter/canonical state changes, drops, duplicates, or misinterprets it.

3. `RESULT_STATION_MAPPING_BOUNDARY`
   - Mechanics are solved, but the compared commercial result is at a station/code point not represented by the solver's qualified recovery contract.

4. `RIGID_RESULT_SCOPE_BOUNDARY`
   - The reference row belongs to a rigid result location with no qualified equivalent solver result.

5. `REDUCER_STIFFNESS_UNQUALIFIED`
   - Residual is tied to a reducer whose finite-length/stiffness treatment is not yet independently qualified.

6. `CONTACT_LOAD_PATH_SENSITIVE`
   - M035-to-M036 state change demonstrably moves the same OPE row in the predicted direction or across the comparison target.

7. `UNMODELED_FRICTION`
   - Source has nonzero friction and a controlled perturbation/ablation demonstrates row sensitivity consistent with Coulomb load transfer. This category is evidence for a separate friction feature, not permission to add friction here.

8. `RECOVERY_OR_SIGN_MISMATCH`
   - Independent free-body/end-action checks prove a recovery, transform, end, or sign convention error.

9. `RESIDUAL_MODEL_DISCREPANCY`
   - Source ingestion, station mapping, unsupported physics, contact sensitivity, reducer scope, signs, and recovery have been falsified as causes; a mechanics/formulation discrepancy remains.

Only `SOURCE_INGESTION_MISMATCH`, `RECOVERY_OR_SIGN_MISMATCH`, or evidence-backed `RESIDUAL_MODEL_DISCREPANCY` may trigger a fix in the qualified M035 path.

## Fix decision gates

### Gate A — source ingestion

If the source datum exists but the normalized model differs:

1. fix the narrow parser/adapter/normalization defect;
2. add a direct source-to-canonical regression fixture;
3. prove unrelated canonical records are byte-for-byte/deterministically unchanged;
4. rerun BM4 OPE attribution and full M035/M036 qualification.

Do not change element mechanics to compensate for bad source ingestion.

### Gate B — result mapping/recovery

If source state and solve state are correct but compared recovery is wrong:

1. derive the correct local/global/end/station mapping;
2. verify it on an independent beam/free-body fixture;
3. add sign-reversal and element-end action tests that fail under a double-sign error;
4. change only recovery/comparison code;
5. rerun equilibrium and BM4 comparison.

### Gate C — unsupported physics or scope

If the residual requires friction, reducer flexibility, an unavailable commercial station, or missing load history:

1. retain it explicitly as unsupported/evidence-limited;
2. do not fit stiffness or loads to the commercial result;
3. create a separate feature/qualification slice if that physics is required;
4. require a closed-form/canonical benchmark before commercial parity is accepted as evidence.

### Gate D — genuine mechanics discrepancy

A formulation change is permitted only after Gates A-C are falsified for the targeted rows.

The change must then:

1. state the governing equation and physical assumption being corrected;
2. be the smallest formulation change that explains the source-level evidence;
3. add an independent canonical benchmark before using BM4 as proof;
4. preserve free-DOF residual, global force equilibrium, and global moment equilibrium;
5. show deterministic before/after BM4 row movement;
6. show no regression in already-qualified bend ingestion, thermal authority, M035, M036, BM1, BM2, and BM3 evidence.

## Falsification protocol

Every proposed cause must predict a measurable effect before code is changed.

Examples:

- changing only a source-ingested property should move rows downstream of that source entity and leave unrelated rows invariant;
- changing station/end mapping should alter recovery values without altering displacement equilibrium;
- a contact hypothesis should move the targeted OPE row when M035 bilateral state is replaced by the already-qualified M036 state;
- a friction hypothesis should have the correct force direction and vanish with `mu = 0`;
- a reducer-stiffness hypothesis should localize to reducer-connected load paths and pass an independent reducer canonical case before BM4 is considered.

If the predicted row set, sign, or magnitude trend is not observed reproducibly, record the hypothesis as **FALSIFIED** and do not merge that mechanics change.

## Implementation sequence

### Phase 1 — deterministic OPE ledger

Add a source-audit script, proposed name:

`scripts/lfea-m035-bm4-ope-source-audit.mjs`

Inputs should reuse the exact qualified comparison/reference normalization paths. Outputs:

- `reports/m035-bm4-ope-source-audit.json`
- `reports/m035-bm4-ope-source-audit.md`

The first version is evidence-only and must not mutate the solver.

### Phase 2 — source-to-analysis provenance

Instrument or expose deterministic provenance for:

- source component IDs;
- canonical entity IDs;
- source-to-analysis descendant maps;
- bend/reducer/rigid expansion ownership;
- restraint definitions and M035/M036 active state;
- load primitive contributions to OPE.

Prefer read-only diagnostic helpers over inserting debug state into the mechanics kernel.

### Phase 3 — controlled ablations

For each unexplained matched OPE cluster, perform one-variable-at-a-time experiments. Required controls include, where applicable:

- source property present vs deliberately removed;
- M035 bilateral vs M036 qualified lift-off state;
- raw global vs normalized local recovery;
- element start vs element end convention;
- source station vs nearest qualified endpoint;
- reducer-adjacent rows excluded vs included as an evidence boundary.

Ablation output belongs in the audit report, not in hand-written PR claims.

### Phase 4 — smallest justified fix

Implement only the defect category proven by the ledger and ablations. Keep source ingestion, structural mechanics, nonlinear state iteration, and recovery as separate commits when more than one layer is affected.

## Mandatory qualification after any fix

Run and archive:

- syntax/static checks for changed modules;
- local-force reference normalization qualification;
- thermal authority qualification;
- M035 feature mechanics qualification;
- M035/M036 combined qualification;
- BM4 CASE 19-21 before/after comparison;
- OPE source-audit ledger and attribution summary;
- M035/M036/BM1/BM2/BM3 deterministic regressions;
- free-DOF residual for affected physical cases;
- global force equilibrium;
- global moment equilibrium;
- exact input/reference hash and solver commit SHA.

Existing qualified bend cases must remain unchanged unless a new source-level falsification result explicitly reopens them.

## Acceptance criteria

This audit/fix slice is complete when:

1. every matched OPE failure has a deterministic source lineage and primary category;
2. no evidence-gap/scope-boundary row is used to justify a mechanics change;
3. every proposed mechanics hypothesis has a recorded prediction and falsification result;
4. parser/adapter fixes have direct source-to-canonical regressions;
5. recovery fixes have independent sign/end-action/free-body regressions;
6. mechanics fixes, if any, have an independent canonical benchmark before commercial comparison;
7. equilibrium/convergence evidence remains within the qualified envelopes;
8. the final report separates solved defects, explicit limitations, and genuinely residual OPE discrepancies.

## Initial disposition

The starting hypothesis for this follow-up is deliberately conservative:

> The qualified bend-ingestion path is not the remaining cause. Residual BM4 OPE differences must first be explained by exact source provenance, result-station semantics, restraint/contact state, reducer/friction scope, or recovery conventions. Only residual rows surviving those falsification gates may motivate a new M035 mechanics change.
