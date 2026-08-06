# LAFEA-NC NC-03 Elastic Denting Qualification

NC-03 qualifies one bounded, linear-elastic local pipe-denting procedure above the exact NC-02 frictionless-contact receipt. It does not authorize plastic denting, permanent-dent assessment, collapse, code assessment, fitness-for-service, remaining strength, or production execution.

## Registered cell

The qualified candidate cell is fixed before execution:

```text
shell:                         S8R full cylindrical shell
D/t:                           40
indenter:                      rigid spherical patch
indenter radius / D:           0.4
indenter patch width / D:      0.5
model length / D:              2.0
pressure elastic ratio:        9.523809523809524e-4
boundary distance / sqrt(Rt):  8.94427190999916
imposed dent depth / D:         0.02
nominal mesh:                  16 axial x 32 circumferential
contact:                       exact NC-02 frictionless finite sliding
material:                      linear elastic only
```

The eight-step sequence applies follower-pressure preload, establishes contact, advances four displacement-controlled indentation levels, unloads the indenter while pressure is maintained, and then depressurizes. Dent geometry is measured relative to the pressure-only equilibrium surface.

## Executed evidence domains

```text
NC03-ED-01 pressure-preload equilibrium
NC03-ED-02 displacement-controlled force-dent path
NC03-ED-03 pressure-maintained and depressurized elastic recovery
NC03-ED-04 three-level pressure sensitivity
NC03-ED-05 three-length boundary sensitivity
NC03-ED-06 four-level rounded-indenter mesh convergence
NC03-ED-07 three-level increment convergence
NC03-ED-08 byte-identical force-dent reproducibility
```

Each evidence object is exact-head bound and retains raw solver custody, an independent DAT/CVG oracle, force and displacement paths, loaded dent geometry, outer and inner strain screens, recovery, internal-energy cycle closure, global force residual, sensitivity ladders, raw/reference/oracle hashes, and a governed negative mutation. Caller-created PASS, status, disposition, qualification, and authority fields are rejected.

## Fixed acceptance limits

```text
pressure-maintained/depressurized recovery ratio <= 1.0e-4
global force residual                         <= 2.0e-4
energy-cycle closure                          <= 1.0e-5
linear-elastic strain screen                  <= 1.0e-2
pressure sensitivity                          <= 5.0e-3
boundary sensitivity                          <= 8.0e-2
mesh convergence                              <= 5.0e-2
increment convergence                         <= 1.0e-4
repeat-execution difference                   <= 1.0e-12
```

No limit may be changed by the qualification run.

## Authority boundary

A passing exact-head receipt may set only:

```text
nc03ContractQualified = true
shellFormulationQualified = true
contactProcedureQualified = true
elasticDentingProcedureQualified = true
nc04Authorized = true
```

Plastic material, plastic denting, code assessment, module, production, automatic asset acceptance, autonomous case disposition, fitness-for-service, and remaining-strength authority remain false.
