# LFEA Phase 6I WP-2 Project Authority Index Contract — Rev 2

**Candidate:** `617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54`  
**Immutable ref:** `release/lfea-piping-phase6i-617f7c2`  
**Work package:** `WP-2 — PROJECT_BASIS_FREEZE`

## Purpose

This contract provides a deterministic, fail-closed structure for the caller-approved Project Authority Index required before real G8/G9 evidence production. It validates authority records; it does not create engineering values, approve a register, sign for the responsible engineer, modify the frozen candidate or qualify release.

## Files

- Reusable core contract and validator:  
  `src/core/linear-piping-project-qualification/project-authority-index.js`
- Compatibility export used by existing Phase 6I checks:  
  `scripts/lfea-piping-phase6i-project-authority-index.mjs`
- Contract checks:  
  `scripts/lfea-piping-phase6i-project-authority-index-check.mjs`
- Unresolved preparation template:  
  `governance/lfea-piping-phase6i-project-authority-index.template.json`

The committed template is intentionally unresolved and unsigned. It is not project evidence and cannot close WP-2.

## Required authority groups

The index requires exactly these eleven groups:

1. canonical units and source-unit normalization;
2. material assignments;
3. pipe and section properties;
4. local axes and reference vectors;
5. restraints, springs and prescribed movements;
6. physical load cases and combinations;
7. support, anchor, interface and nozzle definitions;
8. nozzle allowable profiles;
9. B31.3 authority;
10. representative real-project model and scope boundary;
11. nonlinear exclusions and escalation route.

A separate responsible-engineer approval record is mandatory after all groups are resolved.

## Status model

`WP2_INPUT_REQUIRED` is returned when any authority group remains `UNRESOLVED_GATE`.

`WP2_APPROVAL_REQUIRED` is returned when every group is resolved but one or more group approvals or the responsible-engineer approval are missing.

`WP2_COMPLETE` is returned only when:

- all eleven groups are present and resolved;
- every applicable or approved-not-applicable group has a complete retained source identity;
- every group is approved;
- the responsible piping/stress authority approval is retained;
- the exact candidate SHA and immutable ref match;
- semantic and evidence hashes reconstruct exactly.

Even `WP2_COMPLETE` retains `releaseQualified: false`. WP-2 completion is an engineering-authority handoff prerequisite, not release approval.

## Permitted source classes

- `PROJECT_DOCUMENT`
- `APPROVED_ENGINEERING_REGISTER`
- `CONTROLLED_MODEL`
- `VENDOR_DOCUMENT`
- `CODE_DATASET`
- `APPROVAL_RECORD`

Each resolved group retains document identity, title, revision, owner, retained reference and source hash.

## Prohibited authority sources

The contract rejects engineering-enrichment proposals, shadow candidate values, proposal-only states and authorized-master-candidate tokens. It also rejects production/commercial-output labels, filename/default-value inference, unknown source classes, candidate mismatch, missing or duplicate groups, premature approval, unsupported non-applicability, invalid hashes, invalid timestamps and record tampering.

The same screening applies to the final responsible-engineer approval evidence reference. Production output, commercial output, filenames, defaults and magnitude-based inference remain ineligible as project authority.

## Hash behavior

The semantic hash identifies the candidate-bound authority content and approval evidence identity. Preparation and approval timestamps are excluded from semantic identity.

The evidence hash includes timestamped custody metadata. Therefore, timestamp-only changes preserve the semantic hash but change the evidence hash.

## Phase 6H binding

The Phase 6H materialization request schema is `lfea-piping-external-materialization-request/v2`.

The request must name a safe relative JSON path for an approved Project Authority Index. Phase 6H validates this record before reading the seven external records. The validated authority record is:

- retained as `external/project-authority-index.json`;
- embedded in `linear-piping-external-qualification-package/v2`;
- included in the external package semantic and evidence hashes;
- carried into Phase 6G and Phase 6E through the already-governed external package identity.

A legacy v1 materialization request or an unresolved/unsigned authority index fails closed.

## Current disposition

The committed template remains:

```text
WP2_STATUS: WP2_INPUT_REQUIRED
ENGINEERING_APPROVAL: NOT_APPROVED
UNRESOLVED_AUTHORITIES: 11
RELEASE_QUALIFIED: FALSE
```

The responsible piping/stress authority must populate and approve a real candidate-bound index before Phase 6H can materialize external qualification evidence.
