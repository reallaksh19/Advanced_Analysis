# M028 — BM3 Relief-Flanged Ingestion, Solve, and Comparison Record

## Disposition

M028 onboards the committed CAESAR II BM3 files through the existing InputXML, model compiler, frame-element, sparse-solver, and result-recovery authorities. The result is **PASS WITH DISCLOSED GAPS**, not a CAESAR parity claim.

The check is invoked with:

```text
node scripts/lfea-m028-bm3-check.mjs
```

The exact-head workflow runs this dedicated M028 check and then runs the unchanged `check:lfea-linear-core` aggregate, avoiding any package-script or numbered-slot collision with parallel M027 work.

## Source custody and ingestion

Authoritative files:

```text
benchmarks/LFEA/BM3/BM3_InputXML.xml
benchmarks/LFEA/BM3/BM3_Output.xml
```

The input header and the independently parsed canonical model agree:

| Quantity | Declared | Parsed |
|---|---:|---:|
| Elements | 24 | 24 |
| Bends | 6 | 6 |
| Rigid elements | 5 | 5 |
| Restraints | 3 | 3 |
| Force/moment records | 2 | 2 |

The canonical source model has 25 nodes. Shared-node topology identifies tees at nodes 35 and 40 without a BM3-specific branch representation.

### Newly retained input authority

The shared InputXML adapter now retains active nested `<FORCESMOMENTS>` records. BM3 contains two active `F1` declarations:

| Node | Force component | Value |
|---:|---|---:|
| 65 | FY | −4,000 N |
| 100 | FY | −4,000 N |

Geometry ingestion does **not** apply these forces. It emits `INPUTXML_FORCES_MOMENTS_PRESENT_NOT_COMPILED`, preserving the source facts while respecting M028's explicit out-of-scope boundary.

Two hanger records are likewise retained and diagnosed as `INPUTXML_HANGER_PRESENT_NOT_COMPILED` at nodes 20 and 22.

## Structural compilation

### Rigid elements

All five real rigid elements are valves. Each is compiled through the merged CAESAR rigid-element authority from PR #615:

- stiffness uses the original inside diameter and ten times the entered wall thickness;
- the entered valve weight remains the body-weight authority;
- artificial stiffness-section metal mass is not generated;
- documented fluid and insulation additions remain separate.

No BM3-specific rigid stiffness multiplier or fitted weight is introduced.

### Reducers

Two genuine inline diameter transitions are detected from route continuity and adjacent section changes:

```text
IX-S16: node 70 -> 75
IX-S23: node 105 -> 110
```

Each uses the merged PR #618 authority: ten successively changing cylindrical spans with `MIDPOINT_LINEAR_INTERPOLATION_CANDIDATE_V1`. The source model expands from 25 nodes / 24 elements to 43 analysis nodes / 42 frame elements.

The reducer authority remains explicitly:

```text
CANDIDATE_PENDING_SECTION_SAMPLING_VERIFICATION
```

It is not represented as verified CAESAR parity.

### Bends

BM3 does not publish sufficient internal bend-station geometry for a verified curved reconstruction through the current adapter. The six bend source spans are therefore compiled as their canonical FROM/TO chords and carry:

```text
BEND_SOURCE_SPAN_COMPILED_AS_STRAIGHT_CHORD
```

No undocumented arc centre or output-fitted geometry is invented.

## Load cases

The solver executes three physical base cases and derives the two expansion cases by exact linear subtraction:

| Key | CAESAR formula | Current structural input |
|---|---|---|
| CASE3_OPE | W+T1+P1+H | W+T1+P1; H omitted and disclosed |
| CASE4_SUS | W+T2+P1+H | W+T2+P1; H omitted and disclosed |
| CASE5_OCC | W+P1+H+F1 | W+P1; H and F1 omitted and disclosed |
| CASE6_EXP | L6=L3−L5 | computed CASE3−CASE5 |
| CASE7_EXP | L7=L4−L5 | computed CASE4−CASE5 |

The two hanger authorities and F1 application are intentionally not implemented in this issue.

The ten-cylinder expansion produces a condition estimate near `1.17E11`. M028 declares a residual pass gate of `1E-6`; the exact solves are below that gate, while force, moment, and energy equilibrium checks pass. This policy is explicit and hash-bound rather than hidden in the benchmark script.

## CAESAR II comparison

Matching follows the BM1 method:

- node number for translations and rotations;
- node number for combined restraint reactions, with CAESAR hardware actions negated to the structure-reaction convention;
- exact `FROM_NODE-TO_NODE` identity for global forces/moments;
- exact `FROM_NODE-TO_NODE` identity for local forces/moments;
- percentage comparison when the reference is material;
- an absolute fallback for near-zero reference values.

Every output row is matched. Per case:

```text
25 nodes × 6 displacement DOFs
 5 restraint nodes × 6 reaction DOFs
24 global-force elements × 12 end components
24 local-force elements × 12 end components
= 756 scalar comparisons per case
```

Five cases produce 3,780 scalar comparisons.

### Actual ±10% result

| Case | Passed | Failed | Total |
|---|---:|---:|---:|
| CASE3 OPE | 507 | 249 | 756 |
| CASE4 SUS | 507 | 249 | 756 |
| CASE5 OCC | 439 | 317 | 756 |
| CASE6 EXP | 466 | 290 | 756 |
| CASE7 EXP | 470 | 286 | 756 |
| **Total** | **2,389** | **1,391** | **3,780** |

| Family | Passed | Failed | Total |
|---|---:|---:|---:|
| Displacements/rotations | 103 | 647 | 750 |
| Restraint reactions | 124 | 26 | 150 |
| Global element actions | 1,152 | 288 | 1,440 |
| Local element actions | 1,010 | 430 | 1,440 |

The failure count is retained, not converted into a passing acceptance claim.

## Failure attribution

Every failed scalar carries one or more named unresolved authorities in the exact-head qualification artifact:

- `HANGER_SUPPORT_NOT_COMPILED` — all five CAESAR formulas contain or derive from cases containing H; omission changes the global support stiffness/preload path.
- `DECLARED_FORCE_F1_NOT_COMPILED` — CASE5 and both expansion cases contain or derive from the two omitted −4,000 N forces.
- `BEND_SOURCE_SPAN_COMPILED_AS_STRAIGHT_CHORD` — attached to failed global/local actions on the six bend source pairs.
- `REDUCER_CANDIDATE_PENDING_PARITY` — retained as a model limitation for the two reducer source pairs, even where a particular scalar falls inside ±10%.

These are deterministic scopes of unresolved authority, not an assertion that a single omission uniquely explains each numerical residual. No inverse fitting to CAESAR output was performed.

## Retained evidence

The deterministic check writes `reports/m028-bm3-qualification.json`. The read-only exact-head workflow regenerates it twice, verifies an unchanged SHA-256, uploads it as `m028-bm3-qualification-<SHA>`, then removes the generated file and proves the checkout is clean.

The artifact contains the complete 1,391-row failure ledger, including actual value, CAESAR value, deviation, tolerance basis, and named causes.
