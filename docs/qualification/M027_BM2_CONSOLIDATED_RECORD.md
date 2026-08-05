# M027 — BM2 Consolidated Engineering Record

## Disposition

This lot consolidates the useful BM2 engineering work from PRs #641, #644, #653, #664, #660 and #667 into one benchmark-specific review surface. It is stacked on the shared CAESAR InputXML correction profile from PR #657.

PR #656 is deliberately excluded from executable mechanics. Its source-correction dependency is now governed centrally, but its output-inferred unilateral active-state experiment did not provide a complete complementarity, gap, stiffness and friction qualification.

This PR is not a complete CAESAR II parity claim.

## Agent-work assessment

| Source | Retained contribution | Consolidated disposition |
|---|---|---|
| #641 | Complete BM2 InputXML ingestion and diagnostic custody | RETAINED |
| #644 | Physical solve and initial CAESAR comparison chain | RETAINED AS LEGACY BASELINE |
| #653 | Correct pass/fail classification and honest matched-subset count | RETAINED |
| #656 | Unilateral restraint active-state experiment | EXCLUDED — MECHANICS NOT QUALIFIED |
| #664 | B31J run-surface nodes and fictitious branch rigid topology | RETAINED AS TOPOLOGY AUTHORITY |
| #660 | Eleven bend arcs, 21 bend stations and 61 report-node/pair identities | RETAINED AS GEOMETRY AUTHORITY |
| #667 | Occurrence-preserving row identity and complete coverage ledger | RETAINED |

## Shared restraint source correction

All BM2 InputXML restraint records pass through:

```text
CAESAR_INPUTXML_RESTRAINT_TYPE_EXPORT_CORRECTION_V1
```

The seven controlled numeric export corrections are applied once before classification. Raw exported TYPE, corrected TYPE, source kind and matched rule evidence remain retained.

This source correction does not authorize the downstream restraint mechanics. The inherited BM2 baseline still uses simplified linear classifications for corrected types `14` and `8`, and omits a complete unilateral/contact solution for corrected type `15`. Those simplifications remain disclosed limitations and are not promoted as production CAESAR parity.

## Current benchmark authority

The comparison source is the latest committed file:

```text
benchmarks/LFEA/BM2/Output_BM2.xml
```

Its complete retained case inventory is:

| Case | Formula | Tier |
|---:|---|---|
| 1 OPE | W+T1+P1 | DIAGNOSTIC_PRIORITY |
| 2 SUS | W+P1 | DIAGNOSTIC_PRIORITY |
| 3 OPE | W+T1+P1 | STRICT_NO_FRICTION |
| 4 SUS | W+P1 | STRICT_NO_FRICTION |
| 5 EXP | L5=L1-L2 | DIAGNOSTIC_PRIORITY |
| 6 EXP | L6=L3-L4 | STRICT_NO_FRICTION |

Every case retains displacement, restraint, global-force and local-force reports. The full source inventory is 11,196 response scalars: 1,866 per case.

## Strict acceptance contract

The no-friction cases are CASE 3, CASE 4 and CASE 6. For every matched nonzero scalar:

```text
abs((solver - reference) / reference) < 0.05
```

Exactly +5% or -5% fails. A zero reference requires exact zero until a separate absolute-tolerance authority is approved. Unmatched source or solver rows fail.

The inherited three-case solver mapping is:

```text
OPE -> CASE 3
SUS -> CASE 4
EXP -> CASE 6
```

The inherited comparison currently covers a 2,232-scalar matched source subset. It must not be described as the complete BM2 denominator. The retained coverage ledger separately reports:

- provisional source-level denominator: 3,240 scalars;
- full retained station-level denominator: 5,598 scalars for the strict three-case set;
- unresolved reference classifications and unmatched solver rows;
- `INCOMPLETE_BLOCKED` whenever the coverage partition does not close.

## Diagnostic findings

The latest CAESAR reference pairs CASE 1/3, CASE 2/4 and CASE 5/6 are numerically identical across displacement, restraint, global-force and local-force reports. The source therefore does not support friction as BM2's next primary discrepancy.

The next priority sequence is:

1. compile the qualified bend arcs and directional flexibility into the actual solve;
2. apply the B31J junction stiffness model with one declared owner;
3. classify corrected restraint types mechanically and qualify unilateral complementarity, gaps, stiffness and friction without output-state fitting;
4. diagnose conditioning and near-null modes with node/DOF evidence;
5. close full station-row identity and coverage;
6. only then promote strict no-friction parity.

## Excluded PR #656

PR #656 is not copied into this lot. The central mutation table it depended on is now accepted and governed. The exclusion is instead limited to the active-state mechanics: support engagement must follow signed gap and reaction consistency for each physical case, not whichever state improves CAESAR residual agreement. Derived cases must subtract converged physical cases rather than run a new fitted active state.

## Geometry and topology boundaries

The retained B31J junction work creates five run-surface nodes and five zero-mass fictitious branch rigid links. The retained bend work reconstructs all eleven bends and 21 declared bend stations, including the disclosed collapsed 170–180 tangent-consumed span.

These are qualified geometry/topology authorities. Their presence does not by itself prove that final assembled stiffness, thermal loading, force recovery or CAESAR row mapping is complete.

## Generated evidence

The consolidated workflow runs the shared correction contract, retained ingestion, baseline comparison, junction and bend qualification checks, then executes:

```text
node scripts/lfea-bm2-consolidated-latest-output-check.mjs --write
```

The generated report is:

```text
reports/bm2-consolidated-latest-output.json
```

Its `qualificationStatus` is the benchmark disposition. Source-custody checks may pass while numerical parity remains `INCOMPLETE_BLOCKED`.
