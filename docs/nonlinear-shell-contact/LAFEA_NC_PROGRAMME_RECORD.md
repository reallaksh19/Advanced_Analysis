# LAFEA-NC programme record

## Purpose and separation

LAFEA-NC is the governed nonlinear shell/contact programme for local pipe indentation, support contact and future denting assessment. It is independent of the existing LAFEA.3 linear two-dimensional continuum kernel. Nothing in this programme changes or extends `LINEAR_2D_CONTINUUM_CST_ONLY`.

General local pipe contact requires axial and circumferential variation, shell bending and rotation, changing unilateral contact, and ordered pressure/indentation histories. Plane stress, plane strain and axisymmetric models remain useful only for invariant or axisymmetric special cases and cannot represent a general finite contact patch.

## Authority sequence

```text
NC-00  contracts, solver custody and deterministic bridge
NC-01  shell formulation and geometric-nonlinearity qualification
NC-02  frictionless contact and elastic pipe-indentation qualification
NC-03  material plasticity qualification
NC-04  elastic-plastic residual-dent procedure qualification
NC-05  separately governed application/code-assessment package
```

The forward state sequence is:

```text
UNREGISTERED
→ CONTRACT_QUALIFIED
→ SOLVER_BRIDGE_QUALIFIED
→ SHELL_FORMULATION_QUALIFIED
→ CONTACT_PROCEDURE_QUALIFIED
→ ELASTIC_DENTING_PROCEDURE_QUALIFIED
```

Plastic-material, plastic-denting, module and production-execution authority remain separately controlled. NC-00 cannot promote any mechanics state.

## NC-00 capability

NC-00 defines immutable, hash-bound contracts for:

- three-dimensional shell nodes and Q4 shell abstractions;
- homogeneous isotropic elastic materials and midsurface shell sections;
- rigid plane, sphere, cylinder and saddle surface descriptions;
- frictionless shell-to-rigid contact declarations;
- explicit pressure, prescribed-motion and unloading steps;
- requested field/output inventory;
- pinned external-solver custody;
- deterministic solver-deck generation;
- isolated process execution and raw-output custody;
- structural result inventory, reconstruction and receipts.

Rigid sphere, cylinder and saddle contracts are now deck-enabled through a deterministic faceting profile. The generated facets, node/element maps and geometry hashes are evidence of adapter determinism only; they do not qualify geometric approximation or contact accuracy.

The parser now inventories solver completion markers, step/increment order, ASCII FRD datasets, record counts, requested-output coverage and limited provisional numeric ranges. These fields are structural execution evidence, not authoritative shell stress, contact pressure or denting results.

## NC-00 limits

NC-00 does not qualify:

- shell stiffness, locking control or finite-rotation accuracy;
- follower-pressure accuracy;
- contact enforcement, pressure distribution or penetration;
- pipe ovalization or dent depth;
- plasticity, residual dent, damage, fracture or fatigue;
- fitness-for-service or code assessment;
- UI or production execution.

`SOLVER_BRIDGE_QUALIFIED` requires a reviewed, exact solver profile, controlled external execution, complete raw evidence, independent reconstruction and deterministic replay on the exact repository head. A contracts-only replay may pass while the bridge remains blocked.
