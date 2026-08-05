# Common CAESAR InputXML Restraint TYPE Export Correction

## Status

This record governs a known CAESAR II InputXML export defect exercised by the LFEA benchmark set. The correction is source normalization, not benchmark fitting and not a solver tolerance adjustment.

## Controlled profile

```text
CAESAR_INPUTXML_RESTRAINT_TYPE_EXPORT_CORRECTION_V1
```

The profile is enabled by default and applies at most one correction row to the normalized exported `TYPE` value before mechanical classification.

| Label | Exported TYPE | Corrected TYPE |
|---|---:|---:|
| `+Y` | 17 | 14 |
| `GUI` | 7 | 9 |
| `GUI` | 10 | 9 |
| `X` | 1 | 2 |
| `Y` | 2 | 3 |
| `Z` | 3 | 5 |
| blank | 18 | 15 |

## Processing order

```text
raw exported TYPE
  -> normalized exported TYPE
  -> one matching correction row, if present
  -> corrected TYPE
  -> mechanical restraint classification
```

The rows are not chained. For example, exported type `1` corrects to `2`; it is not subsequently corrected to `3` or `5` during the same ingestion.

## Evidence boundary

The common geometry adapter already retains:

- `sourceTypeCode` — normalized exported value;
- `typeCode` — corrected value used for classification;
- `mutationApplied` — whether the values differ;
- `INPUTXML_RESTRAINT_TYPE_MUTATED` diagnostics.

The correction authority now additionally exposes a versioned profile and rule-level resolution evidence for downstream audit work. A later common lot may project that rule identity into every canonical restraint record without changing the seven-row table.

## Benchmark scope

The permanent check parses the committed inputs for:

```text
benchmarks/LFEA/BM1/BM1_InputXML.xml
benchmarks/LFEA/BM2/Input_BM2.xml
benchmarks/LFEA/BM3/BM3_InputXML.xml
```

It verifies that the default correction is active, every matching retained restraint is corrected, one diagnostic is emitted per correction, and the seven rows remain unchanged.

## Prohibitions

The correction must not be:

- enabled or disabled according to CAESAR residual agreement;
- applied repeatedly to a corrected scalar;
- modified in a benchmark-specific script;
- treated as a change to gap, friction, stiffness or active-set mechanics;
- described as a parity improvement by itself.

## Invocation

```text
node scripts/lfea-common-inputxml-restraint-correction-check.mjs
```
