# Provenance — `EnrichedSjson.topology.input.xml`

Element-based CAESAR II-native InputXML (`<CAESARII xmlns="COADE"
VERSION="11.00" XML_TYPE="Input">`) generated from this repository's own
`benchmarks/1885Sjson/EnrichedSjson` (the M001 Benchmark A source, 13 real
branches of the 1885 project) for the purpose of an independent
reactions/displacements cross-check against a user-run CAESAR II (linear
FEA) solve of the same topology. Requested 2026-08-03/04; this file and its
assumptions were reviewed and confirmed with the Owner before delivery.

Element-based InputXML was chosen over AVEVA's node-based EnrichXML
(`tabs/stagedjson-to-enrichxml` in `3D_Converters`) because it is the schema
this repository's own production adapter (`src/core/geometry/adapters/
inputXmlToCanonicalGeometry.js`) actually ingests, and because it gives more
direct control over topology (Owner's explicit preference).

## Build tool

`reallaksh19/3D_Converters`, `scripts/build-component-topology-artifacts.mjs`
(the same tool documented in `reallaksh19/XML_Compare_Utilities`'s
`docs/topology-trace-validator.md`):

```
node scripts/build-component-topology-artifacts.mjs \
  --input EnrichedSjson.final.json \
  --output-dir <out>
```

`EnrichedSjson.final.json` = `benchmarks/1885Sjson/EnrichedSjson` (this
repo) plus the two deliberate, documented modifications below. Nothing else
in the source model was altered.

## Deliberate modifications to the source model, and why

1. **7 zero-length external-boundary stub branches added** (13 real
   branches → 20 total). The source model has 8 real `CREF` cross-references
   from OLET taps to branches outside its own declared scope — this is not
   a data error: `3D_Converters`' own `Benchmarks/1885Sjson/fixture-
   manifest.json` documents this exact slice as
   `"scope": {"unresolvedOutsideTargetScope": true}`. The topology exporter
   fails closed on unresolved `CREF` targets (`CREF_TARGET_UNRESOLVED`,
   blocking), so 7 minimal stub branches were added at the exact real OLET
   tap positions to let the build complete, each tagged
   `"OWNER": "/EXTERNAL-BOUNDARY-STUB"` and carrying an explicit
   `_ownerAssumption` field. **No pipe geometry, weight, or process data is
   fabricated** — each stub is a single zero-length point at a real,
   already-known coordinate; it exists only so the branch it terminates has
   a topological far end.

   | Stub branch | Referencing OLET(s) / position (mm) |
   |---|---|
   | `/ASIM-1885-6"-S8811951-91261M7-HC-01/B4` | OLET 51229 @ (422420.992, -1141125, 1184.15) |
   | `/ASIM-1885-6"-S8811951-91261M7-HC-01/B3` | OLET 51233 @ (423170.992, -1141125, 1184.15); OLET 51239 @ (425681.392, -1141125, 1184.15) |
   | `/ASIM-1885-2"-D8810271-91261M7-PP-01/B1` | OLET 51244 @ (426511.66, -1141125, 1184.15) |
   | `/ASIM-1885-6"-S8811951-91261M7-HC-01/B6` | OLET 51350 @ (438023.221, -1139222.202, 1184.15) |
   | `/ASIM-1885-6"-S8811951-91261M7-HC-01/B5` | OLET 51351 @ (438023.221, -1138422.001, 1184.15) |
   | `/ASIM-1885-2"-D8810272-91261M7-PP-01/B1` | OLET 51352 @ (438023.221, -1137841.118, 1184.15) |
   | `/ASIM-1885-2"-D8810273-91261M7-PP-01/B1` | OLET 51495 @ (442423.411, -1159925, 1209.55) |

2. **`YMOD=203400000` (kPa) and `PRAT=0.3` added to every component's
   `attributes`** that did not already declare them. The source model does
   not carry an elastic modulus/Poisson's ratio anywhere — Owner-selected
   value, confirmed via `AskUserQuestion` on 2026-08-04 (kPa units,
   E=203,400,000 kPa ≈ 203.4 GPa, ν=0.30 — standard carbon-steel piping
   values). Applied uniformly; **no per-material lookup was performed**.

## Left unresolved on purpose (Owner decision, not a tool limitation unless noted)

- **58 of the model's components have zero process data** (no `TEMP1`,
  `PRES1`, `HPRES`, or `FDENSITY`/`FLDEN`) anywhere on their source
  attribute line — not even on a sibling component of the same branch to
  inherit from at the source-JSON level. Per Owner decision
  (`AskUserQuestion`, "Leave unset (sentinel)"), these were **not**
  populated with an invented ambient/cold-only case. In the emitted XML
  this surfaces as the CAESAR native unset sentinel `-1.010100` on
  `TEMP_EXP_C1`/`PRESSURE1`/`HYDRO_PRESSURE`/`FLUID_DENSITY` for 105 of the
  163 final elements (the stub branches' zero-length elements also read as
  sentinel, since they carry no process data by construction).
- **`TEMP_EXP_C2`-`C9`/`PRESSURE2`-`C9` (multi-case slots) are sentinel on
  all 163 elements.** This is a real, structural limitation of the
  topology-only exporter, not an Owner choice — its own trace-ledger schema
  declares `deferredProperties: ["RIGID", "WEIGHT", "MATERIAL", "PROCESS"]`
  for anything beyond the first case slot. Matches the Owner's own
  "benchmark reactions/displacements first" framing (single gravity+process
  case), not a defect to fix here.

## Known gap this fixture exposes (scoped as M020)

The Owner's expectation is that an element left at the sentinel behaves
internally as "inherit the prior element's value" — the same convention
this repository's own `inputXmlToCanonicalGeometry.js` already applies to
`DIAMETER`/`WALL_THICK`/`MATERIAL_NAME` via `resolveInheritedField`/
`resolveInheritedStringField`. As of this file's creation, **that inheritance
mechanism does not yet cover `TEMP_EXP_C1`, `PRESSURE1`, `HYDRO_PRESSURE`,
`MODULUS`, `POISSONS`, or `FLUID_DENSITY`** — confirmed by direct source
read. Extending it is in scope for M020 (see the linked Work Pack issue),
not assumed already true by this fixture.

## Build result (topology exporter's own reported metrics)

```
source:    { branches: 20, childRecords: 266, routeComponents: 127, supports: 139 }
references:{ cref: 13, resolvedCref: 13, hrefTref: 36, resolvedHrefTref: 33, externalReferences: 3 }
canonical: { nodes: 164, edges: 163, pointFeatures: 4, junctions: 13, boundaries: 3,
             supports: 36, rigids: 53, zeroLengthEdges: 0 }
parity:    { mismatches: 0 }
```

Restraints (49 total, real `TYPE` codes preserved, not guessed): `TYPE=14`
("+Y", 36 occurrences, self-consistent with observed `YCOSINE=1.000000`),
`TYPE=8` (GUIDE, 5), `TYPE=9` (LIMIT, 8).

## Independent ingestion verification (this repo, not the export tool)

Round-tripped through this repository's own production adapter,
`inputXmlToCanonicalGeometry(xmlText, { unit: 'mm' })`, on a fresh
`origin/main` worktree: **164 nodes, 163 segments, zero diagnostics.**
`MODULUS="203400000.000000"` / `POISSONS="0.300000"` confirmed present on
all 163 elements.

## Delivery

This committed copy is byte-identical to the file already delivered to the
Owner via direct file transfer on 2026-08-04 (406,594 bytes).
