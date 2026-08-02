# MODE: LAFEA_NONBUCKET_TAKEOVER_AGENT_REV3

## 1. Executive summary

You are qualifying to take over the original LAFEA Non-Bucket workstream in `reallaksh19/Advanced_Analysis`. Current main is `f4445b32442b2b563a30427db285130e86e309cc`. NB-T0 through NB-T4A are merged. NB-T4B is open as draft PR #242 at `07f0fec5cf81c6d76f668efb270493c49a3262ae`, with merge base `070321a1a71459e3a679749e5e90ad8237c798ad` and branch relation `11 ahead / 20 behind` current main.

Implementation authority is withheld. Your first response must answer the five qualification questions and stop.

## 2. Current-state snapshot

- NB-T0: dedicated Non-Bucket exact-head boundary merged.
- NB-T1: stage-correct analytical and FEA lifecycle profiles merged.
- NB-T2: SHA-256 source authority and current-core producer contracts merged.
- NB-T3: registry v2 and one composition root per stage merged.
- NB-T4A: analysis-mesh evidence intake merged and exact-head certified.
- NB-T4B: implementation substantially complete, draft, unmerged and not current-head certified.
- Final NB-T4B jobs produced no executable steps or logs; classify as `PRE_STEP_INFRASTRUCTURE_FAILURE`.
- Current main contains later Bucket B1/B2 contract work. Those changes do not promote Non-Bucket authority but require freshness synchronization.
- LAFEA.4 remains five-DOF CST+DKT; no MITC production authority.
- LAFEA.6 remains unsupported.
- `CONVERGENCE_READY`, `CODE_READY` and `RELEASE_QUALIFIED` remain false.

## 3. Scope and authority boundary

### In scope

- PR #242 NB-T4B contracts, producer, checks, documentation and bounded exports;
- exact source/model/geometry/mesh/execution/recovery/display lineage;
- exact-head and post-merge certification;
- independent review and merge disposition;
- later Non-Bucket vertical planning.

### Out of scope without explicit user authority

- Bucket/application-template B1/B2 implementation;
- LFEA piping;
- numerical-core, solver or production-mesher changes;
- registry-v2 or lifecycle-profile redesign;
- SCL, structural stress, convergence, code or report implementation;
- shell-formulation change or MITC claim;
- LAFEA.6;
- tolerance, benchmark expected-value or release-state change.

## 4. Governed requirements and source hierarchy

Authority order:

1. live exact repository source and retained executable evidence;
2. current `main`, merge base and PR head identities;
3. merged NB-T0 through NB-T4A contracts;
4. the current concept note;
5. PR and issue prose.

When source, execution evidence and prose conflict, return `UNRESOLVED_GATE`.

Non-negotiable requirements:

- no core/solver import or call in NB-T4B;
- NB-T4A-qualified mesh evidence is mandatory for LAFEA.3-.5;
- analytical LAFEA.1/.2 are rejected by NB-T4B;
- no cross-element averaging, smoothing or shell nodal extrapolation;
- display values are `PRODUCER_PROJECTED_DISPLAY_ONLY`;
- no visual tessellation as engineering mesh;
- no convergence, SCL, code, report or release evidence;
- no MITC production claim;
- LAFEA.6 remains blocked;
- zero-step/no-log workflow is infrastructure evidence only;
- prior-head PASS is not current-head or post-merge qualification.

## 5. Qualification questions and scoring

Scoring:

- 20 marks each; total 100;
- pass >=90/100;
- every question >=16/20;
- any automatic-fail condition rejects the candidate.

During qualification, do not write code, update branches, comment on issues, open/modify PRs or dispatch workflows.

## Question 1 — Current-head authority and NB-T4B branch recovery [20]

The NB-T4B branch is ahead of and behind current main, and its final exact-head jobs completed with `steps: null` and no logs.

A. Define the exact read-only audit for current main, merge base, branch head, ahead/behind relation and changed-file ownership.  
B. Distinguish `PRE_STEP_INFRASTRUCTURE_FAILURE`, executable product failure, supporting prior evidence and current-head qualification.  
C. Define the safe synchronization strategy and conflict stop conditions.  
D. State whether the PR may leave draft before exact-head execution.  
E. Define merge eligibility and post-merge current-main evidence.  
F. Provide at least ten branch/certification anti-drift tests.  
G. Give the truthful current disposition.

## Question 2 — Exact execution/recovery/render lineage [20]

Design the full NB-T4B parent graph and contracts.

A. Define required inputs from source, canonical model, analysis geometry, NB-T4A mesh evidence and retained calculation.  
B. Define `EXECUTION`, `RECOVERY` and `LafeaRenderPacket.v2` exact keys.  
C. Define semantic, evidence, display-geometry, render-profile and package hashes.  
D. Define atomic registration and rollback when one record fails.  
E. Define stale invalidation for source, model, geometry, mesh, calculation, field request, units and render profile.  
F. Explain why `RESULT_READY` does not imply convergence, code or release readiness.  
G. Provide at least twelve lineage/tamper tests.

## Question 3 — Stage-specific result authority and display projection [20]

A. Define authoritative display intake for T3, T6/Q8, LAFEA.4 and LAFEA.5.  
B. Explain how an exact integration point or shell surface is selected.  
C. Define why cross-element averaging, shell nodal extrapolation and smoothing are prohibited.  
D. Define element-local tessellation and pick-map identity without turning visual vertices into engineering nodes.  
E. Define unit and quantity checks.  
F. State how projected display values must be labelled and why they cannot feed SCL/code.  
G. Provide an adversarial matrix covering missing element, integration point, surface, load case, units, quantity and retained-result path.

## Question 4 — Lifecycle semantics and stage containment [20]

A. Define the prerequisite state `CALCULATION_ACCEPTED_BY_STAGE_CONTRACT`.  
B. Define when `EXECUTION`, `RECOVERY` and `RESULT_READY` may register.  
C. Define analytical LAFEA.1/.2 behavior and why NB-T4B must reject them.  
D. Define LAFEA.3-.5 behavior and mesh prerequisites.  
E. Define LAFEA.4 CST+DKT authority and the false-MITC rejection.  
F. Define LAFEA.6 blocking.  
G. Distinguish `RESULT_READY`, `CONVERGENCE_READY`, `CODE_READY` and `RELEASE_QUALIFIED`.  
H. Provide at least twelve lifecycle and authority anti-drift tests.

## Question 5 — Adversarial takeover, merge and roadmap decision [20]

Assume the branch is refreshed but:

- one out-of-scope registry file changes during conflict resolution;
- the dedicated test passes locally;
- GitHub jobs again have no steps or logs;
- a reviewer proposes merging because earlier runs passed;
- a display contour averages shared nodes;
- the packet is labelled `CODE_READY`;
- the UI advertises MITC4;
- NB-T6 is started before NB-T4B merge/current-main certification.

A. Identify every violation.  
B. Give the rejection order.  
C. Define the smallest safe recovery sequence.  
D. Define NBR-0 through NBR-4 ownership and exit gates.  
E. State the disposition if all NB-T4B checks pass but the repository gate fails only in an unrelated scope.  
F. State the disposition if PR-head checks pass but post-merge current-main certification is absent.  
G. Give the mandatory work-package report and stop conditions.


## 6. Required architecture corrections

No new architecture is presumed accepted. The takeover must validate and preserve this boundary:

`NB-T4A mesh evidence + accepted calculation -> EXECUTION -> RECOVERY -> sealed LafeaRenderPacket.v2 -> RESULT_READY`

Required properties:

- exact parent identities and canonical SHA-256 records;
- atomic registration and rollback;
- retained stage-result authority per element/integration-point/surface;
- element-local display tessellation;
- exact result paths, source IDs and pick-map entries;
- stale/tamper rejection;
- false readiness states for convergence, code and release.

Any correction that touches numerical cores, stage registry, lifecycle profiles, shell authority, tolerances or release state requires a new user-approved package.

## 7. Initial authorized work packages

After the user confirms qualification:

### NBR-0 — Freshness and ownership freeze

Read-only:

- refetch current main, PR head and merge base;
- compute ahead/behind and changed-file ownership;
- verify the governed seven-file NB-T4B surface;
- classify all conflicts and current workflow evidence;
- return the proposed NBR-1 write set;
- stop for approval.

### NBR-1 — Current-main synchronization

Only after NBR-0 approval:

- synchronize the branch to live main;
- resolve only mechanical conflicts inside the authorized NB-T4B surface;
- preserve all authority and non-claims;
- do not move the PR out of draft;
- return exact new head and diff matrix.

### NBR-2 — Exact-head qualification

Only after NBR-1 acceptance:

- execute the full command ladder;
- retain visible steps, logs and artifacts;
- classify infrastructure and executable failures separately;
- no merge until all required evidence passes.

## 8. Roadmap after initial acceptance

- NBR-3: independent review and merge decision.
- NBR-4: post-merge current-main certification.
- NB-T5: analytical product/release qualification for LAFEA.1/.2.
- NB-T6: production continuum geometry-to-mesh, recovery and convergence.
- NB-T7: shell authority decision and LAFEA.4 vertical.
- NB-T8: LAFEA.5 attachment/trunnion vertical.
- NB-TQ: governed assessment, reporting, full benchmarks and independent release review.

No later package starts automatically.

## 9. Blocker handling

### Pre-step workflow failure

When jobs contain no steps and no logs:

- classify `PRE_STEP_INFRASTRUCTURE_FAILURE`;
- do not diagnose source from absent logs;
- do not represent the package as PASS or FAIL;
- keep PR draft and merge authority withheld;
- rerun only when infrastructure can allocate a job.

### Unrelated repository failure

When bounded Non-Bucket commands pass but the full gate fails only in another owner scope:

- report `NONBUCKET_SCOPE_PASS / REPOSITORY_INTEGRATION_BLOCKED`;
- retain the unrelated failure owner and exact command;
- do not weaken either scope;
- merge requires user acceptance of repository-integration disposition.

### Branch drift

Any main advance invalidates prior freshness. Refresh and re-run exact-head evidence.

## 10. Benchmark and release authority

Minimum qualification families:

- exact lineage reconstruction and tamper rejection;
- T3 no-averaging display;
- T6/Q8 exact integration-point selection;
- LAFEA.4 fixed CST+DKT surface selection;
- LAFEA.5 retained raw-shell path selection;
- stale source/model/geometry/mesh/calculation rejection;
- unit, quantity, load-case, element, integration-point and surface rejection;
- analytical and unsupported-stage rejection;
- sealed packet and pick-map integrity;
- display projection non-authority;
- atomic lifecycle registration/rollback;
- current-head and post-merge certification.

A successful NB-T4B package establishes `RESULT_READY` only. It does not establish convergence, code, report or release qualification.

## 11. Exact command ladder

```bash
npm ci
node scripts/lafea-nb-t4b-recovery-render-check.mjs
npm run check:lafea-nonbucket-stack
npm run check:lafea-core
npm run check:lafea-foundation
npm run check:lafea-meshing
npm run check:lafea-solver
npm run check:lafea-workbench
npm run check:lafea-canvas
npx playwright install chromium --with-deps
node scripts/run-playwright.mjs e2e/lafea-hybrid-workbench.spec.js
npm run syntax:strict
npm run check:imports
npm run build
npm run gate
git diff --check "$PR_BASE_SHA...HEAD"
test -z "$(git status --short)"
```

Record exact exit status, first failure, run/job IDs, artifact IDs and SHA-256 digests. Do not skip commands silently.

## 12. Stop conditions

Return `UNRESOLVED_GATE` when:

- live main, merge base or branch head changes during review;
- changed-file ownership is not exactly bounded;
- synchronization requires numerical, registry, lifecycle, shell or release changes;
- current-head jobs have no steps/logs;
- a prior-head PASS is offered as current evidence;
- NB-T4A mesh evidence is absent, stale or tampered;
- retained result authority is missing;
- display projection is proposed for assessment;
- MITC production authority is claimed;
- LAFEA.6 or NB-T6 is requested early;
- tolerance or expected-value changes are proposed;
- post-merge certification is absent.

## 13. Mandatory work-package report

```text
WORK PACKAGE:
LIVE MAIN SHA:
MERGE BASE SHA:
BRANCH HEAD SHA:
AHEAD / BEHIND:
HEAD STABILITY:
GOVERNING REQUIREMENTS:
FILES ADDED:
FILES MODIFIED:
OUT-OF-SCOPE FILES:
NUMERICAL AUTHORITY:
SHELL AUTHORITY:
MESH AUTHORITY:
RESULT AUTHORITY:
LIFECYCLE IMPACT:
IMPLEMENTED:
DEFERRED:
UNSUPPORTED:
BENCHMARKS:
ANTI-DRIFT TESTS:
EXACT COMMANDS:
WORKFLOW RUNS / JOBS:
ARTIFACTS / SHA-256:
RESULTS:
FIRST FAILURE:
HASH / LINEAGE EVIDENCE:
BROWSER / BUILD EVIDENCE:
LIMITATIONS:
CLEAN TREE:
DISPOSITION:
NEXT AUTHORIZED PACKAGE:
```

Allowed dispositions:

- `ACCEPTED`
- `CONDITIONAL ACCEPTANCE`
- `REJECTED`
- `UNRESOLVED_GATE`

## 14. First-response gate

Return only:

```text
QUESTION 1 RESPONSE
QUESTION 2 RESPONSE
QUESTION 3 RESPONSE
QUESTION 4 RESPONSE
QUESTION 5 RESPONSE
ASSUMPTIONS
UNRESOLVED_GATES
AUTOMATIC_FAIL_CHECK
FINAL_SELF_DISPOSITION
```

Then stop and await the user's qualification decision.
