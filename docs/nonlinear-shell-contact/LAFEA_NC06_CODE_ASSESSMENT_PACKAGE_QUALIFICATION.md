# LAFEA-NC NC-06 Owner-Procedure Assessment Package Qualification

NC-06 qualifies reusable package custody and deterministic traceability above the exact NC-05 plastic-denting receipt. It does not qualify an asset, external-code compliance, fitness-for-service, remaining strength, failure pressure, collapse, damage, fracture, fatigue, or production execution.

## Transparent assessment basis

The package uses internal owner procedure `OP-LAFEA-LOCAL-DENT-PACKAGE-001`, edition 1/addenda 0. Its five transparent clauses calculate only dimensionless dent, residual-dent, pressure-elastic, governing-index, uncertainty, and final-rounding ledger values. No licensed standard text is required or redistributed.

The approval mode is repository-owner exact-head merge. Technical independence is supplied by a separate oracle implementation with a different conversion and equation ordering. Case-specific independent human review remains mandatory and outside NC-06 authority.

## Registered applicability

- exact qualified NC-05 cell only: D/t = 40, L/D = 2, pressure-elastic ratio 9.523809523809524e-4, imposed depth/D = 0.04;
- measured or separately qualified source inputs only;
- explicit SI-derived unit conversion ledger for m/MPa, mm/MPa, and in/ksi reference profiles;
- no extrapolation, inference, output fitting, unresolved applicability, or case disposition.

## Required evidence

1. exact NC-05 receipt and qualified-cell binding;
2. owner-procedure source, clause, applicability, and approval-mode custody;
3. explicit applicability and exclusions;
4. input and unit mapping;
5. geometry, material, and pressure mapping;
6. independent equation reproduction;
7. eight fail-closed domain-rejection cases;
8. non-beneficial uncertainty and final-output-only rounding;
9. three independent unit-profile reference reproductions;
10. complete report traceability and package-only disposition.

## Local design replay

The candidate source set replays byte-identically and returns `NC06_PACKAGE_QUALIFIED` with zero blockers. Local hashes are:

- package: `sha256:9cabfec9b8130d6cc228a344669f15b8641fadd7c852fbe661ffc2d5fb5b8f01`
- basis: `sha256:38b03b61c41f251081911ebaaca9240d8403c11d81ad1d3f42d2546ce2b4097e`
- implementation: `sha256:30f22c56c44a4deb25c5f2b0c6f19c68009f129ba4a743b1c6628099f46be604`
- run: `sha256:73459c38fc23b831cc99e94f4dfe30b7aa392de2dacb3cf24d34afe509908651`
- report: `sha256:2c6e7297c9e02d64dc723f1568b0f1d62ddd21dfde821f859c5f94301a5b9c30`

These local results are not merge authority. Only the exact-head GitHub artifact may authorize NC-07.

## Authority boundary

A qualified receipt may set `codeAssessmentPackageQualified=true` and `nc07Authorized=true`. External-code compliance, case assessment, FFS, remaining strength, failure pressure, collapse, damage, fracture, fatigue, module, production, automatic acceptance, and autonomous disposition remain false.
