# Engineering Enrichment Upgrade Concept Report

**Document status:** FOR REVIEW  
**Revision:** 0.1  
**Repository:** `reallaksh19/Advanced_Analysis`  
**Planning PR:** #390  
**Issued:** 2026-08-02  
**Scope owner:** Engineering enrichment and pre-flight data preparation  
**Implementation status:** Concept only; no production authority or calculation binding is created by this report

---

## 1. Review decision requested

Reviewers are asked to approve, reject, or amend the following programme direction:

> Build one authoritative enrichment pipeline in `Advanced_Analysis` that combines the immutable batch and audit discipline of stagedJson enrichment, the candidate visibility of the XML→CII Preview workflow, and the source-evidence, approval, hash, and fail-closed controls of Project Data.

The proposed pipeline must distinguish four outcome classes:

1. **Exact evidence resolution** — a field is populated from a uniquely identified source row, source attribute, or approved mapping.
2. **Deterministic evidence derivation** — a field is calculated from exact inputs using a named and versioned policy.
3. **Review proposal** — a field is suggested by fuzzy matching, service consensus, generic catalogue logic, or another non-authoritative heuristic.
4. **Blocked** — evidence is missing, ambiguous, stale, conflicting, or outside an approved policy.

Only the first two classes may become a candidate value automatically. Neither becomes an approved Project Data value until the external Project Data approval workflow accepts it.

---

## 2. Executive summary

The project currently has three partially overlapping enrichment concepts:

1. `3D_Converters`: stagedJson → CII(2019) Attribute Enrichment.
2. `3D_Converters`: XML → CII 2019 Standalone Preview.
3. `Advanced_Analysis`: Project Data, Master Data, empirical pre-flight, and LFEA pre-flight.

The first two share a substantial resolver core, but their adapters behave differently. The stagedJson path provides the strongest immutable output and audit package. The Preview path provides the strongest investigation and candidate-review user experience. `Advanced_Analysis` provides the strongest authority model through evidence, approval, and active-source hash validation.

None of the three paths should be adopted unchanged.

The current stagedJson adapter still manufactures several engineering values despite declaring a no-fallback contract. The Preview path permits fuzzy and service-level suggestions to enter active preview or override state. The current `Advanced_Analysis` pre-flight grid directly decorates UI rows and contains prototype matching and demonstration behavior that is unsuitable as an engineering authority.

The recommended upgrade is a phased replacement programme with a single field-level enrichment contract, immutable source snapshots, exact-key resolution, separately labelled proposals, explicit approval handoff, and fail-closed consumer gates.

---

## 3. Sources reviewed

### 3.1 Canonical source repository

Observed canonical enrichment implementation:

```text
reallaksh19/3D_Converters
reference observed during review: 05ed229abe0299ccdfeeb04afd3e3402585d83c1
```

Principal paths:

```text
tabs/xml-cii-2019-standalone/stagedjson-enrichment/**
tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun-core.js
converters/xml-cii2019-core/**
```

### 3.2 Secondary comparison repository

Observed copied, validation, or backup variants:

```text
reallaksh19/XML_Compare_Utilities
reference observed during review: c20bb037566d52ba5b789712594b754a5fb94651
```

This report treats `3D_Converters` as canonical unless reviewers identify a different exact source repository and ref for the requested CII→XML(201) standalone implementation.

### 3.3 Target repository

```text
reallaksh19/Advanced_Analysis
concept baseline: 32e3418bbebca5e23ffa2ef7c4ffbe0e2b38c5b1
```

Principal current paths:

```text
docs/Prefetchandempericalloadconceptnote.md
src/workspace/master-data-controller.js
src/workspace/lfea-preflight-ui.js
src/workspace/empirical-preflight-view.js
src/workspace/project-data/**
src/calc-workspace/cii-standalone-port/core/**
```

---

## 4. Current-state findings

### 4.1 stagedJson enrichment strengths

The stagedJson workflow provides:

- element-aware traversal of the staged hierarchy;
- stable node and hierarchy identities;
- enrichment written beside source attributes rather than replacing geometry;
- audit JSON and unresolved CSV outputs;
- missing-field and conflict diagnostics;
- geometry invariance checks before export;
- explicit master imports;
- configurable line-key aliases and weight thresholds.

This is the preferred foundation for batch processing and audit artifacts.

### 4.2 stagedJson enrichment weaknesses

The adapter currently introduces implicit values that are not source evidence:

- nominal-bore-to-OD lookup tables;
- nominal-bore-to-standard-wall lookup tables;
- material density assumptions of 7,850 or 8,050 kg/m³;
- liquid and gas density assumptions;
- hydro density assumptions based on bore and test medium;
- insulation thickness defaulting to zero;
- insulation density defaulting to 250 or zero;
- calculated pipe weight using inferred OD, wall, and density.

These values are useful as engineering suggestions, but they must not be reported as source-resolved facts.

### 4.3 Preview strengths

The XML→CII Preview provides:

- exact and alias line-key matching;
- similar line-sequence and fuzzy line-key candidates;
- From/To context for review;
- piping-class candidate scores and reasons;
- DTXR wall and schedule evidence;
- component-weight candidate ranking;
- editable overrides;
- field-level source labels;
- visibility into unresolved and review-required fields.

This is the preferred foundation for review ergonomics and diagnostics.

### 4.4 Preview weaknesses

The Preview currently allows proposal behavior to influence active state:

- fuzzy line-list candidates may become the selected preview row;
- service-consensus values are written into `config.overrides.processData`;
- process defaults may populate missing fields;
- hydro pressure may fall back to zero;
- missing wall and corrosion may fall back to config values or zero;
- displayed piping-class precedence can differ from shared resolver precedence;
- a user-entered override is not clearly separated from an approved value.

The review UI should display these suggestions without mutating authoritative candidate state.

### 4.5 Advanced_Analysis strengths

`Advanced_Analysis` already provides:

- `EvidenceValue { value, evidence, approved }`;
- workflow-specific Project Data requirements;
- active source SHA-256 validation;
- stale-source detection;
- explicit line-list, piping-class, component-weight, and dataset source declarations;
- fail-closed readiness reporting;
- separate empirical pre-flight and calculation consumers.

These controls should govern the final enrichment output.

### 4.6 Advanced_Analysis weaknesses

The current implementation lacks a field-level enrichment record. It does not consistently retain:

- exact source row identity;
- source field or cell locator;
- match method and candidate set;
- input and output units;
- derivation policy identity;
- conflict details;
- proposal-versus-resolution status;
- source-byte hash for each master snapshot;
- review disposition for each proposed field.

The current LFEA pre-flight UI also includes prototype behavior:

- duplicate line keys can overwrite each other in a `Map`;
- containment matching can select the first encountered row;
- class and service can be inferred from name tokens without a field-level proposal contract;
- demonstration rows can appear when no active model exists;
- UI fill-down mutates visible rows rather than producing an immutable candidate package.

---

## 5. Target principles

### 5.1 One field, one declared authority result

Every enrichable field receives exactly one result record containing:

```text
field key
raw source observation
normalized candidate value
unit
source snapshot identity
source row / field / locator
match method
confidence or exactness
precedence rule
status
derivation policy, if any
blockers
alternative candidates
review disposition
```

### 5.2 No silent fallback

A missing value remains missing unless an approved derivation policy applies. Generic assumptions may be displayed only as proposals.

### 5.3 Exact matching is distinct from approximate matching

Exact, alias, containment, fuzzy, family, majority, and generic lookups must have different method codes. Approximate methods never masquerade as exact evidence.

### 5.4 Source facts are immutable

Imported master rows, source attributes, and file metadata are copied into immutable source snapshots. Enrichment operates against snapshot hashes, not mutable UI arrays.

### 5.5 Approval is external to enrichment

The enrichment engine proposes and explains values. It does not grant approval, bind a solver input, or create release authority.

### 5.6 Calculation consumers remain fail-closed

A calculation may consume only a Project Data candidate that has passed the existing approval, evidence, and active-source validation requirements.

### 5.7 Geometry is not modified by enrichment

The enrichment workflow may attach metadata, diagnostics, and proposal records. It must not alter source coordinates, connectivity, or component topology.

### 5.8 Cross-programme authority remains separated

This programme must not:

- modify a frozen LFEA candidate;
- create a duplicate LFEA authority index;
- make PR #371 an LFEA dependency;
- create circular evidence between enrichment and solver qualification;
- convert a review proposal into a production value without external approval.

---

## 6. Proposed target architecture

```text
Source files and model attributes
        |
        v
Immutable source snapshots
        |
        v
Model target inventory
        |
        v
Exact resolvers ------------------------------+
        |                                      |
        v                                      |
Deterministic derivation policies              |
        |                                      |
        v                                      |
Field-level enrichment records                 |
        |                                      |
        +----> Approximate/empirical proposals |
        |                                      |
        v                                      v
Review package and UI <---------------- Candidate diagnostics
        |
        v
Externally approved Project Data candidate
        |
        v
Existing Project Data validation
        |
        v
Approved consumer integration
```

### 6.1 Proposed contracts

#### `EngineeringEnrichmentSourceSnapshot.v1`

Represents one immutable input source:

```text
sourceId
sourceType
fileName
sheetName
byteLength
sha256
mappingPolicyHash
normalizationPolicyHash
rows
rowIdentityIndex
createdAt
```

#### `EngineeringEnrichmentTarget.v1`

Represents one exact model target:

```text
targetId
nodeId
hierarchyPath
branchId
lineHints
componentType
nominalBoreObservation
ratingObservation
scheduleObservation
sourceAttributes
geometryDigest
```

#### `EngineeringEnrichmentFieldResolution.v1`

Represents one field outcome:

```text
field
value
unit
status
method
sourceSnapshotId
sourceRowId
sourceField
sourceLocator
sourceHash
policyId
policyHash
inputs
candidates
blockers
needsReview
```

#### `EngineeringEnrichmentRecord.v1`

Groups all field resolutions for one target and records summary status.

#### `EngineeringEnrichmentProposalPackage.v1`

Contains review proposals, alternatives, diagnostics, unresolved items, and exact provenance. It creates no approval.

#### `ProjectDataCandidatePatch.v1`

Contains only reviewer-selected fields and their exact evidence chain. It remains unapproved until imported and approved by the Project Data authority.

---

## 7. Required status vocabulary

The implementation should use a compact closed vocabulary.

### 7.1 Resolution statuses

```text
RESOLVED_EXACT
RESOLVED_DERIVED
PROPOSED_REVIEW
BLOCKED_MISSING
BLOCKED_AMBIGUOUS
BLOCKED_CONFLICT
BLOCKED_STALE_SOURCE
NOT_APPLICABLE
```

### 7.2 Match methods

```text
SOURCE_ATTRIBUTE_EXACT
LINE_KEY_EXACT
LINE_KEY_UNIQUE_ALIAS
LINE_KEY_UNIQUE_CONTAINMENT
PIPING_CLASS_EXACT
PIPING_CLASS_APPROVED_MAPPING
PIPING_CLASS_APPROXIMATE
DTXR_EXPLICIT_VALUE
DTXR_SCHEDULE_DERIVATION
CATALOG_EXACT
CATALOG_RANKED_PROPOSAL
SERVICE_CONSENSUS_PROPOSAL
GENERIC_POLICY_PROPOSAL
MANUAL_CANDIDATE
```

### 7.3 Review dispositions

```text
UNREVIEWED
ACCEPTED_FOR_CANDIDATE
REJECTED
REPLACED_BY_MANUAL_CANDIDATE
DEFERRED
```

No status in these contracts means approved for calculation.

---

## 8. Field-level authority and fallback matrix

### 8.1 Line identity

**Automatic resolution precedence**

1. Exact configured source attribute.
2. Exact normalized line key.
3. Unique approved alias.
4. Unique containment match only when the containment policy is explicitly enabled and uniqueness is proven.

**Proposal only**

- line-sequence similarity;
- fuzzy text similarity;
- From/To contextual match;
- service-only inference.

**Blocked**

- duplicate exact rows;
- multiple aliases;
- multiple containment candidates;
- only fuzzy candidates available.

### 8.2 Process pressure and temperatures

**Automatic resolution precedence**

1. Exact line-list row field.
2. Exact source model attribute where Project Data precedence permits it.
3. Reviewer-approved manual candidate.

**Proposal only**

- service consensus;
- class consensus;
- range-to-maximum conversion unless a versioned derivation policy explicitly authorizes it;
- configured process defaults.

**Blocked**

- missing exact line row and no approved source attribute;
- conflicting exact values;
- invalid or unitless values.

Zero is treated as a real value only when explicitly present in evidence. Missing pressure must not become zero.

### 8.3 Piping class

**Automatic resolution precedence**

1. Exact Process Line List class when the line row is exact.
2. Exact source model class if an approved precedence policy gives the model authority.
3. Approved explicit class mapping.

**Proposal only**

- branch-name token class;
- numeric family or prefix class;
- fuzzy class;
- wildcard class mapping.

**Blocked**

- exact line-list and exact model class conflict;
- multiple master classes with equal authority;
- approximate match without review.

### 8.4 Pressure rating

**Automatic resolution precedence**

1. Exact piping-class master row.
2. Exact line-list row.
3. Exact source attribute under approved precedence.

**Proposal only**

- class-prefix sequence;
- DTXR text parsing;
- branch-name token parsing.

### 8.5 Nominal bore and outside diameter

**Automatic resolution precedence**

1. Exact source bore or NPS attribute.
2. Exact piping-class row dimension.
3. Exact source OD converted through an approved NPS/DN mapping policy.

**Proposal only**

- bore parsed from a branch name;
- generic ASME bore-to-OD table;
- nearest-OD mapping outside exact tolerance.

### 8.6 Schedule and wall thickness

**Automatic resolution precedence**

1. Exact piping-class row wall thickness.
2. Explicit source wall-thickness attribute.
3. Explicit DTXR wall-thickness value.
4. DTXR schedule converted through an approved schedule-table policy.

**Proposal only**

- generic standard wall by nominal bore;
- config default;
- unapproved schedule lookup.

Missing wall thickness must not become zero.

### 8.7 Corrosion allowance

**Automatic resolution precedence**

1. Exact piping-class row.
2. Exact source model attribute.
3. Reviewer-approved manual candidate.

**Proposal only**

- class family default;
- project-wide default;
- zero assumption.

### 8.8 Material and material code

**Automatic resolution precedence**

1. Exact Process Line List material and exact material-map row.
2. Exact line-list material code.
3. Exact source material and exact material-map row where line-list material is absent.
4. Exact piping-class material or code only when higher authorities are absent.
5. Approved explicit mapping.

**Proposal only**

- fuzzy material-map match;
- class family material;
- wildcard material map;
- generic carbon-steel assumption.

An unresolved nonblank Process Line List material blocks lower-authority material substitution.

### 8.9 Material density

**Automatic resolution precedence**

1. Exact approved material-density register entry selected by exact material identity.
2. Exact piping-class row density where that master is approved as density authority.

**Proposal only**

- 7,850 kg/m³ carbon-steel assumption;
- 8,050 kg/m³ stainless-steel assumption;
- material-family density.

### 8.10 Fluid service, phase, and test medium

**Automatic resolution precedence**

1. Exact line-list fields.
2. Exact approved source model fields.
3. Reviewer-approved manual candidate.

**Proposal only**

- branch-name service token;
- service majority;
- phase inferred from density;
- test medium inferred from hydro pressure.

### 8.11 Operating and hydro fluid density

**Automatic resolution precedence**

1. Exact line-list density field selected by exact phase.
2. Exact approved density register keyed by line/service/phase.
3. Exact test-medium density register for hydro.

**Proposal only**

- liquid = 1,000 kg/m³;
- gas = 300 kg/m³;
- hydro = 1,000 kg/m³ for small bore;
- hydro = operating density for non-water test medium.

### 8.12 Insulation

**Automatic resolution precedence**

1. Exact line-list insulation code and thickness.
2. Exact insulation master selected by code and temperature range.
3. Exact source attributes under approved precedence.

**Proposal only**

- no insulation because thickness is missing;
- thickness = zero;
- density = 250 kg/m³;
- density = zero.

No insulation and unknown insulation are separate states.

### 8.13 Pipe weight

**Automatic resolution precedence**

1. Exact approved pipe-weight master row.
2. Deterministic calculation from exact OD, exact wall, exact material density, and a named formula policy.

**Proposal only**

- calculation using any inferred or proposed input;
- generic schedule or density assumptions.

### 8.14 Component weight

**Automatic resolution precedence**

1. Exact source component-weight attribute with approved source precedence.
2. Unique exact component catalogue row.
3. Reviewer-approved catalogue selection.

**Proposal only**

- ranked weight candidate;
- score-based near match;
- family average;
- zero weight.

---

## 9. Phase-wise upgrade plan

## Phase 0 — Programme boundary and baseline freeze

### Objective

Establish a stable, reviewable baseline before production code is changed.

### Activities

- Confirm canonical source repositories and exact refs.
- Inventory every enrichment module and copied resolver in `Advanced_Analysis`.
- Record the current field precedence and fallback behavior.
- Define prohibited authority creation.
- Select benchmark datasets and master files.
- Capture source hashes and fixture licensing/retention rules.

### Deliverables

```text
docs/enrichment-upgrade-concept-report.md
docs/enrichment-authority-adoption-plan.md
docs/enrichment-current-state-inventory.md
fixtures/enrichment/README.md
```

### Exit gate

- Canonical sources approved.
- Field scope approved.
- Authority boundary approved.
- Benchmark source files identified with exact hashes.
- No unresolved ownership conflict with Project Data or LFEA.

### Non-goals

- No runtime changes.
- No value population.
- No UI changes.

---

## Phase 1 — Contracts and immutable source snapshots

### Objective

Create the data contracts that prevent source facts, proposals, and approved values from being conflated.

### Activities

- Implement source snapshot, target, field-resolution, record, proposal-package, and candidate-patch schemas.
- Add canonical JSON serialization and semantic hashes.
- Normalize master rows without losing raw headers or row identity.
- Detect duplicate row identities and duplicate exact keys.
- Retain file, sheet, row, field, and source-byte provenance.

### Deliverables

```text
src/workspace/engineering-enrichment-v2/contracts.js
src/workspace/engineering-enrichment-v2/source-snapshot.js
src/workspace/engineering-enrichment-v2/canonical.js
tests/engineering-enrichment-v2-contracts.test.mjs
```

### Exit gate

- Reordered objects hash identically.
- Any nested tamper changes the semantic hash.
- Duplicate exact identities are rejected or explicitly represented as ambiguity.
- Source snapshots contain no approval field.
- Contracts cannot express production authorization.

### Non-goals

- No matching logic.
- No Project Data mutation.

---

## Phase 2 — Model target inventory and exact line identity

### Objective

Produce a stable list of model targets and resolve line identity only when uniqueness is demonstrated.

### Activities

- Extract element-aware targets from the active shared model or stagedJson.
- Preserve hierarchy, branch, component, and source-attribute identities.
- Implement normalized exact-key indexes.
- Implement configured alias matching.
- Implement uniqueness-safe containment matching.
- Emit candidate lists for fuzzy or similar keys without selecting them.
- Eliminate demonstration fallback rows from production paths.

### Deliverables

```text
src/workspace/engineering-enrichment-v2/target-inventory.js
src/workspace/engineering-enrichment-v2/line-resolver.js
tests/engineering-enrichment-v2-line-resolution.test.mjs
```

### Exit gate

- Exact duplicate line rows produce `BLOCKED_AMBIGUOUS`.
- Fuzzy candidates never produce `RESOLVED_EXACT`.
- No first-match iteration behavior remains.
- Target geometry digest is unchanged.
- Large-dataset lookup uses indexed resolution rather than nested scans.

### Non-goals

- No process values.
- No piping-class matching.

---

## Phase 3 — Exact piping-class, dimensions, and material resolution

### Objective

Resolve piping class and physical properties through explicit precedence and exact master evidence.

### Activities

- Implement the approved piping-class source precedence.
- Implement approved class mappings separately from approximate matching.
- Resolve class rows by exact class, bore, component type, rating, and schedule.
- Resolve OD, schedule, wall, corrosion, material, and material code.
- Record all conflicts and candidate rows.
- Keep approximate class and fuzzy material matches in proposal status.

### Deliverables

```text
src/workspace/engineering-enrichment-v2/piping-class-resolver.js
src/workspace/engineering-enrichment-v2/dimension-resolver.js
src/workspace/engineering-enrichment-v2/material-resolver.js
tests/engineering-enrichment-v2-piping-class.test.mjs
```

### Exit gate

- Line-list/model class conflict is blocked.
- Exact class row identity is retained.
- Missing wall and corrosion never become zero.
- Generic OD, wall, material, or density tables cannot emit resolved status.
- Process material precedence is enforced.

### Non-goals

- No DTXR schedule derivation unless Phase 4 approves its policy.
- No process parameter resolution.

---

## Phase 4 — Process parameters, densities, and insulation

### Objective

Populate process and load-related fields from exact line-list and approved register evidence.

### Activities

- Resolve design and hydro pressure.
- Resolve T1, T2, and T3 while preserving raw source text.
- Resolve service, phase, and test medium.
- Resolve OPE and HYD density through exact phase/test-medium policies.
- Resolve insulation state, code, thickness, and density.
- Implement unit normalization with raw-value retention.
- Emit service consensus and configured defaults as proposals only.

### Deliverables

```text
src/workspace/engineering-enrichment-v2/process-resolver.js
src/workspace/engineering-enrichment-v2/density-resolver.js
src/workspace/engineering-enrichment-v2/insulation-resolver.js
src/workspace/engineering-enrichment-v2/unit-policy.js
tests/engineering-enrichment-v2-process.test.mjs
```

### Exit gate

- Missing hydro pressure remains blocked, not zero.
- Temperature ranges retain raw evidence and require an approved conversion policy.
- Service consensus never mutates override state.
- Unknown insulation differs from confirmed uninsulated state.
- Every normalized value records source unit and target unit.

### Non-goals

- No component-weight matching.
- No Project Data approval.

---

## Phase 5 — DTXR, deterministic derivation, and weight proposals

### Objective

Adopt useful empirical and derived behaviors without allowing them to masquerade as source evidence.

### Activities

- Resolve explicit DTXR wall values.
- Define a versioned schedule-to-wall policy using approved tables.
- Calculate pipe weight only when all inputs are exact or approved-derived.
- Rank component-weight catalogue candidates.
- Separate exact catalogue matches from ranked proposals.
- Implement named generic engineering policies only as proposal generators.
- Record complete input lineage for every derivation.

### Deliverables

```text
src/workspace/engineering-enrichment-v2/dtxr-resolver.js
src/workspace/engineering-enrichment-v2/derivation-policies.js
src/workspace/engineering-enrichment-v2/pipe-weight-resolver.js
src/workspace/engineering-enrichment-v2/component-weight-resolver.js
tests/engineering-enrichment-v2-derivations.test.mjs
```

### Exit gate

- DTXR explicit value and DTXR schedule derivation have different methods.
- Formula outputs reproduce from recorded exact inputs.
- Proposed inputs cannot create a resolved pipe weight.
- Ambiguous component catalogue ranking remains a proposal.
- Generic density, wall, and insulation assumptions are never resolved facts.

### Non-goals

- No direct application to Project Data.

---

## Phase 6 — Review package and pre-flight UI

### Objective

Replace mutable prototype fill-down behavior with an auditable field-level review workflow.

### Activities

- Display targets grouped by service, rating, class, and line without using those groups as authority.
- Show current source observation, resolved candidate, proposal alternatives, blockers, and provenance.
- Add filters for blocked, ambiguous, conflict, proposal, and exact states.
- Allow reviewer selection or manual candidate entry.
- Record review disposition without setting `approved: true`.
- Generate audit JSON and unresolved CSV.
- Preserve geometry and source attributes.

### Deliverables

```text
src/workspace/engineering-enrichment-v2/review-view.js
src/workspace/engineering-enrichment-v2/review-state.js
src/workspace/engineering-enrichment-v2/audit-export.js
tests/engineering-enrichment-v2-review-ui.test.mjs
```

### Exit gate

- UI edits produce immutable review events.
- Fill-down creates candidate selections, not silent overwrites.
- Reviewer actions are reproducible from an event ledger.
- No review action grants Project Data approval.
- Export is blocked if geometry changes.

### Non-goals

- No solver integration.
- No persistence into approved stores.

---

## Phase 7 — Project Data candidate handoff

### Objective

Connect reviewed enrichment output to Project Data without weakening Project Data authority.

### Activities

- Generate `ProjectDataCandidatePatch.v1` from reviewer-selected fields.
- Preserve exact source and derivation evidence.
- Validate source hashes against active masters.
- Import candidate fields as unapproved EvidenceValues.
- Require existing Project Data approval controls for promotion.
- Record rejected, deferred, and replaced proposals.

### Deliverables

```text
src/workspace/engineering-enrichment-v2/project-data-handoff.js
src/workspace/project-data/project-data-candidate-import.js
tests/engineering-enrichment-v2-project-data-handoff.test.mjs
```

### Exit gate

- Candidate import sets `approved: false`.
- Stale source hashes block import or validation.
- Exact provenance survives round-trip import/export.
- Missing evidence cannot create a Project Data candidate.
- No solver or release authority is created.

### Non-goals

- No automatic approval.
- No frozen LFEA candidate modification.

---

## Phase 8 — Consumer adoption and legacy isolation

### Objective

Move consumers to the approved enrichment output and retire unsafe duplicate paths.

### Activities

- Identify each consumer of process, piping-class, dimension, density, insulation, and weight data.
- Introduce read-only adapters from approved Project Data.
- Remove direct use of mutable Master Data arrays in calculations.
- Isolate or delete prototype pre-flight enrichment code.
- Isolate copied standalone resolvers to test fixtures or archival paths.
- Add anti-drift tests preventing reintroduction of defaults.

### Deliverables

```text
src/workspace/engineering-enrichment-v2/approved-consumer-adapter.js
scripts/enrichment-authority-boundary-check.mjs
tests/engineering-enrichment-v2-consumer-boundary.test.mjs
```

### Exit gate

- Calculations read approved Project Data only.
- No calculation imports heuristic proposal modules.
- Prototype demonstration datasets are absent from production paths.
- Direct defaults for governed engineering fields are detected by automated checks.
- Legacy resolver behavior is either removed or explicitly non-authoritative.

### Non-goals

- No change to solver mathematics.
- No release qualification claim.

---

## Phase 9 — Qualification, migration, and controlled rollout

### Objective

Demonstrate deterministic behavior, migrate approved data safely, and activate the new path under controlled gates.

### Activities

- Run benchmark parity on known exact cases.
- Run negative tests for ambiguity, conflicts, missing values, stale hashes, and tampering.
- Measure performance on large models and masters.
- Migrate existing approved Project Data only through evidence-preserving transforms.
- Run the old and new enrichment paths in shadow comparison where possible.
- Publish field-by-field differences and unresolved causes.
- Activate consumers only after review and qualification.

### Deliverables

```text
reports/enrichment-v2-qualification.json
reports/enrichment-v2-shadow-comparison.json
docs/enrichment-v2-migration-report.md
docs/enrichment-v2-release-readiness.md
```

### Exit gate

- Exact fixtures are deterministic.
- All negative fixtures fail closed.
- No silent fallback remains in governed fields.
- Migration preserves source evidence and approval state.
- Performance targets are met.
- Independent review is complete.
- Release authority is granted outside this programme.

---

## 10. Proposed PR sequence

To keep reviews bounded, implementation should be divided into focused PRs.

```text
PR A  Contracts and source snapshots
PR B  Target inventory and exact line resolution
PR C  Exact piping-class, dimensions, and material
PR D  Process parameters, density, and insulation
PR E  DTXR, derivations, and weight proposals
PR F  Review UI and audit exports
PR G  Project Data candidate handoff
PR H  Consumer adapters and legacy isolation
PR I  Qualification and migration evidence
```

Each PR must include:

- explicit authority boundary;
- exact schema changes;
- focused positive and negative fixtures;
- no claim beyond executed validation;
- updated field-precedence documentation;
- a list of defaults or heuristic paths added, removed, or retained.

---

## 11. Qualification strategy

### 11.1 Minimum benchmark fixtures

1. Exact line key and exact line-list row.
2. Duplicate exact line-list key.
3. Unique alias.
4. Multiple alias candidates.
5. Unique containment match.
6. Multiple containment candidates.
7. Fuzzy line candidate only.
8. Exact class and bore row.
9. Approximate class family candidate.
10. Exact class/model conflict.
11. Exact process values with units.
12. Temperature range source value.
13. Missing hydro pressure.
14. Service-consensus suggestion.
15. Explicit DTXR wall.
16. DTXR schedule requiring table derivation.
17. Exact material-map row.
18. Unresolved nonblank process material.
19. Exact insulation code.
20. Unknown insulation.
21. Exact component catalogue row.
22. Ambiguous component catalogue ranking.
23. Pipe-weight calculation with exact inputs.
24. Pipe-weight calculation with one proposed input.
25. Stale source hash.
26. Nested contract tamper.
27. Geometry mutation attempt.
28. Project Data candidate round trip.

### 11.2 Mandatory assertions

- No missing engineering value becomes zero unless zero is explicit evidence.
- No fuzzy or service match produces resolved status.
- No approximate piping class bypasses review.
- No generic density or wall table produces exact status.
- No proposal sets `approved: true`.
- No source hash mismatch is ignored.
- No enrichment path modifies geometry.
- No consumer imports proposal modules.
- Every resolved field has a reproducible evidence chain.
- Every derived field identifies its policy and exact inputs.

---

## 12. Performance and scalability requirements

The upgrade must support large industrial models without sacrificing correctness.

### Requirements

- Pre-index exact keys for O(1) average lookup.
- Preserve duplicate keys rather than overwriting them.
- Run fuzzy ranking only for unresolved targets.
- Cache normalized master rows by snapshot hash.
- Keep source snapshots immutable and shareable.
- Stream or paginate review rows where appropriate.
- Avoid serializing entire source rows into every field record; use immutable row references plus retained source snapshots.

### Proposed measurements

```text
source snapshot creation time
exact line-resolution throughput
piping-class row-resolution throughput
fuzzy proposal count and runtime
peak browser memory
review-grid render p50/p95
canonical serialization and hash time
```

Performance optimization must not weaken ambiguity detection or provenance.

---

## 13. Migration approach

### 13.1 Existing Project Data

Existing approved values remain authoritative until explicitly superseded. Migration must not downgrade, overwrite, or silently re-source them.

### 13.2 Existing Master Data

Current browser-loaded masters should be converted into immutable snapshots. Field maps may be retained, but raw file hashes, sheet names, and row identities must be added.

### 13.3 Existing overrides

Current override buckets must be classified as:

```text
reviewer-entered candidate
legacy generated suggestion
approved external value
unknown origin
```

Only reviewer-entered candidates with retained evidence may be migrated automatically. Generated suggestions and unknown-origin values require review.

### 13.4 Existing pre-flight rows

Visible pre-flight state is not authority. It may be imported only as a proposal package with `UNREVIEWED` disposition.

---

## 14. Risks and mitigations

### Risk 1 — Resolver drift across repositories

**Mitigation:** select one canonical source; add parity tests and a source inventory; prohibit copied production resolvers.

### Risk 2 — Silent fallback reappears through convenience code

**Mitigation:** closed status vocabulary, boundary scans, negative fixtures, and calculation-import restrictions.

### Risk 3 — Duplicate master keys are hidden by maps

**Mitigation:** indexes map keys to arrays; uniqueness is evaluated explicitly.

### Risk 4 — Proposal values are mistaken for approved values

**Mitigation:** separate contracts, separate stores, visible status, and candidate import with `approved: false`.

### Risk 5 — Source files change after review

**Mitigation:** active-source hash validation and stale-candidate blocking.

### Risk 6 — UI actions mutate authority state

**Mitigation:** append-only review events and immutable proposal packages.

### Risk 7 — Performance pressure encourages permissive matching

**Mitigation:** exact indexes first, fuzzy matching only on unresolved rows, background candidate ranking where safe, and performance qualification.

### Risk 8 — Enrichment overlaps LFEA ownership

**Mitigation:** enrichment stops at Project Data candidates; LFEA applicability, binding, and solver authorization remain external.

### Risk 9 — Migration preserves legacy generated defaults as evidence

**Mitigation:** classify origin, reject unknown provenance, and require re-review of generated values.

---

## 15. Review questions

Reviewers should provide explicit decisions on these points.

1. Is `3D_Converters` at the reviewed ref the canonical source for both comparison paths?
2. Should exact Process Line List piping class govern over exact model class, or should conflicts always require review?
3. Is unique containment matching allowed automatically, or should it also remain a proposal?
4. May DTXR schedule-to-wall conversion be a deterministic resolution when the schedule table is approved and hash-bound?
5. Are service-consensus values permitted as proposals, and what minimum rows and confidence threshold should apply?
6. Which material-density, fluid-density, and insulation registers are approved authorities?
7. Can exact source model attributes outrank missing line-list fields, and for which fields?
8. What constitutes an approved manual mapping, and where is it stored?
9. Should reviewer selection be persisted as an unapproved Project Data candidate immediately or only exported as a package?
10. Which existing pre-flight and standalone-port modules should be retired, archived, or retained for diagnostics?
11. Which benchmark datasets and masters may be committed as fixtures, and which must remain hash-referenced external files?
12. Which performance thresholds are required before rollout?

---

## 16. Recommended approval disposition

### Recommended for approval

- The phased architecture and authority separation.
- Exact-versus-proposal status separation.
- Immutable source snapshots and field-level provenance.
- Project Data as the approval and consumer gate.
- StagedJson-style batch audit and Preview-style candidate diagnostics.
- Removal of silent zero and generic engineering defaults from resolved output.

### Requires reviewer decision

- Exact precedence between line-list and model attributes.
- Automatic unique containment matching.
- DTXR schedule derivation authority.
- Service-consensus proposal thresholds.
- Approved engineering registers and mapping policies.
- Migration policy for existing overrides.

### Not recommended

- Porting the current stagedJson adapter unchanged.
- Porting the Preview override behavior unchanged.
- Treating UI fill-down as approval.
- Allowing config defaults to populate governed fields.
- Allowing approximate class or line matching to become automatic authority.
- Coupling enrichment completion to LFEA Phase 6I or PR #371.

---

## 17. Concept acceptance criteria

This concept is accepted when reviewers confirm:

- the canonical source repository and refs;
- the target field list;
- the authority precedence matrix;
- the status vocabulary;
- the proposed phase sequence;
- the Project Data handoff boundary;
- the treatment of DTXR, fuzzy matching, service consensus, and generic assumptions;
- the benchmark and qualification strategy;
- the migration policy;
- the absence of production or LFEA authority in this concept PR.

Approval of this concept authorizes preparation of Phase 1 implementation work only. It does not approve engineering values, calculation inputs, production adoption, solver binding, or release qualification.
