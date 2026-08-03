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
| P5 Load-calculation engine | Contract-level only in places (gravity/thermal/pressure) | — |
| P6 Sparse assembly, solve, instability diagnostics | Solve done; assembly still dense (disclosed) | M002 |
| P7 Member-force and stress recovery | Force recovery done; stress recovery unverified | — |
| P8 Extrema and envelopes | Partial (governing-case tracking proven) | — |
| P9 Professional analysis UI | Partial (Run Analysis trigger exists, no authoring UI) | M003 |
| P10 Professional results UI + exports | Partial (text/table only for Stack C) | M003 |
| P11 Closed-form + convergence qualification | 8/20 mandate cases verified, growing | M004 (in progress) |
| P12 Real 1885 end-to-end qualification | Blocked on P1 Benchmark B | — |
| P13 Independent/commercial comparison | Not started | — |

## Work Pack log

| Mission | Issue | PR | Status | Summary |
|---|---|---|---|---|
| M001 | #407 | #406 | Merged | Corrected benchmark discrepancy; real Benchmark A source ingestion; P0 audit; removed 95 obsolete CI workflows |
| M002 | #409 | #428 | Merged | Sparse Cholesky/LDLT replaces dense as production default solver backend |
| M003 | #412 | #417 | Merged | Real in-browser Run Analysis trigger for the piping production solve chain |
| M004 | #429 | — | In progress | Closed-form simply-supported beam (centre load, UDL) added to b3.x suite |
| M005 | TBD | — | Next | Sparse assembly + sparse qualification matVec (closes M002's disclosed limitation) |

## Recommended forward sequence

**M005** (no prequalification — precisely scoped by M002's own disclosed
limitation): make assembly genuinely sparse when the sparse backend is
selected (`assembly.js` currently always builds a dense `n×n` matrix via
`denseFromTriplets` regardless of backend), and route `qualification.js`'s
equilibrium/residual/energy checks through the existing, already-tested
`sparseMultiply` (`src/core/lafea-linear-solve/sparse-matrix.js`) instead of
dense `matVec` when sparse was used. Building blocks already exist and are
tested; this is integration, not new engineering — same shape as M002 itself.

**M006** (needs prequalification — real production-capability question, not
pure test-writing): determine whether gravity/self-weight and thermal
expansion loads are actually wired to affect the solved result at the
*system* level, or only validated at the load-case-declaration contract
level (current evidence suggests the latter — `lfea-b3.0-load-case-check.mjs`
validates gravity/thermal *declarations*, not a solved closed-form result).
If wiring already exists, add the two missing mandate closed-form cases
(gravity/self-weight, thermal expansion) the same way M004 did. If it
doesn't, that's a real gap to scope as its own implementation mission —
don't assume either way without checking first.

**M007** (large, needs careful prequalification): begin Benchmark B — the
governed analysis-authority overlay contract (materials, sections, supports,
load cases) for the real 1885 project, scoped initially to one line/branch
rather than the full 279-object project, to get a first genuine non-BLOCKED
solve. This is the single highest-mandate-value remaining item and the
prerequisite for P12. Do not hand this off without prequalification — the
overlay schema design has real degrees of freedom that need Owner judgment
before implementation starts.

**M008**: stress recovery for frame/pipe elements (mandate Section 13.3) —
first verify whether it exists at all in the Stack-C chain before scoping
implementation vs. verification work.

**M009**: Stack-B UI defect re-verification. Before scoping, redo the direct
verification pass that found D-01/D-09 already fixed — do not reuse
`FEA_UI_UPGRADE_PLAN.md`'s claims without re-checking current code, the same
way M002's fixture-default question and M003's export-eligibility assertion
both turned out to need direct tracing rather than trusting the first
plausible explanation.

## Process notes for future Owner sessions

- Two agents currently in rotation: one comfortable in the
  `linear-fea-solver`/`lafea-linear-solve`/model-compiler stack (did M002),
  one comfortable in UI/workbench/test-harness work (did M003, M004).
  Match mission type to agent history where it fits.
- A third team is concurrently landing staged-JSON enrichment and
  geometry/topology-editor work on `main` — `src/workspace/dataset-adapter.js`,
  `src/workspace/topology-edit/**`, `src/workspace/enrichment/**`,
  `src/core/common-enriched-properties/**` are their territory. Every Work
  Pack issued so far has explicitly forbidden those paths; keep doing that.
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
