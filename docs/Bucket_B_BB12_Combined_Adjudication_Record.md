# Bucket B BB-12 Combined Adjudication Record

**Record type:** `BB12_COMBINED_ADJUDICATION_QUALIFICATION_RECORD`
**Tracking issue:** `#753`
**Executable contract:** `src/core/bucket-b/bb12-combined-adjudication.js`
**Exact-head adjudicator:** `src/core/bucket-b/bb12-check.mjs`
**Qualification workflow:** `.github/workflows/bucket-b-bb12-combined-adjudication.yml`

## 1. Decision represented by this package

BB-12 records whether the controlled Bucket B evidence programme is complete and mutually consistent across BB-00 through BB-11. It is an evidence-adjudication decision, not a new finite-element formulation, application calculation, design-code assessment, production module, or runtime switch.

A passing finalized report may state:

```text
BUCKET_B_PROGRAMME_EVIDENCE_COMPLETE = true
BB12_COMBINED_ADJUDICATION_QUALIFIED = true
BUCKET_B_PROGRAMME_COMPLETION_RECORDED = true
```

It must also state:

```text
CODE_ASSESSMENT_QUALIFIED = false
MODULE_QUALIFIED = false
APPLICATION_MODULE_PROMOTED = false
PRODUCTION_SWITCH_AUTHORIZED = false
BUCKET_01_QUALIFIED = UNCHANGED
```

## 2. Governed intake

The adjudicator requires:

- BB-00 through BB-05 same-head regression report;
- BB-06 lug/clamp report;
- BB-07 bracket/gusset report;
- BB-08 pipe/pad report;
- BB-09 nozzle/repad report;
- retained BB-10 registration report and byte-identical same-head BB-10 core replay;
- retained BB-11 flange-hub report and byte-identical same-head BB-11 core replay;
- retained BB-10 and BB-11 artifact metadata and merge ancestry;
- the exact six-module `MODULE_REGISTRY` snapshot;
- assertions from `docs/conceptcumroadmapLAFEA.md` preserving the authority boundary;
- exact-head, exact-base, changed-path, replay, and artifact custody evidence.

## 3. Retained predecessor custody

The executable workflow fixes and validates these predecessor anchors:

### BB-10

```text
artifact ID:     8901921021
artifact digest: sha256:317731aefd35b87bce2b7221704a1e34753aba97bb4513310001b407346b74b7
merge SHA:       1e7cbb13a9da66bad2d27da3fc31d7edebad5ed4
```

### BB-11

```text
final artifact ID:          8954712183
final artifact digest:      sha256:7dc5619ab867bcb7a977a8169c814a158bad2fe63f92999e7985a78f6d555ed1
report-bound raw artifact ID: 8954711905
report-bound raw digest:    sha256:6d11e67172b7f09303ee52d007e5f2de11d929fc72b954b0b080f1ec316ed248
report semantic hash: fnv1a64:876c92b5c24ee1c6
report raw SHA-256:   sha256:8c934ab946d212f8f9b5415f40f185c5eb7bf5f467a4211caf31a5d91c42e1fe
merge SHA:            07ce017eb7113517cc032771f7717f88c0a93d4c
```

The workflow downloads artifacts by ID, checks their API-reported digest, locates the governed report, and validates report contracts. The retained BB-11 report raw and semantic hashes are checked explicitly. Its report-bound raw artifact is also downloaded, and the retained BB-11 core stdout is compared byte-for-byte with the same-head BB-11 core replay.

## 4. Registry reconciliation

The final report may adjudicate only these registered modules:

| Module | Formulation | Element | Source package |
|---|---|---|---|
| `C2D-LUG-PINHOLE` | `PLANE_STRESS` | `Q8_FULL_3X3` | BB-06 |
| `C2D-CLAMP-EAR` | `PLANE_STRESS` | `Q8_FULL_3X3` | BB-06 |
| `C2D-BRACKET-GUSSET` | `PLANE_STRESS` | `Q8_FULL_3X3` | BB-07 |
| `C2D-PIPE-PAD-SECTION` | `PLANE_STRAIN` | `Q8_FULL_3X3` | BB-08 |
| `C2D-NOZZLE-REPAD-SECTION` | `PLANE_STRAIN` | `Q8_FULL_3X3` | BB-09 |
| `C2D-FLANGE-HUB` | `AXISYMMETRIC` | `AXI_Q8_FULL_3X3` | BB-11 |

BB-12 validates this set and profile identity but does not advance any registry record to `MODULE_QUALIFIED`.

## 5. Deterministic execution record

The workflow creates:

- two BB-10 same-head core outputs;
- two BB-11 same-head core outputs;
- two complete BB-12 evidence/approval/custody directories;
- two finalized BB-12 reports;
- a prerequisite artifact;
- a raw evidence artifact;
- a final report artifact.

Every paired output must be byte-identical. The finalized report binds the raw artifact ID and digest, the exact head/base, the replay manifest hashes, stdout/stderr hashes, check ledger, limitations, and authority disposition.

## 6. Changed-path custody

The qualification workflow permits exactly seven BB-12 paths, listed in the companion work pack. No numerical source or tolerance is part of this package.

## 7. Final custody fields

The successful workflow and PR handoff must record externally, without editing the already-qualified source tree:

```text
exact candidate head SHA
exact current-main base SHA
workflow run ID and attempt
prerequisite artifact ID and digest
raw artifact ID and digest
final artifact ID and digest
final report semantic hash
final report raw SHA-256
merge commit SHA
post-merge main SHA
```

The workflow-produced JSON report and GitHub artifact metadata are authoritative for these dynamic values. Adding them to this source file after qualification would change the exact head and invalidate the run.

## 8. Limitations

- Evidence adjudication only.
- No code assessment.
- No module qualification.
- No application-template promotion.
- No production-route authorization.
- Bucket-01 unchanged.
- No changes to elements, meshes, loads, solvers, recovery, convergence, references, or tolerances.
