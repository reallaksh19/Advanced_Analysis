# SJSON 1885 configurable empirical screening evidence

This evidence package applies the editable `1885-SJSON-CS-CONFIGURABLE-SCREENING-V2` profile to the enriched SJSON and companion topology XML at source commit `07ce017eb7113517cc032771f7717f88c0a93d4c`.

## Scope

- Common section/material state resolved once for every calculation POS.
- Graph-tributary vertical weight screening.
- Independent scalar global X and Y thermal compatibility solves.
- No synthesized anchor; directional restraints remove rigid-body modes only when the assembled system is full rank.
- Pressure and pressure stress excluded.
- This is an experimental configurable screening result, not beam/frame FEA or a code operating load case.

## Governed POS section and material authority

- Calculation-position authority: the 163 ordered `PIPINGELEMENT` records in the companion topology XML.
- Source-record crosswalk: topology component identity and branch path are reconciled to the enriched JSON records.
- Schedule authority: explicit or inherited same-branch fitting evidence. Schedule defaults are prohibited.
- All **163** calculation POS rows resolve their schedule from source evidence: **137 Sch 80** and **26 Sch 100**.
- Nominal size is an exact standard-size crosswalk from topology outside diameter.
- Section dimensions are selected from the resolved nominal size and branch-owned schedule. Topology wall thickness is retained as audit evidence and is not allowed to override schedule authority.
- The available schedule master governs **106** rows. For **57** rows without master coverage, exact scoped Project Data section records are required and usage-ledgered; no implicit lookup fallback is permitted.
- All **163** POS rows resolve, with **0** blocked rows and **0** schedule-default applications.
- The generated POS table is retained in `benchmarks/1885Sjson/empirical-pos-section-material.csv`.
- The complete configured-default usage ledger contains **840** applications and is retained in `benchmarks/1885Sjson/empirical-configured-default-usage.csv`.

The resolved POS receipt is projected into a governed topology before any weight or thermal calculation. The screening runner rejects an unprojected topology, a projection-hash mismatch, duplicate POS identity, schedule mismatch, section mismatch, or any schedule-default application. The calculation receipt records the original topology hash, projected topology hash, POS-receipt hash, projection semantic identity, POS-calculation semantic identity, and governed-runner hash.

For NPS 6 / Sch 80, the governed section is:

- outside diameter: **168.275 mm**
- wall thickness: **10.9728 mm**
- carbon-steel metal mass: **42.566877 kg/m**
- resolved positions: **95**

The projection changes the calculation outside diameter at **153** POS rows and wall thickness at **163** POS rows relative to the source topology XML. Those changes are intentional: the branch-owned schedule is the section authority.

## Density-unit correction

- The topology XML stores density in `kg/cm³`: steel is `0.007850` and explicit process fluid is `0.000300`.
- The governed conversion is therefore `kg/cm³ × 1,000,000 = kg/m³`; the resolved process-fluid density is **300 kg/m³**.
- The earlier `× 1,000` conversion incorrectly produced **0.3 kg/m³**, understating fluid mass by a factor of 1,000.
- A density-only correction on the superseded XML-wall model increased N50120 / PS-12169 from **1.552 kN** to **1.859 kN**. Applying the branch-owned schedule sections to the actual calculation raises the governed N50120 vertical reaction further to **2.615 kN**.

## Configured inputs and usage ledger

- Carbon steel: `E = 203.4 GPa`, reference temperature `21 °C`, interpolated mean expansion coefficient.
- All 105 sentinel temperatures and fluid densities inherit from connected previous-node explicit values; all 58 explicit temperatures are `325 °C`.
- Input XML density unit: `kg/cm³`; configured conversion to `kg/m³`: `1,000,000`.
- Insulation density: `210 kg/m³`.
- Gasket mass: zero.
- Positive source flange/valve/instrument weights are preferred, but none are present; same-section pipe-equivalent span mass is used.
- Tee and olet use the resolved host section.
- Compliance coefficient `C2E = 2.55`; component multipliers remain editable in the profile.
- Each configured application records the default ID, field, effective value, POS and node identity, source-missing reason, Project Data revision/hash, affected calculations, qualification and rationale.

## Global checks

- Physical support sites: **36**
- Resolved process-fluid density: **300 kg/m³**
- Total screened mass: **6696.626 kg**
- Total screened weight: **65.671 kN**
- Vertical equilibrium error: **0.000000 kN**
- X reaction equilibrium error: **0.000095 kN**
- Y reaction equilibrium error: **0.000022 kN**
- Maximum X thermal reaction: **45.096 kN**
- Maximum Y thermal reaction: **49.676 kN**
- N50120 vertical reaction: **2.615 kN**
- Maximum independent-component vector: **49.765 kN** at **N50120 / PS-12169**

## Largest support vectors

| Node | Support | Capabilities | Fx thermal (kN) | Fy thermal (kN) | Fz weight (kN) | Component vector (kN) |
|---|---|---|---:|---:|---:|---:|
| N50120 | PS-12169 | GUIDE + LINESTOP + REST | -1.431 | -49.676 | 2.615 | 49.765 |
| N10230 | PS-12248 | GUIDE + LINESTOP + REST | 45.096 | -1.235 | 0.963 | 45.123 |
| N70040 | PS-12060 | GUIDE + LINESTOP + REST | -2.628 | 32.822 | 5.307 | 33.352 |
| N20120 | PS-12321 | LINESTOP + REST | -31.331 | 0.000 | 1.843 | 31.385 |
| N60080 | PS-12034 | LINESTOP + REST | 0.000 | 12.637 | 3.559 | 13.129 |
| N20180 | PS-12268 | GUIDE + LINESTOP + REST | -11.708 | -3.142 | 0.868 | 12.154 |
| N30060 | PS-12034 | GUIDE + LINESTOP + REST | 2.002 | 5.745 | 1.044 | 6.173 |
| N120020 | PS-12171 | REST | 0.000 | 0.000 | 4.787 | 4.787 |
| N70050 | PS-12059 | REST | 0.000 | 0.000 | 4.154 | 4.154 |
| N130050 | PS-12166 | REST | 0.000 | 0.000 | 3.804 | 3.804 |
| N10530 | =1006649732/51465 | REST | 0.000 | 0.000 | 3.668 | 3.668 |
| N60070 | PS-12228 | REST | 0.000 | 0.000 | 3.558 | 3.558 |

The full 36-site reaction table is retained in `benchmarks/1885Sjson/empirical-screening-result.configurable.csv`. The complete governed calculation receipt is retained in `benchmarks/1885Sjson/empirical-screening-result.configurable.json`.

The component vector is a presentation-only combination of independently solved X, Y and vertical screening components. It is not a qualified simultaneous operating-load resultant.
