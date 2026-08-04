# M025 Coulomb Friction — Engineering Record

**Issue:** #592  
**Pull request:** #594  
**Benchmark:** CAESAR II Version 14 BM1  
**Record date:** 2026-08-04

## Status

M025 is **not closed**. The nonlinear restraint-friction mechanics are now convergent and independently qualified, but the unchanged full CAESAR pointwise oracle retains **212 failures out of 1,224 comparisons**.

The PR must remain draft and fail closed. No statement that all BM1 results are within ±10% is supported by the current evidence.

## Repository architecture correction

The original PR used three patch scripts and a `contents: write` workflow to create and push the production integration during CI. That architecture was rejected because the reviewed commit was not the code being executed.

The corrected architecture is:

- production changes are committed directly and are visible in the PR diff;
- CI uses `contents: read`;
- CI does not modify, commit, or push the branch;
- `check:lfea-b3.19:mechanics` qualifies the constitutive friction implementation independently;
- `check:lfea-b3.19` retains the complete 1,224-point ±10% gate and fails closed while any comparison remains outside the oracle.

## Coulomb constitutive model

CAESAR II's documented default static-friction stiffness is:

```text
1.0E+06 lbf/in = 175,126,835.246 N/m
```

The restraint law is elastic-perfectly plastic in the transverse X/Z plane:

```text
stick: T = -Kf * u, while |T| <= mu * |N|
slip:  T = -mu * |N| * u/|u|
```

The two friction sites are solved simultaneously. The implementation enumerates all four active sets:

```text
70 STICK / 80 STICK
70 STICK / 80 SLIP
70 SLIP  / 80 STICK
70 SLIP  / 80 SLIP
```

For each fixed active set, the global structural response is affine in the slip-force components. The solver identifies this response with one base solve and one probe solve per slip-force component, then solves the constitutive residual using damped Newton iterations. A load case is accepted only when exactly one active set is admissible.

This architecture removes node update order, fixed-point cycling, and the earlier 180-degree force-direction oscillation.

## Qualified friction results

### Sustained

```text
Selected state: node 70 STICK, node 80 STICK
Newton iterations: 1
Residual infinity norm: 0 N
```

| Node | Normal force N | Tangential force T | Coulomb limit muN | Mobilization |
|---:|---:|---:|---:|---:|
| 70 | 17,070.316 N | 1,729.982 N | 5,121.095 N | 0.337815 |
| 80 | 15,442.787 N | 862.373 N | 4,632.836 N | 0.186144 |

### Operating

```text
Selected state: node 70 SLIP, node 80 SLIP
Newton iterations: 3
Residual infinity norm: 1.23E-06 N
Force tolerance: 1.01E-02 N
```

| Node | Normal force N | Tangential force T | Coulomb limit muN | Mobilization |
|---:|---:|---:|---:|---:|
| 70 | 635.092 N | 190.527 N | 190.527 N | 1.0000000001 |
| 80 | 19,901.762 N | 5,970.529 N | 5,970.529 N | 1.0000000002 |

The force bound, slip-surface condition, force/displacement opposition, unique active-set requirement, nonlinear residual, and global equilibrium checks pass.

## Rigid valve and flange authority

Valves and flanges are represented with two separate authorities:

1. **Stiffness** — retain the entered inside diameter and use ten times the entered wall thickness.
2. **Weight** — use the entered rigid component weight; do not derive metal mass from the artificial ten-times-wall section.

For a nonzero-weight rigid, fluid and insulation are added separately under the CAESAR rigid-weight convention. The stiffness section never acts as a mass section. Rigid elements remain thermally active and structurally recoverable but are excluded from piping-code stress utilization.

The solver equilibrium qualification was also corrected so a grounded linear spring is treated as an external support action, not an unbalanced internal force.

## Current full pointwise result

```text
Total comparisons: 1,224
Passed:            1,012
Failed:              212
```

### By case

| Case | Passed | Failed | Total |
|---|---:|---:|---:|
| OPE | 379 | 29 | 408 |
| SUS | 291 | 117 | 408 |
| EXP | 342 | 66 | 408 |

### By family

| Family | Passed | Failed | Total |
|---|---:|---:|---:|
| Displacements | 278 | 82 | 360 |
| Restraints | 165 | 15 | 180 |
| Global forces/moments | 569 | 115 | 684 |

The principal material discrepancy remains the OPE node-70 normal force:

```text
Current N70 OPE: 635.092 N
CAESAR N70 OPE:  862.995 N
Deviation:       -26.408%
```

Because sliding friction is `T = muN`, the node-70 friction magnitude cannot match CAESAR until the upstream vertical load path is corrected.

## Nodal force and moment reverse engineering

The CAESAR element-end and restraint reports close nodal free bodies directly. At node 70 in OPE:

```text
F(60-70,J) = ( 971.428, -4420.514,  11738.003) N
F(70-80,I) = (-903.134,  5283.509, -11985.979) N
sum         = (  68.294,   862.995,   -247.976) N
```

The raw CAESAR restraint row is the equal-and-opposite hardware action. The element-end moments cancel at the translational support.

The element report also reconstructs applied element load and load first moment:

```text
W_element = -(F_I + F_J)
M_load,I  = -(M_I + M_J + r_IJ x F_J)
```

These equations establish that the remaining uniform SUS Z-force deficit is a compliance/load-path discrepancy, not a missing applied Z load.

## Reducer technical-reference validation

Hexagon's CAESAR II documentation states that a concentric reducer is constructed from **ten pipe cylinders**, each with successively changing diameter and wall thickness over the reducer length. Diameter 2 and Thickness 2 are assigned at the To end; if absent, they are taken from the following element.

References:

- CAESAR II Users Guide, Reducer: `https://docs.hexagonppm.com/r/en-US/CAESAR-II-Users-Guide/Version-12/1226707`
- CAESAR II Applications Guide, Reducers: `https://docs.hexagonppm.com/r/en-US/CAESAR-II-Applications-Guide/Version-14/329787`

### Compliance-equivalent annulus experiment

A review experiment converted ten equal-length midpoint cylinders into one annulus that exactly preserves the ten-cylinder axial, bending, and torsional compliance. Given the harmonic equivalent area `Aeq` and second moment `Ieq`:

```text
Do^2 - Di^2 = 4*Aeq/pi
Do^2 + Di^2 = 16*Ieq/Aeq
```

For BM1 element 20-30, using the inherited end properties:

```text
From OD/thickness: 273.049988 mm / 9.271000 mm
To OD/thickness:   323.850006 mm / 9.271000 mm
Equivalent OD:     296.644355 mm
Equivalent wall:     9.306606 mm
```

Physical reducer gravity was kept separate from stiffness. The ten-cylinder mass integration produced:

```text
Calculated total reducer weight: 251.866 N
CAESAR reconstructed weight:     253.527 N
Calculated centroid fraction:    0.520345 from node 20
CAESAR reconstructed fraction:   0.523713 from node 20
```

The weight and first moment were close, but the system response worsened:

```text
Accepted baseline: 212 / 1,224 failures
Reducer experiment: 231 / 1,224 failures

OPE node-70 normal force:
  baseline:   635.092 N
  experiment: 505.866 N
  CAESAR:     862.995 N
```

### Disposition of the reducer experiment

The reducer stiffness change was **reverted** and is not part of the candidate implementation.

The experiment is a falsified global-closure hypothesis, not evidence that CAESAR's documented reducer formulation is wrong. It demonstrates that reducer parity cannot be introduced safely from inferred end properties alone while other load-path authorities remain unresolved.

The live InputXML fixture does not expose explicit reducer auxiliary fields for element 20-30. Before implementing reducer stiffness permanently, the following must be recovered from the original CAESAR job or an isolated reducer benchmark:

- authoritative Diameter 2 and Thickness 2;
- concentric versus eccentric reducer identity and exact centerline skew;
- Alpha and any B31J transition lengths;
- the exact ten-cylinder station sampling convention;
- code-stress end-section treatment independent of the flexibility section.

## Verification commands

The following checks pass on the direct-integration candidate:

```text
npm run check:lfea-b3.2
npm run check:lfea-b3.3
npm run check:lfea-b3.15
npm run check:lfea-b3.16
npm run check:lfea-b3.17
npm run check:lfea-b3.18
npm run check:lfea-b3.19:mechanics
npm run check:lfea-bm1-cii-comparison
```

Expected fail-closed command:

```text
npm run check:lfea-b3.19
# fails: 212 / 1,224 comparisons remain outside ±10%
```

## Next engineering actions

1. Recover the original CAESAR reducer auxiliary data rather than inferring it from inherited XML properties.
2. Reconstruct bend gravity over arc length and curved load centroid while keeping bend stiffness authority separate.
3. Recover the active code edition and B31J configuration from the CAESAR job.
4. Trace the OPE node-70 vertical free body and the SUS uniform Z-compliance deficit using component-level force and first-moment gates.
5. Preserve the full 1,224-point oracle unchanged throughout.
