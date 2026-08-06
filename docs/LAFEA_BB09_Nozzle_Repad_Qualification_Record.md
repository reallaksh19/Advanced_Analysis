# LAFEA Bucket B BB-09 — Nozzle/Repad Controlled Procedure

## Status and authority

This record defines the BB-09 qualification candidate for
`C2D-NOZZLE-REPAD-SECTION`.

The executable source of truth is:

- `src/core/bucket-b/bb09-nozzle-repad.js`;
- `src/core/bucket-b/bb09-check.mjs`;
- `.github/workflows/bucket-b-shared-gates.yml`;
- the exact-head `bucket-b-bb09-nozzle-repad-report.json` artifact.

This document does not grant qualification by itself. Qualification exists
only when the exact-head workflow creates a valid
`bucket-b-bb09-nozzle-repad-report/v1` receipt with every governed check
passing.

## Predecessor custody

BB-09 consumes the BB-08 report from the same exact Git head. The procedure
constructor rejects:

- an unsupported BB-08 report schema;
- a stale or different exact head;
- a BB-08 report that does not explicitly authorize BB-09;
- a tampered semantic hash.

## Qualified model envelope

The candidate is a linear-elastic, small-strain, plane-strain, half-section
surrogate. It uses full-integration eight-node serendipity quadrilaterals
(`Q8_FULL_3X3`) in a conforming multi-block mesh.

The blocks represent:

- one nozzle-wall half-section;
- the adjoining host-wall half-width;
- a perfectly bonded reinforcement pad;
- a remote host cut that is fixed for the qualified load path.

The four governed mesh levels retain common interface nodes and refine from
M0 through M3 using actual characteristic sizes.

## Governed load cases

Two separate linear load cases are qualified:

1. positive internal pressure on the nozzle bore and host inner face;
2. uniform nozzle axial edge traction at the remote nozzle cut.

Pressure and traction are assembled with quadratic-edge consistent nodal
loads. Applied force and moment resultants must agree with independent
geometric integration and must balance the support reactions.

## Numerical qualification gates

The exact-head check requires all of the following:

- predecessor and same-head authority validation;
- immutable procedure authority validation;
- affine plane-strain manufactured-field recovery;
- an analytical plane-strain uniaxial-strip pressure reference;
- four complete nozzle/repad executions;
- Q8 Jacobian, scaled-Jacobian, aspect-ratio, and midside checks;
- fixed-coordinate displacement and stress recovery;
- pressure and nozzle-traction force/moment equilibrium;
- energy qualification;
- fixed host/pad path membrane and bending decomposition;
- shared-node neck/host and neck/pad interface evidence;
- governed four-level convergence;
- caller-status, semantic-hash, and retained-authority tamper rejection.

The workflow retains a diagnostic record even when qualification fails.

## Authority disposition

A passing BB-09 report may state:

```text
APPLICATION_PROCEDURE_QUALIFIED = true
NUMERICAL_OUTPUT_QUALIFIED = true
BB12_PLANAR_INTAKE_AUTHORIZED = true
```

It must retain:

```text
CODE_ASSESSMENT_QUALIFIED = false
MODULE_QUALIFIED = false
APPLICATION_MODULE_PROMOTED = false
PRODUCTION_SWITCH_AUTHORIZED = false
APPLICATION_EXECUTION_AUTHORIZED = false
AXISYMMETRIC_AUTHORIZED = false
BB12_AUTHORIZED = false
BUCKET_01_QUALIFIED = UNCHANGED
```

`BB12_PLANAR_INTAKE_AUTHORIZED` is a limited input permission. It is not the
combined BB-12 adjudication and does not replace BB-11's separate
`BB12_AUTHORIZED` receipt.

## Explicit limitations

The procedure does not qualify:

- a three-dimensional vessel/nozzle junction;
- circumferential shell load redistribution;
- weld profile, weld throat, contact, lift-off, or friction;
- plasticity, buckling, fatigue, or fracture;
- pressure correction or stress classification;
- ASME or other code assessment;
- application-template registry promotion;
- module qualification or production switching.

These limitations must remain present in the executable module evidence and
must not be reinterpreted by downstream consumers.
