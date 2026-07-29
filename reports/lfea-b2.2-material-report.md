# LFEA B-2.2 Temperature-Resolved Material-State Compiler

## Base and branch

- Work package: `LFEA-B2.2`
- Required base SHA: `024d6c0e4ab3232e225311a9253f42a81459d842`
- Target branch: `feat/lfea-b2-2-material-resolution`
- Material table schema: `fea-linear-material-table/v1`
- Resolution profile schema: `fea-linear-material-resolution-profile/v1`
- Resolution result schema: `fea-linear-material-resolution/v1`

## Contract boundary

B-2.2 accepts one governed material table, one material-resolution request, and one versioned interpolation profile. It returns one fully resolved, immutable B-2.1 material-state record together with retained resolution evidence.

The package resolves pointwise material properties only. It does not construct mechanical models, sections, local axes, loads, thermal-strain integrals, stiffness matrices, assemblies, solver state, results, stress, SIF, code checks, or UI state.

`request.evaluationTemperature` is the sole property-evaluation authority. Installation, operating, design, load-case, and nearest-point temperatures are neither accepted nor inferred.

## Contracts

### Material table

The table retains source-native `materialId`, `sourceId`, and `sourceRevision` strings. It requires at least one positive absolute-temperature point and independently validates finite `E`, `G`, Poisson ratio, density, and thermal expansion coefficient. Duplicate IEEE-754 temperature values are blocking.

Table-point array order is non-semantic. Canonicalization copies the caller array, normalizes numbers through the B-2.0 numerical authority, and sorts by ascending absolute temperature without mutating the caller.

### Resolution profile

`LINEAR-MATERIAL-INTERPOLATION-R1` declares:

- `LINEAR_BRACKET_INTERPOLATION_V1`;
- `IEEE754_EXACT_TEMPERATURE_MATCH_V1`;
- `EXTRAPOLATION_PROHIBITED_V1`.

The profile contains no hidden lookup tolerance.

### Resolution request

The request contains exactly:

- canonical `materialStateId`;
- retained source `materialId`;
- positive `evaluationTemperature` in kelvin.

No installation, operating, design, or load-case temperature field is permitted.

### Resolution result

The result retains profile and table hashes, the exact request, resolution method and bracket, the complete B-2.1 material state, canonical diagnostics, a semantic hash, and a distinct evidence hash.

The material state uses the exact merged B-2.1 shape:

- `materialStateId`;
- `materialId`;
- `elasticModulus`;
- `shearModulus`;
- `poissonRatio`;
- `massDensity`;
- `thermalExpansionCoefficient`;
- `evaluationTemperature`;
- `sourceEvidence`.

## Exact-match authority

A request exactly equal to a table temperature under IEEE-754 equality returns the table values without interpolation arithmetic:

```text
method = EXACT_TABLE_POINT
lowerTemperature = T
upperTemperature = T
interpolationFactor = 0
```

No tolerance or nearest-point fallback participates.

## Interpolation authority

For the unique adjacent bracket `T0 < T < T1`:

```text
lambda = (T - T0) / (T1 - T0)
P(T) = P0 + lambda * (P1 - P0)
```

The formula is applied independently to `elasticModulus`, `shearModulus`, `poissonRatio`, `massDensity`, and `thermalExpansionCoefficient`. The resolver does not derive `G`, derive Poisson ratio, fit a curve, clamp, extrapolate, or round.

Below-range and above-range requests are blocking with `MATERIAL_TEMPERATURE_BELOW_RANGE` and `MATERIAL_TEMPERATURE_ABOVE_RANGE`.

## Hash authorities

### Table semantic hash

Binds the table schema, retained material identity, complete source evidence, canonical temperature points, and every supplied property value.

### Resolution-profile semantic hash

Binds the profile schema, profile ID, interpolation rule, exact-match rule, and extrapolation rule.

### Resolution semantic hash

Binds the table semantic hash, profile semantic hash, exact request, method and bracket evidence, and complete resolved B-2.1 material state. Diagnostic prose is excluded.

### Resolution evidence hash

Binds the resolution semantic hash together with canonical diagnostics, diagnostic evidence, and qualification-evidence identities.

All hashes use `src/core/shared-piping-model/canonical-json.js`, including its UTF-8 semantic-hash authority. B-2.2 contains no private hash implementation.

## Required errors

The implementation exposes the governed blocking codes:

- `MATERIAL_TABLE_INVALID`;
- `MATERIAL_TABLE_DUPLICATE_TEMPERATURE`;
- `MATERIAL_REQUEST_INVALID`;
- `MATERIAL_ID_MISMATCH`;
- `MATERIAL_TEMPERATURE_BELOW_RANGE`;
- `MATERIAL_TEMPERATURE_ABOVE_RANGE`;
- `MATERIAL_INTERPOLATION_BRACKET_MISSING`;
- `MATERIAL_RESOLVED_VALUE_INVALID`;
- `MATERIAL_PROFILE_INVALID`;
- `MATERIAL_HASH_MISMATCH`.

## Qualification coverage

The targeted checker covers `B22-T01` through `B22-T27`, including exact schemas, exact-point resolution, midpoint and non-midpoint interpolation, non-semantic point order, caller immutability, duplicate and range rejection, independent property interpolation, resolved-property validation, source identity behavior, exact B-2.1 output shape, semantic/evidence diagnostic separation, Unicode source evidence, deep immutability, and stale-hash rejection.

## Deliberate regressions

The qualification suite demonstrates detection of:

1. silent temperature clamping;
2. extrapolation;
3. deriving `G` from `E` and Poisson ratio;
4. in-place caller-point sorting;
5. accepted duplicate temperatures;
6. removal of source revision from semantic identity;
7. diagnostic wording changing semantic identity;
8. a private hash implementation;
9. installation temperature replacing evaluation temperature.

No deliberate regression remains in production source.

## Known limitations

- Linear interpolation between adjacent governed points only.
- IEEE-754 exact temperature equality only; no tolerance profile exists in R1.
- Extrapolation, clamping, and nearest-point behavior are prohibited.
- One source-evidence record is retained from the accepted material table.
- No thermal-strain integration or physical-load construction.
- No constitutive identity is enforced between `E`, `G`, and Poisson ratio.

## Qualification status

Targeted local qualification before repository CI:

- 27/27 required checks passing;
- 9/9 deliberate regressions detected;
- anti-drift source guard passing.

Repository-wide command evidence will be appended after the exact final head completes CI.

B-2.2 STATUS: QUALIFICATION IN PROGRESS
