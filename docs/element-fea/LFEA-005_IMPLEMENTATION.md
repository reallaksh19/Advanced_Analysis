# LFEA-005 — Canonical Geometry and Mesh Package Adapter

## Authority and baseline

- Required baseline: `33d5dd9b889a1f5c9856078468074661b1b62e6a`.
- Implementation is explicitly authorized by the LFEA-005 Work Pack.
- LFEA-001 through LFEA-004 remain the qualified element, solver, recovery, convergence, and stress-interpretation authorities.
- LFEA-005 is an import and mapping boundary only.

## Closed contracts

```text
lfea-mesh-package/v1
lfea-mesh-adapter-profile/v1
lfea-mesh-adapter-result/v1
```

Accepted output contains an existing qualified:

```text
fea-continuum-model/v1
```

No existing solver profile or continuum result contract is reinterpreted.

## Package boundary

The first package version is JSON-compatible and framework neutral. It supports only:

```text
unitsIdentity     = MM_N_MPA_V1
coordinateSystem = RIGHT_HANDED_XY_V1
element types     = T3, Q4
load cases        = exactly one static load case
```

No unit inference or conversion occurs. Negative zero is canonically normalized to zero. Coordinates are never rounded, snapped, merged, or relocated.

No Gmsh, Abaqus, Nastran, ANSYS, CalculiX, DXF, STEP, IGES, STL, OBJ, or other third-party parser is included.

## Adapter profile

Every conversion requires an explicit `lfea-mesh-adapter-profile/v1` containing:

```text
profileIdentity
coordinateAbsoluteTolerance
areaAbsoluteTolerance
jacobianAbsoluteTolerance
maximumNodes
maximumElements
maximumEdges
maximumRegions
maximumBoundaries
maximumPoints
maximumAssignments
```

All values are finite and positive. Tolerances qualify input; they never alter it. Capacity is checked before large derived topology structures are created.

## Contract normalization

The package contract:

- rejects unsupported or missing fields;
- verifies the declared semantic hash after canonical collection ordering;
- canonicalizes nodes, elements, materials, regions, boundaries, points, assignments, loads, constraints, and source references by explicit identity;
- preserves element connectivity order;
- validates finite geometry and explicit source ancestry;
- deeply freezes accepted package and adapter evidence.

Array insertion order has no semantic effect.

## Geometry qualification

T3 input requires three distinct existing nodes and a positive signed area above the explicit area tolerance.

Q4 input requires four distinct existing nodes, strict counterclockwise convex connectivity, finite non-collapsed edges, and positive Jacobian determinants at all four full-integration Gauss points and all four natural corners.

The adapter does not reorder connectivity and never applies absolute area or absolute Jacobian repair.

## Deterministic topology

The adapter constructs an undirected edge-incidence index from canonical elements. Every edge retains:

```text
edgeIdentity
canonicalNodePair
incidentElementIds
incidentLocalEdgeIds
incidenceCount
classification
```

Classification is closed:

```text
1 incident element  -> EXTERIOR_EDGE
2 incident elements -> INTERIOR_EDGE
>2 incidents        -> NONMANIFOLD_EDGE rejection
```

Duplicate connectivity, exact coincident nodes, hanging nodes, partially shared edges, crossing edges, and nonmanifold edges fail closed. Near-coincident nodes produce deterministic warning evidence and remain unchanged.

## Regions, boundaries, and points

Regions are explicit element selectors. Every referenced element must exist and every region is nonempty.

Boundaries use element-local edge identities:

```text
T3_E1 T3_E2 T3_E3
Q4_E1 Q4_E2 Q4_E3 Q4_E4
```

Only exterior edges are accepted. An edge may have only one boundary owner. Boundary evidence retains edge and node counts, connected components, open chains, closed loops, endpoints, branch nodes, and canonical node identities. Disconnected components remain explicit.

Points resolve to exactly one declared node. No nearest-node search is implemented.

## Material and thickness ownership

Material assignments resolve regions to element sets. Every element must receive exactly one existing material. Missing, multiple, or unused ownership fails closed.

Plane-stress elements receive exactly one positive finite thickness through region assignments.

Plane-strain packages prohibit thickness assignments and preserve `solverProfile.outOfPlaneScale` as a separate existing solver authority.

## Loads

Point forces generate one existing LFEA nodal-force record.

Boundary traction and pressure assignments generate one child edge load per selected exterior edge using:

```text
<parentLoadId>:<elementId>:<localEdgeId>
```

Pressure direction remains governed by the existing element-local counterclockwise outward-normal convention, not by boundary-chain order.

Separate parent assignments may act on the same boundary. Their child identities and mapping ownership remain distinct. Ordinary non-adapter duplicate edge loads remain rejected by the continuum-model validator.

## Constraints

Constraint selectors are closed to:

```text
POINT
BOUNDARY
```

Each UX or UY component is one of:

```text
FREE
FIXED
PRESCRIBED(value)
```

Boundary selectors expand through the deterministic unique boundary-node set. Generated identities use:

```text
<parentConstraintId>:<nodeId>:<UX|UY>
```

Repeated or conflicting ownership of a node/DOF fails even when values are identical. The adapter never adds stabilizing restraints.

## Canonical model construction

The model source hash is the accepted mesh-package semantic hash. Model nodes, elements, materials, loads, constraints, and source references use that immutable ancestry.

The generated model is passed through the existing `createContinuumModel` validator. Q4 quality evidence is now accepted idempotently only when it hashes exactly to freshly recomputed geometry evidence. This permits an already-qualified model to be solved again without changing Q4 calculations.

## Mapping ledger

Accepted results retain exact immutable mappings for:

```text
source node -> canonical node
source element -> canonical element
region -> canonical element set
boundary -> canonical edge set
point -> canonical node
material assignment -> canonical elements
thickness assignment -> canonical elements
parent load -> generated LFEA loads
parent constraint -> generated LFEA constraints
solver profile -> canonical solver profile
```

Every row has status `MAPPED_EXACTLY`. Approximate mapping is not implemented.

## Accepted and rejected results

Accepted `lfea-mesh-adapter-result/v1` evidence contains the package and profile identities, qualified model and hash, topology, entities, assignments, mapping ledger, diagnostics, limitations, and result semantic hash.

Rejected results contain no qualified model, no qualified model hash, no solver-ready entity or assignment evidence, and no mapping ledger. Deterministically ordered diagnostics and safe partial topology evidence may remain.

Result validation recomputes the adapter semantic hash, revalidates accepted continuum models, and verifies package-to-model ancestry.

## Qualification

```text
node scripts/lfea-005-check.mjs
node scripts/lfea-005-source-guard.mjs
```

The suite covers contracts, topology, assignments, dense and sparse solver round trips, LFEA-003 consumption, 38 fail-closed cases, reordered-package byte identity, semantic hashes, and deep immutability.

The dedicated workflow runs all LFEA-001, LFEA-002, LFEA-003, and LFEA-004 behavioral suites before LFEA-005. It invokes no predecessor source guard, W10.11, LAFEA, W10.R2, PCF-intake, application-shell, or aggregate release authority.

## Limitations

- No automatic mesh generation, smoothing, optimization, or refinement.
- No node merge, coordinate snap, gap closure, connectivity repair, or element reorientation.
- No CAD or commercial mesh-format parsing.
- No multiple load cases or load combinations.
- No body force, gravity, thermal load, spring, gap, contact, or nonlinear analysis.
- No new finite element, solver algorithm, recovery rule, contour UI, W11 coupling, or piping-code check.
- No claim of commercial-format compatibility or user-facing application capability.
