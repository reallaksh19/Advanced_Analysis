# B31.3 code engine

This package evaluates one ASME B31.3-2024 code point — SUSTAINED, OCCASIONAL or DISPLACEMENT_STRESS_RANGE — from a sealed B-3.4 recovered local action, a sealed B-3.1 frame element (for section/material identity citation), and three caller-supplied edition-profile artifacts, into an immutable `lfea-b31-code-result/v1` record. It is the LFEA-B4.0 exit boundary (sections 10, 11, 15.2 B31-SUS-01/B31-EXP-01/B31-OCC-01).

**Legal/spec boundary (section 10 banner, section 1.2).** ASME B31.3 allowable-stress tables, temperature-interpolated allowable values and ASME B31J SIF/flexibility tables are copyrighted publications. Nothing in this package or its fixtures transcribes a real ASME table value. Every allowable stress, weld/joint factor, occasional duration factor, displacement-range coefficient and B31J index/SIF arrives as a caller-declared `{value, source}` entry inside a caller-supplied `fea-b31-edition-dataset/v1` or `fea-b31-stress-factor-set/v1` record. This package implements only the generic combination arithmetic (F/A, M/Z, a weighted cold/hot range, an SRSS bending+torsion fold) under a symbolic named rule ID — never a licensed formula's actual coefficients. Every fixture value is a clearly fictional, round, illustrative number, and every fixture `source` string is literally `FIXTURE-EDITION-DATASET-NOT-ASME` or `FIXTURE-B31J-FACTOR-SET-NOT-ASME`, so nobody could mistake it for real ASME data. A real deployment plugs a licensed, user-authorized edition dataset into exactly these same fields.

It does not assemble, solve or recover any finite-element quantity: the local action at a code point is exactly what B-3.4 already recovered, and the section/material are exactly the records B-2.2/B-2.3 already resolved and B-3.1 already retained. It never touches stiffness or a B-3.2 flexibility factor — section 10.4 Ownership belongs to B-3.2, and this package only ever reads its `requireFactorApplicability` verdict.

## Inputs

```text
codeProfile         fea-b31-code-profile/v1          (sealed via sealCodeProfile)
editionDataset       fea-b31-edition-dataset/v1        (sealed via sealEditionDataset, caller-supplied)
stressFactorSet      fea-b31-stress-factor-set/v1      (sealed via sealStressFactorSet, caller-supplied)
category             SUSTAINED | OCCASIONAL | DISPLACEMENT_STRESS_RANGE
codePointId          canonical kernel identity (section 9.1 physical code point)
componentId          canonical kernel identity; must match stressFactorSet.componentId
combinationId        canonical case (or case-pair) identity
frameElementRecord    sealed fea-linear-frame-element/v1 (B-3.1 validator)
sectionResolution     sealed fea-linear-pipe-section-resolution/v1 (B-2.3 validator; for outer diameter)
materialResolution    sealed fea-linear-material-resolution/v1 (B-2.2 validator; for material identity)
localAction           {fx,fy,fz,mx,my,mz} — the B-3.4 recovered local action at this code point
pressureStressContribution  {value, source} — required for SUSTAINED/OCCASIONAL, null for DISPLACEMENT_STRESS_RANGE
coldTemperature       {value, source} | null — required only for DISPLACEMENT_STRESS_RANGE
occasionalCategoryId  text | null — required only for OCCASIONAL, matching a profile.occasionalDurationFactors entry
```

The hot/operating evaluation temperature is never re-declared: it is cited from `frameElementRecord.material.evaluationTemperature`, the exact value B-2.2 already resolved for this element. `sectionResolution`/`materialResolution` are cross-checked against the frame element's own retained `resolutionSemanticHash`/`materialStateId` (`CODE_ENGINE_SECTION_MISMATCH`/`CODE_ENGINE_MATERIAL_MISMATCH`) — the frame element retains only `sectionStateId`/`area`/`secondMomentY`/`secondMomentZ`/`polarMoment` (no outer diameter) and only `materialStateId`/`evaluationTemperature` (no materialId), so the full resolutions are cited alongside it rather than re-derived.

## Code profile (section 10.1)

`fea-b31-code-profile/v1` declares: `scope` (blocked with `CODE_ENGINE_SCOPE_NOT_IMPLEMENTED` for `CHAPTER_IX_HIGH_PRESSURE_PIPING`/`K_SERVICE_PIPING`/`NONMETALLIC_PIPING`/`DETAILED_FATIGUE_ANALYSIS`); `editionStandard`/`flexibilitySource` (frozen to `ASME_B31_3_2024`/`ASME_B31J_2023`, or `flexibilitySource: null` where not applicable); `temperatureInterpolationPolicy` (`EXACT_MATCH_ONLY_V1` or `LINEAR_BRACKET_INTERPOLATION_V1` — the method is generic and declared, the underlying values are never embedded); `displacementRangeCombinationRuleId` (the one generic weighted-combination rule this package implements); `occasionalDurationFactors` (an array of declared, per-category duration/occurrence factors — never a global multiplier); `liberalAllowableUse` (an explicit boolean switch, default-refusing any non-null uplift factor when false) and `liberalAllowableUpliftFactor` (required, declared, only when the switch is true).

## Edition dataset (section 10.5) and stress factor set (section 10.4)

`fea-b31-edition-dataset/v1` carries `allowablePoints` (strictly increasing temperature/allowable-stress pairs), `displacementRangeCoefficients` (`coldWeight`/`hotWeight`/`cycleReductionFactor`) and `weldJointFactor` — every one a declared `{value, source}` entry with a traceable (non-hidden-default) source.

`fea-b31-stress-factor-set/v1` is this package's own caller-supplied B31J-derived factor record — distinct from B-3.2's stiffness-only flexibility factor set, since B31J also produces stress indices/SIFs that never touch stiffness. It carries `applicability` (reusing B-3.2's `FACTOR_APPLICABILITY_STATUSES`/`requireFactorApplicability` directly — `OUTSIDE_RANGE` blocks, `USER_FACTOR_REQUIRED` blocks unless a complete `userOverride` with reason/source/revision/approver is supplied), `momentDirectionMapping` (which of the recovered `my`/`mz` fields is in-plane vs out-of-plane — never collapsed into one scalar), and three distinct directional-index groups: `sustainedIndices`, `occasionalIndices`, `displacementSifs`. SUSTAINED reads only `sustainedIndices`, OCCASIONAL only `occasionalIndices`, DISPLACEMENT_STRESS_RANGE only `displacementSifs` — proved never to cross-apply by `lfea-b4.0-reviewer-check.mjs`.

## Stress combination (section 10.3)

`STRESS_COMBINATION_METHOD = DIRECT_PLUS_SRSS_BENDING_TORSION_V1`: generic beam mechanics, symbolically named, never a licensed table.

```text
axial            = (axialForce / area) * axialIndex
torsional         = (torsion / polarSectionModulus) * torsionalIndex
inPlaneBending    = (inPlaneMoment / sectionModulus) * inPlaneSif
outOfPlaneBending = (outOfPlaneMoment / sectionModulus) * outOfPlaneSif
calculatedStress  = |axial + pressure| + sqrt(inPlaneBending^2 + outOfPlaneBending^2 + torsional^2)
```

Every numerator term is retained on the record (`stressTerms`) before combination, per section 10.3's reviewer-reproducibility requirement. `area`/`sectionModulus`/`polarSectionModulus` come from the frame element's own retained section and the cited `sectionResolution.dimensions.outerDiameter` — generic beam geometry, never a licensed value.

Allowable construction: SUSTAINED/OCCASIONAL compare against the hot allowable (resolved at the element's own evaluation temperature) scaled by the declared weld/joint factor, further scaled by the category's declared duration factor for OCCASIONAL. DISPLACEMENT_STRESS_RANGE compares against `(coldWeight * coldAllowable + hotWeight * hotAllowable) * cycleReductionFactor`, optionally uplifted by the declared liberal-allowable factor when the profile's switch is on (default off) — every coefficient a caller-declared edition-dataset/profile value, never a numeric table embedded here.

## Categories not evaluated (section 10.2)

OPERATING and USER_PROJECT_CHECK are refused with dedicated codes (`CODE_ENGINE_OPERATING_NOT_A_COMPLIANCE_CATEGORY`, `CODE_ENGINE_USER_PROJECT_CHECK_NOT_A_COMPLIANCE_CATEGORY`) rather than silently treated as a compliance check — section 10.2 is explicit that neither is automatically B31.3 acceptance. EXPANSION_RANGE_ENVELOPE (`CODE_ENGINE_EXPANSION_RANGE_ENVELOPE_NOT_IMPLEMENTED`) is not implemented this phase — a case-pair identity and difference formula are not invented here to cover a shallow implementation.

## Record and identity (section 10.6)

`lfea-b31-code-result/v1` mirrors the spec's exact schema (`codeProfileId`, `codePointId`, `componentId`, `combinationId`, `category`, `resultants`, `factors`, `stressTerms`, `calculatedStress`, `allowableStress`, `utilization`, `governingRuleId`, `limitations`, `semanticHash`, `evidenceHash`) plus a `status` field carrying exactly the section 10.7 vocabulary (`QUALIFIED UNDER CONFIGURED PROFILE` / `CONDITIONAL`; this package never returns `BLOCKED` — every blocking condition is a thrown fail-closed refusal instead, the same discipline every other LFEA package applies). `governingRuleId` folds a fragment of both the code-profile's and the edition-dataset's own semantic hashes into its identity string, so a code profile or edition-dataset change invalidates a prior code result's hash even if a caller reuses the same human-readable `codeProfileId` (section 15.5). `semanticHash` is computed by `shared-piping-model/canonical-json.js` over everything but `semanticHash`/`evidenceHash`; `requireCodeResult` re-accepts a record by exact keys, structural completeness and hash, refusing a stale one with `CODE_ENGINE_HASH_MISMATCH`.

## Checks

```text
npm run check:lfea-b4.0
```

`scripts/lfea-b4.0-code-engine-check.mjs` holds the contract check and the section 15.2 benchmarks (B31-SUS-01 sustained stress/allowable hand calculation, B31-OCC-01 category-traceable duration factor, B31-EXP-01 cold/hot weighted displacement range) against the B-3.4 REDUCER-01 fixture's recovered code points, plus every fail-closed refusal. `scripts/lfea-b4.0-reviewer-check.mjs` holds the permanent deliberate regressions (section 15.5: self-referential hash projection, displacement-SIF/sustained-index cross-application, profile/dataset-change hash invalidation, silently-clamped B31J applicability, deepFreeze recursion). `scripts/lfea-b4.0-source-guard.mjs` reads the package as text. The check runs inside `check:lfea-core` and therefore inside `gate`.

Before trusting the check script, a SUSTAINED calculation was hand-verified with a one-off `node --input-type=module` script against the fixture's fictional round numbers: axial 0 + pressure 5,000,000 direct, bending `400 / sectionModulus ≈ 2,872,937.50` (section modulus computed from the actual B-2.3-resolved area moment of inertia and outer radius), combined stress ≈ 7,872,937.50 against an allowable of `90,000,000 * 0.9 = 81,000,000`, utilization ≈ 0.0972 — matching the module's own output exactly.
