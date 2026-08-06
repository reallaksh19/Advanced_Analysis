# LAFEA-NC NC-08R Real-Module Qualification Gate

## Purpose

NC-08R defines the evidence gate that may set `moduleQualified = true` for an exact production-intended module release. It does not alter or reinterpret the immutable NC-08 synthetic reference-module receipt.

This change implements qualification mechanics only. It is **not** a real-module qualification receipt and does not claim that production source, signed artifacts, human approvals, or production deployment evidence currently exist.

## Required authority sequence

```text
NC-08 synthetic reference module qualified
  -> NC-08R real module qualified
  -> NC-09R production deployment authorized
  -> NC-10 governed production run
```

A successful NC-08R report may grant:

```text
realModuleQualificationQualified = true
moduleQualified = true
nc09ProductionAuthorizationAuthorized = true
```

It must retain:

```text
productionExecutionAuthorized = false
nc10Authorized = false
```

## Required evidence domains

1. Exact binding to the qualified NC-08 synthetic reference receipt.
2. Exact production-intended source, tree, version and build identity.
3. Signed immutable artifact and verified provenance.
4. Complete dependency lock, SBOM and approved dependency custody.
5. Versioned request/response schemas, explicit migrations and compatibility evidence.
6. Independent reproducible builds and complete reference regression.
7. Security, hostile-input, supply-chain and resource-bound evidence.
8. Real identified technical, security and owner release approvals.
9. Versioned installation, runbook, rollback and recovery evidence.
10. Enforced expiry, revocation and byte-change requalification.

## Explicit exclusions

NC-08R does not authorize production execution, a production environment, a production run, real-asset assessment, code compliance, fitness for service, remaining strength, failure pressure, automatic acceptance or autonomous disposition.

## Unit-test fixtures

The repository tests use non-authoritative hypothetical records to verify evaluator logic. Those records are software test fixtures only. They are not release evidence and must never be cited as a real qualification receipt.

## Current disposition

```text
NC08R_GATE_IMPLEMENTED_NOT_A_REAL_QUALIFICATION_RECEIPT
moduleQualified remains false in authoritative repository receipts
```
