# Parallel Agent Prompt — Enrichment UI Phase 0 Inventory and Fixtures

1. Can you confirm you will modify only UI inventory, benchmark fixtures, and qualification evidence—not enrichment contracts, publication logic, consumers, solvers, or Project Data authority?
2. Can you confirm your branch will start from current `main`, remain independent of PR #390 and the Phase 1 core-contract PR, and avoid cherry-picking either branch unless explicitly instructed?
3. Can you confirm you will run every required local check, report exact commands and outputs, and make no release-qualified, engineering-approved, or solver-authorized claim?

## Assignment

Execute the non-critical, parallel **UI Phase 0** work for the bulk Engineering
Enrichment Preflight Workbench. Do not implement the virtualized UI yet. Freeze
current behavior and prepare representative fixtures and executable checks so UI
Phase 1 can proceed without changing the core contract critical path.

## Core documents

Read these exact review documents before editing:

- [Phased upgrade concept](https://github.com/reallaksh19/Advanced_Analysis/blob/d22050f6538a72549810c861aa01452fec6e2c2f/docs/enrichment-upgrade-concept-report.md)
- [Preflight UI concept](https://github.com/reallaksh19/Advanced_Analysis/blob/d22050f6538a72549810c861aa01452fec6e2c2f/docs/enrichment-preflight-ui-concept.md)
- [Common enriched properties consumption concept](https://github.com/reallaksh19/Advanced_Analysis/blob/d22050f6538a72549810c861aa01452fec6e2c2f/docs/common-enriched-properties-consumption-concept.md)
- [Detailed authority adoption plan](https://github.com/reallaksh19/Advanced_Analysis/blob/d22050f6538a72549810c861aa01452fec6e2c2f/docs/enrichment-authority-adoption-plan.md)
- [Concept review PR #390](https://github.com/reallaksh19/Advanced_Analysis/pull/390)

Inspect at minimum:

- `src/workspace/lfea-preflight-ui.js`
- `src/workspace/master-data-controller.js`
- `src/workspace/project-data/`
- existing benchmark/check-script conventions under `scripts/`

## Deliverables

1. A current-preflight interaction inventory classifying each behavior as
   `RETAIN`, `REPLACE`, `RELOCATE`, or `RETIRE`.
2. A state-mutation map identifying DOM-only state, localStorage state,
   Project Data state, model state, and event-driven topology effects.
3. Deterministic small, medium, and large **synthetic** UI fixtures containing
   no proprietary project data. Include duplicate line keys, missing masters,
   ambiguous containment candidates, stale hashes, blocked fields, and large
   line/component counts.
4. A read-only benchmark/check script that measures fixture generation,
   indexing assumptions, and current render-all risk without changing runtime
   engineering behavior.
5. An evidence report with exact local commands and results.
6. A draft UI Phase 1 acceptance checklist. Do not implement UI Phase 1.

## Required pass tests

Add and run changed-scope checks that prove:

- fixtures are deterministic across repeated runs;
- duplicate identities remain duplicates and are never overwritten in a `Map`;
- no fixture injects demonstration data into production runtime;
- no test or fixture mutates Project Data, the shared model, or source files;
- no topology autofix event is emitted by enrichment fixture generation;
- large fixtures are generated without constructing production DOM rows;
- existing relevant checks continue to pass;
- all new scripts exit non-zero on assertion failure.

Recommended commands should include your new aggregate check plus:

```bash
npm run syntax:strict
npm run check:imports
npm run check:master-data-containment
```

Run broader checks only when your changed scope requires them. Record any
infrastructure failure separately from code failure.

## Anti-drift requirements

The parallel PR must fail if it introduces any of the following:

- line-list or piping-class resolver logic;
- `default-zero`, `config-default`, generic density, standard-wall, or other
  enrichment fallback;
- production `localStorage` engineering overrides;
- first-found containment resolution;
- demo data injected when no model is loaded;
- solver, LFEA authority, empirical-load, stagedJson export, or Project Data
  publication changes;
- imports from the Phase 1 common-enriched-properties core into current UI;
- geometry or topology mutation;
- a release-qualified claim.

Pin expected fixture manifests and critical file boundaries in an anti-drift
check. Prefer structural assertions over fragile full-file hashes, except where
a frozen fixture artifact intentionally requires an exact digest.

## Engineering practice

- Use pure deterministic fixture builders with caller-supplied seeds and sizes.
- Use closed schemas and stable IDs.
- Keep generated fixtures out of production bundles.
- Separate data generation, measurement, assertions, and report formatting.
- Avoid timing thresholds as sole correctness gates; record timings as evidence.
- Use `node:assert/strict` and stable machine-readable failure codes where useful.
- Do not swallow errors or convert blockers into warnings.
- Keep the PR independently reviewable and limited to UI Phase 0.

## PR handoff

Open a draft PR titled:

```text
test(enrichment-ui): inventory preflight and add bulk fixtures
```

In the PR body include scope, explicit non-goals, files changed, exact test
commands/results, fixture sizes, anti-drift coverage, known limitations, and a
statement that the PR creates no engineering approval or production authority.
