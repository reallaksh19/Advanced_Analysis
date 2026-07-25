# LFEA-006 — Read-Only Engineering Review and Deterministic Evidence Export

## Authority and baseline

- Required baseline: `e12adc701ea9b189a3d703dc218c227a854aef29`.
- Implementation is explicitly authorized by the LFEA-006 Work Pack.
- LFEA-001 through LFEA-005 remain the numerical, interpretation, sparse-backend and mesh-adapter authorities.
- LFEA-006 is a framework-neutral read-only review and export layer only.

## Closed contracts

```text
lfea-review-profile/v1
lfea-review-input/v1
lfea-engineering-review/v1
lfea-evidence-export/v1
```

The review input consumes an accepted `lfea-mesh-adapter-result/v1`, its exact `fea-continuum-model/v1`, and a qualified `fea-continuum-result/v1`, `v2`, or `v3`. Convergence study/result and stress projection are optional and represented by explicit `null` when absent.

## Cross-artifact qualification

A review is qualified only when all supplied semantic hashes and ancestry form one exact chain. The adapter must be accepted, its model hash must equal the supplied model hash, package ancestry must match model ancestry, and the continuum result must reference the supplied model. Optional convergence evidence must contain the current model/result level exactly once and the interpretation result must belong to the supplied study. Optional projection must reference the supplied result and retain `NON_AUTHORITATIVE_REVIEW_PROJECTION` authority.

No nearest-match, schema fallback or compatibility substitution is used. Rejected, singular, quarantined, partial, stale or unsupported numerical evidence fails closed.

## Review profile

Every review requires explicit deformation scale, display precisions, projection/convergence/source inclusion switches, and export row/byte capacities. Display precision changes formatted CSV and Markdown only. It does not change source values, hashes, qualification, governing locations, result comparisons or convergence classifications.

## Review status

```text
QUALIFIED_FOR_REVIEW
REJECTED_INCONSISTENT_EVIDENCE
REJECTED_UNQUALIFIED_RESULT
REJECTED_CAPACITY
```

`QUALIFIED_FOR_REVIEW` means the evidence chain is internally consistent and reviewable. It does not mean design acceptance, code compliance, physical validation, absence of model-form uncertainty, absence of singularity, or commercial-solver equivalence.

## Engineering review

The immutable `lfea-engineering-review/v1` contains all required sections, including explicit `NOT_SUPPLIED` optional sections. It retains analysis identity, model and mesh summaries, solver qualification, geometry, loads, constraints, displacements, original-system reactions, authoritative raw stress, optional projected stress, optional convergence evidence, diagnostics and predecessor limitations.

Scaled coordinates use:

```text
deformedX = x + deformationScale * ux
deformedY = y + deformationScale * uy
```

They are labelled `SCALED_DEFORMATION_REVIEW_GEOMETRY` and never replace original model coordinates.

## Loads, constraints, displacements and reactions

Load tables consume existing nodal-force and edge-load evidence. Pressure retains existing element-local outward-normal authority and is not rederived from display order. Constraints preserve the distinction between fixed and user-prescribed displacement. Displacements are reported per node. Reactions are consumed from the qualified original-system recovery and retain force/moment balance evidence.

## Stress authority

Raw T3 element stress and raw Q4 integration-point stress are labelled:

```text
AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS
```

All governing maxima retain element and result-location identity and are derived only from raw evidence.

Projected stress is optional and, when present, is labelled beside every dataset:

```text
AVAILABLE_NON_AUTHORITATIVE
NON_AUTHORITATIVE_REVIEW_PROJECTION
```

It is never used for governing stress, convergence, singularity classification, acceptance, code checks, equilibrium or energy.

## Convergence evidence

Optional convergence review preserves the existing study levels, `(h,q)` histories, classifications, observed-order applicability, Richardson estimate, trend status, location migration and singularity annotation without recalculation or strengthening. `SINGULARITY_SUSPECTED` is never upgraded. The review explicitly retains: “A stable global response does not prove convergence of a local peak stress.”

## Deterministic export

`lfea-evidence-export/v1` emits ordered UTF-8/LF payloads with immutable content hashes, byte lengths, authority and source-artifact identities. Required files are:

```text
manifest.json
review.json
summary.md
tables/nodes.csv
tables/elements.csv
tables/loads.csv
tables/constraints.csv
tables/displacements.csv
tables/reactions.csv
tables/raw-stress.csv
tables/qualification.csv
tables/diagnostics.csv
```

Projected-stress, convergence and source-artifact files are emitted only when requested and supplied. No placeholder source file is created for an absent optional artifact.

JSON uses the repository canonical JSON and semantic-hash authority. CSV has fixed columns, comma delimiters, double-quote escaping, LF line endings, locale-independent numbers and formula-injection protection for text beginning with `=`, `+`, `-` or `@`. Numeric negative values remain numeric. Markdown uses a fixed section order and contains no date, host, runner or automatic engineering approval statement.

## Manifest identity

Manifest file rows are sorted by path. The manifest omits its own final content hash from recursive identity. Its semantic hash is computed from the non-recursive manifest body; the manifest payload then records that stable hash while its export file row uses a deliberately non-recursive self-hash policy. Total byte length is solved deterministically to a fixed point.

## Capacity and rejection

Export row and byte limits are enforced before an accepted package is returned. Duplicate paths, invalid CSV width, non-finite values, malformed UTF-8 text, content-hash mismatch and manifest mismatch fail closed. Rejected review and export results expose no qualified datasets or file package.

## Qualification

```text
node scripts/lfea-006-check.mjs
node scripts/lfea-006-source-guard.mjs
```

The dedicated workflow checks out the exact head, runs LFEA-001 through LFEA-005 behavioral qualification, runs all LFEA-006 contract/review/export/failure/determinism checks, validates syntax and invokes only the LFEA-006 source guard.

## Limitations

- Review/export evidence only; no solver or editor.
- Two-dimensional small-displacement linear isotropic elasticity only.
- Plane stress or plane strain, T3/Q4 and static analysis only.
- No contact, plasticity, geometric nonlinearity, buckling, dynamics or thermal loading.
- No design-code or stress-acceptance assessment.
- Projected stress is non-authoritative.
- Convergence does not establish physical validation.
- Sparse qualification remains bounded rather than unrestricted.
- No application tab, DOM, Canvas, SVG, WebGL, Three.js or interactive selection.
- No PDF, DOCX, ZIP, cloud upload, W11 integration or commercial-report imitation.
