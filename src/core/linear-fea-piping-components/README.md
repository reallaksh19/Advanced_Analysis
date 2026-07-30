# Piping components

This package compiles one piping component — bend/elbow, branch/tee junction, reducer, valve/flange, rigid link or support offset — into an immutable `fea-linear-piping-component/v1` record: the B-3.1 elements it generates, its kinematic relations, its code stations, its declared flexibility with the proof that the flexibility was applied exactly once, its convergence evidence and its section 11 disclosures. It is the LFEA-B3.2 exit boundary (sections 3.4, 3.5, 4.3, 10.4 Ownership and 11).

It does not assemble. There is no DOF map, no sparse structure, no factorization and no reaction here — those are B-3.3. It evaluates no code stress, computes no SIF and reads no allowable — those are B-4.0. It also computes no B31J factor: a factor arrives as a declared factor set carrying its own source identity and applicability verdict, and this package applies it to stiffness and records that it did.

## Inputs

Every input is passed explicitly, and every upstream authority is re-accepted through its own validator rather than trusted or re-derived:

```text
componentId          canonical kernel identity
componentType        BEND | BRANCH_JUNCTION | REDUCER | VALVE_FLANGE | RIGID_LINK | SUPPORT_OFFSET
profile              fea-linear-piping-component-profile/v1
frameElementProfile  fea-linear-frame-element-profile/v1              (B-3.1)
localAxisProfile     frame local-axis profile                         (B-2.4)
material             fea-linear-material-resolution/v1                (B-2.2 validator)
section              fea-linear-pipe-section-resolution/v1            (B-2.3 validator)
factorSet            fea-linear-component-factor-set/v1 or null
```

The remaining keys are component-specific and exact-keyed per type: `arc` for a bend, `junctionId`/`junctionPosition`/`legs` for a junction, `start`/`end`/`stations` for a reducer, `massProperties`/`endConnections`/`bodyStiffnessMultiplier` for a valve or flange, `masterNodeId`/`slaveNodeId`/`offset`/`coupledDofs` for a rigid link, and `centerlinePosition`/`supportPointPosition`/`relocateCenterline` for a support offset.

Every generated span is compiled by `compileFrameElement`; this package derives no stiffness of its own. Component spans carry no releases, no end springs, no offsets and no load primitives — an end condition inside a fitting would be a second mechanism, and equivalent loads belong to the load compiler.

## Bend subdivision and the double-count proof

Arc geometry is consumed, not re-invented: `resolveBendArcCentre` fixes the centre and sweep from the tangent points and the incoming direction, `checkDeclaredRadius` cross-checks the declared radius against the geometry, and `discretiseBend` produces the chord chain.

The element count follows section 3.5 from the declared subdivision profile. Three declared rules compete and the strictest wins — maximum central angle per segment, minimum element count, and twice the minimum number of elements between the tangent and the mid-arc code station — and the winner is then raised to an even count so the mid-arc station falls exactly on a node. The count is only ever raised: no epsilon relaxes the angle limit, so a sweep that divides into exactly eighteen 5-degree segments in exact arithmetic may take nineteen in floating point and therefore twenty after parity. The governing rule, the declared limits and their sources are all carried in `subdivision`.

The flexibility factor divides the bending rigidity of each chord element, evaluated through the B-3.1 kernel with corrected inertias, so the correction is a change of input to the frozen formulation rather than a second formulation. Axial and torsional rigidity are untouched.

Section 3.5 requires proof that flexibility is not counted both in geometry segmentation and in component correction. `bendFlexibilityDoubleCountGuard` measures two independent quantities:

```text
geometricFlexibilityRatio  developed chord-chain compliance / straight tangent-to-tangent compliance
appliedCorrectionRatio     E*I measured off the compiled element / E*I measured off the corrected element
```

The second is a real measurement, not a restatement of the declared number: for the frozen frame formulation `K[RZi][RZi] - K[RZi][RZj] = 2 E I / L` exactly, with the shear parameter cancelling, so `measurePureBendingRigidity` reads the same quantity under Euler-Bernoulli and under Timoshenko. The guard blocks in both directions section 15.5 names — a factor whose declared basis already contains the arc geometry applied to a segmented arc is `PIPING_COMPONENT_BEND_FLEXIBILITY_DOUBLE_COUNT`, a measured correction below the declared factor is `PIPING_COMPONENT_BEND_FLEXIBILITY_OMITTED`, and a measured correction above it is a double count again. `branchFlexibilityGuard` applies the same measurement at a junction, where explicit refinement elements make a junction-inclusive factor a double count by construction.

`evaluateBendSubdivisionConvergence` compares the declared subdivision against a refined one under `CHAIN_UNIT_LOAD_BENDING_COMPLIANCE_V1`: a cantilevered chord chain fixed at the first tangent point and loaded in plane at the second, reporting tip displacement, fixed-end moment and developed length at both levels with their relative deltas. The fixed-end moment is statically determinate and therefore converged by construction; it is reported anyway, because a subdivision change that moved it would mean the arc had moved. When the profile requires convergence and the comparison misses the declared tolerance, the segmented-bend disclosure is `UNRESOLVED` and `acceptanceState` is `BLOCKED`.

## Flexibility ownership

Section 10.4 permits exactly one package to apply flexibility. A bend and a junction therefore publish a `fea-linear-flexibility-ownership-claim/v1` naming the owning package, the targets it claimed, the factor set and its source identity, and the guard that proved single application. A junction whose method applies no flexibility still publishes a claim with `applied: false`, because "nobody owns this junction's rotational flexibility" is exactly the fact a later package needs.

`assertSingleFlexibilityOwnership` is the check B-4.0 runs before consuming resultants and factors. It refuses a second claim on an already-claimed target (`..._OWNERSHIP_CONFLICT`) and any claim from another package that says it applied flexibility (`..._OWNERSHIP_FOREIGN`).

## Components

Branch classification is `DIRECTION_VECTOR_TOPOLOGY_V1`: leg directions are taken outward from the junction, the run is the most nearly anti-parallel pair, and a rival pair within the declared collinearity tolerance blocks as ambiguous. Nominal diameters may be supplied and are retained as evidence; the classifier never reads them, and `classification.diameterConsulted` is permanently false. Junction rotational flexibility is applied to the branch leg only.

The reducer is a stepped chain whose stations own the spans that begin at them, with an explicit station-to-section mapping and a `CONDITIONAL` approximation disclosure; the tapered formulation is a separate compiler and selecting it is blocked, never downgraded to the stepped one. The valve or flange keeps its real length, mass, centre of gravity and end-connection identity, and its rigidity multiplier is a declared policy under the rigid rule or a declared component value under the semi-rigid one; a zero-length body blocks unless the weight-lump rule explicitly selects it. The rigid link generates no element at all — it is a kinematic relation with `codeStressEligible: false`, re-checked when the record is re-accepted. The support offset transfers to the support steel point as a rigid kinematic relation or as an explicit beam link, and the pipe centreline position is retained in the record; a request to move it is `PIPING_COMPONENT_CENTERLINE_RELOCATION_PROHIBITED`.

## Applicability and overrides

`applicability.status` is the factor set's own verdict. `OUTSIDE_RANGE` blocks with `PIPING_COMPONENT_B31J_APPLICABILITY_EXCEEDED`, and `USER_FACTOR_REQUIRED` blocks with `PIPING_COMPONENT_USER_FACTOR_REQUIRED` unless an override carrying reason, source, revision and approver is supplied — an override changes the factor set's semantic identity and adds its own `CONDITIONAL` disclosure. The profile's `outsideApplicabilityRule` accepts only `BLOCK`; anything else is refused by identity, because a clamped factor is indistinguishable from a qualified one once it reaches a stiffness matrix. A factor set that distinguishes in-plane from out-of-plane flexibility is blocked rather than averaged into the single scalar the implemented formulation accepts.

## Record and identity

The sealed record carries component identity and formulation, the profile hash, component geometry, subdivision decision, the generated elements with their B-3.1 records and effective matrices, kinematic relations, code stations, mass properties, section mapping, end connections, branch classification, flexibility with its guard, the ownership claim, the convergence report, sorted section 11 disclosures and the folded `acceptanceState`.

`semanticHash` is computed by `shared-piping-model/canonical-json.js` over everything but itself; this package implements no hash of its own. `requirePipingComponent` re-accepts a record by exact keys, structural completeness, the rigid-relation code-stress prohibition and hash, refusing a stale hash with `PIPING_COMPONENT_HASH_MISMATCH` and a disclosure set that disagrees with its own acceptance state with `PIPING_COMPONENT_ACCEPTANCE_STATE_INCONSISTENT`.

## Checks

```text
npm run check:lfea-b3.2
```

`scripts/lfea-b3.2-piping-component-check.mjs` holds the contract check and the section 15.2 component benchmarks — BEND-01 (90-degree elbow subdivision, flexibility application, double-count guard and convergence) and BRANCH-01 (direction classification and factor ownership) — plus the reducer, valve/flange, rigid link and support-offset exit boundaries. `scripts/lfea-b3.2-reviewer-check.mjs` holds the permanent deliberate regressions (section 15.5) and `scripts/lfea-b3.2-source-guard.mjs` reads the package as text. The check runs inside `check:lfea-core` and therefore inside `gate`.
