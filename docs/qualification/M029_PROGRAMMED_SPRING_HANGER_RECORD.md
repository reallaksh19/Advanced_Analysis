# M029 — Program-Designed Variable Spring Hangers for BM3

## Disposition

M029 implements the two BM3 programmed variable spring hangers through a first-principles design, compilation, solve, and recovery path. The implementation does not read the selected springs from `BM3_Output.xml`; the output hanger report is used only after selection as an external qualification oracle.

This remains **PASS WITH DISCLOSED GAPS**, not complete CAESAR II parity. Declared `F1`, real bend arc/flexibility, and reducer section-sampling parity remain separate authorities.

## Prerequisite source normalization

M029 is stacked on M030 / PR #663. The owner-confirmed InputXML restraint `TYPE` mutations are therefore applied exactly once before restraint classification. No benchmark XML is rewritten.

## Hanger declarations

BM3 contains two programmed hanger declarations:

| Source node | Input state |
|---:|---|
| 20 | program design; catalog table 1; no entered hot/cold load, stiffness, or travel |
| 22 | program design; catalog table 1; no entered hot/cold load, stiffness, or travel |

The blank design properties mean the selected spring cannot legitimately be copied from output. It must be designed from structural reactions and travel.

## Design algorithm

### 1. Restrained-weight design solve

Temporary global-Y rigid restraints are added only at the two proposed hanger nodes. A physical `W` solve is run through the standard compiler and sparse solver. Positive temporary reactions are the required hot/design loads:

| Node | M029 hot/design load | CAESAR output hot load | Deviation |
|---:|---:|---:|---:|
| 20 | 7,564.842 N | 7,538.966 N | +0.34% |
| 22 | 8,387.033 N | 7,987.289 N | +5.00% |

The CAESAR values are not inputs to the solve.

### 2. Operating-travel solve

The temporary rigid restraints are removed. The recovered hot loads are applied upward as design forces, with no hanger spring stiffness. The operating thermal state is solved to obtain signed vertical travel:

| Node | M029 travel | CAESAR output travel | Deviation |
|---:|---:|---:|---:|
| 20 | −36.7715 mm | −40.6672 mm | −9.58% magnitude |
| 22 | −19.1391 mm | −22.3574 mm | −14.39% magnitude |

The remaining travel discrepancy is consistent with the separately disclosed straight-chord bend authority and other unresolved global stiffness authorities; it is not corrected by fitting the hanger.

### 3. Catalog selection

The initial versioned catalog is:

```text
ANVIL-PP-11.11-VARIABLE-SPRING-2022
ASC/Anvil PP-SUB-82-C82-v01, revision 20220309
```

Published working-load bounds and spring rates are retained in source units and converted exactly from lbf and lbf/in. Candidate series are searched from the minimum series travel range upward, then by ascending size. A candidate must satisfy:

- recommended travel range;
- hot load within working range;
- theoretical cold load within working range;
- load variation no greater than 25%.

For signed displacement `u` positive upward:

```text
H_c = H_hot + k u_operating
H(u) = H_c - k u
```

Both selections independently match the CAESAR hanger report:

| Node | Selected figure | Size | M029 rate | CAESAR rate |
|---:|---|---:|---:|---:|
| 20 | 98 | 11 | 29.7716 N/mm | 29.7704 N/mm |
| 22 | B-268 | 11 | 59.5431 N/mm | 59.5408 N/mm |

The check retains every rejected catalog candidate and its rejection reasons before the selected row.

## Normal-case compilation

Each selected hanger compiles into two distinct authorities:

1. a global-Y `LINEAR_SPRING` constraint with selected stiffness `k`;
2. an upward nodal preload equal to theoretical cold load `H_c`.

The three physical BM3 cases are solved independently with those authorities. CASE6 and CASE7 remain exact algebraic differences of complete solved/recovered base cases.

## Solver and recovery defect fixed

Two generic solver/recovery defects were exposed:

1. Global force and moment qualification initially counted grounded spring `k u` as an unbalanced element resultant. Qualification now removes grounded spring terms before applying rigid-body free-body identities.
2. `execution.reactions` originally reported only fixed and prescribed reactions. Grounded spring support actions are now recovered generically as `-k u`.

For a programmed hanger, the complete hardware action is not merely `-k u`; it is:

```text
complete support action = theoretical cold-load preload + elastic spring action
                        = H_c - k u
```

Component-owned result recovery combines these two terms. In CASE3, the recovered node-20 and node-22 support actions return to their independently designed hot loads.

An independent two-element cantilever regression proves that applied force + fixed reaction + grounded spring reaction closes the global free body.

## Solver qualification

CASE3, CASE4, and CASE5 all pass:

- algebraic residual;
- force equilibrium;
- moment equilibrium;
- energy balance;
- conditioning;
- nonnegative pivot checks.

Each base case reports exactly two grounded spring actions. CASE6 and CASE7 remain derived results.

## Complete unchanged comparison

The same 3,780-scalar, per-component ±10% oracle is retained.

### Before and after

| Result | M028 baseline | M029 hangers | Delta |
|---|---:|---:|---:|
| Inside ±10% | 2,389 | 2,469 | **+80** |
| Outside ±10% | 1,391 | 1,311 | **−80** |

### By case

| Case | Passed | Failed | Change in passes |
|---|---:|---:|---:|
| CASE3 OPE | 535 | 221 | +28 |
| CASE4 SUS | 558 | 198 | +51 |
| CASE5 OCC | 434 | 322 | −5 |
| CASE6 EXP | 469 | 287 | +3 |
| CASE7 EXP | 473 | 283 | +3 |

CASE5 remains dominated by the intentionally omitted two `F1` forces. Adding real hanger stiffness/preload changes its load path and does not guarantee monotonic improvement before F1 is compiled.

### By family

| Family | Passed | Failed | Change in passes |
|---|---:|---:|---:|
| Displacements/rotations | 106 | 644 | +3 |
| Restraint reactions | 136 | 14 | **+12** |
| Global element actions | 1,197 | 243 | +45 |
| Local element actions | 1,030 | 410 | +20 |

The hanger omission cause is removed entirely from the failure ledger.

## Remaining named authorities

Every retained miss carries at least one specific unresolved authority:

- `DECLARED_FORCE_F1_NOT_COMPILED` — CASE5 and derived CASE6/CASE7; 892 retained misses.
- `BEND_SOURCE_SPAN_COMPILED_AS_STRAIGHT_CHORD` — system-wide because six bend surrogates alter geometry, flexibility, gravity centroids, hanger travel, and downstream actions; all 1,311 retained misses remain exposed to this authority.
- `REDUCER_CANDIDATE_PENDING_PARITY` — retained as a model limitation for the two real reducers; no inverse fit is performed.

Cause tags identify authorities capable of affecting a scalar; they are not claimed to be an exclusive inverse decomposition.

## Evidence and CI

The dedicated check writes:

```text
reports/m029-bm3-hanger-qualification.json
```

It retains design inputs, all selected properties, rejected-candidate counts, CAESAR qualification oracles, solver diagnostics, before/after summaries, and the complete 1,311-row failure ledger.

The read-only exact-head workflow performs a clean install, runs solver and hanger contracts, runs the unchanged complete linear-core aggregate, regenerates evidence twice, verifies the same SHA-256, uploads it, removes generated reports, and proves the checkout is clean.
