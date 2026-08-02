# Enrichment Authority Adoption Plan

## Document purpose

This document plans a new enrichment programme for `Advanced_Analysis` focused on how process parameters, piping class, dimensional attributes, material, densities, insulation and weights are populated before engineering calculations.

It compares two currently implemented workflows in `reallaksh19/3D_Converters`:

1. `stagedJson -> CII(2019) Attribute Enrichment`;
2. the Preview workflow under the repository's `XML -> CII 2019 Standalone` implementation, referred to in the request as the CII/XML 2019 standalone Preview tab.

It then compares both workflows with the original `Project Data & Pre-Flight Architecture Concept Note` and the current `Advanced_Analysis` implementation, and defines how to adopt the useful behavior without reintroducing silent engineering inference.

This is a planning and architecture record only. It does not approve engineering values, populate Project Data, bind a calculation candidate, modify LFEA, create release evidence, or authorize production use.

## Scope boundary

### In scope

- line identity and line-list matching;
- process pressure and temperature parameters;
- fluid service, phase, test medium and density;
- piping-class identification and row selection;
- nominal bore, outside diameter, schedule, wall thickness and corrosion allowance;
- material identity, material code and material density;
- insulation thickness, code and density;
- pipe and component weights;
- fallback classification, review state and blocker behavior;
- source provenance, matching trace and stale-source detection;
- a future pre-flight review experience for enrichment proposals.

### Out of scope

- automatic engineering approval;
- direct mutation of the frozen LFEA Phase 6I candidate;
- solver input authorization;
- production persistence of approved engineering values;
- load calculation execution;
- seal or release qualification;
- making PR #371 or any external enrichment output part of Phase 6I authority.

The programme must remain a producer of source-bound proposals until a separately governed Project Authority Index accepts individual fields for a new immutable calculation candidate.

## Source-of-truth inventory

### Canonical upstream implementation

The observed canonical implementation is `reallaksh19/3D_Converters/main`.

The two requested workflows are not fully independent algorithms. They share the `converters/xml-cii2019-core/**` resolver family, but use different adapters, matching behavior, output contracts and user-interaction semantics.

`reallaksh19/XML_Compare_Utilities` contains copied, validator and backup variants of portions of this code. Unless a separate repository/ref is designated, it must be treated as a downstream copy or evidence source rather than the canonical enrichment authority.

### Advanced Analysis implementation

`Advanced_Analysis` currently contains:

- a port of parts of the CII standalone resolver under `src/calc-workspace/cii-standalone-port/**`;
- master import and normalization state in `src/workspace/master-data-controller.js`;
- Project Data evidence and approval contracts in `src/workspace/project-data/**`;
- a task-oriented but prototype-quality `src/workspace/lfea-preflight-ui.js`;
- a source/readiness dashboard in `src/workspace/empirical-preflight-view.js`;
- a bundled 1885S Project Data profile with most load-calculation fields intentionally unresolved.

The missing architectural layer is a single field-level enrichment engine that converts source observations into immutable, reviewable proposals without silently granting authority.

## Flow A — stagedJson bulk enrichment

### Pipeline

```text
managed stagedJson
  -> hierarchy and element context extraction
  -> explicit master adapters
  -> shared line/spec/material/weight resolvers
  -> enrichedAttributes per eligible node
  -> audit JSON + unresolved CSV + preview rows
```

The stagedJson engine works directly on stagedJson. It does not use XML as an intermediate production artifact.

### Input interpretation

The adapter walks the hierarchy and creates an element-aware context containing:

- stable hierarchy path and node ID;
- inherited branch name;
- source attributes and sourceAttributes;
- configurable line-key hints from attributes, node name, branch and hierarchy;
- nominal bore, rating, schedule and element length;
- APOS, LPOS, POS and CENTER geometry evidence.

### Line matching

The stagedJson line resolver uses this order:

1. exact normalized match against any line hint;
2. conflict when more than one exact row matches;
3. contained-key match when enabled;
4. longest contained key only when it is strictly longer than the next candidate;
5. unresolved or ambiguous otherwise.

It does not use the Preview tab's line-sequence/Dice fuzzy proposal route.

### Output and audit

Each eligible node receives `stagedjson-cii2019-enriched-attributes/v1`, including:

- resolved fields;
- source labels;
- resolver trace;
- missing fields;
- conflicts;
- diagnostics and review state.

The writer adds enrichment and diagnostics only. It compares APOS, LPOS, POS and CENTER before export and blocks the export if geometry changes.

### Strengths

- deterministic batch artifact;
- element-level output rather than only branch-level rows;
- explicit audit JSON and unresolved CSV;
- geometry non-mutation guard;
- visible configuration and explicit master imports;
- ambiguity is generally retained instead of selecting the first row.

### Material inconsistency with its declared doctrine

The stagedJson documentation and engine describe the path as having no fallback and say legacy `config-default` or `default-zero` results are sanitized to `null`. The resolver adapter nevertheless introduces additional implicit engineering values after that sanitization:

- generic ASME nominal-bore-to-OD values;
- generic standard wall thickness values;
- material density `8050 kg/m3` for stainless families and `7850 kg/m3` otherwise;
- calculated pipe weight from inferred OD, wall and density;
- operating density `1000 kg/m3` for liquid and `300 kg/m3` otherwise;
- hydro density `1000 kg/m3` for bore up to 400 mm;
- hydro density based on water/OPE assumptions for larger bore;
- insulation thickness `0` when absent;
- insulation density `250 kg/m3` when insulation thickness is positive and `0` otherwise.

These values may be useful as empirical suggestions, but they are not source observations. Treating them as resolved enrichment contradicts the intended `fallbackUsed: false` contract.

## Flow B — standalone Preview

### Pipeline

```text
source XML + staged DTXR + visible config + imported masters
  -> branch/node preview rows
  -> exact and approximate matching
  -> editable override buckets
  -> dry-run diagnostics and weight review
```

The Preview path is read-only with respect to the source XML, but it maintains mutable configuration/override state used by subsequent preview and conversion operations.

### Line matching

The Preview performs:

1. exact normalized line-key match;
2. alias match, including removal of a single service prefix;
3. line-sequence similarity using digit runs;
4. Dice-bigram similarity against line keys and line sequence text;
5. selection of the best candidate above its threshold.

The Preview records method, confidence and proposed key. However, the selected fuzzy row is then normalized and consumed as the active line-list row. This makes a proposal behave like input unless downstream code explicitly checks the method and confidence.

### Process data precedence

For P1, hydro pressure, T1, T2, T3 and density, the Preview generally uses:

```text
explicit override
  > selected line-list row
  > visible process default
  > missing/default-zero behavior
```

Additional behavior includes:

- missing hydro pressure is set to text value `0` with source `default-zero`;
- temperature ranges are collapsed to their maximum value;
- density can come from a configured process default;
- exact-line misses may receive service-consensus suggestions.

### Service-consensus fallback

The shared service fallback:

- derives a service token from the branch/line row;
- filters line-list rows by service;
- narrows by piping class when available;
- may narrow using HREF/TREF-connected line identities;
- uses majority consensus for individual process fields;
- defaults to a 70% agreement threshold and two matching rows;
- marks the result `needsReview: true`.

The implementation writes accepted suggestions into `config.overrides.processData`. This is convenient for the UI, but it mixes an inferred proposal with a manual override namespace and obscures who accepted it.

### Piping class and row selection

The Preview derives a display class from line-list or branch tokens, while the shared source resolver currently gives branch-name class precedence over line-list class. The shared piping-class resolver then supports:

- exact class match;
- prefix/base match;
- numeric-family match;
- fuzzy sequence match;
- manual approximate-class override;
- row scoring by class, bore, component type, rating and schedule;
- ambiguity and confidence diagnostics.

This is technically richer than the stagedJson line matching, but the class precedence is internally inconsistent and approximate classes can progress farther than the original Zero Silent Inference doctrine permits.

### Material, wall and corrosion

The current canonical `3D_Converters` branch resolver has improved material precedence:

1. nonblank Process Line List material is governing;
2. direct Process Line List material code;
3. explicit override when no process material, review required;
4. mapped XML material;
5. piping-class material/code only as fallback;
6. unresolved nonblank process material blocks piping-class fallback.

Wall thickness and corrosion allowance still permit:

```text
override
  > piping-class master row
  > XML value
  > configured default
  > zero
```

DTXR-derived wall values can be applied through override state. The default and zero tail is unsuitable for authoritative engineering enrichment.

### Strengths

- highly diagnostic human-review surface;
- visible candidate lists, scores, confidence and reasons;
- DTXR and XML fallback evidence;
- interactive per-field override support;
- service-level process suggestion capability;
- branch and node review, including component-weight matching.

### Risks

- fuzzy line candidate becomes the selected row;
- service proposal is stored as an override;
- process defaults and zero values can appear populated;
- branch-name and line-list piping-class precedence is inconsistent;
- temperature-range collapse loses the original engineering semantics unless retained and approved;
- preview state is not an immutable evidence artifact.

## Side-by-side comparison

| Dimension | stagedJson bulk enrichment | Standalone Preview | Required Advanced Analysis behavior |
|---|---|---|---|
| Primary unit | Element/node | Branch plus weight-review nodes | Field proposal attached to exact model target |
| Source mutation | Adds enrichment sidecar; geometry guarded | Source XML read-only; config overrides mutate | No source-model mutation; immutable proposal set |
| Exact line match | Multiple hints, exact/contained | Exact/alias | Exact indexed key with duplicate detection |
| Approximate line match | Longest contained only | Sequence and Dice fuzzy | Proposal only; never active authority |
| Piping-class source | Shared resolver, branch-name precedence | Display and shared resolver can disagree | One approved precedence rule, conflicts blocked |
| Class-row match | Shared scored matcher | Shared scored matcher with visible candidates | Exact class plus exact applicability dimensions; approximate row proposal only |
| Process values | Line row/override plus adapter heuristics | Override, selected row, defaults, service consensus | Exact row or approved override; consensus is proposal only |
| Material | Current shared resolver, then adapter density assumptions | Shared resolver with visible provenance | Line-list material governs; unresolved source material blocks |
| Wall/CA | Shared resolver, then generic wall fallback | Master/XML/default/zero; DTXR candidate | Exact master/DTXR/source evidence; no default-zero |
| Density | Adapter phase and hydro assumptions | Line-list/default/service proposal | Approved process row or approved registry; heuristic proposal only |
| Insulation | Missing becomes zero/250 rule | Configuration/row behavior | Explicit insulated/not-insulated state required |
| Weight | Direct attribute or scored catalog; pipe formula | Candidate ranking and override | Exact catalog or authoritative formula inputs; otherwise proposal/block |
| Provenance | Sources and trace, audit export | Source labels/confidence in UI rows | Exact source file/sheet/row/hash and policy identity |
| Approval | No formal approval | UI override state | Separate external field-level approval record |
| Missing evidence | Diagnostics, but adapter may fill | Defaults or suggestions may fill | `BLOCKED_MISSING` with no calculation value |
| Ambiguity | Conflict/unresolved | Best proposal may be consumed | `BLOCKED_AMBIGUOUS` until explicit resolution |

## Original pre-flight concept versus current Advanced Analysis

### What remains

The current repository retains important pieces of the original concept:

- `ProjectDataStore` and `EvidenceValue { value, evidence, approved }`;
- required-workflow validation;
- source-hash and stale-hash checks;
- explicit line-list, piping-class and component-weight source records;
- a master-data controller with normalized rows and source metadata;
- Project Data views and an empirical pre-flight source-readiness dashboard;
- a task-level LFEA pre-flight grid;
- service/class grouping and fill-down UI concepts;
- a port of the CII standalone process/class resolvers.

### What is missing or incomplete

#### 1. No field-level enrichment contract

Project Data stores broad registries and source declarations, but does not model per-line enrichment fields such as:

- line identity and exact source row;
- P1, hydro pressure, T1, T2 and T3;
- service, phase and test medium;
- assigned piping class and exact class row;
- schedule, OD, wall thickness and corrosion allowance;
- material identity/code/density;
- insulation state/thickness/code/density;
- pipe/component weight resolution;
- proposal method, candidates, confidence, blocker and review disposition.

#### 2. The current LFEA pre-flight grid bypasses Project Data authority

The grid directly matches master rows and populates UI values. It does not create field-level evidence records, approvals or immutable hashes.

The current matching logic also:

- overwrites duplicate normalized keys in a `Map`;
- accepts the first containment match on a miss;
- guesses class from attributes/name tokens;
- contains a demonstration dataset when no active model exists;
- advertises persisted master data although only mapping/config state is persisted;
- calls wall derivation without actual DTXR evidence in the visible button path.

This should be treated as prototype UI, not authoritative enrichment.

#### 3. The empirical pre-flight view validates readiness but does not enrich

It correctly reports source hashes, Project Data blockers, routes and support sites. It needs a field-level proposal package to display before it can become the review surface envisioned by the concept note.

#### 4. The CII standalone port has drifted

`Advanced_Analysis` contains a copied resolver rather than a controlled upstream snapshot. Its material precedence is older than current `3D_Converters`: it can prefer piping-class material before line-list material. This is incompatible with the current upstream rule that Process Line List material governs automatic material-code resolution.

#### 5. The bundled 1885S profile remains load-blocked

The profile intentionally leaves gravity, load factor, material densities, pipe sections, hydro density, insulation densities and equilibrium tolerances unresolved. This is correct fail-closed behavior, but there is no controlled enrichment workflow to propose and review the missing inputs.

## Target architecture

### Architectural rule

```text
source observation
  -> normalized immutable master snapshot
  -> exact target identity
  -> field proposal and trace
  -> review package
  -> external field-level approval
  -> new Project Data candidate
  -> workflow validation
```

The enrichment engine does not create approval or calculation authority.

### Core contracts

#### `EngineeringEnrichmentMasterSnapshot.v1`

For every imported master:

- source type;
- file name and sheet;
- source SHA-256 and byte length;
- mapping-policy identity/hash;
- normalized rows;
- exact source row identity and row hash;
- normalization diagnostics.

#### `EngineeringEnrichmentTarget.v1`

For every branch, pipe, fitting, component or support:

- immutable dataset/model hash;
- target ID and hierarchy path;
- branch/line context;
- source attributes used as hints;
- geometry identity only, not geometry mutation.

#### `EngineeringEnrichmentFieldProposal.v1`

For every proposed field:

- field ID;
- proposed value and canonical unit;
- status;
- source class;
- exact source snapshot and row hashes;
- matching method and policy version;
- candidates, score and ambiguity delta where applicable;
- derivation inputs and formula identity where derived;
- blocker/limitation codes;
- `approvalGranted: false`;
- `bindingCreated: false`;
- `calculationEligible: false`.

#### `EngineeringEnrichmentResolutionSet.v1`

A deterministic collection of targets and field proposals. It may report exactness and blockers, but it must not report project acceptance or production readiness.

### Status vocabulary

```text
EXACT_SOURCE
EXACT_APPROVED_MAPPING
DERIVED_FROM_EXPLICIT_EVIDENCE
PROPOSED_REVIEW
BLOCKED_MISSING
BLOCKED_AMBIGUOUS
BLOCKED_CONFLICT
NOT_APPLICABLE
```

Only the first three may be candidates for external approval. `PROPOSED_REVIEW` is never calculation eligible.

## Field authority and fallback policy

### Line identity

```text
explicit source line attribute
  > exact normalized line key
  > approved manual target-to-line mapping
  > fuzzy/contained candidate as PROPOSED_REVIEW
  > BLOCKED
```

Duplicate exact keys are a blocker; no last-row or first-row selection is allowed.

### Piping class

```text
exact Process Line List piping class
  > explicit source-model class under approved precedence policy
  > approved manual mapping
  > branch-name token candidate as PROPOSED_REVIEW
  > approximate class-family candidate as PROPOSED_REVIEW
  > BLOCKED
```

A disagreement between exact line-list and source-model classes is `BLOCKED_CONFLICT` unless an approved precedence record exists.

### Process pressure and temperature

```text
exact line-list row field
  > approved line-specific override
  > approved class/service policy only when the policy explicitly governs that field
  > service consensus as PROPOSED_REVIEW
  > BLOCKED_MISSING
```

No generic process default and no hydro-pressure zero are allowed. Temperature ranges must remain structured ranges until a separate policy defines which bound is required for a named calculation.

### Service, phase and test medium

Exact source values govern. A derived service token or phase heuristic is a proposal. Hydro density cannot be inferred without an approved test-medium policy.

### Nominal bore and outside diameter

```text
explicit source dimension
  > exact approved source conversion
  > exact piping-class row
  > generic dimensional standard as a named PROPOSED_REVIEW policy
  > BLOCKED
```

Generic ASME tables must identify standard, edition, table and policy hash; they must not silently appear as source values.

### Schedule, wall thickness and corrosion allowance

```text
explicit source value
  > exact piping-class row by class + DN + component applicability
  > DTXR schedule/thickness evidence under an approved mapping table
  > approved manual override
  > BLOCKED
```

Configured defaults and zero are prohibited.

### Material identity and code

Process Line List material is governing when populated. A nonblank unresolved process material blocks piping-class fallback. XML/source material may be used when the line list is blank. Piping-class material is fallback proposal only unless a project policy explicitly declares it authoritative.

### Material density

```text
approved material-specific registry keyed by resolved material identity
  > approved project material family policy
  > PROPOSED_REVIEW family heuristic
  > BLOCKED
```

`7850` and `8050` must not be silent defaults.

### Operating and hydro density

```text
exact approved process row
  > approved fluid/phase/test-medium registry
  > service/phase consensus as PROPOSED_REVIEW
  > BLOCKED
```

Liquid=`1000`, gas=`300`, or bore-based hydro rules are proposals unless an approved policy provides the exact applicability and source.

### Insulation

Missing insulation data is not equivalent to no insulation. The model requires one of:

- explicit `NOT_INSULATED` evidence;
- insulation code/thickness from a source row;
- approved line-specific override;
- blocked state.

Density then resolves from an approved insulation-code registry. Thickness `0` and density `0` are valid only for explicit `NOT_INSULATED` state.

### Pipe weight

A formula-derived pipe weight is permitted only when OD, wall and material density are individually source-qualified. The proposal must retain the formula identifier and all input proposal hashes.

### Component weight

```text
explicit source component weight
  > exact catalog key
  > unambiguous scored catalog match above approved threshold
  > ambiguous/scored candidate as PROPOSED_REVIEW
  > BLOCKED
```

## Proposed implementation phases

### Phase 0 — freeze and characterize upstream behavior

- record exact upstream commit hashes;
- copy no production code yet;
- create fixture-based characterization tests for stagedJson and Preview behavior;
- document every current default, heuristic, mutation and ambiguity path;
- define which repository/ref owns each resolver.

Deliverable: parity and divergence report with executable fixtures.

### Phase 1 — field and policy contracts

- add target, master snapshot, proposal and resolution-set contracts;
- add canonical hashing and strict nested validation;
- define field IDs, canonical units and applicability;
- define the status and blocker vocabulary;
- add no-authority invariants.

Deliverable: pure contracts and tests, no UI or production integration.

### Phase 2 — exact enrichment kernel

- implement exact line-list indexing with duplicate detection;
- implement one piping-class precedence policy;
- implement exact class-row applicability matching;
- implement exact process, material, dimensional, insulation and weight resolution;
- produce immutable proposal sets without source-model mutation.

Deliverable: exact-source proposals only.

### Phase 3 — evidence-derived proposals

- add DTXR wall/schedule derivation with explicit mapping policy;
- add formula-derived pipe weight with input lineage;
- add controlled standard-table proposals with edition/table identity;
- keep every non-exact result `PROPOSED_REVIEW`.

Deliverable: traceable derived proposals.

### Phase 4 — heuristic proposal adapters

- port fuzzy line candidate generation;
- port approximate piping-class candidates;
- port service-consensus process suggestions;
- port phase/density suggestions only under named policy;
- prohibit automatic selection or override mutation.

Deliverable: ranked review candidates only.

### Phase 5 — pre-flight review UI

Replace or isolate the prototype LFEA pre-flight grid with a review surface showing:

- source and target identities;
- current value versus proposed value;
- exact/derived/heuristic status;
- candidates, scores and reasons;
- source file/sheet/row/hash;
- blockers and conflicts;
- field-level user decision capture owned outside the enrichment kernel;
- service/class bulk actions that create explicit review decisions rather than DOM-only fill-down.

No demo dataset may appear in authoritative mode.

### Phase 6 — Project Data candidate handoff

- convert externally approved field decisions into a new immutable Project Data candidate;
- retain proposal hash, decision evidence and authority owner;
- rerun Project Data stale-hash and workflow validation;
- do not bind to LFEA or production calculations in this phase.

### Phase 7 — deprecation and drift removal

- remove or quarantine duplicate CII resolver ports after the new kernel reaches parity;
- mark the old LFEA pre-flight grid prototype-only or replace it;
- remove default-zero and config-default calculation paths;
- establish upstream snapshot/update policy if selected logic remains externally sourced.

### Phase 8 — separately governed consumer adoption

Only after field-level approval and a new immutable candidate may a separate programme evaluate consumption by empirical loads, LFEA or other solvers. All affected qualification and release gates must be rerun.

## Suggested PR sequence

### PR A — this planning PR

- comparison;
- authority and fallback matrix;
- target architecture;
- implementation phases and test strategy.

### PR B — contracts and exact master snapshots

No UI and no production consumers.

### PR C — exact enrichment kernel

Exact matching only; no fuzzy or service consensus.

### PR D — evidence-derived and heuristic proposal adapters

All non-exact outputs remain review-only.

### PR E — pre-flight proposal review UI

No solver or production binding.

### PR F — approved Project Data candidate handoff

External field-level decisions required.

Consumer adoption must be a later, independently reviewed PR.

## Qualification strategy

### Characterization fixtures

Use the same representative source cases across stagedJson, XML Preview and the new kernel:

- exact line and exact class;
- duplicate line keys;
- contained line-key candidates;
- fuzzy line candidate;
- class suffix/base mismatch;
- ambiguous class rows;
- nonblank unresolved line-list material;
- XML material fallback;
- DTXR schedule/wall evidence;
- absent wall/CA;
- missing process values with same-service rows;
- mixed service values below consensus threshold;
- explicit not-insulated versus missing insulation;
- exact and ambiguous component weights;
- stale source hash;
- geometry non-mutation.

### Mandatory assertions

- deterministic canonical output;
- no source-model geometry mutation;
- no first/last-row duplicate selection;
- no heuristic result marked exact;
- no missing value represented as zero;
- no proposal grants approval or calculation eligibility;
- source hash, row identity and mapping-policy hash reconstruct;
- conflicting authority sources block;
- field-level lineage reaches every derived formula input;
- current Project Data remains unchanged until an external decision is applied.

## Decisions required before implementation

1. Confirm `reallaksh19/3D_Converters/main` as the canonical upstream source for both requested workflows, or identify the exact standalone repository/ref intended by “CII->XML(201) standalone.”
2. Approve the line-list versus source-model piping-class precedence rule.
3. Approve whether DTXR is a source observation or a derived proposal for wall/schedule by field and component type.
4. Identify the controlled standards and editions, if generic OD/wall tables are to be offered as proposals.
5. Identify the authoritative material, fluid and insulation density registries.
6. Identify which role owns field-level enrichment decisions before Project Data candidate creation.
7. Decide whether the existing LFEA pre-flight grid is replaced, retained as a prototype, or moved outside authoritative workflows.

## Recommended disposition

```text
STAGEDJSON BATCH/AUDIT MODEL:          ADOPT
PREVIEW CANDIDATE DIAGNOSTICS:         ADOPT AS REVIEW-ONLY
FUZZY LINE/CLASS MATCHING:             PROPOSAL-ONLY
SERVICE CONSENSUS:                     PROPOSAL-ONLY
CONFIG DEFAULTS / DEFAULT-ZERO:        REMOVE FROM AUTHORITY PATH
GENERIC OD/WALL/DENSITY HEURISTICS:    NAMED POLICY PROPOSALS ONLY
CURRENT PROJECT DATA EVIDENCE MODEL:   RETAIN AND EXTEND
CURRENT LFEA PREFLIGHT GRID:           REPLACE OR ISOLATE AS PROTOTYPE
DIRECT LFEA/PRODUCTION BINDING:        NOT IN THIS PROGRAMME
```

The target is not to choose one existing workflow wholesale. The correct adoption combines the stagedJson path's immutable batch artifact and audit discipline, the Preview path's candidate visibility and human review ergonomics, and the original concept note's source evidence, approval and fail-closed doctrine.
