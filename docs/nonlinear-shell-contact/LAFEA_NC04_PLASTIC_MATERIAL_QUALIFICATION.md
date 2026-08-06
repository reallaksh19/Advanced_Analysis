# LAFEA-NC NC-04 Plastic Material Qualification

NC-04 independently qualifies one bounded constitutive lot for later nonlinear denting work. It does not qualify plastic denting, code assessment, fitness-for-service, remaining strength, or production execution.

## Qualified candidate lot

The candidate is rate-independent, small-strain J2 plasticity with true stress/logarithmic plastic-strain input, a von Mises yield surface, associative flow, tabulated isotropic hardening, radial-return integration, elastic modulus 210000, Poisson ratio 0.3, and the governed hardening table:

| True stress | Log plastic strain |
|---:|---:|
| 250 | 0 |
| 300 | 0.002 |
| 350 | 0.01 |
| 450 | 0.05 |

No extrapolated material lot, cyclic rule, rate effect, temperature effect, anisotropy, damage, or fracture model is included.

## Executed benchmark domains

The exact retained CalculiX 2.22 binary executes homogeneous C3D8 material-point specimens for:

1. elastic modulus and Poisson response;
2. yield onset;
3. hardening-table points and interpolation;
4. elastic unloading and residual plastic strain;
5. hydrostatic invariance;
6. simple-shear J2 consistency;
7. biaxial J2 consistency;
8. increment convergence; and
9. algorithmic tangent consistency.

Every evidence record is sealed to the exact candidate head, solver binary, implementation-source hash, input-deck hashes, raw DAT/CVG hashes, and case count. Two isolated full suites must produce byte-identical canonical summaries and evidence.

## Acceptance boundary

The evaluator enforces the contract tolerances without accepting caller pass flags. It also requires the exact qualified NC-03 receipt and immutable solver custody. A passing report may set only `plasticMaterialQualified=true` and `nc05Authorized=true` above inherited shell, contact, and elastic-denting authority.

## Explicit exclusions

NC-04 does not authorize cyclic plasticity, kinematic hardening, rate or temperature dependence, anisotropy, damage, fracture, plastic denting, code assessment, module qualification, production execution, automatic asset acceptance, autonomous case disposition, fitness-for-service conclusions, or remaining-strength conclusions.
