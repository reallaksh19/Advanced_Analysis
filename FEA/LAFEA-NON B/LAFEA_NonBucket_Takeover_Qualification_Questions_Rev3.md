# LAFEA Non-Bucket Takeover Qualification — Rev 3

Repository: `reallaksh19/Advanced_Analysis`  
Current main: `f4445b32442b2b563a30427db285130e86e309cc`  
Active NB-T4B PR: `#242`  
Active head: `07f0fec5cf81c6d76f668efb270493c49a3262ae`  
Merge base: `070321a1a71459e3a679749e5e90ad8237c798ad`  
Branch relation to current main: `11 ahead / 20 behind`

## Rules

- Five questions, 20 marks each.
- Recommended time: 4 hours.
- Pass: total >=90/100, every question >=16/20, no automatic-fail condition.
- No repository writes, PR updates, issue comments or workflow dispatch during qualification.
- Unsupported facts must be `UNRESOLVED_GATE`.
- Show exact contracts, parent graphs, state transitions, failure ordering and dispositions.

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
