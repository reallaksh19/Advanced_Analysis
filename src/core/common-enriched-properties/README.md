# Common Enriched Properties Core

Phase 1 provides closed, immutable, deterministic contracts for:

- normalized engineering-master snapshots;
- field-level enrichment outcomes;
- line/component target records;
- unapproved enrichment candidates;
- externally authorized immutable baselines;
- consumer-readiness records.

Phase 2 adds an exact-only target inventory over `shared-piping-model/v1`:

- every source component receives a stable component target;
- components sharing one exact model `identity.lineId` are retained in a duplicate-safe line bucket;
- line keys are canonicalized only by trim and uppercase;
- missing model line identity remains `BLOCKED_MISSING`;
- branch-name tokens, regex, containment, fuzzy matching, and service inference are not used;
- stale shared-model hashes are rejected before inventory creation.

Phase 3 adds exact-only line-list resolution over an immutable `LINE_LIST` snapshot:

- each normalized source row is indexed by canonical exact `values.lineKey`;
- zero matching rows produce `BLOCKED_MISSING` fields;
- one matching row resolves type-valid fields as `RESOLVED_EXACT`;
- multiple matching rows produce `BLOCKED_AMBIGUOUS` and never select the first row;
- missing and type-conflicting source fields remain explicit blockers;
- every output binds the inventory, snapshot, field-binding set, target records, summary, and semantic hash.

Phase 4 adds exact-only piping-class resolution over an immutable `PIPING_CLASS` snapshot:

- class and bore are mandatory exact key inputs from the line-list resolution;
- schedule is an explicit optional key dimension, never an inferred default;
- source rows are indexed into duplicate-preserving class/bore[/schedule] buckets;
- zero matching rows remain `BLOCKED_MISSING`;
- multiple exact rows remain `BLOCKED_AMBIGUOUS`, even when values agree;
- only one exact row may resolve dimensions, wall, schedule-bound data, or material codes;
- missing and type-conflicting source fields remain explicit blockers.

Phase 5 adds exact-only material-register resolution over an immutable `MATERIAL_REGISTER` snapshot:

- the material code must be an approved `RESOLVED_EXACT` field from piping-class resolution;
- source rows are indexed into duplicate-preserving exact material-code buckets;
- zero matching rows remain `BLOCKED_MISSING`;
- multiple exact rows remain `BLOCKED_AMBIGUOUS`, even when candidate properties agree;
- only one exact source row may resolve material description, density, elastic data, or other bound fields;
- missing and type-conflicting material properties remain explicit blockers;
- generic steel density, first-row selection, aliases, fuzzy matching, and fallback are prohibited.

Phase 6 adds exact-only fluid-register resolution over an immutable `FLUID_REGISTER` snapshot:

- the fluid code must be an approved `RESOLVED_EXACT` field from line-list resolution;
- source rows are indexed into duplicate-preserving exact fluid-code buckets;
- zero matching rows remain `BLOCKED_MISSING`;
- multiple exact rows remain `BLOCKED_AMBIGUOUS`, even when candidate properties agree;
- only one exact source row may resolve density, viscosity, description, or other bound fields;
- missing and type-conflicting fluid properties remain explicit blockers;
- water-density defaults, first-row selection, aliases, fuzzy matching, and fallback are prohibited.

Phase 7 adds exact-only insulation-register resolution over an immutable `INSULATION_REGISTER` snapshot:

- the insulation code must be an approved `RESOLVED_EXACT` field from line-list resolution;
- source rows are indexed into duplicate-preserving exact insulation-code buckets;
- zero matching rows remain `BLOCKED_MISSING`;
- multiple exact rows remain `BLOCKED_AMBIGUOUS`, even when candidate properties agree;
- only one exact source row may resolve insulation material, density, thickness, or other bound fields;
- missing and type-conflicting insulation properties remain explicit blockers;
- default thickness, service inference, first-row selection, aliases, fuzzy matching, and fallback are prohibited.

This module does **not** perform weight resolution; engineering fallback; engineering approval; Project Data persistence;
empirical calculations; LFEA binding; stagedJson mutation; topology validation;
or solver work.

## Invariants

1. Every record uses exact keys and a versioned schema.
2. Semantic hashes are computed over canonical JSON projections.
3. Constructors require caller-supplied identities and UTC timestamps; no hidden
   clock, random ID, or storage dependency exists.
4. Blocked fields remain `null`, unapproved, and zero-confidence.
5. Deterministic derivations require policy identity and hash.
6. An approved heuristic proposal requires a review-event binding.
7. Candidates always remain `UNAPPROVED_CANDIDATE`.
8. Publication requires a separate `APPROVE` decision bound to the exact
   candidate semantic hash.
9. Published baselines are deeply frozen and never modified in place.
10. Consumer readiness is separate from baseline publication.
11. Exact target inventory never derives a line identity from names or paths.
12. One line key maps to an ordered array of component targets, never one overwritten row.
13. Exact line-list matching preserves duplicate source rows as ambiguity.
14. Line-list resolution never uses regex, containment, fuzzy matching, service consensus, or fallback.
15. Piping-class key inputs must be `RESOLVED_EXACT`; derived or proposed keys are blocked.
16. Omitting schedule broadens the exact key and may create ambiguity; no schedule is selected by default.
17. Piping-class resolution never uses standard-wall, first-row, containment, or material fallback.
18. Material-register key inputs must be approved `RESOLVED_EXACT` material codes.
19. Exact material-code buckets preserve every duplicate row and never select the first record.
20. Material resolution never applies generic density, steel defaults, aliases, fuzzy matching, or fallback.
21. Fluid-register key inputs must be approved `RESOLVED_EXACT` fluid codes.
22. Exact fluid-code buckets preserve every duplicate row and never select the first record.
23. Fluid resolution never applies water-density, viscosity, alias, fuzzy-match, or other fallback values.
24. Insulation-register key inputs must be approved `RESOLVED_EXACT` insulation codes.
25. Exact insulation-code buckets preserve every duplicate row and never select the first record.
26. Insulation resolution never applies default thickness, service inference, aliases, fuzzy matching, or fallback.

## Qualification

```bash
node scripts/run-common-enriched-properties-checks.mjs
node scripts/run-common-enriched-target-inventory-checks.mjs
node scripts/run-common-enriched-exact-line-list-checks.mjs
node scripts/run-common-enriched-exact-piping-class-checks.mjs
node scripts/run-common-enriched-exact-material-register-checks.mjs
node scripts/run-common-enriched-exact-fluid-register-checks.mjs
node scripts/run-common-enriched-exact-insulation-register-checks.mjs
```
