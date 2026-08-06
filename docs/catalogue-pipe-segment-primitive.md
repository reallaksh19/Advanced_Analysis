# Catalogue-Bound Pipe-Segment Primitive

## Scope

This slice implements the governed `INSERT_PIPE_SEGMENT` authority required by Issue #800. It contains no production Start Route UI.

Every implementation and test module is below 300 lines. Authority ownership is divided into contract, geometry validation, resolution, pure reduction, native writeback/recovery, and a re-export surface.

## Contract

A request must identify two distinct canonical nodes and include:

- an immutable catalogue binding;
- exact revisions for both endpoint nodes;
- a positive minimum segment length;
- a non-negative overlap tolerance.

The catalogue binding requires one exact `PIPE` record with:

- nominal size;
- outside diameter;
- schedule;
- wall thickness;
- material specification;
- piping class;
- pressure class;
- both end connections;
- catalogue ID/version/hash/source hash;
- record ID/hash and source reference.

Missing engineering evidence is blocking. `ADD_STRAIGHT_ELEMENT` is unchanged and remains unresolved.

## Resolution

Resolution revalidates the current specification catalogue and recreates the binding from the selected record. A changed catalogue, record, or governed field is rejected.

The resolver captures:

- exact endpoint records and revisions;
- source and prior canonical hashes;
- exact catalogue evidence;
- length, unit direction, and geometry hash;
- deterministic edge, component, and port identities.

Generated identities are digests of the command ID and fixed semantic roles. Collisions fail closed.

## Geometry gates

The geometry authority rejects:

- non-finite coordinates;
- zero length;
- segments below the bound minimum;
- an existing edge between the same unordered node pair;
- positive collinear overlap beyond the explicit tolerance.

Geometry is used only for validation. It is never used to recover identity.

## Pure reducer and effect assertion

The reducer consumes only the resolved command. It:

1. adds the generated `from` and `to` port keys to the exact endpoint nodes;
2. adds one catalogue-bound native pipe edge;
3. finalizes the canonical topology through the existing canonical authority.

The effect assertion requires exactly two changed nodes, one added edge, no other collection changes, exact catalogue/command/geometry evidence, and an exact edge-to-component crosswalk.

## Native writeback and recovery

Workspace writeback uses the native component key as both workspace entity ID and source entity ID. The entity persists explicit:

- edge and component identity;
- endpoint node IDs;
- start/end port keys and roles;
- exact endpoint positions;
- catalogue evidence;
- engineering evidence;
- command, geometry, engineering-evidence, and writeback hashes.

Recovery accepts only this explicit identity package. Missing identity, changed ports, changed geometry, or changed writeback material fails. Nearest-object, mesh-name, array-index, and visual/proximity recovery are absent by construction.

## Exact-head qualification

`Catalogue Pipe Segment Exact Head`:

1. checks out the exact PR head;
2. verifies `git rev-parse HEAD`;
3. syntax-checks every changed JavaScript module;
4. enforces every module and test below 300 lines;
5. runs deterministic and adversarial Node tests;
6. requires a nonzero TAP pass count;
7. uploads the test evidence.

Locked base: `fe8908280d432891f114bed9659eb38ab9ce1b0e`.
