# Engineering Enrichment Preflight UI Concept

**Document status:** Issued for review  
**Programme:** Authoritative engineering enrichment  
**Target application:** `Advanced_Analysis` desktop/web workspace  
**Primary source screen:** `src/workspace/lfea-preflight-ui.js`  
**Related concept:** `docs/enrichment-upgrade-concept-report.md`  
**Decision proposed:** Retain the preflight workflow and evolve it into a bulk, exception-driven enrichment workbench.

---

## 1. Executive decision

The existing preflight UI should be retained as the user-facing foundation for enrichment.

The retained concept is:

```text
load model and masters
  -> inspect source readiness
  -> run bulk enrichment
  -> review unresolved or proposed fields
  -> apply governed bulk decisions
  -> produce an auditable Project Data candidate
```

The current implementation must not be retained unchanged. It renders a large hierarchical DOM table with many live inputs and direct fill-down behavior. That approach will not scale safely to industrial datasets containing thousands of lines and many more component records.

The proposed upgrade therefore retains:

- the preflight location in the workspace;
- the Service / Rating / Piping Class / Line hierarchy;
- the concept of process-data loading;
- class- and service-level bulk operations;
- explicit blocked states;
- direct linkage to source evidence and the 3D model.

It replaces:

- render-all nested DOM rows;
- direct automatic mutation of line values;
- first-found containment matching;
- editable cells without explicit source state;
- hidden fallback behavior;
- generic fill-down that overwrites stronger evidence;
- mixed topology and enrichment actions in one undifferentiated toolbar.

The primary interaction model becomes **review by exception**. An engineer should not inspect every successful line. The UI must direct attention to ambiguous, conflicting, stale, proposed, and missing fields.

---

## 2. Why preflight is the correct UI foundation

The standalone XML-to-CII Preview is optimized for conversion inspection. It is effective when a user is examining branch records, candidate matches, and individual output values before producing a converted file.

Bulk staged model enrichment has a different operating profile:

- one imported model may contain thousands of line-level targets;
- each line may contain many components;
- most exact matches should complete without individual interaction;
- one source defect can affect hundreds of records;
- decisions are often made at service, piping-class, or source-row scope;
- users need progress, coverage, exception counts, and impact previews;
- evidence and approval state matter more than cell-by-cell editing speed.

The preflight UI already represents the correct operational moment: after source intake and before analytical consumption. It is therefore the appropriate location for governed enrichment.

The UI should not clone the standalone Preview. Preview capabilities such as candidate scoring, source comparison, and detailed provenance should be incorporated as drill-down tools inside the preflight workbench.

---

## 3. Product outcome

The upgraded UI must help an engineer answer five questions quickly:

1. **Are the required model and master sources present and current?**
2. **How much of the model resolved exactly?**
3. **Which lines or fields require engineering review?**
4. **What evidence supports each proposed value?**
5. **What will change if the selected decisions are applied?**

The successful operating pattern is:

```text
10,000 lines loaded
  -> 9,300 exact or deterministic
  -> 500 blocked by missing evidence
  -> 160 proposed from governed heuristics
  -> 40 conflicts
  -> user reviews 700 exceptions, not 10,000 lines
```

The UI must always distinguish exact evidence from deterministic derivation, heuristic proposals, user decisions, and approved Project Data values.

---

## 4. Design principles

### 4.1 Exception-first

Default views show unresolved and review-required work. Fully exact lines remain available but collapsed behind summary counts or filters.

### 4.2 Bulk before detail

The primary row is a line-level enrichment target. Component-level records are loaded only when a line is expanded or a component-weight exception requires review.

### 4.3 Evidence before editing

A value cannot be edited as an anonymous number. Every action must show the current source, candidate source, status, and resulting authority state.

### 4.4 Preview before apply

Bulk changes must first produce an impact preview:

```text
selected scope
fields affected
current statuses
candidate source
records skipped because stronger evidence exists
conflicts introduced or resolved
```

### 4.5 No silent fallback

Fallbacks are visible proposals. The UI must never display a generic assumption using the same visual treatment as an exact line-list or piping-class value.

### 4.6 Stable identity

Selection and review actions use stable target IDs and source hashes, not current row positions, DOM indices, or display labels.

### 4.7 Scalable rendering

The central grid must use row and column virtualization. Filtering, grouping, sorting, and selection operate against an indexed data model rather than searching rendered DOM elements.

### 4.8 Reversible review decisions

Every accepted, rejected, overridden, or deferred proposal produces an immutable review event. Undo creates a new reversal event; it does not delete history.

---

## 5. Information architecture

The preflight area should become one workspace with five modes.

```text
1. Sources
2. Coverage
3. Exceptions
4. Review
5. Candidate
```

### 5.1 Sources

Purpose: confirm source readiness before enrichment runs.

Shows:

- active model name and SHA-256;
- line-list file, sheet, row count, hash, mapping status;
- piping-class file, row count, hash, mapping status;
- material-map source and hash;
- component-weight source and hash;
- approved derivation-policy versions;
- Project Data profile origin and current validation status;
- stale-source warnings.

Primary actions:

- import or replace a source;
- inspect field mapping;
- compare source revision;
- validate source snapshot;
- run enrichment.

No engineering values are approved in this mode.

### 5.2 Coverage

Purpose: show bulk resolution health immediately after a run.

Summary cards:

```text
Total lines
Exact
Derived
Proposed
Missing
Ambiguous
Conflicting
Stale
Not applicable
```

Additional coverage views:

- status by field;
- status by service;
- status by piping class;
- status by source master;
- top blocker codes;
- changes since previous run;
- lines affected by a source revision.

Selecting a card opens the central grid with the corresponding filter.

### 5.3 Exceptions

Purpose: process work queues rather than browse all records.

Default queues:

```text
Blocking before load calculation
Line identity conflicts
Piping-class conflicts
Missing process data
Missing dimensions
Material conflicts
Fluid-density review
Insulation review
Component-weight review
Stale source evidence
User-deferred items
```

Each queue has:

- affected line count;
- affected field count;
- severity;
- governing source;
- suggested action;
- whether a safe bulk operation is available.

### 5.4 Review

Purpose: review one selected line, group, field family, or candidate set.

Contains:

- candidate comparison;
- source evidence;
- match reasons and score;
- competing values;
- model attributes;
- line-list row details;
- piping-class row details;
- derivation inputs and policy hash;
- affected components and load cases;
- accept, reject, override, defer, and map actions.

### 5.5 Candidate

Purpose: inspect the complete unapproved Project Data candidate before handoff.

Shows:

- selected values and statuses;
- unresolved blockers;
- review-event count;
- source hashes;
- candidate semantic hash;
- changes versus current Project Data;
- downstream workflows that would remain blocked;
- export and handoff controls.

The UI must label this artifact **UNAPPROVED CANDIDATE** until an external approval workflow changes its authority.

---

## 6. Main screen layout

The recommended desktop layout is:

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Enrichment Preflight | source state | run state | active candidate          │
├──────────────────────────────────────────────────────────────────────────────┤
│ Summary cards: Exact | Derived | Proposed | Blocked | Conflict | Stale       │
├───────────────┬──────────────────────────────────────────────┬───────────────┤
│ Facets /      │ Virtualized line grid                        │ Evidence /    │
│ queues        │                                              │ review drawer │
│               │                                              │               │
│ Status        │ Service Class Line  P1 T1 T2 T3 WT ...      │ field status  │
│ Field         │ ...                                          │ candidates    │
│ Service       │                                              │ provenance    │
│ Class         │                                              │ actions       │
│ Source        │                                              │ impact        │
├───────────────┴──────────────────────────────────────────────┴───────────────┤
│ Selection bar: 238 lines | Preview action | Clear | Export review queue     │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 6.1 Top command bar

Contains only run-level actions:

- validate sources;
- run enrichment;
- compare with previous run;
- export audit;
- open candidate;
- show run history.

Topology autofix should not remain in this command group. It belongs in a separate topology-preflight section or tool because topology mutation and attribute enrichment have different authority, evidence, and review consequences.

### 6.2 Summary strip

The summary strip is always visible and acts as navigation. Each status count is clickable.

Example:

```text
Exact 9,304 | Derived 420 | Proposed 166 | Blocked 71 | Conflict 32 | Stale 7
```

Counts must be calculated from the complete indexed result, not rendered rows.

### 6.3 Facet and queue rail

The left rail offers fast bulk navigation:

- saved queues;
- statuses;
- fields;
- services;
- piping classes;
- ratings;
- source masters;
- review ownership;
- changed since last run;
- selected-only.

Facets display counts and support multi-select with AND/OR rules that are visible to the user.

### 6.4 Virtualized central grid

The central grid is the main bulk-processing surface.

It must support:

- row virtualization;
- optional column virtualization;
- sticky identity columns;
- pinned status columns;
- column groups;
- saved views;
- multi-column sorting;
- keyboard range selection;
- group headers without rendering all descendants;
- server/worker-style filtering over the in-memory index;
- lazy component expansion.

### 6.5 Evidence and review drawer

The right drawer opens for the active cell or selected group.

It replaces uncontrolled inline editing with a governed review flow.

The drawer must show:

```text
Field
Current outcome
Current source
Candidate values
Candidate source and hash
Match or derivation method
Confidence / ambiguity
Competing evidence
Impact scope
Review history
Available actions
```

### 6.6 Selection action bar

A sticky bottom bar appears when records are selected.

It shows:

- selected line count;
- selected field count;
- statuses represented;
- whether the selection is homogeneous;
- safe bulk actions;
- records that will be skipped;
- preview action.

No bulk action applies immediately. The first step always opens an impact preview.

---

## 7. Primary row model

### 7.1 Line-level row

The principal grid row represents an enrichment line target, not an individual XML node or stagedJson element.

Recommended identity columns:

```text
Status
Line key
Full source path
Service
Piping class
Rating
Nominal bore range
Component count
Source match
```

Recommended engineering field groups:

```text
Process
  P1
  hydro pressure
  T1
  T2
  T3
  phase
  test medium

Pipe specification
  piping class
  rating
  nominal bore
  OD
  schedule
  wall thickness
  corrosion allowance

Material
  material
  material code
  material density

Contents and insulation
  operating fluid density
  hydro fluid density
  insulation code
  insulation thickness
  insulation density

Weights
  pipe weight per metre
  unresolved component-weight count
  resolved component-weight count
```

### 7.2 Component drill-down

Components are not rendered as permanent child rows for the full dataset.

A line expands into a lazy-loaded component panel containing:

- component identity;
- type;
- size and rating;
- DTXR evidence;
- component-weight candidates;
- selected or unresolved weight;
- diagnostics.

This prevents a model with 10,000 lines and 150,000 components from creating 160,000 live DOM rows.

### 7.3 Group rows

Service, rating, and piping-class rows remain available as logical groups.

They are navigation and aggregation objects, not editable records.

A group row shows:

- line count;
- exact/derived/proposed/blocked counts;
- common values;
- conflicting value count;
- applicable bulk actions.

A group operation creates proposals for eligible descendants. It must not overwrite exact evidence automatically.

---

## 8. Cell presentation

Each cell presents value and authority state together.

Example:

```text
120 °C
LINE LIST · EXACT
```

or:

```text
120 °C
SERVICE CONSENSUS · REVIEW
```

or:

```text
BLOCKED
NO LINE-LIST EVIDENCE
```

Recommended visual tokens:

| Status | Token | Meaning |
|---|---|---|
| `RESOLVED_EXACT` | solid green check | exact source evidence |
| `RESOLVED_DERIVED` | blue function symbol | deterministic approved derivation |
| `PROPOSED_REVIEW` | amber diamond | non-authoritative candidate |
| `BLOCKED_MISSING` | red empty-circle | required evidence absent |
| `BLOCKED_AMBIGUOUS` | red split marker | multiple acceptable candidates |
| `BLOCKED_CONFLICT` | red opposing-arrows | authoritative sources disagree |
| `BLOCKED_STALE_SOURCE` | purple clock/hash | source revision invalidated evidence |
| `NOT_APPLICABLE` | muted dash | field does not apply |

Color must not be the only status indicator. Icons and text labels are mandatory.

The grid should initially show compact status/value cells. Full provenance appears in the drawer, not in every row.

---

## 9. Bulk operation design

### 9.1 Types of bulk action

Permitted bulk actions include:

- apply an exact source mapping;
- select one candidate for an ambiguity set;
- create a manual line-key mapping;
- accept an approved deterministic derivation policy;
- propose a service-level process value;
- propose a piping-class-level value;
- mark a field not applicable under an approved rule;
- reject a candidate family;
- defer selected exceptions;
- assign a review owner;
- export selected exceptions.

### 9.2 Bulk action eligibility

The engine must calculate eligibility before presenting an action.

Example:

```text
Selected: 240 lines
Eligible: 211
Skipped exact evidence: 17
Skipped conflicts: 8
Skipped stale sources: 4
```

### 9.3 Impact preview

The impact preview modal or drawer contains:

```text
Action
Scope
Source evidence
New candidate state
Fields affected
Rows affected
Rows skipped
Conflicts created
Downstream blocker change
Review event to be created
```

The user confirms the review event, not a direct mutation of source data.

### 9.4 Fill-down replacement

The current `Fill Service` and `Fill Class` concepts should remain, but their semantics change.

Old behavior:

```text
copy displayed parent values into child inputs
```

New behavior:

```text
create scoped proposals for unresolved eligible child fields
  -> preserve stronger exact/derived evidence
  -> identify conflicts
  -> preview impact
  -> record review event
```

Suggested labels:

```text
Propose to unresolved lines in Service
Propose to unresolved lines in Class
```

The word `Fill` should be avoided where it implies unqualified automatic authority.

---

## 10. Run lifecycle

The UI should model enrichment as an explicit run.

### 10.1 Run states

```text
NOT_STARTED
VALIDATING_SOURCES
BLOCKED_SOURCE_INPUT
BUILDING_SNAPSHOTS
INDEXING_TARGETS
RESOLVING_EXACT
BUILDING_PROPOSALS
BUILDING_AUDIT
COMPLETED_WITH_BLOCKERS
COMPLETED_REVIEW_REQUIRED
COMPLETED_EXACT
FAILED_INTERNAL
CANCELLED
```

### 10.2 Progress display

Progress is presented by stage and record counts:

```text
Indexing model targets       10,000 / 10,000
Resolving line identity       9,820 / 10,000
Resolving piping classes      8,900 / 10,000
Building weight proposals     42,100 / 51,300 components
```

Do not simulate percentage completion when total work is unknown. Use indeterminate status until counts are available.

### 10.3 Cancellation

A run can be cancelled before candidate publication. Cancellation must leave the previous completed run and candidate unchanged.

### 10.4 Run comparison

The UI supports comparison with the previous run:

- newly resolved;
- newly blocked;
- source-changed;
- candidate-changed;
- reviewer decision invalidated;
- no change.

---

## 11. Filtering and saved views

Required default views:

```text
All lines
Blocking only
Review required
Exact and derived
Changed since last run
Process data gaps
Piping-class gaps
Wall-thickness gaps
Density and insulation gaps
Component-weight exceptions
Stale evidence
My review queue
```

Users may save named views containing:

- filters;
- visible columns;
- grouping;
- sorting;
- density setting;
- selected queue type.

Saved views do not store record selection because selections may become invalid after a new run.

---

## 12. Search

Search must be indexed and independent of rendered rows.

Supported targets:

- exact line key;
- full branch path;
- service;
- piping class;
- rating;
- source row identifier;
- component identifier;
- diagnostic code;
- review-event ID.

Search results must explain why a record matched.

Fuzzy search in the UI is navigation only. It does not alter engineering match outcomes.

---

## 13. Candidate comparison drawer

For ambiguous or conflicting records, the drawer displays candidate rows side by side.

Example:

| Candidate | Source | Match method | Score | Conflicts | Result if selected |
|---|---|---:|---:|---|---|
| `91261` | Piping-class master row 214 | exact class + bore | 1,540 | none | 8 fields resolved |
| `91261M7` | model attribute | exact model token | n/a | line-list class differs | conflict remains |
| `91260` | family prefix | 0.82 | bore mismatch | proposal only |

The UI must not collapse candidates into a single unexplained “best match.”

---

## 14. Evidence inspection

Every resolved or proposed field can open evidence details.

Minimum evidence presentation:

```text
Source name
Source type
Source SHA-256
Sheet / row / column or JSON path
Normalized source key
Raw source value
Normalization rule
Resolver method
Derivation policy and hash
Evaluation timestamp
Target identity
```

Raw source evidence should be shown in a read-only inspector with the matched field highlighted where feasible.

---

## 15. Manual mapping workflow

A manual mapping is not a direct cell override.

Workflow:

```text
select unresolved or conflicting targets
  -> choose/create mapping rule
  -> define mapping scope
  -> preview affected records
  -> save mapping proposal
  -> rerun affected enrichment stages
```

Mapping scopes may include:

- one line target;
- one exact model token;
- one source alias;
- one piping-class token;
- one class-and-bore pair;
- one approved project-specific rule.

Each mapping stores:

- normalized key;
- target value;
- scope;
- source evidence or engineering rationale;
- creator;
- timestamp;
- review state;
- semantic hash.

Mappings cannot be hidden inside browser local storage as anonymous overrides.

---

## 16. Process-parameter review

Process fields frequently share one line-list row and should be reviewed as a related set.

The drawer should provide a process-data panel:

```text
P1
Hydro pressure
T1
T2
T3
Service
Phase
Test medium
Operating density
Hydro density
Insulation code
```

It must indicate whether fields originate from:

- the same exact row;
- different exact sources;
- a deterministic register lookup;
- service consensus;
- a user proposal;
- a generic policy proposal.

Partial source rows are allowed. Missing fields remain individually blocked or proposed; the entire row is not automatically rejected.

Temperature ranges should be shown as ranges. Collapsing a range to a maximum is a distinct derivation requiring a named policy and visible formula.

---

## 17. Piping-class and dimensional review

The specification panel should display:

```text
Requested piping class
Resolved piping class
Model piping class
Line-list piping class
Matched master row
Rating
Nominal bore
Outside diameter
Schedule
Wall thickness
Corrosion allowance
Material
Material code
```

Conflicts between exact line-list and model class are prominently blocked.

DTXR evidence appears as an additional evidence source. The user can inspect:

- raw DTXR text;
- extracted schedule or thickness;
- extraction rule;
- applicable class/bore context;
- derivation table and version;
- resulting wall thickness.

---

## 18. Weight review

Pipe and component weights require different UI treatment.

### 18.1 Pipe weight

Show formula inputs:

```text
OD
wall thickness
material density
inside diameter
formula version
calculated kg/m
```

If any input is proposed rather than exact/derived, calculated pipe weight remains proposed and inherits the weakest input status.

### 18.2 Component weight

The line row shows unresolved/resolved component counts. Component details open in a lazy panel.

Candidate ranking shows:

- component type;
- bore;
- rating;
- length;
- DTXR/description hints;
- candidate mass;
- individual score components;
- ambiguity delta;
- rejection reason.

Bulk acceptance is allowed only for a homogeneous candidate rule and must preview all affected component identities.

---

## 19. Relationship with 3D viewport

The enrichment workbench should remain linked to the 3D model without making 3D interaction mandatory for bulk processing.

Supported actions:

- select line in grid -> highlight route in viewport;
- select component exception -> focus component;
- viewport selection -> reveal corresponding line and component;
- show blocked/review-required overlays by status;
- isolate selected service or piping class;
- clear synchronization.

Viewport synchronization must be throttled. Scrolling through grid rows must not continuously fly the camera.

A deliberate `Show in 3D` action is preferable for focus changes.

---

## 20. Separation from topology preflight

The current preflight toolbar combines process-data loading, wall derivation, topology autofix, and fallback verification.

The upgrade should separate two domains:

```text
Attribute enrichment preflight
  process data
  piping specification
  materials
  densities
  insulation
  weights

Topology preflight
  port connectivity
  support grouping
  overlap analysis
  route partition blockers
```

They may share a common preflight shell and summary navigation, but they need separate runs, status models, review events, and candidate artifacts.

No topology mutation should occur as a side effect of an enrichment run.

---

## 21. Performance architecture

### 21.1 Data indexing

Build in-memory indexes for:

- target ID;
- normalized line key;
- source row key;
- service;
- piping class;
- status;
- field blocker code;
- source hash;
- review owner;
- changed-since-run state.

Duplicate keys map to arrays and explicit ambiguity records. A `Map` must never silently overwrite duplicate source rows.

### 21.2 Worker execution

Expensive operations should run in a Web Worker where platform support permits:

- source normalization;
- target inventory;
- exact resolution;
- candidate scoring;
- coverage aggregation;
- CSV generation;
- run comparison.

The main thread handles rendering and interaction.

### 21.3 Virtualization targets

Qualification targets proposed for review:

```text
100,000 line rows indexed without render-all DOM creation
60 visible grid rows or fewer in the DOM viewport
filter response p95 <= 150 ms after indexes are built
sort response p95 <= 300 ms for 100,000 line rows
drawer open p95 <= 100 ms for indexed evidence
scrolling target >= 50 fps on reference hardware
selection of 10,000 rows <= 200 ms
impact preview for 10,000 rows <= 1,000 ms
```

These numbers are initial UI engineering targets, not release evidence. Reference hardware and browser versions must be fixed during Phase 0.

### 21.4 Incremental rendering

Coverage cards and grid shell may render before every component-weight proposal is complete, provided the UI clearly labels partial stages and prevents candidate publication until the run is complete.

---

## 22. State model

The UI should consume immutable state objects:

```text
EnrichmentRun
EnrichmentCoverageSummary
EnrichmentLineProjection
EnrichmentFieldOutcome
EnrichmentCandidateSet
EnrichmentReviewEvent
EnrichmentCandidatePackage
```

UI-local state is limited to:

- active mode;
- filters;
- sort;
- visible columns;
- expanded rows;
- current focus;
- transient selection;
- drawer state.

Engineering outcomes, mappings, proposals, and review decisions are not stored only in component or DOM state.

---

## 23. Accessibility and keyboard use

The bulk grid must support:

- keyboard navigation between cells;
- shift-range and control/meta multi-selection;
- accessible row and column labels;
- visible focus;
- screen-reader status text;
- status meaning without color;
- zoom to 200% without loss of critical actions;
- high-contrast mode compatibility;
- no hover-only evidence.

Suggested shortcuts:

```text
/              focus search
B              blocking queue
R              review-required queue
E              exact/derived view
Enter          open evidence drawer
Shift+Space    select row
Ctrl/Cmd+A     select filtered rows after confirmation
P              preview available bulk action
Esc            clear drawer or selection
```

Shortcuts must not interfere with editable search or form fields.

---

## 24. Empty, error, and blocked states

The UI needs designed states for:

- no model loaded;
- model loaded but no masters;
- one or more master mappings incomplete;
- source hash stale;
- duplicate source keys;
- enrichment run failed;
- run cancelled;
- no exceptions;
- no records matching filters;
- candidate blocked by unresolved required fields;
- previous review decisions invalidated by source changes.

No demonstration model or fabricated data should appear when a real model is absent.

---

## 25. Audit exports

From the workbench, users may export:

```text
run manifest JSON
coverage summary JSON
field outcome audit JSON
unresolved CSV
proposal review CSV
review event ledger JSON
source snapshot manifest JSON
candidate comparison JSON
```

Exports include exact source hashes and candidate/run identifiers.

Exporting is not approval.

---

## 26. Phase-wise UI implementation

### UI Phase 0 — Existing preflight inventory

**Purpose:** Freeze current behavior and establish benchmark fixtures.

Deliverables:

- current-screen interaction inventory;
- screenshots and DOM/performance baseline;
- current action-to-state map;
- list of unsafe direct mutations and hidden fallbacks;
- representative small, medium, and large fixtures;
- accessibility baseline.

Exit gate:

- all current preflight behaviors are classified as retain, replace, relocate, or retire.

### UI Phase 1 — Workbench shell and read-only projections

**Purpose:** Create the scalable shell without changing engineering authority.

Deliverables:

- Sources / Coverage / Exceptions / Review / Candidate modes;
- virtualized read-only line grid;
- status summary cards;
- facets and saved views;
- evidence drawer using existing read-only evidence;
- stable target selection;
- no bulk mutation.

Exit gate:

- large fixture can be browsed, filtered, sorted, and inspected within agreed performance limits.

### UI Phase 2 — Exact-resolution coverage

**Purpose:** Visualize Phase 2–4 enrichment contracts.

Deliverables:

- field status cells;
- exact source provenance;
- duplicate and ambiguity queues;
- line-list and piping-class comparison panels;
- run progress and run history;
- audit export.

Exit gate:

- every displayed value is traceable to a contract outcome and source evidence.

### UI Phase 3 — Proposal review

**Purpose:** Add governed review of non-exact outcomes.

Deliverables:

- candidate comparison;
- match score and reason display;
- DTXR derivation inspection;
- service-consensus proposals;
- component-weight drill-down;
- accept/reject/defer actions producing review events.

Exit gate:

- proposals cannot be mistaken for exact values or approved values.

### UI Phase 4 — Bulk review actions

**Purpose:** Support high-volume exception handling.

Deliverables:

- selection action bar;
- group-level proposal actions;
- impact preview;
- eligible/skipped/conflict counts;
- manual mapping workflow;
- review ownership and queues;
- undo via reversal event.

Exit gate:

- no bulk action bypasses preview, evidence, or immutable review events.

### UI Phase 5 — Candidate handoff

**Purpose:** Produce and inspect an unapproved Project Data candidate.

Deliverables:

- candidate comparison to current Project Data;
- blocker summary;
- source hash manifest;
- candidate semantic hash;
- export/handoff action;
- explicit `UNAPPROVED CANDIDATE` treatment.

Exit gate:

- UI cannot mark candidate values approved or solver-authorized.

### UI Phase 6 — Legacy isolation

**Purpose:** Remove unsafe paths after parity and qualification.

Deliverables:

- retire direct DOM fill-down mutation;
- remove demonstration datasets;
- remove localStorage-only engineering overrides;
- separate topology autofix;
- isolate or remove standalone-preview state dependencies;
- migration guidance for saved mappings/views.

Exit gate:

- only the governed workbench can create enrichment review events or candidates.

### UI Phase 7 — Qualification and rollout

**Purpose:** Validate industrial-scale usability.

Deliverables:

- performance qualification;
- accessibility review;
- keyboard workflow validation;
- source-change invalidation tests;
- bulk-action negative tests;
- shadow comparison with legacy output;
- user acceptance sessions using real project fixtures.

Exit gate:

- controlled activation approved by the product and engineering owners.

---

## 27. Proposed PR sequence for UI work

```text
UI PR 1  Preflight inventory, fixtures, and interaction contract
UI PR 2  Virtualized read-only workbench shell
UI PR 3  Coverage, queues, and evidence drawer
UI PR 4  Proposal review and component drill-down
UI PR 5  Bulk actions and impact preview
UI PR 6  Candidate handoff and Project Data comparison
UI PR 7  Legacy isolation and topology separation
UI PR 8  Performance, accessibility, and rollout qualification
```

Each PR should remain independently testable and must not introduce solver authority.

---

## 28. Review decisions requested

Reviewers should explicitly decide:

1. Confirm that the preflight UI is the canonical enrichment workbench.
2. Confirm that line-level rows are primary and component rows are lazy drill-down.
3. Confirm that default navigation is exception-first.
4. Confirm replacement of direct `Fill Service` / `Fill Class` with proposal-and-preview actions.
5. Confirm separation of topology autofix from attribute enrichment.
6. Confirm virtualized grid and indexed filtering as mandatory architecture.
7. Confirm that manual mappings are governed records, not anonymous local overrides.
8. Confirm that every bulk operation creates immutable review events.
9. Confirm that candidate handoff remains unapproved.
10. Confirm performance fixture sizes and target reference hardware.
11. Confirm whether the Service / Rating / Class / Line hierarchy should be the default grouped view or an optional view alongside a flat line grid.
12. Confirm review ownership and assignment requirements.

---

## 29. Recommended disposition

Adopt the existing preflight screen as the product foundation, with the following wording:

> The Engineering Enrichment Preflight Workbench is the canonical user interface for bulk model enrichment. It operates on indexed line-level projections, presents exact and derived outcomes separately from proposals, supports exception-driven and governed bulk review, and produces unapproved Project Data candidates with complete provenance. The current render-all editable tree is a prototype implementation and is not the target architecture.

Approval of this UI concept authorizes UI Phase 0 and UI Phase 1 planning only. It does not authorize production engineering values, Project Data approval, solver consumption, LFEA binding, or release qualification.
