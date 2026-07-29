# LFEA B-2.1 Resolved Linear Mechanical-Model Contract

## Base and branch

- Required base SHA: `88b3f3c3d1bd64b099c22a1bdd2a9cb1cc34180d`
- Target branch: `feat/lfea-b2-1-linear-model-contract`
- Draft PR: `#7`
- Contract schema: `fea-linear-model/v1`

The authoritative qualification head and GitHub Actions run are retained in the PR review record rather than hard-coded here, so this report does not become stale when reviewer-only corrections are added.

## Contract boundary

The contract represents one accepted geometry state, one resolved property state, one linear restraint-capability state, one formulation-registry version, zero physical load cases, and zero solver results.

It contains resolved nodes, material states, section states, elements, supplied local axes, fixed constraints, linear springs, prescribed-value eligibility slots, limitations, diagnostics, ancestry, and three separate hash authorities.

It excludes physical loads, prescribed-displacement values, load combinations, solver settings, factorizations, result recovery, stress, SIF, allowables, utilization, nonlinear support behavior, and UI state.

## Record catalogue

- Nodes: canonical kernel identity, finite coordinates, and retained source ancestry.
- Material states: explicit `E`, `G`, Poisson ratio, density, thermal expansion coefficient, evaluation temperature, material identity, and source evidence.
- Section states: explicit `A`, `Iy`, `Iz`, `J`, and source evidence.
- Elements: resolved connectivity, formulation identity, material and section references, supplied right-handed orthonormal local axes, and source ancestry.
- Constraints: `FIXED`, `LINEAR_SPRING`, and value-free `PRESCRIBED_SLOT` records in the global basis.
- Limitations: machine-readable records with explicit stiffness relevance.
- Diagnostics: canonical evidence records with qualification-evidence identities.

Kernel identities use the B-2.0 canonical ASCII grammar. Source-system ancestry and evidence strings are retained exactly and may contain source-native spaces, separators, colons, and Unicode.

## Hash authority

### `stiffnessStateHash`

Covers the numerical state that determines the assembled stiffness and free/constrained partition: units and conventions, node coordinates, connectivity, formulations, `E`, `G`, `A`, `Iy`, `Iz`, `J`, supplied axis vectors, linear-spring stiffness, constrained node/DOF membership, formulation-registry version, and stiffness-relevant limitations.

It excludes ancestry, diagnostic wording, density, thermal expansion coefficient, evaluation temperature, prescribed values, physical loads, timestamps, UI state, element record IDs, and constraint record IDs. Fixed and prescribed slots share a constrained-partition projection while retaining different semantic identities.

Element and constraint projections are sorted by their canonical stiffness content after non-mechanical record IDs are removed. Renaming those record IDs therefore does not invalidate a reusable stiffness factorization.

### `semanticHash`

Covers the complete accepted model meaning, including the stiffness state, model identity and revision, ancestry, density, thermal expansion coefficient, evaluation temperature, source evidence, validation profile, constraint behavior, record identities, and all limitations. Diagnostics are excluded.

### `evidenceHash`

Covers the `semanticHash`, canonical diagnostics, diagnostic evidence, and qualification-evidence identities.

## Canonical ordering

- nodes by `nodeId`
- material states by `materialStateId`
- section states by `sectionStateId`
- elements by `elementId`
- constraints by `constraintId`
- limitations by `code`
- diagnostics by severity, code, entity type, and entity identity
- source evidence by source ID, source revision, and source semantic hash

Canonicalization copies caller arrays before sorting and never uses locale-sensitive ordering. Source ancestry is sorted deterministically without applying the kernel ID grammar to source-native strings.

## Fixtures

The fixture catalogue contains all required valid and invalid cases, including oriented 3D axes, fixed/spring/prescribed capabilities, duplicate identities, nonfinite coordinates, zero length, missing references, invalid axes, duplicate constraints, embedded prescribed values, nonlinear behavior, and stale hash authorities.

## Qualification checks

The release-blocking B-2.1 command runs:

1. the original 28 qualification tests;
2. the reviewer regression checks;
3. the anti-drift source guard.

Targeted evidence includes:

- 28/28 original qualification tests passing;
- 9/9 deliberate regressions detected;
- reviewer checks proving element/constraint ID renaming does not alter stiffness identity;
- reviewer checks proving source-native ancestry strings are retained and hash-bound;
- anti-drift source guard passing.

The dedicated GitHub Actions certification executes the exact work-pack command set:

| Command | Required result |
| --- | --- |
| `npm ci` | PASS |
| `npm run check:lfea-b2.0` | PASS |
| `npm run check:lfea-b2.1` | PASS |
| `npm run check:lfea-core` | PASS |
| `npm run check:lfea-workbench` | PASS |
| `npm run syntax:strict` | PASS |
| `npm run check:imports` | PASS |
| `npm run build` | PASS |
| `npm run gate` | PASS |
| `git diff --check` | PASS |
| `git status --short` | PASS — clean checkout |

## Reviewer corrections

The independent review corrected two issues before merge:

1. Stiffness projections had been ordered by element or constraint IDs and then had those IDs removed. The corrected implementation orders the projected mechanical records by canonical stiffness content, preventing non-mechanical ID renaming from changing `stiffnessStateHash`.
2. Source ancestry and evidence fields had been validated with the kernel canonical-ID grammar. The corrected implementation retains nonempty resolved source-system strings exactly, while continuing to enforce canonical IDs for executable kernel entities.

Both corrections are release-blocking through `scripts/lfea-b2.1-reviewer-check.mjs` and the B-2.1 source guard.

## Deliberate regressions

The qualification script demonstrates detection of:

1. source ancestry removed from `semanticHash`;
2. density included in `stiffnessStateHash`;
3. `E` excluded from `stiffnessStateHash`;
4. caller arrays sorted in place;
5. a local axis silently normalized;
6. a numeric prescribed value embedded in the model;
7. duplicate node/DOF constraints accepted;
8. nonlinear behavior accepted;
9. diagnostic wording changing `semanticHash`.

## Known limitations

- Only `PIPE_FRAME3D_LINEAR_V1` is registered under `PIPE-LINEAR-R1`.
- Only global-basis fixed, linear-spring, and prescribed-slot capabilities are accepted.
- Constraint composition is not defined.
- Local axes must be supplied by an upstream compiler; this package verifies but never constructs or repairs them.
- Physical load cases and prescribed-displacement values require a future contract.

## Status

B-2.1 STATUS: QUALIFIED
