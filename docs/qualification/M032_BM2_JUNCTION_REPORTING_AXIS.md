# M032-B — BM2 junction-adjacent reporting-axis custody

## Hypothesis

A junction-adjacent straight element may not switch to an exactly opposite transverse local frame between its intersection endpoint and its remote report endpoint.

The M031 runtime used the element-owned junction plane only at the endpoint located on the intersection. At the opposite endpoint it fell back to the generic straight-element reference rule. For vertical pair `130-140`, the two rules selected the same axial direction but exactly opposite `b/c` axes, producing sign reversals in `FY`, `FZ`, `MY`, and `MZ` while global actions remained unchanged.

## Guarded correction

The exact M031 runtime is retained unchanged as:

```text
scripts/lfea-m031-bm2-qualified-runtime-base.mjs
```

The public qualification runtime wraps that authority. It evaluates non-bend, non-collapsed elements that already own a junction plane, but changes a report element only when both transverse axes are exactly reversed relative to the generic straight frame:

```text
dot(b_generic, b_owned) ≈ -1
dot(c_generic, c_owned) ≈ -1
```

For that narrowly proven discontinuity:

```text
a = report FROM → TO
b = element-owned junction plane normal
c = a × b
```

The same axes report both endpoints. Arbitrary rotations, non-opposite frames, bends, and collapsed-transfer rows remain untouched.

## Invariants

- Every global endpoint action remains bit-for-bit unchanged.
- Every node displacement and reaction remains unchanged.
- Stiffness, loads, restraints, active-set states, conditioning, and row custody remain unchanged.
- The candidate test requires `correctedPairs = ["130-140"]`; every other report element must remain semantically identical to the baseline.

## Local evidence

Source artifact:

```text
head: 140433982e60dbc6add0b4b8b1785a494fbe69b5
artifact: 8950075013
artifact digest: sha256:ec5949210805141946fcd22896d31f618aba71975c7e19546d9ee04f481269d6
frozen BM2 result: 4,404 / 5,598 passing
```

A local replay of the retained detailed ledger for pair `130-140`, end I, evaluated 14 failing local-force rows. Reversing the proven transverse frame converted 8 rows to strict passes and changed zero global actions.

This ledger is diagnostic evidence only. Exact acceptance remains the complete 5,598-scalar comparator.

## Acceptance

- denominator remains 5,598;
- coverage remains complete;
- unresolved, unmatched, and untraced rows remain zero;
- passing scalars increase above 4,404;
- failures decrease below 1,194;
- the eight declared `130-140/I` rows pass;
- BM1, BM3, and linear-core regressions pass.

## Boundaries

```text
equationChanges = []
stiffnessChanges = []
loadChanges = []
restraintChanges = []
comparatorChanges = []
toleranceChanges = []
productionDefaultChanges = []
```
