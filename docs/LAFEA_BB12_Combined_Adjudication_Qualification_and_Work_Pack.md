# LAFEA BB-12 Combined Adjudication — Qualification Gate and Work Pack

**Mode:** `LAFEA_BB12_COMBINED_ADJUDICATION`
**Repository:** `reallaksh19/Advanced_Analysis`
**Tracking issue:** `#753 — BB-12: combined Bucket B adjudication and programme closure`
**Governing architecture:** `docs/LAFEAagent.md` and `docs/conceptcumroadmapLAFEA.md`
**Prepared:** 2026-08-06

## 1. Purpose

BB-12 is the final combined evidence adjudication for the controlled Bucket B programme. It reconciles the retained and same-head evidence chain from BB-00 through BB-11, the six Bucket B registry entries, the roadmap authority boundary, and exact-head workflow custody.

BB-12 does not introduce or alter finite-element mechanics. It does not qualify a design code, qualify a production module, promote an application template, switch a production route, or change Bucket-01 authority.

## 2. Qualification gate

A takeover agent is qualified only when it can answer all five questions below without weakening an existing validator, changing a numerical tolerance, substituting stale evidence, or conflating programme evidence completion with production authority.

1. **Authority state machine:** distinguish package evidence completion, combined adjudication, code assessment, module qualification, application promotion, production switching, and Bucket-01 authority.
2. **Evidence intake:** define how BB-00–BB-09 same-head reports, retained BB-10/BB-11 reports, and same-head BB-10/BB-11 core replays are validated and bound by raw and semantic hashes.
3. **Registry and roadmap reconciliation:** prove that the exact six registered modules and their formulation/element profiles agree with the adjudicated package chain, without mutating registry states.
4. **Exact-head custody:** define the base/current-main/merge-base/zero-behind gates, the seven-path allowlist, two byte-identical BB-12 executions, retained artifact checks, and raw/final artifact publication.
5. **Merge and rollback:** define stale-head invalidation, merge conditions, post-merge verification, evidence retention, and rollback if deterministic replay later fails.

Scoring is 20 marks per question. Qualification requires at least 90/100, at least 17/20 per question, and no critical disqualifier.

Critical disqualifiers include:

- granting code, module, application-promotion, production-switch, or Bucket-01 authority;
- using a retained report without checking its artifact digest and semantic/raw report hashes;
- accepting a same-head core run that is not byte-identical across two executions;
- changing numerical mechanics or tolerances to obtain a pass;
- expanding the changed-path boundary to accommodate diagnostic material;
- merging a candidate that is behind live `main` or whose successful run belongs to another head.

## 3. Activation record

The owner instructed the selected agent to continue and finish BB-12 after the same agent completed BB-11 exact-head qualification and merge. That instruction activates this work pack within the limits below. Repository write and merge authority is limited to the governed BB-12 candidate and remains contingent on all exact-head gates passing.

## 4. Mission

Produce one reviewable BB-12 candidate directly parented to live `main`; validate the complete controlled Bucket B evidence chain; publish raw and finalized immutable evidence; and merge only while the candidate remains zero-behind and the dedicated BB-12 workflow is green at the exact candidate head.

The only permitted positive claims are:

```text
BUCKET_B_PROGRAMME_EVIDENCE_COMPLETE = true
BB12_COMBINED_ADJUDICATION_QUALIFIED = true
BUCKET_B_PROGRAMME_COMPLETION_RECORDED = true
```

The following must remain explicit:

```text
CODE_ASSESSMENT_QUALIFIED = false
MODULE_QUALIFIED = false
APPLICATION_MODULE_PROMOTED = false
PRODUCTION_SWITCH_AUTHORIZED = false
BUCKET_01_QUALIFIED = UNCHANGED
```

## 5. Governed changed-path boundary

The final candidate shall change exactly these seven paths:

```text
.github/workflows/bucket-b-bb12-combined-adjudication.yml
docs/Bucket_B_BB12_Combined_Adjudication_Record.md
docs/LAFEA_BB12_Combined_Adjudication_Qualification_and_Work_Pack.md
src/core/bucket-b/bb12-check.mjs
src/core/bucket-b/bb12-combined-adjudication.js
src/core/bucket-b/index.js
tests/bucket-b-bb12-combined-adjudication.test.mjs
```

No BB-00–BB-11 numerical source, registry implementation, roadmap text, tolerance, solver policy, mesh profile, load profile, recovery profile, reference value, or independent oracle may be modified by BB-12.

## 6. Source-of-truth hierarchy

1. Executable source and strict validators at the exact candidate head.
2. Exact-head workflow reports and retained artifact metadata/digests.
3. BB-00–BB-09 same-head reports and BB-10/BB-11 same-head core replay evidence.
4. Retained BB-10 and BB-11 final reports and their merge ancestry.
5. `MODULE_REGISTRY` and the governing roadmap.
6. Issue, PR, and narrative records, which cannot override executable evidence.

## 7. Required intake ledger

BB-12 shall require all package IDs:

```text
BB00-BB05, BB06, BB07, BB08, BB09, BB10, BB11
```

It shall require all registered application module IDs:

```text
C2D-LUG-PINHOLE
C2D-CLAMP-EAR
C2D-BRACKET-GUSSET
C2D-PIPE-PAD-SECTION
C2D-NOZZLE-REPAD-SECTION
C2D-FLANGE-HUB
```

Each package receipt must retain schema, semantic hash, raw SHA-256, source head, custody kind, replay hash where applicable, and `PASS` status. Each module receipt must retain formulation profile, element profile, source package, source report hash, application-procedure qualification, and numerical-output qualification.

BB-10 and BB-11 require both retained-artifact custody and byte-identical same-head core replay. BB-11’s changed-path-specific finalizer must not be weakened or reused to authorize BB-12 paths.

## 8. Immutable authority contracts

`bb12-combined-adjudication.js` owns three separate contracts:

- evidence: complete intake and reconciliation, but no BB-12 approval yet;
- approval: combined adjudication and programme-completion record;
- final report: exact-head/base custody, raw artifact identity, replay identity, and limitations.

Every contract is canonicalized, semantically hashed, deeply frozen, and fail-closed. Omitted false authority fields are invalid. A recomputed semantic hash cannot legitimize a forbidden authority value because validators independently enforce the authority boundary.

## 9. Exact-head qualification sequence

The dedicated workflow shall:

1. resolve and check out one exact head;
2. fetch live `main`, require the merge base and declared base to equal live `main`, and require zero commits behind;
3. require BB-10 and BB-11 merge ancestry;
4. enforce exactly seven governed changed paths and `git diff --check`;
5. run syntax checks and the BB-12 authority/tamper test suite;
6. replay BB-00 through BB-09 at the exact head;
7. download retained BB-10 and BB-11 artifacts by artifact ID and validate their digests;
8. validate the retained reports, including the fixed BB-11 raw and semantic report hashes;
9. execute BB-10 core twice and BB-11 core twice at the exact head, requiring byte-identical stdout and stderr;
10. execute the BB-12 adjudicator twice, requiring byte-identical output directories, stdout, and stderr;
11. upload prerequisite and raw evidence artifacts;
12. create the finalized BB-12 report twice using the raw artifact ID/digest and compare both reports and stdout byte-for-byte;
13. assert every positive and withheld authority field explicitly;
14. upload the finalized report artifact and publish the custody summary.

Required failures must not use `continue-on-error` to create a pass.

## 10. Acceptance criteria

The candidate qualifies only when:

- base, merge base, and current `main` are the same SHA;
- the candidate is zero commits behind `main`;
- exactly seven governed paths changed;
- every BB-00–BB-09 report validates at the exact candidate head;
- retained BB-10 and BB-11 artifacts and reports validate;
- BB-10 and BB-11 core replays are byte-identical;
- the six-module registry snapshot matches the required formulation and element profiles;
- roadmap assertions preserve BB-12 necessity and deny automatic production/code authority;
- two complete BB-12 runs and two finalized report runs are byte-identical;
- raw and final artifacts are published with IDs and `sha256:` digests;
- the finalized authority disposition matches Section 4 exactly.

## 11. Merge controls

The PR may be marked ready only after the dedicated BB-12 exact-head workflow succeeds. It may be merged only when:

- the PR head is the successful workflow head;
- the PR base is still the workflow’s current-main base;
- the PR is not behind `main`;
- changed paths remain exactly seven;
- no source edit occurred after qualification;
- required branch-protection checks pass.

Use an expected-head guarded squash merge so the one intentional candidate commit becomes one auditable merge commit. If `main` advances, reconstruct the same governed tree directly on new `main`, rerun all qualification stages, and discard the stale run for merge purposes.

## 12. Post-merge, rollback, and handoff

After merge:

- verify the merge commit is reachable from `main`;
- verify the seven governed files have the qualified content;
- retain run ID, exact head, exact base, merge SHA, artifact IDs/digests, report semantic hash, and report raw SHA-256;
- close Issue #753 only after recording that custody;
- keep all withheld authority statements explicit.

If a later deterministic replay fails, block any downstream reliance on the BB-12 completion claim, preserve the failed evidence, open a corrective issue, and revert the BB-12 merge or supersede it through a newly qualified exact-head PR. Do not silently edit retained reports or reinterpret a stale artifact.
