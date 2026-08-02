# Benchmark A — 1885 EnrichedSjson Source Ingestion

Evidence hash: `fnv1a64:9d660b72309b6f99`

## Source identity

| Field | Value |
|---|---|
| Repository | `reallaksh19/3D_Converters` |
| Commit | `05ed229abe0299ccdfeeb04afd3e3402585d83c1` |
| Path | `Benchmarks/1885Sjson/EnrichedSjson` |
| Bytes | 1785455 |
| SHA-256 | `e9a51723444e9490f5dff9c1ff4a5c56191873033d11a289946746ff1072c5da` |

**Note on a disputed prior brief:** an earlier task description stated this exact repo/commit/path was 148,627 bytes (SHA `77e64a27d185afc8dbedde41f43383c63650c62a2ae75face5eac1356f5d07d3`, 12 nodes / 10 pipes / 9 components / 0 loads / 0 supports). No such file exists at that commit and path. The figures above were verified directly against a fresh clone of the source repository and confirmed by the repository owner as the correct fixture. All counts in this report are computed from the actual 1,785,455-byte file, not the disputed brief.

## Topology (real, computed — not asserted)

279 total objects across 13 root branch groups.

| Type | Count |
|---|---|
| SUPPORT | 139 |
| PIPE | 43 |
| FLAN | 22 |
| GASK | 22 |
| ELBO | 14 |
| BRANCH | 13 |
| OLET | 10 |
| INST | 5 |
| VALV | 4 |
| REDU | 4 |
| TEE | 3 |

Adapter coarse category summary (pipe/support/component bucket — see audit report for the caveat that only BRANCH nodes land in "component"): pipes 127, supports 139, components 13.

## Duplicate source IDs

0 duplicate source entity ID group(s) detected.

## Unresolved conditions (read verbatim from the source file's own CII2019 enrichment diagnostics)

83 of 279 objects carry at least one unresolved-attribute diagnostic; 208 diagnostic entries total, spanning 8 branch/sub-branch groups. All are source-reported severity `BLOCKED`, category `MISSING_ATTRIBUTE` — these block downstream weight/load calculation for the affected objects, not import.

| Field | Occurrences |
|---|---|
| lineNo | 83 |
| pipingClass | 83 |
| fluidDensityOpeKgM3 | 42 |

Affected branch/sub-branch groups:

- `/ASIM-1885-6"-S8810111-91261M7-HC-01`
- `/ASIM-1885-6"-S8810111-91261M7-HC-01/B1`
- `/ASIM-1885-6"-S8810111-91261M7-HC-01/B2`
- `/ASIM-1885-6"-S8810112-91261M7-HC-01`
- `/ASIM-1885-6"-S8810112-91261M7-HC-01/B6`
- `/ASIM-1885-6"-S8811951-91261M7-HC-01`
- `/ASIM-1885-6"-S8811951-91261M7-HC-01/B2`
- `/ASIM-1885-6"-S8811951-91261M7-HC-01/B7`

## Canonical model identity

Hash: `fnv1a64:8aff6bdf7854d003`. Repeatable across two independent ingestions of the same immutable bytes: **true**.

## Scope

This is Benchmark A only: source ingestion and topology qualification. It proves the fixture imports deterministically and its defects are reported, not repaired. It does not assign materials, sections, supports, or loads, and it does not run a solver — see the audit report for what Benchmark B (a governed analysis-authority overlay) would require.
