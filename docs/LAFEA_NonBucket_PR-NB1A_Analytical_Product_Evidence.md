# LAFEA Non-Bucket PR-NB1-A — Analytical Product Evidence

## Scope

This batch starts the governed LAFEA.1/LAFEA.2 product-vertical closure without changing either retained numerical formulation.

It adds:

- a `lafea-load-foundation/v2` resultant-preserving finite-foundation contract;
- six explicit finite-foundation methods: point, line, rectangular patch, circular patch, weld line and rigid spider;
- exact force/moment reconstruction at the declared reference point;
- a force-only minimum-norm rigid-spider distribution with rank-deficiency containment;
- LAFEA.1 handoff evidence for LAFEA.3, LAFEA.4 and LAFEA.5;
- LAFEA.2 applicability decisions with `PASS`, `ESCALATE` and `BLOCKED` states;
- LAFEA.2 governing-resultant handoff evidence for LAFEA.3, LAFEA.4 and LAFEA.5;
- lifecycle-bound `FOUNDATION_DISTRIBUTION` and `SCREENING_ASSESSMENT` artifacts;
- product-adapter ownership through the registry-v2 composition root;
- governed A1/A2 product benchmark identities and bounded exact-head checks.

## Retained numerical authority

The existing LAFEA.1 calculation remains load transfer and elastic pressure baseline only. The finite-foundation compiler consumes caller-authored stations and measures. It preserves the declared force and moment resultants; it does not calculate local attachment stress, stiffness distribution, contact, lift-off, friction, shell response, continuum response, weld stress or code compliance.

The existing LAFEA.2 calculation remains nominal far-field pipe-section screening only. The new applicability layer classifies the retained result without changing section properties, resultants, stresses, envelopes, formula traces, expected values or tolerances.

## Finite-foundation methods

For `POINT`, `LINE`, `RECTANGULAR_PATCH`, `CIRCULAR_PATCH` and `WELD_LINE`, force is distributed by the caller-authored positive station measures. The residual couple required to close the declared reference-point moment is distributed by the same normalized measures. This is a resultant-preserving load foundation, not a stiffness or stress model.

`RIGID_SPIDER` uses a force-only minimum-norm equilibrium solution. Coincident, collinear or numerically rank-deficient station systems fail closed.

Every accepted result retains:

- exact LAFEA.1 SHA-256 ancestry;
- declared and reconstructed force/moment resultants;
- station identities, positions, measures and source references;
- residuals and declared qualification tolerances;
- explicit non-claims.

## Screening applicability

Each retained screening case/location pair requires an explicit applicability record.

- clear far-field evidence returns `PASS`;
- attachment, opening, weld, local-load or other-discontinuity evidence returns `ESCALATE`;
- unsupported transverse shear returns `ESCALATE`;
- unresolved transverse shear or missing applicability evidence returns `BLOCKED`.

`PASS` means screening applicability only. It is not code acceptance.

## Handoff authority

Handoffs retain the exact governing resultant, location, geometry basis, target-stage identity and target-source SHA-256 identity. They do not generate a target model and do not copy nominal screening stress as finite-element or code stress.

Target-specific guided materialization and the complete LAFEA.1/LAFEA.2 guided input panels remain subsequent PR-NB1 work. This batch establishes the deterministic evidence contracts those consumers must use.

## Lifecycle and release boundary

Core calculation producers no longer synthesize an applicability assessment from numerical envelopes alone. Product evidence is created explicitly after current `RESULT_EVIDENCE` and may then be registered as:

- `FOUNDATION_DISTRIBUTION` for LAFEA.1;
- `SCREENING_ASSESSMENT` for LAFEA.2.

No convergence, code-assessment, report, release or LAFEA.6 authority is created. Every composition remains bound to `RELEASE_NOT_QUALIFIED`.
