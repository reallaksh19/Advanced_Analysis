# Continue Route automatic governed elbows

## Scope

Batch 2 extends the Continue Route core with deterministic catalogue-resolved elbow composition. It does not introduce a new topology command or renderer. Turns are compiled into the existing certified `ADD_BEND_DEFINITION` authority after their two catalogue-bound `INSERT_PIPE_SEGMENT` arms exist.

## Catalogue resolution

For each geometric route turn, the resolver requires an exact `ELBOW` record compatible with the active pipe binding by:

- nominal size;
- outside diameter;
- piping class;
- pressure class;
- included angle;
- compatible endpoint connection types.

Pipe and fitting material specifications are not forced to be identical because governed pipe and fitting material standards can legitimately differ.

Zero compatible records blocks with `NO_COMPATIBLE_ELBOW`. More than one compatible record blocks with `ELBOW_SELECTION_REQUIRED` unless the caller supplies one exact record ID. A supplied record must remain in the compatible set.

The immutable elbow binding retains catalogue ID/version/hash/source hash, record ID/hash/source reference, governed size/class/connections, radius, angle, mass and material. `radiusAuthority` embeds the exact catalogue and record hashes so the canonical bend retains traceable fitting authority.

## Tangent geometry

For every elbow:

```text
tangentDistance = radius / tan(includedAngle / 2)
```

The fitted planner accounts for tangent consumption on both adjacent straight legs. A straight segment between two elbows therefore loses the outgoing tangent of the first elbow and incoming tangent of the second elbow.

The remaining effective straight length must be at least the Continue Route `minimumLengthMm`. Failure blocks planning before any candidate or journal mutation occurs.

## Certified operation graph

A two-leg route with one turn compiles as:

```text
CREATE_NODE(corner)
INSERT_PIPE_SEGMENT(start -> corner)
CREATE_NODE(end)
INSERT_PIPE_SEGMENT(corner -> end)
ADD_BEND_DEFINITION(corner, pipe-1, pipe-2)
```

For `N` route legs and `T` turns:

```text
new nodes = N
new pipe edges = N
new bends = T
certified commands = 2N + T
```

Each pipe continues to use the catalogue-bound pipe primitive. Each bend uses the existing canonical bend-definition command with exact generated node/edge targets.

## Composite certification

The second pipe arm temporarily exposes a geometric corner before the bend-definition command is applied. Fitted routes therefore use the repository's established final-state composite pattern: intermediate command certification retains structural/provenance authority while checker rejection of temporary findings is deferred until the completed route exists.

No permanent checker policy is weakened. Production worker/final-state validation remains the gate before a future HUD Apply path is enabled.

## Atomicity

Candidate preparation remains sandbox-only. Apply recreates the exact candidate and loads its certified journal atomically. Route-level undo removes the entire `2N + T` suffix; redo restores the exact active ledger and resulting canonical topology.

## Qualification

The Batch 2 tests cover exact elbow resolution, tangent evidence, topology/command counts, canonical bend radius/angle/provenance, atomic Apply/Undo/Redo, insufficient tangent length, missing compatible records, ambiguous compatible records, deterministic explicit selection and stale catalogue rejection.
