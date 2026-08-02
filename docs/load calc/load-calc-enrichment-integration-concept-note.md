# Load Calc Enrichment Integration Concept Note

## Status

**Concept and implementation-planning authority only.** This document does not change source-model, topology, calculation, approval, persistence, or release authority.

## Purpose

Load Calc currently contains two partially overlapping engineering-input paths:

1. the production empirical path, which consumes the normalized workspace dataset, Project Data, support-site models, route partitions, and master source hashes; and
2. the first-cut path, which independently creates an enriched shared-model projection from first-cut master records, accepted overrides, and approved approximations before rebuilding topology, restraint, mass, path, and optional beam models.

The first-cut path is therefore visible and partly functional, but its enriched values are not the common input authority used by the main Load Calc calculation. The objective is to integrate these paths without mutating imported source data, duplicating engineering authority, or silently promoting fuzzy matches and assumptions into calculated results.

## Executive proposal

Introduce one immutable, source-bound engineering-input projection between data intake and calculation:

```text
SOURCE DATASET
+ MASTER SNAPSHOTS
+ PROJECT DATA POLICIES
+ ACCEPTED OVERRIDES
+ APPROVED APPROXIMATIONS
             |
             v
     ENRICHMENT RESOLUTION
             |
             v
 CANDIDATE ENGINEERING INPUT PROJECTION
             |
             v
      THREE-STEP IMPACT ANALYSIS
             |
             v
       EXPLICIT PREFLIGHT SEAL
             |
             v
  SEALED ENGINEERING INPUT PROJECTION
        /                         \
       v                           v
EMPIRICAL LOAD ENGINE       FIRST-CUT METHODS
```

The source dataset remains immutable. Enrichment is a sidecar projection bound to exact source, master, mapping, Project Data, and approval hashes.

## Current-state assessment

### Production empirical path

The production Load Calc route currently derives support sites and route partitions from the active normalized dataset. Calculation is explicit and consumes the dataset, Project Data, support-site model, route-partition model, and the master-data container. In practice, the numerical resolver obtains pipe sections, material densities, fluid densities, insulation densities, and component weights from approved Project Data fields. Master files chiefly provide active source hashes and normalized-row evidence used to qualify those Project Data entries.

This creates a missing governed transformation:

```text
Master file
  -> parsed rows
  -> normalized rows
  -> source hash
  -X-> approved per-line and per-component calculation inputs
```

### First-cut path

The first-cut workbench already contains several sound concepts:

- immutable source objects;
- explicit sidecar bindings;
- deterministic authority precedence;
- exact selectors;
- accepted override and approved approximation separation;
- source-bound assumption sealing;
- explicit preflight confirmation;
- stale-result blocking;
- deterministic mass, path, support-screening, and optional beam packages.

However, it independently imports master data, builds its own enriched shared model, rebuilds derived models, and produces its own result package. It is not the common input projection for production Load Calc.

### Legacy preflight path

The older preflight grid performs process matching and fill-down in DOM state. It also contains substring matching, module-local overrides, demonstration fallback elements, and inputs that are not sealed into a hashed engineering contract. This path should not be promoted into the new authority model.

## Core design principles

### 1. One calculation-input authority

All Load Calc methods must consume the same sealed engineering-input projection. Individual engines may add method-specific assumptions, but they must not independently import or reinterpret primary engineering masters.

### 2. Immutable source data

Imported dataset entities, shared-model components, supports, nodes, ports, and source references are immutable. Enrichment must never rewrite the source dataset in place.

### 3. Separate centerline geometry from section geometry

The word “geometry” must be split into two authorities:

- **Canonical centerline geometry:** coordinates, connectivity, ports, nodes, edges, branch identity, and component placement. Only normalization and governed topology-edit authority may change it.
- **Analysis section geometry:** outside diameter, wall thickness, inside diameter, insulation envelope, section properties, and mass properties. Approved master enrichment may supply these values.

A master record must never add, remove, reconnect, or reposition canonical centerline entities.

### 4. Exact identity before engineering use

Fuzzy matching may propose a mapping, but it may not enter the sealed projection. Every accepted proposal must resolve to an exact selector such as:

- canonical entity ID;
- source entity ID;
- line key;
- piping class plus nominal bore;
- component type plus nominal bore;
- catalog key;
- support type;
- support entity ID.

### 5. Explicit evidence precedence

The retained resolution precedence should be:

```text
EXPLICIT_SOURCE
> ACCEPTED_OVERRIDE
> AUTHORIZED_MASTER
> USER_APPROVED_APPROXIMATION
```

A higher tier wins only for the exact same target field. Same-authority conflicts must fail closed. Existing explicit source values must be materialized as binding evidence; they cannot be represented as an empty tier.

### 6. Approval is not calculation

Confirming enrichment seals an input projection and marks prior results stale. It must not automatically run a calculation.

### 7. Deterministic evidence

Every snapshot, resolution, projection, impact report, seal, and result must use canonical serialization and SHA-256 or the repository’s established semantic-hash authority. Reordered input collections must produce identical identities.

## Proposed contracts

### MasterDataSnapshot.v2

An immutable record for one imported master:

```js
{
  schema: 'MasterDataSnapshot.v2',
  masterKey: 'lineList',
  source: {
    fileName: 'line-list.xlsx',
    sheetName: 'Lines',
    sha256: '<64 hex>',
    byteLength: 123456,
  },
  mapping: { ... },
  mappingHash: '<semantic hash>',
  normalizedRows: [ ... ],
  normalizedRowsHash: '<semantic hash>',
  diagnostics: [ ... ],
  snapshotHash: '<semantic hash>',
}
```

The application must either restore the complete snapshot or report `NOT_LOADED`. Persisting only a column mapping while losing the actual rows and source hash is not a valid restored state.

### EngineeringEnrichmentResolution.v1

```js
{
  schema: 'EngineeringEnrichmentResolution.v1',
  sourceDatasetHash: '<sha256>',
  sourceSharedModelHash: '<semantic hash>',
  masterSnapshotHashes: [ ... ],
  mappingHashes: [ ... ],
  projectDataProfileHash: '<semantic hash>',
  bindings: [ ... ],
  unresolved: [ ... ],
  conflicts: [ ... ],
  summary: { ... },
  resolutionHash: '<semantic hash>',
}
```

Each binding retains:

- exact target identity;
- field ID;
- value and unit;
- selected authority level;
- source record identity;
- source file hash;
- normalized row identity;
- selector identity;
- decision evidence;
- any rejected lower-authority candidates.

Required dispositions include:

- `SOURCE_RETAINED`;
- `MASTER_SELECTED`;
- `OVERRIDE_SELECTED`;
- `APPROXIMATION_REQUIRES_APPROVAL`;
- `NO_MATCH`;
- `AMBIGUOUS_MATCH`;
- `UNIT_MISMATCH`;
- `CONFLICTING_SAME_AUTHORITY`;
- `STALE_MASTER`;
- `UNSUPPORTED_FIELD`.

### CandidateEngineeringInputProjection.v1

The candidate projection should be a sidecar lookup contract rather than a cloned replacement dataset:

```js
{
  schema: 'CandidateEngineeringInputProjection.v1',
  sourceDatasetHash: '<sha256>',
  resolutionHash: '<semantic hash>',
  componentsByEntityId: { ... },
  processByLineKey: { ... },
  sectionsByClassAndBore: { ... },
  weightsByCatalogKey: { ... },
  supportsByEntityId: { ... },
  unresolved: [ ... ],
  projectionHash: '<semantic hash>',
}
```

### EngineeringInputSeal.v1

```js
{
  schema: 'EngineeringInputSeal.v1',
  sourceDatasetHash: '<sha256>',
  sourceSharedModelHash: '<semantic hash>',
  masterSnapshotHashes: [ ... ],
  projectDataProfileHash: '<semantic hash>',
  resolutionHash: '<semantic hash>',
  geometryImpactHash: '<semantic hash>',
  calculationImpactHash: '<semantic hash>',
  approvals: [ ... ],
  sealedProjectionHash: '<semantic hash>',
  sealHash: '<semantic hash>',
}
```

The seal becomes stale if any bound source, master, mapping, Project Data, override, approximation, or source dataset identity changes.

## Three-step impact analysis

The preflight process should produce three deterministic reports before sealing.

## Step 1 — Evidence and resolution impact

### Question answered

Which source fields will change, which evidence supplies each value, and what authority level is being used?

### Required analysis

For every candidate field:

- enumerate explicit source, override, master, and approximation candidates;
- normalize units before comparison;
- apply exact selector resolution;
- reject ambiguous or conflicting candidates;
- retain rejected candidates as evidence;
- identify affected canonical entities, line keys, classes, and support records;
- identify proposed approximations requiring explicit approval.

### Output

`EngineeringEnrichmentResolution.v1`

### Blocking conditions

- ambiguous match;
- same-authority conflict;
- unsupported unit conversion;
- stale master source;
- missing exact identity;
- attempted replacement of explicit source without an accepted override;
- unsupported field;
- unapproved approximation.

## Step 2 — Geometry, topology, support, and route impact

### Question answered

What derived engineering models would change if the candidate projection were sealed?

### Required comparison

Build base and candidate projections, then compare by exact canonical identity.

Classify changes as:

- `SECTION_PROPERTY_CHANGE`;
- `MASS_PROPERTY_CHANGE`;
- `PROCESS_PROPERTY_CHANGE`;
- `SUPPORT_CAPABILITY_CHANGE`;
- `SUPPORT_AVAILABILITY_CHANGE`;
- `UNEXPECTED_CENTERLINE_CHANGE`;
- `UNEXPECTED_CONNECTIVITY_CHANGE`.

### Rebuild policy

| Change | Rebuild requirements |
|---|---|
| Process pressure or temperature | load-case/screening inputs only |
| Fluid density | mass and load contributions only |
| Component weight | mass and load contributions only |
| OD, wall thickness, insulation | section and mass projection; no centerline rebuild |
| Support capability | support qualification and affected route support stations |
| Support-unavailable sensitivity | scenario-only support/path projection |
| Coordinates or connectivity | block as an authority violation |

### Scenario handling

A support-unavailable sensitivity must not remove a support from the normal enriched model. It must create a named scenario projection bound to the source support identity and explicit approval.

### Output

```js
{
  schema: 'EngineeringGeometryImpact.v1',
  baseProjectionHash: '<hash>',
  candidateProjectionHash: '<hash>',
  changedEntityIds: [ ... ],
  changedSectionEntityIds: [ ... ],
  changedSupportSiteIds: [ ... ],
  affectedRouteIds: [ ... ],
  baseSupportSiteModelHash: '<hash>',
  candidateSupportSiteModelHash: '<hash>',
  baseRouteModelHash: '<hash>',
  candidateRouteModelHash: '<hash>',
  unexpectedAuthorityChanges: [ ... ],
  geometryImpactHash: '<hash>',
}
```

### Hard invariant

```text
Master and process enrichment must not add, remove, reconnect,
or reposition canonical centerline entities.
```

## Step 3 — Calculation and result impact

### Question answered

What numerical and qualification changes would result from the candidate projection?

### Shadow calculation

Run the candidate projection in shadow mode. Do not replace the accepted result.

Compare:

- per-entity mass ledger;
- per-route load contributions;
- support reactions by load case;
- excluded inputs;
- blockers;
- equilibrium residuals;
- completeness status;
- calculation qualification;
- affected routes and support sites.

Classify changes as:

- `NO_NUMERICAL_IMPACT`;
- `CALCULATION_UNBLOCKED`;
- `CALCULATION_NEWLY_BLOCKED`;
- `MASS_CHANGED`;
- `REACTION_CHANGED`;
- `SUPPORT_PATH_CHANGED`;
- `EQUILIBRIUM_CHANGED`;
- `LOAD_CASE_SCOPE_CHANGED`.

### Output

```js
{
  schema: 'EngineeringCalculationImpact.v1',
  baseCalculationHash: '<hash|null>',
  candidateCalculationHash: '<hash>',
  affectedLoadCases: [ ... ],
  affectedRouteIds: [ ... ],
  massDeltas: [ ... ],
  supportReactionDeltas: [ ... ],
  blockerDelta: { ... },
  equilibriumDelta: { ... },
  qualificationTransition: { ... },
  calculationImpactHash: '<hash>',
}
```

Identity and evidence changes remain exact. Numerical tolerances may only be used where a governed engineering method explicitly defines them.

## Field ownership proposal

### Project Data continues to own

- gravity and load factor;
- active load cases;
- topology tolerances;
- route joining policy;
- support capability policy;
- equilibrium tolerances;
- source declarations;
- mapping and precedence policy;
- approval state.

### Sealed enrichment projection owns

- resolved line process conditions;
- resolved pipe sections;
- resolved material densities;
- resolved operating and hydro fluid densities;
- resolved insulation evidence;
- resolved component weights;
- resolved support capabilities;
- per-entity and per-line provenance;
- unresolved and excluded records.

### First-cut assumption set owns

Only method-specific assumptions not part of the primary engineering input projection, such as:

- method selection;
- first-cut sag criterion;
- first-cut pressure formula selection;
- explicit scenario assumptions;
- user-approved approximations that are valid only for the selected method.

The assumption set must be bound to the sealed projection hash.

## Proposed lifecycle

```text
MASTER_DATA_UPDATED
    -> invalidate candidate resolution
    -> invalidate impact reports
    -> invalidate prior seal
    -> mark accepted results stale
    -> do not calculate

BUILD CANDIDATE
    -> resolve exact bindings
    -> create sidecar projection
    -> generate three impact reports

CONFIRM AND SEAL
    -> verify all hashes are current
    -> verify blockers are zero
    -> store EngineeringInputSeal.v1
    -> rebuild affected derived models
    -> leave calculation stale

CALCULATE
    -> run only on explicit user request
    -> bind result to seal hash
```

## Migration plan

### Package 1 — Master snapshots and exact adapters

Deliver:

- immutable master snapshots;
- exact line-list, piping-class, weight, and material-map adapters;
- source and mapping hashes;
- deterministic diagnostics;
- no production calculation change.

### Package 2 — Shared resolver and candidate projection

Deliver:

- neutral enrichment authority module outside the first-cut package;
- explicit source extraction;
- deterministic precedence and conflict handling;
- sidecar projection;
- first-cut compatibility adapter;
- no sealing or calculation cutover.

### Package 3 — Three-step impact engine

Deliver:

- Step 1 resolution impact;
- Step 2 geometry/support/route impact;
- Step 3 shadow-calculation impact;
- extended production empirical preflight presentation;
- no production application yet.

### Package 4 — Seal and lifecycle integration

Deliver:

- explicit confirm-and-seal action;
- current/stale lifecycle;
- result invalidation;
- deterministic seal persistence;
- no automatic calculation.

### Package 5 — Production empirical consumption

Change empirical calculation to consume the sealed projection. Activate field families incrementally:

1. component weights;
2. fluid densities;
3. material densities;
4. pipe sections;
5. support capabilities;
6. support-availability scenarios.

### Package 6 — First-cut convergence

Refactor first-cut to consume the same sealed projection. Remove duplicate primary master import and retain only method-specific profiles, assumptions, scenarios, and result presentation.

### Package 7 — Legacy retirement

Retire or quarantine:

- DOM-only process fill-down;
- module-local process overrides;
- demonstration fallback entities;
- authoritative substring matching;
- duplicate first-cut primary master import;
- incomplete master persistence.

## Test requirements

### Contract tests

- snapshot identity is stable under row reordering where row order is not authoritative;
- mapping changes alter the mapping hash;
- source-file changes alter the source hash;
- stale source and mapping combinations fail closed;
- caller-owned input objects are not mutated;
- unsupported fields and units are rejected.

### Resolution tests

- explicit source outranks master;
- accepted override outranks master;
- master outranks approved approximation;
- same-authority conflicts fail;
- fuzzy candidates never enter the sealed result without exact acceptance;
- exact selector collisions fail;
- rejected lower-authority candidates remain in evidence.

### Geometry-impact tests

- process-only changes do not change centerline, support-site, or route hashes;
- section changes do not change canonical topology hash;
- support-capability changes rebuild only affected support and route scope;
- support-unavailable sensitivity creates a scenario projection;
- any coordinate or connectivity delta blocks the seal.

### Calculation-impact tests

- shadow results are deterministic;
- actual post-seal calculation equals the approved shadow candidate;
- base result remains unchanged before sealing;
- blocked-to-calculated and calculated-to-blocked transitions are explicit;
- reaction, mass, equilibrium, and exclusion deltas reconcile exactly.

### Lifecycle tests

- master update invalidates candidate, reports, seal, and results;
- Project Data update invalidates the correct downstream scope;
- dataset edit invalidates all source-bound projections;
- confirm does not calculate;
- calculate requires a current seal;
- result binds the exact seal hash;
- undo/redo or dataset version changes never resurrect stale evidence.

### Browser tests

- upload and map masters;
- review exact proposals and unresolved records;
- approve or reject approximations;
- review all three impact steps;
- seal only when eligible;
- observe stale calculation state;
- explicitly calculate;
- inspect provenance from result to source row;
- reload and verify complete snapshot restoration or explicit `NOT_LOADED` state.

### Anti-drift tests

Fail if:

- production calculation reads unsealed master rows directly;
- first-cut imports a separate primary master after migration;
- fuzzy or substring matching is used during final binding application;
- enrichment mutates source dataset or shared model;
- calculation starts during sealing;
- support sensitivity removes source supports;
- centerline topology changes through enrichment;
- a result omits the seal hash;
- a zero-step CI job is represented as a pass.

## Performance requirements

- index normalized master rows once per immutable snapshot;
- resolve exact keys using maps, not nested whole-model scans;
- calculate changed scope by exact entity, line, class, route, and support dependencies;
- avoid cloning the full workspace dataset for each proposal;
- run Step 3 shadow calculations in a worker where practical;
- reject stale worker responses by candidate and source hashes;
- retain deterministic ordering independent of worker completion order.

## Rollback strategy

Each package must be independently revertible. Until Package 5 activates a field family, the existing empirical calculation remains authoritative. During cutover, preserve a feature-controlled shadow comparison so a field family can be returned to the prior source while evidence is investigated.

Rollback must not delete source masters, approvals, or audit receipts. It should only change which current sealed projection is eligible for calculation.

## Definition of done

The integration is complete when:

- there is one primary master intake and one sealed engineering-input projection;
- production empirical and first-cut methods consume the same projection hash;
- explicit source values cannot be silently replaced;
- every master-derived value has exact source-row and file-hash provenance;
- fuzzy matching is proposal-only;
- the three impact reports reconcile with the post-seal derived models and calculation;
- enrichment never changes canonical centerline topology;
- support sensitivity is scenario-only;
- sealing never auto-calculates;
- stale evidence fails closed;
- browser and exact-head qualification pass with retained artifacts;
- no release claim is made from unexecuted CI.
