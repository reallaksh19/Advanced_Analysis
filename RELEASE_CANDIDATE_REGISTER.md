# Release Candidate Register

## Required Merge Stack

1. PR #59 — U0 baseline certification
2. PR #60 — U1 workflow hardening
3. PR #61 — U2 settings contract
4. Phase U3 — engineering data unification
5. Phase U4 — sketcher topology and fittings
6. Phase U5 — solver certification contract
7. Phase U6 — active calculation reporting
8. Phase U7 — browser QA and deterministic CI
9. Phase U8 — release candidate certification

## Release Blockers

1. npm run build fails
2. npm run check:benchmarks fails
3. npm run check:qa fails
4. Browser smoke tests cannot open Settings, GC3D, Pipe Rack, or Reports
5. Reports tab displays demo report without active calculation context
6. Missing pipe/material data returns a clean PASSED
7. Settings changes do not mark current results stale
8. Solver result lacks method ID or formula IDs
9. Runtime source contains unapproved Math.random, Date.now(), new Date(, performance.now(
10. Stacked PRs are merged out of order

## Benchmark Pass Requirement

Total: 37
Passed: 37
Failed: 0
Max Rounded Numeric Error: 0
