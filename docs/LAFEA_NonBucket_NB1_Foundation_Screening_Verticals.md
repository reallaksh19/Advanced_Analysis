# LAFEA Non-Bucket NB1 — Foundation and Screening Verticals

## Scope

NB1 closes the first two analytical product verticals identified by the PR #21 alignment audit:

- LAFEA.1 finite-footprint force and moment distribution;
- LAFEA.2 governed applicability assessment, escalation and downstream handoff.

The package does not add local attachment stress, finite-element execution, configured code evaluation, lifecycle registration or release qualification.

## LAFEA.1 finite-footprint distribution

The accepted LAFEA.1 transformed load result remains the upstream authority. A footprint request identifies one retained transformed load case and one explicit reference point. Optional pressure thrust terms require all of the following source data:

- pressure;
- effective area;
- unit normal;
- application point;
- source reference.

The compiler supports six declared footprint classes:

1. point;
2. line;
3. rectangular patch;
4. circular patch;
5. weld line;
6. rigid spider.

Each station receives a weighted force and an explicit balancing station couple. The retained station set must reconstruct the declared global force and moment about the retained reference point within the request-owned tolerances. Degenerate line, patch and spider geometry fails closed. The result remains a station force/couple distribution only; it is not a mesh, contact model, weld model or local stress solution.

## LAFEA.2 product applicability and escalation

Every retained screening-case/evaluation-location pair requires explicit evidence for:

- far-field location;
- attachment edge;
- opening;
- weld;
- local load;
- transverse shear;
- configured screening threshold.

The product state is deterministic:

- `PASS` — every required check is present and passes;
- `ESCALATE` — all evidence is resolved but one or more applicability checks fail;
- `BLOCKED` — evidence is missing or unresolved.

Attachment, opening, weld, local-load or transverse-shear applicability failures cannot be overridden by a nominal section stress value. The result is nominal pipe-section screening applicability only. It does not contain a material allowable, code utilization or compliance decision.

## Downstream handoff

LAFEA.1 and LAFEA.2 may create a validated handoff to LAFEA.3, LAFEA.4 or LAFEA.5. A handoff retains:

- exact upstream result hash;
- governing footprint or screening identities;
- force, moment, coordinate system and reference point;
- validated target canonical model and hash;
- exact source-to-target load-case bindings;
- limitations and source reference.

The handoff validates the target source contract but does not execute the target engine, register lifecycle evidence or promote code/release state. Nominal screening stress, utilization and allowable values are explicitly excluded from handoff authority.

## Benchmark coverage

The NB1 exact-head check covers the Appendix A1/A2 product cases:

- A1-FP-POINT, LINE, RECT, CIRC, WELD, RSP and RANK;
- A2-ESC-01 through A2-ESC-04;
- validated LAFEA.3, LAFEA.4 and LAFEA.5 handoffs.

Expected closure is independently reconstructed in the check rather than copied from the production compiler.

## Preserved authority

- Existing LAFEA.1 transformation and pressure calculations are unchanged.
- Existing LAFEA.2 nominal section-stress calculation is unchanged.
- LAFEA.3 and LAFEA.4 numerical formulations are unchanged.
- LAFEA.4 remains the registered legacy thin-shell authority.
- LAFEA.5 remains caller-authored host-shell footprint authority.
- LAFEA.6 remains `ENGINE_NOT_IMPLEMENTED`.
- Lifecycle profiles, lifecycle producers and release-state logic are unchanged.
- Every stage remains `RELEASE_NOT_QUALIFIED`.
