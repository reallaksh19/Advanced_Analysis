# LAFEA-NC NC-08R real-module qualification

## Purpose

NC-08R is a separate fail-closed qualification gate for a production-intended nonlinear shell-contact module. It does not modify or reinterpret the immutable NC-08 synthetic-reference receipt.

The pinned upstream state is the exact qualified NC-08 receipt:

```text
NC08_EXACT_HEAD = e7f5f725c98861c7d734f64f75925602225e8e4b
NC08_ARTIFACT_DIGEST = sha256:6d39eee81da5a469f8a8455056ceabf413831fc7550ec2518c9d18989a472755
NC08_REPORT_HASH = sha256:b7b38c0018978c1ded085d0590d4899c55734735104dd23fa16007136afd9705
syntheticReferenceModuleQualified = true
moduleQualified = false
productionExecutionAuthorized = false
```

A caller cannot substitute a different self-sealed NC-08 binding. NC-08R may set `moduleQualified = true` only when a complete real release package passes every governed domain and is bound to both the exact candidate commit and its exact Git source tree. Even a qualified module does not authorize production execution.

## Required release identity

The real release record binds:

- exact production-intended source head and source tree;
- source manifest and reproducible build provenance;
- signed artifact and independent signature verification;
- dependency lock and complete SBOM;
- versioned API schemas and tested migration manifest;
- approved runtime profile and immutable production configuration;
- reference, hostile-input, security and resource evidence;
- real technical review and real owner approval;
- change control, expiry, revocation and requalification policies.

Synthetic versions, simulated approvals, unsigned artifacts, unresolved blocking findings, undeclared network access, runtime extensions, dynamic code and caller-supplied production authority are rejected.

## Evidence domains

1. Exact qualified NC-08 synthetic-reference receipt binding.
2. Production source-head and source-tree identity.
3. Reproducible signed artifact.
4. Dependency-lock and SBOM custody.
5. API-schema and migration evidence.
6. Reference and negative-control regression.
7. Security and resource boundaries.
8. Runtime and configuration custody.
9. Real technical review and owner approval.
10. Expiry, revocation and requalification.

## Authority transition

A future complete and independently evidenced real release package may produce:

```text
realModuleQualificationQualified = true
moduleQualified = true
nc09ProductionAuthorizationAuthorized = true
productionExecutionAuthorized = false
nc10Authorized = false
```

This means only that a separate production-deployment authorization phase may be evaluated. NC-08R never grants production deployment or execution.

A missing, malformed, synthetic, simulated, expired, source-tree-mismatched or inconsistent package produces:

```text
status = NC08R_BLOCKED
moduleQualified = false
nc09ProductionAuthorizationAuthorized = false
productionExecutionAuthorized = false
nc10Authorized = false
```

## Exact-head workflow custody

The workflow:

- resolves the exact PR or dispatch head and base;
- checks out the exact candidate head rather than GitHub's synthetic PR merge ref;
- verifies live `main`, ancestry and the exact eight-path allowlist;
- derives the exact candidate Git tree;
- runs syntax, unit and fail-closed controls;
- verifies a clean tracked worktree;
- uploads the blocked contract receipt under the exact head identity.

## Current repository receipt

No genuine signed release, production configuration or human approvals are supplied by this gate PR. Its retained receipt must therefore remain:

```text
NC08R_BLOCKED
registeredReleaseCount = 0
moduleQualified = false
nc09ProductionAuthorizationAuthorized = false
productionExecutionAuthorized = false
nc10Authorized = false
```

The positive fixture proves only the contract's transition logic. It is not repository release evidence and grants no authority.
