# Start Route production authoring

## Scope

This work package adds a production-facing **Start Route** action to the existing certified 3D topology-edit authoring runtime. It does not introduce a second renderer, workspace mutation path, canonical topology authority, journal, catalogue, or validation engine.

## Authority chain

```text
HUD typed XYZ or exact deterministic viewport snap
→ TopologyEditStartRouteIntent.v1
→ TopologyEditStartRoutePlan.v2
→ CREATE_NODE(start)
→ CREATE_NODE(end)
→ INSERT_PIPE_SEGMENT(startRef, endRef)
→ sandbox certified journal
→ display-only ghost
→ module-worker final-state validation
→ exact candidate recreation
→ atomic journal reload
```

The operation is represented as `START_ROUTE` in the professional worker-plan contract. The validation scope contains the exact two generated nodes and one generated pipe edge.

## HUD contract

The production authoring panel exposes:

- input mode: `TYPED` or `VIEWPORT`;
- exact start and end XYZ in millimetres;
- `FREE`, `X`, `Y`, or `Z` axis lock;
- one exact governed PIPE catalogue record;
- explicit minimum segment length;
- explicit overlap tolerance;
- Preview, Validate, Apply, Cancel, Undo route, and Redo route actions.

No pipe record or engineering policy value is silently selected. The catalogue selector begins empty and the length/overlap fields begin empty.

Viewport acquisition accepts only one current deterministic snap result with:

```text
status = RESOLVED
compatibility = EXACT
candidateCount = 1
```

Ambiguous, adaptable, stale, unavailable, or geometry-only acquisition is rejected.

## Preview and validation

Preview builds a sandbox `TopologyEditCertifiedSession`; it does not mutate the production session. The existing production renderer receives only the generated candidate IDs and renders them in the existing non-pickable ghost group.

Final-state validation runs in the existing module worker. The Start Route validation adapter creates a `TopologyEditOperationPlan.v1` with operation type `START_ROUTE`, generated changed scope, exact materialized command payloads, and current catalogue evidence. Only newly introduced high-severity findings block Apply; inherited baseline findings remain visible but are not reclassified.

## Apply, cancel, undo, and redo

Apply recreates the complete candidate and verifies its plan, candidate, preview, validation, catalogue, prior canonical, journal, and resulting hashes before loading the serialized certified journal. The transaction contains exactly three commands.

Cancel preserves the prior canonical and journal hashes and clears ghost/session-only evidence.

Undo and redo operate on the exact three-command suffix. Receipt-schema dispatch preserves this atomic behavior even after the user activates another authoring tool.

## Determinism and identity

Engineering authority excludes pointer IDs, camera tokens, hover tokens, renderer objects, DOM values, timestamps, locale ordering, random values, and array positions. Generated canonical component, port, node, and edge identities remain command/role derived through the governed pipe primitive.

## Qualification

The exact-head workflow enforces:

- exact candidate checkout;
- syntax checks for every touched module and test;
- `<300` physical lines for every touched JavaScript module and test;
- typed/viewport intent and candidate equivalence;
- exact worker scope and `START_ROUTE` operation identity;
- fail-closed snap and missing-governed-input controls;
- preview/cancel non-mutation;
- module-worker validation;
- production HUD Apply;
- exactly two added nodes, one added pipe edge, and three journal commands;
- exact undo/redo canonical and journal hashes;
- ghost cleanup;
- one production renderer and a live WebGL context;
- no page or critical console errors.

The stacked PR remains draft until its lower pipe primitive is merged, it is retargeted to current `main`, and the unchanged candidate is requalified at the new exact head.
