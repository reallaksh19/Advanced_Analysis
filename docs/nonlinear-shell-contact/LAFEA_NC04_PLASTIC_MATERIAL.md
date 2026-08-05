# LAFEA-NC NC-04 — Plastic Material Qualification Contract

NC-04 independently governs the first constitutive-material authority required for later plastic denting. It is not inferred from shell, contact, or elastic-denting qualification.

## Pinned scope

The first lot is rate-independent small-strain J2 plasticity with true Cauchy stress, logarithmic equivalent plastic strain, von Mises yield, associative flow, tabulated isotropic hardening, elastic-predictor/radial-return integration, and a consistent algorithmic tangent.

Longitudinal and circumferential monotonic coupon evidence require at least three replicates per orientation. Authority is bounded by the tested and validated equivalent-plastic-strain range. Post-necking data require measured area reduction or inverse calibration; naive engineering-to-true conversion is not accepted beyond uniform elongation.

## Required evidence

Elastic constants, both coupon orientations, pre-necking conversion, post-necking traceability, uniaxial return mapping, multiaxial yield, consistent tangent, and nonnegative plastic dissipation are mandatory, together with immutable material, test-procedure, specimen, curve, solver, binary, container, compiler, library, and platform custody.

## Exclusions

Kinematic or combined hardening, cyclic authority, temperature or rate dependence, anisotropy, damage, fracture, plastic denting, code assessment, and production execution remain excluded.

`nc04ContractQualified` may become true through deterministic contract CI. `plasticMaterialQualified` remains false until the evidence package and all solver-custodied benchmarks pass.
