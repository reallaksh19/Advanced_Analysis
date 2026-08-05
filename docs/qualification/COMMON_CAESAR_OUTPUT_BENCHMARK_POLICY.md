# Common BM2/BM3 CAESAR Output Benchmark Policy

## Status vocabulary

The common benchmark workflow publishes three independent states:

```text
SOURCE_CORRECTION_CONTRACT
STRICT_NO_FRICTION_PARITY
DIAGNOSTIC_CASE_CUSTODY
```

A passing InputXML restraint-type correction contract means only that the governed seven-row CAESAR export correction was applied and audited. It does not mean that BM2 or BM3 solver results agree with CAESAR.

The current common-lot status is:

```text
SOURCE_CORRECTION_CONTRACT: PASS
STRICT_NO_FRICTION_PARITY: NOT_EVALUATED
DIAGNOSTIC_CASE_CUSTODY: PASS
```

Strict parity remains `NOT_EVALUATED` until the dedicated BM2 and BM3 solver ledgers compare every required reference row and every generated solver row.

## Source custody

The benchmark authority is the latest committed CAESAR output on `main`:

| Benchmark | Source file | Governed Git blob SHA |
|---|---|---|
| BM2 | `benchmarks/LFEA/BM2/Output_BM2.xml` | `c13190a14a4f292702dc20a4cdd4109d284f5c5d` |
| BM3 | `benchmarks/LFEA/BM3/BM3_Output.xml` | `184e8287a60bde8fc02aad312333d62a0298f7d6` |

The benchmark-policy check computes the Git blob SHA from the file bytes and fails closed when either source changes. A new output revision therefore requires an explicit full-case review rather than silently changing the benchmark denominator.

## Strict no-friction tier

The no-friction cases are blocking acceptance cases.

### BM2

```text
CASE 3 (OPE) W+T1+P1
CASE 4 (SUS) W+P1
CASE 6 (EXP) L6=L3-L4
```

### BM3

```text
CASE 6 (OPE) W+T2+P1+H
CASE 7 (OPE) W+P1
```

The source labels are retained exactly. In particular, BM3 CASE 7 is labelled `OPE` by CAESAR and is not silently reclassified as `SUS`.

For each matched scalar with a nonzero reference value:

```text
abs((solver - reference) / reference) < 0.05
```

The inequality is strict:

- `+4.999999%` may pass;
- exactly `+5%` fails;
- exactly `-5%` fails.

For a zero reference value, the solver value must be exactly zero until a separately governed absolute tolerance is approved. This common lot does not invent one.

Any unmatched reference row or unmatched solver row fails the strict tier. Row omission, duplicate overwrite, denominator reduction and governed-exclusion invention are prohibited.

## Diagnostic-priority tier

All remaining output cases are mandatory evidence even though they do not block through the strict no-friction threshold in this common lot.

### BM2 diagnostic cases

```text
CASE 1 (OPE) W+T1+P1
CASE 2 (SUS) W+P1
CASE 5 (EXP) L5=L1-L2
```

### BM3 diagnostic cases

```text
CASE 3 (OPE) W+T1+P1+H
CASE 4 (SUS) W+T2+P1+H
CASE 5 (OCC) W+P1+H+F1
CASE 8 (EXP) L8=L3-L5
CASE 9 (EXP) L9=L4-L5
```

The workflow retains displacement, restraint, global-force and local-force reports with duplicate occurrence identity and separate element I/J ends. It records case formulas, declared report counts, source-row counts and response-scalar counts.

## Reference-variant sensitivity findings

Reference sensitivity compares CAESAR cases with each other. It is useful for prioritisation but is not a solver residual and cannot prove causation.

### BM2

The following CAESAR pairs are numerically identical across displacement, restraint, global-force and local-force reports:

```text
CASE 1 versus CASE 3
CASE 2 versus CASE 4
CASE 5 versus CASE 6
```

No paired scalar differs by more than 5%; the measured maximum difference is zero. Based on the available CAESAR reference outputs, friction-state sensitivity is therefore a low-priority explanation for BM2 residuals. The dedicated BM2 agent must still evaluate strict solver parity for CASES 3, 4 and 6.

### BM3

`CASE 4` and `CASE 6` have the same formula and are numerically identical across all four report families. This exact-formula pair does not support prioritising friction as the primary BM3 discrepancy source.

`CASE 5` versus `CASE 7` shows large differences:

| Report family | Paired scalars | Scalars over 5% | P95 relative delta | Maximum relative delta |
|---|---:|---:|---:|---:|
| Displacement | 150 | 133 | 1.715 | 1.715 |
| Restraint | 30 | 6 | 0.9892 | 0.9943 |
| Global force | 288 | 82 | 0.6141 | 1.267 |
| Local force | 288 | 82 | 0.6141 | 1.267 |

This is a composite comparison: CASE 5 includes `H` and `F1`, while CASE 7 is `W+P1`; the difference cannot be attributed to friction alone. It is a strong signal to prioritise BM3 load-set, hanger/preload and F1 compilation, followed by controlled A/B isolation.

## Recommended next priorities

1. **BM3 load-set custody and compilation:** implement and independently prove `H`, `F1`, `T1/T2` and the physical/derived case relationships before attributing residuals to components.
2. **Strict no-friction solver ledgers:** compare BM2 CASES 3/4/6 and BM3 CASES 6/7 with complete row identity and strict `<5%` evaluation.
3. **BM2 component mechanics:** because friction variants are reference-identical, prioritise bend geometry/flexibility, branch flexibility, restraint direction/active state and conditioning evidence.
4. **BM3 composite isolation:** run controlled A/B studies for `H`, `F1`, hanger stiffness/preload and thermal-state custody; do not fit any quantity to CASE 5 versus CASE 7.
5. **Diagnostic residual ranking:** publish largest improvements, regressions, sign reversals, unmatched rows, equilibrium, conditioning and near-null-mode evidence for every mechanics change.

## Prohibitions

The benchmark policy must not be used to:

- describe the InputXML correction contract as BM2/BM3 parity;
- relax the strict `5%` boundary;
- introduce an undeclared absolute floor around zero;
- exclude difficult cases or report families;
- overwrite duplicate rows by `FROM_NODE-TO_NODE` alone;
- choose mechanics from whichever option improves output agreement;
- infer friction causation from the confounded BM3 CASE 5/CASE 7 comparison;
- claim strict parity while its status is `NOT_EVALUATED`.

## Invocation

```text
node scripts/lfea-common-caesar-output-benchmark-policy-check.mjs --write
```

The generated JSON is uploaded from CI as an exact-head workflow artifact. It is evidence for source custody and prioritisation; dedicated benchmark agents must extend it with solver-result ledgers before strict parity can pass.
