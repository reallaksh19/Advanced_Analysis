# Runtime B31 Factor Calculator — Benchmark Technical Report and Record

## 1. Document control

| Field | Value |
|---|---|
| Repository | `reallaksh19/Advanced_Analysis` |
| Branch | `agent/b31-factor-calculator` |
| Parent calculator commit | `5b5e82c3312e3dbc2c0d3ed5bb13a487c16e770a` |
| Related pull request | PR #595, *Runtime B31 SIF and flexibility-factor calculator* |
| Appendix D work item | Issue #601, M026 |
| B31J follow-on | Phase-2 benchmark and rule disposition on the same calculator branch |
| Report date | 2026-08-04 |
| Length basis | SI metres |

This report is the review record for the two benchmark suites added to the runtime B31 factor calculator:

- `benchmarks/LFEA/B31_APPENDIX_D/M026_Appendix_D_Factor_Benchmarks.json`
- `benchmarks/LFEA/B31J/B31J_Phase2_Factor_Benchmarks.json`

The corresponding executable checks are registered as `check:lfea-b3.20` and `check:lfea-b3.21`. The report does not replace the machine-readable records; it explains their authority, classification, equations, tolerances, numerical coverage, and qualification boundary.

## 2. Scope and ownership boundary

The calculator derives and seals flexibility factors and stress-intensification factors. It does not apply flexibility to element stiffness and does not calculate code stress. Existing ownership remains unchanged:

- B-3.2 is the sole flexibility-factor applier.
- B-4.0 is the stress-factor consumer.
- B-4.5 verifies calculator-to-contract integration.

The combined benchmark covers 18 geometry cases:

| Standard profile | Bends | Welding tees | Reducers | Total |
|---|---:|---:|---:|---:|
| B31.3-2018 Appendix D | 3 | 3 | 3 | 9 |
| B31J-2017 / B31J-2023 | 3 | 3 | 3 | 9 |
| **Combined** | **6** | **6** | **6** | **18** |

## 3. Evidence classification

Each fixture records its evidence class explicitly.

- **Class (a): externally published numeric or rule authority.** The Appendix D reducer cases use the explicit Table D300 unity row. A class-(a) label does not imply that every geometry dimension is independently published; it identifies the governing published value being tested.
- **Class (b): controlled independent derivation.** The reference is recomputed step by step from a cited equation using declared geometry. It is a deterministic regression oracle, not an independently published numerical result.

No class-(b) case is described as externally verified. Public vendor examples that omit sufficient geometry are retained only as cross-check evidence, not converted into fabricated direct benchmarks.

## 4. Source record

### 4.1 Governing and official sources

| Source | Use in this record |
|---|---|
| ASME B31.3-2018, Appendix D, Table D300 | Legacy bend and welding-tee equations; explicit reducer `k=1`, `i=1.0` row. |
| ASME B31J-2017, Table 1-1, General Notes (3) and (6) | Smooth 90-degree bend flexibility selection and verified welding-tee reduction. The reviewed excerpt was supplied for this work; standard text is not redistributed. |
| ASME B31J product page | Standard identity, scope, and B31J-2023 edition status. |
| Hexagon CAESAR II B31J methods documentation | Independent implementation cross-check for `1.3/h` smooth-90 flexibility and the `1.26` verified-tee divisor. |
| ASME PVP2023-106810, *A Review of Stress Intensification Factors for Reducers* | Independent confirmation that Appendix D used reducer SIF `1` and B31J introduces geometry-dependent values up to `2`. |
| EPRI 1008906, *Investigation of Stress Indices and Directional Loading of Eccentric Reducers* | Reducer equation/test background and directionality context. |
| ASME B36.10M and cited pipe-dimension tables | Real NPS/schedule geometry for Appendix D size coverage. |

### 4.2 Public references

- ASME B31J product page: https://www.asme.org/codes-standards/find-codes-standards/b31j-stress-intensification-factors-flexibility-factors-determination-metallic-piping-components
- ASME B36.10M product page: https://www.asme.org/codes-standards/find-codes-standards/b36-10m-welded-seamless-wrought-steel-pipe
- Hexagon B31J methods: https://docs.hexagonppm.com/r/en-US/CAESAR-II-Users-Guide/15/1230689
- ASME PVP2023-106810 reducer paper record: https://pvp.secure-platform.com/a/solicitations/199/sessiongallery/14093/application/106810
- EPRI report 1008906: https://restservice.epri.com/publicdownload/000000000001008906/0/Product
- Bentley welding-tee system example: https://bentleysystems.service-now.com/community?id=kb_article_view&sysparm_article=KB0038260

The fixture files contain more granular source metadata, including source titles, URLs, derivation steps, and the SHA-256 identity of the locally reviewed B31J standard excerpt.

## 5. Appendix D benchmark record — B3.20

### 5.1 Bend equations

For mean cross-section radius `r`, bend radius `R`, wall thickness `t`, pressure `P`, and elastic modulus `E`:

```text
r   = (Do - t) / 2
h   = tR / r²
k0  = max(1, 1.65 / h)
ii0 = max(1, 0.9 / h^(2/3))
io0 = max(1, 0.75 / h^(2/3))

Dk = 1 + 6(P/E)(r/t)^(7/3)(R/r)^(1/3)
Di = 1 + 3.25(P/E)(r/t)^(5/2)(R/r)^(2/3)

kp  = max(1, k0 / Dk)
iip = max(1, ii0 / Di)
iop = max(1, io0 / Di)
```

All three bend cases are evaluated both unpressurized and pressurized.

| Case | Geometry coverage | Unpressurized `k / ii / io` | Pressurized `k / ii / io` |
|---|---|---|---|
| `BEND-AD-01-THICK-NPS-1_2-SCH160` | Thick wall, low `D/t` | `1.2362922940 / 1 / 1` | `1.2345388737 / 1 / 1` |
| `BEND-AD-02-BM1-NPS12` | BM1 sanity anchor | `9.3585944757 / 2.8623778724 / 2.3853148937` | `8.8059969774 / 2.6566924457 / 2.2139103715` |
| `BEND-AD-03-THIN-NPS24-SCH10` | Thin wall, high `D/t` | `25.8528645833 / 5.6354118501 / 4.6961765417` | `15.1224747268 / 2.7375034669 / 2.2812528891` |

The BM1 geometry independently reproduces `h=0.1763085263` and the expected unpressurized factors.

### 5.2 Legacy welding-tee equations

The benchmark covers the default legacy equal-size welding-tee rule:

```text
h  = 3.1T / r
io = max(1, 0.9 / h^(2/3))
ii = max(1, 0.75io + 0.25)
k  = 1
```

| Case | `h` | `k` | `ii` | `io` |
|---|---:|---:|---:|---:|
| `TEE-AD-01-THICK-NPS-1_2-SCH160` | `1.7939467312` | 1 | 1 | 1 |
| `TEE-AD-02-MID-NPS6-SCH40` | `0.2734785036` | 1 | `1.8520951642` | `2.1361268856` |
| `TEE-AD-03-THIN-NPS24-SCH10` | `0.0652631579` | 1 | `4.4141373900` | `5.5521831867` |

### 5.3 Appendix D reducer disposition

The legacy reducer question is resolved as follows:

- B31.3-2018 Table D300 groups a butt-welded reducer with a butt-welded joint and weld-neck flange and assigns `k=1`, `i=1.0`.
- The ASME PVP reducer-history paper independently states that Appendix D specified reducer SIF `1`; B31.3-2020 then referenced B31J, where reducer values can reach `2`.
- Therefore the calculator's unity reducer result is correct for `B31_3_2018_APPENDIX_D` only and must not be generalized to B31J.

The three Appendix D reducer cases assert exact unity in every directional SIF and perturb B31J-only geometry fields to prove they do not alter the legacy result.

| Case | Published rule result |
|---|---|
| `REDUCER-AD-01-NPS6x4-SCH40` | axial/torsional/in-plane/out-of-plane = `1/1/1/1` |
| `REDUCER-AD-02-NPS12x8-SCH40` | axial/torsional/in-plane/out-of-plane = `1/1/1/1` |
| `REDUCER-AD-03-NPS24x16-SCH10` | axial/torsional/in-plane/out-of-plane = `1/1/1/1` |

## 6. B31J phase-2 benchmark and rule disposition — B3.21

### 6.1 Smooth 90-degree bend flexibility

The correction is explicit and fail-closed:

- General B31J bend flexibility remains `1.65/h`.
- A smooth 90-degree bend may select `1.3/h` only when `smooth90FlexibilityCorrection: true` and `bendAngleDegrees: 90` are declared.
- The selection is blocked for Appendix D and for non-90-degree geometry.
- The selection changes the flexibility coefficient only; bend SIF equations remain unchanged.

| Case | Edition/policy | `k` | `ii` | `io` |
|---|---|---:|---:|---:|
| `B31J17-BEND-BM1-SMOOTH90-P21` | B31J-2017, smooth 90, pressured | `6.9475985799` | `2.6611395340` | `2.2176162783` |
| `B31J17-BEND-APPENDIX-S-GENERAL45` | B31J-2017, general bend | `9.5061417742` | `2.6196119486` | `2.1830099572` |
| `B31J23-BEND-DT60-SMOOTH90` | B31J-2023, smooth 90, `D/t=60` | `12.5702777778` | `4.0848570014` | `3.4040475011` |

The B31J-2023 `D/t=60` case also verifies the sustained-correction denominator `1.3 - 0.006(60) = 0.94` without altering displacement SIFs.

### 6.2 Verified welding-tee reduction

For the calculator's explicit `VERIFIED_B16_9` policy:

```text
final factor = max(1, raw factor / 1.26)
```

Division occurs before the minimum-factor floor. The calculation result retains:

- `rawFlexibility`;
- `rawDisplacementSifs`;
- `qualityReduction.divisor = 1.26`;
- the post-reduction factors.

Selected outputs:

| Case | Selected reduced output |
|---|---|
| `B31J17-TEE-REDUCED-BRANCH` | branch `k_ip=1.5878855125`, `k_op=5.8001138227`; run `i_ip=2.2760296054`; branch `i_ip=2.5255816913` |
| `B31J17-TEE-EQUAL-SIZE` | run `k_ip=1.3455167711`; branch `k_ip=1.9929210291`, `k_op=1.4265180399` |
| `B31J23-TEE-DT60-REDUCED` | branch `k_op=6.2258000768`; B31J-2023 sustained correction applied |

### 6.3 B31J reducers

B31J reducers remain directional-SIF calculations. The implementation retains:

- geometry-dependent common term;
- short-cylinder multiplier;
- directional axial, torsional, in-plane, and out-of-plane SIFs;
- `[1,2]` factor bounds;
- B31J-2023 sustained correction where applicable;
- no invented scalar reducer flexibility factor.

| Case | Common term | Short-cylinder multiplier | Directional displacement SIF result |
|---|---:|---:|---|
| `B31J17-REDUCER-SHORT-CAPPED-BENDING` | `363.4957517451` | 2 | axial/bending capped at 2; torsional `1.6904872552` |
| `B31J17-REDUCER-LONG-CYLINDER` | `170.6187070585` | 1 | axial/bending `1.1118561212`; torsional 1 |
| `B31J23-REDUCER-DT77-CAPPED` | `516.8960602920` | 2 | all displacement indices capped at 2 |

## 7. Tolerance policy

| Record | Tolerance | Basis |
|---|---|---|
| Appendix D class-(b) derivations | relative `1e-12`, absolute `1e-12` | Full-precision independent computation; tolerance permits serialization and operation-order noise only. |
| Appendix D reducer unity | exact equality | Published table value is exact. |
| B31J controlled derivations | relative `1e-12`, absolute `1e-12` | Full-precision derivations, not rounded vendor outputs. |

No percentage tolerance is widened to make a published rounded result fit. Published rounded examples are cross-check metadata unless they disclose sufficient geometry and calculation detail to serve as a direct case.

## 8. Production changes required by the B31J disposition

The B31J phase adds the following reviewable behavior:

1. Optional bend fields `bendAngleDegrees` and `smooth90FlexibilityCorrection`.
2. Applicability guards that reject unauthorized smooth-90 selection.
3. Edition/policy-aware bend flexibility evidence identifying the selected coefficient and rule.
4. InputXML supplementary-geometry carriage for the explicit bend selection.
5. Verified welding-tee division by `1.26` before flooring.
6. Retained raw and reduced tee factor evidence.
7. Updated B3.19 regression expectations.

The Appendix D benchmark does not modify calculator production equations; it records and executes the existing legacy rules.

## 9. Validation record

The combined candidate passed:

```text
node --check  # modified calculator modules and both new check scripts
npm run check:lfea-b3.19
npm run check:lfea-b3.20
npm run check:lfea-b3.21
npm run check:lfea-b4.5
npm run check:lfea-b3.2
npm run check:lfea-b4.0
```

The complete `check:lfea-linear-core` sequence was also executed. The environment stopped the single aggregate command at its execution limit after B4.2; every preceding stage had passed. The remaining aggregate sequence from B4.3 through the final topology check was then executed separately and passed. Consequently every command in the registered aggregate completed successfully on the same combined working tree.

Validation logs retained during authoring:

- `B31_COMBINED_FOCUSED_CHECK_OUTPUT.txt`
- `B31_COMBINED_LINEAR_CORE_OUTPUT.txt`
- `B31_COMBINED_LINEAR_CORE_TAIL_OUTPUT.txt`

These transient authoring logs are not required runtime inputs and are not part of the repository patch.

## 10. Acceptance disposition

The combined benchmark and correction package is technically acceptable for continued review on PR #595 because:

- all 18 benchmark cases pass;
- source and derivation classes are explicit;
- the Appendix D reducer question is resolved without carrying legacy unity into B31J;
- the B31J smooth-90 and verified-tee questions are resolved with explicit policy inputs and retained evidence;
- B-3.2 and B-4.0 ownership boundaries remain intact;
- every registered linear-core stage passed on the combined tree.

The records do not claim that all 18 cases are independently published numerical examples. They distinguish published rule authority from controlled derivation and preserve that distinction in machine-readable form.
