# LAFEA-NC NC-06 — Code-Assessment Package Contract

NC-06 is the separately governed application and code-assessment package gate above NC-05. It qualifies only a reusable, traceable assessment package. It does not qualify any asset, defect, fitness-for-service disposition, remaining strength, failure pressure, or production execution.

## Pinned scope

Every assessment basis must explicitly identify the approved standard or owner procedure, edition, addenda, jurisdiction, clause set, applicability statement, unit profile, source hash, and owner approval. Licensed source text is never redistributed by the package.

The package requires a qualified NC-05 plastic-denting receipt with an explicit qualified-cell set. All assessment inputs must map to governed source receipts in canonical SI units through a deterministic conversion ledger. Inferred, unmapped, output-fitted, or out-of-domain inputs are prohibited.

## Qualification evidence

Each registered basis requires evidence for:

- immutable NC-05 receipt binding;
- assessment-basis and clause custody;
- applicability and exclusions;
- input-variable and unit mapping;
- geometry, material, and pressure mapping;
- clause-equation reproduction;
- domain-limit rejection;
- uncertainty and rounding sensitivity;
- at least three independent reference cases; and
- independent technical review with complete report traceability.

Acceptance is fail-closed. Unresolved applicability questions, domain-limit excursions, unmapped inputs, missing report sections, beneficial uncertainty treatment, failed rejection tests, or insufficient independent review block package qualification.

## Authority boundary

`nc06ContractQualified` may become true through deterministic contract CI. `codeAssessmentPackageQualified` requires all registered-basis evidence. Even a qualified package keeps `codeAssessmentQualified`, `fitnessForServiceQualified`, `remainingStrengthQualified`, and `productionExecutionAuthorized` false because those are case-specific authorities requiring a separately reviewed assessment receipt.

NC-06 does not authorize automatic compliance statements, damage or fracture conclusions, fatigue assessment, failure-pressure prediction, merge, or production execution.
