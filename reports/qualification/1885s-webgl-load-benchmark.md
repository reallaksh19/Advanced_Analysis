# 1885S WebGL Editing and Empirical Load Benchmark

Evidence hash: `fnv1a64:c127dd9c5ff138ac`

This qualification uses only the supplied SJSON, line list, piping-class master, Topo Validator weight master, and approved Project Data. No numeric support reaction is published because required engineering inputs remain unapproved.

## Source authority

| Source | SHA-256 | File |
|---|---|---|
| dataset | `6b2c8b01ab0ba6ec8e9e7c42eb4a719668ffd2dc4dbe4790d27cf426a1f60288` | `F:/CODE-5-SS/3D_Converters/Benchmarks/1885Sjson/Sjson.json` |
| lineList | `723518a16b1a744c9328539f1a25fe15ea246757930970603a89d3cea46e3f41` | `D:/Code3/EF/AML-91-PDFEED-PX-2345-00001-0000 BC4.xlsx` |
| pipingClass | `bea1c45f3f7dcf51340a6d625cfcc23cfc5926be3413d697183b607e2ccab82c` | `F:/CODE-4-SS/SS2/3D_Viewer_github_clone/docs/Masters/Piping class master.xlsx` |
| componentWeight | `72e266002256e2ac0b0c0c9c722dde2bb65e93deec2075d209c7ab78d219cda2` | `F:/CODE-6/XML_Compare_Utilities/docs/Masters/wtValveweights.json` |

## Verified normalization

- 279 source nodes
- 139 support records -> 38 tagged assemblies -> 37 physical sites
- 13 route partitions, 127 topology edges, 124 physical edges, and 3 AUTO carriers
- Source coordinates remain Z-up; conversion occurs only at the Three.js boundary
- Line S8811951 / class 91261M7 / DN150 / row 316 preserved

## Inline replacement

Status: **PASSED**

Exactly three components were retired. Gaskets `/51249` and `/51255`, support `/51254`, and the B2 AUTO carrier retained their identities. The replacement is VLV3 DN150 Class 900 (610 mm, 263 kg) with two real DN150 Class 900 weld-neck flange rows (147 mm, 59 kg); flange Sch 80 text is retained from source DTXR. Endpoint, ancestry, retained-identity, connectivity, non-overlap, undo, and redo checks passed.

## Empirical loads

Method: `CHAINAGE_TRIBUTARY_SPAN_V2`  
Status: **BLOCKED — no numeric reactions published**

| Project Data field | Code | Reason |
|---|---|---|
| loadCalculation.gravityMPerS2 | MISSING_VALUE | An authoritative value is required. |
| loadCalculation.loadFactor | MISSING_VALUE | An authoritative value is required. |
| loadCalculation.materialDensitiesKgPerM3 | MISSING_VALUE | An authoritative value is required. |
| loadCalculation.pipeSectionProperties | MISSING_VALUE | An authoritative value is required. |
| loadCalculation.hydroFluidDensitiesKgPerM3 | MISSING_VALUE | An authoritative value is required. |
| loadCalculation.insulationDensitiesKgPerM3 | MISSING_VALUE | An authoritative value is required. |
| loadCalculation.equilibriumTolerances | MISSING_VALUE | An authoritative value is required. |

EMPTY, OPE, and HYD remain separate blocked cases. Their `verticalForceN` values are null and equilibrium is not run while Project Data is incomplete.

## Browser benchmark

Status: **BLOCKED** — connected Chrome control was unavailable. Chrome timings and Edge smoke results are null, not estimated. Approved thresholds remain 3,000 ms WebGL ready, 100 ms selection p95, 500 ms edit commit, and 30 fps navigation.
