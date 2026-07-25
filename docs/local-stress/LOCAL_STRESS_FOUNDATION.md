# LAFEA.1 canonical attachment load and pressure foundation

## Authority and scope

This module implements the core-only LAFEA.1 foundation governed by Issue #142.
It is solver-independent and has no Workspace, application-shell, registry,
view-state, UI, renderer, FEA, shell, contact, weld, local attachment-stress, or
code-compliance integration.

Engineering level:

```text
LOAD_TRANSFER_AND_PRESSURE_BASELINE_ONLY
```

## Public API

```js
import {
  createCanonicalLocalAttachmentFoundationModel,
  validateCanonicalLocalAttachmentFoundationModel,
  calculateLocalAttachmentFoundation,
  reconstructResultHashes,
} from './src/core/local-stress/index.js';
```

`createCanonicalLocalAttachmentFoundationModel` is the sealing boundary used by
an authorized adapter. It validates source references and strict numeric input,
converts declared units, derives or validates assessment thickness, orders all
entities deterministically, retains source evidence, and creates the separate
source, transformation, and canonical-model hashes.

`calculateLocalAttachmentFoundation` accepts only a sealed reconstructable
model. It returns an immutable accepted or rejected result and never throws an
engineering validation failure to the caller.

## Contracts

Canonical model:

```text
local-attachment-foundation-model/v1
```

Result:

```text
local-attachment-foundation-result/v1
```

Every scalar or vector source input carries a source reference with the closed
form:

```text
<sourceModelIdentity>@<sourceVersion>#<source-path>
```

Mixed or stale source references fail closed. The retained source evidence must
reconstruct the canonical model byte-for-byte under canonical JSON semantics.

## Coordinates

```text
X = pipe axial direction
Y = circumferential tangent
Z = radial outward direction
```

The governed construction projects the declared radial hint normal to `X`,
normalizes it as `Z`, and sets `Y = Z × X`. A separately declared
circumferential hint must align with the resulting right-handed `Y` direction.
No fallback axis is selected.

Results retain origin, axes, rotation matrix, conditioning, orthogonality,
handedness, round-trip reconstruction, and quantity-specific tolerance evidence.

## Loads

Reference-point transfer uses:

```text
F_T = F_S
M_T = M_S + (r_S - r_T) × F
```

Input action sense is closed to:

```text
PIPE_ON_SUPPORT
SUPPORT_ON_PIPE
```

The canonical result is expressed as `SUPPORT_ON_PIPE`. A `PIPE_ON_SUPPORT`
resultant reverses both force and moment before point transfer. Evidence retains
source and target points, lever arm, source and transformed resultants, local and
global components, reconstruction residuals, and common-origin moment residuals.

## Pressure

The elastic cylindrical Lamé baseline is:

```text
sigma_r(r)     = A - B/r^2
sigma_theta(r) = A + B/r^2
A = (pi*ri^2 - po*ro^2)/(ro^2-ri^2)
B = ((pi-po)*ri^2*ro^2)/(ro^2-ri^2)
```

Boundary evidence qualifies `sigma_r(ri) = -pi` and
`sigma_r(ro) = -po` using the explicit qualification profile.

Supported end conditions:

```text
OPEN_END
CLOSED_END
EXPLICIT_AXIAL_RESULTANT
UNSPECIFIED
```

`CLOSED_END` uses `sigmaX = A`; `OPEN_END` uses zero basic end-cap stress;
`EXPLICIT_AXIAL_RESULTANT` retains the supplied force separately and does not
convert it into pressure stress; `UNSPECIFIED` rejects axial-pressure requests.
External pressure always carries the limitations
`ELASTIC_PRESSURE_STRESS_ONLY` and
`NO_EXTERNAL_PRESSURE_STABILITY_ASSESSMENT`.

## Thickness isolation

The model retains independent nominal pipe, corrosion, assessment pipe,
wear-pad, cradle, and effective analytical thickness evidence. Pressure uses
only `assessmentPipeThickness`. Pad, cradle, and effective analytical thickness
cannot alter the pressure-wall basis.

## Determinism and hashes

The implementation uses strict finite numbers, calculated negative-zero
normalization, code-unit ordering, canonical JSON, plain data, deep freezing,
and caller isolation. It emits distinct hashes:

```text
sourceSemanticHash
canonicalModelSemanticHash
resultPayloadSemanticHash
executionEvidenceHash
qualificationEvidenceHash
```

No time, duration, host, path, random identifier, UI state, filesystem, network,
or insertion-order identity participates in production evidence.

## Rejected results

Rejected and unsupported results contain qualification, deterministic
diagnostics, limitations, and reconstructable result/qualification hashes. They
do not contain coordinate evidence, transformed-load arrays, pressure-stress
arrays, or accounting arrays that could be mistaken for accepted evidence.

## Certification

```bash
npm run check:lafea.1
```

The command runs contract, mechanics, pressure, failure/determinism, hash
reconstruction, immutability, and exact-base source-scope checks.

## Mandatory limitations

```text
NO_LOCAL_ATTACHMENT_STRESS
NO_FEA
NO_SHELL_BENDING
NO_WELD_STRESS
NO_CONTACT
NO_CODE_COMPLIANCE
```
