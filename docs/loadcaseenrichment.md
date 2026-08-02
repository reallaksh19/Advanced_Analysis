# Load-Case Enrichment / LFEA Phase 6I Boundary and Intermediate Handover

## 1. Purpose

This document is the intermediate technical handover for the load-case engineering-enrichment work represented by PR #371 and its relationship to the independently progressing LFEA Phase 6I candidate.

It records:

- the non-dependency boundary between PR #371 and LFEA Phase 6I;
- the authority ownership of overlapping engineering fields;
- the current PR #371 conflict assessment;
- the immediate containment and remediation work required before further PR #371 development;
- the remaining PR #371 shadow-evidence activities;
- the independent Phase 6I completion activities;
- the later, separately governed process for adopting any PR #371 proposal into a new immutable LFEA candidate;
- the required hashes, artifacts, validation evidence, change-control rules, and exit criteria for each phase.

This document is a coordination and handover record. It does not itself approve engineering values, alter the frozen LFEA candidate, create calculation authority, or qualify a release.

## 2. Observed repository state

State inspected before publication of this handover:

```text
Repository:       reallaksh19/Advanced_Analysis
PR:               #371
PR branch:        agent/load-calc-enrichment-pr1-foundation
Observed main:    71226ef2560ce7f6151eb8165961a4b8cfbfdeb0
Observed PR head: 6bd23eb692202e55143319e416d96012290ceed4
PR state:         OPEN / DRAFT / MERGEABLE
Commits in PR:    1
Changed files:    27
Additions:        7,363
Deletions:        0
```

The observed PR contains a shadow evidence foundation plus a later acceptance/binding slice. The acceptance/binding slice conflicts with the boundary defined below and must be removed from PR #371 or relocated to a separately owned future integration package before PR #371 can continue.

## 3. Governing boundary statement

> Engineering-enrichment and empirical load-calculation outputs, including PR #371 shadow proposals, are not consumed by this Phase 6I candidate and do not form part of its calculation authority.

LFEA Phase 6I proceeds independently using the existing completed LFEA implementation, frozen candidate, and currently defined project-input authority.

PR #371 is not a prerequisite, upstream dependency, release gate, expected-value source, or evidence source for Phase 6I.

## 4. Boundary contract

### 4.1 No Phase 6I dependency

Phase 6I must not:

- wait for PR #371;
- import PR #371 modules;
- invoke PR #371 builders or validators;
- consume PR #371 portable bundles, proposals, candidate projections, numerical-impact reports, review packets, or lineage artifacts;
- use PR #371 hashes as Phase 6I project-input authority;
- list PR #371 as a required merge, qualification prerequisite, or release dependency.

PR #371 must not:

- call Phase 6I workflows or release-gate scripts;
- require the Phase 6I candidate to exist before generating shadow evidence;
- modify the frozen Phase 6I candidate;
- modify Phase 6I authority artifacts;
- claim that Phase 6I has accepted, reviewed, approved, or consumed any PR #371 output.

### 4.2 Shadow-only authority for PR #371

The following PR #371 artifacts may exist only as immutable shadow evidence:

- master-data snapshots;
- adapter policies;
- exact selectors;
- enrichment proposals;
- exact proposal resolutions;
- candidate-sidecar projections;
- structural-impact reports;
- injected shadow calculation descriptors, requests, and results;
- raw numerical-impact reports;
- review packets that create no decision;
- identity-only staleness reports;
- repeated-shadow reproducibility receipts;
- canonical portable bundles;
- exact before/after bundle comparisons;
- evidence-lineage graphs and lineage-impact reports.

These artifacts must not be represented as:

- approved project data;
- LFEA inputs;
- current values;
- accepted baselines;
- accepted engineering assumptions;
- production calculation authority;
- sealed candidate values;
- production result acceptance;
- Phase 6I qualification evidence;
- Phase 6I release evidence.

### 4.3 Overlapping fields remain LFEA-owned for the frozen candidate

For the current Phase 6I candidate, the following values remain governed exclusively by the existing LFEA Project Authority Index and its source-bound records:

- design pressure;
- operating pressure;
- design temperature;
- operating temperature;
- minimum temperature;
- fluid density;
- insulation material and density;
- insulation thickness and distributed weight;
- nominal bore;
- outside diameter;
- schedule;
- pressure class or rating;
- nominal wall thickness;
- corrosion allowance;
- material grade and specification;
- elastic modulus and other material properties;
- component weights;
- distributed pipe, fluid, insulation, lining, and content weights;
- load cases and combinations;
- project parameters and applicability assumptions.

A matching or conflicting PR #371 value has no effect on the current candidate. Agreement is not approval. Disagreement does not invalidate the frozen candidate unless the LFEA owner initiates a separate governed change.

### 4.4 No retrofit into the frozen candidate

PR #371 must not modify, enrich, reinterpret, overwrite, or backfill:

- the Phase 6I candidate input set;
- Project Authority Index entries;
- project parameters;
- pipe-section authority;
- material authority;
- corrosion assumptions;
- load authority;
- candidate identity hashes;
- qualification evidence;
- certification evidence;
- independent-review evidence.

Future adoption of a PR #371 value requires all of the following:

1. a released LFEA baseline;
2. field-level comparison against that baseline;
3. engineering approval outside PR #371;
4. exact proposal, source, and comparison hashes;
5. an approved precedence and derivation policy;
6. a new immutable LFEA candidate identity;
7. regenerated affected qualification evidence;
8. regenerated affected release evidence;
9. independent review of the new candidate.

### 4.5 No duplicated LFEA implementation

PR #371 may invoke injected shadow adapters for empirical or enrichment-effect analysis, but it must not create or own:

- a parallel LFEA solver;
- an alternative pipe-section authority implementation;
- an alternative Project Authority Index;
- an LFEA release gate;
- an alternative production calculation route;
- an alternative candidate certification mechanism;
- a replacement for LFEA applicability, derivation, or project-approval policy.

### 4.6 No circular evidence

PR #371 must not use Phase 6I outputs as production-derived expected values to establish the correctness, acceptability, or approval of PR #371 proposals.

Phase 6I must not use agreement with PR #371 shadow outputs as proof that the Phase 6I candidate is correct, approved, or qualified.

Permitted comparison after release is diagnostic and change-planning evidence only. It must be directionally bound to a released baseline and must not be used as self-validating expected-value evidence.

### 4.7 Shared-contract change control

Before changing any contract used by LFEA, the PR #371 owner must notify the Phase 6I owner and perform an impact assessment. Controlled shared contracts include:

- shared-model schemas;
- field identifiers;
- selector kinds and selector semantics;
- canonical units and conversion rules;
- authority precedence;
- semantic hashing and canonical serialization;
- source-reference formats;
- adapter contracts used by LFEA;
- topology identities;
- project and candidate identity fields.

No shared-contract change may be merged merely to simplify a future PR #371 field family.

### 4.8 Future interface

The allowed future handoff from PR #371 is limited to immutable, provenance-bound proposal and shadow-impact evidence.

The future interface may contain:

- exact field identifier;
- exact selector and resolved target;
- proposed value and canonical unit;
- source file, sheet, row, and source-byte identity where available;
- snapshot hash;
- source-row hash;
- proposal hash;
- candidate-projection hash;
- structural-impact hash;
- raw numerical-impact hash;
- portable-bundle hash;
- comparison hash against a released LFEA baseline representation;
- limitations and blockers.

The interface must not contain or imply PR #371-owned:

- project approval;
- LFEA candidate binding;
- LFEA applicability;
- LFEA derivation policy;
- LFEA solver authorization;
- release qualification;
- currentness;
- seal authority.

## 5. Current PR #371 conflict assessment

### 5.1 Confirmed conflict: acceptance and binding authority

The following current PR #371 files and exports conflict with Sections 4.2, 4.4, and 4.8:

```text
src/workspace/engineering-enrichment/acceptance.js
tests/engineering-enrichment-acceptance.test.mjs
src/workspace/engineering-enrichment/index.js acceptance exports
```

The conflict is technical, not merely descriptive.

`acceptance.js` currently defines:

```text
EngineeringEnrichmentAcceptanceDecision.v1
EngineeringEnrichmentAcceptedBindingSet.v1
```

It creates fields and states including:

```text
action                  = ACCEPT_EXACT_MASTER_CANDIDATES
scope                   = FIRST_CUT_COMPONENT_WEIGHT_BINDINGS_ONLY
reviewDecisionCreated   = true
approvalGranted         = true
bindingCreated          = true
status                  = AUTHORIZED_FOR_FIRST_CUT_PREFLIGHT
authorityLevel          = AUTHORIZED_MASTER
```

This moves PR #371 beyond an immutable proposal/evidence interface and into project approval and candidate binding. The Phase 6I boundary explicitly assigns those responsibilities outside PR #371.

### 5.2 Confirmed conflict: PR metadata and planned next slice

The current PR title and description also conflict with the boundary because they describe PR #371 as an acceptance and first-cut binding foundation and plan workbench ingestion, persistence, and sealed calculation integration.

The conflicting metadata claims include:

- explicit approval contract created;
- first-cut binding contract created;
- selected proposals converted to `AUTHORIZED_MASTER`;
- future workbench ingestion of accepted binding sets;
- persistence of accepted sets;
- sealed calculation integration.

PR metadata must be corrected when the conflicting implementation is removed or relocated.

### 5.3 Components currently consistent with the boundary

Subject to exact-head review, the following PR #371 areas are consistent with the boundary because they remain isolated, immutable, and shadow-only:

```text
master-snapshot.js
selectors.js
master-adapters.js
resolution.js
resolution-validation.js
structural-authority.js
candidate-projection.js
structural-impact.js
numerical-impact.js
review-package.js
portable-bundle.js
portable-bundle-validation.js
bundle-comparison.js
bundle-comparison-validation.js
evidence-lineage.js
```

Their allowed role is proposal generation, shadow projection, structural non-change evidence, raw numerical impact, reproducibility, canonical transport, exact comparison, and lineage inspection.

### 5.4 Potential future conflict areas requiring owner review

The following are not confirmed current conflicts but require explicit Phase 6I owner review before implementation:

- adding production controller or store integration;
- writing PR #371 values into Project Data;
- feeding PR #371 values into the existing first-cut or LFEA calculation route;
- adding acceptance controls to the UI;
- adding a PR #371-owned persistence authority for approved values;
- adding baseline thresholds or acceptability judgments derived from Phase 6I;
- changing `componentWeightKg`, selector semantics, units, or precedence in shared contracts;
- adding an LFEA adapter that consumes PR #371 decisions rather than externally approved authority records.

## 6. Immediate disposition

PR #371 is placed in boundary-remediation hold.

No further production integration, approval, binding, persistence, seal, or calculation-routing development should proceed until Phase 0 is complete.

The existing Phase 6I program continues independently and is not blocked by this hold.

# Phased pending activities

## Phase 0 — Boundary containment and PR #371 remediation

### Objective

Restore PR #371 to a strictly shadow-only package and eliminate statements or APIs that create project approval or candidate binding.

### Required activities

1. Remove or relocate the conflicting implementation:

   ```text
   src/workspace/engineering-enrichment/acceptance.js
   tests/engineering-enrichment-acceptance.test.mjs
   ```

2. Remove acceptance exports from:

   ```text
   src/workspace/engineering-enrichment/index.js
   ```

3. Remove schemas and claims that create:

   ```text
   reviewDecisionCreated = true
   approvalGranted = true
   bindingCreated = true
   authorityLevel = AUTHORIZED_MASTER
   AUTHORIZED_FOR_FIRST_CUT_PREFLIGHT
   ```

4. Restore the PR title and description to a shadow evidence scope.

5. Add a PR-level boundary statement linking to this document.

6. Confirm that no production controller, store, view, Project Data, calculation route, seal, persistence layer, release script, or LFEA module imports `src/workspace/engineering-enrichment/`.

7. Confirm that all retained public APIs either:

   - return shadow-only evidence; or
   - validate shadow-only evidence.

8. Confirm all retained authority fields remain false where applicable:

   ```text
   persistenceCreated
   reviewDecisionCreated
   approvalGranted
   bindingCreated
   current
   sealEligible
   calculationEligible
   resultAcceptanceEligible
   ```

### Required evidence

- exact PR diff after remediation;
- changed-file inventory;
- import search proving no LFEA dependency;
- focused contract tests;
- exact-head syntax and test results;
- updated PR description;
- Phase 6I owner acknowledgement if any shared contract is touched.

### Exit criteria

Phase 0 completes only when:

- acceptance/binding authority is absent from PR #371;
- PR #371 is accurately described as shadow-only;
- no LFEA file depends on PR #371;
- no production calculation route consumes PR #371 output;
- the retained API surface cannot create approval or binding authority.

## Phase 1 — Freeze existing LFEA input authority

### Owner

LFEA Phase 6I owner. PR #371 is not an input to this phase.

### Objective

Freeze the exact project-input authority already bound to the current LFEA candidate.

### Required input categories

At minimum, the freeze must include:

- project identity and revision;
- code or analysis basis;
- design and operating cases;
- design, operating, and minimum temperatures;
- design and operating pressures;
- pipe nominal sizes and outside diameters;
- schedules and nominal wall thicknesses;
- corrosion allowances;
- material specifications and grades;
- temperature-dependent material properties where applicable;
- component weights;
- pipe, content, insulation, lining, and other distributed weights;
- fluid densities by load case;
- insulation properties;
- support, restraint, and boundary assumptions;
- load combinations;
- any project-authorized approximation or derivation.

### Project Authority Index requirements

Each authority entry should record:

```text
authorityRecordId
fieldId or parameterId
scope or selector
value
canonicalUnit
sourceType
sourceDocumentId
sourceRevision
sourceLocation
sourceFileHash
sourceByteHash where available
sourceRow or cell identity where applicable
derivationPolicyId if derived
derivationInputs and hashes
approver or authority owner
approvalEvidenceRef
candidateId
candidateHash
recordHash
```

The index must distinguish:

- explicit source;
- accepted project override;
- authorized engineering derivation;
- approved approximation;
- software-generated value that is not project authority.

### Freeze controls

- Sort and canonicalize authority records deterministically.
- Reject duplicate authority keys with conflicting values.
- Bind all records to the frozen candidate identity.
- Record the exact repository commit and software version used to assemble the candidate.
- Record source availability and any retained original bytes according to the LFEA policy.
- Mark later observations as comparisons, not mutation of the frozen index.

### Exit criteria

- one immutable candidate identity;
- one complete Project Authority Index;
- no unresolved authority source for a required input;
- all source and derivation hashes present;
- no PR #371 artifact referenced as input authority.

## Phase 2 — Complete Phase 6I authority records and external evidence

### Objective

Complete the remaining LFEA authority package using existing Phase 6I scope and ownership.

### Activities

1. Resolve incomplete authority records.
2. Collect missing external evidence.
3. Verify document revisions, applicability, and source locations.
4. Confirm all derived values have an approved derivation policy.
5. Confirm values are normalized to the LFEA canonical unit registry.
6. Confirm candidate inputs match the Project Authority Index exactly.
7. Record limitations and unresolved exclusions.
8. Confirm no Phase 6I evidence depends on PR #371 outputs.

### External evidence handling

External evidence should be recorded with:

- document identifier;
- title;
- revision and date;
- issuer or source organization;
- applicable project or equipment scope;
- exact page, table, clause, cell, or row;
- acquisition date;
- cryptographic file hash where available;
- local evidence artifact reference;
- reviewer identity;
- applicability determination.

### Exit criteria

- all mandatory external evidence is present and reviewable;
- applicability is explicit;
- candidate inputs and authority records reconcile without unexplained differences;
- no circular reference to PR #371 exists.

## Phase 3 — Run exact-head Phase 6F / 6H evidence

### Objective

Produce executable evidence for the frozen LFEA candidate on the exact intended repository head and qualified environment.

### Required execution bindings

Record at least:

```text
repositoryFullName
exactHeadSha
expectedHeadSha
mainHeadSha
candidateId
candidateHash
projectAuthorityIndexHash
inputPackageHash
workflowId or scriptId
runId
jobId
executionEnvironment
runnerIdentity
node and platform versions
startedAt
completedAt
```

### Required checks

- exact checked-out head equals expected head;
- required Phase 6I changes are present;
- candidate identity equals the frozen candidate;
- Project Authority Index hash equals the frozen index;
- no uncommitted tracked-file changes;
- all required source and qualification artifacts are available;
- tests and calculations execute rather than failing before steps;
- logs and artifacts are retained;
- result hashes reconcile to the candidate and input package;
- all false-authority fields remain false until the appropriate certification step.

### Failure classification

Distinguish:

- product or test failure;
- input-authority failure;
- candidate mismatch;
- exact-head mismatch;
- infrastructure failure before executable steps;
- missing logs or artifacts;
- qualification pass.

A run with no executable steps or logs is not a qualification pass.

### Exit criteria

- exact-head Phase 6F/6H evidence exists;
- logs and artifacts are retrievable;
- result identities reconcile;
- failures, if any, are classified and resolved;
- no PR #371 artifact is treated as expected-value or release evidence.

## Phase 4 — Assemble, certify, and independently review Phase 6I

### Objective

Complete the existing LFEA release package without PR #371 dependency.

### Package contents

- frozen candidate;
- Project Authority Index;
- source and external evidence index;
- derivation policies;
- exact-head qualification reports;
- calculation results;
- result reconciliation report;
- limitations and exclusions;
- certification record;
- independent-review record;
- release manifest.

### Certification requirements

Certification should bind:

```text
candidateHash
projectAuthorityIndexHash
sourceEvidenceIndexHash
qualificationBundleHash
resultPackageHash
releaseManifestHash
certifierIdentity
certifiedAt
```

### Independent review requirements

Independent review should confirm:

- authority completeness;
- source applicability;
- derivation reproducibility;
- candidate immutability;
- numerical method and result consistency;
- exact-head qualification;
- absence of PR #371 dependency;
- absence of circular evidence;
- limitations are visible and accurate.

### Exit criteria

- Phase 6I package certified;
- independent review complete;
- released baseline identity recorded;
- release is reproducible from retained evidence;
- release statement explicitly excludes PR #371 inputs.

## Phase 5 — Stabilize the retained PR #371 shadow evidence package

### Dependency

This phase may proceed after Phase 0. It remains non-dependent on Phase 6I completion, but it may not create acceptance or binding authority.

### Objective

Improve the quality and portability of PR #371 shadow proposals and impact evidence while retaining strict authority separation.

### Retained technical scope

- deterministic master snapshots;
- exact selector construction;
- proposal generation;
- fail-closed exact resolution;
- candidate-sidecar projection without source mutation;
- structural non-change evidence;
- injected shadow calculations;
- raw metric deltas without thresholds or acceptability judgments;
- review-ready evidence without a decision;
- staleness and reproducibility evidence;
- canonical serialization;
- exact bundle comparison;
- evidence lineage.

### Pending hardening activities

1. Execute the focused tests on an exact checkout of the PR head.
2. Run the full repository test suite.
3. Run build and browser checks where applicable.
4. Verify no production import path reaches PR #371 modules.
5. Add negative tests for accidental authority escalation.
6. Add explicit boundary regression tests that reject:

   ```text
   approvalGranted = true
   bindingCreated = true
   current = true
   sealEligible = true
   calculationEligible = true
   resultAcceptanceEligible = true
   ```

7. Add a contract test that PR #371 modules do not import LFEA candidate, authority-index, certification, or release-gate modules.
8. Add a contract test that LFEA modules do not import PR #371 modules.
9. Document injected shadow-engine limitations and prevent default routing to a production solver.
10. Ensure comparison outputs report differences only, with no materiality or acceptance judgment.

### Exit criteria

- exact-head executable evidence exists;
- all public contracts remain shadow-only;
- no shared-contract change is unreviewed;
- no production or LFEA dependency exists;
- the package can be independently inspected and transported as evidence.

## Phase 6 — Capture the released LFEA baseline for later comparison

### Dependency

Begins only after Phase 6I release.

### Objective

Create a stable comparison representation of the released LFEA baseline without changing it.

### Baseline representation

The representation should include field-level records containing:

```text
baselineReleaseId
baselineCandidateId
baselineCandidateHash
projectAuthorityIndexHash
fieldId
scope or target identity
value
canonicalUnit
authorityRecordId
authorityRecordHash
sourceHash
derivationPolicyId if applicable
```

### Controls

- The representation is derived from the released authority package.
- It is read-only and hash-bound to the release.
- It must not be generated from PR #371 values.
- It must preserve absent, unknown, not-applicable, and derived-state distinctions.
- It must preserve the LFEA field and unit semantics active at release.

### Exit criteria

- baseline representation hash recorded;
- every comparable field traceable to the released authority index;
- no mutation of the release package;
- comparison use explicitly classified as post-release enhancement planning.

## Phase 7 — Compare PR #371 proposals against the released baseline

### Owner

Joint change-planning activity. Approval remains with the LFEA/project authority owner, not PR #371.

### Objective

Identify exact field-level differences and their downstream impact without approving or binding them.

### Comparison requirements

Each comparison row should include:

```text
fieldId
scope or exact target
baselineValue
baselineUnit
baselineAuthorityRecordHash
proposalValue
proposalUnit
proposalHash
sourceSnapshotHash
sourceRowHash
comparisonType
rawDifference
relativeDifference where meaningful
structuralImpactRef
numericalImpactRef
lineageImpactRef
limitations
```

### Comparison types

At minimum:

- identical representation;
- proposal added where baseline is absent;
- proposal removed or unavailable;
- exact value changed;
- unit or semantic mismatch;
- target mismatch;
- proposal blocked;
- baseline not comparable;
- source authority conflict.

### Numerical handling

- Preserve exact raw differences.
- Do not infer tolerance, materiality, or acceptance.
- Use an externally approved engineering policy for any later significance classification.
- Do not use Phase 6I calculated outputs to validate the proposal that would alter the same inputs.

### Exit criteria

- deterministic comparison package;
- all rows source- and hash-bound;
- no approval or candidate binding created;
- affected evidence and qualification areas identified conservatively.

## Phase 8 — Field-level engineering approval outside PR #371

### Objective

Approve, reject, or defer individual proposed fields through the project/LFEA authority process.

### Required decision record

A future approval record should be owned outside PR #371 and should include:

```text
decisionId
baselineReleaseId
baselineCandidateHash
proposalHash
fieldId
scope
requestedValue
canonicalUnit
decision = APPROVE | REJECT | DEFER
reason
applicability
precedencePolicyId
derivationPolicyId if applicable
approvedBy
approvedAt
approvalEvidenceRef
supersededAuthorityRecordId if applicable
```

### Rules

- Approval is field-specific.
- Approval does not mutate the released candidate.
- Bulk approval requires an explicitly approved grouping rule.
- A proposal cannot displace explicit source without an approved precedence decision.
- Conflicting same-authority proposals fail closed.
- Unit conversion requires an approved conversion policy.
- Approvals must reference exact proposal and baseline hashes.
- Rejected and deferred proposals remain non-authoritative evidence.

### Exit criteria

- each proposed field has an explicit disposition;
- approvals are externally owned and auditable;
- no PR #371-generated boolean is treated as project approval;
- approved values are ready for new-candidate assembly.

## Phase 9 — Create a new immutable LFEA candidate

### Objective

Create a successor candidate incorporating only externally approved changes.

### Candidate assembly requirements

1. Start from the released baseline candidate.
2. Apply approved authority records through the LFEA-owned candidate assembly path.
3. Preserve the original release unchanged.
4. Generate a new candidate identifier and hash.
5. Generate a new Project Authority Index version.
6. Record every superseded, retained, added, and removed authority record.
7. Record the derivation and precedence policies used.
8. Rebuild dependent pipe-section, material, weight, load, and analysis inputs.
9. Produce an exact candidate-difference manifest.

### Candidate difference manifest

```text
priorCandidateId
priorCandidateHash
newCandidateId
newCandidateHash
changedAuthorityRecordIds
addedAuthorityRecordIds
removedAuthorityRecordIds
retainedAuthorityRecordIds
approvedDecisionIds
affectedFieldIds
affectedScopes
affectedCalculationInputs
affectedQualificationAreas
manifestHash
```

### Exit criteria

- new immutable candidate exists;
- all changes trace to external approval records;
- original candidate remains unchanged;
- candidate and authority hashes reconcile;
- affected qualification scope is explicit.

## Phase 10 — Re-run affected qualification and release evidence

### Objective

Re-run only the qualification and release work affected by the approved changes, while preserving all mandatory global integrity checks.

### Impact analysis

Determine whether each approved field affects:

- geometry and section properties;
- mass and center of gravity;
- pressure loads;
- thermal loads;
- sustained loads;
- occasional loads;
- support reactions;
- stress calculations;
- equipment or nozzle interfaces;
- applicability rules;
- material allowables;
- load combinations;
- reporting and result interpretation.

### Rerun policy

- Always rerun candidate identity, authority reconciliation, and exact-head checks.
- Rerun all calculations whose inputs or dependencies changed.
- Rerun structural qualification when dimensions, connectivity, support interpretation, or section authority changes.
- Rerun material qualification when material identity or temperature-dependent properties change.
- Rerun weight/load qualification when component or distributed weights change.
- Rerun downstream result reconciliation and report generation for every affected result family.
- Preserve unaffected evidence only when its dependency hashes remain identical and the retention policy explicitly permits reuse.

### Release requirements

- new qualification bundle;
- new certification record;
- new independent-review record;
- new release manifest;
- explicit comparison to the prior release;
- no claim that PR #371 itself approved or bound the changes.

### Exit criteria

- all affected gates pass on the exact new candidate;
- retained evidence is dependency-hash identical;
- certification and independent review are complete;
- new release is immutable and reproducible.

# 7. Ownership matrix

| Responsibility | PR #371 owner | Phase 6I / LFEA owner | Project engineering authority |
|---|---:|---:|---:|
| Master snapshot and proposal evidence | Responsible | Informed | Informed |
| Shadow candidate projection | Responsible | Informed | Informed |
| Raw shadow numerical impact | Responsible | Informed | Informed |
| Project Authority Index | No | Responsible | Accountable |
| Frozen Phase 6I candidate | No | Responsible | Accountable |
| Field approval | No | Supports traceability | Accountable |
| Candidate binding | No | Responsible | Accountable |
| Derivation and precedence policy | No | Responsible | Accountable |
| LFEA solver authorization | No | Responsible | Accountable |
| Qualification and release gates | No | Responsible | Reviews/approves as defined |
| Independent review | No | Coordinates package | Independent reviewer |
| Post-release comparison evidence | Responsible for proposal side | Responsible for baseline side | Reviews disposition |

# 8. Required technical invariants

## 8.1 Identity invariants

- Every artifact must be bound to its exact source and parent hashes.
- Candidate identities must never be inferred from mutable labels.
- A comparison must bind both direction and exact before/after identities.
- A later approval must reference the exact released baseline and proposal hashes.
- A new candidate must have a new immutable identity.

## 8.2 Authority invariants

- Shadow evidence cannot create project approval.
- Project approval cannot be inferred from numerical agreement.
- A proposal cannot be treated as current merely because its source is newer.
- Accepted project authority must be created outside PR #371.
- LFEA candidate binding must be performed by an LFEA-owned assembly path.
- Release qualification cannot be inferred from unit tests or in-memory validation alone.

## 8.3 Structural invariants

- PR #371 must not mutate source topology.
- A structural no-change report proves only that the evaluated shadow projection did not alter declared structural identities.
- Any future geometry, connectivity, support, or section change requires LFEA-owned structural qualification.

## 8.4 Numerical invariants

- Raw deltas are evidence, not judgment.
- Thresholds and display precision require approved policies.
- Expected values must be independent of the proposal under evaluation.
- A post-release comparison does not authorize a changed input.

## 8.5 Reproducibility invariants

- Reproducibility receipts must bind exact requests, engines, inputs, and outputs.
- Matching repeated shadow output does not create production acceptance.
- Release evidence must execute on the exact intended candidate and head.

# 9. Validation and test matrix

| Area | PR #371 requirement | Phase 6I requirement | Future adoption requirement |
|---|---|---|---|
| Contract validation | Exact schemas, keys, hashes, canonical ordering | Authority and candidate contracts | Approval and new-candidate contracts |
| Unit tests | Shadow builders and validators | LFEA modules and authority assembly | Comparison, approval ingestion, candidate regeneration |
| Negative authority tests | Reject true approval/current/seal flags | Reject missing or conflicting authority | Reject unapproved proposal binding |
| Import-boundary tests | No LFEA imports and no production imports | No PR #371 imports | Only approved external interface |
| Exact-head execution | Required before PR merge | Required for qualification/release | Required for new candidate release |
| Browser/UI tests | Only if shadow inspection UI exists | Existing LFEA UI as applicable | Approval UI owned outside PR #371 |
| Persistence tests | Shadow evidence only if authorized | Authority/release persistence | New candidate and approval persistence |
| Numerical regression | Raw delta determinism | Solver and result qualification | Affected calculations and prior-release comparison |
| Independent review | Code/contract review | Mandatory release review | Mandatory new-release review |

# 10. Open decisions and handover questions

The following decisions remain outside PR #371 and must be resolved by the appropriate owners before future adoption:

1. Which system owns field-level project approval?
2. Which schema records external approval decisions?
3. Which LFEA module assembles approved values into a new candidate?
4. Which precedence policy applies when a proposal conflicts with explicit source?
5. Which unit and derivation registry governs each future field family?
6. Which numerical significance policy is used after exact raw comparison?
7. Which evidence may be retained when dependency hashes are unchanged?
8. Which qualification areas are mandatory for each changed field family?
9. Which release signatories and independent reviewers are required?
10. Where are approved decisions, new candidates, original source bytes, and release artifacts persisted?
11. How is the released LFEA baseline represented for deterministic field-level comparison?
12. How are obsolete or superseded authority records retained without being treated as current?

# 11. Handover checklist

## PR #371 owner

- [ ] Acknowledge this boundary in the PR description.
- [ ] Remove or relocate `acceptance.js`.
- [ ] Remove acceptance tests and exports.
- [ ] Restore all PR #371 outputs to shadow-only authority.
- [ ] Confirm no LFEA dependency.
- [ ] Confirm no production controller, persistence, seal, or calculation routing.
- [ ] Execute exact-head focused and repository tests.
- [ ] Notify the Phase 6I owner before any shared-contract change.
- [ ] Stop after immutable proposal and shadow-impact evidence.

## Phase 6I owner

- [ ] Freeze existing project-input authority.
- [ ] Complete the Project Authority Index.
- [ ] Collect and index external evidence.
- [ ] Confirm PR #371 is absent from candidate authority.
- [ ] Run exact-head Phase 6F/6H evidence.
- [ ] Assemble and certify the package.
- [ ] Complete independent review.
- [ ] Publish the released baseline identity.

## Future enhancement owner

- [ ] Capture the released baseline representation.
- [ ] Compare proposals field by field.
- [ ] Obtain external engineering approval.
- [ ] Create a new immutable candidate.
- [ ] Re-run affected qualification and release evidence.
- [ ] Complete independent review and release.

# 12. Current disposition

```text
LFEA PHASE 6I:
PROCEED INDEPENDENTLY USING THE EXISTING FROZEN CANDIDATE AND PROJECT AUTHORITY.
PR #371 IS NOT A DEPENDENCY AND IS NOT RELEASE EVIDENCE.

PR #371:
BOUNDARY REMEDIATION REQUIRED.
THE SHADOW EVIDENCE FOUNDATION IS COMPATIBLE WITH THE BOUNDARY.
THE ACCEPTANCE / APPROVAL / AUTHORIZED_MASTER BINDING SLICE CONFLICTS WITH THE BOUNDARY.
NO FURTHER PRODUCTION INTEGRATION SHOULD PROCEED UNTIL THAT SLICE IS REMOVED OR RELOCATED.

FUTURE ADOPTION:
POST-RELEASE, FIELD-LEVEL, EXTERNALLY APPROVED, NEW-CANDIDATE WORK ONLY.
```