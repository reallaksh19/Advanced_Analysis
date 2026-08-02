# Common Enriched Properties Consumption Concept

**Document status:** Issued for review  
**Programme:** Authoritative engineering enrichment  
**Target application:** `Advanced_Analysis`  
**Related documents:**

- `docs/enrichment-upgrade-concept-report.md`
- `docs/enrichment-preflight-ui-concept.md`
- `docs/enrichment-authority-adoption-plan.md`

**Decision proposed:** Publish one immutable Common Enriched Properties baseline and require every engineering consumer to use that same baseline without re-enrichment or consumer-specific fallback.

---

## 1. Executive decision

The common enriched properties produced through the Engineering Enrichment Preflight Workbench must support three first-class functions:

1. **Empirical load calculation** inside `Advanced_Analysis`.
2. **LFEA delivery** through either enriched stagedJson or a future API transport.
3. **Enriched stagedJson export** for Topology Validator and all downstream processing.

The architectural rule is:

```text
one enrichment run
  -> one reviewed property set
  -> one immutable published baseline
  -> multiple read-only consumer adapters
```

Consumers must not independently:

- rematch line-list rows;
- rematch piping-class rows;
- infer process parameters;
- derive wall thickness from different policies;
- assign material or density defaults;
- reinterpret service consensus;
- silently replace missing values with zero;
- create local overrides that are absent from the published baseline.

The published baseline is the sole source of truth for **enriched engineering properties** used by these consumers.

This does not make the enrichment package the authority for every model concern. Authority remains partitioned:

| Concern | Governing authority |
|---|---|
| Source geometry, coordinates, hierarchy and topology evidence | Source stagedJson/shared model |
| Enriched process, specification, material, insulation and weight properties | Published Common Enriched Properties baseline |
| Project engineering approval and source evidence | Project Data and designated engineering authority |
| LFEA applicability, precedence, candidate binding and solver authorization | Existing LFEA Project Authority Index and release governance |
| Consumer calculation result | The relevant empirical, LFEA or downstream calculation artifact |

The enrichment layer therefore becomes the single read model for enriched attributes, but it does not replace geometry authority, engineering approval authority or solver authority.

---

## 2. Target architecture

```text
Source stagedJson / shared model
Line-list master
Piping-class master
Material map
Density and insulation registers
Component-weight master
Approved derivation policies
              |
              v
Engineering Enrichment Kernel
              |
              v
Preflight review and governed decisions
              |
              v
Common Enriched Properties Candidate
              |
        external approval / publication gate
              |
              v
Published Enrichment Baseline
       |              |                    |
       v              v                    v
Empirical        LFEA adapter       Enriched stagedJson
load adapter     stagedJson/API     export adapter
       |              |                    |
       v              v                    v
Empirical        LFEA intake        Topology Validator
load cases       placeholder        and downstream tools
```

There is one property baseline and three delivery adapters. An adapter may transform shape, naming or transport encoding, but it may not change the engineering meaning or value.

---

## 3. Proposed contract family

The programme should introduce the following contracts during implementation planning.

```text
CommonEnrichedPropertiesField.v1
CommonEnrichedTargetRecord.v1
CommonEnrichedPropertiesCandidate.v1
CommonEnrichedPropertiesBaseline.v1
CommonEnrichedPropertiesManifest.v1
CommonEnrichedConsumerReadiness.v1
CommonEnrichedConsumerHandoff.v1
EnrichedStagedJsonExport.v1
```

Names may be amended during contract review, but the separation of responsibilities should remain.

### 3.1 `CommonEnrichedPropertiesField.v1`

Represents one governed property outcome.

```json
{
  "field": "process.designPressureKpaG",
  "value": 1200,
  "unit": "kPa(g)",
  "status": "RESOLVED_EXACT",
  "sourceKind": "LINE_LIST",
  "sourceKey": "lineList",
  "sourceHash": "<sha256>",
  "locator": "LineList!316:Pressure Max kPa(g)",
  "matchMethod": "EXACT_LINE_KEY",
  "confidence": 1,
  "policyId": null,
  "policyHash": null,
  "reviewEventId": null,
  "approved": true,
  "diagnostics": []
}
```

A field record carries the value and its engineering context. Consumers must not receive a bare number where provenance and status are required.

### 3.2 `CommonEnrichedTargetRecord.v1`

Represents one stable line-level or component-level enrichment target.

```json
{
  "targetId": "<stable-id>",
  "targetKind": "LINE",
  "modelPath": "/SITE/ZONE/BRANCH",
  "lineIdentity": {},
  "process": {},
  "pipingSpecification": {},
  "material": {},
  "contents": {},
  "insulation": {},
  "weights": {},
  "consumerApplicability": {},
  "statusSummary": {},
  "semanticHash": "<sha256>"
}
```

The target ID is derived from stable model identity and source provenance, not table row number or current display order.

### 3.3 `CommonEnrichedPropertiesCandidate.v1`

Contains exact outcomes, deterministic outcomes, proposals, blockers and review events for a run. It is not automatically consumable by calculations.

Required lifecycle state:

```text
CANDIDATE_UNAPPROVED
```

### 3.4 `CommonEnrichedPropertiesBaseline.v1`

The immutable published source used by consumers.

Required characteristics:

- exact source model hash;
- exact master source hashes;
- exact policy hashes;
- Project Data profile semantic hash;
- review ledger hash;
- target count;
- field outcome counts;
- consumer readiness declarations;
- canonical semantic hash;
- immutable baseline ID;
- publication timestamp and publisher identity;
- supersedes relationship where applicable.

Required lifecycle state:

```text
PUBLISHED_ENRICHMENT_BASELINE
```

Publishing creates a new artifact. It never mutates a previously published baseline.

### 3.5 `CommonEnrichedPropertiesManifest.v1`

A compact manifest used to verify transport and downstream consistency.

```json
{
  "baselineId": "ENR-1885S-0007",
  "schema": "CommonEnrichedPropertiesBaseline.v1",
  "sourceModelHash": "<sha256>",
  "projectDataHash": "<sha256>",
  "recordCount": 10000,
  "baselineSemanticHash": "<sha256>",
  "consumerProfiles": {
    "EMPIRICAL_LOADS": "READY",
    "LFEA": "BLOCKED_NOT_CONFIGURED",
    "ENRICHED_STAGED_JSON_EXPORT": "READY"
  }
}
```

### 3.6 `CommonEnrichedConsumerReadiness.v1`

Readiness is consumer-specific. The same baseline may be ready for one consumer and blocked for another because required fields differ.

```json
{
  "consumer": "EMPIRICAL_LOADS",
  "status": "READY",
  "requiredFieldProfile": "EmpiricalLoadInputProfile.v1",
  "requiredFieldProfileHash": "<sha256>",
  "eligibleTargetCount": 9800,
  "blockedTargetCount": 200,
  "blockers": []
}
```

### 3.7 `CommonEnrichedConsumerHandoff.v1`

Records exactly what baseline was delivered to a consumer and through which adapter.

```json
{
  "consumer": "LFEA",
  "transport": "STAGED_JSON",
  "baselineId": "ENR-1885S-0007",
  "baselineSemanticHash": "<sha256>",
  "adapterVersion": "LfeaEnrichmentAdapter.v1",
  "adapterHash": "<sha256>",
  "outputHash": "<sha256>",
  "authorityStatus": "NOT_AUTHORIZED_BY_HANDOFF"
}
```

The handoff proves transport identity. It does not create LFEA approval or solver authorization.

---

## 4. Canonical property groups

The common baseline should carry the full enriched property set once, using canonical names and units.

### 4.1 Identity

```text
line.targetId
line.modelPath
line.branchName
line.lineKey
line.lineNumber
line.service
line.fromReference
line.toReference
line.sourceIdentityHash
```

### 4.2 Process conditions

```text
process.designPressureKpaG
process.hydroTestPressureKpaG
process.designTemperatureC
process.operatingTemperatureC
process.minimumTemperatureC
process.phase
process.testMedium
process.operatingCaseId
process.hydroCaseId
```

The current `P1`, `T1`, `T2` and `T3` labels may remain as display aliases, but the canonical contract should use semantic field names.

### 4.3 Piping specification and geometry-related attributes

```text
piping.pipingClass
piping.ratingClass
piping.nominalBoreMm
piping.nominalBoreIn
piping.outsideDiameterMm
piping.schedule
piping.wallThicknessMm
piping.corrosionAllowanceMm
piping.insideDiameterMm
piping.sectionAreaM2
```

Derived fields such as inside diameter and section area must identify their input fields and derivation policy.

### 4.4 Material

```text
material.description
material.code
material.category
material.densityKgM3
material.elasticModulus
material.poissonRatio
material.thermalExpansion
material.allowableOrReferenceProperties
```

Mechanical properties may be consumer-specific in applicability but should share the same canonical field records where populated.

### 4.5 Fluid and contents

```text
contents.operatingDensityKgM3
contents.hydroDensityKgM3
contents.gasDensityKgM3
contents.liquidDensityKgM3
contents.mixedDensityKgM3
contents.selectedOperatingDensityBasis
```

### 4.6 Insulation

```text
insulation.code
insulation.state
insulation.thicknessMm
insulation.densityKgM3
insulation.massKgPerM
```

A missing insulation code must not silently become zero insulation. `NOT_APPLICABLE` and explicit approved zero are distinct outcomes.

### 4.7 Weight

```text
weight.pipeMetalKgPerM
weight.contentsOperatingKgPerM
weight.contentsHydroKgPerM
weight.insulationKgPerM
weight.totalEmptyKgPerM
weight.totalOperatingKgPerM
weight.totalHydroKgPerM
weight.componentDryKg
weight.componentOperatingKg
weight.componentHydroKg
```

Every calculated weight records its exact dimensional, density and policy inputs.

### 4.8 Component-level attributes

```text
component.componentType
component.catalogKey
component.ratingClass
component.boreMm
component.lengthMm
component.dryWeightKg
component.contentsWeightKg
component.insulationWeightKg
component.totalOperatingWeightKg
component.totalHydroWeightKg
component.weightMatchMethod
```

Component records are children of the line-level record or referenced through stable component target IDs.

---

## 5. Property status model

Every field retains the programme status vocabulary:

```text
RESOLVED_EXACT
RESOLVED_DERIVED
PROPOSED_REVIEW
BLOCKED_MISSING
BLOCKED_AMBIGUOUS
BLOCKED_CONFLICT
BLOCKED_STALE_SOURCE
NOT_APPLICABLE
```

Published baselines may include blockers for transparency, but consumer readiness must fail closed where a blocked field is required by that consumer.

Consumer adapters may not convert:

```text
BLOCKED_MISSING -> 0
BLOCKED_AMBIGUOUS -> first candidate
BLOCKED_CONFLICT -> preferred local source
PROPOSED_REVIEW -> accepted value
```

A proposal becomes consumable only through a governed review decision and publication of a new baseline.

---

## 6. Lifecycle and publication

### 6.1 Lifecycle

```text
ENRICHMENT_RUN_COMPLETE
  -> CANDIDATE_UNAPPROVED
  -> REVIEW_IN_PROGRESS
  -> REVIEWED_CANDIDATE
  -> PUBLICATION_VALIDATION
  -> PUBLISHED_ENRICHMENT_BASELINE
  -> SUPERSEDED
```

### 6.2 Publication gate

Publication requires:

- canonical schema validation;
- exact source hashes;
- no unresolved internal contract corruption;
- all review events bound to target IDs and source hashes;
- Project Data references validated against active sources;
- consumer readiness calculated;
- canonical semantic hash generated;
- prior baseline comparison generated;
- immutable package created.

Publication does not mean every consumer is ready. It means the baseline is complete and internally valid. Consumer-specific readiness remains explicit.

### 6.3 Invalidation

A published baseline becomes stale for a new run when any governing input changes:

- source stagedJson hash;
- line-list hash;
- piping-class hash;
- material-map hash;
- density or insulation register hash;
- component-weight master hash;
- derivation-policy hash;
- manual mapping set hash;
- Project Data profile hash.

The old baseline remains immutable and auditable. A new baseline must be produced.

---

## 7. Function 1 — Empirical load calculation

### 7.1 Consumption rule

The empirical load engine must consume only:

```text
CommonEnrichedPropertiesBaseline.v1
  + source geometry/topology contract
  + approved empirical load policy
```

It must not query raw line-list or piping-class masters directly after the baseline is published.

### 7.2 Empirical adapter

Proposed adapter:

```text
CommonEnrichedPropertiesBaseline.v1
  -> EmpiricalLoadInputProjection.v1
```

The adapter performs structural projection only:

- selects fields required by the empirical calculation;
- joins line and component records to exact geometry target IDs;
- converts canonical units only through declared conversions;
- calculates readiness and blockers;
- does not resolve or replace enrichment values.

### 7.3 Required field profile

An initial empirical profile should include, where applicable:

```text
line identity
geometry target identity
outside diameter
wall thickness
material density
operating fluid density
hydro fluid density
insulation thickness
insulation density
pipe metal weight or exact inputs to calculate it
component weights
active load-case applicability
```

Gravity, load factor, support capabilities, route partitions and equilibrium policies remain Project Data or calculation-policy inputs, not enrichment fields unless explicitly incorporated later.

### 7.4 Readiness

Each line or component receives:

```text
READY_EMPIRICAL
BLOCKED_EMPIRICAL_MISSING_FIELD
BLOCKED_EMPIRICAL_STALE_BASELINE
BLOCKED_EMPIRICAL_TARGET_JOIN
BLOCKED_EMPIRICAL_POLICY
```

The empirical engine must not start for blocked targets unless the calculation explicitly supports partial-scope execution and records excluded targets.

### 7.5 Output provenance

Every empirical calculation result records:

```text
baselineId
baselineSemanticHash
empiricalInputProjectionHash
geometryContractHash
calculationPolicyHash
```

This makes empirical results reproducible from the exact enrichment baseline.

---

## 8. Function 2 — LFEA delivery

### 8.1 Current status

The LFEA interface is not yet configured. The concept must therefore reserve two equivalent transports without selecting or implementing either one in this planning PR:

1. enriched stagedJson transport;
2. API transport.

The transport is a placeholder until the LFEA owner approves the interface contract.

### 8.2 Non-negotiable boundary

The enrichment layer may prepare a handoff, but it does not decide:

- LFEA field applicability;
- field precedence inside LFEA;
- candidate binding;
- derivation acceptance;
- solver authorization;
- release qualification.

Those remain governed by the existing LFEA Project Authority Index and release process.

Phase 6I remains independent. It must not wait for, import, invoke or rely on this programme.

### 8.3 Transport A — enriched stagedJson

```text
Published Enrichment Baseline
  -> EnrichedStagedJsonExport.v1
  -> LFEA intake adapter
```

Advantages:

- portable file artifact;
- easy archival and offline use;
- same package available to Topology Validator;
- exact content hash;
- no runtime service dependency.

Constraints:

- potentially large files;
- whole-artifact transfer;
- explicit version compatibility required;
- duplicate data if the baseline is also stored separately.

### 8.4 Transport B — API placeholder

Proposed conceptual API surface:

```text
GET /api/enrichment/v1/baselines/{baselineId}/manifest
GET /api/enrichment/v1/baselines/{baselineId}/records
GET /api/enrichment/v1/baselines/{baselineId}/records/{targetId}
GET /api/enrichment/v1/baselines/{baselineId}/consumer-readiness/LFEA
POST /api/enrichment/v1/handoffs/lfea
```

This is a placeholder only. Authentication, storage, paging, deployment, ownership and operational support are not configured.

The API response must have the same canonical semantic content as the file transport. Transport equivalence must be testable by hash over canonical records.

### 8.5 LFEA adapter responsibilities

The future LFEA adapter may:

- select approved applicable fields;
- convert canonical names to LFEA contract names;
- convert units using an approved mapping;
- package immutable provenance;
- report unsupported or blocked fields;
- create shadow impact comparisons.

It may not:

- rematch masters;
- calculate alternate properties;
- accept proposals;
- overwrite LFEA Project Authority Index fields;
- authorize a solver candidate.

### 8.6 LFEA readiness placeholder

Until configured:

```text
consumer = LFEA
status = BLOCKED_NOT_CONFIGURED
transport = UNSELECTED
applicabilityProfile = NOT_APPROVED
```

Once configured, readiness must bind exact hashes for:

- baseline;
- LFEA applicability profile;
- field mapping;
- unit mapping;
- adapter version;
- LFEA target contract.

---

## 9. Function 3 — enriched stagedJson export

### 9.1 Purpose

The export is the portable representation of the published baseline joined to the source stagedJson hierarchy.

It is used by:

- Topology Validator;
- downstream converters;
- model review utilities;
- future LFEA file transport;
- audit and archival processes.

### 9.2 Sole-truth rule

After publication, downstream tools must use the exported common properties and must not independently enrich the same fields.

A downstream tool may add its own separate diagnostics or calculation outputs, but it must not replace the canonical enriched value in place.

### 9.3 Geometry preservation

Export must preserve source geometry and hierarchy:

```text
APOS
LPOS
POS
CENTER
source branch order where contractually significant
source root shape
source IDs and references
```

The export adapter adds or replaces only the governed enrichment namespace.

### 9.4 Proposed stagedJson structure

```json
{
  "type": "BRANCH",
  "name": "/ASIM-...",
  "attributes": {},
  "children": [],
  "engineeringEnrichment": {
    "schema": "CommonEnrichedTargetRecord.v1",
    "baselineId": "ENR-1885S-0007",
    "baselineSemanticHash": "<sha256>",
    "targetId": "<stable-id>",
    "properties": {},
    "statusSummary": {},
    "recordSemanticHash": "<sha256>"
  }
}
```

At the root or envelope level:

```json
{
  "engineeringEnrichmentManifest": {
    "schema": "CommonEnrichedPropertiesManifest.v1",
    "baselineId": "ENR-1885S-0007",
    "baselineSemanticHash": "<sha256>",
    "sourceModelHash": "<sha256>",
    "exportAdapterVersion": "EnrichedStagedJsonExporter.v1",
    "exportHash": "<sha256>"
  }
}
```

The exact root-shape strategy must support both single-root-object and branch-array source shapes.

### 9.5 Write rules

The exporter must:

- preserve original source attributes;
- write canonical enriched properties under one namespaced member;
- include field statuses and provenance or references to compact provenance indexes;
- include record and baseline hashes;
- include blockers rather than invented values;
- fail if target identity cannot be joined exactly;
- fail if geometry changes;
- produce an export audit.

### 9.6 No duplicate truth fields

The programme must choose one canonical namespace. It should not write the same property into several uncontrolled locations such as:

```text
attributes.WT
enrichedAttributes.wallThickness
engineering.wall
processData.wallThickness
```

Compatibility aliases may be generated only through explicit versioned adapters. They are derived views and not independent authorities.

### 9.7 Downstream validation rule

Topology Validator and other downstream tools should verify:

```text
schema supported
baseline hash present
source model hash compatible
record hash valid
target ID resolvable
required fields present or explicitly blocked
no duplicate conflicting enrichment namespace
```

If a downstream tool edits topology, the output must retain the baseline ID and record which target identities were preserved, changed, split, merged or retired. It must not silently carry enrichment to an incompatible new identity.

---

## 10. Topology Validator relationship

### 10.1 Proposed role

Topology Validator consumes enriched stagedJson as an input containing:

- source geometry and hierarchy;
- canonical enriched properties;
- property provenance;
- enrichment baseline identity.

It may produce:

- connectivity diagnostics;
- overlap diagnostics;
- route partitions;
- support-site models;
- topology repair proposals;
- topology output lineage.

It must not become another enrichment engine for governed fields.

### 10.2 Topology changes

When topology modifications create new model identities, one of two outcomes is required:

1. enrichment records remain valid because stable source identity is preserved; or
2. the changed model requires a new enrichment run and baseline.

The validator must not copy properties from an old target to a materially different target without an explicit transformation contract.

### 10.3 Downstream lineage

Every downstream artifact should carry:

```text
sourceEnrichmentBaselineId
sourceEnrichmentBaselineHash
sourceModelHash
topologyOperationHash
outputModelHash
```

This gives a continuous chain from sources to enrichment to topology to calculations.

---

## 11. Preflight UI changes

The existing UI concept should add a sixth concern: consumer publication and readiness.

Recommended workbench modes remain:

```text
Sources
Coverage
Exceptions
Review
Candidate
```

Within `Candidate`, add three consumer readiness panels:

```text
Empirical Loads
LFEA Handoff
Enriched stagedJson Export
```

### 11.1 Empirical card

Shows:

- ready target count;
- blocked target count;
- required field profile;
- load cases available;
- baseline/hash to be consumed;
- action: `Open Empirical Load Calculation`.

The action is enabled only for a published baseline with compatible readiness.

### 11.2 LFEA card

Initial state:

```text
NOT CONFIGURED
Transport: placeholder
Applicability profile: pending LFEA owner
```

Future actions:

```text
Prepare stagedJson handoff
Prepare API handoff
Compare LFEA shadow impact
```

None of these actions imply solver authorization.

### 11.3 Export card

Shows:

- baseline ID;
- source model hash;
- target join coverage;
- geometry preservation result;
- export schema version;
- expected output size;
- action: `Export Enriched stagedJson`.

### 11.4 Publish once, use many

The UI must not create three separate property candidates. It publishes one baseline and then prepares consumer-specific projections or exports from it.

```text
Publish Baseline
  -> Run Empirical
  -> Prepare LFEA Handoff
  -> Export Enriched stagedJson
```

### 11.5 Source changes

When source hashes change, all consumer cards must show the baseline as stale. Users must create and publish a new baseline before new calculations or exports.

---

## 12. Consumer adapter invariants

Every adapter must satisfy these invariants.

### 12.1 Read-only input

The published baseline is immutable.

### 12.2 No fallback

Adapters cannot add missing engineering values.

### 12.3 No approval

Adapters cannot approve proposals or Project Data values.

### 12.4 Canonical value preservation

Where no unit conversion is required:

```text
consumer value == baseline value
```

Where unit conversion is required:

```text
consumer value == approved deterministic conversion(baseline value)
```

### 12.5 Provenance preservation

Every output value remains traceable to baseline field identity.

### 12.6 Hash binding

Every consumer artifact binds the exact baseline semantic hash.

### 12.7 Fail closed

Unsupported schema, stale sources, missing target joins or required blocked fields cause explicit consumer blockers.

### 12.8 No write-back

Consumer calculations and validators cannot modify the published baseline. Corrections return to the Preflight Workbench and produce a new candidate/baseline.

---

## 13. Storage and transport model

The implementation plan should support an in-memory baseline initially, followed by explicit immutable artifact storage when approved.

Potential artifact set:

```text
enrichment-manifest.json
enrichment-records.json or chunked records
enrichment-review-ledger.json
enrichment-source-index.json
enrichment-consumer-readiness.json
enriched-stagedjson.json
```

Large datasets may require chunked records or indexed storage. Chunking must preserve a canonical whole-baseline semantic hash.

The choice between file, browser storage, repository artifact store or service storage is not made in this concept. Silent localStorage persistence is not acceptable as the sole engineering record.

---

## 14. Proposed phase additions

The programme phases should be refined as follows.

### Phase 1 — Contract foundation

Add the common property field, target, candidate, baseline, manifest and readiness contracts.

### Phases 2–5 — Property population

All resolution kernels write the same canonical field contract rather than consumer-specific objects.

### Phase 6 — Preflight review

The UI reviews canonical field outcomes and creates immutable review events.

### Phase 7 — Publication and Project Data alignment

Create the immutable published baseline, validate Project Data references and calculate consumer readiness.

### Phase 8A — Empirical adapter

Adopt the baseline for empirical load inputs and remove direct master lookup from the calculation path.

### Phase 8B — Enriched stagedJson export

Create the geometry-preserving exporter and downstream validation contract.

### Phase 8C — LFEA placeholder and interface decision

Create only the transport-neutral handoff contract and blocked-not-configured status. Implementation follows LFEA owner approval in a separate programme increment.

### Phase 9 — Consumer parity and rollout

Demonstrate that all consumers receive identical canonical values and no consumer fallback remains.

---

## 15. Proposed PR sequence additions

```text
Consumer PR 1  Common property and baseline contracts
Consumer PR 2  Publication manifest and consumer readiness
Consumer PR 3  Empirical load projection adapter
Consumer PR 4  Enriched stagedJson exporter and geometry guard
Consumer PR 5  Topology Validator intake/lineage contract
Consumer PR 6  LFEA transport-neutral placeholder contract
Consumer PR 7  Consumer parity, stale-source and no-fallback qualification
```

The LFEA implementation PR is intentionally absent until its interface is configured and approved.

---

## 16. Mandatory qualification

### 16.1 Canonical parity

For every target and field consumed by more than one path:

```text
empirical canonical value
== LFEA handoff canonical value
== enriched stagedJson canonical value
```

Unit-transformed values must round-trip through approved conversion tolerances.

### 16.2 No independent lookup

Tests must prove empirical, LFEA and export adapters do not import or invoke:

- line-list resolvers;
- piping-class resolvers;
- material fuzzy resolvers;
- service fallback resolvers;
- generic default tables.

### 16.3 Geometry guard

Enriched stagedJson export must not change source geometry.

### 16.4 Source staleness

Changing any source hash invalidates consumer readiness for the prior baseline.

### 16.5 Target identity

Missing, duplicate or incompatible target joins block export/consumption.

### 16.6 Proposal isolation

`PROPOSED_REVIEW` fields cannot be consumed as accepted values.

### 16.7 Blocker preservation

Blocked fields remain blocked across every adapter.

### 16.8 Hash verification

Tampering with a field, record, manifest or export must fail canonical verification.

### 16.9 Downstream non-re-enrichment

Topology Validator tests must confirm it does not replace canonical enriched properties.

### 16.10 LFEA boundary

The placeholder handoff must state:

```text
approval = external
applicability = external
binding = external
solverAuthorization = external
```

---

## 17. Migration strategy

### Stage 1 — Shadow publication

Produce the common baseline beside current paths and compare values.

### Stage 2 — Empirical shadow consumption

Run empirical projection from the baseline without changing production results.

### Stage 3 — Enriched stagedJson shadow export

Compare exported fields with current stagedJson enrichment and downstream expectations.

### Stage 4 — Empirical cutover

After qualification, empirical calculation reads only the published baseline.

### Stage 5 — Downstream cutover

Topology Validator and downstream tools consume the governed namespace and reject absent/stale baseline metadata where required.

### Stage 6 — LFEA interface implementation

Begins only after the LFEA interface owner selects stagedJson, API or both and approves field applicability.

### Stage 7 — Legacy resolver isolation

Remove or isolate consumer-side enrichment and fallback code.

---

## 18. Review decisions requested

Reviewers should explicitly decide:

1. Confirm one Common Enriched Properties baseline for all three functions.
2. Confirm that it is the sole truth for enriched engineering properties after publication.
3. Confirm that source stagedJson remains geometry/topology evidence authority.
4. Confirm that Project Data and engineering governance remain approval authority.
5. Confirm that LFEA authority and release remain external to the enrichment baseline.
6. Confirm canonical property groups and naming direction.
7. Confirm publication lifecycle and immutable baseline IDs.
8. Confirm consumer-specific readiness profiles.
9. Confirm empirical calculation must stop direct master lookups after cutover.
10. Confirm enriched stagedJson as the governed portable downstream artifact.
11. Confirm one namespaced enrichment member rather than duplicate property locations.
12. Confirm Topology Validator may add topology diagnostics but may not re-enrich governed properties.
13. Confirm LFEA supports a transport-neutral placeholder until configured.
14. Confirm file/API transports must be semantically equivalent.
15. Confirm no consumer write-back to a published baseline.
16. Confirm any correction requires a new enrichment candidate and baseline.
17. Confirm source hash changes invalidate all consumer readiness.
18. Confirm consumer parity and no-fallback tests are mandatory rollout gates.

---

## 19. Recommended disposition

Adopt the following architecture statement:

> The Common Enriched Properties Baseline is the immutable, provenance-bound and published source of truth for enriched process, piping specification, material, contents, insulation and weight properties. Empirical load calculation, LFEA handoff and enriched stagedJson export consume the same baseline through read-only adapters. Consumers may select, transform units and repackage approved fields, but they may not rematch masters, introduce fallbacks, approve proposals or alter canonical engineering meaning. Source stagedJson remains geometry/topology authority, Project Data remains engineering approval authority, and LFEA adoption remains governed by its Project Authority Index and release process.

Approval of this concept authorizes common contract and publication planning. It does not authorize engineering values, LFEA candidate binding, solver use, production persistence or release qualification.
