# Connect Existing Ends — production authoring

## Purpose

This batch wires the certified Connect Existing Ends planner/transaction authority into the existing production 3D authoring controller. It does not add a renderer, topology reducer, workspace mutation path, or UI-owned engineering authority.

## Production flow

The existing Authoring tools panel now exposes **Connect ends**. The flow is explicit:

1. select one graph-open canonical pipe endpoint and capture it as Start;
2. select a second graph-open canonical pipe endpoint and capture it as End;
3. select an exact catalogue-bound PIPE record;
4. enter the minimum straight-segment length and overlap tolerance;
5. explicitly authorize direct and/or orthogonal route families and a maximum ranked-alternative count;
6. plan deterministic alternatives;
7. explicitly select one ranked alternative;
8. review governed elbow evidence for every required start/internal/end turn;
9. explicitly select an elbow record when more than one exact compatible record exists;
10. Preview the immutable candidate in the existing ghost group;
11. run final-state validation in the existing module worker;
12. Apply the exact certified journal suffix;
13. Undo/Redo the whole connection transaction atomically.

No route family, engineering threshold, PIPE record, or ambiguous ELBOW record is silently selected.

## Endpoint authority

Endpoint capture consumes only the current canonical selection. Exactly one node must be selected, the node must exist in the certified topology, its graph degree must be one, and its single incident edge must be a governed PIPE. The capture stores the exact node revision hash and incident edge ID. Screen coordinates, nearest geometry, mesh names, and pointer proximity are not endpoint authorities.

## Ranked alternatives

Planning delegates to `TopologyEditConnectEndpointsPlan.v1`. The HUD shows deterministic rank, route signature, fitting count, centerline length, and blocker evidence. Selecting an alternative does not mutate topology.

`TRANSITION_REQUIRED` is displayed as blocking evidence. The production adapter does not invent reducers or transitions for incompatible endpoint engineering profiles.

## Governed fittings

Fitting options are exposed by the same core compatibility predicate used by `resolveConnectEndpointsElbow`. A unique compatible elbow is displayed as `UNIQUE EXACT`. Multiple compatible records require an explicit user selection. Zero compatible records remain blocking.

The execution operation retains catalogue hash, record hashes, source references, tangent distances, effective straight lengths, and endpoint-host tangent evidence.

## Preview and validation

Preview prepares the candidate in a cloned certified session and renders only candidate-bound canonical IDs through the existing ghost group and sole production renderer.

Worker validation materializes the exact Connect operation graph into the professional `RECONNECT_ENDPOINTS` validation contract. Changed scope includes both retained endpoint nodes, both retained incident host edges, generated corner nodes, generated pipe edges, and exact source record IDs. Only diagnostics introduced relative to the current baseline feed the Connect validation receipt; new HIGH findings block Apply.

## Apply / Undo / Redo

Apply recreates the candidate from the current certified authority before loading its exact serialized journal. The HUD/runtime never writes canonical topology directly.

The resulting `TopologyEditConnectEndpointsTransaction.v1` receipt owns the exact command suffix. Undo verifies that suffix before reversing all commands. Redo verifies the redo suffix and restores the exact resulting canonical hash.

## Qualification boundary

The production gate covers:

- Connect core planner, elbow resolver, operation, candidate, transaction and validation-plan modules;
- production service, HUD, runtime support and runtime modules;
- production controller wiring;
- planner, transaction and production-adapter Node suites;
- Chromium/WebGL production HUD lifecycle including Preview/Cancel/Validate/Apply/Undo/Redo;
- one-renderer and browser-error assertions;
- strict `<300` physical-line checks for scoped JavaScript/test modules.

Independent review remains required before merge or production promotion.
