# Connect Existing Ends — compatibility and alternatives core

## Scope

Batch 3A introduces the deterministic planning authority for connecting two existing graph-open pipe endpoints. It does not yet publish a connection transaction or production HUD. The output is an immutable compatibility assessment plus ranked route alternatives for the next composition batch.

## Endpoint authority

Both selected endpoints must resolve to exactly one canonical node with the exact declared node revision and graph degree one. The planner derives from canonical state:

- endpoint XYZ;
- the single incident pipe edge;
- incident-edge revision;
- incident pipe length;
- outward pipe direction;
- connection type;
- nominal size, OD, schedule, wall thickness, material, piping class and pressure class.

The incident edge must be a governed `PIPE`. Renderer IDs, mesh names, proximity and pointer position are not connection authorities.

## Compatibility

The selected catalogue-bound connecting pipe is compared independently with the engineering evidence at both endpoints. Exact mismatches are reported as stable differences such as:

```text
START:nominalSizeMm
END:pipingClass
START:endConnection
```

No mismatch is repaired or inferred. A mismatch produces:

```text
compatibilityStatus = TRANSITION_REQUIRED
```

This is planning evidence for the later reducer/transition composition batch; it is not permission to connect incompatible pipe directly.

## Explicit route policy

The caller must state:

- whether direct alternatives are allowed;
- whether orthogonal alternatives are allowed;
- the maximum number of alternatives to retain.

At least one routing family must be authorized. There is no hidden routing-family default.

## Alternatives

The planner can generate:

- one direct segment;
- deterministic orthogonal axis-order permutations for every nonzero coordinate axis.

For each alternative it records:

- exact points and straight segments;
- total centerline length;
- internal turns;
- start- and end-interface turns relative to the incident host-pipe directions;
- fitting count;
- segments below the explicit minimum-length policy;
- deterministic alternative ID/hash and rank.

Alternatives are ranked by blockers, then fitting count, then total length, then deterministic signature. The explicit `maxAlternatives` cap is applied only after ranking.

## Batch boundary

This batch intentionally does not convert required turns into elbow commands. Batch 3B will consume one selected compatible alternative, bind required turn locations to Batch 2 catalogue elbows, build the exact operation graph, and certify Apply/Undo/Redo as one transaction.

Likewise `TRANSITION_REQUIRED` remains non-executable until a governed reducer/transition resolver is present.

## Qualification

Tests seed two real catalogue-bound Start Routes and prove:

- exact endpoint and incident-edge custody;
- deterministic direct/X→Y/Y→X alternatives;
- fitting-aware ranking;
- explicit route-family controls;
- deterministic maximum-alternative capping in three axes;
- spec mismatch classification;
- stale node-revision rejection;
- rejection after an endpoint ceases to be graph-open.
