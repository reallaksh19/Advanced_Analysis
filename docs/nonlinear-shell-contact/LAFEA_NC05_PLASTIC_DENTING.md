# LAFEA-NC NC-05 — Plastic Denting Procedure Contract

NC-05 is the integration gate for permanent local pipe denting. It requires independently qualified contact, elastic-denting, and plastic-material receipts and cannot bypass any upstream mechanics gate.

## Pinned scope

The procedure uses a three-dimensional localized shell model, finite-rotation/small-strain kinematics, displacement-controlled quasi-static indentation, pressure preload and hold, unloading, pressure-maintained residual measurement, and depressurized residual measurement. Authority is restricted to registered dimensionless cells and to equivalent plastic strains not exceeding the NC-04 material receipt.

## Required evidence

Each cell requires below-yield elastic regression, first-yield onset, monotonic plastic indentation, pressure-maintained and depressurized residual dents, plastic-zone extent, pressure sensitivity, mesh/increment/material sensitivity, and experimental force–dent and residual-dent validation. Plastic-zone thresholds are case-registered and evidence-backed rather than universal constants.

Reported metrics include loaded and residual dents, diameter reduction, second-harmonic ovalization, half-depth dent dimensions, root/flank inner and outer strains, maximum equivalent plastic strain, plastic-zone extent, plastic dissipation, global equilibrium, and energy balance.

## Exclusions

Collapse, failure pressure, damage, fracture, fatigue, fitness-for-service or code compliance, production execution, and extrapolation outside qualified cells remain excluded.

`nc05ContractQualified` may become true through deterministic contract CI. `plasticDentingProcedureQualified` remains false until all upstream receipts, solver custody, cells, numerical convergence evidence, and experimental validation pass.
