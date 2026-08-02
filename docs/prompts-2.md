# Two-Agent Prompts for the Professional 3D Edit Upgrade

## Purpose

This document contains two complete execution prompts for two independent implementation agents.

- **Agent 1 / Track A:** professional viewport interaction, transform gizmo, numeric entry, snapping, keyboard operation, and user-facing browser flows.
- **Agent 2 / Track B:** engineering operation planners, specification authority, changed-scope calculation, and incremental topology validation.

The tracks are intentionally separated so both agents can work in parallel with minimal file overlap. Each agent must remain inside the assigned authority boundary.

The target repository is:

```text
reallaksh19/Advanced_Analysis
```

The authoritative planning document is:

```text
docs/upgrade3Dedit.md
```

---

# Shared operating rules

Both agents must follow these rules before reading their individual prompt.

## Baseline

Start from the latest `main` containing:

- certified topology-edit commands and journal;
- deterministic candidate regeneration and certification;
- checker, ghost preview, safe autofix, undo, redo, and replay;
- canonical search, picking, inspection, measurement, comparison, route trace, dossier, intake, and review response;
- draft save/reload, deterministic audit export, verified workspace commit, rollback, reopen, and exact-head qualification gates;
- the 20-object staged JSON fixture and its 3 mm, 20 mm, 250 mm, and 150 mm repair walkthroughs.

Do not assume a remembered SHA is current. Resolve current `main` before branching.

## Branches

```text
Agent 1: agent/professional-3d-interaction
Agent 2: agent/professional-3d-engineering
```

If either branch name already exists, create a versioned suffix rather than force-updating unknown work.

## Shared authority boundary

Neither agent may:

- mutate canonical topology from the renderer or DOM;
- bypass the certified session, command request, reducer, or journal;
- infer editing identity from mesh names, nearest objects, screen distance, or visual overlap;
- add silent diameter, class, rating, fitting, restraint, or connection inference;
- write directly to `WorkspaceState` from a pure or review module;
- change persistence, export, commit, rollback, calculation, dossier, intake, response, or release authority unless explicitly assigned;
- use `Date.now()`, `new Date()`, `Math.random()`, random UUIDs, or unordered environment state in authority-bearing output;
- claim a hosted pass from a zero-step or no-log workflow.

## Coding rules

1. Named exports only.
2. No default exports in new production modules.
3. No hidden global singleton authority.
4. Keep pure logic separate from DOM, renderer, storage, worker, and workspace adapters.
5. Validate all public inputs.
6. Use explicit units such as `Mm` and `Deg` in names where ambiguity is possible.
7. Return deeply immutable normalized values.
8. Use deterministic semantic material for IDs and hashes.
9. Do not mutate caller-owned arrays or objects.
10. Use explicit statuses such as `RESOLVED`, `AMBIGUOUS`, `UNAVAILABLE`, `STALE_BASIS`, and `REJECTED`.
11. Keep new production modules at or below 300 physical lines unless an exception is documented in the PR.
12. Add negative containment tests proving the module did not gain unrelated authority.
13. Include rollback instructions in the PR description.

## Shared validation commands

Every agent must run the focused tests for the assigned track plus:

```bash
npm run syntax:strict
npm run check:imports
node scripts/topology-edit-source-drift-check.mjs
node scripts/topology-edit-api-drift-check.mjs
node scripts/topology-edit-prohibited-imports.mjs
npm run build
```

Browser flows use:

```bash
node scripts/run-playwright.mjs e2e/<spec-file>.spec.js
```

Patch hygiene:

```bash
git diff --check <base>...HEAD
git status --porcelain=v1 --untracked-files=no
```

## Parallel file ownership

### Agent 1 owns

```text
src/workspace/viewport-interaction/**
src/workspace/topology-edit-3d-interaction-controller.js
src/workspace/viewport-productivity/topology-edit-interaction-*.js
tests/topology-edit-professional-interaction-*.test.mjs
e2e/topology-edit-professional-interaction-*.spec.js
.github/workflows/topology-edit-professional-interaction.yml
```

### Agent 2 owns

```text
src/workspace/topology-edit/professional/**
tests/topology-edit-professional-engineering-*.test.mjs
tests/fixtures/topology-edit/professional/**
.github/workflows/topology-edit-professional-engineering.yml
```

### Files neither agent may edit during parallel development

```text
src/workspace/load-calc-consumer-controller.js
src/workspace/topology-edit-3d-view-controller.js
src/workspace/topology-edit-3d-view-controller-core.js
src/workspace/topology-edit/topology-edit-command-contract.js
src/workspace/topology-edit/topology-edit-certified-session.js
src/workspace/topology-edit/topology-edit-persistence.js
src/workspace/topology-edit/topology-edit-export.js
src/workspace/topology-edit/topology-edit-commit-service.js
.github/workflows/topology-edit-wave5.yml
scripts/topology-edit-original-plan-audit.mjs
scripts/topology-edit-write-wave5-evidence.mjs
```

Those shared composition and release files belong to a later integration PR after both tracks are merged or ready.

---

# Prompt 1 — Agent 1: Professional viewport interaction

Copy the entire prompt below into Agent 1.

---

## Role

You are implementing **Track A: Professional Viewport Interaction** for the production 3D Edit workspace in `reallaksh19/Advanced_Analysis`.

Your responsibility is to make direct editing feel like a professional CAD application while preserving the existing certified command and journal authority.

You own interaction intent, gizmo state, numeric entry, deterministic snap presentation, keyboard control, and real-browser interaction qualification.

You do **not** own engineering operation planning, catalogue authority, checker rules, persistence, commit, or final release composition.

## Mission

Deliver a bounded package that lets a user:

1. select an exact canonical node in the 3D viewport;
2. see a professional axis/plane transform gizmo;
3. drag along X, Y, Z, XY, YZ, or XZ;
4. enter exact absolute coordinates or deltas;
5. see deterministic endpoint, axis, midpoint, centerline, and grid snap candidates;
6. cancel with `Escape` without any journal or canonical mutation;
7. certify with `Enter` or **Apply**;
8. compile the final result into the existing `MOVE_NODE` command path;
9. complete the 3 mm and 20 mm validator scenarios without canonical search or toolbar move buttons.

## Required deliverables

### Pure interaction contracts

Create small named-export modules for:

- transform intent;
- drag constraint;
- numeric entry;
- snap candidate;
- snap resolution;
- interaction preview evidence;
- gizmo display model.

Suggested paths:

```text
src/workspace/viewport-interaction/topology-edit-transform-intent.js
src/workspace/viewport-interaction/topology-edit-gizmo-model.js
src/workspace/viewport-interaction/topology-edit-snap-candidates.js
src/workspace/viewport-interaction/topology-edit-snap-resolver.js
src/workspace/viewport-interaction/topology-edit-numeric-entry.js
```

### Display and controller layer

Create:

```text
src/workspace/topology-edit-3d-interaction-controller.js
src/workspace/viewport-productivity/topology-edit-interaction-panel.js
```

The controller must extend the current production composition through a narrow subclass or adapter. Do not rewrite a large existing controller.

During parallel work, do not edit the final load-calc composition file. Provide an exported class and a focused composition test so a later integration PR can route production through it.

### Test and workflow package

Create:

```text
tests/topology-edit-professional-interaction-contracts.test.mjs
tests/topology-edit-professional-interaction-controller.test.mjs
tests/topology-edit-professional-snap-resolver.test.mjs
e2e/topology-edit-professional-interaction-flow.spec.js
.github/workflows/topology-edit-professional-interaction.yml
```

## Required architecture

The renderer may create disposable visual state, but acceptance must follow:

```text
pointer / keyboard / numeric input
→ immutable transform intent
→ deterministic snap resolution
→ preview target point
→ existing certified candidate path
→ existing MOVE_NODE request
→ existing journal
```

No preview state may enter the journal.

## Reference code pattern — transform intent

Use this as a style and authority reference, not as a blind copy:

```js
import { deepFreeze, semanticHash } from '../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_TRANSFORM_INTENT_SCHEMA =
  'TopologyEditTransformIntent.v1';

export function createTopologyEditTransformIntent(input = {}) {
  const nodeId = requiredCanonicalNodeId(input.nodeId);
  const basisHash = requiredText(input.basisHash, 'basisHash');
  const mode = normalizeMode(input.mode);
  const targetPosition = finitePoint(input.targetPosition, 'targetPosition');

  const material = {
    schema: TOPOLOGY_EDIT_TRANSFORM_INTENT_SCHEMA,
    nodeId,
    basisHash,
    mode,
    targetPosition,
  };

  return deepFreeze({
    ...material,
    intentHash: semanticHash(material),
  });
}
```

Required characteristics:

- exact canonical node ID;
- finite point;
- explicit mode;
- exact topology or session basis hash;
- deterministic hash;
- immutable result;
- no DOM, renderer, storage, or workspace access.

## Reference code pattern — deterministic snap resolution

```js
export function resolveTopologyEditSnap({
  pointerPoint,
  candidates,
  toleranceMm,
  basisHash,
} = {}) {
  const normalized = normalizeCandidates(candidates)
    .filter((candidate) => candidate.basisHash === basisHash)
    .map((candidate) => ({
      ...candidate,
      distanceMm: distance(pointerPoint, candidate.position),
    }))
    .filter((candidate) => candidate.distanceMm <= toleranceMm)
    .sort(compareSnapCandidates);

  if (!normalized.length) return noSnapResult(basisHash);
  if (isAmbiguous(normalized)) return ambiguousSnapResult(normalized, basisHash);
  return resolvedSnapResult(normalized[0], basisHash);
}
```

The comparator must be deterministic. Recommended priority:

1. explicitly selected target;
2. exact endpoint under pointer;
3. source-declared datum;
4. axis/plane projection;
5. midpoint or centerline;
6. grid.

Distance may rank candidates of equal evidence class, but distance must never create identity.

## Required gizmo behaviour

- X, Y, and Z axis handles.
- XY, YZ, and XZ plane handles.
- Camera-aware constant screen size.
- Exact canonical target marker.
- Visually distinct anchor and moving node.
- Pointer capture on drag start.
- Pointer capture release on accept, cancel, tab close, dataset change, or controller destruction.
- Live target X/Y/Z and delta X/Y/Z.
- Active snap type and target canonical ID.
- `Escape` cancels.
- `Enter` applies only when a valid preview is current.
- Arrow keys nudge using an explicit increment.
- Shift or another documented modifier changes increment only; it must not change engineering units.

## Required numeric entry behaviour

- Absolute X/Y/Z.
- Delta X/Y/Z.
- Exact gap or movement magnitude.
- Locale-independent decimal parsing.
- Explicit millimetre labelling.
- Reject empty, non-finite, ambiguous, or mixed-unit values.
- No implicit unit conversion.
- Typed and dragged operations targeting the same point must produce the same command payload and canonical hash.

## Required interaction tests

### Pure tests

- Contract normalization and immutability.
- Stable hashes.
- Axis and plane constraint maths.
- Snap ranking under collection reorder.
- Ambiguous tie rejection.
- Stale basis rejection.
- Boundary distances: `0`, `0.001`, `3`, `20`, `25`, `25.001`, `250` mm.
- Numeric parsing and formatting.
- Drag and typed-target equivalence.

### Controller containment tests

Prove the new controller does not directly call or import:

- `WorkspaceState.loadDataset`;
- persistence save/reload;
- export or commit services;
- command reducer internals;
- checker mutation;
- dossier, intake, or response authority.

Prove it delegates accepted movement through the existing certified controller/session path.

### Browser tests

Use visible production-like controls and the actual staged fixture.

Scenario A:

```text
Load 20-object demo
→ select P-001 TO in viewport
→ open gizmo
→ move to exact 3 mm gap
→ validator emits SNAP_GAP
→ preview MERGE_NODES
→ cancel
→ verify no journal mutation
→ preview again
→ accept
→ undo merge
→ undo move
→ redo move
→ redo merge
```

Scenario B repeats for 20 mm.

Assertions:

- correct canonical selection;
- visible axis/plane handle;
- preview is non-pickable;
- journal does not change during drag or cancel;
- exactly one `MOVE_NODE` on apply;
- `SNAP_GAP` appears at the exact distance;
- candidate and certification hashes are stable;
- undo and redo reproduce exact canonical hashes;
- 250 mm gap remains manual;
- no critical console or page errors.

## Test example

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTopologyEditTransformIntent,
} from '../src/workspace/viewport-interaction/topology-edit-transform-intent.js';

test('transform intent is deterministic and immutable', () => {
  const input = {
    nodeId: 'node:example',
    basisHash: 'sha256:basis',
    mode: 'AXIS_X',
    targetPosition: { x: 3, y: 0, z: 0 },
  };

  const left = createTopologyEditTransformIntent(input);
  const right = createTopologyEditTransformIntent({ ...input });

  assert.equal(left.intentHash, right.intentHash);
  assert.deepEqual(left, right);
  assert.equal(Object.isFrozen(left), true);
  assert.throws(() => createTopologyEditTransformIntent({
    ...input,
    targetPosition: { x: Number.NaN, y: 0, z: 0 },
  }), /finite/i);
});
```

## Anti-drift checks

Add a focused source-containment test or script that fails if new interaction modules contain prohibited patterns.

Reference shell check:

```bash
files=$(find src/workspace/viewport-interaction \
  src/workspace/topology-edit-3d-interaction-controller.js \
  -type f -name '*.js' -print)

! grep -nE 'Date\.now|new Date|Math\.random|crypto\.randomUUID' $files
! grep -nE 'mesh\.name|nearestObject|closestObject' $files
! grep -nE 'WorkspaceState\.loadDataset|commitPreparedTopologyEditExport' $files
! grep -nE 'export default' $files
```

The actual test should use Node and explicit paths so it is portable across shells.

## Pass commands

At minimum:

```bash
node --check src/workspace/viewport-interaction/topology-edit-transform-intent.js
node --check src/workspace/viewport-interaction/topology-edit-gizmo-model.js
node --check src/workspace/viewport-interaction/topology-edit-snap-candidates.js
node --check src/workspace/viewport-interaction/topology-edit-snap-resolver.js
node --check src/workspace/viewport-interaction/topology-edit-numeric-entry.js
node --check src/workspace/topology-edit-3d-interaction-controller.js

node --test \
  tests/topology-edit-professional-interaction-contracts.test.mjs \
  tests/topology-edit-professional-interaction-controller.test.mjs \
  tests/topology-edit-professional-snap-resolver.test.mjs \
  tests/topology-edit-wave1-pure-kernel.test.mjs \
  tests/topology-edit-wave1-candidate-certification.test.mjs \
  tests/topology-edit-wave1-journal-replay.test.mjs \
  tests/topology-edit-wave3a-checker.test.mjs \
  tests/topology-edit-wave3b-autofix.test.mjs \
  tests/topology-edit-wave3-exact-gap-modes.test.mjs

node scripts/run-playwright.mjs \
  e2e/topology-edit-professional-interaction-flow.spec.js

npm run syntax:strict
npm run check:imports
node scripts/topology-edit-source-drift-check.mjs
node scripts/topology-edit-api-drift-check.mjs
node scripts/topology-edit-prohibited-imports.mjs
npm run build
```

## PR requirements

Open a draft PR containing:

- exact scope and file list;
- architecture diagram or sequence;
- screenshots or evidence from 3 mm and 20 mm flows;
- focused test results;
- explicit authority-boundary statement;
- module line counts;
- rollback instructions;
- hosted workflow disposition.

Do not merge the final production composition in this track. Deliver a clean exported controller and integration instructions.

## Definition of done

Track A is done when:

- exact viewport selection works;
- gizmo and numeric entry produce deterministic intents;
- snap ambiguity and stale bases fail closed;
- 3 mm and 20 mm flows work through visible interaction;
- acceptance uses existing `MOVE_NODE` authority;
- preview/cancel/undo/redo evidence is exact;
- all focused, drift, build, browser, and hygiene gates pass or a zero-step infrastructure failure is explicitly recorded without claiming a pass.

---

# Prompt 2 — Agent 2: Engineering operations and incremental validation

Copy the entire prompt below into Agent 2.

---

## Role

You are implementing **Track B: Engineering Operations and Incremental Validation** for the production 3D Edit workspace in `reallaksh19/Advanced_Analysis`.

Your responsibility is to provide pure, deterministic, source-aware engineering planners and validation services that a later UI integration can call.

You do **not** own viewport gizmos, pointer interaction, numeric UI, production controller composition, persistence, workspace commit, or final release workflows.

## Mission

Deliver a bounded pure package that can:

1. plan common piping operations using exact canonical identity;
2. compile those operations into existing governed commands wherever semantically valid;
3. declare the complete changed topology scope;
4. resolve specification and compatibility evidence explicitly;
5. run incremental validation over the affected neighbourhood;
6. prove incremental results match full validation for the same topology;
7. reject stale, ambiguous, incompatible, or under-evidenced operations before command execution.

## Initial operations

Implement pure planners for:

- extend edge by exact distance;
- shorten edge by exact distance;
- split edge by exact distance from `FROM` or `TO`;
- reconnect two exact open endpoints;
- move an explicitly bounded connected run;
- create an orthogonal two-leg offset;
- apply a declared slope to an exact run.

Do not introduce a new command type unless an operation cannot be represented without semantic loss by the existing governed command vocabulary.

When existing commands are sufficient, return an ordered atomic plan referencing commands such as:

- `MOVE_NODE`;
- `BRIDGE_GAP`;
- `ADD_STRAIGHT_ELEMENT`;
- `SPLIT_EDGE`;
- `DISCONNECT_ENDPOINT`;
- `TRIM_EDGE`.

A later integration layer will regenerate and certify each command or the complete atomic plan.

## Required deliverables

Suggested paths:

```text
src/workspace/topology-edit/professional/topology-edit-operation-plan.js
src/workspace/topology-edit/professional/topology-edit-route-operations.js
src/workspace/topology-edit/professional/topology-edit-change-scope.js
src/workspace/topology-edit/professional/topology-edit-spec-catalog.js
src/workspace/topology-edit/professional/topology-edit-compatibility.js
src/workspace/topology-edit/professional/topology-edit-incremental-validation.js
src/workspace/topology-edit/professional/topology-edit-validation-worker-contract.js
```

Tests:

```text
tests/topology-edit-professional-engineering-plan.test.mjs
tests/topology-edit-professional-engineering-scope.test.mjs
tests/topology-edit-professional-engineering-catalog.test.mjs
tests/topology-edit-professional-engineering-validation.test.mjs
tests/topology-edit-professional-engineering-containment.test.mjs
```

Fixtures:

```text
tests/fixtures/topology-edit/professional/offset-route.json
tests/fixtures/topology-edit/professional/sloped-route.json
tests/fixtures/topology-edit/professional/spec-compatibility.json
tests/fixtures/topology-edit/professional/incremental-equivalence.json
```

Workflow:

```text
.github/workflows/topology-edit-professional-engineering.yml
```

## Required operation-plan contract

An operation plan must contain:

- schema;
- operation type;
- exact topology basis hash;
- exact input canonical IDs;
- normalized engineering parameters;
- ordered governed command intents;
- complete changed-scope record;
- unresolved engineering evidence;
- deterministic plan hash.

## Reference code pattern — operation plan

```js
import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_OPERATION_PLAN_SCHEMA =
  'TopologyEditOperationPlan.v1';

export function createTopologyEditOperationPlan(input = {}) {
  const material = {
    schema: TOPOLOGY_EDIT_OPERATION_PLAN_SCHEMA,
    operationType: requiredOperationType(input.operationType),
    basisHash: requiredText(input.basisHash, 'basisHash'),
    targetIds: normalizeCanonicalIds(input.targetIds),
    parameters: normalizeParameters(input.parameters),
    commandIntents: normalizeCommandIntents(input.commandIntents),
    changedScope: normalizeChangedScope(input.changedScope),
    unresolvedEvidence: normalizeUnresolved(input.unresolvedEvidence),
  };

  return deepFreeze({
    ...material,
    planHash: semanticHash(material),
  });
}
```

The plan must not execute commands, mutate topology, call the DOM, use workspace state, or write storage.

## Reference code pattern — extend edge planner

```js
export function planExtendEdge({
  topology,
  edgeId,
  endpoint,
  distanceMm,
  basisHash,
} = {}) {
  const edge = resolveExactEdge(topology, edgeId);
  const targetNode = resolveEndpointNode(topology, edge, endpoint);
  const direction = resolveEdgeUnitDirection(topology, edge, endpoint);
  const targetPosition = addScaled(
    targetNode.position,
    direction,
    requiredPositiveMm(distanceMm),
  );

  return createTopologyEditOperationPlan({
    operationType: 'EXTEND_EDGE',
    basisHash,
    targetIds: [edge.id, targetNode.id],
    parameters: { endpoint, distanceMm },
    commandIntents: [{
      commandType: 'MOVE_NODE',
      payload: { nodeId: targetNode.id, position: targetPosition },
    }],
    changedScope: deriveChangedScope(topology, {
      nodeIds: [targetNode.id],
      edgeIds: [edge.id],
    }),
    unresolvedEvidence: [],
  });
}
```

Reject:

- zero or negative distances;
- zero-length source edge;
- missing or duplicate edge identity;
- unsupported endpoint;
- non-finite coordinates;
- stale basis;
- an operation that moves an undeclared connected object.

## Specification catalogue requirements

Create a versioned content-addressed catalogue contract that can represent:

- nominal size;
- outside diameter;
- schedule and wall thickness;
- elbow radius and angle;
- reducer type and orientation;
- valve face-to-face dimension;
- flange class and facing;
- end connection;
- piping class.

Lookup results must be one of:

```text
RESOLVED
AMBIGUOUS
UNAVAILABLE
INCOMPATIBLE
```

Do not perform network lookup in authority-bearing planning.

Do not select nearest size, nearest rating, or best-fit record automatically.

## Reference code pattern — catalogue lookup

```js
export function resolveCatalogueRecord(catalogue, query) {
  const matches = catalogue.records
    .filter((record) => exactMatch(record, query))
    .sort((left, right) => left.recordId.localeCompare(right.recordId));

  if (matches.length === 0) {
    return immutableLookup('UNAVAILABLE', query, []);
  }
  if (matches.length > 1) {
    return immutableLookup('AMBIGUOUS', query, matches);
  }
  return immutableLookup('RESOLVED', query, matches);
}
```

## Changed-scope requirements

Every plan must identify all potentially affected:

- nodes;
- edges;
- junctions;
- supports;
- boundaries;
- source crosswalk records;
- validation neighbourhood IDs.

The changed scope must be deterministic and sorted.

It must include adjacent records required to validate:

- degree and connectivity;
- duplicate pairs;
- zero length;
- overlap and backtracking;
- bend and branch conditions;
- support attachment;
- compatibility.

## Incremental validation requirements

Create a pure reference implementation first. Worker execution is a thin adapter around the same pure contract.

Required result fields:

- schema;
- request ID derived deterministically from basis, plan, and scope;
- basis hash;
- plan hash;
- changed-scope hash;
- issue records;
- blocking issue IDs;
- warning issue IDs;
- validation result hash.

## Reference code pattern — incremental validation

```js
export function validateChangedScope({
  topology,
  plan,
  policy,
} = {}) {
  assertCurrentBasis(topology, plan.basisHash);
  const scope = assertChangedScope(plan.changedScope);
  const issues = runRulesForScope({ topology, scope, policy })
    .sort(compareIssues);

  return createIncrementalValidationResult({
    basisHash: plan.basisHash,
    planHash: plan.planHash,
    changedScopeHash: scope.changedScopeHash,
    issues,
  });
}
```

Worker responses must be rejected when:

- request ID differs;
- basis hash differs;
- plan hash differs;
- changed-scope hash differs;
- a newer request superseded the response.

## Required engineering tests

### Operation planning

- Exact extend and shorten geometry.
- Split by distance from both endpoints.
- Reconnect exact open endpoints.
- Move connected run with explicit stop boundaries.
- Orthogonal offset with exact leg lengths.
- Slope application with declared direction and rise/run.
- Stable plans under collection reorder.
- Stale basis rejection.
- Atomic-plan rejection when one command is invalid.
- No undeclared affected object.

### Catalogue and compatibility

- Exact record resolution.
- Ambiguity rejection.
- Missing record remains unavailable.
- Invalid diameter/class/rating/connection combinations.
- Catalogue version and content-hash drift rejection.
- No nearest-size or automatic substitution.

### Incremental validator

- Incremental issues equal full-validator issues for the affected scope.
- Unaffected issue IDs remain unchanged.
- Resolved issues disappear deterministically.
- New blocking issues are explicit.
- Worker cancellation and stale-response rejection.
- Identical requests produce identical result hashes.

### Real fixture retention

The new planners and validation package must not regress:

- 3 mm `SNAP_GAP`;
- 20 mm `SNAP_GAP`;
- 250 mm manual `BRIDGE_GAP`;
- 150 mm exact source-backed `TRIM_EDGE`;
- save, reload, export, commit, and reopen hashes.

## Test example

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planExtendEdge,
} from '../src/workspace/topology-edit/professional/topology-edit-route-operations.js';

test('extend-edge plan is deterministic and uses MOVE_NODE', () => {
  const input = {
    topology: fixtureTopology(),
    edgeId: 'edge:P-001',
    endpoint: 'TO',
    distanceMm: 100,
    basisHash: fixtureTopology().canonicalTopologyHash,
  };

  const left = planExtendEdge(input);
  const right = planExtendEdge({ ...input });

  assert.equal(left.planHash, right.planHash);
  assert.equal(left.commandIntents.length, 1);
  assert.equal(left.commandIntents[0].commandType, 'MOVE_NODE');
  assert.equal(Object.isFrozen(left), true);
  assert.throws(() => planExtendEdge({
    ...input,
    distanceMm: 0,
  }), /positive/i);
});
```

## Containment and anti-drift checks

New engineering modules must not contain:

- DOM or renderer access;
- `WorkspaceState` writes;
- persistence or commit calls;
- wall-clock or random ID authority;
- mesh-name, nearest-object, or proximity identity;
- hidden fallback dimensions;
- default exports.

Reference shell check:

```bash
files=$(find src/workspace/topology-edit/professional \
  -type f -name '*.js' -print)

! grep -nE 'document\.|window\.|THREE\.|WebGL' $files
! grep -nE 'WorkspaceState\.|localStorage|commitPreparedTopologyEditExport' $files
! grep -nE 'Date\.now|new Date|Math\.random|crypto\.randomUUID' $files
! grep -nE 'nearest|closest|mesh\.name' $files
! grep -nE 'export default' $files
```

Implement a portable Node containment test rather than depending only on shell `grep`.

## New-command prohibition

Do not modify `topology-edit-command-contract.js` in this track.

When an operation cannot be represented by existing commands:

1. return `UNREPRESENTABLE_WITH_CURRENT_COMMANDS`;
2. include exact semantic reason;
3. include the minimum proposed payload shape in documentation only;
4. do not implement or execute the new command;
5. open a separate authority-design issue or follow-up plan.

## Pass commands

At minimum:

```bash
node --check src/workspace/topology-edit/professional/topology-edit-operation-plan.js
node --check src/workspace/topology-edit/professional/topology-edit-route-operations.js
node --check src/workspace/topology-edit/professional/topology-edit-change-scope.js
node --check src/workspace/topology-edit/professional/topology-edit-spec-catalog.js
node --check src/workspace/topology-edit/professional/topology-edit-compatibility.js
node --check src/workspace/topology-edit/professional/topology-edit-incremental-validation.js
node --check src/workspace/topology-edit/professional/topology-edit-validation-worker-contract.js

node --test \
  tests/topology-edit-professional-engineering-plan.test.mjs \
  tests/topology-edit-professional-engineering-scope.test.mjs \
  tests/topology-edit-professional-engineering-catalog.test.mjs \
  tests/topology-edit-professional-engineering-validation.test.mjs \
  tests/topology-edit-professional-engineering-containment.test.mjs \
  tests/topology-edit-wave1-pure-kernel.test.mjs \
  tests/topology-edit-wave1-candidate-certification.test.mjs \
  tests/topology-edit-wave1-journal-replay.test.mjs \
  tests/topology-edit-wave3a-checker.test.mjs \
  tests/topology-edit-wave3-commands.test.mjs \
  tests/topology-edit-wave3b-autofix.test.mjs \
  tests/topology-edit-20-element-demo-repairs.test.mjs \
  tests/topology-edit-wave4a-persistence-export.test.mjs \
  tests/topology-edit-wave4b-commit-rollback.test.mjs

npm run syntax:strict
npm run check:imports
node scripts/topology-edit-source-drift-check.mjs
node scripts/topology-edit-api-drift-check.mjs
node scripts/topology-edit-prohibited-imports.mjs
npm run build
```

## Workflow requirements

The dedicated engineering workflow must:

- check out the exact PR head;
- verify exact checkout;
- install locked dependencies;
- run syntax checks for every new module;
- run all focused engineering tests;
- retain Wave 1 command/journal tests;
- retain Wave 3 checker/autofix tests;
- retain 20-object fixture repair tests;
- retain Wave 4 persistence/export/commit tests;
- run the production build;
- run patch hygiene;
- upload deterministic engineering-plan and validation evidence if generated.

A job with `steps=null`, no logs, or no checkout is an infrastructure failure, not a product pass.

## PR requirements

Open a draft PR containing:

- exact planner list;
- command-vocabulary reuse matrix;
- any `UNREPRESENTABLE_WITH_CURRENT_COMMANDS` outcomes;
- catalogue schema and authority source;
- changed-scope definition;
- incremental/full validation equivalence evidence;
- focused test results;
- module line counts;
- containment statement;
- rollback instructions;
- hosted workflow disposition.

Do not edit production UI or final controller composition in this track.

## Definition of done

Track B is done when:

- each initial operation produces a deterministic immutable plan or an explicit unrepresentable result;
- existing commands are reused without changing their payload semantics;
- every plan declares complete changed scope;
- catalogue lookups are exact and fail closed;
- incremental and full validation agree for affected scope;
- stale worker results cannot overwrite current validation;
- all focused, drift, build, and hygiene gates pass or a zero-step infrastructure failure is explicitly recorded without claiming a pass.

---

# Integration after both agents finish

A separate integration owner should perform one small PR after both tracks are ready.

## Integration responsibilities

1. Rebase both track heads onto current `main`.
2. Merge pure Track B first when it has no UI dependency.
3. Merge Track A interaction package.
4. Add the narrow production controller composition.
5. Connect Track A operation requests to Track B planners through named exports.
6. Add the integrated browser matrix.
7. Add the new focused suites to the final Wave 5 and original-plan audit only after the product packages are merged.
8. Preserve C3D review, dossier, intake, response, persistence, export, commit, rollback, calculation, and release boundaries.

## Integration contract

The integration layer may call Track B only through functions shaped like:

```js
const plan = planProfessionalOperation({
  operationType,
  topology,
  selection,
  parameters,
  basisHash,
  catalogue,
});
```

It may pass Track A preview state only through immutable values:

```js
const preview = createProfessionalInteractionPreview({
  intent,
  snapResolution,
  operationPlan: plan,
  validation,
});
```

The integration layer must not modify either package's normalized output.

## Integrated acceptance matrix

The final integrated package must prove:

- viewport-only 3 mm and 20 mm creation and repair;
- numeric and drag equivalence;
- snap ambiguity rejection;
- extend, shorten, split-by-distance, reconnect, offset, and slope planning;
- changed-scope completeness;
- incremental/full validation equivalence;
- 250 mm manual bridge retention;
- 150 mm exact trim retention;
- save, reload, export, commit, and reopen;
- keyboard-only operation;
- large-model performance evidence;
- exact-head release evidence.

No integration merge should occur by overwriting a controller file from one track with the other track's version. Recompose on current `main` and review the final subclass/import chain explicitly.
