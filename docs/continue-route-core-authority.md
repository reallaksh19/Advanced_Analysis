# Continue Route core authority

## Scope

This batch introduces the deterministic core for extending one existing graph-open pipe endpoint through multiple catalogue-bound straight pipe legs. It deliberately does not add production HUD/controller integration or automatic fittings.

## Authority chain

```text
canonical degree-one start node + exact revision
→ Continue Route intent
→ route geometry and operation graph
→ sandbox certified-session candidate
→ preview / validation receipt
→ exact journal reload on Apply
→ atomic route-level undo / redo
```

Each added straight leg materializes exactly two governed commands:

```text
CREATE_NODE(next vertex)
INSERT_PIPE_SEGMENT(previous endpoint -> next vertex)
```

For `N` added legs the candidate therefore contains exactly `N` new nodes, `N` new pipe edges and `2N` certified commands. The pre-existing start endpoint is retained and its exact canonical node revision is part of the intent authority.

## Start-endpoint custody

Continue Route accepts only one exact canonical node whose graph degree is exactly one. Planning fails closed when the node cannot be resolved exactly, its revision differs from the intent, its graph degree is not one, or the certified session/source/canonical state/journal/catalogue has changed.

The planner derives the starting coordinate from the canonical node record. The UI does not supply a second start-coordinate authority.

## Point acquisition

Typed and viewport input normalize into the same intent schema. Viewport acquisitions must be exact and unambiguous and must bind to the declared coordinate datum. Axis locking is evaluated sequentially from the previous resolved route point, so each leg has an explicit effective endpoint.

## Turn policy for this batch

Direction changes are detected deterministically and retained as turn evidence in the route plan. A plan containing any turn is marked `requiresAutoFitting = true` and candidate preparation fails closed.

This prevents the batch from committing an implicit geometric corner with no governed elbow or fitting. The next batch will replace those turn markers with catalogue-resolved fitting composition.

## Atomicity

Preview is sandbox-only and does not mutate the live certified session. Apply recreates the candidate from current authority and loads the exact certified journal only after validation. Undo removes the complete `2N` command suffix; Redo restores the exact active ledger and canonical result. The journal hash remains monotonic because undo/redo advances certified session version.

## Qualification

The existing `3D Edit Authoring Tools` workflow is extended to trigger on Continue Route core files and tests, syntax-check all new modules, enforce the `<300` physical-line ceiling, and execute the Continue Route integration test with the existing Start Route and authoring kernel suites.

The integration test seeds an actual Start Route, then proves typed/viewport equivalence, multi-leg candidate shape, non-mutation before Apply, exact atomic Apply/Undo/Redo, Cancel behavior, sequential axis locks, turn fail-closed behavior, stale revision rejection and degree-one endpoint enforcement.
