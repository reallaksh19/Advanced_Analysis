# Phase 8 — Resolved Engineering Component Geometry

## Status

Phase 8 inserts an immutable engineering-geometry projection between `analysis-workspace-dataset/v1` and the read-only viewport. It replaces anonymous line/point interpretation with explicit pipe, elbow, tee, reducer, flange, valve, and support primitives.

It does not change `WorkspaceState`, imported data, analysis execution, solver contracts, reporting, or model-authoring ownership.

## Canonical flow

```text
analysis-workspace-dataset/v1
→ component classification
→ topology and dimensional evidence resolution
→ resolved-engineering-geometry/v1
→ viewport-render-model/v2
→ Canvas2D / WebGL read-only renderer
```

## Ownership boundaries

### Workspace dataset

`analysis-workspace-dataset/v1` remains the normalized source of truth for imported entities and properties.

### Resolved engineering geometry

`resolved-engineering-geometry/v1` is a derived immutable projection. It owns only:

- canonical component classification;
- topology evidence selected from normalized properties;
- normalized dimensional values and source paths;
- explicit engineering primitive intent;
- resolved, fallback, and skipped status;
- derived viewport bounds and summary.

It cannot modify the dataset and cannot become an authoring model.

### Viewport render model

`viewport-render-model/v2` adapts resolved engineering primitives into renderer-safe items. It contains no raw source, enriched, or native attribute objects.

### Render backends

Canvas2D and WebGL consume the same render contract. They may choose presentation details, but they cannot reclassify components, resolve dimensions, or read raw engineering attributes.

## Component classification

The canonical component kinds are:

- `PIPE`
- `ELBOW`
- `TEE`
- `REDUCER`
- `FLANGE`
- `VALVE`
- `SUPPORT`
- `GENERIC`

Classification priority is:

1. normalized `entityType`;
2. normalized native role;
3. deterministic descriptive text inference;
4. `GENERIC` fallback.

Common aliases such as `BEND`, `ELBO`, `OLET`, `REDU`, `FLAN`, `VALV`, `GUIDE`, and `ATTA` map to canonical kinds.

## Geometry evidence

`geometry-evidence.js` preserves:

- start and end positions;
- ordered PCF-style endpoint arrays;
- explicit centre position;
- branch positions;
- derived midpoint only when no explicit centre exists;
- bore or diameter evidence;
- deterministic source paths for every selected value.

Supported input forms include:

- managed-stage `nativeParams.startPoint/endPoint`;
- `APOS/LPOS` and `DX/DY/DZ` fields;
- PCF-style `points`, `centrePoint`, and branch point fields;
- source, enriched, and regular attribute coordinate strings.

## Dimensional evidence

The resolver searches these scopes in fixed priority order:

1. `nativeParams`
2. `enrichedAttributes`
3. `sourceAttributes`
4. `attributes`
5. normalized geometry bore evidence

Resolved dimensions preserve source paths. Supported fields include:

- outside diameter;
- wall thickness;
- bend radius and angle;
- reducer inlet/outlet diameter;
- branch diameter;
- flange outside diameter and thickness;
- valve body diameter and length;
- support symbolic size.

No network or catalogue lookup occurs in Phase 8.

## Primitive contract

Representative primitive kinds are:

```text
PIPE       → tube
ELBOW      → swept-path or tube fallback
TEE        → junction with multiple legs
REDUCER    → frustum
FLANGE     → disc
VALVE      → valve-body
SUPPORT    → support-marker
GENERIC    → tube or marker fallback
```

Every resolved item contains:

- entity and component identity;
- classification trace;
- `resolutionStatus`;
- `resolutionReason`;
- primitive intent;
- normalized dimensions;
- dimension evidence;
- geometry source paths.

## Resolution status

### `resolved`

Required topology and relevant dimensions are available.

### `fallback`

The entity is renderable but some engineering evidence is incomplete. The primitive uses an explicit symbolic visual dimension or simpler topology. The fallback reason is retained.

Examples:

- pipe without outside diameter;
- elbow without valid circular centre evidence;
- tee without three usable legs;
- flange without thickness or axis;
- support without size.

### `skipped`

No safe position or usable topology exists. The entity ID and reason remain in the skipped ledger.

No fallback is allowed to emit `NaN`, `Infinity`, an unbounded primitive, or a silent catalogue assumption.

## WebGL rendering

The WebGL backend uses a dedicated primitive factory:

- cylinder geometry for pipes and reducer frustums;
- tube geometry for resolved elbow paths;
- compound cylinder/sphere groups for tees;
- cylinder discs for flanges;
- cylinder/sphere groups for valves;
- boxes for supports;
- spheres for safe point fallbacks.

Compound objects preserve a single entity ID for raycast selection. Geometry and material resources are recursively disposed during dataset replacement, clear, and workspace teardown.

## Canvas2D rendering

Canvas2D provides deterministic symbolic equivalents:

- solid or dashed centerlines;
- curved paths;
- multi-leg junctions;
- flange double circles;
- valve diamonds;
- reducer triangles;
- support squares;
- point fallback circles.

Dashed presentation identifies fallback evidence without changing selection identity.

## Viewport metadata

The viewport host publishes panel-scoped evidence:

- `data-renderable-count`
- `data-resolved-count`
- `data-fallback-count`
- `data-skipped-count`
- `data-component-kinds`
- `data-selected-entity-id`

These fields are certification evidence only; they do not own engineering state.

## Lifecycle rules

Resolved geometry is rebuilt only when the dataset object changes.

It is preserved when:

- entity selection changes;
- an analysis session opens or closes;
- analysis history changes;
- a report is exported.

It is discarded when:

- a valid replacement dataset loads;
- the dataset is cleared;
- the workspace is destroyed.

An invalid import retains the previous resolved geometry and renderer instance.

## Guardrails

- `WorkspaceState` remains source of truth.
- No imported entity mutation.
- No renderer-side engineering classification or dimension lookup.
- No direct imports from legacy sketcher, calculator, PCF UI, or vendor runtime modules.
- No solver, analysis, or report execution from geometry modules.
- No React or Zustand inside `src/workspace`.
- No timestamps, random IDs, or environment-dependent geometry.
- No runtime module over 300 lines.
- No model editing or catalogue mutation.

## Certification

Phase 8 certification proves:

1. deterministic alias classification;
2. source-traceable dimension resolution;
3. PCF and managed-stage topology evidence;
4. all seven canonical engineering primitives;
5. explicit fallback and skipped behavior;
6. finite immutable contracts;
7. raw-field-free render models;
8. Canvas2D and WebGL contract parity;
9. compound entity selection;
10. invalid-import retention;
11. clear and teardown disposal;
12. all Phase 1–7, U3–U7, benchmark, release, and production-build gates remain green.

## Non-goals

Phase 8 does not provide:

- catalogue or standards lookup;
- ASME dimensional selection;
- mesh editing;
- topology authoring;
- branch reconstruction beyond available evidence;
- solver geometry mutation;
- persistent geometry storage;
- export to CAD, GLB, RVM, or PCF.
