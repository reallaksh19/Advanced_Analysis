# FEA benchmark report — before

Report hash `fnv1a64:8673649736d4b7c8`

| Cases | Passed | Failed | Errored | Checks | Failed checks | Max relative error |
|---:|---:|---:|---:|---:|---:|---:|
| 21 | 14 | 7 | 0 | 67 | 17 | 4.520e-13 |

## By tier

| Tier | Passed | Failed | Errored |
|---|---:|---:|---:|
| T1_CLOSED_FORM | 8 | 0 | 0 |
| T2_CONVERGENCE | 1 | 0 | 0 |
| T3_INVARIANT | 4 | 1 | 0 |
| T4_PRESENTATION | 0 | 4 | 0 |
| T5_PERFORMANCE | 1 | 2 | 0 |

## Cases

### PASS `BM-T1-PATCH-Q4-REGULAR` — Regular Q4 constant-strain patch test (PLANE_STRESS)

*Tier* T1_CLOSED_FORM · *Category* ELEMENT_CONSISTENCY · *Kernel* `element-fea`

*Reference* (CLOSED_FORM): Irons & Razzaque patch test; Zienkiewicz & Taylor FEM. Exact constant stress state.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `STRESS` | Maximum stress deviation from exact constant state | 8.5265e-14 | 0 | 1e-9 RELATIVE | worst at E001_001:GP1:SX; exact = [200.00000, 1.4210855e-14, 38.461538] |
| PASS | `ENERGY` | Element/global strain-energy consistency | 0 | 0 | 1e-10 RELATIVE |  |

### PASS `BM-T1-PATCH-Q4-DISTORTED` — Distorted Q4 constant-strain patch test (PLANE_STRESS)

*Tier* T1_CLOSED_FORM · *Category* ELEMENT_CONSISTENCY · *Kernel* `element-fea`

*Reference* (CLOSED_FORM): Irons & Razzaque patch test; Zienkiewicz & Taylor FEM. Exact constant stress state.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `STRESS` | Maximum stress deviation from exact constant state | 1.7053e-13 | 0 | 1e-9 RELATIVE | worst at E001_001:GP2:SX; exact = [200.00000, 1.4210855e-14, 38.461538] |
| PASS | `ENERGY` | Element/global strain-energy consistency | 2.7756e-16 | 0 | 1e-10 RELATIVE |  |

### PASS `BM-T1-PATCH-T3-REGULAR` — Regular T3 constant-strain patch test (PLANE_STRESS)

*Tier* T1_CLOSED_FORM · *Category* ELEMENT_CONSISTENCY · *Kernel* `element-fea`

*Reference* (CLOSED_FORM): Irons & Razzaque patch test; Zienkiewicz & Taylor FEM. Exact constant stress state.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `STRESS` | Maximum stress deviation from exact constant state | 2.8422e-14 | 0 | 1e-9 RELATIVE | worst at E000_000A:T3_CONSTANT:SX; exact = [200.00000, 1.4210855e-14, 38.461538] |
| PASS | `ENERGY` | Element/global strain-energy consistency | 5.5511e-17 | 0 | 1e-10 RELATIVE |  |

### PASS `BM-T1-PATCH-T3-DISTORTED` — Distorted T3 constant-strain patch test (PLANE_STRESS)

*Tier* T1_CLOSED_FORM · *Category* ELEMENT_CONSISTENCY · *Kernel* `element-fea`

*Reference* (CLOSED_FORM): Irons & Razzaque patch test; Zienkiewicz & Taylor FEM. Exact constant stress state.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `STRESS` | Maximum stress deviation from exact constant state | 2.2737e-13 | 0 | 1e-9 RELATIVE | worst at E001_000B:T3_CONSTANT:SX; exact = [200.00000, 1.4210855e-14, 38.461538] |
| PASS | `ENERGY` | Element/global strain-energy consistency | 1.1102e-16 | 0 | 1e-10 RELATIVE |  |

### PASS `BM-T1-PATCH-Q4-PLANE-STRAIN` — Distorted Q4 constant-strain patch test (PLANE_STRAIN)

*Tier* T1_CLOSED_FORM · *Category* ELEMENT_CONSISTENCY · *Kernel* `element-fea`

*Reference* (CLOSED_FORM): Irons & Razzaque patch test; Zienkiewicz & Taylor FEM. Exact constant stress state.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `STRESS` | Maximum stress deviation from exact constant state | 1.7053e-13 | 0 | 1e-9 RELATIVE | worst at E001_000:GP4:SX; exact = [234.61538, 34.615385, 38.461538] |
| PASS | `ENERGY` | Element/global strain-energy consistency | 3.3307e-16 | 0 | 1e-10 RELATIVE |  |

### PASS `BM-T1-UNIAXIAL-Q4` — Uniaxial tension strip, Q4 plane stress

*Tier* T1_CLOSED_FORM · *Category* STRESS_ACCURACY · *Kernel* `element-fea`

*Reference* (CLOSED_FORM): sigma_x = P/A = applied traction; sigma_y = tau_xy = 0; eps_y = -nu*eps_x.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `STRESS` | Maximum stress deviation from uniform uniaxial state | 1.7764e-13 | 0 | 1e-10 RELATIVE |  |
| PASS | `UX` | Axial elongation at free end | 0.02500000 | 0.02500000 | 1e-10 RELATIVE |  |
| PASS | `UY_POISSON` | Lateral Poisson contraction | -0.001500000 | -0.001500000 | 1e-10 RELATIVE |  |
| PASS | `REACTION` | Sum of support reactions vs applied load | -1000.000 | -1000.000 | 1e-9 RELATIVE |  |

### PASS `BM-T1-PLANE-STRAIN-SIGMAZ` — Plane-strain sigma_z recovery and 3D von Mises

*Tier* T1_CLOSED_FORM · *Category* CONSTITUTIVE · *Kernel* `element-fea`

*Reference* (CLOSED_FORM): sigma_z = nu*(sigma_x+sigma_y); von Mises = sqrt(0.5*[(sx-sy)^2+(sy-sz)^2+(sz-sx)^2]+3*txy^2).

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `SIGMA_Z` | Recovered out-of-plane stress | 0 | 0 | 1e-12 RELATIVE |  |
| PASS | `VON_MISES_3D` | Kernel von Mises vs 3D invariant | 0 | 0 | 1e-12 RELATIVE |  |
| PASS | `SENSITIVITY` | Case discriminates plane-stress from plane-strain von Mises | 1.000000 | 1.000000 | 0 BOOLEAN | A sigma_z-ignoring expression differs by 12.51 % here; the case is only diagnostic if this exceeds 5 %. |

### PASS `BM-T1-LAME-REFINEMENT` — Thick-walled cylinder under internal pressure — Lame refinement study (Q4, plane strain)

*Tier* T1_CLOSED_FORM · *Category* PRESSURE_VESSEL · *Kernel* `element-fea`

*Reference* (CLOSED_FORM): Lame thick cylinder: a=100 mm, b=200 mm, p=10 N/mm2, free outer surface. Exact bore hoop stress = 16.666667 N/mm2.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `MONOTONE` | Hoop-stress error decreases monotonically under refinement | 1.000000 | 1.000000 | 0 BOOLEAN | errors = [8.710%, 4.347%, 2.170%] |
| PASS | `BORE_HOOP` | Finest-mesh peak bore hoop stress vs Lame | 8.6196e-4 | 0 | 0.005 ABSOLUTE | Declared in advance: 16x24 mesh must reach the exact bore hoop within 0.5 %. Computed peak = 16.652301, exact = 16.666667. |
| PASS | `FIELD_ERROR` | Finest-mesh worst hoop-stress error over the whole field | 0.02169667 | 0 | 0.03 ABSOLUTE | Dominated by the faceted approximation of the circular boundary by straight Q4 edges. |
| PASS | `OBSERVED_ORDER` | Observed convergence order of the hoop-stress field error | 1.002584 | 1.000000 | 0.35 ABSOLUTE | First order is EXPECTED: the error is geometric (polygonal boundary), not interpolation error. A value near 2 would indicate the geometry error is not dominant. |
| PASS | `EQUILIBRIUM` | Finest-mesh global force imbalance | 2.2055e-11 | 0 | 1e-9 RELATIVE |  |

### PASS `BM-T2-CANTILEVER-Q4` — End-loaded cantilever: Q4 shear-locking characterisation

*Tier* T2_CONVERGENCE · *Category* ELEMENT_BEHAVIOUR · *Kernel* `element-fea`

*Reference* (ENGINEERING_THEORY): Timoshenko beam with kappa=5/6: delta = PL^3/(3EI) + PL/(kappa G A) = 2.0001560 mm.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `MONOTONE` | Tip deflection increases monotonically under refinement (locking is relieved) | 1.000000 | 1.000000 | 0 BOOLEAN | ratios = [0.2875, 0.6162, 0.8671, 0.9666] |
| PASS | `FINEST` | Finest-mesh tip deflection / Timoshenko reference | 0.9666136 | 1.000000 | 0.05 ABSOLUTE | Declared in advance: the 32x8 mesh must be within 5 % of beam theory. |
| PASS | `LOCKING_INDEX` | Coarse-mesh stiffness penalty (1 - coarse/reference) | 0.7124930 | 0 | 1 ABSOLUTE | Reported for characterisation, not acceptance. A large value documents shear locking. |

### PASS `BM-T3-RIGID-TRANSLATION` — Rigid-body translation produces no stress

*Tier* T3_INVARIANT · *Category* ELEMENT_CONSISTENCY · *Kernel* `element-fea`

*Reference* (INVARIANT): Rigid-body motion produces zero strain by definition.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `STRESS` | Maximum spurious stress | 6.1001e-12 | 0 | 0.000001 ABSOLUTE | Absolute tolerance: E = 2e5, so 1e-6 N/mm2 is ~5e-12 relative to modulus. |
| PASS | `ENERGY` | Strain energy under rigid-body motion | 1.1255e-10 | 0 | 0.000001 ABSOLUTE |  |

### PASS `BM-T3-BACKEND-EQUIVALENCE` — Dense LDLt and sparse Jacobi-PCG backends agree

*Tier* T3_INVARIANT · *Category* SOLVER · *Kernel* `element-fea`

*Reference* (INVARIANT): Two backends solving the same SPD system must agree.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `DISPLACEMENT` | Maximum displacement difference between backends | 1.0804e-13 | 0 | 1e-8 RELATIVE |  |
| PASS | `ENERGY` | Strain-energy difference between backends | 1.1028e-11 | 0 | 1e-8 RELATIVE |  |

### PASS `BM-T3-DETERMINISM` — Repeat solves are bit-identical

*Tier* T3_INVARIANT · *Category* DETERMINISM · *Kernel* `element-fea`

*Reference* (INVARIANT): CORE_SPECIFICATION: no hidden values, no Math.random, no silent switching.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `RESULT_HASH` | Result semantic hash is reproducible | 1.000000 | 1.000000 | 0 BOOLEAN | fnv1a64:3768712c3f33b755 vs fnv1a64:3768712c3f33b755 |
| PASS | `MODEL_HASH` | Model semantic hash is reproducible | 1.000000 | 1.000000 | 0 BOOLEAN |  |

### PASS `BM-T3-SPARSE-SCALING` — Sparse Jacobi-PCG iteration scaling and qualification

*Tier* T3_INVARIANT · *Category* SOLVER · *Kernel* `element-fea`

*Reference* (ENGINEERING_THEORY): PCG iterations ~ O(sqrt(kappa)); for 2D elasticity kappa ~ O(h^-2), so iterations ~ O(sqrt(N_dof)). Jacobi preconditioning does not alter this asymptotic.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `QUALIFIED_AT_SCALE` | Sparse backend qualifies at every declared mesh size | 1.000000 | 1.000000 | 0 BOOLEAN | largest solved: 2210 DOF in 502 iterations |
| PASS | `SQRT_SCALING` | Spread of iterations / sqrt(DOF) across four refinements | 2.307945 | 1.000000 | 2.5 ABSOLUTE | Characterises the preconditioner. A spread near 1 confirms the O(sqrt(N)) model. This is a documentation check, not an accuracy claim. |

### FAIL `BM-T3-TOLERANCE-COUPLING` — Unsatisfiable solver-profile tolerance configuration is rejected fail-closed

*Tier* T3_INVARIANT · *Category* SOLVER · *Kernel* `element-fea`

*Reference* (INVARIANT): A configuration whose iterative target exceeds the acceptance gate can never qualify; the solver must reject rather than return an unqualified result.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `FAIL_CLOSED` | An unsatisfiable tolerance configuration does not produce a qualified result | 1.000000 | 1.000000 | 0 BOOLEAN | status = QUARANTINED_NUMERICAL, code = FREE_RESIDUAL_FAILURE |
| PASS | `NO_PARTIAL_EVIDENCE` | No displacement or stress evidence is published for the rejected solve | 1.000000 | 1.000000 | 0 BOOLEAN |  |
| FAIL | `DIAGNOSTIC_EXPLAINS_CAUSE` | The diagnostic tells the user the profile configuration is unsatisfiable | 0 | 1.000000 | 0 BOOLEAN | Observed diagnostic: "FREE_RESIDUAL_FAILURE: Free-DOF residual exceeds the approved tolerance.". A generic residual-failure message does not tell the user their PROFILE is at fault, so this check is expected to FAIL until the profile validates tolerance coupling. |

### FAIL `BM-P1-DISPLAYED-VON-MISES` — Displayed stress field equals the authoritative solver von Mises, bit for bit

*Tier* T4_PRESENTATION · *Category* PRESENTATION_FIDELITY · *Kernel* `lfea-workbench`

*Reference* (PRESENTATION): The view layer must SELECT a published kernel quantity, never re-derive one. Any deviation means the screen and the signed evidence bundle disagree.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `T3_PLANE_STRESS.BIT_IDENTICAL` | Displayed field is bit-identical to kernel evidence (T3_PLANE_STRESS) | 1.000000 | 1.000000 | 0 BOOLEAN | source = result.vonMisesStress[].value |
| PASS | `T3_PLANE_STRESS.RELATIVE` | Worst relative deviation of displayed stress (T3_PLANE_STRESS) | 0 | 0 | 0 ABSOLUTE |  |
| FAIL | `T3_PLANE_STRAIN.BIT_IDENTICAL` | Displayed field is bit-identical to kernel evidence (T3_PLANE_STRAIN) | 0 | 1.000000 | 0 BOOLEAN | E000_000A: displayed 250.3539785677215 vs authoritative 198.3851003373181 |
| FAIL | `T3_PLANE_STRAIN.RELATIVE` | Worst relative deviation of displayed stress (T3_PLANE_STRAIN) | 0.2619596 | 0 | 0 ABSOLUTE | E000_000A: displayed 250.3539785677215 vs authoritative 198.3851003373181 |
| PASS | `Q4_PLANE_STRESS.BIT_IDENTICAL` | Displayed field is bit-identical to kernel evidence (Q4_PLANE_STRESS) | 1.000000 | 1.000000 | 0 BOOLEAN | source = result.integrationPointResults[].vonMisesStress |
| PASS | `Q4_PLANE_STRESS.RELATIVE` | Worst relative deviation of displayed stress (Q4_PLANE_STRESS) | 0 | 0 | 0 ABSOLUTE |  |
| PASS | `Q4_PLANE_STRAIN.BIT_IDENTICAL` | Displayed field is bit-identical to kernel evidence (Q4_PLANE_STRAIN) | 1.000000 | 1.000000 | 0 BOOLEAN | source = result.integrationPointResults[].vonMisesStress |
| PASS | `Q4_PLANE_STRAIN.RELATIVE` | Worst relative deviation of displayed stress (Q4_PLANE_STRAIN) | 0 | 0 | 0 ABSOLUTE |  |

### FAIL `BM-P2-GEOMETRY-STATE` — Stress display modes plot undeformed source geometry unless deformation is explicitly requested

*Tier* T4_PRESENTATION · *Category* PRESENTATION_FIDELITY · *Kernel* `lfea-workbench`

*Reference* (PRESENTATION): A plot labelled with a stress authority must not silently apply a displacement magnification. Coordinates read off the plot must be the model coordinates.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `MODEL.UNDEFORMED_BY_DEFAULT` | MODEL plots exact source coordinates when deformation is not requested | 1.000000 | 1.000000 | 0 BOOLEAN | exact match |
| FAIL | `MODEL.STATE_DECLARED` | MODEL declares its geometry state explicitly | 0 | 1.000000 | 0 BOOLEAN | geometryState = <absent>, deformationScale = <absent>, declaredDeformed = false |
| FAIL | `RAW_STRESS.UNDEFORMED_BY_DEFAULT` | RAW_STRESS plots exact source coordinates when deformation is not requested | 0 | 1.000000 | 0 BOOLEAN | N002_002: plotted (40.796531168000314, 17.75858042297061) vs source (40, 20) |
| FAIL | `RAW_STRESS.STATE_DECLARED` | RAW_STRESS declares its geometry state explicitly | 0 | 1.000000 | 0 BOOLEAN | geometryState = <absent>, deformationScale = <absent>, declaredDeformed = false |
| FAIL | `PROJECTED_STRESS.UNDEFORMED_BY_DEFAULT` | PROJECTED_STRESS plots exact source coordinates when deformation is not requested | 0 | 1.000000 | 0 BOOLEAN | N002_002: plotted (40.796531168000314, 17.75858042297061) vs source (40, 20) |
| FAIL | `PROJECTED_STRESS.STATE_DECLARED` | PROJECTED_STRESS declares its geometry state explicitly | 0 | 1.000000 | 0 BOOLEAN | geometryState = <absent>, deformationScale = <absent>, declaredDeformed = false |

### FAIL `BM-P3-FIELD-METADATA` — Every displayed field declares its quantity, unit, reduction, provenance and value range

*Tier* T4_PRESENTATION · *Category* PRESENTATION_FIDELITY · *Kernel* `lfea-workbench`

*Reference* (PRESENTATION): A coloured mesh with no quantity identity, no unit and no numeric range is not a reviewable engineering output. Units must come from solverProfile.units.stress, never a literal.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| FAIL | `DESCRIPTOR_PRESENT` | Display geometry carries a field descriptor | 0 | 1.000000 | 0 BOOLEAN | present: []; missing: [quantityId, unit, reduction, sourcePath, min, max] |
| FAIL | `UNIT_FROM_PROFILE` | Declared unit equals solverProfile.units.stress | 0 | 1.000000 | 0 BOOLEAN | declared = <absent>, profile = N/mm2 |
| FAIL | `RANGE_FINITE` | Field declares a finite numeric range for the legend | 0 | 1.000000 | 0 BOOLEAN | min = <absent>, max = <absent> |
| FAIL | `PROVENANCE` | Field declares which result path it was selected from | 0 | 1.000000 | 0 BOOLEAN | sourcePath = <absent> |
| FAIL | `CAPTION` | Display geometry provides a caption naming quantity, unit and geometry state | 0 | 1.000000 | 0 BOOLEAN | caption = <absent> |

### FAIL `BM-P4-QUANTITY-DISAMBIGUATION` — Raw and projected stress modes declare different quantities and separate value ranges

*Tier* T4_PRESENTATION · *Category* PRESENTATION_FIDELITY · *Kernel* `lfea-workbench`

*Reference* (PRESENTATION): Raw mode shows a von Mises invariant (non-negative). Projected mode shows a signed stress component from a NON-AUTHORITATIVE projection. Sharing one unlabelled colour ramp between them lets a reader compare two different physical quantities as if they were one.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| FAIL | `DISTINCT_QUANTITY_IDS` | Raw and projected modes declare distinct quantity identities | 0 | 1.000000 | 0 BOOLEAN | raw = <absent>, projected = <absent> |
| PASS | `PROJECTED_AUTHORITY` | Projected mode is labelled non-authoritative | 1.000000 | 1.000000 | 0 BOOLEAN | authority = NON_AUTHORITATIVE_REVIEW_PROJECTION |
| PASS | `RAW_AUTHORITY` | Raw mode is labelled authoritative | 1.000000 | 1.000000 | 0 BOOLEAN | authority = AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS |
| FAIL | `SEPARATE_RANGES` | Each mode carries its own numeric range rather than sharing one implicit scale | 0 | 1.000000 | 0 BOOLEAN | raw range = [undefined, undefined], projected range = [undefined, undefined] |

### FAIL `BM-T5-HASH` — Semantic hash is bit-identical to the FNV-1a-64 reference and meets its throughput budget

*Tier* T5_PERFORMANCE · *Category* EVIDENCE_COST · *Kernel* `shared-piping-model`

*Reference* (INVARIANT): FNV-1a 64-bit (Fowler-Noll-Vo). Every committed evidence bundle depends on this value, so any implementation change must be proven bit-identical.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `BIT_IDENTICAL_VECTORS` | Hash matches the BigInt reference on all fixed vectors | 1.000000 | 1.000000 | 0 BOOLEAN | 18 vectors verified |
| PASS | `BIT_IDENTICAL_RANDOM` | Hash matches the BigInt reference on 500 seeded pseudo-random inputs | 1.000000 | 1.000000 | 0 BOOLEAN | 0 mismatches |
| PASS | `FORMAT` | Hash string format is preserved | 1.000000 | 1.000000 | 0 BOOLEAN |  |
| FAIL | `THROUGHPUT` | Hash throughput | -16.36864 | -50.00000 | 0 BUDGET | measured 16.4 MB/s over a 4 MB payload; budget is at least 50 MB/s. A BigInt-per-byte implementation measures roughly 15 MB/s. |

### PASS `BM-T5-PIPELINE` — Workbench pipeline meets its interactive-latency budget on a small model

*Tier* T5_PERFORMANCE · *Category* INTERACTION_COST · *Kernel* `lfea-workbench`

*Reference* (ENGINEERING_REQUIREMENT): A 450-DOF model is trivially small for FEA. Anything beyond a few seconds on the UI thread is a frozen tab. Budget declared in advance: 6 s for the full evidence chain.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `SOLVES` | Model reaches a qualified solver result | 1.000000 | 1.000000 | 0 BOOLEAN | status = QUALIFIED, failedStage = none |
| PASS | `WALL_CLOCK` | Full pipeline wall clock | 5076.489 | 6000.000 | 0 BUDGET | 196 Q4 elements, 450 DOF. |

### FAIL `BM-T5-CAPACITY-ENVELOPE` — Advertised mesh capacity is actually reachable through the full evidence chain

*Tier* T5_PERFORMANCE · *Category* CAPACITY · *Kernel* `lfea-workbench`

*Reference* (ENGINEERING_REQUIREMENT): The workbench adapter profile advertises maximumElements = 10000. A capacity limit that is unreachable by more than an order of magnitude is a false declaration to the user.

| | Check | Quantity | Computed | Reference | Tolerance | Note |
|---|---|---|---:|---:|---|---|
| PASS | `SOLVES_AT_4_PERCENT` | A model at 4 % of advertised element capacity reaches a qualified solve | 1.000000 | 1.000000 | 0 BOOLEAN | status = FAILED |
| FAIL | `EXPORTS_AT_4_PERCENT` | The same model completes the evidence export | 0 | 1.000000 | 0 BOOLEAN | blocked by EXPORT_BYTE_CAPACITY: Export byte length 28637893 exceeds 20000000. |

