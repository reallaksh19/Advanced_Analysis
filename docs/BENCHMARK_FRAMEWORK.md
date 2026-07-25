# Benchmark Framework

## Purpose
The Simplified Analysis app includes an engineering benchmark framework. It is designed to act as a numeric QA harness for all solvers to ensure calculations remain consistent and accurate against verifiable references.

This framework tests against expected numeric values (such as those drawn from SPL2 bundles, hand calculations, or known literature) rather than just validating the structure of an API.

## Core Schema
Every benchmark test case adheres to the `benchmarkCase.schema.json` schema.

Key fields:
- `caseId`: Unique ID
- `title`: Descriptive name
- `module`: Which module solver to test
- `engineeringLevel`: Target level (`SCREENING`, `DESIGN_AID`, etc.)
- `sourceStatus`:
  - `VERIFIED`: The expected value is final. Will fail if out of tolerance.
  - `PENDING_NUMERIC_EXTRACTION`: Missing expected values; runner will mark it as `PENDING`.
  - `HAND_CALC`: Based on manual calculation.
  - `SPL2_REFERENCE`: From the SPL2 legacy tool.
- `input`: The arguments passed into the module solver.
- `expected`: The exact expected result structure.
- `tolerance`: Number or Object for floating point comparison.

## Running Benchmarks
To run the benchmarks:
```bash
npm run check:benchmarks
```

The script iterates through `benchmarks/fixtures/`, invokes the tolerance logic comparing actual vs expected, and aggregates the results.

### Reports
Output reports are generated at:
- `reports/benchmark-results.json`
- `reports/benchmark-summary.md`

## Tolerance Comparison
Comparisons are handled deeply for primitives, objects, and arrays within `src/benchmarking/tolerance.js`. If a tolerance limit is given, numeric values within that limit will be counted as a `PASSED`.
