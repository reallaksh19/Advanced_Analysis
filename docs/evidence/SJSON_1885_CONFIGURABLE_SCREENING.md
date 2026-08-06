# SJSON 1885 configurable empirical screening evidence

This evidence package applies the editable `1885-SJSON-CS-CONFIGURABLE-SCREENING-V1` profile to the enriched SJSON and companion topology XML at commit `07ce017eb7113517cc032771f7717f88c0a93d4c`.

## Scope

- Graph-tributary vertical weight screening.
- Independent scalar global X and Y thermal compatibility solves.
- No synthesized anchor; directional restraints remove rigid-body modes only when the assembled system is full rank.
- Pressure and pressure stress excluded.
- This is an experimental configurable screening result, not beam/frame FEA or a code operating load case.

## Configurable assumptions

- Carbon steel: `E = 203.4 GPa`, reference temperature `21 °C`, interpolated mean expansion coefficient.
- All 105 sentinel temperatures and fluid densities inherit from connected previous-node explicit values; all 58 explicit temperatures are `325 °C`.
- Insulation density: `210 kg/m³`.
- Gasket mass: zero.
- Positive source flange/valve/instrument weights are preferred, but none are present; same-section pipe-equivalent span mass is used.
- Tee and olet use the host pipe OD and wall thickness.
- Compliance coefficient `C2E = 2.55`; component multipliers remain editable in the profile.

## Global checks

- Physical support sites: **36**
- Total screened mass: **4702.209 kg**
- Total screened weight: **46.113 kN**
- X reaction equilibrium error: **0.000058 kN**
- Y reaction equilibrium error: **-0.000012 kN**
- Maximum independent-component vector: **34.953 kN** at **N50120 / PS-12169**

## Largest support vectors

| Node | Support | Capabilities | Fx thermal (kN) | Fy thermal (kN) | Fz weight (kN) | Component vector (kN) |
|---|---|---|---:|---:|---:|---:|
| N50120 | PS-12169 | GUIDE + LINESTOP + REST | -0.991 | -34.905 | 1.552 | 34.953 |
| N10230 | PS-12248 | GUIDE + LINESTOP + REST | 31.568 | -0.770 | 0.583 | 31.582 |
| N70040 | PS-12060 | GUIDE + LINESTOP + REST | -1.858 | 23.712 | 4.241 | 24.160 |
| N20120 | PS-12321 | LINESTOP + REST | -22.000 | 0.000 | 1.118 | 22.029 |
| N60080 | PS-12034 | LINESTOP + REST | 0.000 | 8.968 | 2.895 | 9.424 |
| N20180 | PS-12268 | GUIDE + LINESTOP + REST | -8.138 | -2.185 | 0.516 | 8.442 |
| N120020 | PS-12171 | REST | 0.000 | 0.000 | 3.845 | 3.845 |
| N30060 | PS-12034 | GUIDE + LINESTOP + REST | 1.420 | 3.287 | 0.620 | 3.634 |
| N10530 | =1006649732/51465 | REST | 0.000 | 0.000 | 3.432 | 3.432 |
| N70050 | PS-12059 | REST | 0.000 | 0.000 | 3.319 | 3.319 |
| N60070 | PS-12228 | REST | 0.000 | 0.000 | 2.895 | 2.895 |
| N130050 | PS-12166 | REST | 0.000 | 0.000 | 2.887 | 2.887 |

The full 36-node table is retained in `empirical-screening-result.configurable.csv` and the complete calculation receipt is retained in `empirical-screening-result.configurable.json`.
