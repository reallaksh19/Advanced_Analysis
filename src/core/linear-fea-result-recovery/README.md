# Result recovery

This package recovers element end actions, element force-field distributions and component code-point resultants from one sealed `fea-linear-execution/v1` (B-3.3), the B-3.1 frame elements and B-3.2 piping components it was assembled from, and the B-3.0 physical load case it was solved against, into an immutable `fea-linear-recovery/v1` record — plus a pure post-processing fold of several such recoveries into a `fea-linear-recovery-envelope/v1`. It is the LFEA-B3.4 exit boundary (sections 9, 9.1).

It does not re-solve or touch the stiffness, assembly or factorization — those are B-3.3's, cited here and never recomputed. It evaluates no B31.3 stress, allowable, SIF or utilization — those are B-4.0's, strictly out of scope even though envelopes conceptually feed them later.

## Inputs

Every input is passed explicitly and re-accepted through its own package's validator, never trusted or re-derived:

```text
compilation       fea-linear-mechanical-model-compilation/v1   (B-2.5 validator)
execution         fea-linear-execution/v1, QUALIFIED or CONDITIONAL (B-3.3 validator)
loadCase          fea-linear-physical-load-case/v1, the one the execution solved against (B-3.0 validator)
frameElements     sealed fea-linear-frame-element/v1 records, one per bare model element
pipingComponents  sealed fea-linear-piping-component/v1 records, one per component-generated model element group
recoveryProfile   fea-linear-recovery-profile/v1
```

An execution whose `status` is `BLOCKED` is refused with `RECOVERY_EXECUTION_BLOCKED` — a blocked execution has no reaction or displacement worth recovering. An execution/compilation/load-case triple that does not cite the same model and load-case identity is refused (`RECOVERY_EXECUTION_MODEL_MISMATCH`, `RECOVERY_EXECUTION_LOAD_CASE_MISMATCH`). A model element with no supplied frame element or component contribution is `RECOVERY_ELEMENT_MISSING`; a duplicated one is `RECOVERY_ELEMENT_DUPLICATE` — the same discipline B-3.3's assembly applies to element contributions.

## Element end action

The frozen B-2.0 recovery shape, evaluated with a solved global displacement this package never computed:

```text
q_local = K_local d_local - equivalentLoadVector.local - initialStrainLoadVector.local
```

`K_local` is the element's own sealed local stiffness (a piping-component element's already flexibility-corrected `effectiveLocalStiffness`; a bare element's own `localStiffness`). `d_local` is recovered from the execution's solved joint displacement through the element's own citations only: the B-2.4 axis rotation (`transformation.matrix`) and, when declared, the B-3.1 rigid-offset kinematic map (`frameOffsetMatrix(rigidOffsets)`), applied forward through one small additive B-3.1 export, `transformDisplacementToLocal` (the plain `d_local = T d_global` identity B-3.1 had never needed until a solved displacement had to be recovered back into local components — B-3.1's own `transformStiffnessToGlobal`/`transformLoadToGlobal` only ever needed the transpose direction). Neither the stiffness nor the transformation is re-derived; both are consumed exactly as B-3.1 sealed them.

The record retains both local and global forms (`retainLocalAndGlobalActions` in the profile, required `true`), local in the element's own axes and global transformed the same way B-3.1 transforms its own load vectors (`transformLoadToGlobal`, then the offset map again when offsets are declared) — so a global end action is expressed at the same physical joint the solver's global displacement and reaction vectors already use.

**Hand-verified equilibrium check.** For the B-3.3 cantilever fixture, the only element attached to the fixed node is `E-000120`. Nodal equilibrium at that node (no other attachment, no external nodal load there) collapses to `reaction == qI_global(E-000120)` exactly — the `R = K U - F` "support acting on structure" convention and the `q_local` "joint acting on element" convention describing the same physical joint from two directions. `scripts/lfea-b3.4-recovery-check.mjs` (B34-T02) asserts this to `1e-6` absolute across all six DOFs, and it was verified by hand with concrete numbers (`node --input-type=module`) before the check was written — this is exactly the check that would have caught the two defects a prior LFEA package shipped with (see "Reviewer regressions" below).

## Element force field

Section 9's "axial, torsion, shear and bending distributions at governed stations", built by closed-form equilibrium from the I-end local action, integrating the same `DISTRIBUTED_LOAD` primitives (`UNIFORM`/`LINEAR` only — the shapes B-3.0/B-3.1 already support) B-3.1 bound into the element, matched back to the load case by `primitiveId` and re-verified by `semanticHash` against the element's own `appliedLoads` citation (`RECOVERY_APPLIED_LOAD_PRIMITIVE_MISSING`/`_MISMATCH` otherwise). A second additive B-3.1 export, `localDistributedLoadIntensity`, exposes the exact same basis-rotation logic `distributedLoadLocalVector` already uses internally, so the force field's local intensity and the equivalent nodal load's local intensity cannot silently disagree about what "local" means for a `GLOBAL`-basis primitive.

At local coordinate `x` from the I end, with local distributed intensity `w(s) = a + (b - a) s / L`:

```text
N(x)  = -(qI.fx + integral_0^x w_x)
T(x)  = -qI.mx
Vy(x) = -(qI.fy + integral_0^x w_y)
Vz(x) = -(qI.fz + integral_0^x w_z)
My(x) = -qI.my - x qI.fz - integral_0^x (x - s) w_z(s) ds
Mz(x) = -qI.mz + x qI.fy + integral_0^x (x - s) w_y(s) ds
```

both integrals evaluated in closed form for the `UNIFORM`/`LINEAR` intensity shape. This is a *different* convention from the element end action's `q_local` (joint-on-element): `stationAction(x)` plays the role a virtual joint at `x` would, so `stationAction(0) = -qI`-shaped and `stationAction(length)` equals `qJ` exactly — verified directly (B34-T03, B34-T04) against a closed-form cantilevered UDL span (`V(0) = wL`, `M(0) = wL^2/2`, `V(L/2)`/`M(L/2)`, and a zero end action at the free tip).

Stations are evenly spaced from `fraction 0` (I) to `fraction 1` (J) inclusive, `elementForceStationsPerSpan` of them (declared, `>= 2`).

## Component result and code-point stations (section 9.1)

Every code station every current B-3.2 component publishes (`CODE_STATION_KEYS`: bend tangent/mid-arc, reducer section change, valve/flange ends) carries a `nodeId` that is exactly the I or J node of one of that component's own compiled elements — the correspondence B-3.2's bend subdivision is forced to an even element count to guarantee ("the mid-arc station falls exactly on a node"). `EXACT_NODE_ELEMENT_END_MATCH_V1` is therefore the one interpolation/extrapolation method this package implements: locate the matching element end and report its already-recovered action directly. A station that does not land on any compiled element's node is refused (`RECOVERY_CODE_STATION_NOT_LOCATABLE`) rather than smoothed across the gap — section 9.1's "never uses visually smoothed viewport values" — since off-node interpolation is not exercised by any current component and is not invented here to cover a case that cannot yet occur.

An internal chain node (a reducer/bend station shared by one element's J end and the next element's I end) has two candidates. **Both are real, but they are not simply equal.** The frozen `oppositeAction` rule (`ELEMENT_ACTION_ON_JOINT_IS_NEGATIVE_OF_REPORTED_END_ACTION`) means nodal equilibrium at that shared joint reads

```text
candidate1.global + candidate2.global == externalNodalLoadAtNode
```

not `candidate1 == candidate2`. Comparing the two candidates' raw local values for equality was the first real defect this package's own hand-verification caught (see below) — it disagrees by very nearly a factor of two at every internal node, not by solver noise, and every worked example in the check suite would have "passed" a naive equality check only because it never got the chance to disagree by enough to fail a loose tolerance. `worstEquilibriumResidual` compares in **global** components (local axes can differ in orientation between two elements at a junction) and folds in any `NODAL_FORCE_MOMENT` applied directly at that node (`recovery.js`'s `buildNodalLoadIndex`), so the evidence is a genuine free-body balance rather than an equality that happens to hold only when nothing is attached at the far side. A disagreement beyond the declared `codePointConsistencyTolerance` blocks (`RECOVERY_CODE_POINT_INCONSISTENT`) rather than silently picking one candidate.

## Envelope (section 9 "Envelope")

`foldRecoveryEnvelope` is a pure post-processing fold over already-recovered per-case component resultants — max/min/absolute-max per code point per local-action quantity (`fx, fy, fz, mx, my, mz`), retaining which execution/load-case governs each entry. No re-solve happens. Every folded recovery must share `modelIdentity`, `modelRevision`, `mechanicalModelSemanticHash` and `stiffnessStateHash` (`RECOVERY_ENVELOPE_MODEL_MISMATCH` otherwise — a genuinely different model has no comparable code points) and must cover the identical set of code points (`RECOVERY_ENVELOPE_CODE_POINT_MISSING`/`_MISMATCH`).

## Record and identity

`fea-linear-recovery/v1` carries the recovery-profile hash, the cited `mechanicalModelSemanticHash`/`stiffnessStateHash`/`physicalLoadCaseHash`/`executionHash` (cited, never re-derived), the execution's own `status` as `executionStatus`, every element's end action (local and global), every element's force field and every component's code-point resultants with their interpolation method and consistency evidence. `semanticHash` is computed by `shared-piping-model/canonical-json.js` over everything but `semanticHash`, `evidenceHash` and `recoveryHash` itself; `recoveryHash` sits after `executionHash` in the section 2.1 identity chain. `requireResultRecovery` re-accepts a record by exact keys, structural completeness and hash, refusing a stale one with `RECOVERY_HASH_MISMATCH`.

Every draft object this package builds is a plain object/array literal; only the single top-level `deepFreeze` call (mirroring B-3.3's own sealing pattern) ever freezes them. This is deliberate: `shared-piping-model/immutable.js`'s `deepFreeze` skips recursing into any value that is already frozen (`Object.isFrozen(value)`), so a nested `Object.freeze` called by this package on a sub-object *before* the final seal would silently leave that sub-object's own still-mutable children unfrozen forever — the second real defect a prior LFEA package shipped with, and the reason the source guard forbids `Object.freeze` outside `recovery-contract.js`'s own static key-list constants.

## Reviewer regressions (why this README calls out two specific bugs)

The orchestrating review for this package caught two real defects by hand-exercising the module with concrete numbers rather than trusting assertions written to match whatever the code produced:

1. **A hash-projection function that included a field only set after the first hash computation.** Had `recoverySemanticProjection` included `recoveryHash` in the fields it hashes, every re-validation after the draft's empty-string placeholder was replaced by the real hash would recompute to a *different* value and report a false "stale hash" forever. `recoverySemanticProjection`/`envelopeSemanticProjection` explicitly exclude `recoveryHash`/`envelopeHash` (and `semanticHash`/`evidenceHash`) from their own hash input, mirroring the fix B-3.3 already carries for `executionHash`.
2. **The code-point consistency check comparing two elements' end actions for raw equality** instead of the actual nodal-equilibrium balance (see above) — wrong by a sign at every shared internal node, caught only by building the reducer fixture, computing the expected numbers by hand, and finding the two candidates disagreed by very nearly a factor of two.

`scripts/lfea-b3.4-reviewer-check.mjs` proves both directly against live sealed evidence, plus a floating deepFreeze-recursion check and the BLOCKED-execution/cross-compilation-envelope refusals.

## Checks

```text
npm run check:lfea-b3.4
```

`scripts/lfea-b3.4-recovery-check.mjs` holds the contract check and benchmarks — a UDL cantilever (element end action against the free-body reaction, and force-field stations against closed-form cantilever shear/moment) and a stepped reducer component (code-point recovery at a trivial single-candidate station and at a shared internal node, an externally-loaded internal node, and envelope folding across two load cases) — plus every fail-closed refusal. `scripts/lfea-b3.4-reviewer-check.mjs` holds the permanent deliberate regressions (section 15.5, including the two defects above) and `scripts/lfea-b3.4-source-guard.mjs` reads the package as text. The check runs inside `check:lfea-core` and therefore inside `gate`.
