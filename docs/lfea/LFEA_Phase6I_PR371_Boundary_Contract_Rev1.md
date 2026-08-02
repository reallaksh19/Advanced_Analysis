# LFEA Phase 6I / PR #371 Boundary Contract — Rev 1

**Phase 6I frozen candidate:** `617f7c2be0c65196a44bc88b6a2bb5ad3b5f1b54`  
**Immutable execution ref:** `release/lfea-piping-phase6i-617f7c2`  
**External programme:** PR #371 — Load Calculation Enrichment Shadow Contract Foundation

## Decision

LFEA Phase 6I proceeds independently. PR #371 is not a prerequisite and its current outputs are not consumed by the frozen Phase 6I candidate.

The two programmes have a controlled producer–authority–consumer relationship:

```text
PR #371 shadow enrichment
  -> provenance-bound proposals and shadow-impact evidence only
WP-2 Project Authority Index
  -> project approval, applicability and candidate binding
LFEA compiler/solver
  -> consumption of approved candidate-bound authority only
```

## Authority boundary

PR #371 may discover, normalize, match, project and compare candidate values in shadow mode. It must not create or claim:

- approved project engineering data;
- a binding to the current Phase 6I candidate;
- LFEA calculation eligibility;
- baseline selection or result acceptance;
- Phase 6I release evidence;
- a current seal or gate promotion.

WP-2 remains the sole Phase 6I owner of project engineering authority. LFEA production code remains the consumer of that approved authority and does not infer approval from agreement with a shadow result.

## Overlapping attributes

The boundary applies to process parameters, fluid and insulation properties, nominal bore and outside diameter, schedule, pressure rating, nominal wall thickness, corrosion allowance, material properties, component weight and distributed weight.

For the frozen candidate, all such values remain governed by the existing LFEA project-authority chain. No PR #371 proposal may overwrite, backfill or reinterpret them.

## Future adoption

A future PR #371 value can enter LFEA only after all of the following exist:

1. field-level engineering approval;
2. an approved precedence and derivation policy;
3. exact proposal and source identities;
4. a new immutable LFEA candidate;
5. re-execution of every affected qualification and release-evidence stage.

Agreement between two calculations is evidence of numerical comparison only; it is not engineering approval.

## Machine enforcement

The authoritative machine-readable contract is:

`governance/lfea-piping-phase6i-pr371-boundary.json`

The check:

`scripts/lfea-piping-phase6i-pr371-boundary-check.mjs`

fails when governed LFEA or Phase 6I source begins importing the engineering-enrichment package, invoking the empirical route, promoting shadow-authority tokens, or populating the committed blocked release ledger.

## Release disposition

This contract does not promote any gate, close WP-2, modify the frozen candidate, or make PR #371 release-authoritative. The Phase 6I programme remains fail closed until its independent authority and evidence requirements are satisfied.
