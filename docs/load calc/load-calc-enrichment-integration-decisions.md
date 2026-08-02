# Load Calc Enrichment Integration Decisions

## Status

**Decision record for planning and shadow-only implementation.**

This record answers the mandatory 106-question questionnaire against `main` at
`e9fe176e6b6e57aee86268ad82b25504a553e058`.

It authorizes documentation, contract design, test scaffolding, and shadow-only
proposal work. It does **not** authorize a production field-family cutover, a
current engineering-input seal, automatic calculation, source-model mutation,
topology changes, or retirement of either existing calculation path.

Any item marked `UNKNOWN — BLOCKING` must be resolved before code depending on
that decision is merged. Unknowns are not defaults.

## Repository evidence reviewed

At minimum, this decision record is grounded in:

- `src/workspace/load-calc-consumer-controller.js`
- `src/workspace/empirical-preflight-view.js`
- `src/workspace/engineering-model-controller.js`
- `src/workspace/engineering-model-store.js`
- `src/workspace/engineering-loads/support-load-distribution-v3.js`
- `src/workspace/master-data-controller.js`
- `src/workspace/master-data-events-handler.js`
- `src/workspace/master-data-normalizers.js`
- `src/workspace/project-data/project-data-contract.js`
- `src/workspace/project-data/project-data-fields.js`
- `src/workspace/enrichment/first-cut-workbench-controller.js`
- `src/core/first-cut-load-estimation/enrichment.js`
- `src/core/first-cut-load-estimation/index.js`
- `src/core/first-cut-load-estimation/constants.js`
- `src/workspace/dataset-adapter.js`
- `src/core/shared-piping-model/adapters/workspace-dataset-to-shared.js`
- `src/workspace/support-sites/support-site-model.js`
- `src/workspace/routes/route-partition-model.js`
- `src/workspace/project-data/project-data-store.js`
- current first-cut, workspace-contract, empirical, browser, build, import, and
  repository gate registrations in `package.json`.

## Enrichment integration decisions

### Scope

- **First field family:** `UNKNOWN — BLOCKING`. Component weights are the
  recommended first candidate because both production and first-cut currently
  consume component mass, but the product owner has not authorized that
  cutover.
- **Shadow-only or cutover:** The first package is shadow-only. It may create
  immutable snapshots, deterministic proposals, and a Step 1 report. It may not
  create a current seal or change calculation behavior.
- **Engines affected at program completion:** empirical tributary distribution,
  first-cut tributary screening, continuous-beam screening, sag screening, and
  sustained screening. No additional method is authorized.
- **Explicit exclusions:** topology editing, coordinate or connectivity changes,
  automatic calculation, source support deletion, fuzzy sealed bindings,
  production cutover, and retirement of legacy paths.

### Identity

- **Dataset authority:** both the source byte identity and the normalized
  dataset identity are required: `dataset.sourceSha256`,
  `dataset.sourceSnapshot.sourceByteHash`,
  `dataset.sourceSnapshot.sourceSemanticHash`, `dataset.datasetId`, and
  `dataset.version`.
- **Shared-model authority:** `dataset.sharedModel.semanticHash`.
- **Entity linkage:** workspace `entity.entityId` maps to shared
  `component.componentKey` or `support.supportKey`; `sourceEntityId` is retained
  as secondary source evidence.
- **Stable selectors:** exact entity ID, source entity ID when unique, line key,
  piping class plus nominal bore, component type plus nominal bore, catalog key,
  support kind, support entity ID, support-site ID, and route ID, subject to the
  blocking selector-registry decisions below.
- **Unknown/blocking selectors:** canonical catalog-key extraction, exact
  class/bore normalization, process line-key normalization across all source
  schemas, and identity stability for newly created topology-edit entities.

### Master snapshots

- **Master types currently present:** line list, piping class, component weight,
  and material map. Separate valve/fitting dimensions and insulation masters do
  not have a governed integrated snapshot contract.
- **Snapshot storage:** `UNKNOWN — BLOCKING`. Current code persists field maps
  only and does not restore complete source-bound snapshots.
- **Workbook sheet policy:** current import selects the first workbook sheet.
  That behavior is legacy and is not approved as the v2 authority.
  `UNKNOWN — BLOCKING` for the governed policy.
- **Row-order policy:** no current master contract declares row order to be
  engineering authority. PR 1 must canonicalize semantic rows while retaining
  source row/sheet provenance.
- **Limits:** `UNKNOWN — BLOCKING` for bytes and row counts.

### Units and fields

- **Permitted fields:** only fields registered by the selected bounded adapter
  may enter a candidate. Existing field names and units are recorded in answers
  24–33 below; process pressure/temperature fields remain blocked until their
  definitions and units are approved.
- **Canonical units:** mm, kg, kg/m, kg/m³, MPa, mm⁴, N·m², and exact
  enumerations as applicable.
- **Allowed conversions:** none are currently authorized beyond identity
  conversion. A conversion registry is `UNKNOWN — BLOCKING`.
- **Rejected conversions:** every unregistered unit or ambiguous nominal/actual
  dimension conversion fails closed.

### Matching

- **Exact keys:** governed adapters must emit exact normalized keys and exact
  target sets. Current likely keys are line key, material code, class/bore,
  component type/bore, catalog key, support kind, and entity ID, but the first
  field-family adapter is blocked until its exact key contract is approved.
- **Fuzzy proposal mechanisms:** current fuzzy column mapping may remain a
  proposal aid. No fuzzy row-to-entity algorithm is authorized for sealing.
- **Acceptance workflow:** `UNKNOWN — BLOCKING` whether proposals are accepted
  individually, by reviewed group, or through a mapping table.
- **Conflict handling:** same-authority conflicts block; equivalent duplicates
  remain diagnostics; no order-based winner is allowed.

### Authority precedence

- **Confirmed precedence:** `EXPLICIT_SOURCE > ACCEPTED_OVERRIDE >
  AUTHORIZED_MASTER > USER_APPROVED_APPROXIMATION`.
- **Explicit-source extraction:** source values must be materialized from the
  normalized workspace entity/shared-model evidence by a field registry. The
  per-field registry is incomplete and remains blocking for cutover.
- **Override rules:** an accepted override may not replace explicit source under
  the confirmed precedence. It may replace authorized-master or approximation
  evidence for the exact same target field.
- **Approximation approval:** `UNKNOWN — BLOCKING` for eligible roles and
  approval evidence.

### Three-step impact

- **Step 1 blockers:** ambiguous exact match, same-authority conflict, unknown
  unit, stale source/master/mapping, unsupported field, missing target identity,
  attempted displacement of explicit source, and unapproved approximation.
- **Step 2 blockers:** any added/removed/reidentified/repositioned centerline
  entity, port, node, edge, connectivity link, branch placement, or source
  support in the normal projection.
- **Step 3 deltas:** mass ledger, route contribution, support reaction,
  exclusions, blockers, equilibrium, completeness, qualification, affected
  routes, and affected support sites.
- **Shadow/actual reconciliation:** an explicit post-seal calculation must
  reproduce the Step 3 candidate result identity for the same engine version
  and inputs. A mismatch blocks result acceptance and retains both packages.

### Lifecycle

- **Candidate invalidation:** source dataset, shared model, master source,
  mapping, normalized rows, Project Data, override, approximation, or selector
  registry change.
- **Seal invalidation:** every candidate invalidator plus impact-report or
  approval change.
- **Result invalidation:** every seal invalidator and every seal-currentness or
  calculation-engine identity change.
- **Persistence:** complete source-bound snapshots and seal must restore
  atomically or report `NOT_LOADED`.
- **Rollback:** rollback may activate an earlier projection only through a new
  currentness check; it must not restore old results as current.

### UX

- **Authoring surface:** `UNKNOWN — BLOCKING`.
- **Review surface:** `UNKNOWN — BLOCKING`; the current empirical preflight is
  the likely integration point but is not yet authorized.
- **Approval surface:** `UNKNOWN — BLOCKING`.
- **3D focus behavior:** publish the exact canonical `entityId` through
  `VIEWPORT_SELECTION_REQUESTED`; support-site or route rows must resolve to
  exact member/primary entity IDs rather than render hits.

### Migration

- **Compatibility fixtures:** all current first-cut core/workbench/browser
  checks and the current empirical support-load distribution baseline must
  remain valid until a field-family PR explicitly changes expected values.
  Exact fixture inventory is required before PR 1 coding.
- **Feature flag:** required per field family.
- **Cutover sequence:** component weights, fluid densities, material densities,
  pipe sections, support capabilities, and support-availability scenarios is a
  recommendation only; the first family is still blocking.
- **Legacy retirement gates:** shared snapshot/resolver parity, retained
  compatibility tests, browser migration, persisted mapping migration, and
  production cutover evidence.

### Qualification

- **Focused tests:** snapshot, adapter, selector, precedence, units, projection,
  three impact contracts, seal lifecycle, stale rejection, and compatibility.
- **Browser tests:** upload, map, propose, resolve, approve, review three steps,
  seal, observe stale result, explicitly calculate, inspect provenance, reload.
- **Large-model tests:** deterministic repeated hashes, timing, peak bindings,
  worker cancellation, stale responses, browser responsiveness, and memory.
- **Exact-head workflows:** at minimum the full `gate`, first-cut aggregate,
  workspace-contract aggregate, 1885S empirical qualification, relevant
  Chromium workflow, import checks, build, and a dedicated enrichment
  certification workflow. Exact GitHub workflow file ownership is
  `UNKNOWN — BLOCKING` before implementation PR publication.
- **Evidence statuses:** `BLOCKED`, `PASS_IMPLEMENTATION`, `PASS_SHADOW`,
  `PASS_CUTOVER`, `PASS_RELEASE`, and
  `PRE_STEP_INFRASTRUCTURE_FAILURE`.

### Blocking unknowns

- `UNKNOWN — BLOCKING`: first production field family.
- `UNKNOWN — BLOCKING`: complete snapshot persistence location and retention.
- `UNKNOWN — BLOCKING`: workbook sheet-selection policy.
- `UNKNOWN — BLOCKING`: original-byte retention requirement.
- `UNKNOWN — BLOCKING`: master file and row limits.
- `UNKNOWN — BLOCKING`: exact field-family selector and unit registry.
- `UNKNOWN — BLOCKING`: P1 and T1/T2/T3 definitions and units.
- `UNKNOWN — BLOCKING`: phase vocabulary and validation.
- `UNKNOWN — BLOCKING`: numeric display and comparison precision policy.
- `UNKNOWN — BLOCKING`: fuzzy proposal acceptance granularity.
- `UNKNOWN — BLOCKING`: approximation approver roles.
- `UNKNOWN — BLOCKING`: 3D analysis/display diameter policy.
- `UNKNOWN — BLOCKING`: Step 3 delta thresholds.
- `UNKNOWN — BLOCKING`: baseline calculation rule when no accepted result exists.
- `UNKNOWN — BLOCKING`: authoring, review, and approval surface ownership.
- `UNKNOWN — BLOCKING`: scale and performance thresholds.
- `UNKNOWN — BLOCKING`: exact workflow ownership and release signatories.

## Mandatory questionnaire answers

### A. Scope and product outcome

1. **Methods consuming the integrated projection:** At program completion:
   empirical tributary load distribution, first-cut tributary screening,
   continuous-beam screening, sag screening, and sustained screening. No other
   method is authorized. The first package changes none of them.

2. **First production field family:** `UNKNOWN — BLOCKING`. Component weights
   are the repository-grounded recommended candidate, not an approved decision.

3. **First package:** shadow-only. No current seal and no calculation changes.

4. **Visible user problem:** today an imported master can be parsed, normalized,
   and hashed without producing a governed, exact, inspectable transformation
   into the values used by production calculation. Separately, first-cut owns
   an independent master/enrichment path. The first package must let a user see
   deterministic proposed bindings, exact source and mapping identities,
   ambiguity/conflict diagnostics, and affected canonical IDs without changing
   accepted results.

5. **Out of scope:** current seal, cutover, automatic calculation, topology
   edits, centerline mutation, support deletion, fuzzy sealed matches, numeric
   tolerances, new engineering defaults, legacy retirement, and unrelated
   master families.

### B. Source and identity authority

6. **Primary source identity:** both the normalized workspace source authority
   and shared-model semantic authority. Bind the source byte/SHA identities,
   `datasetId`, dataset version, and `sharedModel.semanticHash`.

7. **Dataset version/revision fields:** `dataset.datasetId`,
   `dataset.version || null`, `dataset.sourceSchema`, source snapshot
   `datasetId`, `sourceSemanticHash`, `sourceByteHash`, and the active
   `dataset.sourceSha256` when present. `sourceName` is provenance, not identity.

8. **Canonical identifiers:**
   - component: workspace `entityId`; shared `componentKey`; secondary
     `sourceEntityId`;
   - pipe: same entity/component keys, plus `lineKey` and `branchId`;
   - line: `lineKey`/`lineId`;
   - class: normalized `pipingClass`;
   - bore: normalized nominal bore in mm; the exact cross-model extraction rule
     is `UNKNOWN — BLOCKING`;
   - catalog item: `properties.attributes.CATALOG_KEY` where present; canonical
     fallback policy is `UNKNOWN — BLOCKING`;
   - support: workspace `entityId`; shared `supportKey`; secondary
     `sourceEntityId`;
   - support site: `support-site-model/v1.siteId`;
   - route: `route-partition-model/v1.routeId`.

9. **Identity adapters:** authoritative source adapters are
   `normalizeWorkspaceDataset` and
   `buildSharedPipingModelFromWorkspaceDataset`; support-site and route IDs are
   derived from their governed models. The first-cut selector matcher becomes a
   compatibility adapter after convergence. DOM state, render geometry, mesh
   names, fuzzy field mapping, and older substring/branch heuristics are
   legacy/proposal-only.

10. **Multiple memberships:** the current normalized entity contract exposes
    singular line, branch, class, and bore values. A support site may aggregate
    members from multiple branches. A general multi-line/multi-class/
    multi-catalog entity binding contract is not established.
    `UNKNOWN — BLOCKING` if future sources require it. Any allowed expansion
    must seal an explicit sorted target-ID set.

11. **No exact target identity:** retain `NO_MATCH`/unresolved evidence and block
    that field. Do not infer from proximity, source order, text similarity, or
    render state.

12. **ID stability:** identical reloads use deterministic IDs when the unique
    source entity ID or source-node key is unchanged. Stability for newly
    created or reidentified topology-edit entities across commit/reload is not
    documented as a public enrichment contract. `UNKNOWN — BLOCKING` for seal
    restoration involving those entities.

13. **Workspace-to-shared linkage:** workspace `entity.entityId` is copied to
    shared `component.componentKey` or `support.supportKey`; source identity and
    JSON/source paths are retained in `sourceReferences`.

### C. Master snapshot authority

14. **Master types in scope:** current intake has line list, piping classes,
    component weights, and material map. Valve/fitting dimensions and
    insulation are not separately governed master types. Additional types
    require a new bounded adapter and questionnaire amendment.

15. **Immutable source identity:** for each master type, SHA-256 of original
    bytes plus byte length and source file/sheet provenance; v2 additionally
    binds canonical field mapping, normalized rows, diagnostics, and their
    semantic hashes. File name alone is never identity.

16. **Source row order:** no current master declares it authoritative. Preserve
    `_sourceRowNumber` and `_sourceSheet` as provenance, but canonicalize
    semantic rows before hashing. A future adapter may declare order authority
    only through an explicit contract revision.

17. **Workbook sheet policy:** current code uses `workbook.SheetNames[0]`.
    Governed policy is `UNKNOWN — BLOCKING`; first-sheet selection must not be
    silently promoted.

18. **Original bytes:** `UNKNOWN — BLOCKING`. Current master state retains SHA
    and normalized rows but not the bytes. The persistence architecture must
    explicitly decide whether bytes are stored or whether hash plus complete
    normalized snapshot is sufficient.

19. **Snapshot persistence location:** `UNKNOWN — BLOCKING`. Current
    `localStorage` persistence saves mappings only and is insufficient.

20. **Maximum file size and rows:** `UNKNOWN — BLOCKING`.

21. **Duplicate rows:** identical semantic target/value/unit rows are retained
    as duplicate diagnostics with all source rows. Duplicate semantic IDs are
    rejected. Same exact target and authority with different value/unit is
    `CONFLICTING_SAME_AUTHORITY` and blocks. Source order never resolves it.

22. **Revision versus remap:** changed source SHA is a revised source. Same
    source SHA with changed mapping hash is a remapped snapshot and creates a
    new candidate. Same bytes copied under another name retain the same source
    identity; filename is provenance only.

23. **Field-map invalidation:** yes. Any field-map change creates a new snapshot
    and candidate and invalidates dependent impacts, seal, and results.

### D. Field mapping and units

24. **Permitted fields and canonical units:** the integrated registry may
    initially include only a selected family. Existing explicitly named field
    candidates are:
    - `outerDiameterMm` — mm;
    - `wallThicknessMm` — mm;
    - `materialDensityKgM3` — kg/m³;
    - `unitPipeWeightKgPerM` — kg/m;
    - `fluidDensityOpeKgM3` and `fluidDensityHydKgM3` — kg/m³;
    - `fluidWeightOpeKgPerM` and `fluidWeightHydKgPerM` — kg/m;
    - `insulationThicknessMm` — mm;
    - `insulationDensityKgM3` — kg/m³;
    - `insulationWeightKgPerM` — kg/m;
    - `componentWeightKg` — kg;
    - `elasticModulusMpa` — MPa;
    - `secondMomentAreaMm4` — mm⁴;
    - `flexuralRigidityNm2` — N·m²;
    - `verticalState`, `supportType` — exact enumerations/strings;
    - `supportAvailabilitySensitivity` — exact scenario declaration, no
      physical unit.
    Process P1, T1/T2/T3, phase, and additional line-list fields are not
    permitted for production enrichment until questions 29 and 31 are resolved.

25. **Application scope by field:**
    - sections and material/pipe properties: exact entity, class+bore, or
      explicitly expanded line key;
    - component weight: catalog key or exact component entity; component
      type+bore only if the selected adapter authorizes an explicit target set;
    - fluid density/process: line key;
    - material density: material code or exact project mapping;
    - support capability: support kind or support entity;
    - support availability: exact support entity in a named scenario;
    - gravity, load factor, tolerances, active cases: project-level Project
      Data, not master enrichment.
    The exact first-family selector matrix is `UNKNOWN — BLOCKING`.

26. **Allowed conversions:** none currently. A future exact conversion registry
    must name source unit, canonical unit, formula, precision rule, and tests.

27. **Rejected units:** unknown, missing, ambiguous, compound units without a
    registered conversion, pressure/temperature without approved definitions,
    nominal-size strings treated as actual diameter, and every unit not in the
    registry.

28. **NB/OD/wall/ID:** nominal bore is a selector/category and is not OD.
    Outside diameter and wall thickness are independent analysis section
    geometry. Inside diameter is derived as `OD - 2 * wall` only after positive
    validation; it is never substituted for nominal bore.

29. **P1 and T1/T2/T3 definitions:** `UNKNOWN — BLOCKING`. Current aliases mix
    design and operating concepts and do not establish pressure/temperature
    authority or units.

30. **Load-case density:** `EMPTY` uses zero fluid mass; `OPE` uses approved
    operating fluid density by exact line key; `HYD` uses approved hydro-test
    fluid density by exact line key.

31. **Phase:** current intake maps a free-form `phase` field but has no
    integrated vocabulary or cross-density validation.
    `UNKNOWN — BLOCKING`.

32. **Zero values:** zero is meaningful for no insulation thickness and for
    EMPTY fluid mass. Zero component mass, material density, positive pipe
    dimensions, gravity, and load factor are not valid. Other zero semantics
    require field-specific registration.

33. **Precision:** contracts retain the finite numeric value supplied after
    registered conversion and canonical serialization. Current UI formatting is
    not a governed engineering precision policy. `UNKNOWN — BLOCKING` for
    display decimals, rounding, and delta comparison precision.

### E. Matching and proposal rules

34. **Exact-key matches:** target design is line-list by exact normalized line
    key; piping section by exact class+bore and, where applicable, component
    type+bore; material by exact material code; weight by an approved exact
    catalog or adapter key; support by exact support kind/entity. The current
    weight rows (`bore`, `rating`, `length`, `valveType`, `weight`) do not yet
    define the integrated exact target key. First-family keys are
    `UNKNOWN — BLOCKING`.

35. **Fuzzy algorithms:** current `fuzzyAutoMapFields` and line-list column
    detection may propose column mappings. No fuzzy row/entity algorithm is
    approved. Any future fuzzy proposal algorithm must be named and versioned;
    none may create a sealed binding.

36. **Proposal confidence:** show algorithm/version, source text/row, proposed
    exact target, score, runner-up score, score gap, matched tokens/rules,
    conflicting exact candidates, and affected target count. A score is
    advisory only.

37. **Acceptance granularity:** `UNKNOWN — BLOCKING` whether individual,
    reviewed group, or mapping-table acceptance is the product workflow.

38. **Accepted fuzzy to exact mapping:** create an immutable mapping row that
    names the source snapshot hash, source row semantic ID, exact normalized
    key, exact target ID set, field, mapping decision ID, approver evidence, and
    mapping hash. Future resolution uses that exact row, not the fuzzy result.

39. **Multiple exact master rows:** equivalent rows are duplicate diagnostics;
    different value/unit rows at the same authority block as ambiguity/conflict.

40. **One row to multiple entities:** allowed only when the mapping contract
    explicitly expands to a sorted exact target-ID set visible during review.
    Otherwise it remains a proposal and cannot seal.

41. **Class/service fill-down:** not authorized automatically.
    `UNKNOWN — BLOCKING` whether a field family permits it. If approved, the
    complete expanded exact target set, source row, and mapping decision must be
    reviewed and hashed.

42. **Legacy heuristics:** substring, branch-name, first-row, nearest geometry,
    proximity, fuzzy text, and DOM-only fill-down must be removed from final
    binding application. They may remain only as versioned proposal generators
    with no sealed authority.

### F. Evidence precedence and override policy

43. **Precedence:** confirmed unchanged:
    `EXPLICIT_SOURCE > ACCEPTED_OVERRIDE > AUTHORIZED_MASTER >
    USER_APPROVED_APPROXIMATION`.

44. **Explicit source:** a field-specific source extraction from the immutable
    normalized entity/shared-model evidence with exact source path and unit.
    Project-level fields explicitly authored and approved in Project Data remain
    Project Data authority. The exact per-field extraction registry is
    incomplete and blocks cutover.

45. **Override replacing explicit source:** no under the confirmed precedence.
    A contrary requirement would require an explicit governance revision,
    evidence class, approval rule, UI warning, and tests.

46. **Master replacement behavior:** a master may fill missing evidence and may
    supersede a lower-authority approximation. It may not replace explicit
    source or an accepted override. It may replace other imported evidence only
    if that evidence is explicitly classified below `AUTHORIZED_MASTER`, not by
    a subjective quality score.

47. **Authorized master:** a current immutable snapshot with valid SHA,
    supported master type, approved mapping, exact adapter version, allowed
    field family, no blocking diagnostics, and explicit authorization evidence.
    The authorizing role/evidence is `UNKNOWN — BLOCKING`.

48. **Approximation approver:** `UNKNOWN — BLOCKING`.

49. **Approximation expiry:** yes on source dataset/shared model, master,
    mapping, Project Data, exact target set, selector registry, or relevant
    dataset-version change.

50. **Same-authority conflicts:** display all candidates side by side with
    source rows, hashes, units, targets, and provenance; block. Resolution must
    create a new explicit mapping/override decision, never rely on ordering.

51. **Rejected candidates:** yes, retain them in the resolution and downloadable
    audit package with rejection reason.

### G. Geometry and topology impact

52. **Canonical geometry:** confirmed. Masters cannot change coordinates,
    ports, nodes, connectivity, branch placement, or component placement.

53. **3D refresh:** OD and insulation-envelope changes may require a display
    refresh if the approved display policy uses sealed analysis geometry. Wall,
    ID, density, mass, and section-property changes do not require centerline
    rebuild. The final display policy is blocking.

54. **3D diameter source:** `UNKNOWN — BLOCKING` whether source geometry, sealed
    section geometry, or a separate display policy is authoritative.

55. **Diameter mismatch:** present source display diameter and sealed analysis
    diameter together, with units, exact entity ID, source paths, delta, and
    status. Do not silently alter centerline or source display evidence.

56. **Support grouping fields:** only canonical source support coordinates,
    canonicalized source tag/assembly identity, branch/line identity, and the
    approved Project Data grouping tolerance. Master enrichment may not change
    these through the integration.

57. **Capability-only fields:** support type/capability mapping and vertical
    state affect qualification without regrouping physical sites. Availability
    is scenario-only.

58. **Support-unavailable sensitivity:** a named, hashed scenario projection
    bound to the exact source support entity and approval. The normal projection
    retains every source support.

59. **Route rebuilds:** section, fluid, material, and component-mass changes do
    not rebuild route topology. Support capability changes recompute affected
    support/path qualification. Availability scenarios rebuild only the
    scenario support/path view for routes incident to the exact support site.
    Canonical route partition rebuild is required only for governed topology or
    topology-policy changes.

60. **Step 2 authority violation:** any mismatch in canonical entity/port/node/
    edge IDs or counts, coordinates, connectivity, branch ownership, component
    placement, or deletion of a normal-projection source support.

### H. Calculation impact

61. **Base when no accepted result exists:** `UNKNOWN — BLOCKING`. The repository
    does not establish whether to compare with a fresh source-only shadow,
    `null` baseline, or another accepted package.

62. **Compared outputs:** per-entity mass ledger, per-route contributions,
    support reactions per load case, excluded inputs, blockers, equilibrium
    residuals, completeness status, method qualification, affected routes, and
    affected support sites. First-cut also compares path/beam/sag/sustained
    qualification and result identities where applicable.

63. **Delta classes and thresholds:** classifications are informational,
    warning, or blocking only under approved method rules.
    `UNKNOWN — BLOCKING` for numerical thresholds. Identity, blocker,
    qualification, source, and topology changes are exact and not tolerance
    based.

64. **Method-authoritative tolerances:** empirical equilibrium tolerances come
    from approved Project Data. First-cut geometry/equilibrium and sag criteria
    come from the explicit first-cut profile. No generic enrichment delta
    tolerance is authorized.

65. **Mass changed/reaction unchanged:** yes, material. It remains a mass/evidence
    delta even if reaction aggregation happens to be numerically unchanged.

66. **Partially qualified contributions:** audit only. The empirical contract
    labels them `PARTIAL_NOT_A_CALCULATED_REACTION`; they cannot be published as
    calculated support reactions.

67. **Qualification transitions:** READY/CALCULATED to BLOCKED; BLOCKED to
    READY/CALCULATED; COMPLETE to PARTIAL and reverse; first-cut
    QUALIFIED/CONDITIONAL/ESCALATE/BLOCKED/STALE transitions; case/path support
    qualification changes.

68. **Step 3 reproduction:** yes. Explicit post-seal calculation must reproduce
    the Step 3 candidate result hash for the same current source, seal,
    projection, engine/method version, and profile.

69. **Shadow/actual mismatch:** mark the actual result unaccepted and stale/
    inconsistent, retain both packages and exact hashes, report the mismatch as
    blocking, and require investigation/new impact analysis.

### I. Lifecycle and persistence

70. **Invalidation events:**
    - source import/reload/edit/version change invalidates candidate, all
      impacts, seal, derived models, and results;
    - master source/mapping/normalization/authorization change invalidates
      candidate, all impacts, seal, and results; rebuild only affected derived
      scopes after a new seal;
    - Project Data or selector/conversion registry change invalidates candidate,
      impacts, seal, relevant derived models, and results;
    - override/approximation/approval change invalidates candidate, impacts,
      seal, and results;
    - topology-policy/edit change also invalidates support/route models;
    - display-only navigation changes do not invalidate engineering inputs.

71. **Seal scope:** one current seal per workspace and exact dataset version,
    with historical seals retained as stale review records. It is not per user,
    although approval actors are retained.

72. **Prior seal review:** yes, reopen read-only with `STALE` status and exact
    invalidation reasons.

73. **Reload:** target behavior is complete restoration of current seal and every
    bound source snapshot, or `NOT_LOADED`. Partial authority restoration is
    prohibited.

74. **Missing saved master after reload:** report `NOT_LOADED`, invalidate
    dependent candidate/seal/results, retain metadata/audit history, and require
    explicit reattachment verified by SHA.

75. **Undo/redo:** topology undo/redo produces a current dataset state/version
    and does not resurrect prior seal/results. Master/mapping undo/redo is not
    governed today; any implementation must create a new current snapshot/hash
    and run normal invalidation.

76. **Topology-edit commit:** dataset version/shared-model hash changes; complete
    enrichment, impact, seal, derived-model, and result invalidation.

77. **Seal rollback:** yes, an earlier projection may be reactivated only after
    verifying all bound sources are current and producing a new current
    activation/seal identity. Earlier results remain stale until explicit
    calculation.

78. **Exports:** pre-seal review package and final result provenance export must
    include master snapshots/identities, mappings, full resolution including
    rejected candidates, Step 1/2/3 reports, approvals, seal, and all referenced
    hashes.

### J. User experience and approval

79. **Primary experience:** `UNKNOWN — BLOCKING`. Empirical preflight is the
    likely review integration point, but a new enrichment review tab or
    master-data surface has not been selected.

80. **Proposal authoring page:** `UNKNOWN — BLOCKING`.

81. **Final seal approval page:** `UNKNOWN — BLOCKING`.

82. **Pre-confirm summary:** exact source/dataset/master/mapping/profile hashes;
    changed fields and target counts; unresolved, ambiguous, conflicting, and
    approximation counts; affected entities/lines/classes/support sites/routes;
    Step 2 authority checks; Step 3 qualification and numerical deltas; approval
    identities; stale/current status; downloadable audit action.

83. **Grouping/filtering:** disposition, authority, field family/field, master
    source, exact selector, line/class/bore/catalog/support kind, affected
    entity/site/route, load case/method, approval state, and blocker code.

84. **3D focus:** use exact workspace `entityId` through the existing viewport
    selection event. Support-site rows resolve to exact member/primary entity
    IDs; route rows expose exact edge/entity IDs. Screen-space hits and mesh
    names are not accepted as identity.

85. **Confirmation dialogs:** accepting fuzzy-derived exact mappings; group
    expansion/fill-down; same-authority conflict resolution; approximation
    approval; seal confirmation; seal rollback/reactivation; destructive source
    or snapshot removal. Calculation remains a separate explicit action and may
    use the repository's normal action affordance unless product requires a
    dialog.

86. **Accessibility:** every control needs an explicit accessible name and
    programmatic relationship to the affected record; status summaries,
    blocker-count changes, stale transitions, proposal acceptance, and seal
    success/failure need live-region announcements. Exact wording, focus order,
    and conformance target are `UNKNOWN — BLOCKING` for release.

87. **Download before seal:** source/master manifest, mappings, proposal table,
    exact target expansion, full resolution, unresolved/conflicts, all three
    impact reports, proposed approvals, and deterministic hashes.

### K. Migration and compatibility

88. **Legacy production paths:** empirical calculation currently receives raw
    `masterDataController.getMasterData()` while numerical values are resolved
    primarily from approved Project Data; empirical preflight reads current
    master controller/store state; first-cut independently imports master
    records, resolves sidecars, creates an enriched cloned model, rebuilds
    derived models, seals assumptions, and calculates on confirm; older
    CII/DOM mapping/fill-down remains separate.

89. **First-cut fixtures:** retain all checks behind
    `check:first-cut-load-estimation`, `check:first-cut-beam-screening`,
    `check:first-cut-sustained-screening`, `check:first-cut-workbench`,
    `check:first-cut-anti-drift`, `check:first-cut-e2e`, and launcher/browser
    coverage. Exact fixture file inventory must be recorded in PR 1.

90. **Empirical baseline:** current `support-load-distribution/v3`,
    `CHAINAGE_TRIBUTARY_SPAN_V2`, workspace-contract checks, and the retained
    1885S empirical dataset/package form the compatibility surface. Exact
    accepted numeric fixture and tolerance set for shadow comparison is
    `UNKNOWN — BLOCKING`.

91. **Feature flag:** yes, one rollback-capable flag per field family. No global
    all-family switch.

92. **Shadow review:** retain deterministic base/candidate packages and delta
    reports on exact head, review affected fixtures and large model, require
    engineering/product signoff, and record expected numeric changes before
    activation. Signatory roles are `UNKNOWN — BLOCKING`.

93. **Rollback trigger:** any stale/hash/topology/authority violation,
    shadow/actual mismatch, newly blocked accepted case, unapproved
    approximation, regression, or exceeded approved numerical threshold.
    Numeric thresholds are blocking.

94. **Remove duplicate first-cut master import:** only after the shared snapshot
    and resolver cover all first-cut primary fields, compatibility adapter and
    migration pass, persisted workspaces are migrated, and browser/core parity
    evidence is retained.

95. **Remove DOM-only fill-down:** only after exact reviewed mapping/expansion is
    persisted and restored, the new review surface covers the workflow, and
    browser/anti-drift tests reject DOM evidence as calculation authority.

### L. Performance and scale

96. **Maximum counts:** `UNKNOWN — BLOCKING` for source entities, lines,
    supports, routes, rows per master, and candidate bindings.

97. **Maximum times:** `UNKNOWN — BLOCKING` for master normalization,
    resolution, Step 2 rebuild, Step 3 shadow calculation, and browser render.

98. **Worker stages:** normalization, large proposal/resolution, affected-scope
    Step 2 rebuild, and Step 3 shadow calculation should be worker-capable.
    Exact mandatory thresholds are `UNKNOWN — BLOCKING`.

99. **Cancellation/stale response:** every async request carries request ID and
    all current source/master/mapping/profile/projection hashes plus an
    `AbortSignal` or equivalent. Cancel superseded work. Discard any response
    whose request generation or bound hashes are not current. A stale response
    may never update stores, seals, or results.

100. **Large-model evidence:** retained real/portable model at the approved
     maximum scale; deterministic repeated identities; measured normalization,
     resolution, rebuild, shadow, render, peak binding, memory, cancellation,
     and stale-response behavior; repeated open/close cleanup; browser
     interaction evidence; retained logs/artifacts. Thresholds remain blocking.

### M. Release and evidence

101. **Exact-head workflows:** retain the full repository `gate`,
     `check:first-cut`, `check:workspace-contracts`,
     `check:1885s-empirical`, relevant first-cut/Load Calc browser coverage,
     strict syntax, imports, and build, plus a dedicated enrichment exact-head
     workflow. Exact workflow filenames/jobs and ownership are
     `UNKNOWN — BLOCKING` before implementation PR publication.

102. **Allowed statuses before cutover:** `BLOCKED`,
     `PASS_IMPLEMENTATION`, and `PASS_SHADOW`. `PASS_CUTOVER` is allowed only
     after an activated bounded family reproduces the approved shadow package.
     `PASS_RELEASE` requires the complete release matrix. Infrastructure
     failures remain separate.

103. **Step artifacts:**
     - snapshot: serialized contract, source/mapping/row hashes, focused tests;
     - resolution/Step 1: report JSON and proposal/conflict audit;
     - Step 2: base/candidate derived-model hashes and exact changed-scope report;
     - Step 3: retained base/candidate result packages and deltas;
     - seal: approval package and seal hash;
     - actual calculation: result bound to seal/projection hashes and
       reconciliation receipt;
     - browser/build/workflow: retained logs, traces/screenshots where relevant,
       artifact digest, exact head/base.

104. **Final package hashes:** source SHA/source snapshot byte and semantic hash,
     dataset ID/version, shared-model semantic hash, every master snapshot,
     mapping and normalized-row hash, Project Data hash, override/approximation
     set hashes, resolution hash, candidate/sealed projection hash, support-site
     and route-model hashes, all three impact hashes, seal hash, method/profile/
     assumption hashes, engine/version identity, and result hash.

105. **Status definitions:**
     - `PASS_IMPLEMENTATION`: bounded contracts/adapters/tests pass on exact
       head; shadow-only; no production authority or numeric behavior changed.
     - `PASS_SHADOW`: retained real fixtures and browser flow produce
       deterministic base/candidate impacts with approved explanations; accepted
       result remains unchanged.
     - `PASS_CUTOVER`: one approved field family is feature-flagged on,
       post-seal explicit actual calculation matches approved Step 3, rollback
       is proven, and no blocking unknown affects that family.
     - `PASS_RELEASE`: all intended families, lifecycle/persistence, legacy
       retirement, large-model, browser, exact-head, anti-drift, build, rollback,
       evidence, and signoff requirements pass. A bounded family pass alone is
       not release.
     - `BLOCKED`: product/engineering unknown, invalid/stale/conflicting
       evidence, failed check, or missing required artifact.
     - `PRE_STEP_INFRASTRUCTURE_FAILURE`: workflow allocated no executable
       steps/logs; it is neither product failure nor pass.

106. **Zero-step CI:** confirmed. A zero-step/no-log workflow is infrastructure
     failure, never PASS and never a product failure.

## Immediate implementation disposition

The next mergeable package may be a documentation-only or shadow-foundation PR
that does not depend on the blocking first-family selector/unit decision.
A PR claiming the full PR 1 adapter scope is blocked until at least these are
approved:

1. first field family;
2. exact key and target-set rules for that family;
3. canonical units and conversion/rejection table;
4. authorized-master and approximation approver evidence;
5. snapshot persistence/retention policy;
6. proposal acceptance workflow;
7. scale/performance limits and exact-head workflow ownership.

No production calculation behavior is authorized to change by this record.
