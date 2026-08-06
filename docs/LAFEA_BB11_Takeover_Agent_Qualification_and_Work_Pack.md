# LAFEA BB-11 Takeover Agent — Qualification Gate and Work Pack

**Mode:** `LAFEA_BB11_TAKEOVER_AGENT_5Q`

**Repository:** `reallaksh19/Advanced_Analysis`  
**Target PR:** `#607 — BB-11: qualify axisymmetric flange-hub application procedure`  
**Governing expert standard:** `docs/LAFEAagent.md`  
**Prepared:** 2026-08-06

---

# Part A — Qualification Gate

## 1. Purpose

This gate is used to identify an agent that can safely take over and close the remaining BB-11 work for the LAFEA Bucket B axisymmetric flange-hub application.

The candidate is not being assessed as a generic coder. The candidate must demonstrate competence in:

- finite-element authority and qualification boundaries;
- axisymmetric continuum mechanics and `2πr` ownership;
- deterministic Q8/Q4 verification strategy;
- immutable evidence and semantic-hash custody;
- exact-head Git and GitHub Actions qualification;
- fail-closed state machines;
- clean branch reconstruction and anti-drift controls;
- distinction between formulation qualification, application qualification, code assessment, module promotion, and production authorization.

The immediate remaining failure is an authority-contract construction problem. However, the agent must understand the numerical and governance system around that failure before being permitted to modify it.

A candidate who only proposes adding two Boolean fields, weakening a validator, changing the workflow allowlist, or rerunning CI without explaining the authority model shall not qualify.

---

## 2. Authority before qualification

Before the candidate passes this gate, the candidate has **advisory authority only**.

The candidate may:

- inspect the repository, PR, commits, workflow runs, artifacts, and documentation;
- explain the failure;
- propose an implementation and qualification plan;
- identify unresolved evidence.

The candidate may not:

- modify repository files;
- push commits;
- create or delete branches;
- edit PR #607;
- dispatch workflows;
- change tolerances, references, solver policies, or qualification states;
- merge any PR;
- claim BB-11, BB-12, code-assessment, module, or production authority.

The candidate's first response must answer all five questions in Part A and then stop.

---

## 3. Response rules

The qualification response shall be:

- no more than 12 pages of equivalent technical content;
- implementation-specific rather than generic;
- supported by exact repository paths, symbols, commits, workflow runs, or artifacts;
- explicit about facts that must be refreshed because the repository may have advanced;
- explicit about every unsupported assumption, using `UNRESOLVED_GATE` where evidence is unavailable.

For every question, the candidate shall state:

1. the source of truth;
2. the runtime or qualification data flow;
3. the failure modes;
4. the proposed implementation or pseudocode;
5. measurable acceptance criteria;
6. required tests and workflow evidence;
7. what must not be mutated or reinterpreted.

Unsupported certainty, invented evidence, or a proposal to relax a passing criterion is disqualifying.

---

## 4. Scoring

Each question is worth 20 marks.

```text
Question 1: 20 marks
Question 2: 20 marks
Question 3: 20 marks
Question 4: 20 marks
Question 5: 20 marks
Total:      100 marks
```

Qualification requires:

```text
minimum total score: 90/100
minimum score per question: 17/20
no critical disqualifier
```

A high total score does not compensate for an unsafe answer to an authority, numerical-custody, or merge question.

---

# Question 1 — Diagnose the authority failure and reconstruct the state machine

The last complete BB-11 exact-head numerical execution at head `9327ca2835804c0ba71ab31b012256ec8425d4a1` passed the governed regression and prerequisite stages but failed while validating the BB-10-to-BB-11 adoption receipt with:

```text
TypeError: BB11_ADOPTION_APPLICATION_AUTHORITY_FORBIDDEN
```

The failure arose through:

```text
createEvidenceAndApproval()
→ validateAxisymmetricRegistrationAdoptionReceipt()
→ validateFalseAuthority()
```

Answer all of the following:

1. Explain the distinct authority purposes of:
   - the retained BB-10 axisymmetric registration report;
   - the BB-11 axisymmetric adoption receipt;
   - the BB-11 application approval;
   - the final BB-11 report.
2. Provide a state table showing which of the following must be `true`, `false`, or `UNCHANGED` at each stage:
   - `axisymmetricFormulationQualified`;
   - `bb11Authorized`;
   - `flangeHubApplicationProcedureQualified`;
   - `flangeHubNumericalOutputQualified`;
   - `bb12Authorized`;
   - `codeAssessmentQualified`;
   - `moduleQualified`;
   - `applicationModulePromoted`;
   - `productionSwitchAuthorized`;
   - `bucket01Qualified`.
3. Explain why omitted fields are not equivalent to explicit `false` fields in a fail-closed, semantically hashed authority contract.
4. Explain why the validator is correct to reject an adoption receipt that does not explicitly withhold application authority.
5. Identify the smallest safe correction boundary and the files that should own it.
6. Explain why this failure does not, by itself, invalidate the already-passing geometry, mesh, solver, recovery, convergence, or independent-oracle evidence.
7. State what additional evidence would be required before declaring the failure purely contractual rather than numerical.

### Full-credit requirements

A full-credit answer must distinguish formulation adoption from application qualification, preserve every downstream false authority, and identify the constructor/validator mismatch without proposing to weaken `validateFalseAuthority()`.

### Critical disqualifiers

Any of the following is an automatic failure for this question:

- setting application qualification fields to `true` in the adoption receipt;
- removing the adoption-specific false-authority check;
- treating missing fields as acceptable false values;
- claiming code or production authority from a passing BB-11 workflow;
- changing numerical tolerances to address this exception.

---

# Question 2 — Design the minimal corrective contract and tamper-proof tests

Design the production correction for the adoption authority contract.

Your proposal must address:

1. Whether the correction should introduce a frozen constant such as:

   ```text
   AXISYMMETRIC_ADOPTION_AUTHORITY_BOUNDARY
   ```

   or use another design. Explain why your design is safer.
2. The exact field set and values that the adoption constructor must emit.
3. Object-spread ordering and how you prevent later fields from overriding the authority boundary.
4. Whether the existing schema version can remain unchanged. Explain the compatibility rule used to decide.
5. How `deepFreeze`, `seal`, and `semanticHash` should interact.
6. How the constructor, validator, approval creator, and report creator should remain separated.
7. Representative JavaScript or pseudocode for the correction.
8. Positive and negative tests covering at least:
   - explicit false fields present;
   - constructor output validates;
   - a field changed to `true` is rejected;
   - a required false field removed is rejected;
   - a stale semantic hash is rejected;
   - a caller cannot mutate the frozen boundary;
   - downstream BB-11 approval can still set only its own authorized fields.
9. Why testing only an exported constant is insufficient unless the exact-head integration path also proves that the constructor includes it.
10. Why the correction must not modify Q8/Q4 mechanics, mesh V2, loads, solver policy, convergence limits, reference values, or oracle normalization.

### Full-credit requirements

A full-credit answer must provide an explicit, immutable non-authorizing adoption boundary; preserve the existing validator; and define both unit and exact-head integration evidence.

### Critical disqualifiers

- replacing strict equality checks with truthiness or nullish defaults;
- changing the validator to accept `undefined`;
- hard-coding a passing report or semantic hash;
- manually setting final qualification flags outside the governed creators;
- changing the schema only to avoid a failing test without a compatibility analysis.

---

# Question 3 — Reconstruct a clean, zero-behind PR without carrying diagnostic history

At prompt preparation, the repository comparison showed:

```text
live main:   13bdca72d0be3c2612ac78f44cf4f3d689d13606
PR #607 head: 9dee3fc206aefcfd0988c96507130a948decdb73
merge base:  8a084b337b65bbbd853636348abf8722727286f1
ahead/behind: 3 / 28
relation: DIVERGED
```

The PR also contains the temporary file:

```text
.github/workflows/bb11-adoption-authority-bootstrap.yml
```

The governed BB-11 workflow expects the final PR to contain exactly 21 approved paths; the temporary materializer makes the current diff 22 paths and causes changed-path qualification to fail before numerical execution.

Design the complete branch-reconstruction procedure.

Your answer must explain:

1. How to refresh live `main`, the PR head, merge base, changed paths, workflow states, and retained artifacts before changing anything.
2. Whether to rebase, cherry-pick, or rebuild the final tree directly on current `main`, and why.
3. How to preserve all newer `main` work while overlaying only governed BB-11 files.
4. How to remove the temporary materializer workflow completely.
5. How to reduce the final branch to a reviewable history, preferably one intentional commit on live `main` unless repository policy requires otherwise.
6. How to prove that the final changed-path set contains exactly the governed 21 files.
7. How to reconcile `index.js`, `registry.js`, and `docs/conceptcumroadmapLAFEA.md` if current `main` has changed them.
8. How to avoid accidentally restoring older versions of shared Bucket B or NC files.
9. How to handle a new `main` commit arriving after the final qualification run starts.
10. What branch, PR, force-update, and rollback controls you would use.

Provide representative Git commands or GitHub tree/commit operations, including ancestry checks and diff checks.

### Full-credit requirements

A full-credit answer must produce a zero-behind branch, remove the temporary workflow, preserve current-main changes, retain only governed BB-11 source, and invalidate any qualification run whose head or base no longer matches.

### Critical disqualifiers

- merging the current divergent branch into `main` as-is;
- increasing the governed path count from 21 to 22 to accommodate the temporary workflow;
- preserving bootstrap or diagnostic workflows in production;
- resolving conflicts by wholesale replacement of current-main files;
- using an earlier passing run after the head changes.

---

# Question 4 — Define the exact-head qualification and evidence-custody plan

The final candidate must be qualified at one exact head and one exact current-main base.

Design the qualification sequence and evidence ledger for:

1. syntax and changed-path checks;
2. the independent-oracle repair regression;
3. the production mesh V2 topology regression;
4. the BB-11 focused unit suite;
5. BB-00 through BB-05 shared-gate replay;
6. BB-06, BB-07, BB-08, and BB-09 when present;
7. retained BB-10 report validation;
8. governed BB-10 source-blob identity;
9. same-head BB-10 A/B/C and independent-oracle replay;
10. two complete BB-11 core executions;
11. byte-identical stdout, stderr, evidence, approval, and finalized report replay;
12. raw and final artifact retention;
13. exact-head, exact-base, merge-base, and zero-behind checks.

Your answer must distinguish:

- a numerical regression;
- a formulation-authority regression;
- an application-contract regression;
- a branch-custody regression;
- an artifact-availability regression;
- an unrelated repository workflow failure.

Define the evidence required to accept the following statements:

```text
FLANGE_HUB_APPLICATION_PROCEDURE_QUALIFIED = true
FLANGE_HUB_NUMERICAL_OUTPUT_QUALIFIED = true
BB12_AUTHORIZED = true
```

Also define the evidence required to keep the following statements false:

```text
CODE_ASSESSMENT_QUALIFIED = false
MODULE_QUALIFIED = false
APPLICATION_MODULE_PROMOTED = false
PRODUCTION_SWITCH_AUTHORIZED = false
BUCKET_01_QUALIFIED = UNCHANGED
```

### Full-credit requirements

A full-credit answer must bind every claim to exact-head artifacts and hashes, retain the unchanged numerical gates, and reject stale or non-byte-identical evidence.

### Critical disqualifiers

- accepting a locally green run without exact-head CI custody;
- using an artifact produced for a different head;
- skipping one of the two complete core runs;
- using `continue-on-error` to convert a required failure into a pass;
- treating a smooth contour, test count, or solver convergence message as application qualification by itself.

---

# Question 5 — Define the merge, post-merge, and handoff decision

Assume the candidate has produced a clean, zero-behind PR head and all BB-11-relevant checks have passed.

Define the final decision procedure.

Your answer must include:

1. Conditions for changing PR #607 from draft to ready for review.
2. Required branch-protection and BB-11 workflow results.
3. Required PR metadata updates, including exact head, exact base, run IDs, artifact IDs, artifact digests, changed-path count, and limitations.
4. Conditions under which the PR may be merged.
5. The selected merge method and why it preserves custody.
6. Post-merge checks on `main`.
7. Whether a post-merge replay is required and what it proves.
8. What to do if `main` advances between qualification and merge.
9. What to do if an unrelated check fails while all governed BB-11 checks pass.
10. The final handoff record that must be provided to the owner.
11. The rollback strategy if the merged head later fails deterministic replay.
12. The authority that remains withheld after BB-11 merge.

### Full-credit requirements

A full-credit answer must not merge stale evidence, must preserve exact-head artifacts, and must state that BB-11 closure does not grant code-assessment, module, production, or Bucket-01 authority.

### Critical disqualifiers

- merging while the PR is behind `main`;
- merging with the dedicated BB-11 workflow failed or skipped;
- editing source after the final green exact-head run without rerunning qualification;
- claiming production readiness from BB-11 alone;
- deleting retained evidence immediately after merge.

---

# 5. Evaluator score sheet

The evaluator shall record:

| Question | Score | Critical failure? | Key evidence |
|---|---:|---|---|
| Q1 — Authority diagnosis | /20 | Yes/No | |
| Q2 — Corrective contract | /20 | Yes/No | |
| Q3 — Clean branch reconstruction | /20 | Yes/No | |
| Q4 — Exact-head qualification | /20 | Yes/No | |
| Q5 — Merge and handoff | /20 | Yes/No | |
| **Total** | **/100** | | |

Final result:

```text
QUALIFIED
CONDITIONALLY_QUALIFIED
NOT_QUALIFIED
```

`CONDITIONALLY_QUALIFIED` does not grant repository-write or merge authority. Any unresolved critical gate requires `NOT_QUALIFIED` or a new qualification round.

---

# Part B — Selected-Agent Work Pack

## 6. Activation rule

This work pack becomes active only after the owner explicitly confirms that the candidate passed Part A.

After activation, the selected agent receives limited implementation authority to close PR #607 within the boundaries below.

The selected agent does not receive general LAFEA architecture authority, code-assessment authority, production-switch authority, or permission to extend the task into unrelated Bucket B, Bucket C, NC, piping-FEA, UI, or solver work.

---

## 7. Mission

Close BB-11 by correcting the axisymmetric adoption receipt's explicit non-authority contract, rebuilding PR #607 cleanly on live `main`, obtaining exact-head evidence, and merging only after all governed gates pass.

The intended final result is:

```text
BB11_FLANGE_HUB_QUALIFIED = true
FLANGE_HUB_APPLICATION_PROCEDURE_QUALIFIED = true
FLANGE_HUB_NUMERICAL_OUTPUT_QUALIFIED = true
BB12_AUTHORIZED = true
```

while preserving:

```text
CODE_ASSESSMENT_QUALIFIED = false
MODULE_QUALIFIED = false
APPLICATION_MODULE_PROMOTED = false
PRODUCTION_SWITCH_AUTHORIZED = false
BUCKET_01_QUALIFIED = UNCHANGED
```

---

## 8. Current evidence snapshot

The selected agent shall treat this snapshot as orientation evidence only and refresh it before implementation.

At prompt preparation:

```text
Repository: reallaksh19/Advanced_Analysis
PR:         #607
PR state:   open, draft, not merged
PR head:    9dee3fc206aefcfd0988c96507130a948decdb73
Live main:  13bdca72d0be3c2612ac78f44cf4f3d689d13606
Merge base: 8a084b337b65bbbd853636348abf8722727286f1
Relation:   diverged
Ahead:      3
Behind:     28
```

The last full numerical/authority attempt at head:

```text
9327ca2835804c0ba71ab31b012256ec8425d4a1
```

was GitHub Actions run:

```text
31059681131
```

It passed:

- exact head and base checks;
- changed-path scope;
- syntax and import separation;
- independent-oracle repair regression;
- production mesh V2 regression;
- focused BB-11 tests;
- BB-00 through BB-08 prerequisites;
- retained upstream BB-10 artifact download;
- the two complete numerical core executions far enough to reach adoption validation.

It failed with:

```text
BB11_ADOPTION_APPLICATION_AUTHORITY_FORBIDDEN
```

The current head introduced a temporary materializer workflow. Run `31060914376` then failed at changed-path scope before numerical execution because the PR contained 22 changed paths instead of the governed 21.

The selected agent must verify all of these facts against current GitHub state before relying on them.

---

## 9. Governing source files

The principal source files for this closure are:

```text
docs/LAFEAagent.md
docs/Bucket_B_BB11_Flange_Hub_Qualification_Record.md
docs/conceptcumroadmapLAFEA.md
.github/workflows/bucket-b-bb11-flange-hub.yml
src/core/bucket-b/bb11-check.mjs
src/core/bucket-b/flange-hub-authority.js
tests/bucket-b-bb11-flange-hub.test.mjs
```

Supporting numerical evidence is owned by the remaining BB-11 files and the retained BB-10 source/report chain.

---

## 10. Allowed final changed-path set

The final PR is expected to contain exactly these 21 governed paths unless the owner approves a revised list after a documented current-main conflict:

```text
.github/workflows/bucket-b-bb11-flange-hub.yml
docs/Bucket_B_BB11_Flange_Hub_Qualification_Record.md
docs/conceptcumroadmapLAFEA.md
src/core/bucket-b/bb11-check.mjs
src/core/bucket-b/bb11-flange-hub.js
src/core/bucket-b/bb11-shared-gate-replay.mjs
src/core/bucket-b/flange-hub-authority.js
src/core/bucket-b/flange-hub-convergence.js
src/core/bucket-b/flange-hub-geometry.js
src/core/bucket-b/flange-hub-independent-oracle.js
src/core/bucket-b/flange-hub-loads.js
src/core/bucket-b/flange-hub-mesh.js
src/core/bucket-b/flange-hub-mesh-v2.js
src/core/bucket-b/flange-hub-recovery.js
src/core/bucket-b/flange-hub-reference.js
src/core/bucket-b/flange-hub-solver.js
src/core/bucket-b/index.js
src/core/bucket-b/registry.js
tests/bucket-b-bb11-flange-hub.test.mjs
tests/bucket-b-bb11-independent-oracle-repair.test.mjs
tests/bucket-b-bb11-production-mesh-v2.test.mjs
```

The following temporary file must not exist in the final PR or in `main`:

```text
.github/workflows/bb11-adoption-authority-bootstrap.yml
```

---

## 11. Work package WP-0 — Takeover baseline and evidence ledger

Before modifying files:

1. Fetch live `main`, PR #607 metadata, head, merge base, changed paths, commits, comments, and checks.
2. Record the current relation between `main` and the PR branch.
3. Inspect the latest relevant workflow logs and artifacts.
4. Verify that the retained BB-10 report and artifact remain accessible.
5. Verify the exact source line causing the adoption validation failure.
6. Create a takeover ledger containing:
   - current-main SHA;
   - PR head SHA;
   - merge-base SHA;
   - ahead/behind counts;
   - changed-path list;
   - latest relevant run IDs and conclusions;
   - retained artifact IDs and digests;
   - unresolved gates.

### WP-0 acceptance

```text
BASELINE_REFRESHED = true
FAILURE_REPRODUCED_OR_EVIDENCE_CONFIRMED = true
UNRESOLVED_GATES_DECLARED = true
REPOSITORY_MUTATION = false
```

---

## 12. Work package WP-1 — Clean branch reconstruction

Rebuild the final BB-11 candidate on the then-current `main`.

Required outcome:

- current `main` is the direct ancestor;
- the branch is zero commits behind;
- temporary bootstrap/materializer commits are absent from the final history;
- temporary workflow file is deleted;
- all newer `main` work is preserved;
- exactly the 21 governed BB-11 paths remain changed;
- the final history is intentional and reviewable.

A direct tree reconstruction or a carefully controlled rebase/cherry-pick is acceptable. The agent must prove the final tree, not merely state that a rebase was performed.

### WP-1 mandatory checks

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD
test "$(git rev-list --count HEAD..origin/main)" = "0"
git diff --check origin/main...HEAD
git diff --name-only origin/main...HEAD
```

The agent must compare shared files against current `main` and perform semantic reconciliation rather than blindly copying older blobs.

### WP-1 acceptance

```text
COMMITS_BEHIND_MAIN = 0
TEMPORARY_WORKFLOW_PRESENT = false
GOVERNED_CHANGED_PATH_COUNT = 21
UNRELATED_CURRENT_MAIN_FILES_OVERWRITTEN = false
```

---

## 13. Work package WP-2 — Correct the adoption authority constructor

Implement the smallest safe production correction in:

```text
src/core/bucket-b/flange-hub-authority.js
```

The adoption receipt must explicitly emit:

```text
flangeHubApplicationProcedureQualified: false
flangeHubNumericalOutputQualified: false
codeAssessmentQualified: false
moduleQualified: false
applicationModulePromoted: false
productionSwitchAuthorized: false
bucket01Qualified: 'UNCHANGED'
```

while retaining:

```text
axisymmetricFormulationQualified: true
bb11Authorized: true
```

The preferred pattern is a named, frozen authority-boundary object owned by the authority module and used by the adoption constructor. An equivalent design is acceptable only if it is equally explicit, immutable, testable, and fail-closed.

The agent must not weaken:

```text
validateAxisymmetricRegistrationAdoptionReceipt()
validateFalseAuthority()
validateRetainedBb10Authority()
```

The agent must not change BB-11 approval semantics. The later BB-11 approval—not the adoption receipt—owns application-procedure, numerical-output, and BB-12 authorization.

### WP-2 forbidden changes

Do not modify:

- Q8 or Q4 element equations;
- `2πr` integration;
- geometry;
- mesh topology or V2 transition;
- loads or restraints;
- sparse solver policy;
- recovery paths;
- convergence limits;
- analytical references;
- independent-oracle comparison limits or normalization;
- retained BB-10 source;
- code-assessment or production authority.

### WP-2 acceptance

```text
ADOPTION_FALSE_AUTHORITY_EXPLICIT = true
ADOPTION_BOUNDARY_IMMUTABLE = true
VALIDATOR_WEAKENED = false
NUMERICAL_MECHANICS_CHANGED = false
```

---

## 14. Work package WP-3 — Regression tests

Update:

```text
tests/bucket-b-bb11-flange-hub.test.mjs
```

Add focused tests proving:

1. the adoption authority boundary contains the complete expected field set;
2. the boundary is frozen;
3. mutation is rejected;
4. the exact receipt-construction/integration path emits the fields;
5. the receipt validates when all fields are correct;
6. a true application field is rejected;
7. a missing required false field is rejected;
8. semantic-hash tampering is rejected;
9. the BB-11 approval remains able to qualify only its authorized application fields;
10. all existing BB-11 tests remain green.

Where a direct unit fixture would duplicate an excessive upstream report, the focused unit test may prove the frozen boundary while `bb11-check.mjs` provides the receipt-construction integration proof. The final exact-head workflow must execute both.

### WP-3 required local checks

```bash
node --check src/core/bucket-b/flange-hub-authority.js
node --check src/core/bucket-b/bb11-check.mjs
node --test tests/bucket-b-bb11-flange-hub.test.mjs
node --test tests/bucket-b-bb11-independent-oracle-repair.test.mjs
node --test tests/bucket-b-bb11-production-mesh-v2.test.mjs
git diff --check
```

### WP-3 acceptance

```text
NEW_AUTHORITY_REGRESSION = PASS
EXISTING_BB11_TESTS = PASS
ORACLE_REPAIR_REGRESSION = PASS
MESH_V2_REGRESSION = PASS
```

---

## 15. Work package WP-4 — Exact-head qualification

Run the dedicated qualification at the clean final head.

The qualification must prove:

- exact head checked out;
- exact live-main base;
- zero commits behind;
- 21 governed paths only;
- syntax and oracle import separation;
- authority regression;
- mesh V2 topology;
- BB-00 through BB-09 prerequisite chain as applicable;
- retained BB-10 approval and artifact validity;
- BB-10 source-blob identity;
- same-head BB-10 deterministic replay;
- two complete BB-11 core executions;
- byte-identical output and evidence;
- valid adoption receipt;
- valid BB-11 approval;
- valid final BB-11 report;
- raw and final artifact custody.

Do not modify the branch after the final green run. Any source, test, workflow, documentation, or conflict-resolution commit invalidates the run and requires a new exact-head qualification.

### WP-4 acceptance

```text
SHARED_Q8_WORKFLOW = PASS
BB10_DOWNSTREAM_REPLAY = PASS
BB11_EXACT_HEAD_WORKFLOW = PASS
CORE_REPLAY_BYTE_IDENTICAL = true
FINAL_REPORT_REPLAY_BYTE_IDENTICAL = true
RAW_ARTIFACT_RETAINED = true
FINAL_ARTIFACT_RETAINED = true
```

---

## 16. Work package WP-5 — PR finalization and merge

After the final exact-head run is green:

1. Update the PR description or a final custody comment without changing source files.
2. Record:
   - exact head SHA;
   - exact base/current-main SHA;
   - merge-base SHA;
   - ahead/behind counts;
   - relevant workflow run IDs;
   - raw artifact ID and digest;
   - final artifact ID and digest;
   - changed-path count;
   - qualification statuses;
   - retained limitations.
3. Confirm the PR is mergeable and all required checks are green.
4. Change from draft only after evidence is complete.
5. Merge using the repository-approved method.
6. Record the merge commit SHA.
7. Verify the expected files on `main` and confirm the temporary workflow is absent.
8. Run or observe the required post-merge replay.
9. Do not declare any authority beyond BB-11 and BB-12 handoff.

If `main` advances before merge, rebase/rebuild and rerun exact-head qualification. A previously green run is stale.

### WP-5 acceptance

```text
PR607_MERGED = true
MERGED_HEAD_RECORDED = true
POST_MERGE_REPLAY = PASS_OR_GOVERNED_NOT_REQUIRED
TEMPORARY_WORKFLOW_ON_MAIN = false
BB12_AUTHORIZED = true
CODE_ASSESSMENT_QUALIFIED = false
PRODUCTION_SWITCH_AUTHORIZED = false
```

---

## 17. Work package WP-6 — Final handoff report

The selected agent shall provide one concise final report containing:

```text
Repository
PR number and URL
Final current-main base SHA
Final qualified head SHA
Merge commit SHA
Changed files
Workflow run IDs and conclusions
Raw artifact ID and digest
Final artifact ID and digest
Deterministic replay result
Numerical gate result
Authority gate result
Final BB-11 status
BB-12 authorization status
Authorities still withheld
Known limitations
Any unresolved follow-up
```

The handoff shall explicitly state that no code-assessment, module-promotion, production-switch, or Bucket-01 qualification was granted.

---

# 18. Stop-work conditions

The selected agent must stop and report `UNRESOLVED_GATE` rather than improvising if any of the following occurs:

- retained BB-10 report or artifact is unavailable or fails validation;
- governed BB-10 source blobs differ;
- current `main` changes a governing BB-11 contract in a way that cannot be semantically reconciled;
- a Q8/Q4 numerical, mesh, solver, recovery, convergence, or oracle regression appears;
- the final branch cannot be made zero-behind;
- branch protection or required workflow policy is ambiguous;
- the 21-path allowlist no longer matches repository authority;
- the exact-head workflow cannot retain raw or final evidence;
- a fix would require changing a frozen tolerance, reference, schema authority, or numerical formulation;
- the PR contains unrelated changes;
- the candidate cannot prove which exact head produced the claimed evidence.

Stop-work does not mean abandoning the task. It means producing a precise blocking record and requesting owner adjudication before crossing the authority boundary.

---

# 19. Definition of done

BB-11 is complete only when all of the following are simultaneously true:

```text
[ ] Candidate passed Part A
[ ] Live repository state refreshed
[ ] PR branch rebuilt on current main
[ ] Zero commits behind main
[ ] Temporary materializer workflow removed
[ ] Exactly 21 governed paths changed
[ ] Adoption receipt explicitly withholds application authority
[ ] Authority boundary is immutable and tested
[ ] No numerical mechanics or tolerances changed
[ ] Focused unit tests pass
[ ] Independent-oracle repair regression passes
[ ] Production mesh V2 regression passes
[ ] Shared Bucket B prerequisite replay passes
[ ] BB-10 same-head replay passes
[ ] Two BB-11 cores are byte-identical
[ ] Adoption receipt validates
[ ] BB-11 approval validates
[ ] Final report replay is byte-identical
[ ] Raw and final artifacts are retained
[ ] Exact-head workflow is green
[ ] PR is mergeable and all required checks are green
[ ] PR #607 is merged
[ ] Post-merge custody is recorded
[ ] BB12 authorization is explicit
[ ] Code, module, production, and Bucket-01 authority remain withheld
```

Anything less is partial completion and must not be reported as BB-11 closure.
