# LAFEA.2 nominal pipe-section and attachment-demand screening

## Authority

This core-only capability implements Issue #146 above the accepted LAFEA.1 foundation. It consumes a matching canonical `local-attachment-foundation-model/v1` and accepted `local-attachment-foundation-result/v1`, reconstructs both public contracts, and rejects mixed, stale, forged, unsupported, or incomplete source evidence before calculations begin.

Engineering level:

```text
NOMINAL_PIPE_SECTION_SCREENING_ONLY
```

It is a deterministic far-field pipe-section baseline. It is not local attachment stress, stress concentration, code compliance, transverse shear recovery, shell analysis, weld analysis, fatigue, buckling, or material acceptance.

## Public API

```js
import {
  createLocalAttachmentScreeningRequest,
  validateLocalAttachmentScreeningRequest,
  calculateLocalAttachmentScreening,
  reconstructScreeningResultHashes,
} from './src/core/local-attachment-screening/index.js';
```

Contracts:

```text
local-attachment-screening-request/v1
local-attachment-screening-result/v1
```

The request sealing boundary canonicalizes case terms, cases, locations, angles, requested envelopes, limitations, and the quantity-specific qualification profile. No case, factor, radius, angle, or envelope is invented.

## Section basis

Only the LAFEA.1 assessment pipe wall is authoritative:

```text
ro = outsideDiameter / 2
ri = ro - assessmentPipeThickness
A  = pi (ro^2 - ri^2)
Iy = Iz = pi/4 (ro^4 - ri^4)
J  = pi/2 (ro^4 - ri^4) = Iy + Iz
```

Pad, cradle, coating, insulation, and effective analytical thickness do not alter the section or pressure wall.

## Coordinates and mechanics

The LAFEA.1 right-handed pipe-local frame is retained:

```text
X = pipe axial
Y = circumferential tangent at angular zero
Z = radial outward at angular zero
```

For angle `phi` from `+Z` toward `+Y`:

```text
y = r sin(phi)
z = r cos(phi)
```

Nominal mechanical stresses are:

```text
sigmaXMechanical = Fx/A + My*z/Iy - Mz*y/Iz
tauXThetaTorsion = Mx*r/J
```

`Fy` and `Fz` remain in case evidence but do not create a transverse-shear stress field. The mandatory limitation `NO_TRANSVERSE_SHEAR_STRESS_RECOVERY` remains present.

## Pressure reuse and same-point tensor

Pressure is sourced from the matching accepted LAFEA.1 pressure result. An emitted point at the declared radius is reused exactly; otherwise the retained LAFEA.1 Lamé coefficients recover that radius under the same pressure convention. Closed-end and open-end axial pressure components require retained LAFEA.1 axial evidence. Explicit axial resultants remain mechanical resultants. A non-zero pressure factor with `UNSPECIFIED` axial end semantics fails closed; it is never represented as zero axial pressure stress. A zero pressure factor may retain an unspecified source because no pressure component enters the tensor.

An explicit axial resultant is superposed as mechanical axial force and is never relabelled as pressure stress.

At one declared case and location:

```text
sigmaX     = sigmaXMechanical + sigmaXPressure
sigmaTheta = sigmaThetaPressure
sigmaR     = sigmaRPressure
tauXTheta  = tauXThetaTorsion
```

Principal stresses and von Mises stress are calculated only from that same tensor. Qualification evidence reconstructs tensor assembly, principal characteristic roots, and von Mises from both tensor and principal forms.

## Linear cases and envelopes

Each case explicitly declares mechanical load terms, term factors, one pressure definition, a pressure factor, and a source reference. Terms and cases are canonically ordered; duplicate identities and missing references fail closed.

Envelopes range only over declared cases and declared evaluation locations. Every item retains the exact case, location, radius, angle, load terms, and pressure definition. Equal values use the versioned rule:

```text
value, then screeningCaseId, then evaluationLocationId
```

## Determinism and hashes

The implementation uses strict finite numbers, calculated negative-zero normalization, code-unit ordering, JSON-safe plain data, caller isolation, and deep immutability. It emits independent hashes:

```text
sourceEvidenceSemanticHash
screeningRequestSemanticHash
screeningResultPayloadSemanticHash
executionEvidenceHash
qualificationEvidenceHash
```

Rejected results retain deterministic diagnostics and hashes but omit authoritative section properties, case resultants, point stress states, and envelopes.

## Certification

```bash
npm run check:lafea.2
```

The command covers contracts, LAFEA.1 source reconstruction, exact annulus properties, axial/bending/torsional mechanics, pressure combination, invariants, deterministic envelopes, repeated-byte identity, immutability, and exact-baseline source scope.

No GitHub Actions workflow is added, modified, triggered, or required by LAFEA.2.
