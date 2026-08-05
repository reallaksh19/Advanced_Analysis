# LAFEA-NC NC-02 — Contact Procedure Qualification Contract

## Purpose

NC-02 defines a fail-closed qualification gate for the first frictionless shell-to-rigid contact procedure. It does not qualify contact mechanics without a qualified NC-01 shell receipt, complete solver custody, and passing benchmark evidence.

## Pinned first-contact procedure

- Frictionless surface-to-surface penalty contact with finite sliding.
- Master normal points into the admissible slave region.
- Positive gap is open; negative gap is penetration; positive pressure is compression.
- The physical shell contact surface includes selected side, offset, and half-thickness.
- Penalty stiffness basis is `alpha * E_effective / h_effective` with mandatory sensitivity sweeps.
- Master/slave reversal and increment-size sensitivity are mandatory.
- Self-contact, friction, and gross-sliding authority remain excluded.

## Required engineering evidence

Integrated normal resultant, contact area, centroid, width, pressure percentiles, penetration distribution, contact work, and global equilibrium. Raw maximum pressure remains diagnostic only.

Mandatory benchmarks cover open contact, flat punch, sphere, cylinder, saddle, master/slave reversal, penalty sensitivity, and increment sensitivity.

## Authority

Contracts-only CI may set `nc02ContractQualified=true`. It must keep `contactProcedureQualified=false`, `elasticDentingProcedureQualified=false`, and production authority false until all upstream and benchmark gates pass.
