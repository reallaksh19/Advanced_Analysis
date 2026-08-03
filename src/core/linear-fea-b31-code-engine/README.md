# B31.3 code engine

This package evaluates one ASME B31.3 code point — `SUSTAINED`, `OCCASIONAL`, `DISPLACEMENT_STRESS_RANGE`, or `EXPANSION_RANGE_ENVELOPE` — from a sealed B-3.4 recovered local action, a sealed B-3.1 frame element, and caller-supplied edition/profile authorities into an immutable `lfea-b31-code-result/v1` record. It is the LFEA-B4.0 exit boundary for code-stress evaluation.

**Legal/spec boundary.** ASME B31.3 allowable-stress tables, temperature-dependent allowable values, and ASME B31J SIF/flexibility tables are copyrighted publications. Nothing in this package or its fixtures transcribes a real table value. Every allowable stress, weld/joint factor, occasional duration factor, displacement-range factor, sustained stress, and B31J index/SIF arrives as a caller-declared `{value, source}` authority. The package implements generic beam-stress arithmetic and the published ASME B31.3-2006 para. 302.3.5(d), Eq. (1b) combination structure; it embeds no licensed table data.

It does not assemble, solve, or recover finite-element quantities. The local action is exactly what B-3.4 recovered, and section/material records are the B-2.2/B-2.3 authorities already cited by B-3.1. It never modifies stiffness or recomputes a B-3.2 flexibility factor.

## Inputs

```text
codeProfile                  fea-b31-code-profile/v1
editionDataset               fea-b31-edition-dataset/v1
stressFactorSet              fea-b31-stress-factor-set/v1
category                     SUSTAINED | OCCASIONAL |
                             DISPLACEMENT_STRESS_RANGE |
                             EXPANSION_RANGE_ENVELOPE
codePointId                  canonical physical code-point identity
componentId                  must match stressFactorSet.componentId
combinationId                physical case or ordered case-pair identity
frameElementRecord           sealed fea-linear-frame-element/v1
sectionResolution            sealed nominal B-2.3 section resolution
sustainedSectionResolution   optional B-2.3 nominal-less-allowances section;
                             SUSTAINED only, null otherwise
materialResolution           sealed B-2.2 material resolution
localAction                  {fx,fy,fz,mx,my,mz} recovered by B-3.4
pressureStressContribution   required for SUSTAINED/OCCASIONAL;
                             null for both range categories
coldTemperature              required for both range categories to resolve Sc;
                             null for SUSTAINED/OCCASIONAL
sustainedStress              required for EXPANSION_RANGE_ENVELOPE as Eq. (1b) SL;
                             null for every other category
occasionalCategoryId         required for OCCASIONAL; null otherwise
```

The hot allowable `Sh` is resolved at `frameElementRecord.material.evaluationTemperature`. For `EXPANSION_RANGE_ENVELOPE`, `coldTemperature` is only the declared authority used to resolve `Sc`; it does not identify, order, or otherwise alter the two recovered `CASE_RANGE` endpoints.

`sectionResolution` and `materialResolution` are cross-checked against the frame element’s retained identities. A supplied `sustainedSectionResolution` is independently revalidated through B-2.3 and may replace area/inertia only for a `SUSTAINED` stress calculation. Its outer diameter must exactly match the nominal section.

## Code profile and edition dataset

The code profile declares the implemented metallic-process-piping scope, edition identity, interpolation policy, occasional duration factors, and the existing displacement-range combination policy. Unsupported scopes fail closed.

The edition dataset carries strictly increasing temperature/allowable-stress points, caller-declared displacement-range coefficients, and the weld/joint factor. Every numeric authority is traceable and extrapolation is prohibited.

The stress factor set carries three distinct directional-factor groups:

- `sustainedIndices` for `SUSTAINED`
- `occasionalIndices` for `OCCASIONAL`
- `displacementSifs` for both range categories

Applicability and user-override behavior reuse B-3.2’s authority; no factor is derived or clamped here.

## Recovered stress combination

`STRESS_COMBINATION_METHOD = DIRECT_PLUS_SRSS_BENDING_TORSION_V1`:

```text
axial            = (axialForce / area) * axialIndex
torsional         = (torsion / polarSectionModulus) * torsionalIndex
inPlaneBending    = (inPlaneMoment / sectionModulus) * inPlaneSif
outOfPlaneBending = (outOfPlaneMoment / sectionModulus) * outOfPlaneSif
calculatedStress  = |axial + pressure|
                  + sqrt(inPlaneBending^2 + outOfPlaneBending^2 + torsional^2)
```

Every numerator term is retained in `stressTerms`. Mechanical properties come from the selected sealed B-2.3 section authority; they are not recomputed from wall dimensions in this package.

## Allowables

`SUSTAINED` and `OCCASIONAL` use the resolved hot allowable multiplied by the declared weld/joint factor. `OCCASIONAL` additionally uses its declared duration factor.

`DISPLACEMENT_STRESS_RANGE` preserves the existing generic caller-declared weighted cold/hot allowable and cycle-reduction path. When the optional profile uplift switch is off or absent, no uplift is applied. M017 does not alter this category’s output.

`EXPANSION_RANGE_ENVELOPE` implements ASME B31.3-2006 para. 302.3.5(d), Eq. (1b):

```text
SA = f [1.25 (Sc + Sh) - SL]
```

`Sc` and `Sh` are resolved from the caller-supplied edition dataset, `SL` is the caller-declared traceable `sustainedStress`, and `f` is the caller-declared cycle-reduction factor. Missing `coldTemperature` or `sustainedStress`, a nonpositive computed allowable, or any hidden source fails closed. The profile’s separate uplift mechanism is not applied to Eq. (1b), because Eq. (1b) is already the selected liberal-allowable formula.

## Application-layer case sources

`linear-piping-code-application/b31-application.js` resolves actions from sealed B-3.4 recoveries:

- `SINGLE_CASE` is valid for `SUSTAINED` and `OCCASIONAL`.
- `CASE_RANGE` is valid only for `DISPLACEMENT_STRESS_RANGE` and `EXPANSION_RANGE_ENVELOPE`.

Both range categories reuse the same single componentwise subtraction implementation after proving that the two recoveries share one mechanical model and stiffness state. No second envelope or subtraction implementation exists.

The application layer also passes an optional `sustainedSectionResolution` through to `compileCodeResult` for `SUSTAINED`, making M015’s nominal-less-allowances section override available to a real production caller.

## Categories not evaluated

`OPERATING` and `USER_PROJECT_CHECK` remain explicitly refused with dedicated error codes. They are not automatically treated as B31.3 compliance categories.

## Record and identity

`lfea-b31-code-result/v1` retains the profile, code point, component, combination, category, resultants, factors, stress terms, calculated stress, allowable stress, utilization, governing rule, limitations, status, semantic hash, and evidence hash. Profile/dataset changes alter the governing identity and invalidate prior results. Blocking input defects throw fail-closed errors rather than returning a generic compliance badge.

## Checks

```text
npm run check:lfea-b4.0
npm run check:lfea-b4.1
npm run check:lfea-b4.3
npm run check:lfea-b4.4
npm run check:lfea-code-application
```

B4.0 retains the original category, hash, applicability, and displacement-range regressions. B4.4 proves the real two-recovery `CASE_RANGE` subtraction, independently evaluates Eq. (1b), proves use of `displacementSifs`, verifies required negative cases, demonstrates byte-identical existing `DISPLACEMENT_STRESS_RANGE` output, and exercises M015’s sustained-section override through the application layer.
