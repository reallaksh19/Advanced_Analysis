# Advanced Analysis Load Calc — Non-FEA Preflight Concept and Roadmap

Status: controlling implementation and qualification record for `feat/load-calc-non-fea-input-check-ui`.

> The repository path intentionally follows the requested name: `doc/prelight_roamap.md`.

## 1. Product placement

The governed Non-FEA workflow belongs inside Advanced Analysis → Load Calc:

```text
Load Calc
├─ Overview
├─ Model / 3D
├─ Input Check
├─ Project Data
├─ Masters
├─ Enrichment & Overrides
├─ Method Basis
├─ Seal & Export
├─ Restraints / Load Cases / Methods
├─ Results / Evidence / Load Evaluation
└─ JSON Trace
```

It is not a top-level consumer. It must not enter LFEA or LAFEA ownership, import mesh or solver paths, or present FEA readiness.

## 2. Authority flow

```text
immutable source bytes and normalized workspace dataset
+ immutable master snapshots
+ approved Project Data
+ accepted exact enrichment and overrides
        |
        v
field-resolution ledger
        |
        v
immutable enriched shared-model projection
        |
        v
pre-fea-piping-check-request/v1
        |
        v
independent method requirement receipts
        |
        v
pre-fea-piping-check-report/v1
        |
        v
explicit confirmation
        |
        v
common-enriched-piping-input/v1
        |
        +--> common-input-bound method authorization
        +--> common-input-bound method execution
        +--> deterministic staged JSON export / re-import
```

A checker report is not a seal. A seal is not a calculation. A stale or historical seal, authorization, execution or export cannot become current without exact binding equivalence.

## 3. Non-negotiable rules

1. Imported bytes, normalized dataset and shared-model objects remain immutable.
2. Enrichment cannot change coordinates, ports, nodes, edges, connectivity, component placement, attachments or support membership.
3. No support snapping, proximity attachment, topology repair, fuzzy authorization or first-row conflict resolution.
4. Missing values remain missing; explicit numerical zero remains valid evidence.
5. Undocumented engineering defaults are prohibited.
6. Same-authority conflicts fail closed.
7. Fuzzy matching may propose only; acceptance creates an exact reusable mapping.
8. Evaluation, sealing, export, authorization and calculation are separate explicit actions.
9. Staleness propagates from source, Project Data, master, enrichment, qualification and authority-contract changes.
10. Readiness is independent by method; one missing field blocks only consuming methods.
11. No zero-step or source-presence-only state is represented as PASS.
12. LFEA and LAFEA remain unchanged and outside this module.

## 4. Authority precedence

```text
SOURCE_EXPLICIT
> SOURCE_INHERITED
> EXACT_APPROVED_MASTER
> ACCEPTED_OVERRIDE
> CONFIGURED_DERIVATION
> PROJECT_CONFIGURED_DEFAULT
> BLOCK
```

Project policy configures the resolver but does not outrank explicit entity evidence. Legacy precedence discrepancies require an explicit blocking decision.

## 5. Integrated surfaces

### 5.1 Input Check

Read-only hub for source custody, normalization, topology and POS, Project Data, masters, exact enrichment, method readiness, qualification, common seal, lineage, staleness and export. Gates E, F and H are derived from actual contracts rather than UI state.

### 5.2 Project Data

Authoritative editor for project-level units, tolerances, topology and support policy, gravity, load cases, mass and section policy, pressure, temperature, material behavior, restraint stiffness/gap/preload/friction/contact, configured defaults, qualification and superposition policy.

### 5.3 Masters

Retains immutable source snapshots and normalized mappings. Exact records may become proposals or accepted common sidecar records. Duplicate or same-authority conflicts remain blocking.

### 5.4 Enrichment & Overrides

Owns exact selectors, proposals, acceptance/rejection, source binding, field resolution, immutable projection, affected-entity preview and derived-model invalidation. Legacy import is compatibility-only. Support-unavailable sensitivity is an impact declaration and cannot remove a support from the common projection.

### 5.5 Method Basis

Owns requested methods, load cases, qualification-profile selection and independent requirement receipts. It evaluates only; it does not seal or calculate.

### 5.6 Seal & Export

Owns explicit full/partial confirmation, exact blocked-method acknowledgement, immutable common input, lineage, current/stale state, deterministic export and re-import equivalence.

### 5.7 Method consumption

Production empirical paths retain their existing numerical engines but require current sealed common methods. Authorization and execution each create receipts bound to the exact common-input semantic hash. Historical results remain readable but cannot become current authority.

## 6. Method registry

- `WEIGHT_AND_GRAVITY`
- `SUSTAINED_REACTIONS`
- `SUSTAINED_MEMBER_ACTIONS`
- `SUSTAINED_STRESS`
- `THERMAL_FREE_DISPLACEMENT`
- `RESTRAINT_REACTIONS`
- `VERTICAL_CONTACT`
- `COMBINED_OPERATING_REACTION`
- `ENRICHED_STAGED_JSON_EXPORT`

Each method row contains non-empty requirement receipts and is `READY` or `BLOCKED` against one exact candidate hash.

## 7. Eight gates

1. `A_SOURCE_MODEL` — source bytes, normalized dataset and shared-model identity.
2. `B_TOPOLOGY_POS` — governed connectivity, exact attachments and route partitions.
3. `C_PROJECT_BASIS` — approved normalization, topology and calculation policy.
4. `D_MASTER_AUTHORITY` — immutable master snapshots, mappings and conflicts.
5. `E_ENRICHMENT` — current sidecar, resolution ledger and immutable projection.
6. `F_METHOD_READINESS` — independent method-requirement evaluation.
7. `G_QUALIFICATION` — exact locked profile and numerical policy.
8. `H_SEAL_EXPORT` — common input, lineage, explicit seal and export receipt.

## 8. Phased implementation

### Phase 0 — Concept and ownership record

Implemented:

- product placement and scope boundary;
- authority flow and non-negotiable rules;
- phased implementation and release stop conditions.

### Phase 1 — Lossless preflight consolidation

Implemented:

- source and contract evidence;
- normalization, topology and load audits;
- support-site and route evidence;
- eight-gate presentation;
- no inferred method readiness from a legacy result.

### Phase 2 — Project Data authority expansion

Implemented contracts:

- `non-fea-field-authority-registry/v1`;
- `non-fea-field-ownership-matrix/v1`;
- `non-fea-configured-default-policy/v1`;
- `non-fea-configured-default-usage-ledger/v1`;
- additive legacy-profile migration;
- deterministic revision and semantic-hash change signals.

### Phase 3 — Common enrichment and override migration

Implemented contracts and behavior:

- `non-fea-enrichment-sidecar/v1`;
- `non-fea-field-resolution-ledger/v1`;
- `non-fea-enriched-shared-model-projection/v1`;
- `non-fea-enrichment-impact-preview/v1`;
- `non-fea-first-cut-migration-report/v1` compatibility adapter;
- exact entity, class/bore, component-type/bore and support-kind selectors;
- source-bound accepted records and explicit stale/rebind behavior;
- same-authority and legacy-precedence conflict rejection;
- immutable projection and topology/support-membership guard;
- proposal/acceptance/rejection/import/export workflow.

### Phase 4 — Common checker, method readiness and seal

Implemented contracts and behavior:

- `pre-fea-piping-check-request/v1`;
- `pre-fea-piping-check-report/v1`;
- `non-fea-method-requirement-registry/v1`;
- `common-enriched-piping-input-candidate/v1`;
- `common-enriched-piping-input/v1`;
- `non-fea-common-input-lineage/v1`;
- `non-fea-common-input-staleness/v1`;
- `enriched-staged-json-export/v1` and deterministic artifact receipt;
- independent method requirements and `READY`, `PARTIALLY_READY`, `BLOCKED` package states;
- explicit partial acceptance and exact blocked-method acknowledgement;
- immutable seal, lineage, mutation rejection and export/re-import equivalence;
- Load Calc Method Basis and Seal & Export surfaces;
- Input Check Gates F and H bound to actual checker/seal state.

### Phase 5 — Method consumption and First Cut retirement

Implemented contracts and behavior:

- `non-fea-method-authorization-receipt/v1`;
- `non-fea-method-execution-receipt/v1`;
- `non-fea-method-consumption-staleness/v1`;
- scenario-based empirical authorization/execution bound to current sealed common methods;
- authorized empirical runtime path bound to current sealed common methods;
- exact common-input receipt staleness checks before execution;
- dataset, Project Data, master and enrichment changes stale the common seal;
- active legacy workbench and launcher removed from production bootstrap and layout;
- historical calculation package getter retained for read-only compatibility;
- retired product label removed from active Load Calc surfaces.

### Phase 6 — Qualification, performance and release

Implemented qualification code:

- Phase 2–5 deterministic and adversarial contract scripts;
- generated 1,885-component / 163-support regression;
- repeated semantic-hash and byte-determinism checks;
- source mutation and stale-lineage checks;
- missing-to-zero prohibition and explicit-zero retention;
- no-zero-step method receipt guard;
- FEA-import scope guard;
- integrated Playwright coverage for Gates E/F/H, Method Basis, Seal & Export and legacy-workbench retirement;
- exact-head workflow with syntax, contracts, import graph, production build and Chromium execution.

Release stop condition:

- implementation is not release-qualified until GitHub records a successful exact-head workflow run for the final PR head and the PR merge commit is verified on `main`.

## 9. Pull-request strategy

PR #802 remains the integration PR. It may be marked ready only after implementation self-review. It may be merged only when:

- final changed-file scope is reviewed;
- exact-head contract scripts execute successfully;
- import graph and production build pass;
- integrated browser test passes;
- no unresolved review or merge blocker remains;
- merge uses the expected final head SHA.

## 10. Progress ledger

| Phase | State | Notes |
|---|---|---|
| 0 | COMPLETE | Concept and ownership recorded. |
| 1 | IMPLEMENTED — EXACT-HEAD QUALIFICATION PENDING | Lossless Input Check evidence and gate shell are coded. |
| 2 | IMPLEMENTED — EXACT-HEAD QUALIFICATION PENDING | Field registry, Project Data authority and configured-default ledger are coded. |
| 3 | IMPLEMENTED — EXACT-HEAD QUALIFICATION PENDING | Exact common enrichment, migration, projection and impact review are coded. |
| 4 | IMPLEMENTED — EXACT-HEAD QUALIFICATION PENDING | Checker, independent readiness, seal, lineage and deterministic export are coded. |
| 5 | IMPLEMENTED — EXACT-HEAD QUALIFICATION PENDING | Production empirical consumption is common-seal-bound; active legacy UI is retired. |
| 6 | IMPLEMENTED — EXECUTION PENDING | Large-model, adversarial, browser and exact-head qualification code is committed; no successful final-head workflow run has yet been observed. |

## 11. Current non-claims

Until the exact final-head workflow succeeds, this branch does not claim:

- release qualification;
- observed browser pass on the final head;
- observed large-model pass on the final head;
- merge readiness from CI;
- successful merge to `main`.
