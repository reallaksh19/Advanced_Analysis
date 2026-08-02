# Load Calc Enrichment Integration — Agent Prompt and Questionnaire

## Purpose

Use this prompt to plan and implement the integration described in `load-calc-enrichment-integration-concept-note.md`.

The agent must answer the questionnaire and publish the answers in the PR description or a committed decision record **before changing production calculation behavior**. Unknowns must remain explicit blockers. Do not silently choose engineering values, selectors, units, tolerances, or authority precedence.

---

# Reusable implementation prompt

You are implementing a governed integration between Load Calc master-data intake, empirical preflight, first-cut enrichment, derived geometry/support models, and calculation.

## Repository context

The repository currently has two parallel paths:

1. a production empirical path over the normalized workspace dataset, Project Data, support-site model, route-partition model, and explicit calculation request; and
2. a first-cut path that independently resolves sidecar bindings, creates an enriched shared-model projection, rebuilds derived models, seals assumptions, and calculates first-cut results.

Your goal is to create one immutable, source-bound engineering-input projection that both paths can consume. You must preserve source-model immutability, topology-edit authority, explicit preflight approval, deterministic hashes, stale-state rejection, and explicit calculation initiation.

## Mandatory reading

Before coding, inspect at minimum:

```text
src/workspace/load-calc-consumer-controller.js
src/workspace/empirical-preflight-view.js
src/workspace/engineering-model-controller.js
src/workspace/engineering-model-store.js
src/workspace/engineering-loads/support-load-distribution-v3.js
src/workspace/master-data-controller.js
src/workspace/master-data-events-handler.js
src/workspace/master-data-normalizers.js
src/workspace/master-data-ui.js
src/workspace/project-data/project-data-contract.js
src/workspace/project-data/project-data-fields.js
src/workspace/enrichment/first-cut-workbench-controller.js
src/core/first-cut-load-estimation/enrichment.js
src/core/first-cut-load-estimation/index.js
```

Also inspect current tests and workflows for these modules. Do not infer a public contract from file names alone.

## Non-negotiable authority boundaries

You must not:

- mutate imported dataset or shared-model objects;
- change canonical coordinates, ports, connectivity, nodes, edges, or component placement through enrichment;
- treat render geometry, mesh names, proximity, fuzzy text, or screen-space hits as engineering identity;
- let fuzzy matching directly create sealed bindings;
- let same-authority conflicts resolve by order or “first match”;
- copy source values into a lower-authority tier;
- remove source supports for a sensitivity scenario;
- run calculation automatically when enrichment is sealed;
- allow calculation against stale or unsealed enrichment;
- let first-cut maintain an independent primary-master authority after convergence;
- synthesize approvals, source hashes, evidence, or release status;
- weaken existing topology, calculation, import, build, or exact-head qualification gates;
- claim a hosted pass when a workflow allocated no executable steps.

## Required target flow

```text
immutable source dataset
+ immutable master snapshots
+ approved Project Data policy
+ accepted overrides
+ approved approximations
        |
        v
exact enrichment resolution
        |
        v
candidate sidecar projection
        |
        v
three-step impact analysis
        |
        v
explicit confirm and seal
        |
        v
current sealed projection
        |
        +--> empirical calculation on explicit request
        |
        +--> first-cut methods on explicit request
```

## Required engineering distinction

Keep these authorities separate:

```text
CANONICAL CENTERLINE GEOMETRY
coordinates, ports, connectivity, placement
owned by source normalization and governed topology edit

ANALYSIS SECTION GEOMETRY
OD, wall, ID, insulation envelope, section and mass properties
may be enriched from approved masters and exact overrides
```

If enrichment changes canonical centerline identity or connectivity, fail closed.

---

# Mandatory questionnaire

Answer every question. Use `UNKNOWN — BLOCKING` when the repository or product owner has not established an answer.

## A. Scope and product outcome

1. Which calculation methods must consume the first integrated projection?
   - empirical tributary load distribution;
   - first-cut tributary screening;
   - continuous-beam screening;
   - sag screening;
   - sustained screening;
   - other methods.

2. Which master field family is the first production cutover?
   - component weights;
   - fluid densities;
   - material densities;
   - pipe sections;
   - support capabilities;
   - another bounded family.

3. Is the first package shadow-only, or may it create a current seal?

4. What visible user problem must the first package solve?

5. What remains explicitly out of scope?

## B. Source and identity authority

6. What exact object is the primary source identity?
   - workspace dataset hash;
   - shared-model semantic hash;
   - both;
   - another source contract.

7. Which dataset version/revision fields must be bound into the candidate and seal?

8. What exact canonical identifiers exist for:
   - component;
   - pipe;
   - line;
   - class;
   - bore;
   - catalog item;
   - support;
   - support site;
   - route.

9. Which identity adapters are authoritative and which are legacy-only?

10. Can one source entity belong to more than one line, class, catalog key, or route? If yes, how is the binding disambiguated?

11. What happens when an entity has no exact target identity?

12. Are source entity IDs stable across dataset reload and topology-edit commit?

13. Which exact identity links the normalized workspace dataset to the shared piping model?

## C. Master snapshot authority

14. Which master types are in scope?
   - line list;
   - piping classes;
   - component weights;
   - material map;
   - valve/fitting dimensions;
   - insulation;
   - other.

15. For each master type, what constitutes its immutable source identity?

16. Is source row order authoritative for any master?

17. Which sheet selection policy is authoritative for workbook imports?

18. Must the original bytes be retained, or is SHA-256 plus normalized content sufficient?

19. Where will complete master snapshots be persisted?

20. What is the maximum supported file size and row count?

21. How are duplicate rows classified?

22. How are revised masters distinguished from remapped copies of the same file?

23. Must field-map changes produce a new candidate and invalidate a seal? The expected answer is yes; record any contrary requirement explicitly.

## D. Field mapping and units

24. List every permitted enrichment field and its canonical unit.

25. For each field, state whether it applies by:
   - entity;
   - line key;
   - class and bore;
   - component type and bore;
   - catalog key;
   - support kind;
   - support entity;
   - project.

26. Which unit conversions are allowed?

27. Which units must be rejected rather than converted?

28. How are nominal bore, outside diameter, wall thickness, and inside diameter distinguished?

29. Which pressure and temperature definitions correspond to P1 and T1/T2/T3?

30. Which density applies to EMPTY, OPE, and HYD cases?

31. How is phase represented and validated?

32. Are zero values meaningful for any field, such as no insulation or empty fluid mass?

33. What numeric precision is retained in contracts and displayed in UI?

## E. Matching and proposal rules

34. Which exact-key matches are permitted for each master type?

35. Which fuzzy algorithms may propose candidate matches?

36. What confidence information must a proposal show?

37. Must a user accept each fuzzy proposal individually, by group, or through a reviewed mapping table?

38. How is an accepted fuzzy proposal converted into an exact reusable mapping?

39. What happens when more than one exact master row matches?

40. What happens when one master row maps to multiple entities?

41. Is class-level or service-level fill-down allowed? If yes, how is the expanded exact target set sealed and reviewed?

42. Which legacy substring or branch-name heuristics must be removed or retained only as proposal generators?

## F. Evidence precedence and override policy

43. Confirm or revise the proposed precedence:

```text
EXPLICIT_SOURCE
> ACCEPTED_OVERRIDE
> AUTHORIZED_MASTER
> USER_APPROVED_APPROXIMATION
```

44. What counts as `EXPLICIT_SOURCE` for each field?

45. May an accepted override replace explicit source? If yes, what evidence and approval are required?

46. Can a master fill only missing values, or may it replace lower-quality imported evidence?

47. What makes a master “authorized”?

48. Who may approve an approximation?

49. Do approximations expire on source, master, mapping, Project Data, or dataset changes?

50. How are same-authority conflicts displayed and resolved?

51. Are rejected candidates retained in the audit package?

## G. Geometry and topology impact

52. Confirm that masters cannot change canonical coordinates or connectivity.

53. Which section-property changes require visual 3D refresh?

54. Is 3D display diameter derived from source geometry, sealed section geometry, or a display policy?

55. How is a mismatch between source display diameter and sealed analysis diameter presented?

56. Which support fields affect support-site grouping?

57. Which support fields affect capability only, without regrouping sites?

58. How is support-unavailable sensitivity represented as a scenario rather than source deletion?

59. Which route partitions must rebuild for each support or section change?

60. What exact condition blocks Step 2 as an authority violation?

## H. Calculation impact

61. Which existing calculation is the base for shadow comparison when no accepted result exists?

62. Which numerical outputs must be compared?

63. What output deltas are informational, warning, or blocking?

64. Which tolerances are method-authoritative?

65. Is a changed mass with unchanged support reaction still material?

66. How are partially qualified contributions treated?

67. What qualification transitions must be highlighted?

68. Must the post-seal explicit calculation reproduce the Step 3 candidate hash exactly?

69. What happens if the actual calculation differs from the shadow candidate?

## I. Lifecycle and persistence

70. Which events invalidate:
   - candidate resolution;
   - impact reports;
   - seal;
   - derived support/route models;
   - calculation results.

71. Is one seal stored per dataset, per dataset version, per user, or per workspace?

72. Can a prior seal be reopened for review but remain stale?

73. Does reload restore the complete current seal and its source-bound snapshots?

74. What is the behavior when a saved master file is not available after reload?

75. How are undo and redo handled?

76. What happens after a topology-edit workspace commit increments the dataset version?

77. Must seal rollback restore an earlier current projection without restoring stale results?

78. Which exports must include the resolution, all three impact reports, and the seal?

## J. User experience and approval

79. Where is the primary experience located?
   - empirical preflight;
   - master-data tab;
   - first-cut workbench;
   - a new enrichment review tab.

80. Which page owns proposal authoring?

81. Which page owns final seal approval?

82. What summary must be visible before confirmation?

83. How are unresolved records grouped and filtered?

84. How does the user focus affected entities in 3D using exact canonical IDs?

85. Which actions require an explicit confirmation dialog?

86. What accessible labels and live-region announcements are required?

87. What information must be downloadable before sealing?

## K. Migration and compatibility

88. Which legacy paths are still used by production?

89. Which existing first-cut test fixtures must remain valid?

90. Which existing empirical results are treated as a compatibility baseline?

91. Is a feature flag required for field-family cutover?

92. How will shadow differences be reviewed before activation?

93. What is the rollback trigger?

94. When may duplicate first-cut primary-master import be removed?

95. When may DOM-only preflight fill-down be removed?

## L. Performance and scale

96. Expected maximum counts:
   - source entities;
   - lines;
   - supports;
   - routes;
   - rows per master;
   - candidate bindings.

97. Maximum acceptable time for:
   - master normalization;
   - resolution;
   - Step 2 rebuild;
   - Step 3 shadow calculation;
   - browser rendering.

98. Which stages must run in a worker?

99. What cancellation and stale-response policy is required?

100. What evidence is required for large-model qualification?

## M. Release and evidence

101. Which exact-head workflows must retain this integration?

102. What statuses are allowed before production cutover?

103. What artifact proves each step executed?

104. What source and projection hashes must appear in the final result package?

105. What constitutes `PASS_IMPLEMENTATION`, `PASS_SHADOW`, `PASS_CUTOVER`, and `PASS_RELEASE`?

106. Confirm that zero-step/no-log CI remains infrastructure failure, not pass or product failure.

---

# Questionnaire response template

Commit the completed answers or include them in the PR body using this structure:

```md
## Enrichment integration decisions

### Scope
- First field family:
- Shadow-only or cutover:
- Engines affected:
- Explicit exclusions:

### Identity
- Dataset authority:
- Shared-model authority:
- Entity linkage:
- Stable selectors:
- Unknown/blocking selectors:

### Master snapshots
- Master types:
- Snapshot storage:
- Workbook sheet policy:
- Row-order policy:
- Limits:

### Units and fields
- Permitted fields:
- Canonical units:
- Allowed conversions:
- Rejected conversions:

### Matching
- Exact keys:
- Fuzzy proposal mechanisms:
- Acceptance workflow:
- Conflict handling:

### Authority precedence
- Confirmed precedence:
- Explicit-source extraction:
- Override rules:
- Approximation approval:

### Three-step impact
- Step 1 blockers:
- Step 2 blockers:
- Step 3 deltas:
- Shadow/actual reconciliation rule:

### Lifecycle
- Candidate invalidation:
- Seal invalidation:
- Result invalidation:
- Persistence:
- Rollback:

### UX
- Authoring surface:
- Review surface:
- Approval surface:
- 3D focus behavior:

### Migration
- Compatibility fixtures:
- Feature flag:
- Cutover sequence:
- Legacy retirement gates:

### Qualification
- Focused tests:
- Browser tests:
- Large-model tests:
- Exact-head workflows:
- Evidence statuses:

### Blocking unknowns
- UNKNOWN — BLOCKING: ...
```

---

# Implementation sequence

Do not combine all work into one PR.

## PR 1 — Snapshot and proposal foundation

### Scope

- immutable `MasterDataSnapshot.v2`;
- exact adapters for one bounded master field family;
- deterministic proposal rows;
- exact source and mapping hashes;
- Step 1 resolution report;
- shadow-only UI presentation;
- no seal and no calculation changes.

### Suggested module boundary

```text
src/workspace/engineering-enrichment/
  master-snapshot.js
  master-adapters.js
  selectors.js
  resolution.js
  resolution-validation.js
```

### Example contract pattern

```js
export function buildMasterDataSnapshot(input) {
  assertExactKeys(input, [
    'masterKey', 'source', 'mapping', 'normalizedRows', 'diagnostics',
  ]);

  const normalizedRows = canonicalizeRows(input.masterKey, input.normalizedRows);
  const base = Object.freeze({
    schema: 'MasterDataSnapshot.v2',
    masterKey: requireMasterKey(input.masterKey),
    source: validateSource(input.source),
    mapping: canonicalizeMapping(input.mapping),
    normalizedRows,
    diagnostics: canonicalizeDiagnostics(input.diagnostics),
  });

  return deepFreeze({
    ...base,
    mappingHash: semanticHash(base.mapping),
    normalizedRowsHash: semanticHash(base.normalizedRows),
    snapshotHash: semanticHash(base),
  });
}
```

### Required tests

- deterministic snapshot identity;
- mapping-change identity;
- source-change identity;
- invalid source SHA rejection;
- unsupported master rejection;
- caller immutability;
- exact adapter matches;
- ambiguous match rejection;
- fuzzy candidate remains proposal-only.

## PR 2 — Shared resolver and candidate projection

### Scope

- explicit source-binding extraction;
- authority precedence;
- same-authority conflict rejection;
- exact sidecar projection;
- unresolved evidence;
- first-cut compatibility adapter;
- no production cutover.

### Example resolution pattern

```js
const AUTHORITY_RANK = Object.freeze({
  EXPLICIT_SOURCE: 0,
  ACCEPTED_OVERRIDE: 1,
  AUTHORIZED_MASTER: 2,
  USER_APPROVED_APPROXIMATION: 3,
});

export function resolveBindingCandidates(candidates) {
  const rows = candidates.map(validateCandidate)
    .sort((a, b) => AUTHORITY_RANK[a.authorityLevel]
      - AUTHORITY_RANK[b.authorityLevel]
      || a.semanticId.localeCompare(b.semanticId));

  const bestRank = AUTHORITY_RANK[rows[0]?.authorityLevel];
  const best = rows.filter((row) => AUTHORITY_RANK[row.authorityLevel] === bestRank);
  if (best.length !== 1) {
    return conflictDisposition('CONFLICTING_SAME_AUTHORITY', best);
  }
  return selectedDisposition(best[0], rows.slice(1));
}
```

### Required tests

- all precedence combinations;
- explicit source cannot be displaced by master;
- exact override behavior;
- approximation requires approval;
- source and lower candidates retained;
- reordering determinism;
- unsupported unit rejection;
- no source-model mutation.

## PR 3 — Three-step impact analysis

### Scope

- Step 1 evidence impact;
- Step 2 geometry/support/route impact;
- Step 3 shadow calculation impact;
- production empirical preflight presentation;
- exact affected-entity focus;
- no seal application.

### Changed-scope pattern

```js
export function deriveImpactScope(baseProjection, candidateProjection) {
  const changed = compareExactProjectionFields(baseProjection, candidateProjection);
  return deepFreeze({
    entityIds: sortedUnique(changed.flatMap((row) => row.entityIds)),
    lineKeys: sortedUnique(changed.flatMap((row) => row.lineKeys)),
    classBoreKeys: sortedUnique(changed.flatMap((row) => row.classBoreKeys)),
    supportEntityIds: sortedUnique(changed.flatMap((row) => row.supportEntityIds)),
    rebuild: {
      sections: changed.some(isSectionChange),
      mass: changed.some(isMassChange),
      supportCapabilities: changed.some(isSupportChange),
      topology: false,
    },
  });
}
```

### Required tests

- process-only no-topology impact;
- section no-centerline impact;
- support affected-scope rebuild;
- scenario-only support availability;
- coordinate/connectivity mutation blocks;
- shadow calculation determinism;
- base result remains unchanged;
- impact delta reconciliation.

## PR 4 — Seal and lifecycle

### Scope

- current candidate verification;
- explicit approval;
- deterministic seal;
- seal persistence;
- stale lifecycle;
- no automatic calculation;
- explicit calculation requirement.

### Seal guard pattern

```js
export function sealEngineeringInputs(input) {
  requireCurrentHash(input.sourceDatasetHash, input.currentSourceDatasetHash);
  requireCurrentHash(input.resolution.resolutionHash, input.currentResolutionHash);
  requireCurrentHash(input.geometryImpact.geometryImpactHash, input.currentGeometryImpactHash);
  requireCurrentHash(input.calculationImpact.calculationImpactHash, input.currentCalculationImpactHash);
  requireNoBlockers(input.resolution, input.geometryImpact, input.calculationImpact);
  requireApprovals(input.approvals, input.resolution);

  return createHashedContract('EngineeringInputSeal.v1', {
    sourceDatasetHash: input.sourceDatasetHash,
    resolutionHash: input.resolution.resolutionHash,
    geometryImpactHash: input.geometryImpact.geometryImpactHash,
    calculationImpactHash: input.calculationImpact.calculationImpactHash,
    approvals: canonicalizeApprovals(input.approvals),
    sealedProjectionHash: input.candidateProjection.projectionHash,
  });
}
```

### Required tests

- stale candidate rejection;
- stale source/master/mapping/profile rejection;
- missing approval rejection;
- confirm does not calculate;
- calculation requires current seal;
- result binds seal hash;
- reload restoration;
- result remains stale after seal until explicit calculate.

## PR 5+ — Field-family cutover

Cut over one bounded family per PR. Each PR must contain:

- shadow baseline;
- exact affected fixtures;
- expected numerical changes;
- production resolver change;
- rollback switch;
- browser and regression evidence;
- no unrelated master families.

Recommended order:

1. component weights;
2. fluid densities;
3. material densities;
4. pipe sections;
5. support capabilities;
6. support-availability scenarios.

---

# Coding standards

## Determinism

- canonicalize arrays before hashing unless source order is explicitly authoritative;
- never use locale-sensitive ordering for engineering identity;
- do not include wall-clock timestamps in semantic identity;
- use finite-number validation at every contract boundary;
- reject duplicate semantic IDs;
- retain exact units in evidence and normalized canonical units in calculations.

## Immutability

- use pure functions for snapshot, resolution, projection, impact, and seal creation;
- deep-freeze returned contracts;
- do not mutate raw rows, normalized rows, source dataset, shared model, Project Data, or candidate objects;
- keep stores as lifecycle coordinators, not calculation authorities.

## Module design

- one responsibility per module;
- named exports;
- production modules below the repository’s established line limit;
- no DOM imports in core resolution and impact modules;
- no engine imports in UI views;
- no direct local-storage access from deterministic core modules;
- use adapters at representation boundaries.

## Failure behavior

- fail closed with stable error codes;
- include exact affected IDs and evidence paths;
- never fall back to demonstrations, nearest matches, first rows, or default engineering values;
- preserve unresolved records rather than dropping them;
- classify infrastructure failure separately from product failure.

---

# Anti-drift requirements

Add focused source/contract guards that fail if:

```text
production calculation imports raw master controller state directly
first-cut imports an independent primary master after convergence
final binding application contains fuzzy, substring, includes(), or nearest-match logic
enrichment writes source dataset or shared-model fields
candidate sealing invokes calculate()
support sensitivity filters source supports from the normal projection
centerline coordinates or connectivity are written by enrichment
result contract lacks sealedProjectionHash or sealHash
legacy DOM input state is used as calculation evidence
master mappings are restored without source rows and source hash
a workflow reports PASS without executable steps and retained evidence
```

Use semantic source checks rather than fragile line-number checks where possible.

---

# Required validation matrix

## Focused Node tests

```text
master snapshot contract
master adapters
exact selector resolution
authority precedence
unit conversion and rejection
candidate projection
three impact contracts
changed-scope derivation
seal lifecycle
stale-state rejection
first-cut compatibility
empirical resolver compatibility
```

## Integration tests

```text
real retained dataset + real normalized masters
master update -> stale candidate and result
mapping update -> new resolution hash
source dataset edit -> complete invalidation
seal -> no automatic calculation
explicit calculate -> result bound to seal
first-cut and empirical inputs share projection hash
```

## Browser tests

```text
upload master
review mapping
review proposal
resolve ambiguity
approve approximation
review Step 1
review Step 2
review Step 3
confirm and seal
observe stale result
explicitly calculate
inspect provenance
reload and verify persistence
```

## Negative tests

```text
stale source hash
stale master hash
stale mapping hash
unknown unit
same-authority conflict
fuzzy-only match
coordinate mutation
connectivity mutation
support source deletion
shadow/actual mismatch
missing seal
stale seal
```

## Performance tests

Measure and retain:

- master normalization time;
- resolution time;
- Step 2 affected-scope rebuild time;
- Step 3 shadow calculation time;
- UI render time;
- peak binding count;
- worker cancellation and stale-response rejection;
- repeated open/close memory behavior.

---

# PR requirements

Every PR must state:

- exact base and head SHA;
- bounded write set;
- questionnaire decisions used by the package;
- authority changed and authority unchanged;
- schemas added or revised;
- numerical behavior changed or unchanged;
- expected maximum numerical difference where applicable;
- focused commands executed;
- browser/build evidence;
- exact-head workflow disposition;
- rollback procedure;
- remaining blockers and deferred packages.

Do not merge a package that contains unresolved questionnaire items affecting its production behavior.

---

# Definition of completion

The program is complete only when:

- one primary master snapshot set exists;
- one exact resolution authority exists;
- one current sealed engineering-input projection exists;
- empirical and first-cut methods consume the same projection hash;
- the three impact reports reconcile with actual derived models and results;
- source centerline topology remains unchanged by enrichment;
- every master-derived value has exact provenance;
- fuzzy matching remains proposal-only;
- support sensitivity remains scenario-only;
- sealing does not calculate;
- stale evidence fails closed;
- persistence restores complete source-bound authority or reports not loaded;
- legacy duplicate and DOM-only paths are retired;
- exact-head tests, browser flows, build, anti-drift checks, and retained evidence execute successfully.
