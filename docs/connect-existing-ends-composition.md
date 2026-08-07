# Connect Existing Ends — certified composition

## Scope

Batch 3B consumes one compatible, deterministic route alternative from the Connect Existing Ends planning authority and compiles it into the existing certified topology-edit command graph. It introduces no new mutation primitive, renderer, catalogue authority or journal.

## Executable boundary

Only plans with:

```text
compatibilityStatus = COMPATIBLE
```

are executable. `TRANSITION_REQUIRED` remains blocked until a separately governed reducer/transition authority exists.

The selected alternative must also contain no route-policy blockers.

## Elbow authority

Every non-collinear interface is resolved against an exact governed `ELBOW` catalogue record. Compatibility requires exact nominal size, outside diameter, piping class, pressure class, included angle and compatible connection types.

The resolver fails closed when:

- no compatible elbow record exists;
- multiple compatible records exist without explicit selection;
- an explicit selection is not in the compatible set;
- the pipe binding and catalogue hash differ.

Connect keeps its elbow binding schema separate from Continue Route, so the existing Continue Route public contract is unchanged.

## Tangent feasibility

For each circular elbow with route deflection angle `θ`:

```text
tangent = radius × tan(θ / 2)
```

Internal elbows consume tangent from both adjacent new route segments.

A start-interface elbow consumes tangent from:

- the existing start host pipe; and
- the first new route segment.

An end-interface elbow consumes tangent from:

- the last new route segment; and
- the existing end host pipe.

After every accumulated trim, each new route segment and each affected retained host pipe must still satisfy the explicit minimum-length policy.

## Operation graph

For `N` selected route segments and `T` required elbows:

```text
new route nodes = N - 1
new pipe edges  = N
new bends       = T
commands        = 2N - 1 + T
```

All internal corner nodes and new pipe segments are created first. Bend definitions are appended only after the route geometry exists, so each bend resolves exact current node/edge revisions.

Example, two-leg orthogonal connection with one internal elbow:

```text
CREATE_NODE(corner)
INSERT_PIPE_SEGMENT(start -> corner)
INSERT_PIPE_SEGMENT(corner -> end)
ADD_BEND_DEFINITION(corner, pipe-1, pipe-2)
```

A route requiring elbows at existing start/end interfaces binds those bend definitions to the retained host pipe and the adjacent new route pipe. Shared new spools retain multiple bend crosswalks through the Batch 2 multi-bend edge authority.

## Candidate and transaction

Candidate preparation runs only in a cloned certified session. Composite routes use the existing final-state pattern so temporary pre-bend checker findings cannot force a permanent checker relaxation.

Preview is non-authoritative and non-mutating. Apply recreates the exact candidate before loading the certified journal. Cancel leaves canonical and journal authority unchanged. Undo removes the exact connection command suffix and Redo restores the exact resulting canonical topology and active ledger.

## Qualification contract

The focused integration suite covers:

- two-leg / one-elbow connection;
- exact command and topology counts;
- 45-degree endpoint turns with `R × tan(θ/2)` tangent evidence;
- non-mutating Cancel;
- atomic Apply / Undo / Redo;
- three-elbow connection with both route pipes cross-referenced by two bends;
- direct diagonal failure when the catalogue has no exact elbow angle;
- `TRANSITION_REQUIRED` execution block;
- retained-host tangent failure;
- one-segment aligned connection with no generated node or elbow.

Production HUD wiring is intentionally deferred to the next UI batch. This batch establishes the executable authority that UI must call.
