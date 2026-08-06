# SJSON 1885 configurable empirical screening evidence

This evidence package applies the editable `1885-SJSON-CS-CONFIGURABLE-SCREENING-V1` profile to the enriched SJSON and companion topology XML at commit `07ce017eb7113517cc032771f7717f88c0a93d4c`.

## Scope

- Graph-tributary vertical weight screening.
- Independent scalar global X and Y thermal compatibility solves.
- No synthesized anchor; directional restraints remove rigid-body modes only when the assembled system is full rank.
- Pressure and pressure stress excluded.
- This is an experimental configurable screening result, not beam/frame FEA or a code operating load case.

## Density-unit correction

- The topology XML stores density in `kg/cm³`: steel is `0.007850` and explicit process fluid is `0.000300`.
- The governed conversion is therefore `kg/cm³ × 1,000,000 = kg/m³`; the resolved process-fluid density is **300 kg/m³**.
- The earlier `× 1,000` conversion incorrectly produced **0.3 kg/m³**, understating fluid mass by a factor of 1,000.
- At N50120 / PS-12169, the adjacent half-span tributary check is 158.276 kg steel + 31.325 kg fluid, giving **1.859 kN**. The superseded **1.552 kN** value was effectively steel-only.

## Configurable assumptions

- Carbon steel: `E = 203.4 GPa`, reference temperature `21 °C`, interpolated mean expansion coefficient.
- All 105 sentinel temperatures and fluid densities inherit from connected previous-node explicit values; all 58 explicit temperatures are `325 °C`.
- Input XML density unit: `kg/cm³`; configured conversion to `kg/m³`: `1,000,000`.
- Insulation density: `210 kg/m³`.
- Gasket mass: zero.
- Positive source flange/valve/instrument weights are preferred, but none are present; same-section pipe-equivalent span mass is used.
- Tee and olet use the host pipe OD and wall thickness.
- Compliance coefficient `C2E = 2.55`; component multipliers remain editable in the profile.

## Global checks

- Physical support sites: **36**
- Resolved process-fluid density: **300 kg/m³**
- Total screened mass: **5388.841 kg**
- Total screened weight: **52.846 kN**
- Vertical equilibrium error: **0.000000 kN**
- X reaction equilibrium error: **0.000058 kN**
- Y reaction equilibrium error: **-0.000012 kN**
- N50120 vertical reaction: **1.859 kN**
- Maximum independent-component vector: **34.968 kN** at **N50120 / PS-12169**

## Largest support vectors

| Node | Support | Capabilities | Fx thermal (kN) | Fy thermal (kN) | Fz weight (kN) | Component vector (kN) |
|---|---|---|---:|---:|---:|---:|
| N50120 | PS-12169 | GUIDE + LINESTOP + REST | -0.991 | -34.905 | 1.859 | 34.968 |
| N10230 | PS-12248 | GUIDE + LINESTOP + REST | 31.568 | -0.770 | 0.693 | 31.585 |
| N70040 | PS-12060 | GUIDE + LINESTOP + REST | -1.858 | 23.712 | 4.704 | 24.245 |
| N20120 | PS-12321 | LINESTOP + REST | -22.000 | 0.000 | 1.328 | 22.040 |
| N60080 | PS-12034 | LINESTOP + REST | 0.000 | 8.968 | 3.193 | 9.519 |
| N20180 | PS-12268 | GUIDE + LINESTOP + REST | -8.138 | -2.185 | 0.618 | 8.449 |
| N120020 | PS-12171 | REST | 0.000 | 0.000 | 4.259 | 4.259 |
| N10530 | =1006649732/51465 | REST | 0.000 | 0.000 | 3.801 | 3.801 |
| N70050 | PS-12059 | REST | 0.000 | 0.000 | 3.682 | 3.682 |
| N30060 | PS-12034 | GUIDE + LINESTOP + REST | 1.420 | 3.287 | 0.742 | 3.657 |
| N130050 | PS-12166 | REST | 0.000 | 0.000 | 3.249 | 3.249 |
| N60070 | PS-12228 | REST | 0.000 | 0.000 | 3.193 | 3.193 |

The full 36-node table is retained in `empirical-screening-result.configurable.csv` and the complete calculation receipt is retained in `empirical-screening-result.configurable.json`.

The component vector is a presentation-only combination of independently solved X, Y and vertical screening components. It is not a qualified simultaneous operating-load resultant.
