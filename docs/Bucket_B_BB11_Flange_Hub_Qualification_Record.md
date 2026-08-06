# Bucket B BB-11 — Axisymmetric Flange-Hub Qualification Record

## Controlled scope

```text
MODULE_ID                   = C2D-FLANGE-HUB
FORMULATION_PROFILE         = AXISYMMETRIC
ELEMENT_PROFILE             = AXI_Q8_FULL_3X3
RECOVERY_PROFILE_ID         = AXI_Q8_GAUSS_POINT_STRESS_RECOVERY_V1
LOAD_INTEGRATION_PROFILE_ID = AXI_Q8_FULL_CIRCUMFERENCE_LOAD_INTEGRATION_V1
GEOMETRY_ID                 = BKT-B-FLANGE-GEOMETRY-V1
MESH_FAMILY_ID              = BKT-B-FLANGE-Q8-MESH-FAMILY-V1
```

## Frozen geometry

The meridional model uses the controlled pipe, tapered hub, circular tangent blends, flange ring, bore, gasket-support annulus and optional gasket-load annulus specified by the BB-11 work pack. The nominal hub endpoints are virtual sharp-line construction points; the physical boundary uses the exact tangent points of the 6 mm pipe-to-hub and 10 mm hub-to-flange circular blends.

## Mechanical model

`FH-PRES-001` applies 10 MPa internal pressure to the complete bore and a separately declared equivalent closed-end thrust to the remote pipe metal annulus. `FH-AXIAL-001` applies a 100 kN tensile axial resultant. Both cases restrain only `u_z` over the gasket support annulus while leaving `u_r` free. `FH-GASKET-001` remains an optional annular-face compression sanity model and does not qualify gasket seating, contact or leakage.

## Numerical custody

The application uses deterministic M0–M3 Q8 meshes, the registered full 3×3 axisymmetric kernel, exact `2πr` edge loading, fixed-coordinate Gauss-point recovery, governed physical probes and SCLs, the shared convergence evaluator and a separately coded Q4 application oracle.

The dedicated workflow creates:

```text
bucket-b-bb10-same-head-regression.json
bucket-b-axisymmetric-adoption-receipt.json
bucket-b-bb11-geometry-evidence.json
bucket-b-bb11-mesh-evidence.json
bucket-b-bb11-core-evidence.json
bucket-b-bb11-output-evidence.json
bucket-b-bb11-independent-evidence.json
bucket-b-bb11-approval.json
bucket-b-bb11-report.json
```

## Authority boundary

A passing exact-head report may set only:

```text
FLANGE_HUB_APPLICATION_PROCEDURE_QUALIFIED = true
FLANGE_HUB_NUMERICAL_OUTPUT_QUALIFIED = true
BB12_AUTHORIZED = true
```

It must retain:

```text
CODE_ASSESSMENT_QUALIFIED = false
MODULE_QUALIFIED = false
APPLICATION_MODULE_PROMOTED = false
PRODUCTION_SWITCH_AUTHORIZED = false
BUCKET_01_QUALIFIED = unchanged
```

The workflow report and retained artifact, rather than this technical record, are the qualification authority.

## Production V2 transition and oracle-comparison correction


The governed production candidate now uses mesh family
`BKT-B-FLANGE-Q8-B03-B04-CONFORMING-TRANSITION-V2`. It derives from
the retained V1 mesh and applies the qualified B04 smoothstep remap,
shares B04/B05 interface node IDs, rewrites element and boundary-edge
references, rejects duplicate coordinates and hanging nodes, and
preserves the exact `P-HUB-MID` physical probe.

The production-to-independent-oracle comparison retains the existing
2%, 5%, and 7% numerical limits. Displacement-component differences
are normalized by the same-point displacement-vector norm and stress
components by the same-point axisymmetric stress-tensor norm. Raw
scalar-relative errors remain in evidence. This corrects false
rejection of near-zero components without relaxing any limit.

Authority remains pending the dedicated exact-head BB-11 workflow.
