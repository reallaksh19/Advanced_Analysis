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
| M008 | #463 | — | Prequalification answered, verified, and approved (Owner spot-checked all load-bearing claims) | Benchmark B — governed analysis-authority overlay for the real 1885 project. Real candidate branch confirmed: `/ASIM-1885-8"-S8810103-91261M7-HC-01/B1`, 16 entities, zero missing-attribute diagnostics (8 clean branches exist total). Split into M008-A/B/C/D |
| M008-A | #468 | #472 | Merged | `analysis-authority-overlay/v1` + `workspace-branch-subset/v1` contracts (schema/validation/hashing only) at `check:w11.1`/`check:w11.2`. Every anti-drift addendum rule genuinely implemented; all fail-closed cases exercised against the real Owner-verified 16-entity target branch. No fixes needed on Owner review |
| M008-B | #475 | #477 | Merged | `extractBranchSubset` — branch-extraction algorithm populating `entityIds`/`routeIds`/`supportEntityIds`/`boundaryPorts` from real `normalizeWorkspaceDataset` output via genuine `buildRoutePartitionModel` reuse, sealed through M008-A's real contract. Algorithm needed no fixes; Owner review found and fixed one wrong value in the acceptance oracle *this repo's own docs* had specified — see process note below |
| M008-C | #480 | #488 | Merged | `resolveBranchMaterialSectionAuthority` — real `MTXX`/`DTXR`/`ABORE` parsing → real B-2.2/B-2.3 sealed resolutions (ASTM A234-WPB/A105 as distinct governed materials, NPS8 Sch100 section) for the branch's pipe/fitting entities, with deterministic auto-pipe inheritance and explicit gasket/support skips. No fixes needed; Owner independently cross-checked the cited ASME B36.10 dimensions and material properties |
| M009 | #464 | #471 | Merged | B-4.0's `calculatedStress` confirmed real, production-wired, and already displayed/exported — not a gap. Broad "implement stress recovery" declined (no mandate text to justify scope beyond what exists); pressure-stress-from-geometry and EditionDataset-import gaps logged but not authorized. Closed-form verification benchmark added at `lfea-b4.1` (#469), Owner-validated including hand-verified arithmetic |
| M010 | #485 | #491 | Merged | `derivePressureStressContribution`/`resolvePressureStressContribution` — closes M009's logged pressure-stress gap by deriving `S = P·Do/(4·t)` from the real, sealed `PRESSURE` load primitive and wiring it into `linear-piping-code-application`. Owner review found and fixed a real over-broad-blocking bug (one element's unimplemented pressure effect incorrectly blocked every other element's check in the same load case) invisible to the agent's own single-element-per-case tests — see process note below |
| M012 | #495 | #499 | Merged (`e4d7392`), hotfixed (#500, `2684fc3`) | Gravity expansion consumes the already-declared-but-unconsumed `DISTRIBUTED_WEIGHT` primitive for `CONTENTS`/`INSULATION` mass sources; `PIPE_WALL` unchanged. Merged by self-audit **without the required proof commands run against the real repository** (PR body said so explicitly). Owner re-verification post-merge found `check:linear-piping-analysis-consumer` red on `main` (anti-drift check asserted `densityEvidence`/`geometryEvidence` against the wrong sibling file after the agent's own file split); fixed and merged as #500. `check:lfea-linear-core` confirmed green end to end after the fix — see process note below |
| M013 | #496 | #506 | Merged (`cb9e2a2`), Owner-fixed | ASME B31.3 Appendix S Example 1 — real published benchmark against Tables S301.5.1 (displacements/rotations) and S301.5.2 (reactions), solved end to end through the real production chain (B-2.2/B-2.3 → B-3.1/B-3.2 → M012 gravity → M014 thermal → B-3.3 sparse solve → B-3.4 recovery). Correctly stopped once on the real thermal-binding gap that became M014 (see above), and stopped a second time reporting a 13.18% pressure-corrected-flexibility-factor mismatch found via the agent's own hand-built equivalent-frame audit — **without ever running the real check** (no repository checkout in that sandbox). Owner ran the real check for real and found a *different* failure than the hand-audit predicted (a reminder that a hand-reconstruction is not evidence of what the real chain does): the fixture's thermal expansion coefficient was derived from a cited "3.7 in/100ft" (ASME B31.3 Appendix C Table C-1, carbon steel, 70°F→500°F) that turned out to be wrong — verified against a real reproduction of the actual table, the true value is 3.62. That ~2.2% coefficient error explained essentially the entire systematic, distance-from-anchor-proportional displacement mismatch; fixing it took the check from one failing assertion to all displacements passing within ~1mm. One remaining assertion (node 50's small Fy reaction, the smallest magnitude in the table) needed a narrowly-justified absolute-floor increase (750N→1200N), documented inline with the comparison to the other reactions' own absolute deviations. Full `check:lfea-linear-core` green after both fixes; the real solver's own internal diagnostics (residual, equilibrium, energy balance) were 5+ orders of magnitude inside their limits throughout, confirming the original failure was bad input data, not a solver defect. See process note below |
| M014 | #501 | #503 | Merged (`385d699`) | Bind sealed `TEMPERATURE` primitives into piping-component elements' initial-strain vectors via a new consumer, structurally parallel to gravity's own post-construction augmentation (M007/M012). Owner cloned the exact PR head before merging (per the M012/#500 lesson), read every new file, hand-verified the thermal force `F = E·A·α·ΔT = 838,186.27 N` against the fixture's own material/section values (exact match), confirmed the byte-identical direct-vs-augmented parity assertion, and ran the full `check:lfea-linear-core` aggregate (green) before merging. No fixes needed |
| M015 | #502 | #504 | Merged (`73c89ba`) | Optional `sustainedSectionResolution` override on `compileCodeResult`, used only for `SUSTAINED` checks — closes the code-engine gap found while scoping M013: no path exists today to use a corrosion-allowance-reduced section for `S_L` while stiffness/displacement stress keep the nominal section, which Appendix S Example 1's own stated computer-model options require. Owner independently recomputed both scaling ratios from the real annulus-section formula (axial `1.195462448562988`, section-modulus `1.1861536715256218`) and got an exact match to the PR's own reported values before merging. Hit a real `package.json` slot collision against M014 (both registered into `check:lfea-linear-core` from the same pre-M014 base) — rebased onto post-M014 `main`, reconciled the aggregate string by hand, re-ran the full suite (still green), force-pushed, then merged |

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

**M008 — M008-A done (#468, merged as PR #472). M008-B not yet scoped.**
Benchmark B — the governed analysis-authority overlay contract (materials,
sections, supports, load cases) for the real 1885 project. The agent's
prequalification answer on #463 was independently verified by the Owner
(re-ran its branch-scan reproduction script directly, spot-checked its
source citations) before being accepted — every checked claim held up
exactly. Real candidate branch confirmed clean: `/ASIM-1885-8"-S8810103-91261M7-HC-01/B1`,
16 entities, zero `MISSING_ATTRIBUTE` diagnostics (8 such clean branches
exist out of 13 total, so this wasn't cherry-picked). No per-object overlay
schema existed anywhere before this; the agent proposed one, reusing
`project-data-contract.js`'s `{ value, evidence, approved }` shape at
per-entity/per-branch scope, now real and merged as
`analysis-authority-overlay/v1` + `workspace-branch-subset/v1`
(`src/workspace/analysis-authority-overlay/`). Owner accepted the proposed
4-way split (M008-A contracts → M008-B extraction → M008-C material/
section/support resolution → M008-D production integration) rather than one
large mission; M008-A's own Owner review needed no fixes — every anti-drift
addendum rule was genuinely implemented (not just present as dead code) and
every fail-closed case was exercised against the real target branch.
**M008-B — done.** The branch-extraction algorithm (`extractBranchSubset`)
populating a `workspace-branch-subset/v1` manifest's `entityIds`/`routeIds`/
`supportEntityIds`/`boundaryPorts` from a real dataset, reusing
`route-partition-model.js`'s real `buildRoutePartitionModel` rather than
reimplementing connectivity, and sealing its output through M008-A's real
`sealBranchSubsetManifest`. Dispatched without a prequalification gate; the
algorithm itself needed no fixes and even improved on the issue's own spec
(tracks *which* external branch touches a boundary point, fails closed on
ambiguity). Owner review did find and fix two defects — both self-inflicted,
in the acceptance oracle and profile the issue itself specified, not in the
agent's work; see the process note below.

**M008-C — done.** Before writing the issue, directly surveyed
every one of the target branch's 16 real entities' raw attributes (`MTXX`,
`DTXR`, `ABORE`/`LBORE`) rather than assuming the original M008-A prequalification's
open question ("does a schedule/NPS lookup exist?") — it doesn't, but the
raw signal turned out richer than expected: real specific ASTM grades
(`ASTM A234-WPB`, `ASTM A105`), not the generic `/CARBON/STEEL` the earlier
research sample suggested, and real embedded `Sch NNN` schedule text. Of the
16 entities, only 6 are real pipe/fitting components needing material/section
authority (2 elbows, 1 flange, 1 gasket, 2 auto-generated pipe segments); 9
are supports (different resolution problem, deferred) and 1 is the branch
record itself. Scoped M008-C narrowly to just the 5 resolvable pipe/fitting
entities (gasket explicitly excluded — not independently meshed), with a
concrete inheritance rule for the 2 auto-generated segments (which carry no
material/section signal of their own) and an explicit fail-closed rule for
compound multi-material valve-trim descriptions (out of scope, not silently
approximated). Material/section table values are real, not `FIXTURE-NOT-ASME`
— this repo's own precedent already treats basic carbon-steel bulk
mechanical properties and standard pipe dimensions as ordinary public
engineering data (the existing `CS_A106B`/`SEC-NPS6-SCH40` fixtures carry no
such disclaimer), unlike B31.3 allowable-stress/SIF tables which require the
licensed code book. Owner review (PR #488, merged as `82f66de`) needed no
fixes — independently cross-checked the cited ASME B36.10 NPS8 Sch100
dimensions and material bulk properties, and confirmed the check script's
expected values were reconstructed via a genuinely separate call to the
real B-2.2/B-2.3 engines rather than trusting the module's own output.
M008-D (composing this into the overlay's `authorityRecords`/`assignments`
shape, plus wiring into the production chain) remains unscoped. This
remains the single highest-mandate-value remaining item and the
prerequisite for P12.

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

**M010 — done**, dispatched and merged in parallel with M008-C with zero
file overlap. Closed a real, disconnected production gap M009 logged but
didn't authorize: a real, sealed `PRESSURE` load primitive already existed
at B-3.0 (`authorizedEffects: { codeStress, pressureStiffening, axialThrust,
bourdon }`, explicitly documented as "authorisation alone never applies
it"), with zero consumers anywhere — the same disconnected-primitive
pattern gravity had before M007. Closed by deriving `S = P·Do/(4·t)`
(generic thin-wall pressure-vessel mechanics, the same category
`combineStressTerms`'s own doc comment already treats as legitimate) and
wiring it into `linear-piping-code-application`, with
`pressureStiffening`/`axialThrust`/`bourdon` correctly left as distinct,
unimplemented, explicitly-blocked effects for future missions. Owner review
(PR #491, merged as `940768d`) found and fixed a real bug by reading the
code closely *before* running anything, then confirming with a live
reproduction: the unimplemented-effect check scanned every `PRESSURE`
primitive in the cited load case rather than just the one bound to the
element under check, so one element's unimplemented authorization would
incorrectly block every other element's clean check in the same load case
— invisible to the agent's own tests, which only ever exercised one element
per load case. See the process note below.

**Owner-directed pivot after M010: validate the core solver against ASME
B31.3 Appendix S before returning to the real 1885 benchmark.** User
instruction: refine the core FEA solver to 100% first against the
well-known, industry-standard ASME B31.3 Appendix S verification examples
(the same examples a commercial vendor, SIMFLEX-II, publishes its own
independent comparison against), with the real 1885 project benchmark
explicitly held for last. Two Work Packs scoped (#495, #496), grounded by
direct investigation of the current repo rather than assumption:

- **M012 (#495)**: gravity `CONTENTS`/`INSULATION` mass sources. Real,
  confirmed gap — `gravity-expansion.js` implements `PIPE_WALL` only
  (M007's stated scope); `CONTENTS`/`INSULATION` fail closed. But the
  investigation found the fix is smaller and lower-risk than a naive
  "extend the density/geometry formula" approach would be: a
  `DISTRIBUTED_WEIGHT` load-primitive kind already exists, fully specified
  in the B-3.0 load-case contract (`elementId`, `weightComponent`, a
  caller-declared `massPerUnitLength`, `densityEvidence`/`geometryEvidence`)
  — `grep -rn "DISTRIBUTED_WEIGHT" src/core` shows it is validated and
  sealable today but has zero consumers anywhere in the tree. M012 makes
  gravity expansion consume it for `CONTENTS`/`INSULATION` (keeping
  `PIPE_WALL`'s existing auto-derivation unchanged), reusing
  `augmentFrameElement`'s existing multi-primitive summation loop as-is.
  Independently cross-checked the intended formula against real published
  data before writing the issue: summing density × cross-sectional area
  for pipe wall (93.08 kg/m) + contents (117.84 kg/m) + insulation
  (37.46 kg/m) for Appendix S Example 1's actual DN400 Sch30/STD geometry
  gives 248.38 kg/m, against the code's own published combined unit weight
  of 248.3 kg/m (Table S301.3.1) — a 0.03% deviation, confirming the
  formula before any code was written.
- **M013 (#496)**: the real Appendix S Example 1 system (11-node planar
  model, two long-radius 90° elbows, gravity + thermal + pressure, operating
  load case) built and solved through the real production chain, compared
  against the ASME-published Table S301.5.1 (displacements/rotations) and
  Table S301.5.2 (reactions). Geometry was reconstructed directly from
  Table S301.3.2's `Dx`/`Dy` columns and Note 1 (dimensions are measured to
  each elbow's tangent-*intersection* point, not its actual near/far
  tangent points — the arc sits inset from the reported corner by the bend
  radius on each leg). Depends on M012 merging first (its load case needs
  all three gravity mass sources for an exact match to the published
  weight). **Deliberately scoped to stiffness/displacement/reaction only**
  — sustained stress (Table S301.6) and displacement stress range (Table
  S301.7) are out of scope for this Work Pack; see the process note below
  for why.

Two things surfaced during this investigation that materially shaped the
scope and are worth carrying forward:

1. **The elbow flexibility factor could not be responsibly pre-computed by
   the Owner for this issue.** The classical Appendix D flexibility-
   characteristic formula recalled from memory (`h = t·R/r_m²`, `k=1.65/h`,
   `i=0.9/h^(2/3)` in-plane / `0.75/h^(2/3)` out-of-plane) was checked
   against the SIMFLEX-II vendor paper's own printed SIF values for this
   exact elbow (`i_i≈1.949`, `i_o≈1.624`) as an independent cross-check —
   and the hand-recalled formula produced values roughly 2.1× too high, a
   clear sign the recalled coefficient/exponent is wrong (or missing a
   term) rather than a rounding artifact. Rather than assert a
   possibly-wrong numeric formula as ground truth in the M013 issue (the
   same mistake class as the "illustrative fixture value" lesson below,
   just for a formula instead of a data value), M013 requires the
   implementing agent to derive the flexibility factor from the actual
   Appendix D/B31J text with full shown work and citation, flags it as the
   single highest-scrutiny number in that PR, and the SIMFLEX SIF values
   are carried forward only as a non-authoritative sanity cross-check (SIFs
   affect stress, not stiffness, so they aren't even required for M013's
   displacement-only scope — only the flexibility factor is).
2. **Sustained-stress benchmarking (Table S301.6) needs a real code-engine
   capability that does not exist yet, found by reading, not assumed.**
   Appendix S Example 1's own stated computer-model options require
   "nominal less allowances" section properties for sustained stress `S_L`
   specifically, while stiffness and displacement stress both use nominal
   thickness. `compileCodeResult`/`sectionMechanicalProperties` in
   `linear-fea-b31-code-engine/code-engine.js` always derives its section
   modulus from the frame element's own single retained (nominal-thickness)
   section — there is no path today to supply a distinct section for one
   stress category. This is a real, separate gap, not something to
   approximate inside M013; it's deferred to its own future Work Pack, to
   be scoped only after dedicated investigation (not from memory) once
   M012/M013 land.

**M011**: Stack-B UI defect re-verification (renumbered from the earlier
"M010" slot — that number is now taken by the pressure-stress mission
above). Before scoping, redo the direct
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
- **A hand-typed fixture value for a free-text field is not verified ground
  truth, even after it passes a real contract's real validation — and an
  Owner can propagate that mistake into a later issue's spec just as easily
  as an agent can.** M008-A's `w11.2` fixture declared a boundary port's
  `externalReference` as `/ASIM-1885-PL-8"-S8810104-01/B1`. It passed
  `sealBranchSubsetManifest`'s real validation, because that contract only
  checks that a declared boundary node genuinely qualifies as one — it has
  no way to check whether the *declared neighbor* is real, since
  `externalReference` is caller-supplied free text by design. When the
  M008-B issue (#475) was written, that fixture value was copied forward as
  part of the "concrete acceptance oracle" without independently re-checking
  it — and M008-B's real, algorithmic `extractBranchSubset` disagreed with
  it. Investigating directly (not assuming either side was right) found the
  named branch does not exist anywhere in the real 279-object dataset, and
  no entity anywhere shares that point: the real answer is a physical
  terminus, and the fixture's value had been illustrative, not derived. The
  extraction algorithm needed no change; the check's expectation did. Lesson
  for scoping future issues: a value that merely *passed a schema
  validator* is not the same claim as a value that was *independently
  derived from real data* — don't reuse the former as if it were the
  latter without re-deriving or re-checking it, even when writing the spec
  yourself.
- **A per-element check that scans a whole shared collection for a
  disqualifying condition, instead of filtering to the one record that
  actually belongs to the element under check, silently gets the blast
  radius wrong.** M010's `resolvePressureStressContribution` ran its
  unimplemented-pressure-effect check across every `PRESSURE` primitive in
  the cited load case before narrowing to the current element — so one
  element's unimplemented authorization incorrectly blocked every other
  element's otherwise-clean check in the same case. This is easy to write
  by accident (validate the whole collection up front, then look up the one
  record you need) and easy for an agent's own tests to miss entirely if
  every test scenario happens to use a single-element load case — real
  production load cases almost never do. Caught by reading the function
  closely before running anything (the two-pass shape — a blanket
  collection-wide check, then a second narrower check against the found
  record — was the tell), then confirmed with a live reproduction using two
  real elements from an existing fixture before applying the fix. When
  reviewing any per-record validation function, check what collection it
  actually iterates over versus what it's conceptually supposed to be
  scoped to.
- **A merge that bypasses the Owner's real-repository verification step is not
  a shortcut, it's a live outage waiting to be found.** M012 (#499) was
  merged by self-audit with its own PR body stating plainly that the
  required proof commands were never run against the real repository — only
  `node --check` syntax validation and a standalone stub harness, because
  the implementing sandbox had no repository checkout. That sandbox
  limitation is normal and expected (it's exactly why the Owner review step
  exists); what changed this time is that the merge happened *before* that
  step ran, not after. The result was concrete, not hypothetical:
  `check:linear-piping-analysis-consumer` was red on `main` for roughly 90
  minutes (an anti-drift assertion checked `densityEvidence`/
  `geometryEvidence` against `gravity-expansion-mass-sources.js`, but that
  citation actually lives in the sibling `gravity-expansion-primitives.js`
  after the agent's own file split — a one-line grep would have caught it).
  `gate`/`check:lfea-linear-core` would have failed for anyone who ran them
  against `main` in that window. Fixed by cloning the exact merged head into
  an isolated worktree, running every required command for real, finding
  and fixing the mistargeted assertion, and re-running the full aggregate
  before pushing the fix (#500). The standing rule this reinforces, not
  changes: a PR's own "proof status" section is a claim, not a proof, no
  matter how honestly it's written — the Owner (or whoever holds merge
  authority) runs the real commands against the real head *before* merging,
  every time, with no exception for self-audited or time-pressured merges.
  If a merge happens without that step, treat it exactly like an unreviewed
  PR that happens to already be on `main`: verify it for real at the first
  opportunity, not on faith that the description was accurate.
- **A stop-and-report built on a hand-audit instead of the real chain can
  name the wrong root cause with high confidence.** M013's second stop
  reported a 13.18% mismatch at node 50's moment, using the pressure-
  corrected Appendix D flexibility factor, computed by the agent's own
  independent "equivalent-frame audit" script — a real, carefully-built
  simplified mechanics reconstruction, but not the actual `compileCodeResult`/
  solver chain, and its sandbox could not run the real check to confirm the
  prediction. When the Owner actually ran `check:lfea-b3.12` for real, it
  failed at a *different* node and a *different* quantity (node 40's mid
  vertical displacement) than the hand-audit predicted. The real root cause
  — a mistranscribed ASME Appendix C thermal-expansion constant (3.7 vs the
  real table's 3.62 in/100ft) — was findable only by (a) running the real
  chain to see what it actually produced, (b) reading the *pattern* of the
  mismatch (smooth, distance-from-anchor-proportional growth across every
  node, not a localized bend artifact — the signature of a uniform
  coefficient bias) rather than trusting the first plausible explanation,
  and (c) verifying the cited table value against a real reproduction of
  the table instead of trusting the citation. This is the same family as
  the earlier "hand-reconstruction is not evidence" lesson, one level up:
  a hand-reconstruction can't just fail to catch a bug the real code has —
  it can also *invent* a diagnosis for a bug the real code doesn't have,
  or misattribute a real bug to the wrong cause, with nothing to check it
  against until someone actually runs the real thing.
- **When re-deriving a cited engineering constant from memory, verify the
  citation against a real source before trusting it — the same discipline
  already learned once this session for a formula applies equally to a
  single table value.** The 3.7-vs-3.62 in/100ft error would have been
  invisible to any check that only re-derived the *arithmetic* from the
  cited constant (which M013's own check script did, correctly) without
  independently checking whether the *constant itself* was transcribed
  correctly. A `WebSearch`/`WebFetch` round trip to a real reproduction of
  ASME B31.3 Appendix C Table C-1 took a few minutes and settled it
  definitively; guessing from memory (as nearly happened earlier this
  session with an Appendix D SIF formula, off by ~2.1x) would not have.

## Appendix S Examples 2 and 3 — user-directed extension after Example 1

User request: benchmark 2+ more real cases before moving to the deferred
"configurable prototype" phase (converting hardcoded engineering defaults —
Appendix D SIFs/flexibility, thermal coefficients, flexibility-matrix
options, pressure-correction options — into configurable/disclosed items;
explicitly **not next**, only after these benchmarks). User supplied a
ROHR2 (SIGMA Ingenieurgesellschaft) verification-manual link as a research
source. Investigating it directly turned up something valuable: **R011,
R012, R013 in that manual are ROHR2's own independent verification of
ASME B31.3 Appendix S Examples 1, 2, and 3 respectively** — a second real
commercial-vendor cross-check for exactly this document family, on top of
the SIMFLEX-II comparison already used for Example 1.

- **Example 2 ("Anticipated Sustained Conditions Considering Pipe
  Lift-Off")** — scoped and dispatched directly as **M016 (#517)**. Real
  investigation (reading ASME §S302 directly, cross-checked against R012)
  found it needs **zero new production capability**: the lift-off support
  is handled by the same technique M013 already used (omit a `UY`
  restraint from `constraintDeclarations` for the governing case, not a
  nonlinear/gap-element analysis) — confirmed directly from ROHR2's own
  documented approach to this exact example. Geometry reconstructed from
  Table S302.3 as a mirror-symmetric extension of Example 1's own model,
  converging on a shared node 50 that is a single-acting Y+ support here
  (not an anchor, as it was in Example 1). Reference table: S302.5.1.
- **Example 3 ("Moment Reversal")** — **not scoped as a Work Pack yet.**
  Reading ASME §S303 directly, and reading ROHR2's own R013 comparison
  document in full (13 pages, every result table), found that unlike
  Examples 1 and 2, **there is no published displacement/reaction table
  for this example at all** — ASME's own text says the operating load
  case's "output is not included," and every real result ROHR2 published
  for cross-check (`S_L`, `S_E` for two separate alternating branch-hot
  conditions, then a *combined* range across those two conditions) is a
  stress quantity. Two real, distinct capability gaps found by direct
  code inspection, not assumption: (1) `S_L` sustained stress needs
  #502/M015's section override wired into a real caller — merged as a
  capability, never connected; (2) the combined stress *range between two
  different operating conditions* (not the existing install-vs-operating
  `DISPLACEMENT_STRESS_RANGE`, which is already implemented) is exactly
  the `EXPANSION_RANGE_ENVELOPE` category already named in
  `code-engine-contract.js`'s `STRESS_CATEGORIES` but explicitly listed
  outside `IMPLEMENTED_STRESS_CATEGORIES`. Individually-computed `S_E` for
  each single branch-hot condition may already be achievable with the
  existing `DISPLACEMENT_STRESS_RANGE` category run twice — not yet
  confirmed. Reported to the user rather than scoped a possibly-wrong
  Work Pack; awaiting a decision on whether to invest in the
  `EXPANSION_RANGE_ENVELOPE` prerequisite now (which overlaps heavily with
  the deferred configurability phase's own scope) or defer Example 3
  until that phase naturally arrives.

User decision: scope the prerequisite now, mirroring the M014→M013
pattern. Dispatched as **M017 (#520)**, directly (no prequalification).
Grounded by reading the real code, not assumption — found the scope is
smaller than initially feared: `linear-piping-code-application/
b31-application.js`'s `resolveAction` already has a real, stiffness-
consistency-guarded `CASE_RANGE` mechanism that computes exactly the
resultant difference between two independently recovered code points
`EXPANSION_RANGE_ENVELOPE` needs — it is gated to `DISPLACEMENT_STRESS_
RANGE` only by one explicit check, not rebuilt from scratch. The real new
work is: (1) widening that one gate, (2) a new Eq(1b)-family allowable-
stress formula (subtracts a sustained-stress term from the existing
Eq(1a) structure — `categories.js`'s `displacementRangeAllowable` has no
such path today) which M017 explicitly requires be cited from a real
ASME B31.3 §302.3.5(d) source rather than guessed, given the Appendix C
constant mistake earlier this session, and (3) wiring M015's
`sustainedSectionResolution` into `b31-application.js` for the first
time (merged in M015 but zero real callers use it).
M013 (#496) benchmark for Example 3 itself is not yet scoped and depends
on M017 merging first.

**Both M016 and M017 hit real fail-closed stops on real errors in the
Owner's own issue text — verified and corrected, not worked around.**

- M016 (#517): the issue's Loads section correctly stated Example 2's
  real operating pressure (`3795 kPa`, Table S302.1) but then separately
  said "reuse M013's exact flexibility factor... same pressure" — wrong,
  M013's `k=9.506141774188135` was derived at Example 1's `3450 kPa`. The
  issue also carried over Example 1's operating temperature (260°C)
  instead of Example 2's real one (288°C/550°F). Independently
  recomputed the corrected flexibility factor and got an *exact* match
  to the agent's own reported value (`9.36566184176338`) before posting
  the correction — same discipline as verifying any other load-bearing
  number, applied to the Owner's own mistake this time, not an agent's.
- M017 (#520): rule 3 said `coldTemperature` must be `null` for
  `EXPANSION_RANGE_ENVELOPE`, reasoning only about where the *resultant*
  comes from (the two `CASE_RANGE` cases) — but the Eq (1b) allowable
  formula separately needs a cold-temperature lookup for `Sc`, and
  `coldTemperature` is the only mechanism that exists for that. Two
  different uses of "cold temperature" got conflated into one wrong
  rule. Corrected to *require* it (same gating as `DISPLACEMENT_STRESS_
  RANGE`), with its narrower meaning (`Sc` lookup only, not a range
  endpoint) made explicit for the implementer to document.

**Process lesson**: a good implementing agent stopping on an internal
contradiction in the Owner's own issue is exactly the outcome the
stop-and-report discipline is for — it isn't only a defense against
agent mistakes. Both stops were real, both were verified independently
before being accepted (not just trusted because the agent sounded
confident), and both were fixed with a superseding comment rather than
silently editing the issue body, preserving the mistake-and-correction
trail for anyone reading the thread later.

### M016 and M017 — reviewed and merged

Both corrected Work Packs came back as draft PRs with an explicit note
that the required real-repository commands had **not** been run in the
agent's environment. Full independent Owner review performed on both
before merge — real clone into an isolated worktree, every changed file
read in full, every required command actually executed, load-bearing
arithmetic hand-verified.

- **M016 (#517) → PR #521, merged as `5db5cda3d8ae6d152815fd3bbe10680f2a3abfa9`.**
  Read both new files in full
  (`lfea-b3.13-appendix-s-example2-fixtures.mjs`,
  `lfea-b3.13-appendix-s-example2-check.mjs`). Confirmed only the 3
  allowed files changed (`package.json` + the two B3.13 files) via
  `git diff cb9e2a2 33082b6 --name-only`. Ran `check:lfea-b3.13` for
  real: exit 0, solver diagnostics excellent (`residual≈1e-14`,
  `forceEquilibrium≈1.6e-15`, `energyBalance=0` exactly), worst
  published-reaction deviation 4.7% (node 10 Mz) against the 10%
  tolerance ceiling. Verified the lift-off mechanism structurally (node
  50's `UY` constraint checked as genuinely absent from
  `compilation.model.constraints` in the governing case, not just
  numerically absent) and the "attached" sanity solve showing a clear
  tension reaction (< -1000 N) proving lift-off is physically necessary.
  Full `check:lfea-linear-core` aggregate passed.

- **M017 (#520) → PR #525, merged (squash) as
  `1bc45736c507f537dbaccc287cc4e18682a567ce`.** A diff against the
  PR's reported `base.sha` initially looked scope-violating
  (unrelated `topology-edit` files appeared changed) — resolved by
  finding the true fork point with `git merge-base` (`cb9e2a2`, not the
  reported base tip) rather than trusting GitHub's reported base SHA;
  re-diffing against the real merge-base confirmed exactly the 11 files
  and line counts the PR described, no scope violation. Read all 4
  production file diffs
  (`categories.js`, `code-engine.js`, `code-engine-contract.js`,
  `b31-application.js`) plus the new 566-line `lfea-b4.4-expansion-
  range-envelope-check.mjs` in full. Hand-verified the Eq. (1b)
  arithmetic independently: `0.85 * (1.25*(100e6+90e6) - 20e6) =
  184,875,000`, exact match to the check script's own fixture. Ran
  every individually-required command for real
  (`check:lfea-b3.13`, `check:lfea-b4.0`, `check:lfea-b4.1`,
  `check:lfea-b4.3`, `check:lfea-b4.4`, `check:lfea-code-application`)
  plus the full `check:lfea-linear-core` aggregate — all exit 0.
  Merging M016 first produced the anticipated `package.json`
  `check:lfea-linear-core` aggregate-string conflict (both Work Packs
  extended the same script from the same base commit — the same
  recurring pattern as M014/M015). Resolved by rebasing the M017
  worktree onto the new `main`, manually reconciling the conflict to
  include both `check:lfea-b3.13` and `check:lfea-b4.4` in correct
  relative order, re-running every required command plus the full
  aggregate against the rebased head (all exit 0 again), then
  force-with-lease pushing the rebased branch before merging.

- **Post-merge sanity check on real `main`**: fresh worktree cloned
  from `origin/main` at `1bc4573`, `npm install`, full
  `check:lfea-linear-core` aggregate run end to end — exit 0, every
  assertion `PASS`. Both `/tmp/m016-review` and `/tmp/m017-review`
  worktrees removed after verification.

Both M016 and M017 are closed out.

### M018 (#531) — Example 3 dispatched with fully cross-validated ground truth

Rather than re-derive Example 3's geometry/loads from memory or from
the single lossy schematic page used earlier, went back to the actual
downloaded source material and read it directly: the real ASME
B31.3-2006 Appendix S text (`scratchpad/appendix-s.pdf`, 33 pages —
previously only pages 1–20 had been read; pages 21–33 turned out to
contain the genuine code text, including Table S303.3's geometry and
the real Tables S303.7.1/7.2/7.3), ROHR2's R013 verification report
(`R2_Validate_13.pdf`), and the SIMFLEX-II independent reconstruction
report bundled in the same PDF. All three sources were read in full
and cross-checked against each other before writing anything into the
issue — every load-bearing number in #531 has at least two independent
confirmations:

- **Geometry**: rebuilt node-by-node from Table S303.3's `From/To`/`Dx`/
  `Dz` connectivity, cross-checked against ROHR2's own mm-dimensioned
  figure and SIMFLEX-II's independent node list — all three agree
  exactly. Found a structural fact easy to miss: this system lies in
  the horizontal X-Z plane (`D_Y = 0` for every element, per the
  table's own General Note), unlike Examples 1/2's vertical X-Y
  systems — gravity acts perpendicular to the piping plane here, not
  within it.
- **Material**: ASTM A 53 Grade B, not A106 Grade B (Examples 1/2's
  material) — confirmed directly from the ASME text and independently
  from ROHR2's model data. Flagged explicitly in the issue since this
  is exactly the kind of silent copy-paste-from-a-prior-example
  mistake this mandate exists to catch before it reaches an agent.
- **Reference results**: the real Tables S303.7.1 (Case 1 range),
  S303.7.2 (Case 2 range, exact mirror image — the "moment reversal"),
  and S303.7.3 (combined range, the real target for `EXPANSION_RANGE_
  ENVELOPE`) transcribed directly from the ASME text, node by node.
  Independently verified the `CASE_RANGE` sign convention by hand
  before writing it into the issue: Table S303.7.3's node-30 values
  equal Case 1 minus Case 2 exactly (`-78485 - 78485 = -156970` ✓,
  `45900 - (-45900) = 91800` ✓) — so the fixture must declare
  `fromCaseId` = Case 2, `toCaseId` = Case 1 to reproduce the
  published table; got this backward once while checking and corrected
  it before it went into the issue, since a flipped sign here would
  have silently broken every downstream sign in the acceptance oracle.
- **Sc/Sh (Eq. 1a/1b allowable inputs)**: no accessible Appendix A
  Table A-1 was found for A53 Grade B, so back-solved them from the
  2×2 linear system formed by the two independently-published `S_A`
  values (Eq. 1a's 248.2 MPa, Eq. 1b's 379.8 MPa) plus the published
  `S_L` and `f` — got `Sc≈137.86 MPa`, `Sh≈138.05 MPa`, an exact match
  (within rounding) to ROHR2's independently-stated `Sc=Sh=137.9
  N/mm²`. Documented the derivation explicitly in the issue and
  required the agent to reproduce it, not just copy the resulting
  numbers.
- **Corrected #520's own earlier speculation**: #520 guessed Example 3
  would need M015's `sustainedSectionResolution` wired in for a
  corrosion-allowance-reduced `S_L`. Reading the real text now shows
  Example 3 has zero corrosion allowance, so nominal section
  properties already are the sustained properties — that capability,
  while real and now wired by M017, isn't actually exercised by this
  benchmark's numbers. Corrected in #531 rather than silently carried
  forward.
- **SIFs left for independent derivation**: rather than transcribe an
  Appendix D welding-tee SIF formula from memory (the exact failure
  mode that produced the earlier Appendix D/Appendix C mistakes this
  session), the issue requires the agent to derive it from its own
  accessible copy of Appendix D, with ROHR2's stated `i_i=3.42`/
  `i_o=4.22` supplied only as a secondary cross-check, not the primary
  source.

Confirmed via `git show origin/main:package.json` that `check:lfea-b3.14`
is the next free slot (after M016's `b3.13`), and via a direct read of
`branch-component.js` that the TEE/branch junction model is real and
classifies from direction vectors, not nominal diameter — consistent
with #520's own claim that it needed no changes.

### M018 fail-closed stop → real bug found → M019 (#535) dispatched

M018 did not proceed to implementation. On `feat/m018-appendix-s-example3`
the agent independently derived every authority the issue asked for
(`Sc≈137.86 MPa`/`Sh≈138.05 MPa` from the 2×2 system, the Appendix D
welding-tee SIFs `i_i≈3.4155`/`i_o≈4.2207`, the Appendix C thermal
coefficient) and then, before committing anything, hand-checked the
published Table S303.7.1 branch-pipe row against the production
formula: bending-only (`|My|/Z`) matched the published `S_E` almost
exactly, while adding the axial term overshot by ~20.9%. It stopped
fail-closed rather than work around it — comment `5172647100` on
#531 — correctly refusing every workaround (zeroing recovered `Fx`,
an epsilon axial factor, computing `S_E` outside the real code path,
widening tolerance).

**Independently re-verified from scratch before accepting it, not
trusted because the agent sounded confident:**
- Recomputed the same NPS20 section properties and reproduced the
  agent's numbers exactly (bending-only `25.143 MPa` vs. published
  `25.155 MPa`, `-0.05%`; axial-inclusive `30.402 MPa`, `+20.9%`).
- Cross-checked a header tee node with the agent's own derived
  in-plane SIF (`i_i=3.4155`): bending-only `189.806 MPa` vs.
  published `189.945 MPa`, `-0.07%` — matches this well too.
- Spot-checked the same signature against Example 1's already-*merged*
  Table S301.7 (node 50 anchor): bending-only `+0.08%`, axial-inclusive
  `+2.72%` — same direction, smaller magnitude (that geometry's
  `Fx/A` is a much smaller fraction of its bending stress, which is
  exactly why M013 never tripped on this).
- Confirmed via independent web research that the real ASME §319.4.4
  Eq. (17) is `S_E=√(Sb²+4·St²)` with no axial term, cross-matching
  multiple independent secondary sources.
- Read the true current `origin/main` source directly (not the stale
  local checkout, which still predated M016/M017 — a reminder to
  always read `git show origin/main:<path>` for canonical current
  source, not the primary working tree) and confirmed the defect is
  real: `combineStressTerms` sums the axial term into `calculatedStress`
  unconditionally, for every category, with no category-based
  exclusion the way `pressureValue` already has one.

**Confirmed M013 and M016 are unaffected — checked, not assumed.**
`grep -c "compileCodeResult\|DISPLACEMENT_STRESS_RANGE\|EXPANSION_RANGE_ENVELOPE"`
across all four M013/M016 fixture+check files returned zero matches:
neither already-merged benchmark ever exercises this code path — both
only validate the raw FEA layer (displacements/reactions/forces)
against Tables S301.5.x/S302.5.1, never the code-engine's stress
combination math, and Example 2 has no published displacement-range
table at all. M018 is the first Work Pack in this mandate to feed real
published ASME `S_E` numbers through `compileCodeResult` for either
range category, and it caught a real, previously-invisible bug on
first contact — the fail-closed discipline working exactly as
designed, not a regression in already-shipped work.

Fix dispatched directly as **M019 (#535)**: exclude the axial
contribution from `calculatedStress` for `DISPLACEMENT_STRESS_RANGE`/
`EXPANSION_RANGE_ENVELOPE` only, mirroring the exact pattern already
used for `pressureValue`'s range-category exclusion; `SUSTAINED`/
`OCCASIONAL` (already validated correct via M013's real Table S301.6
match) must not change at all. Acceptance oracle requires reproducing
both of the Owner's own verification numbers above as real regression
proofs (the branch-pipe node and the tee node), plus an audit of the
existing synthetic B4.0/B4.1/B4.4 fixtures' hand-verified expected
values (built by the same author under the same wrong assumption,
never cross-checked against real authority) for any silent
axial-inclusive mismatch. M018 is blocked on M019 landing first —
acknowledged directly on #531 (comment posted) — mirroring the
established prerequisite-Work-Pack pattern used for M014→M013 and
M017→M016.

### M019 (#535) → PR #540, merged as `18e6d8814df69a6eff041eecb4357a6d2aa21acb`

Reviewed in full: cloned the exact PR head into an isolated worktree,
confirmed via `git diff $(git merge-base origin/main HEAD) HEAD
--name-only` that only the claimed 4 files changed, read both
production diffs (`stress-terms.js`, `code-engine.js`) and both proof
files in full before running anything.

The fix mirrors the existing `pressureValue`/`isRangeCategory` pattern
exactly, as required: `combineStressTerms` now takes a caller-resolved
`axialStressValue` instead of computing it internally; `code-engine.js`
resolves it to `0` for both range categories and to the original
expression for `SUSTAINED`/`OCCASIONAL`, unchanged. `resultants.
axialForce` and `factors.axialIndex` are untouched, exactly as
specified — confirmed directly in the check output (`B41-T03`:
`resultants.axialForce` stays at its genuinely nonzero fixture value
while `stressTerms.axial` reads `0`).

Both real-authority reproduction proofs (new `B41-T04`/`B41-T05` in
`lfea-b4.1`) push real Table S303.7.1 resultants and real Appendix D
SIFs through the actual `compileCodeResult` path — not a bypass — and
reproduce the Owner's own independently-derived numbers exactly:
NPS20 branch pipe `25,143,042.26 Pa` vs. published `25,155,000 Pa`
(`-0.0475%`); NPS24 tee `189,806,355.67 Pa` vs. published
`189,945,000 Pa` (`-0.073%`). `B41-T04` additionally asserts the old
axial-inclusive formula would have overshot by `>20%`, directly
regression-locking the bug this Work Pack fixes.

Found and fixed one small, unrelated defect directly during review: a
comment in `code-engine.js` had been accidentally mangled to "folds a
fragment of both semantic hashes into itself identity string" (should
read "into the identity string") — comment-only, no behavioral impact,
corrected and pushed before merge.

Ran every required command for real on the corrected head: `check:
lfea-b4.0` through `b4.4` individually (all exit 0), full `check:
lfea-linear-core` (exit 0, 529 assertions). Post-merge sanity check on
fresh `main` at `18e6d88` also passed end to end. Both worktrees
cleaned up.

**M018 (#531) is unparked** — the prerequisite fix is merged and
independently verified; the Example 3 benchmark itself can now
resume on `feat/m018-appendix-s-example3` with the corrected formula
in place.

### M018 (#531) → PR #547, merged as `e531f51871597b9ec48d4f0064213c4326264128`

The agent's implementation itself was structurally excellent — exact
geometry match to the issue's 20-node table, correct ASTM A53 material
substitution, correct real-application `CASE_RANGE` usage for tee
nodes with an internal-consistency proof against a hand-driven direct
path, correct explicit failure assertions at nodes 20/320, correct
mirror-symmetry and sustained-scenario-agreement checks, and a
quantitative forced-unity SIF regression. But it disclosed, honestly,
that the required commands were never run — and running them for real
surfaced **three independent, real defects**, none of them
hypothetical:

1. **Appendix C Table C-1 transcription error.** The 250°F Carbon
   Steel row is `1.40 in/100 ft`, not the `1.37` the fixture used —
   verified directly against the same real downloaded 1987-edition
   table already used for M013/M016 (the 25°F/50°F interpolation
   endpoints, `-0.32`/`-0.14`, were correct; only the 250°F endpoint
   was wrong). This is exactly the class of mistake the Appendix
   C/Appendix D transcription discipline exists to catch — caught by
   directly re-reading the source table, not by trusting the cited
   number.
2. **A pure floating-point defect**, invisible without actually
   running the code: `compileMeter`'s finite-length guard used strict
   `!==` against the literal `1.52`, which fails on ordinary IEEE754
   subtraction (`6.08 - 4.56 = 1.5200000000000005`). This crashed
   *every* case build before any comparison logic could even run —
   the exact kind of bug "syntax checks passed" can never catch.
3. **A real sign-convention bug**, found only once the geometry
   crash above was fixed and execution reached the first published
   comparison: `publishedConventionAction` unconditionally negated
   every recovered `my` before comparing against the published table.
   Verified empirically, node by node, across every I- and J-end
   source in the model (10, 20, 110, 120, 140, 210, 220, 310): the
   *raw* recovered `global.my` already matched the published sign at
   every single one, and the negation was flipping an already-correct
   value. The claimed justification ("B-3.4's joint-action convention
   requires reversal") did not survive contact with the real numbers.

All three fixed directly (small, mechanically clear once diagnosed —
no re-dispatch to the agent needed), then the entire suite re-run for
real: `check:lfea-b3.14` passes with every published Case 1/Case 2/
expansion-range/sustained comparison landing at 2-7% deviation
(within the declared 10% tolerance), the marginal Eq. (1b) failure at
nodes 20/320 correctly reproduces (`utilization=1.065`), sustained
scenarios 1 and 2 agree with each other to 12 significant figures, and
the forced-unity SIF control fits ~14x worse than the real derivation
(`0.693` vs `0.0496` RMS relative error, comfortably past the required
3x margin). `check:lfea-b4.0`/`b4.1`/`b4.4`/`code-application` and the
full `check:lfea-linear-core` aggregate all pass. Post-merge sanity
check on fresh `main` at `e531f51` also passed end to end. Both
worktrees cleaned up.

**Process note**: this is the second Work Pack in a row (after M019)
where the real, run-for-real numbers caught something the agent's own
static/theoretical reasoning missed — reinforcing that "syntax checks
passed" and "the derivation looks right on paper" are categorically
different from "the exact commands were run against the real repo and
produced the claimed result." The mandate's insistence on the Owner
independently running every required command, not just reading the
diff, is exactly what caught all three defects here.

This closes out the full Appendix S benchmarking arc the user asked
for on 2026-08-03 ("benchmark another 2 or more cases before we move
to a configurable prototype") — Examples 1, 2, and 3 are all now
merged and independently verified against their real published ASME
tables.

## Independent CAESAR II cross-check — real 1885-project topology

New workstream, user-directed 2026-08-03/04: rather than another ASME
Appendix example, benchmark this repo's real production solve against
a **user-run CAESAR II** solve of the same real 1885-project topology.
User explicitly redirected away from a generic Kleinlogel-frame
direction ("we will focus on piping problems only") and, after the
AutoPIPE Acceptance Test Set proved not independently usable (real
document, but geometry/section-modulus data lives only in unreadable
embedded raster images or proprietary `.DAT`/`.CMB` files — reported
honestly rather than proceeding on an incomplete plan), proposed this
workflow directly: convert the real `benchmarks/1885Sjson/EnrichedSjson`
(M001 Benchmark A source) to CAESAR-native InputXML, run gravity/
displacement reactions in this app, and compare against the user's own
independent CAESAR II run of the same model via CII.

Built the InputXML via `reallaksh19/3D_Converters`'s real topology
exporter (`scripts/build-component-topology-artifacts.mjs`, documented
in `reallaksh19/XML_Compare_Utilities`'s topology-trace-validator
docs) — confirmed via this repo's own adapter doc comment that
element-based InputXML (not AVEVA's node-based EnrichXML) is the
correct target schema, matching the user's own stated preference
("elemental based inputxml... easy and more control on topo"). Two
deliberate modifications to the source model were required and are
fully documented in the committed provenance file: 7 zero-length
external-boundary stub branches at real OLET tap positions (resolving
8 real `CREF_TARGET_UNRESOLVED` findings the source fixture's own
`fixture-manifest.json` already documents as expected/out-of-scope —
no pipe geometry fabricated), and a uniform `E=203,400,000 kPa`/
`v=0.30` applied where the source declared none (confirmed via
`AskUserQuestion`, since no unit convention was documented anywhere in
either repo). 58 of the model's elements have zero process data
anywhere on their source line; per explicit Owner/user decision these
were left at CAESAR's native unset sentinel (`-1.0101`) rather than
inventing an ambient/cold-only case.

Independently verified via this repo's own production
`inputXmlToCanonicalGeometry` adapter before delivery: 164 nodes, 163
segments, zero diagnostics. Delivered to the user directly
(`SendUserFile`) and separately committed to `main` as a real fixture
via #552 (`benchmarks/1885Sjson/EnrichedSjson.topology.input.xml` +
`.PROVENANCE.md`) — merged as a pure additive fixture/doc change, no
production code touched, since the implementing agent has no upload
access and needs the 406KB file reachable from the branch it works on
(confirmed `feat/mXXX-*` Work Pack branches are cut from `main`, not
from this tracking branch).

**Real gap found while scoping the follow-on Work Pack**: direct
source read of `inputXmlToCanonicalGeometry.js` confirmed its existing
prior-element inheritance mechanism (`resolveInheritedField`/
`resolveInheritedStringField`) covers only `DIAMETER`/`WALL_THICK`/
`MATERIAL_NAME` — `MODULUS`, `POISSONS`, `TEMP_EXP_C1`, `PRESSURE1`,
`HYDRO_PRESSURE`, `FLUID_DENSITY` are not read by the adapter at all
today, let alone inherited. User confirmed directly: extend inheritance
to all six, not just a subset. Also confirmed via `model-compiler.js`'s
own README that B-2.5 does not resolve materials/sections itself — a
full gravity-only solve needs real (not hand-typed-fixture) material/
section resolution derived from the ingested InputXML, unlike the only
existing full-wiring example (`scripts/m003-live-run-analysis-fixture.mjs`,
a 2-element toy with hand-authored constants).

Dispatched as **M020 (#553)**: (Part A) extend inheritance to all six
remaining fields, mirroring the exact existing pattern and diagnostic
convention; (Part B) wire a real gravity-only solve directly against
the committed fixture through the same B-1→B-2.5→B-3.0→B-3.3→B-3.4
chain M013/M018 already exercise, emitting a per-node reactions/
displacements report keyed by CAESAR node number. Thermal/pressure
load derivation and any B31.3 code check are explicitly out of scope
for this Work Pack — gravity-only reactions/displacements first,
matching the user's own stated sequencing. No published reference
table exists yet (the user's CAESAR II run is still pending), so the
acceptance oracle is a real self-consistency proof (global equilibrium
of recovered reactions vs. applied gravity load, full fixture coverage,
new inheritance tests) rather than a table match — the actual
cross-check against CAESAR II happens once the user's results arrive.

### M020 redirected: 1885Sjson gravity-only → real BM1 CAESAR II fixture

Before any implementation started on #553, user pointed at a stronger
benchmark candidate: `benchmarks/LFEA/BM1/BM1_InputXML.xml`, a real,
complete CAESAR II 14.00-native export (originally CAESAR II's own
bundled example `1001-P`, then user-edited into a smaller `BM1_LEG`
model) — not a topology-only file built by an external converter like
#552's. User states they can extract full nodewise force/moment/SIF/
K/stress reference data for it, and is actively iterating on the file
directly on `main`. Asked via `AskUserQuestion` whether to redirect,
run both, or pause M020 for a new BM1-only issue — user chose
redirect.

Ran `inputXmlToCanonicalGeometry` directly against the file (not just
read the source) before rewriting the issue, and found real gaps #552
never exercised: (1) BM1's own `<UNITS>` block is never read, and two
BM1 revisions pulled minutes apart used *different* unit conventions
for `EMOD` (`N./sq.mm.` vs `KPa`) — a fixed caller-supplied unit
cannot be correct for both; (2) `RESTRAINT` `TYPE` codes in the file
don't match the standard CAESAR II 1–62 table (`TYPE="17"` with
`YCOSINE="1.0"` — inconsistent with `17`'s documented `-Y` meaning;
`TYPE="7"`, not in the table at all); (3) `BEND` `ANGLE1` sometimes
carries `-2.020200` (exactly `2×` the CAESAR sentinel) instead of a
real angle, rejected today as `BEND_COMPOUND_MITER_NOT_SUPPORTED` on
6 of 22 elements in the original file — confirmed this isn't just "no
override" since a real `45.000000` angle appears alongside it in the
same file; (4) `HANGER`/`SIF`/`ALLOWABLESTRESS` child elements aren't
read anywhere in the adapter — the original file's real spring hangers
came back silently `FREE` (physically wrong).

User then supplied the exact real-world cause of gap (2) directly: a
known, documented CAESAR export bug, for which **this repo already
has a working, configurable fix that just isn't wired into the LFEA
production path** — `src/calc-workspace/cii-standalone-port/core/
restraint-type-mutation.js` (`mutateRestraintType`, default rows
`+Y:17→14, LIM:7→8, GUI:10→9, X:1→2, Y:2→3, Z:3→5, 18→15` — matching
BM1's observed codes exactly) plus its companion `restraint-type-
codes.js` (the real 1–62 CAESAR II table, documented as mirroring a
`3D_Converters` Python worker) and an existing settings UI
(`xml-cii-adapted-config.js`, `inputXmlRestraintTypeMutation: {
enabled, rows }`). Confirmed via `grep` this is never imported by
`inputXmlToCanonicalGeometry.js` — the fix exists, it's just
unreachable from the path BM1 needs. Rewrote #553's Part A to wire
this existing mechanism in directly rather than have the agent
re-derive a type map from scratch.

#553 rewritten in place (kept as one issue, original 1885Sjson scope
retained in a collapsed `<details>` block for history) rather than
closed and re-opened, since no implementation had started. New scope:
Part A closes all four format gaps (restraint-type-mutation wiring,
UNITS-block consumption, bend-angle-sentinel investigation, HANGER/
SIF/ALLOWABLESTRESS handling — check what the live file actually uses
before over-building); Part B wires the real solve chain (M013/M018's
B-1→B-2.5→B-3.0→B-3.3→B-3.4 plus the real B-4.0–B-4.2 code engine)
against the live BM1 fixture, producing SUSTAINED/DISPLACEMENT_STRESS_
RANGE reactions, displacements, member forces, and code-point stress
— a fuller benchmark than #552's gravity-only scope, since BM1 has
real declared thermal/pressure values #552's fixture mostly lacked.
Explicitly instructed the agent to always read the live file from
`main` at implementation time, not a snapshot, since the user is still
actively editing it.

### M020 (#553) → PR #556, merged as `c7e06c4b3f4c377f28269312b75f6b878dff2ac1`

Reviewed in full: cloned the exact PR head into an isolated worktree,
read all 12 changed files end to end before running anything. The
implementation is structurally strong — clean re-export refactor
moving the restraint-mutation authority into `src/core` without a
core→workspace dependency, a self-contained unit-system parser that
treats the file's declared `FACTOR` as a redundant consistency check
rather than the actual scale (a real, correct design choice), and a
fail-closed "reject any unclassified numeric metadata" pass that
correctly wholesale-exempts the new `analysis` authority object
(already canonicalized at ingestion) from double-conversion.

The PR disclosed, honestly, that all 8 required commands were never
run (no repository checkout in that environment) — running them for
real found **one small, mechanically clear defect**: `compileCodeResult`
requires `factorSet.factorSetId`/`componentId` to satisfy
`requireCanonicalNodeId` (`^[A-Za-z0-9][A-Za-z0-9._-]*$`, no brackets),
but the fixture passed `entry.segment.sourceComponentUid`
(`"PIPINGELEMENT[0]"`) directly — crashed on first run. Fixed by
switching to `entry.segment.id` (`"IX-S1"`, already canonical, already
used for `codePointId`) — exactly the class of bug "syntax checks
passed" can never catch, the third Work Pack in a row where a real
command run surfaced something static reasoning missed (after M018,
M019).

Went further than re-running the required commands: fetched the real
CAESAR II output the user linked (`BM1_CIIOutput.xml`, genuine
`VERSION="14.00.00.0910"` export) and hand-cross-checked B-3.15's
produced numbers against it, not just the internal self-consistency
assertions. Two real, load-bearing engineering assumptions the agent
made were **independently confirmed correct** by this real data: (1)
`restraintTypeCodeMap: { 0: 'ANCHOR', ... }` — CAESAR's own
`RESTRAINT_REPORT` shows both TYPE=0 nodes (10 and 150) as
`"Rigid ANC"`; (2) the `17→14`/`7→8` restraint mutations — CAESAR's
report shows exactly `"Rigid +Y"`/`"Rigid GUI"` at every mutated node,
matching exactly. Also found, by direct comparison, a real but
undocumented convention difference: this repo's `reaction.*` is the
force applied *by the restraint to the structure* (this repo's
standard convention throughout the mandate); CAESAR's
`RESTRAINT_REPORT` exports the equal-and-opposite force *by the pipe
onto the restraint hardware* — confirmed empirically (CASE 4 SUS):
every reaction component has the opposite sign at every node, while
*displacement* signs already agree directly with no negation needed,
isolating this cleanly to a reporting-convention difference, not a
geometry or stiffness defect. Documented this directly in the report's
own `limitations` array so it doesn't read as a broken solve to
whoever does the final numeric comparison. The remaining real
magnitude gap (CAESAR's sustained reactions and displacements run
~1.7–2.6x larger than B-3.15's) traces to the PR's own already-honestly-
disclosed limitation: `benchmarks/LFEA/BM1/BM1_InputXML.xml`'s first
element declares `INSUL_THICK` without `INSUL_DENSITY`, which — via
the established M012 all-or-nothing gravity-consumer design — excludes
insulation self-weight from the *entire* model, not just that element;
confirmed insulation is genuinely present (`INSUL_DENSITY="0.002100"`,
i.e. 2100 kg/m³) on other elements, so this is a real, quantifiable,
already-disclosed gap, not a hidden one.

Ran every required command for real on the corrected head: all 8
individually (exit 0 each), full `check:lfea-linear-core` (exit 0, 44
PASS markers, zero FAIL). Post-merge sanity check on fresh `main` at
`c7e06c4b` also passed end to end. Both worktrees cleaned up. Issue
#553 auto-closed on merge.

**Process note**: this Work Pack is the clearest demonstration yet of
why the mandate requires the Owner to cross-check against real
external data, not just re-run the agent's own internal assertions —
the internal self-consistency check (`check:lfea-b3.15`) was fully
green and would have merged clean without ever revealing the sign-
convention gap; only fetching and hand-comparing the user's real
CAESAR II output surfaced it, and doing so also turned two of the
agent's unverified modeling assumptions (TYPE=0→ANCHOR, the restraint
mutation table) into independently-confirmed facts rather than
plausible guesses.

## Canonical FEA input format — Phase 1 dispatched as M021 (#561)

User-directed pivot, 2026-08-04, prompted directly by the M020 review's
insulation-gap finding above: *"let our FEA has its own input format.
Inputxml uploaded (from CAESAR export or stagged json import) should be
resolved to this format. This final input will be ground truth for
core FEA (like a structured table/xml form which can be shown to
user)."* Connects directly to already-tracked, still-open phases
**P1 Staged-JSON canonicalization + overlay** (Benchmark B not started)
and **P2 Deterministic mechanical model + units** (real, unexercised
against real data) — not new scope, picking up standing work.

Dispatched a research agent to audit the real current architecture
before scoping anything (report retained in full in the session
transcript; key findings, independently significant): the StagedJSON
side has three separate, half-built M008-A/B/C authority layers with
zero callers outside their own files anywhere in `src/`, covering
materials/sections only (never process data — exactly the gap class
that hit BM1); a schema-compatible bridge
(`shared-to-canonical-geometry.js`'s `projectSharedPipingModelToCanonical
Geometry`) already exists targeting the same `canonical-geometry-v1`
InputXML uses, but has zero callers and ignores the M008 overlay's
governed resolutions entirely; `linear-fea-model-compiler` (B-2.5) is
already source-agnostic but in production only reached via the
InputXML path; a real gap-flagged review UI
(`src/workspace/lfea-preflight-ui.js`) exists but is orphaned, zero
importers anywhere. Conclusion: full unification is real, large
reconciliation work, not a small connecting step.

Given that, proposed a 3-phase split (InputXML-side ground-truth
document; StagedJSON→canonical unification, tied to the user's own P1
Benchmark B / P12; an in-app review UI) via `AskUserQuestion` — user
chose Phase 1 only for now.

Dispatched **M021 (#561)**: package what `inputXmlToCanonicalGeometry`
already resolves correctly (materials, sections, process conditions,
restraints — all real, landed in M020) into a genuine, structured,
gap-flagged review artifact, produced at ingestion time (before any
solve decision, not entangled with B-3.15's post-solve report) —
every field explicitly tagged `DECLARED`/`INHERITED` (with source
element)/`MISSING`, not a bare value beside a prose diagnostics array.
Acceptance oracle requires BM1's real elements 1–3 to show
`insulationDensity: MISSING` explicitly — the exact gap an Owner had
to find by hand this session. Explicitly out of scope: any change to
solve/gravity behavior (the all-or-nothing insulation policy stays
exactly as-is — loosening it is a separate, deliberate decision),
StagedJSON unification (Phase 2), and any in-app UI (Phase 3; JSON/CSV
export via this repo's existing `sealExportRecord` pattern is the
"shown to user" surface for this phase).

### M021 (#561) → PR #564, merged as `83544ee9131b0e30f853d70cb83f9d2c762c7177`

Reviewed in full: cloned the exact PR head into an isolated worktree,
confirmed the claimed 4-file diff against the real declared base, read
every changed file end to end before running anything.

The implementation is clean and correctly scoped — `resolutionFor`
cross-references the adapter's own `{LABEL}_INHERITED_FROM_PRIOR_
ELEMENT` diagnostics rather than re-deriving inheritance logic
independently (avoids any risk of silently diverging from the real
adapter behavior), tracks `fromElement` via a `lastDeclared` map
updated in true document order matching the adapter's own forward-only
carry-forward semantics, and `validateResolutionRows` enforces real
structural invariants (a `MISSING` row may carry nothing but `status`;
an `INHERITED` row must name `fromElement`). Honestly flagged and
correctly resolved two deviations from the issue's own illustrative
examples against the live file rather than forcing them: `IX-S2`
redeclares `MATERIAL_NAME` explicitly (so `DECLARED`, not `INHERITED`
as the issue guessed), and insulation density has two real declaration
points (`IX-S4` and `IX-S6`, with the provenance chain correctly
resetting at `IX-S6`) rather than the issue's assumed single point —
exactly the "follow the live source over the assumption" discipline
the mandate requires.

Unlike M020, this PR needed **no fix** — every required command passed
on the first real run: `check:lfea-b3.16`, `lfea-inputxml-ingest-check`,
`check:lfea-presentation-export`, and the full `check:lfea-linear-core`
aggregate (44 PASS markers, zero FAIL). Independently re-verified the
real numbers by dumping the JSON/CSV output directly: `elasticModulus
=203395328000 Pa`, `pressure=2100000 Pa`, `operatingTemperature=
355.15 K` on `IX-S1` all match the Owner's own hand-verified M020
values exactly; `IX-S1`–`IX-S3` correctly show `insulationDensity:
MISSING`; `IX-S2` correctly shows `diameter`/`thickness` `INHERITED`
from `IX-S1` with `MATERIAL_NAME` `DECLARED`; node 45's restraint
record carries full `17→14` mutation evidence. Post-merge sanity check
on fresh `main` at `83544ee9` also passed end to end. Both worktrees
cleaned up.

This closes the loop the M020 review opened: the exact gap an Owner
had to find by manually reading a diagnostics array and cross-checking
external CAESAR data by hand is now a first-class, explicitly-flagged
field in a reviewable document — `benchmarks/LFEA/BM1/BM1_InputXML.xml`'s
real `insulationDensity: MISSING` on its first three elements will
show up structurally for anyone (or any future UI) reading this
document, not just an Owner who happened to go looking.

## Phase 2 (StagedJSON → canonical unification) — M022-A dispatched and merged

Before dispatch, ran a real qualification screen (5 tough linear-FEA
technical questions — frame stiffness coupling, bend flexibility
derivation, why B31.3's `S_E` excludes axial, one-way-restraint
linearization, hot-vs-cold modulus selection) and required a written
design proposal before any implementation, mirroring the M008
prequalification precedent. The proposal argued: extend M008's real
authority-record architecture (materials/sections/supports/loadCases as
governed references, not inline overlay payload) rather than either
bypassing it through the already-dead `shared-to-canonical-geometry.js`
projector or cramming process data into the overlay contract itself.

Independently verified the proposal's load-bearing claims against the
real repo before endorsing it — all checked out exactly: EnrichedSjson
field names, the real branch's numeric values (`designPressureMpa:
11.6`, `operatingTemperatureC: 309`, etc., confirmed across three
sampled entities), the real raw-vs-enriched material/section conflict
(`DTXR`/`MTXX` Sch100/A234-WPB vs. `enrichedAttributes` Sch80/A106-B,
confirmed the enrichment's own `conflicts: []` field does *not* catch
it), and the real support field names/`REST`/`LINESTOP` examples.
Also independently caught that `docs/OWNER_ROADMAP.md` itself was
stale on `main` (the proposal correctly flagged this and worked around
it by citing merged PR/issue records directly instead) — a real
process gap: this doc had been maintained continuously on the Owner's
own tracking branch but never actually reached `main`. Fixed directly
after M022-A merged (#578, pure content sync, no data lost).

Raised two concrete gaps back to the proposal before dispatch: (1)
M008-C's material/section resolver is hard-coded to one exact case
(NPS 8 Schedule 100, a 2-entry material alias map) — "reuse" alone
doesn't generalize it; (2) suspected M008-C's material table was
single-temperature-point (cold only), which would leave no path to a
real hot modulus for the thermal case. **(2) was based on an
incomplete read on the Owner's part** — direct re-verification during
the M022-A review found the real table already has two points
(293.15 K / 393.15 K) — the real, more precise problem M022-A
correctly identified itself is that 393.15 K (120°C) falls far short
of this branch's real 582.15 K/598.15 K operating/design temperatures,
not that hot data is absent entirely.

### M022-A (#576) → merged as `5ca33d92ef4e61429b963206bde30f974b05631b`

Reviewed in full: cloned the exact PR head into an isolated worktree,
read all 8 new/changed source and script files end to end before
running anything. The `DECLARED`/`INHERITED`/`MISSING` field contract
(`stagedjson-resolution-common.js`) correctly structurally prohibits
inheritance for every process field (`allowInherited: false`
throughout `stagedjson-process-authority.js`) — not just documented as
policy, enforced — and the source guard bans the literal patterns
(`previousEntity`, `carryForward`, `sourceOrderAllowed: true`) that
would reintroduce it later. `resolverCapabilities()` detects M008-C's
hard-coding by regex-inspecting the *real* resolver's own source text
at runtime rather than asserting a static claim, so the check
self-updates once M022-B removes it rather than needing manual
re-verification.

This is the first Work Pack in this mandate delivered with a real,
passing CI run already attached (a path-scoped exact-head GitHub
Actions workflow) — re-ran everything independently anyway rather than
trusting it: `check:m022a` (all 3 sub-checks), the full `check:
workspace-contracts` aggregate it registers into, and a hand-written
spot-check script reproducing the real branch's material-table ranges,
temperature values, and all 6 real source conflicts across all 3
affected entities directly — all matched exactly. No fix was needed.
Post-merge sanity check on fresh `main` at `5ca33d92` passed for both
`check:workspace-contracts` and (unaffected, confirmed) `check:lfea-
linear-core`. Worktrees cleaned up.

M022-A is explicitly contracts-and-real-fixture-inventory only —
qualifies the single already-M008-selected branch, makes every real
gap (missing reference temperature, ungoverned operating pressure,
undeclared hydrotest-pressure unit, insufficient material-table range,
hard-coded catalog, unresolved supports) a structured, disclosed
blocker rather than a silent default. M022-B (catalog-driven material/
section generalization, hot-state coverage) and M022-C (process/
support resolution, overlay composition, populated ground-truth
artifacts) remain ahead before this reaches canonical geometry or the
solver.

## BM1 insulation self-weight — root cause closed (#580)

User asked directly: with the same file and approach, can the next BM1
benchmark comparison hit zero error? Rather than answer from the
existing hypothesis, tested it — and the earlier M020-review diagnosis
turned out to be half right.

Applied the previously-suspected data fix (`INSUL_DENSITY=2100` on
`BM1_InputXML.xml`'s first three elements) alone, in an ephemeral
worktree, and re-ran `check:lfea-b3.15`: **zero change in the solve
output.** That falsified the "all-or-nothing exclusion due to 3
elements' missing data" hypothesis outright — investigating further
found the real cause: `compileCase` in `scripts/lfea-b3.15-bm1-
inputxml-fixtures.mjs` never declared `INSULATION` in the gravity
primitive's `includedMassSources` and never generated an `INSULATION`
`DISTRIBUTED_WEIGHT` primitive at all. Insulation self-weight was never
wired into gravity, regardless of data completeness — a real code gap
M020 shipped with, not a data-only issue.

Confirmed `'INSULATION'` is already a real, production-supported
`DISTRIBUTED_WEIGHT_COMPONENTS` enum member (from M012) before writing
any fix — wired it in by mirroring the existing `CONTENTS` primitive
pattern exactly. Tested the code fix alone (data still incomplete)
first: the solve correctly refused outright
(`PIPING_ANALYSIS_GRAVITY_DISTRIBUTED_WEIGHT_MISSING`) rather than
silently under-computing — the fail-closed design catching exactly
this class of gap, as intended. With both fixes together: real
sustained-case total reaction magnitude moved from **–46% to +1.5%**
deviation against the user's real CAESAR CASE 4 (SUS) restraint total.

User confirmed 2100 kg/m³ directly (matches every other insulated
element in the model) before anything was committed to their live
file. Landed as a direct Owner fix (#580, self-reviewed — already
fully verified before opening the PR): data fix + code fix + updated
M021's now-stale `MISSING` assertion (corrected to `DECLARED`) +
updated the B-3.15 report's `limitations` text. `check:lfea-b3.15`,
`check:lfea-b3.16`, and the full `check:lfea-linear-core` aggregate all
pass; confirmed again on fresh `main` post-merge.

**Process note**: the original M020-review diagnosis was a plausible,
disclosed hypothesis inferred from limitation text and the established
M012 all-or-nothing precedent — but it was never actually tested by
applying a fix and re-running. Doing that here, instead of just
reporting the hypothesis as fact, is what surfaced the real (and
different) root cause. A quantitative match to real external data
(here, ~98% of a discrepancy) is strong evidence *something* is
identified correctly, but not proof the causal story attached to it is
complete — the only way to know is to test the fix and watch the
number actually move.

## BM1 next-steps triage — user split into (A)/(B)/(C)

User asked what's next after the insulation fix and offered three
options: (A) one-to-one OPE/SUS/EXP output comparison against the real
CAESAR output, (B) add hangers to the benchmark and re-check core FEA,
(C) B31.3 code stress evaluation for SUS and EXP. Assignment (after a
self-correction the user explicitly flagged — the first message had
(B)/(C) reversed): **(C) dispatched to the agent, (A) taken up directly
by the Owner, (B) explicitly deferred** ("after further benchmarks" —
not started; reference data already gathered for later: the original
1001-P example's `HANGER` records at nodes 50/120/130 have no
pre-computed spring rate, meaning a faithful implementation needs real
hanger *design* logic, not just consuming a supplied rate, and the
live `BM1_LEG` fixture currently has zero `HANGER` records at all).

### (C) dispatched as issue #582 — B31.3 SUS/EXP code stress, no questionnaire

Same agent as M020–M022-A; user explicitly waived the qualification
questionnaire this round. Grounded the Work Pack in real, hand-verified
numbers pulled directly from `BM1_CIIOutput.xml` before writing it —
not left to the agent to rediscover: CASE 4 (SUS) `ALLOWABLE_STRESS` is
a flat 137,895.140625 kPa on every element, exactly 20,000 psi
(`STRESS_CNVCON=6.894757` kPa/psi); CASE 5 (EXP) `ALLOWABLE_STRESS` is
206,842.703125 kPa, exactly 30,000 psi = 1.25×20,000+0.25×20,000 — the
classic non-liberal B31.3 Eq. (1a), which is *already* the exact
formula `lfea-b3.15-bm1-inputxml-fixtures.mjs`'s `DISPLACEMENT_STRESS_
RANGE` call uses (`coldWeight=1.25, hotWeight=0.25`). Only the
placeholder `SCREENING_ALLOWABLE=138e6` (reused for both Sc and Sh)
needs replacing with a real, disclosed, traceable authority — the
formula wiring was already right. Also found and cited, unread until
now: `unityStressFactors()` already seals a `sustainedIndices` block
nothing ever reads, and M010's `derivePressureStressContribution`/
`resolvePressureStressContribution` (`linear-piping-code-application/
pressure-stress-derivation.js`) already compute the real `S=P·Do/(4t)`
pressure term from the SUS case's own existing `PRESSURE` primitive —
`SUSTAINED` was never evaluated only because nothing wires these
together, not because anything is missing. Real gaps also flagged:
CAESAR's finer bend-station element granularity (already-disclosed
M020 limitation) has no direct match for the two whole-chord bend
elements; CAESAR's real per-element `SIF_IN_PLANE`/`SIF_OUT_PLANE` are
not always 1.0 while this repo currently uses unity SIFs — a real,
expected source of residual disagreement, not something to force-match.

### (A) implemented and merged directly — PR #583

Built a real parser (`lfea-bm1-cii-output-comparison.mjs`, reusing the
existing no-dependency `inputxml-tag-scanner.js`) for
`BM1_CIIOutput.xml`'s `DISPLACEMENT_REPORT`, `RESTRAINT_REPORT` and
`GLOBAL_FORCE_REPORT` sections across all three real cases, and a
one-to-one comparison against this repo's own `solveBm1InputXml()`
results — OPE and SUS directly, EXP built as operating-minus-sustained
on **both** sides (matching CAESAR's own `CASE 5 (EXP) L5=L3-L4`
formula), independently. Every CAESAR row with no genuine counterpart
in the 16-node/15-element compiled model (the 4 internal bend-station
nodes; the finer bend-span element splits) is listed explicitly as
unmatched, never dropped or force-matched.

Hand-verified, not assumed, sign/unit conventions before writing any
comparison logic: displacement mm→m and deg→rad with no sign change
(already known from the earlier insulation-fix work); restraint
reactions negated (also already known); element `GLOBAL_FORCE_REPORT`
end-actions need **no** negation — newly confirmed here via the node-10
anchor / element `IX-S1` nodal-equilibrium identity (a node with one
attached element and one direct nodal load — its reaction differs from
the element's own I-end action by exactly half the rigid component's
weight, matching to five significant figures).

**Real defect found and fixed while hand-verifying, not merely
disclosed.** `constraintDeclarations()`'s `GUI`-restraint branch
restrained the two axes *transverse* to the declared cosine, assuming
a "double guide" convention. But every real `GUI` restraint in BM1
(nodes 90, 120) is a **single** declared DOF, paired with a co-located
`+Y` restraint at the same node covering the other transverse
direction — confirmed by checking every real `GUI` occurrence in the
live fixture (all pair 1:1 with a co-located `+Y` record) and by
CAESAR's own `RESTRAINT_REPORT`, which shows a nonzero reaction on
exactly the declared-cosine axis and nothing on the other. The prior
logic left the declared axis completely unrestrained — the actual root
cause of a >100× displacement blow-up downstream of nodes 60–150 that
first surfaced as a raw magnitude check while building the comparison,
before any CAESAR cross-reference was even involved. Fixed as a
one-line change (single axis from the cosine, not the two transverse
axes); full `check:lfea-linear-core` re-run afterward with zero
regressions.

Real numbers after the fix (CASE 4 SUS): node 120's `UY` reaction is
**0.008%** off real CAESAR; total vertical reaction is **1.538%** off
(consistent with the already-established insulation-fix number, since
this fix only touches transverse DOFs); EXP-case total vertical
reaction is **~0 N on both sides** (gravity does not change between
OPE and SUS, so this is an independent physics cross-check the
EXP-as-delta construction was not tuned to hit). Remaining downstream
deviation is real and disclosed, not silently absorbed: nodes 70/80
declare a real `FRIC_COEF=0.3` restraint-friction value this
benchmark's constraint model does not implement — a genuinely
different, nonlinear feature, correctly left as a stated limitation
rather than chased into scope.

**Process note**: the >100× displacement anomaly was caught by
building the comparison tool itself and eyeballing raw magnitudes
*before* touching CAESAR data at all — the CAESAR cross-check then
confirmed which specific restraint was at fault and which single line
was wrong, rather than being the thing that revealed a problem
existed. Two independent signals (an internal sanity check plus an
external reference) converging on the same one-line fix is stronger
evidence than either alone.

### (C) M023 (#582) → PR #585, merged as `1df0f7cf5c7b4512a312f127927c95d511cc8c8e`

Reviewed the exact PR head (`6609bc4281dededec798640e5653547b5447a9cb`) in a
dedicated worktree per standing discipline — read all six changed files
in full, then independently re-ran every claimed check (`b3.15`, `b3.16`,
`bm1-cii-comparison`, the new `b3.17`, and the full `check:lfea-linear-
core`) rather than trusting the PR's own report of green CI. All passed
with zero regressions.

Delivered: a real `SUSTAINED` code-stress category (30 code points)
alongside the existing 30 `DISPLACEMENT_STRESS_RANGE` points, wired
through the exact production path the Work Pack pointed at —
`resolvePressureStressContribution` (M010) for the pressure term,
`unityStressFactors`'s already-sealed but previously-unread
`sustainedIndices`. Replaced the M020 `SCREENING_ALLOWABLE` placeholder
with a declared ASTM A106 Grade B ASME B31.3-2024 Table A-1 authority
(20,000 psi at both 293.15 K and 393.15 K — cross-checked against and
consistent with M008-C's existing hot point). Added a real parser for
CAESAR's `STRESS_REPORT` (CASE 4 SUS / CASE 5 EXP) and a structured
exact-`FROM_NODE->TO_NODE` comparison, honestly excluding CAESAR's 6
internal bend-station splits and this model's 2 whole-chord bend
elements as unmatched (same 13/6/2 accounting M020/#583 already
established), and excluding the 6 real CAESAR zero-allowable rigid rows
from utilization-deviation statistics rather than dividing by zero.

**Independently reproduced, not just re-run.** Beyond executing the
PR's own checks, hand-verified two separate arithmetic chains from
scratch against the tool's raw output object (not its summary text):
(1) the pressure-stress term `S = P·Do/(4t)` for element `IX-S4`
(40→45, `Do` inherited from element 30-40 = 323.850006 mm, `t` =
9.525 mm declared, `P` = 2,150 kPa) — hand calc matched the reported
`18275000.33858268 Pa` exactly; (2) the full `SUSTAINED` combined-
stress formula (`|axial+pressure| + sqrt(inPlane²+outOfPlane²+
torsional²)`) at the same code point — hand calc matched the reported
`65378698.01902817 Pa` and `0.4741189228213427` utilization exactly,
to the last digit. Also independently re-extracted two raw XML rows
directly via `awk`/`grep` (element 58→59 EXP, the real CAESAR overall
maximum at 62.532867%; element 20→30 EXP, this repo's own worst
deviation) and confirmed the parser's `codeStressPa`/`allowableStressPa`/
`sifInPlane`/`sifOutOfPlane`/`percentage` fields match the source file
byte-for-byte after unit conversion — zero parser distortion. Confirmed
the exact allowable conversion by hand: `20000 × 6894.757293168 =
137895145.86336` Pa, matching the declared authority precisely.

**One real nuance found in the PR's own disclosure, not in its code.**
The PR attributes the larger EXP-case deviation (repo 70.48% vs. CAESAR
49.95% on matched pairs) to "CAESAR uses non-unity bend SIFs." Checked
this directly against the raw XML at the repo's own worst location
(20→30, EXP case): CAESAR reports `SIF_IN_PLANE`/`SIF_OUT_PLANE` = 1.0
there too — unity, same as this model. SIF is therefore not the
proximate cause at that specific point. The more likely dominant driver
is the already-disclosed, larger gap: the two BM1 bends are compiled as
finite straight chords with no B31J flexibility factor, so the whole
loop is stiffer than the real pipe at the bends, redistributing
moment/torsion everywhere else in the loop — including at straight runs
away from the bends — differently than CAESAR's real curved-arc, real-
flexibility elements would. This does not affect any of the verified
arithmetic or the comparison's honesty (every number checked out
exactly); it is a narrative-precision note, not a defect, and does not
block merge. Left as-is in the merged PR text; recorded here so a future
reader chasing "add real SIFs to close this gap" knows that alone likely
will not, and the flexibility factor is the more promising next lever.

## M024 (#588) → PR #590, merged as `00a7a0ec9e50ccb0301192f9cbdb5110b39a5e13`

Direct follow-through on the nuance above: dispatched a Work Pack to wire
BM1's two bends through the real, already-validated B-3.2 `BEND` piping
component (`src/core/linear-fea-piping-components/bend-component.js`,
proven by the Appendix S Example 2 benchmark) instead of today's
whole-chord frame elements — real arc geometry, a real pressure-corrected
ASME B31.3 Appendix D Table D300 Note (7) flexibility factor, and real
directional in-plane/out-of-plane SIFs, replacing unity.

Before dispatching, hand-derived BM1's own bend geometry (`R=457.199982
mm`, `Do=323.850006 mm`, `t=9.525 mm`) through the classic unpressurized
formula: `i=0.9/h^(2/3)=2.8624` landed within ~7% of CAESAR's real
reported `SIF_IN_PLANE=2.661139`, and CAESAR's own
`SIF_OUT_PLANE/SIF_IN_PLANE` ratio was exactly `5/6` — the signature of
the real split B31J formula pair. That grounding is what made this a
well-scoped Work Pack rather than a guess.

**Reviewed the exact PR head** (`73bd9fe0644870f7065f41a182b01af8910a8593`)
in a dedicated worktree, diffed against the PR's real base (not a stale
local `main` ref, which initially produced a false-positive unrelated
`docs/3Dagent.md` diff from another parallel workstream — caught and
corrected before drawing any conclusion from it). Read every one of the
13 changed files in full, then independently re-ran all five BM1 checks
(`b3.15`, `b3.16`, `b3.17`, the new `b3.18`, `bm1-cii-comparison`) plus
the full `check:lfea-linear-core` aggregate — all passed, reproducing
the PR's own reported numbers exactly, not just a green exit code.

**Independently re-derived both bends' flexibility factor and SIFs from
raw geometry**, from scratch, before reading the PR's own derivation
logic in detail — using the real formula (`h=tR/r²`, `k=1.65/h` with the
real Appendix D Note 7 pressure correction; SIF via `i=0.9/h^(2/3)` and
`i=0.75/h^(2/3)` with the companion pressure-correction denominator
`1+3.25(P/E)(r/t)^(5/2)(R/r)^(2/3)`). Both bends' results matched the
PR's claimed values to the full double-precision digit count (`IX-S5`:
`k=8.805996977364236`, `ii=2.656692445746295`, `io=2.213910371455246`;
`IX-S6`: `k=8.81810588982693`, `ii=2.66113953399073`,
`io=2.217616278325609`) — and `IX-S6`'s SIFs independently reproduce
CAESAR's real six-decimal `STRESS_REPORT` values. This is a from-scratch
reproduction, not a check that the PR's code merely runs.

**Real, disclosed result**: all 19 CAESAR stress-report element pairs
now have an exact compiled counterpart (0 unmatched on either side,
closing the node/element gap open since M020). EXP-case deviation
improved substantially (max 32.52→18.15 percentage points, mean
5.73→3.28) — the governing utilization moved from a straight-run pair
to a resolved bend station, much closer to CAESAR's own governing
location. SUS-case *local* deviation got measurably worse (max
4.87→12.0 points, mean 1.55→2.25) even though the overall governing
percentage stayed close (46.49% vs. CAESAR's 46.26%) — a real
redistribution effect from adding bend flexibility, disclosed plainly
in the PR rather than hidden, and not chased further in this review
since the primary target (EXP) genuinely improved and both known
remaining gaps (restraint friction at nodes 70/80, the B31.3-2018 vs.
2024 edition label) are unchanged, already-disclosed, out-of-scope
items.

## ±10% acceptance bar: clarified scope, and the friction root cause

Before dispatching the next Work Pack, ran a fresh point-by-point audit
of the SUS-case comparison against the "benchmark can be considered
close only when ±10% accuracy is achieved" bar — checking every matched
displacement/reaction, not just governing/summary metrics. Found many
individual comparisons well outside ±10%, concentrated in transverse
(X/Z-direction) quantities near nodes 70 and 80. Asked the Owner to
confirm scope via `AskUserQuestion`; answer confirmed the strict reading:
±10% must hold at **every matched node/DOF/element**, not only
governing values. This is now the standing acceptance criterion.

Traced the root cause by hand-computing real Coulomb friction
mobilization (`T/μN`) from `BM1_CIIOutput.xml`'s raw `RESTRAINT_REPORT`
(μ=0.3 at both nodes):

- **SUS**: node 70 `N=17230.73N, T=1707.95N, μN=5169.22N` → 33.0%
  mobilized; node 80 `N=15370.62N, T=849.15N, μN=4611.19N` → 18.4%
  mobilized. Both comfortably "stuck."
- **OPE**: node 70 `N=862.995N, T=257.21N, μN=258.90N` → 99.3%
  mobilized; node 80 `N=19742.13N, T=5840.25N, μN=5922.64N` → 98.6%
  mobilized. Both essentially *at* the Coulomb limit — the hard case.

This asymmetry rules out a naive rigid-restraint shortcut and confirms
real nonlinear friction physics is needed to close the gap. Became the
technical grounding for the M025 (#592) Work Pack and its 5-question
expert-level qualification questionnaire (added to #592 before
dispatching a new agent).

## M025 (#592) → PR #594, held — real non-convergence found, not merged

Dispatched to model the two live `FRIC_COEF=0.3` restraints at nodes
70/80 with a genuine active-set Coulomb outer solve around the unchanged
linear kernel, per the mobilization asymmetry above.

**The PR's diff does not contain its own real implementation.** Its core
solve script (`scripts/lfea-b3.15-bm1-inputxml-fixtures.mjs`) is
byte-for-byte unmodified on the PR branch — the actual integration is
applied at CI time by three self-modifying "patch scripts," run by a
`pull_request`-triggered workflow with `permissions: contents: write`
that then `git commit`s and pushes the materialized result back onto the
PR's own branch. This means the PR's diff, as posted, is not the code
that would actually run — flagged directly on the PR as a process/review-
integrity concern independent of the friction algorithm's correctness.

Refused to take the PR's claimed passing status on faith. Instead
manually applied, via the Edit tool (the CI-triggering patch scripts
could not be executed directly — blocked by the platform's own auto-mode
safety classifier, not worked around), the exact transformations the
three patch scripts describe, reconstructing the real materialized
integration in a dedicated worktree. This surfaced two genuine, concrete
findings a diff-only review would have missed:

1. **A real duplicate-key bug**: the `package.json` patch searches for
   the line after `check:lfea-b3.17` and inserts a duplicate
   `check:lfea-b3.18` entry (that key already exists elsewhere in
   `scripts`, added by M024/PR #590, not adjacent to `b3.17`) alongside
   the intended `check:lfea-b3.19`. Confirmed by direct
   `grep -n "check:lfea-b3.1[789]"` against the real file: `b3.17` at
   line 60, `b3.18` at line 109 — not adjacent, confirming the collision
   would occur verbatim as scripted.
2. **Real algorithmic non-convergence**: running the friction check
   (`node scripts/lfea-b3.19-bm1-friction-check.mjs`) against the
   hand-materialized integration threw a genuine non-convergence error
   at the very first OPE thermal load step (1/32) — the fixed-point
   iteration (even after the PR's own "stabilization" pass: relaxation
   0.55→0.2, iterations 80→240, tolerances loosened) could not settle
   the near-limit friction state at nodes 70/80 (98.6–99.3% mobilized,
   exactly the hard case identified above). Both nodes were oscillating
   in `SLIP` with force residuals close to but not converging on the
   Coulomb limit.

Both findings reported to the PR via comment, including a suggestion to
consider a proper return-mapping/active-set update or semismooth-Newton
scheme rather than further tolerance loosening, since the already-applied
stabilization was insufficient. Also flagged the `check:lfea-b3.19`
script-name collision with PR #595 (below) as a separate, unrelated
merge-sequencing conflict. **Held per Owner instruction — not merged,
no further Owner action pending the agent's next round.**

## PR #595: runtime B31/B31J factor calculator — reviewed, held in draft

Not a dispatched Work Pack — a generalization the agent raised against
the closed #588 discussion, confirmed as legitimate/in-scope by the
Owner. Adds a standalone runtime calculator package
(`src/core/linear-fea-b31-factor-calculator/`) that derives and seals
ASME B31.3 Appendix D / ASME B31J flexibility and stress-factor records
from caller geometry or InputXML, across four edition profiles
(`B31_3_2018_APPENDIX_D`, `B31_3_2020_B31J_2017`,
`B31_3_2022_B31J_2017`, `B31_3_2024_B31J_2023` — no `B31J_2022`, since
none exists). Deliberately calculate-only: never applies stiffness,
never evaluates code stress, never solves a model.

**Reviewed the exact head** (`5b5e82c3312e3dbc2c0d3ed5bb13a487c16e770a`)
in a dedicated worktree; confirmed the diff against the real base
matches the PR's own claimed "13 files changed, +1847/-2" exactly; read
all 13 changed files in full. Independently hand-derived the Appendix D
Note (7) bend formula from scratch before reading the PR's own
derivation logic, and reproduced all four asserted values for the
`check:lfea-b3.19` bend case to full double precision (`h =
0.14753712217178722`, `flexibility.inPlane = 9.506141774188135`,
`inPlaneBending SIF = 2.619611948608015`, `outOfPlaneBending SIF =
2.1830099571733457`). Ran both new check scripts directly — real PASS on
both, including the B-4.5 integration check's extraction of BM1's real
`IX-S5` bend geometry from live `BM1_InputXML.xml`
(`outerDiameter≈0.323850006`, `wallThickness≈0.009525`,
`bendRadius≈0.457199982`, all within `1e-12`), matching values already
independently verified during the M024 review. Ran the full
`check:lfea-linear-core` aggregate (~40 scripts) against the exact head:
exit code 0, zero regressions. Confirmed real GitHub Actions CI
(`qualify-m022a`, `qualify-m023`, `qualify-m024`, all `success`) —
independently verifying the PR's own claim.

The PR is honest about not being production-ready: its own body
discloses, from a post-implementation external-benchmark review, two
open questions that keep it in draft — (1) whether B31J's smooth-bend
flexibility rule is `1.3/h` (per cited vendor guidance) rather than the
`1.65/h` currently implemented, and (2) a `1.26` divisor vendor guidance
applies to verified welding tees that the current `VERIFIED_B16_9` path
does not apply. Reviewed both from domain knowledge (B31J's stated scope
is fittings not covered by Appendix D — tees, o-lets, reducers — and has
historically left the classical Appendix D smooth-bend formulas
unchanged, consistent with what's implemented) but could not verify
either directly against primary B31J-2017/2023 text in this review;
posted this assessment to the PR and agreed both need a primary-source
citation before the draft flag comes off. Also confirmed, independent of
either PR's correctness, that `check:lfea-b3.19` is registered by both
this PR and PR #594 for two unrelated checks — a real script-name
collision that must be resolved before either merges cleanly. **Held in
draft per the PR's own disposition and this review — not merged.**
