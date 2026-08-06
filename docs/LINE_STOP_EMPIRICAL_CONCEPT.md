# Empirical Line-Stop and Restraint Load Concept

**Status:** Integration concept and staged implementation specification  
**Primary mechanics authority:** `EMPIRICAL_BEAM_CONTACT_V1`, merged through PR #709  
**Future extension:** `EMPIRICAL_RESTRAINT_NETWORK_V1`  
**Current runtime status:** Existing chainage methods are authorized; beam/contact and restraint-network execution are not yet registered in Load Calc.

## 1. Purpose and governing decision

This document defines how empirical piping restraint calculations are integrated with the existing mechanics, workspace, authorization, and SJSON visualization architecture.

It does **not** define a second implementation of section properties, weight, member stiffness, thermal initial strain, contact release, action recovery, bend stations, equilibrium, or sustained stress. Those capabilities already exist in the merged `EMPIRICAL_BEAM_CONTACT_V1` mechanics package.

The line-stop work shall extend that authority in controlled stages:

1. adapt normalized workspace/SJSON authorities into an immutable mechanics request;
2. register the already merged planar beam/contact method in the existing authorized execution framework;
3. expose scenario configuration inside the existing Load Calc shell;
4. add a separately identified, restricted line-stop network method; and
5. qualify a coupled three-dimensional branch/loop method before combined operating reactions are authorized.

The implementation is screening-oriented until its exact topology, contact, load-case, and profile domain has passed the stated qualification gates.

## 2. Integration with Existing Empirical Mechanics and Load Calc Authority

### 2.1 Existing mechanics authority

PR #709 is the authoritative vertical mechanics implementation. It provides:

- section-state resolution;
- distributed and concentrated weight;
- planar frame member compilation;
- segmented elbows;
- thermal initial strain;
- global matrix assembly and numerical solution;
- unilateral active-set contact;
- member-action and internal-extrema recovery;
- bend-station tangent projection;
- force and moment equilibrium checks;
- B31.3 sustained-stress calculation; and
- cold, hot, operating, and sustained load-case decomposition.

The governed method and result contracts are:

```text
method:
  EMPIRICAL_BEAM_CONTACT_V1

schemas:
  empirical-piping-request/v1
  empirical-piping-section-states/v1
  empirical-piping-planar-result/v1
  empirical-member-action-recovery/v1
  empirical-b31-sustained-stress/v1
  empirical-contact-history/v1
```

The currently qualified mechanical DOFs are:

```text
UX, UY, RZ
```

No line-stop implementation shall duplicate the merged mechanics functions. New formulas are permitted only where the existing mechanics does not provide the required network behavior.

### 2.2 Present contact limitation

The merged contact implementation currently qualifies only:

- planar positive-vertical rests;
- contact in the planar vertical translation DOF;
- zero initial gap;
- frictionless release; and
- no finite-gap re-contact.

Unsupported directions, finite gaps, friction, nonplanar regions, and unqualified re-contact rules shall return governed blockers rather than an estimated reaction.

### 2.3 Existing Load Calc authority

The current Load Calc workflow already provides:

- explicit calculation authorization;
- source and binding validation;
- stale-result invalidation;
- Project Data and Master Data dependencies;
- pre-flight checks;
- immutable execution receipts;
- JSON trace/evidence;
- table-to-viewport selection; and
- an SJSON 3D projection controller.

The method-bound V2 authorization currently permits only:

```text
CHAINAGE_TRIBUTARY_SPAN_V2
CHAINAGE_TRIBUTARY_SPAN_V3_COG
```

`EMPIRICAL_BEAM_CONTACT_V1` shall be added by a dedicated runtime-bridge work pack after the SJSON adapter contract is established. `EMPIRICAL_RESTRAINT_NETWORK_V1` remains a future method and must not be represented as registered or qualified.

### 2.4 Mechanics boundary

The mechanics core shall never parse raw SJSON or StagedJSON. The authority chain is:

```text
workspace dataset
  -> shared-piping-model/v1
  -> piping-port-topology-graph/v1
  -> support-attachment-model/v1
  -> restraint-capability-model/v1
  -> SJSON empirical adapter
  -> empirical-piping-request/v1
  -> authorized method execution
```

The adapter owns format crosswalk and provenance. The mechanics core owns calculations.

## 3. Method inventory and result separation

| Method | Purpose | Status |
|---|---|---|
| `CHAINAGE_TRIBUTARY_SPAN_V2` | Basic vertical load distribution | Existing and authorized |
| `CHAINAGE_TRIBUTARY_SPAN_V3_COG` | CoG-aware vertical distribution | Existing and authorized |
| `EMPIRICAL_BEAM_CONTACT_V1` | Planar vertical beam/contact/actions | Core merged; runtime/UI registration pending |
| `EMPIRICAL_RESTRAINT_NETWORK_V1` | Guide and line-stop thermal screening | Future, initially restricted |

Result families shall remain distinct:

```text
VERTICAL_SCREENING_RESULT
THERMAL_LINE_STOP_SCREENING_RESULT
COMBINED_OPERATING_REACTION
```

A vertical result and a line-stop result shall not be vector-added unless either:

1. one coupled model solves all relevant translational DOFs and contact states; or
2. a formally qualified superposition rule proves identical geometry, stiffness, restraints, and active support set.

Until then, the UI and export shall state:

```text
NOT_A_COMBINED_OPERATING_REACTION
```

## 4. Authoritative configuration and immutability

### 4.1 JSON is calculation authority

The authoritative runtime object shall be:

- exact-schema JSON;
- deeply frozen;
- semantically hashed;
- bound to source authorities and profile identity;
- versioned; and
- stale when any binding changes.

YAML may be offered as a user-facing import/export representation. It must be parsed and validated into the exact JSON contract before calculation. The mechanics core shall never consume YAML directly.

### 4.2 Governance classes

Configuration is divided into three classes.

**Source-derived facts — read-only in a scenario**

- node/port coordinates;
- element connectivity and axis;
- component and support identity;
- section dimensions and derived area/inertia;
- bend geometry;
- material/source records;
- source temperatures, pressure, weight evidence; and
- source restraint records.

**Project/scenario assumptions — explicitly editable**

- coordinate-frame mapping;
- output force/moment convention;
- selected method and load cases;
- calculation-only restraint type/direction/gap/stiffness/friction override;
- reference temperature and included effects;
- boundary classification;
- deterministic terminal-axis resolution; and
- profile selection.

**Calibrated profile parameters — versioned and lockable**

- empirical compliance multipliers;
- elbow/branch/loop correlations;
- finite support stiffness treatment;
- uncertainty model;
- qualified geometry/temperature/contact domain; and
- topology profile library identity.

A locked qualified profile cannot be edited. Editing creates a new unqualified profile version.

### 4.3 Restraint-only overrides

A scenario override may alter restraint metadata used by calculation, but it must never alter canonical piping geometry.

Example:

```text
Element 120 -> 130 remains geometrically -Z.
The effective restraint at node 130 may be overridden to +Z.
```

The result/evidence package shall retain both source and effective values and shall prove:

```text
sourceGeometryHash == effectiveGeometryHash
```

An override requires a reason and `geometryMutation: false`.

## 5. WP1 contracts

The initial SJSON adapter slice introduces these contracts:

```text
empirical-coordinate-frame/v1
empirical-analysis-scenario/v1
empirical-restraint-override/v1
sjson-empirical-adapter-evidence/v1
```

### 5.1 Coordinate-frame contract

A representative object is:

```json
{
  "schema": "empirical-coordinate-frame/v1",
  "sourceBasis": "SJSON_SOURCE",
  "sourceLengthUnit": "mm",
  "verticalUnitVector": [0, 0, 1],
  "analysisPlaneBasis": {
    "u": [1, 0, 0],
    "v": [0, 0, 1],
    "normal": [0, -1, 0]
  },
  "forceOutputConvention": "RESTRAINT_ON_PIPE",
  "momentOutputConvention": "RESTRAINT_ON_PIPE",
  "semanticHash": "..."
}
```

The basis must be orthonormal and right-handed. Coordinate and sign conventions must be visible in the UI and every export.

### 5.2 Analysis-scenario contract

The scenario binds:

- scenario ID and authorization state;
- exact method;
- coordinate frame;
- explicit load cases and effect ownership;
- restraint overrides;
- profile ID/version/qualification/lock state;
- dataset, shared-model, topology, attachment, restraint, and profile hashes; and
- method-combination policy.

A stale binding blocks adaptation or execution.

### 5.3 Restraint-override contract

A restraint override retains:

- `supportSiteId`;
- stable `restraintId`;
- source and effective type;
- source and effective direction/axis;
- source and effective gap, stiffness, and friction;
- mandatory reason;
- immutable semantic identity; and
- `geometryMutation: false`.

### 5.4 Adapter evidence contract

The adapter evidence binds:

- dataset hash;
- shared-model hash;
- topology hash;
- attachment hash;
- restraint-capability hash;
- scenario and coordinate-frame hashes;
- source/effective geometry hashes;
- support/restraint crosswalk hash;
- request hash; and
- sorted governed blockers.

## 6. SJSON-to-empirical request adapter

Add:

```text
src/workspace/engineering-loads/adapters/
  sjson-to-empirical-piping-request.js
```

The adapter shall:

1. accept normalized authorities only;
2. validate dataset and hash lineage;
3. convert canonical length units once at the adapter boundary;
4. crosswalk component IDs to mechanics member IDs;
5. retain support-site, restraint-occurrence, source-support, source-entity, attachment, and host-component identity;
6. resolve exact support attachment coordinates;
7. derive a source-authoritative host tangent;
8. apply scenario overrides without changing geometry;
9. create an immutable `empirical-piping-request/v1`; and
10. return blockers and evidence without executing mechanics.

It shall not:

- read raw SJSON;
- calculate reactions;
- mutate source/canonical records;
- import benchmark output;
- infer a missing host-axis direction silently; or
- register a runtime method.

A restraint occurrence retains at minimum:

```json
{
  "supportSiteId": "...",
  "restraintId": "...",
  "sourceSupportIds": ["..."],
  "sourceEntityIds": ["..."],
  "hostEntityId": "...",
  "sourceDirection": "+Z",
  "effectiveDirection": "+Z",
  "overrideId": null,
  "geometryChanged": false
}
```

## 7. Anchor decomposition authority

Anchor decomposition is a reporting projection, not a change to anchor behavior.

```text
ANC = R + G + LS
```

Let the source-authoritative host-pipe tangent at the attachment be `eLS` and the configured vertical unit vector be `v`.

```text
eLS = host tangent
```

For a nonvertical terminal:

```text
eR = normalize(v - dot(v,eLS)eLS)
eG = eLS x eR
```

For a reaction vector `F`:

```text
FLS = dot(F,eLS)
FR  = dot(F,eR)
FG  = dot(F,eG)
```

If the terminal tangent is parallel to vertical, report:

```text
LS + T1 + T2
```

If more than one tangent is plausible, or a two-port component lacks source-authoritative orientation, return:

```text
RESTRAINT_AXIS_AMBIGUOUS
```

and require explicit scenario resolution.

## 8. Restraint compatibility and future network mechanics

### 8.1 Independent scalar restraint reactions are not a general solution

The relation

```text
Fs = -Ks ds0
```

is valid only for a tightly bounded single-DOF system. Multiple restraints must be solved simultaneously through a common compatibility system:

```text
K u = f_applied + f_thermal
```

The active restraint set must be resolved as one system. Independent reactions can violate equilibrium, duplicate prevented movement, reverse signs, and omit branch coupling.

### 8.2 Restricted network method

The first `EMPIRICAL_RESTRAINT_NETWORK_V1` domain shall be:

- open chain;
- no tee/branch;
- no closed loop;
- deterministic terminal boundaries;
- one analysis direction;
- linear thermal strain;
- rigid support or one specifically qualified finite scalar stiffness; and
- zero gap or one specifically qualified bilateral scalar gap.

Even in this domain, all restraints are assembled and solved together.

### 8.3 Coupled branch/loop model

A future junction model may use a positive-semidefinite parameterization:

```text
Klocal = L LT
Kglobal = R Klocal RT
```

Positive semidefiniteness is necessary but not sufficient. The solver must also report/check:

```text
rank
minimum pivot
reciprocal condition estimate
rigid-mode count
scaled residual
```

A scalar series-support relation is permitted only for one linear scalar path. It shall not be applied directly to a coupled matrix, loop, rotational/translational system, or multiple active gap faces.

## 9. Load-case ownership

The UI shall expose explicit cases such as:

```text
W-COLD
W-HOT
SUSTAINED
OPE-HOT
EXP-THERMAL-ON-HOT-SUPPORT-SET
```

Each case declares ownership of:

- pipe/fluid/insulation weight;
- concentrated component mass;
- thermal strain;
- pressure stiffening;
- pressure thrust in compatibility; and
- pressure longitudinal stress.

`OPERATING - COLD_SUSTAINED` is not automatically pure thermal action when the support/contact state changes. The calculation and benchmark comparison must state the actual support set and effect ownership.

## 10. Failure-code namespace

Use the existing empirical mechanics namespace. Existing codes include:

```text
GEOMETRY_INVALID
MASS_SOURCE_UNRESOLVED
SUPPORT_CAPABILITY_UNKNOWN
MATRIX_SINGULAR
SYSTEM_ILL_CONDITIONED
CONTACT_NONCONVERGENT
CONTACT_RECONTACT_RULE_UNQUALIFIED
BEND_CONVERGENCE_FAILED
OUTSIDE_QUALIFIED_SCOPE
```

Additions for the SJSON/network extension are:

```text
TOPOLOGY_LOOP_PROFILE_REQUIRED
TOPOLOGY_BRANCH_PROFILE_REQUIRED
BOUNDARY_CONDITION_UNRESOLVED
RESTRAINT_AXIS_AMBIGUOUS
EMPIRICAL_PROFILE_UNQUALIFIED
COUPLED_STIFFNESS_RANK_DEFICIENT
LOAD_CASE_OWNERSHIP_MISMATCH
```

Do not create a parallel short-code vocabulary such as `TOP`, `TEE`, `LOOP`, or `MOD`.

## 11. Load Calc UI integration

Do not create seven disconnected applications. Extend the existing Load Calc shell with:

```text
Overview
Model / 3D
Restraints
Load Cases
Methods
Results
Evidence
Project Data
Masters
```

### 11.1 Overview

Show dataset/source hash, units, coordinate frame, model/support counts, selected method, profile qualification, authorization state, blockers, and source/effective hashes.

### 11.2 Model / 3D

Reuse the governed SJSON viewport. Add disposable display layers for:

- source geometry;
- source restraints;
- effective restraint overrides;
- vertical reactions;
- guide/line-stop reactions;
- contact state; and
- out-of-domain locations.

The overlay must never mutate canonical topology.

### 11.3 Restraints

Show source and effective values side by side, including stable support/restraint identity, host component, exact attachment, axis, function, gap, stiffness, friction, override reason, and `Geometry changed = No`.

Selection shall use the existing table/viewport event mechanism.

### 11.4 Load Cases

Show explicit effect ownership and warn when compared results do not contain the same effects or active support set.

### 11.5 Methods

Basic mode exposes method, domain, profile, result class, and lock/qualification state. Expert mode permits cloning and editing an unlocked profile, inspecting calibration evidence, and rerunning qualification. A locked profile is read-only.

### 11.6 Results

Keep vertical beam/contact, line-stop/guide, and diagnostics as separate families. Report component signs, active face/state, displacements, stiffness, reactions, uncertainty, equilibrium, residual, conditioning, and blockers.

### 11.7 Evidence

Extend JSON Trace with all source, topology, support, scenario, profile, request, result, and execution-receipt hashes plus formula/method identity.

## 12. BM2 worked example and required disposition

BM2 contains multiple anchors, tees, elbows, and a reconnecting branch/loop. Its authoritative restraint interpretation used during concept development was:

```text
Y is vertical in the CAESAR benchmark frame.

Node 10  : ANC = R + G + LS
Node 40  : +Y rest and X guide
Node 130 : +Z restraint
Node 190 : ANC = R + G + LS
Node 240 : ANC = R + G + LS
```

The earlier independent-axis prototype produced some plausible resultants but incorrect signs in several components. For example, the node-40 reactions were comparatively close, while node 130 and several anchor components had reversed signs. This demonstrates that resultant agreement cannot qualify a coupled piping system.

BM2 shall therefore be a held-out coupled-model benchmark. In restricted scalar/network mode it must return one or more of:

```text
OUTSIDE_QUALIFIED_SCOPE
TOPOLOGY_BRANCH_PROFILE_REQUIRED
TOPOLOGY_LOOP_PROFILE_REQUIRED
```

It shall not publish a scalar best estimate.

## 13. Work-pack plan

### WP0 — Amend concept authority

- identify PR #709 as the mechanics authority;
- remove duplicate vertical mechanics claims;
- establish JSON and coordinate-frame authority;
- align failure codes;
- define result-combination restrictions; and
- integrate the UI plan into Load Calc.

**Gate:** documentation only; no runtime claim.

### WP1 — SJSON adapter and scenario contracts

- add the four exact-schema contracts;
- add normalized-authority adapter;
- preserve source/effective restraint values;
- block ambiguous axes;
- prove geometry hash identity; and
- add deterministic contract tests.

**Gate:** request construction only; runtime remains `NOT_REGISTERED`.

### WP2 — Beam/contact runtime bridge

- authorize `EMPIRICAL_BEAM_CONTACT_V1`;
- select eligible planar route regions;
- map zero-gap one-way vertical rests;
- invoke merged mechanics and action recovery; and
- map results back to stable support/restraint IDs.

**Gate:** unsupported nonplanar/contact cases block; PR #709 tests remain green.

### WP3 — Configuration UI

- Overview, Restraints, Load Cases, and Methods integration;
- explicit Authorize and Calculate actions;
- override journal; and
- profile lock/clone behavior.

### WP4 — Results and SJSON overlays

- result tables and governed overlays;
- active/lifted styling;
- bidirectional selection; and
- stale-result removal.

### WP5 — Restricted line-stop network

- open-chain global compatibility solution;
- one direction;
- strict topology/contact domain; and
- BM2 fail-closed behavior.

### WP6 — Coupled branch/loop model

- three-dimensional junction matrices;
- deterministic local axes;
- rank/mechanism/conditioning checks;
- coupled contact and finite-gap qualification; and
- held-out BM2 validation.

### WP7 — Combined operating-result qualification

- shared weight/thermal/support state;
- authorized OPE vector;
- structural-support handoff; and
- complete evidence export.

## 14. Release gates

The applicable slice shall not be promoted unless:

1. raw SJSON is absent from mechanics-core imports;
2. production code imports no benchmark fixtures;
3. scenario overrides leave canonical geometry byte/semantic-identical;
4. every result identifies its exact method;
5. coordinate and sign conventions are visible;
6. unsupported topology/contact blocks;
7. component signs are reported;
8. global force and moment closure pass where calculations are performed;
9. contact state and active face are reported;
10. result identity binds dataset, support, restraint, scenario, and profile hashes;
11. PR #709 mechanics tests remain green;
12. SJSON rendering and support-selection gates remain green;
13. BM2 scalar/restricted mode blocks; and
14. vertical and line-stop vectors are not combined before qualification.

## 15. Repository disposition

- PR #722 is conditionally acceptable as this integration concept and shall remain documentation-only.
- PR #709 is the merged authoritative mechanics implementation.
- PR #708 is superseded by PR #709 and should be closed to avoid development against the wrong branch.
- The next implementation slice is WP1, followed by the WP2 runtime bridge for the already merged planar mechanics.
