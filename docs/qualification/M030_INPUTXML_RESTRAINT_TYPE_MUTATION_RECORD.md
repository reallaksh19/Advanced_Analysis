# M030 — CAESAR II InputXML Restraint TYPE Mutation Authority

## Disposition

M030 governs an owner-confirmed CAESAR II InputXML export defect that affects restraint `TYPE` values in BM1, BM2, and BM3. The correction is applied centrally in the shared InputXML adapter, exactly once, before semantic restraint classification.

This is a source-normalization authority. It does not change support mechanics, nonlinear state selection, stiffness, load cases, or the comparison tolerance.

## Owner-confirmed mutation table

| Intended restraint | Exported `TYPE` | Canonical `TYPE` |
|---|---:|---:|
| `+Y` | 17 | 14 |
| `LIM` | 7 | 8 |
| `GUI` | 10 | 9 |
| `X` | 1 | 2 |
| `Y` | 2 | 3 |
| `Z` | 3 | 5 |
| unlabelled row; BM2 direction evidence is `+Z` | 18 | 15 |

The rows are matched against the original exported numeric code. Mutation is single-pass: exported `1` becomes canonical `2`; it is not subsequently remutated through `2→3` and `3→5`.

## Defect found during qualification

The seven numeric rows already existed in the shared adapter and were enabled by default. However, the textual alias authority used a conflicting code system:

- textual `ANCHOR` resolved to code 1, which is an exported `X` code under the mutation table;
- textual `GUI` and `LIM` resolved to the opposite canonical codes;
- textual `X`, `Y`, and `Z` did not resolve to canonical 2, 3, and 5.

Consequently, numeric benchmark exports happened to normalize correctly, while generic textual consumers could be misclassified.

M030 separates the two domains:

1. **Exported numeric TYPE** — preserved as source evidence, then matched once against the owner-confirmed correction table.
2. **Textual canonical alias** — resolved directly to the post-mutation canonical code and never passed through the numeric export correction.

Anchor code 0 is now explicitly part of the canonical authority because all three benchmark inputs use exported `TYPE="0.000000"` for anchors.

## Evidence retained per restraint

Every parsed restraint now retains:

```text
sourceTypeRaw
sourceTypeCode
typeCode
sourceKind
mutationApplied
mutationLabel
mutationFrom
mutationTo
```

`INPUTXML_RESTRAINT_TYPE_MUTATED` diagnostics contain the same mutation evidence. This permits review of the original XML code and the canonical code without rewriting source files.

## Cross-benchmark qualification

The dedicated check reads the exact committed InputXML files through the shared adapter.

| Benchmark | Active restraints | Applied mutations | Observed pairs |
|---|---:|---:|---|
| BM1 | 12 | 10 | `0→0 ×2`, `17→14 ×8`, `7→8 ×2` |
| BM2 | 6 | 3 | `0→0 ×3`, `17→14 ×1`, `7→8 ×1`, `18→15 ×1` |
| BM3 | 3 | 2 | `0→0 ×1`, `2→3 ×2` |

The check also proves:

- all seven rows;
- disabled-mutation behavior;
- direct canonical textual aliases;
- single-pass matching for overlapping source/target codes;
- rejection of duplicate, conflicting, fractional, and out-of-range mutation rows;
- preservation of raw source values and mutation diagnostics.

## Regression result

The following checks pass locally without external dependencies:

```text
node scripts/lfea-m030-inputxml-restraint-mutation-check.mjs
node scripts/lfea-b3.15-bm1-inputxml-check.mjs
node scripts/lfea-b3.16-inputxml-ground-truth-check.mjs
node scripts/lfea-m028-bm3-check.mjs
node scripts/lfea-inputxml-ingest-check.mjs
```

BM3 remains exactly:

```text
2,389 / 3,780 within ±10%
1,391 / 3,780 outside ±10%
```

Therefore the mutation correction does not alter the qualified BM3 structural result. It makes the source interpretation explicit and safe for all benchmark InputXML files and future textual consumers.

The exact-head workflow additionally runs a clean `npm ci` and the unchanged `check:lfea-linear-core` aggregate, regenerates evidence twice, verifies an identical SHA-256, uploads the report, removes it, and proves the checkout is clean.

## Scope boundary

M030 does not implement:

- programmed spring hanger mechanics;
- declared `F1` nodal loads;
- bend arc/flexibility authority;
- reducer section-sampling parity;
- support-state fitting from CAESAR output.

Programmed hanger work continues under issue #650 after this source-normalization prerequisite is qualified.
