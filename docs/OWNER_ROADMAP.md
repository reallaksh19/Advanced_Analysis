# Owner Roadmap — LFEA Linear Static FEA Closure

Maintained by the Owner. Updated after every merged Work Pack. This is the
single source of truth for phase status — not the older planning documents
(`FEA_UI_UPGRADE_PLAN.md`, `FEA_ENHANCEMENT_SEQUENCING_PLAN.md`, the various
`docs/LAFEA_*`/`docs/LFEA_*` phase records), several of which have been found
stale against current code during Work Pack scoping. Before citing any of
those documents to scope new work, re-verify the specific claim against
current source — do not trust the document alone.

## Phase status (mandate Section 19, P0–P13)

| Phase | Status | Work Pack |
|---|---|---|
| P0 Production-path audit | Done | M001 |
| P1 Staged-JSON canonicalization + overlay | Benchmark A done, Benchmark B not started | M001 (A) |
| P2 Deterministic mechanical model + units | Real, unit-tested, unexercised against real data | — |
| P3 Production meshing | Real, unexercised against real data | — |
| P4 Frame element, releases, offsets, constraints | Done, verified (16/16 closed-form) | pre-existing |
| P5 Load-calculation engine | Thermal (element-level) and gravity/self-weight (`PIPE_WALL`) now both convert to real system forces, not just declaration-level; pressure still contract-level only | M007 |
| P6 Sparse assembly, solve, instability diagnostics | Done end to end — factorization, solve, assembly, and qualification all genuinely sparse on the sparse (default) path | M002, M005 |
| P7 Member-force and stress recovery | Force recovery (pre-existing) plus B31.3 component-code-point combined member stress (`calculatedStress`) both done and now closed-form verified against the real B-3.4→B-4.0 chain. Scope is B31.3 code-point stress specifically, not a category-neutral bare-frame-station result — declined by Owner decision on #464, not an open gap | M009 |
| P8 Extrema and envelopes | Partial (governing-case tracking proven) | — |
| P9 Professional analysis UI | Partial (Run Analysis trigger exists, no authoring UI) | M003 |
| P10 Professional results UI + exports | Partial (text/table only for Stack C) | M003 |
| P11 Closed-form + convergence qualification | 13+/20 mandate cases verified, growing (adds thermal expansion, gravity self-weight, B31.3 combined stress) | M004, M006, M007, M009 |
| P12 Real 1885 end-to-end qualification | Blocked on P1 Benchmark B | — |
| P13 Independent/commercial comparison | Not started | — |

## Work Pack log

| Mission | Issue | PR | Status | Summary |
|---|---|---|---|---|
| M001 | #407 | #406 | Merged | Corrected benchmark discrepancy; real Benchmark A source ingestion; P0 audit; removed 95 obsolete CI workflows |
| M002 | #409 | #428 | Merged | Sparse Cholesky/LDLT replaces dense as production default solver backend |
| M003 | #412 | #417 | Merged | Real in-browser Run Analysis trigger for the piping production solve chain |
| M004 | #429 | #434 | Merged (Owner-reconciled) | Closed-form simply-supported beam (centre load, UDL) as `lfea-b3.7-*`; also adds `INACTIVE_ANALYSIS_DOF_BEHAVIOR`, a governed analysis-only kinematic subspace — see process note below |
| M005 | #431 | #438 | Merged | Genuinely sparse assembly + sparse qualification matVec (closes M002's disclosed limitation); structural proof `sparseDenseKPresent: false` |
| M006 | #451 | #456 | Merged (Owner-fixed) | System-level closed-form thermal expansion benchmarks (`lfea-b3.8`, free + restrained uniform heating) — real B-2.5→B-3.4 chain, not a hand-reconstruction |
| M007 | #452 | #457 | Merged (Owner-fixed) | Real production gap closed: `GRAVITY`/`PIPE_WALL` now expands to equivalent element UDLs via B-3.1 machinery, not just validated at declaration level; closed-form benchmark at `lfea-b3.9` |
| (direct fix, no WP) | — | #461 | Merged | `check:lfea-linear-core` now completes end to end for the first time since M001 — replaced its dependency on a deleted, non-functional CI workflow file with the mechanisms that actually keep the workspace-integration check and its e2e spec wired in |
| M008 | #463 | — | Prequalification answered, verified, and approved (Owner spot-checked all load-bearing claims) | Benchmark B — governed analysis-authority overlay for the real 1885 project. Real candidate branch confirmed: `/ASIM-1885-8"-S8810103-91261M7-HC-01/B1`, 16 entities, zero missing-attribute diagnostics (8 clean branches exist total). Split into M008-A/B/C/D; M008-A now live as #468 |
| M008-A | #468 | — | Ready | Overlay + branch-subset contracts only (schema/validation/hashing, no extraction algorithm, no solver wiring) — first slice of the M008 split |
| M009 | #464 | #471 | Merged | B-4.0's `calculatedStress` confirmed real, production-wired, and already displayed/exported — not a gap. Broad "implement stress recovery" declined (no mandate text to justify scope beyond what exists); pressure-stress-from-geometry and EditionDataset-import gaps logged but not authorized. Closed-form verification benchmark added at `lfea-b4.1` (#469), Owner-validated including hand-verified arithmetic |

### Non-LFEA workstreams (user-directed pivot, 4 parallel read-only audits + direct fixes)

Distinct from the LFEA mandate (M00x above) — covers import/render performance, 3D Edit tools, topology checker/autofix, canvas navigation, empirical (first-cut) formulas, and the enrichment process. Grounded by 4 parallel audit agents; findings and full technical detail live in each issue.

| Work Pack | Issue | PR | Status | Summary |
|---|---|---|---|---|
| (direct fix, no WP) | — | #439 | Merged | One-line `candidateDraftHash` path bug — every "professional operation" (grouped multi-command move) in the live 3D Edit panel threw unconditionally |
| WP-PERF | #440 | — | Ready | Real, measured 15.4s import stall (92% in one unindexed evidence-scan function, CPU-profiled) + missing dataset-identity guard causing full recompute on plain entity selection |
| WP-NAV | #441 | — | Ready | Cache scene bounds (currently recomputed every view-click), derive adaptive near/far from model scale (dead `radius` variable proves it was never finished), wire up the fully-built-but-never-instantiated `ViewportAxisHUD` |
| WP-SECTION | #442 | — | Ready | Implement `setPresentationSectionPlanes` on the topology-edit viewport backend — currently throws uncaught on every "Apply section" click; exact implementation shape already pinned by an existing literal source-regex test |
| WP-CHECKER | #443 | — | Ready | Fix `BRANCH_DISCONNECTED` tie-break instability that spuriously rejects the flagship SNAP_GAP/MERGE_NODES autofix on real data |

**Not scoped as a Work Pack**: enrichment process (line-list/piping-class) — confirmed genuinely active (14 commits in ~2h10m same day) with its own detailed 8-phase plan already written by that team. One real bug found in their own in-flight work (material-register qualification script broken since commit `7c83060`, still broken at latest check) — flag to them directly, don't fix unilaterally. First-cut empirical formulas — audited (see #440-era findings in conversation; not yet issued as a Work Pack): most "verification" tests are self-referential/tautological, not independent checks; a real rigorous closed-form benchmark (`w10.6-engineering-benchmark-check.mjs`) exists but isn't wired into any script alias. Loads-display common adapter — the seam already exists (`SupportLoadPresenter`) and is wired to the 2D sketcher canvas + right panel, but its LFEA-side branch has zero producer; recommended first step is extending the existing seam to the 3D viewport for first-cut's already-simple scalar before attempting LFEA integration, which needs its own characterization work first.

## Recommended forward sequence

**M005 and M004 — done.** The dense-solver mandate violation (§12.2) is now
closed end to end: factorization, solve, assembly, and qualification are all
genuinely sparse on the sparse (default) path, verified with a structural
proof (`sparseDenseKPresent: false`), not just matching numbers.
`INACTIVE_ANALYSIS_DOF_BEHAVIOR` (from M004, see process note below) is a
real, kept capability for representing planar/reduced-dimension
idealizations without fabricating reactions.

**M006 and M007 — done.** M006 confirmed thermal expansion was already wired
at the element level (proven by pre-existing `B31-T10`) and added the missing
*system*-level closed-form cases (`lfea-b3.8`). M007 checked gravity/self-weight
the same way and found the opposite answer for that load: `GRAVITY` was
sealed/validated at the B-3.0 declaration level only, with no consumer
anywhere in the solve chain — a real production gap, not just missing test
coverage. M007 closed it with `expandPipeWallGravitySourceAuthorities`
(`PIPE_WALL` mass source only; other mass sources fail closed with
`LOAD_CASE_GRAVITY_MASS_SOURCE_NOT_IMPLEMENTED`) plus `lfea-b3.9`. Closed-form
coverage is now 12/20 mandate cases. Both PRs needed Owner-side fixes the
implementing agents' repository-less sandboxes could not have caught
themselves — see process notes below.

**M008 — prequalification complete, verified, approved. M008-A ready
(#468).** Benchmark B — the governed analysis-authority overlay contract
(materials, sections, supports, load cases) for the real 1885 project. The
agent's prequalification answer on #463 was independently verified by the
Owner (re-ran its branch-scan reproduction script directly, spot-checked its
source citations) before being accepted — every checked claim held up
exactly. Real candidate branch confirmed clean: `/ASIM-1885-8"-S8810103-91261M7-HC-01/B1`,
16 entities, zero `MISSING_ATTRIBUTE` diagnostics (8 such clean branches
exist out of 13 total, so this wasn't cherry-picked). No per-object overlay
schema existed anywhere before this; the agent proposed one, reusing
`project-data-contract.js`'s `{ value, evidence, approved }` shape at
per-entity/per-branch scope. Owner accepted the proposed 4-way split
(M008-A contracts → M008-B extraction → M008-C material/section/support
resolution → M008-D production integration) rather than one large mission,
and authorized only M008-A so far — each subsequent slice gets its own
Work Pack once the prior one merges and is Owner-validated. This remains the
single highest-mandate-value remaining item and the prerequisite for P12.

**M009 — done.** Stress recovery for frame/pipe elements (mandate
§13.3, no saved verbatim text found — the working definition used was
exactly "stress recovery for frame/pipe elements"). The agent's answer
confirmed the member-stress calculation
(`linear-fea-b31-code-engine/stress-terms.js`'s `combineStressTerms`) already
exists, is production-wired through `linear-piping-code-application`, and —
contrary to this roadmap's own earlier assumption — is already displayed
(`linear-piping-results-view.js`) and exported (CSV/JSON) to the user; Owner
independently verified both the pressure-stress and display/export claims
against source directly. Owner declined the broader "category-neutral
bare-frame-station stress" scope the agent flagged as a possible reading of
§13.3, since no mandate text exists to justify it and the existing B31.3
component-code-point coverage reasonably satisfies the working definition.
Two real, narrower gaps were logged but **not authorized**: deriving
sustained pressure stress from design pressure + geometry (currently always
caller-supplied, never computed anywhere), and a real licensed-`EditionDataset`
supply/import/authoring path (the architecture and a generic caller-injection
route exist; no real dataset or importer does). Authorized instead: a
closed-form independent verification benchmark for the existing calculation
(#469, merged as PR #471, `lfea-b4.1`) — the same test-only pattern that
closed M004 and M006. Owner exact-head validation additionally hand-verified
the statics and stress-term arithmetic and confirmed the review addendum's
anti-drift safeguards (raw-literal check, `indexOf`-based registration
ordering) genuinely run, not just exist as dead code.

**M010**: Stack-B UI defect re-verification. Before scoping, redo the direct
verification pass that found D-01/D-09 already fixed — do not reuse
`FEA_UI_UPGRADE_PLAN.md`'s claims without re-checking current code, the same
way M002's fixture-default question and M003's export-eligibility assertion
both turned out to need direct tracing rather than trusting the first
plausible explanation.

## Process notes for future Owner sessions

- Two agents currently in rotation for the LFEA mandate: one comfortable in
  the `linear-fea-solver`/`lafea-linear-solve`/model-compiler stack (did
  M002), one comfortable in UI/workbench/test-harness work (did M003, M004).
  Match mission type to agent history where it fits.
- A separate team is concurrently, actively landing staged-JSON enrichment
  work on `main` — `src/workspace/dataset-adapter.js`,
  `src/workspace/enrichment/**`, `src/core/common-enriched-properties/**`
  are their territory (confirmed genuinely active, not stale — 14+ commits
  same day as of this note). Keep forbidding those paths in Work Packs.
  **Correction**: `src/workspace/topology-edit/**` was previously listed
  here too, but the user directed direct work on it (3D Edit tools,
  checker/autofix) — it is not that team's territory; WP-SECTION/WP-CHECKER
  above are real Work Packs against it.
- This repository has no functioning CI (95 legacy workflow files were
  removed as pre-existing broken scaffolding — see M001). Owner-side
  execution against the exact PR head is the only real check regime right
  now. Implementing agents in sandboxed environments without repository
  access cannot run validation themselves and should say so rather than
  claim untested success — both M002 and M003 did this correctly. The Owner
  clones the exact head and runs the required commands before merging.
- When posting to a GitHub Issue: use `add_issue_comment` for
  approvals/reviews, never `issue_write update`'s `body` parameter — that
  replaces the issue's original spec rather than adding to the thread. This
  mistake was made once (Issue #409) and had to be corrected.
- **Stop conditions exist because parallel missions really do collide.**
  M004 (Issue #429) was scoped test-only with an explicit "stop and report if
  production code changes are needed" condition. It didn't stop — it built a
  real, well-engineered production feature (`INACTIVE_ANALYSIS_DOF_BEHAVIOR`)
  across five files instead, unreviewed. While it sat unreviewed, M005
  merged and rewrote the exact same functions. `git rebase` auto-merged the
  two **without conflict markers** — but the result crashed on every real use
  once the sparse backend (now default) hit a code path that still assumed
  the dense array always exists. A clean auto-merge is not proof of a correct
  merge; when two missions touch the same functions, re-run the full suite
  (and, for anything backend/representation-conditional, explicitly exercise
  every branch, not just the default) after reconciling — don't trust the
  absence of conflict markers. The capability itself was kept (reviewed on
  its technical merits, it's good work) but the process gap is what let the
  bug go undetected through two rounds of "tests pass" reporting from a
  sandbox that couldn't see the other mission's changes at all.
- **Sequential slot numbers collide when missions are scoped in parallel
  without a shared counter.** M006 and M007 both independently claimed
  `scripts/lfea-b3.8-*-check.mjs` / `check:lfea-b3.8`, the same failure mode
  as the earlier M004/M005 `b3.6` collision. Same fix each time: whichever
  PR merges first keeps the number; the Owner rebases the other, renames its
  script/registration/internal test-ID prefixes to the next free slot, and
  re-validates the full aggregate chain before merging. This will keep
  happening as long as missions are scoped from a written plan rather than
  live repository state — treat it as routine reconciliation work, not a
  sign anything went wrong.
- **A hand-reconstruction of the repo's equations is not evidence the repo's
  actual code works.** M006's own validation ran the authored test against
  an isolated JS reimplementation of the solver equations, not the real
  `compileFrameElement`/`compileSolverExecution` chain — and it masked a real
  bug: `materialResolution()`/`sectionResolution()` return sealed resolution
  records with properties nested under `.materialState`/`.sectionState` (the
  shape `compileFrameElement` actually consumes), but the new script read
  `material.elasticModulus` etc. directly, producing `NaN`. The
  reconstruction couldn't have caught this because it never used the real
  fixture-returning functions. Exact-head execution is the only check that
  catches nesting/shape mismatches like this — numeric hand-verification of
  the *assertions* proves the arithmetic is right, not that the code compiles
  the same numbers.
- **Per-package anti-drift guards (line-count caps, forbidden-pattern regexes)
  are invisible to sandboxes without repository access, and will fail new
  files that never triggered them before.** M007's new
  `gravity-expansion.js` was 456 lines against `linear-piping-analysis-consumer`'s
  hard <300-line-per-file cap, and separately tripped a
  `HIDDEN_DEFAULT_PARAMETER` regex guard (a destructured `= []` default) —
  neither could have been caught by an agent that never ran
  `check:linear-piping-analysis-consumer` against the real tree. Splitting
  along a natural seam (orchestration entry / derivation helpers / element
  re-stiffening, in this case) is usually mechanical once the guard's actual
  failure is in hand; don't take an agent's own "validation passed" as
  covering guards it never had the files to run.
- **A source-guard's literal-adjacency regex can go stale across several
  merges before anyone notices**, because each Work Pack's own validation
  only proves *its own* diff, not the cumulative state after N prior
  legitimate insertions. `lfea-b4.0-source-guard.mjs` required
  `check:lfea-b3.4 && npm run check:lfea-b4.0` to appear back-to-back in
  `check:lfea-linear-core`; M002/M004/M005 each legitimately inserted a new
  `b3.x` slot between them without anyone updating this guard, so it was
  already failing on `main` (independent of M006/M007) by the time M006 hit
  it. Fixed to check presence + ordering instead of literal adjacency —
  same intent, no longer brittle to future insertions.
- **Fixed (was: known pre-existing gap, found during M006/M007 review).**
  `scripts/linear-piping-workspace-integration-check.mjs` read
  `.github/workflows/lfea-piping-phase-certification.yml`, one of the 95 CI
  workflow files M001 removed. That workflow's own commit confirms it was
  gated on `workflow_dispatch` inputs a normal `pull_request` event never
  supplied, so restoring it would have satisfied the assertion cosmetically
  without providing working CI. Fixed (PR #461, `e6d30ca`) by pointing the
  assertion at the two mechanisms that actually keep this check and its e2e
  companion wired in: import by the registered
  `linear-piping-presentation-anti-drift-check.mjs`, and presence under the
  project's Playwright `testDir`. `check:lfea-linear-core` now completes end
  to end as a single command for the first time since M001 merged.
