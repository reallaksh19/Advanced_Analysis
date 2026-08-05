# LAFEA-NC NC-03 — Elastic Denting Procedure Contract

NC-03 governs the first local pipe-denting procedure that may eventually support elastic engineering conclusions. It does not qualify mechanics by contract declaration alone.

## Pinned scope

The model is a three-dimensional localized shell analysis with linear elasticity, follower pressure preload, frictionless qualified contact, displacement-controlled quasi-static indentation, unloading, pressure-maintained recovery, and optional depressurization. Dent depths are measured relative to the pressure-only equilibrium surface.

Authority is confined to registered dimensionless cells containing bounded ranges for D/t, indenter width/D, indenter radius/D, model length/D, pressure elastic ratio, and boundary distance/sqrt(Rt). Extrapolation outside those cells is prohibited.

## Required evidence

Each registered cell requires pressure-preload equilibrium, indentation, elastic recovery, pressure sensitivity, boundary extension, mesh convergence, increment convergence, and force–dent path reproducibility evidence. Reference and raw hashes, uncertainty-aware tolerances, convergence sweeps, equilibrium, energy, and recovery residuals are mandatory.

## Exclusions

Plasticity, permanent dent authority, collapse, failure pressure, damage, fracture, fatigue, code assessment, production execution, and raw maximum contact-pressure engineering authority remain excluded.

`nc03ContractQualified` may become true through deterministic contract CI. `elasticDentingProcedureQualified` remains false until a qualified NC-02 receipt, complete solver custody, registered cells, and all executed evidence packages pass.
