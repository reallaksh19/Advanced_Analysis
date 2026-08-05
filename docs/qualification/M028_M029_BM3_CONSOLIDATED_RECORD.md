# M028/M029 — BM3 Consolidated Engineering Record

## Disposition

This lot consolidates BM3 onboarding from PR #649 and programmed variable-spring hanger work from M029 / PR #665 into one benchmark-specific commit above the governed common InputXML correction profile in PR #657.

M030 is not duplicated here. Its safe numeric-versus-text restraint handling and raw/corrected TYPE evidence are incorporated in the common parent.

This PR is **not** a complete CAESAR II parity claim.

## Retained agent work

| Source | Retained contribution | Consolidated disposition |
|---|---|---|
| #649 / M028 | BM3 InputXML units, source retention, physical case assembly and result recovery | RETAINED |
| M030 / #663 | Owner-confirmed restraint export correction and evidence | OWNED BY COMMON PARENT #657 |
| M029 / #665 | First-principles programmed variable-spring design, catalog selection, compilation and recovery | RETAINED |
| M029 / #665 | Generic grounded-spring equilibrium and reaction recovery fixes | RETAINED WITH INDEPENDENT SOLVER REGRESSION |
| M028/M029 old output ledger | Pre-update CASE 6/7 expansion mapping | SUPERSEDED — NOT USED FOR LATEST PARITY |

## Source correction

Every BM3 restraint record consumes:

```text
CAESAR_INPUTXML_RESTRAINT_TYPE_EXPORT_CORRECTION_V1
```

The controlled seven-row numeric export correction is applied once before classification. Text aliases resolve directly to the corrected code system and are not re-mutated. Raw source TYPE, corrected TYPE, source kind, rule identity and label are retained.

## Programmed hanger method

The BM3 source declares two program-designed variable spring hangers at nodes 20 and 22 without entered selected spring rate, cold load, hot load or travel. The implementation therefore does not copy selected properties from `BM3_Output.xml`.

The governed design sequence is:

1. add temporary global-Y restraints at the proposed hanger nodes;
2. solve the restrained weight case and recover required design/hot reactions;
3. remove the temporary restraints;
4. apply the recovered hot loads and solve operating travel without hanger stiffness;
5. search the declared Anvil catalog for the first admissible series/size satisfying travel, working-load range and the 25% variation limit;
6. compile each selected hanger as a directional grounded spring plus theoretical cold-load preload;
7. recover complete support action as `H_c - k u`.

Independent selections retained from M029:

| Node | Figure | Size | Spring rate | Theoretical cold load |
|---:|---|---:|---:|---:|
| 20 | 98 | 11 | 29.7716 N/mm | 6,470.097 N |
| 22 | B-268 | 11 | 59.5431 N/mm | 7,247.431 N |

The CAESAR hanger report remains an external oracle used only after the independent design.

## Generic solver corrections

M029 exposed two generic grounded-spring defects:

- global free-body qualification included grounded-spring `k u` terms as if they were unbalanced element resultants;
- `execution.reactions` omitted grounded-spring support action.

The consolidated solver:

- removes grounded-spring terms from the internal resultant before rigid-body force and moment qualification;
- reports grounded-spring support action as `-k u`;
- retains component-owned hanger recovery as preload plus elastic spring action;
- proves the behavior with an independent cantilever/grounded-spring regression.

The common-head solver files were byte-identical to M029's original base before these changes, so the import does not overwrite intervening solver work.

## Latest output case semantics

The benchmark source is:

```text
benchmarks/LFEA/BM3/BM3_Output.xml
```

The latest file changed the prior case numbering. The governed mapping is now:

| Case | Physical/derived state | Tier |
|---:|---|---|
| 3 | `W + T1 + P1 + H` | DIAGNOSTIC_PRIORITY |
| 4 | `W + T2 + P1 + H` | DIAGNOSTIC_PRIORITY |
| 5 | `W + P1 + H + F1` | DIAGNOSTIC_PRIORITY |
| 6 | `W + T2 + P1 + H`, no-friction reference | STRICT_NO_FRICTION |
| 7 | `W + P1`, no-friction reference | STRICT_NO_FRICTION |
| 8 | expansion from CASE 3 and CASE 5 | DIAGNOSTIC_PRIORITY |
| 9 | expansion from CASE 4 and CASE 5 | DIAGNOSTIC_PRIORITY |

The old M029 labels `CASE6_EXP` and `CASE7_EXP` are internal historical analysis identities only. They are not mapped onto latest reference CASE 6 or CASE 7.

## Strict physical solves

Latest strict CASE 6 is compared with the independently designed M029 hanger model's physical T2 solve:

```text
W + T2 + P1 + H
```

Latest strict CASE 7 is solved separately as:

```text
W + P1
```

It has no programmed hanger preload, no hanger stiffness and no F1. Pressure is retained as source evidence under the currently declared pressure-effects policy.

Strict rule for every matched nonzero scalar:

```text
abs((solver-reference)/reference) < 0.05
```

Exactly +5% or -5% fails. A zero reference requires exact zero until a separate absolute-tolerance authority is approved. Unmatched source or solver rows fail.

## Comparison custody

The latest-output checker retains every reference row with:

- case number and formula;
- report family;
- report-block ordinal;
- source-row ordinal;
- node or `FROM_NODE-TO_NODE` identity;
- duplicate occurrence ordinal;
- I/J end for element actions.

Source rows that cannot be mapped uniquely to a current solver component remain unmatched and block parity. They are not overwritten or omitted.

The complete source inventory includes all CASE 3–9 displacement, restraint, global-force and local-force reports. M028 source/solver qualification and M029 hanger qualification run independently from this latest numerical ledger, so stale case numbering cannot create a false pass.

## Deep diagnostic findings

The latest reference CASE 4/CASE 6 pair uses the same physical formula and is the high-quality friction-state sensitivity pair. Identical responses reduce friction priority for that load set, but do not prove solver parity.

CASE 5/CASE 7 is diagnostic only and confounded: `H`, `F1` and friction state are not held constant. It cannot isolate a friction, hanger or F1 root cause.

The next priority sequence is:

1. retain and compile the two declared F1 records generically;
2. verify complete physical load-set custody for CASE 5/6/7;
3. verify T1/T2, cold/hot modulus and thermal-strain state selection;
4. run controlled H-only and F1-only A/B studies;
5. integrate real bend arcs and directional flexibility;
6. qualify reducer representation;
7. close generated-station and duplicate-pair solver identity before parity promotion.

## Generated evidence

The consolidated workflow produces:

```text
reports/m028-bm3-qualification.json
reports/m029-bm3-hanger-qualification.json
reports/bm3-consolidated-latest-output.json
```

Source correction, source custody, physical-solver qualification and hanger design can pass while numerical parity remains `INCOMPLETE_BLOCKED`.
