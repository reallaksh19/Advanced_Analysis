# Professional 3D Edit Upgrade Plan

## 1. Purpose

This document defines the next professional upgrade program for the production **3D Edit** workspace. It is an implementation plan, test specification, and release-control document.

The objective is to evolve the current certified topology editor into a CAD-grade piping-editing experience without weakening its existing authority model.

The upgraded editor must feel direct, precise, discoverable, and fast while continuing to use:

- exact canonical identity;
- deterministic command requests;
- candidate regeneration and certification;
- immutable journal, undo, redo, and replay;
- source-bound persistence and export;
- verified workspace commit and rollback;
- explicit engineering-authority disclosures;
- exact-head qualification evidence.

This plan assumes the baseline already includes the completed command, checker, autofix, review, comparison, route, dossier, response, persistence, export, commit, and 20-object demo lifecycle packages through the current C3D review stack.

---

## 2. Product north star

A piping engineer should be able to open **3D Edit**, select a canonical object directly in the scene, manipulate it with familiar CAD controls, enter exact engineering values, understand every constraint and validation result, preview the deterministic outcome, and commit an auditable change without needing to know internal canonical IDs or command names.

A professional interaction should follow this sequence:

```text
Select exact canonical object
→ choose or infer an operation
→ manipulate visually or enter exact values
→ resolve snaps and constraints deterministically
→ regenerate a governed candidate
→ show a non-pickable certified preview
→ run incremental validation
→ accept into the existing journal or cancel without mutation
→ review source-versus-draft evidence
→ save, export, commit, and reopen exactly
```

---

## 3. Non-negotiable authority boundaries

| Boundary | Required rule |
| --- | --- |
| Canonical identity | Use canonical IDs, exact port keys, source crosswalks, and explicit instance picking only. Never infer editing identity from mesh name, nearest object, visual overlap, or proximity. |
| Command authority | All accepted geometry or topology changes must enter through the governed command request, certification, reducer, and journal path. The renderer and interaction layer must never mutate canonical topology directly. |
| Preview authority | A preview is display-only. Acceptance must use the exact candidate and certification hashes generated for that preview. |
| Engineering evidence | Dimensions, fitting definitions, restraint data, class, material, rating, and connection properties may propagate only from explicit authoritative evidence. Missing values remain visibly unresolved. |
| Determinism | No `Date.now()`, wall-clock timestamps, random IDs, unordered object iteration, environment-dependent floating-point formatting, or mutable singleton state in authority-bearing outputs. |
| Persistence | View state may be persisted only through the existing draft package. Session-only review data must not enter engineering hashes unless explicitly promoted by a later governed contract. |
| Review features | Search, measurement, comparison, route trace, dossier, intake, and review response remain display/review capabilities unless a separate certified command is accepted. |
| Release claims | A zero-step or no-log workflow is not a pass. `PASS_RELEASE` requires an exact-head run that allocated and executed every retained gate. |
| Module discipline | New production modules should use named exports, avoid hidden globals and default exports, and remain at or below 300 physical lines unless a documented exception is approved. |

---

## 4. Target professional capabilities

The next-level editor should provide all of the following as one coherent workflow:

1. **CAD-style direct manipulation**
   - translation gizmo with X, Y, and Z axes;
   - XY, YZ, and XZ plane handles;
   - exact axis locking;
   - drag preview without canonical mutation;
   - typed coordinate, delta, length, and gap entry;
   - keyboard nudge with explicit increments;
   - `Escape` cancellation and `Enter` certification.

2. **Deterministic snapping and inference**
   - endpoint;
   - centerline;
   - midpoint;
   - grid;
   - axis projection;
   - parallel;
   - perpendicular;
   - collinear;
   - orthogonal;
   - declared support or fitting datum.

3. **Engineering-aware route operations**
   - extend or shorten an edge by exact distance;
   - split by exact distance from `FROM` or `TO`;
   - move a connected run with explicit scope;
   - reconnect an open endpoint;
   - create an offset route;
   - apply a declared slope;
   - rotate a fitting around an exact centerline;
   - insert or replace a governed inline component.

4. **Specification and catalogue authority**
   - nominal size and outside diameter;
   - schedule and wall thickness;
   - fitting radius and angle;
   - reducer type and orientation;
   - valve face-to-face dimensions;
   - flange class and facing;
   - connection compatibility;
   - piping-class constraints.

5. **Continuous incremental validation**
   - snap gaps and discontinuities;
   - overlaps and zero-length geometry;
   - centerline clashes and clearance;
   - invalid bend radius or branch angle;
   - minimum straight length around fittings;
   - slope violations;
   - reducer orientation;
   - unsupported endpoints;
   - support attachment and spacing;
   - class, diameter, rating, and connection incompatibility.

6. **Professional review and history**
   - visual command timeline;
   - named checkpoints;
   - compare any two checkpoints;
   - selective revert planning;
   - saved selection sets;
   - review comments bound to canonical IDs;
   - approval-ready change summary.

7. **Large-model readiness**
   - incremental topology indexing;
   - worker-based validation;
   - spatial acceleration for picking and validation;
   - instancing and level of detail;
   - virtualized labels and panels;
   - measurable memory cleanup.

---

## 5. Reference architecture

The professional interaction layer must compile user gestures into existing or explicitly governed command requests.

```text
Pointer / keyboard / numeric input
        │
        ▼
Interaction intent
        │  immutable, exact IDs, engineering units
        ▼
Snap and constraint resolver
        │  ranked deterministic evidence, no mutation
        ▼
Operation planner
        │  one command or an atomic certified command plan
        ▼
Candidate regeneration and certification
        │
        ├── display-only ghost and dimensions
        ├── incremental validation result
        └── source-versus-draft review model
        │
        ▼
Accept → certified journal
Cancel → no journal or canonical change
```

Recommended package boundaries:

```text
src/workspace/viewport-interaction/
  topology-edit-transform-intent.js
  topology-edit-gizmo-model.js
  topology-edit-snap-candidates.js
  topology-edit-snap-resolver.js
  topology-edit-numeric-entry.js
  topology-edit-interaction-panel.js

src/workspace/topology-edit/professional/
  topology-edit-operation-plan.js
  topology-edit-route-operations.js
  topology-edit-spec-catalog.js
  topology-edit-compatibility.js
  topology-edit-incremental-validation.js
  topology-edit-change-scope.js
```

The exact names may be adjusted to repository conventions, but the separation between **display interaction**, **pure planning**, and **governed execution** must remain explicit.

---

## 6. Delivery waves

## Wave P0 — Contract freeze and observability

### Outcome

Create the interfaces needed by later work without changing production editing behavior.

### Scope

- Define immutable transform-intent contracts.
- Define snap-candidate and snap-resolution contracts.
- Define an operation-plan contract that references governed commands.
- Define changed-scope records for incremental validation.
- Add read-only interaction evidence attributes for browser tests.
- Establish units: millimetres, degrees, and unitless direction vectors.

### Required tests

- Reject missing or non-canonical IDs.
- Reject non-finite coordinates and deltas.
- Reject unsupported units.
- Prove semantic hashes are stable under object-key and collection reordering where order is not meaningful.
- Prove contract objects are deeply immutable.
- Prove no contract function accesses the DOM, renderer, storage, workspace state, or wall clock.

### Exit gate

All contracts are deterministic, pure, named-export-only, documented, and covered by focused tests. Production UI remains unchanged.

---

## Wave P1 — Selection and transform gizmo

### Outcome

Users can manipulate exact selected nodes through a professional viewport gizmo.

### Scope

- Exact node hover and selection outline.
- Separate visual states for anchor, moving target, and secondary selection.
- Axis and plane handles.
- Camera-aware gizmo scale.
- Pointer capture and drag lifecycle.
- Read-only live delta and target coordinate display.
- `Escape` to cancel.
- `Enter` or explicit **Apply** to certify.
- Compile accepted translation into existing `MOVE_NODE` authority.

### Required tests

- Exact color-ID or pick-table identity is preserved.
- Drag start on empty space does not create an intent.
- Dragging an axis locks the other two coordinates.
- Plane handles constrain movement to the selected plane.
- Camera movement during drag does not change the intended engineering result.
- Cancel leaves canonical topology, journal hash, session version, comparison, and checker state unchanged.
- Accept creates exactly one `MOVE_NODE` request.
- Undo and redo reproduce identical hashes.
- Gizmo geometry is display-only and non-pickable except for explicit gizmo handles.
- Keyboard focus and pointer capture are always released on cancel, accept, tab close, or dataset replacement.

### Browser scenarios

- Move `P-001 TO` to a 3 mm gap using the viewport only.
- Repeat for 20 mm.
- Verify the existing topology validator produces `SNAP_GAP` and certified `MERGE_NODES` repair.
- Perform the complete preview, cancel, accept, undo, and redo sequence.

### Exit gate

The 3 mm and 20 mm scenarios can be completed without canonical search or command-toolbar move buttons.

---

## Wave P2 — Numeric entry and snap/inference engine

### Outcome

Users can perform exact CAD-style edits with deterministic snapping and typed values.

### Scope

- Numeric popover for absolute X/Y/Z.
- Delta X/Y/Z entry.
- Exact gap and length entry.
- Configurable keyboard nudge increments.
- Snap toggles and active-snap status.
- Deterministic candidate collection and ranking.
- Visible snap marker, evidence label, and target canonical ID.
- Explicit tolerance profile bound to a hash.
- Snap lock during final preview so acceptance cannot silently retarget.

### Initial snap priority

1. Explicit selected target.
2. Exact canonical endpoint under pointer.
3. Declared source datum.
4. Axis or plane projection.
5. Midpoint or centerline.
6. Grid.

Distance alone must never establish identity.

### Required tests

- Stable ranking under collection reordering.
- Identical-looking objects remain separate.
- Candidate tie produces an explicit ambiguity result, not an arbitrary winner.
- Stale topology hash rejects the snap result.
- Tolerance-boundary tests at `0`, `0.001`, `3`, `20`, `25`, `25.001`, and `250` mm.
- Typed and dragged operations produce the same command payload and canonical hash when their target is identical.
- Locale-independent decimal parsing and formatting.
- No unit conversion occurs implicitly.

### Exit gate

Every accepted snap result contains exact target identity, evidence type, tolerance-profile hash, topology basis hash, and deterministic resolution hash.

---

## Wave P3 — Engineering route-operation planners

### Outcome

Common piping edits are available as precise user operations while continuing to execute through governed commands.

### Initial planners

- Extend edge by distance.
- Shorten edge by distance.
- Split edge by distance from `FROM` or `TO`.
- Reconnect two open endpoints.
- Move a connected run with an explicit boundary set.
- Create an orthogonal two-leg offset.
- Apply a declared slope to an exact run.
- Rotate a fitting around a declared centerline.

### Planning rules

- Operation planners are pure and never execute commands.
- A plan must list exact input canonical IDs.
- A plan must identify every affected node, edge, support, junction, and source record.
- A multi-command operation must be atomic: either the entire certified plan is accepted or none of it is.
- New command vocabulary is prohibited unless existing commands cannot represent the operation without semantic loss.
- Any proposed new command requires a separate authority-design review, reducer tests, journal tests, persistence tests, export tests, commit tests, API drift update, and migration disposition.

### Required tests

- Plan stability under topology collection reordering.
- Scope completeness: every changed canonical record is declared.
- Reject stale bases and changed target revisions.
- Reject disconnected or ambiguous operation scopes.
- Reject non-finite and zero-length results.
- Reject operations that would create duplicate edge pairs.
- Atomic rollback when any command in the plan fails certification.
- Undo and redo reproduce exact plan output.

### Exit gate

Each planner produces a deterministic immutable plan of existing governed commands with complete changed-scope evidence.

---

## Wave P4 — Specification catalogue and compatibility

### Outcome

The editor can distinguish visually connected geometry from specification-valid geometry.

### Scope

- Versioned catalogue schema.
- Source and authority metadata for every catalogue record.
- Pipe-size and schedule tables.
- Fitting dimensions.
- Valve face-to-face data.
- Flange classes and facings.
- Connection compatibility.
- Piping-class constraints.
- Explicit catalogue lookup result: `RESOLVED`, `AMBIGUOUS`, `UNAVAILABLE`, or `INCOMPATIBLE`.

### Rules

- Catalogue data must be content-addressed and versioned.
- No network lookup may participate in an accepted command.
- No nearest-size or best-fit substitution without explicit user selection and a governed command.
- Display suggestions must be labelled non-authoritative until selected and certified.

### Required tests

- Exact lookup by class, type, size, schedule, rating, and connection.
- Ambiguous records fail closed.
- Catalogue version drift rejects stale candidates.
- Missing values remain null/unresolved.
- Unit and rounding tests.
- Compatibility matrix tests for valid and invalid combinations.
- Export and commit retain catalogue authority hashes used by accepted operations.

### Exit gate

No fitting or component is inserted, replaced, or dimensioned without explicit catalogue evidence or an explicit unresolved state.

---

## Wave P5 — Continuous incremental validator

### Outcome

Validation updates during editing without rescanning or rerendering the entire model.

### Scope

- Compute changed topology neighbourhood from operation plans.
- Run local rules synchronously when cheap.
- Run expensive spatial and compatibility checks in a worker.
- Cancel superseded worker jobs.
- Reject stale worker responses by basis hash and request sequence.
- Display provisional and final validation states distinctly.
- Block acceptance only for explicitly blocking rule classes.

### Required rule groups

- connectivity and degree;
- zero length and duplicate edge pairs;
- snap gaps and discontinuities;
- overlap and backtracking;
- centerline clash and clearance;
- bend radius and branch angle;
- minimum straight length;
- slope;
- support attachment and spacing;
- dimension, class, rating, and connection compatibility.

### Required tests

- Incremental result equals full validation for the same final topology.
- Unaffected issue IDs remain stable.
- Changed issue IDs are deterministic.
- Superseded requests cannot overwrite newer results.
- Worker cancellation leaves no pending state.
- Acceptance uses the validation result bound to the exact candidate hash.
- Explicit warning-only conditions do not become blockers accidentally.
- A repair cannot be accepted when it introduces a prohibited new issue.

### Exit gate

For every accepted operation, incremental and full validation agree on all affected canonical IDs and issue dispositions.

---

## Wave P6 — Professional history, checkpoints, and review UX

### Outcome

Users can understand, review, and communicate the edit history as a controlled engineering change set.

### Scope

- Visual command timeline.
- Named local checkpoints.
- Compare checkpoint A to checkpoint B.
- Selective revert plan.
- Saved selection sets.
- Canonical-ID-bound review comments.
- Change summary grouped by system, line, branch, and component.
- Approval-ready report using existing dossier and response infrastructure.

### Rules

- A checkpoint references an existing journal state; it does not duplicate or rewrite the journal.
- Selective revert is a new certified forward plan, never destructive history editing.
- Review comments remain non-authoritative until a command or approval action explicitly references them.

### Required tests

- Checkpoint identity stability.
- Restore and compare against stale bases fail closed.
- Selective revert plan is deterministic.
- No checkpoint or comment changes canonical or engineering hashes.
- Dossier export/import round trip retains checkpoint references and exact canonical IDs.

### Exit gate

A reviewer can reproduce the final topology and explain every accepted command from the exported evidence package.

---

## Wave P7 — Large-model performance and resource lifecycle

### Outcome

Professional interaction remains responsive on realistic plant models.

### Scope

- Incremental search and topology indexes.
- BVH or equivalent spatial acceleration.
- Worker-based validation and heavy comparison.
- Instanced fitting/support rendering.
- Level of detail and label virtualization.
- Region, system, and line visibility loading.
- Explicit renderer and worker disposal.

### Initial performance budgets

These are acceptance targets and should be calibrated with representative fixtures:

| Metric | Initial target |
| --- | ---: |
| Selection feedback, p95 | ≤ 100 ms |
| Gizmo drag feedback, p95 | ≤ 50 ms |
| Numeric preview creation, p95 | ≤ 100 ms |
| Local incremental validation, p95 | ≤ 150 ms |
| Worker validation response for 10,000 visible components, p95 | ≤ 1,500 ms |
| First valid frame for 10,000-component fixture | ≤ 3,000 ms |
| Reopen/close memory growth after 20 cycles | ≤ 5% retained growth |
| Single-node move | No full-model topology or search-index rebuild |

### Required tests

- Deterministic benchmark fixtures with content hashes.
- Warm and cold measurements separated.
- p50, p95, and maximum recorded.
- No silent CPU fallback where GPU capability was required.
- Worker and renderer resources return to baseline after repeated lifecycle cycles.
- Performance evidence is bound to exact candidate head and fixture hashes.

### Exit gate

Performance budgets pass on an approved clean environment with exact-head evidence.

---

## Wave P8 — Accessibility, usability, and release closure

### Outcome

The professional editor is usable by keyboard, assistive technology, and engineering reviewers without hidden interaction requirements.

### Scope

- Complete keyboard command map.
- Visible focus and focus restoration.
- Accessible names for handles, snaps, validation issues, and actions.
- Live-region updates for selection, preview, validation, acceptance, cancellation, and failures.
- High-contrast source, draft, preview, and issue presentation.
- Reduced-motion mode.
- Discoverable Shift-selection and axis-lock behaviour.
- In-product shortcut and snap legend.

### Required tests

- Keyboard-only completion of the 3 mm, 20 mm, 250 mm, and 150 mm scenarios.
- Focus never moves into destroyed or hidden DOM.
- Every disabled action exposes a reason.
- Screen-reader labels distinguish anchor, moving endpoint, source, draft, and preview.
- Contrast and reduced-motion assertions.
- No pointer-only path for a production editing action.

### Exit gate

All professional walkthroughs pass by pointer and keyboard, the production build passes, and exact-head evidence reports `PASS_RELEASE`.

---

## 7. Mandatory test strategy

## 7.1 Pure contract tests

Every new authority-bearing function requires tests for:

- valid normalization;
- invalid type and missing-field rejection;
- finite-number enforcement;
- exact canonical identity;
- deterministic semantic hash;
- deep immutability;
- collection-order stability where order is not semantic;
- stale-basis rejection;
- tamper rejection.

Suggested focused suites:

```text
tests/topology-edit-professional-transform-intent.test.mjs
tests/topology-edit-professional-snap-resolver.test.mjs
tests/topology-edit-professional-operation-plan.test.mjs
tests/topology-edit-professional-spec-catalog.test.mjs
tests/topology-edit-professional-incremental-validation.test.mjs
```

## 7.2 Controller containment tests

Every new controller or subclass must prove that it does not gain authority outside its scope.

Required negative assertions:

- no direct `WorkspaceState.loadDataset`;
- no direct persistence writes;
- no direct commit or rollback calls;
- no direct command reducer invocation outside the certified session;
- no direct canonical array mutation;
- no mesh-name or nearest-object identity;
- no swallowed errors;
- no hidden default export or global singleton authority.

## 7.3 Real fixture kernel tests

The 20-object fixture remains the minimum user-flow fixture.

Required scenarios:

1. Original 10 mm gap.
2. Deliberate 3 mm gap.
3. Deliberate 20 mm gap.
4. 250 mm manual bridge.
5. 150 mm source-backed trim.
6. Support and restraint selection.
7. Fitting and junction inspection.
8. Save, reload, export, commit, and reopen.

Additional professional fixtures should cover:

- offset routing;
- sloped line;
- class mismatch;
- invalid flange connection;
- insufficient straight length;
- support spacing;
- large-model rendering and worker cancellation.

## 7.4 Browser tests

Browser tests must drive visible production controls, not call private controller methods to simulate success.

Required assertions:

- stable `data-*` selectors;
- real Workspace navigation;
- normal dataset-load event path;
- exact viewport tab activation;
- visible selection and gizmo state;
- preview non-mutation;
- accepted command count and hashes;
- issue creation and resolution;
- comparison and route updates;
- persistence and commit evidence;
- console and page error filtering;
- screenshots or structured evidence at each critical state.

Suggested browser suites:

```text
e2e/topology-edit-professional-gizmo-flow.spec.js
e2e/topology-edit-professional-snap-numeric-flow.spec.js
e2e/topology-edit-professional-route-operations.spec.js
e2e/topology-edit-professional-lifecycle.spec.js
```

## 7.5 Visual regression tests

Capture deterministic views for:

- selection outline;
- anchor and moving endpoint markers;
- axis and plane handles;
- snap marker and inference label;
- source, draft, and ghost distinction;
- blocking and warning issue overlays;
- numeric entry and status bar;
- sectioned and isolated views.

Visual baselines must be tied to a stable renderer backend, viewport size, device scale, fixture hash, and camera contract.

## 7.6 Accessibility tests

At minimum:

- keyboard tab order;
- visible focus;
- `Escape` cancellation;
- `Enter` acceptance;
- arrow-key and nudge behaviour;
- live-region status;
- disabled-reason text;
- accessible handle and issue names;
- reduced-motion support.

## 7.7 Persistence and replay tests

Every new accepted operation must pass:

```text
Execute
→ save
→ reload
→ undo
→ redo
→ export twice
→ compare bytes
→ commit
→ read back
→ reopen
```

Required equality checks:

- active canonical hash;
- journal hash;
- active and redo ledger hashes;
- candidate and certification hashes;
- prepared output hash;
- sealed audit hash;
- committed dataset hash;
- route, comparison, and issue dispositions.

## 7.8 Anti-drift and qualification commands

Every PR must run the applicable focused tests plus:

```bash
npm run syntax:strict
npm run check:imports
node scripts/topology-edit-source-drift-check.mjs
node scripts/topology-edit-api-drift-check.mjs
node scripts/topology-edit-prohibited-imports.mjs
npm run build
```

Browser qualification:

```bash
node scripts/run-playwright.mjs e2e/<professional-flow>.spec.js
```

Patch hygiene:

```bash
git diff --check <base>...HEAD
git status --porcelain=v1 --untracked-files=no
```

A hosted workflow with no allocated steps must be recorded as infrastructure failure and must not emit or imply `PASS_RELEASE`.

---

## 8. Coding requirements

All professional-upgrade code must follow these rules:

1. Use named exports.
2. Keep pure computation separate from DOM, renderer, storage, and workspace adapters.
3. Validate inputs at module boundaries.
4. Use explicit `Mm`, `Deg`, `Id`, `Hash`, `Point`, or `Direction` naming where useful.
5. Use immutable normalized objects for contracts and evidence.
6. Use deterministic IDs derived from semantic material.
7. Never use wall-clock or random values in authority-bearing outputs.
8. Never mutate arrays or objects received from callers.
9. Never infer identity from scene presentation.
10. Never silently coerce missing engineering evidence.
11. Return explicit statuses such as `RESOLVED`, `AMBIGUOUS`, `UNAVAILABLE`, `STALE_BASIS`, or `REJECTED`.
12. Preserve existing public command and persistence schemas unless a separately approved migration is delivered.
13. Prefer small focused modules below 300 lines.
14. Add negative containment tests for authority boundaries.
15. Include rollback instructions in every PR.

---

## 9. Recommended PR sequence

| PR | Package | Merge dependency |
| --- | --- | --- |
| P0A | Interaction, snap, operation-plan, and changed-scope contracts | Current `main` |
| P1A | Pure gizmo model and transform-intent tests | P0A |
| P1B | Renderer handles, pointer lifecycle, and keyboard cancellation | P1A |
| P1C | Production controller composition and real 3/20 mm walkthrough | P1B |
| P2A | Numeric entry and nudge model | P0A |
| P2B | Snap candidate collection and deterministic resolver | P2A |
| P2C | Snap UI, stale rejection, and browser qualification | P1C + P2B |
| P3A | Route-operation planners using existing commands | P0A |
| P3B | Atomic multi-command plan certification | P3A |
| P3C | Route-operation UI and browser qualification | P2C + P3B |
| P4A | Catalogue schema and fixtures | P0A |
| P4B | Compatibility and exact lookup | P4A |
| P5A | Changed-scope and local incremental validation | P3A |
| P5B | Worker execution, cancellation, and stale rejection | P5A |
| P6A | Timeline and checkpoints | P3B |
| P6B | Dossier/review integration | P6A |
| P7A | Spatial acceleration and incremental indexes | P2B + P5B |
| P7B | Large-model renderer and memory qualification | P7A |
| P8A | Accessibility and professional browser matrix | All product PRs |
| P8B | Exact-head final release evidence | P8A |

Do not combine catalogue authority, new command vocabulary, renderer interaction, and final release evidence in one PR.

---

## 10. Risk register

| Risk | Mitigation |
| --- | --- |
| Gizmo directly mutates Three.js objects and bypasses commands | Treat all drag geometry as disposable preview state; compile only final intent into governed requests. |
| Snapping retargets to a nearby but incorrect object | Require exact canonical target identity and explicit ambiguity results; distance may rank evidence but cannot establish identity. |
| Multi-command route operations partially apply | Certify and accept an atomic plan; reject the entire plan when any command fails. |
| Catalogue silently invents dimensions | Use exact versioned records and explicit unresolved states; prohibit best-fit substitution. |
| Incremental validator differs from full validator | Require equivalence tests for every affected scope and periodic full-validation sampling. |
| Performance work changes engineering semantics | Keep indexes and workers as derived accelerators; compare their result hashes with the pure reference implementation. |
| Review features gain command authority | Maintain separate review models and explicit adapter boundaries; add containment tests. |
| Concurrent agents overwrite controller composition | Allocate file ownership and use one integration controller change after pure packages merge. |
| CI runner outage obscures failures | Provide reproducible local commands, clean-container execution, and fail-closed hosted evidence policy. |

---

## 11. Definition of done

The professional upgrade is complete only when:

- direct viewport manipulation can perform the 3 mm and 20 mm cases;
- exact numeric entry and deterministic snapping produce identical governed results;
- 250 mm bridge and 150 mm trim remain correctly governed;
- common route operations are deterministic and replayable;
- specification evidence is exact or explicitly unresolved;
- incremental and full validation agree;
- all accepted operations survive save, reload, undo, redo, export, commit, and reopen;
- keyboard and pointer workflows both pass;
- performance and memory budgets pass on representative fixtures;
- all new modules pass source, API, syntax, import, prohibited-authority, build, and patch-hygiene gates;
- exact-head browser and release evidence executes successfully;
- no release pass is claimed from an unallocated or zero-step workflow.
