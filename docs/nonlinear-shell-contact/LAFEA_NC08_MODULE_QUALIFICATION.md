# LAFEA-NC NC-08 — Module Qualification Contract

NC-08 governs qualification of a versioned nonlinear shell-contact assessment software module. It does not authorize production deployment or automatic case acceptance.

## Pinned scope

A module build is immutably bound to a source commit and tree, build artifact, dependency lock, software bill of materials, runtime profile, test manifest, API schemas, migration manifest, release approval, and exact qualified NC-07 case receipt.

The build must be reproducible and deterministic. Identical governed inputs must yield byte-identical receipts. External connectivity, runtime extension loading, caller-controlled authority escalation, partial receipt reconstruction, and floating dependencies are prohibited.

## Required evidence

Ten domains cover upstream receipt binding, API/versioning, deterministic replay, fail-closed authority, input security, receipt-chain reconstruction, reference-case regression, boundary handling, build/SBOM custody, resource bounds, release review, and change control.

A fully evidenced build may set `moduleQualified`. Production execution remains a separate NC-09 authority.

## Exclusions

Automatic case acceptance, fitness for service, remaining strength, production execution, and merge authority remain excluded from NC-08 contract qualification.
