# Enriched stagedJson preservation and canonical parity qualification

## Tested contract

This test-only harness qualifies enriched stagedJson export for both a **single-root object** and a **branch-array root**. It joins an immutable synthetic published baseline to stagedJson by exact stable `targetId` only.

The exporter preserves, byte-semantically under canonical JSON:

- `APOS`, `LPOS`, `POS`, and `CENTER`;
- original `attributes`;
- hierarchy and child order;
- source IDs, stable target IDs, parent IDs, names, and references;
- branch and component order.

Each target receives exactly one authority namespace, `engineeringEnrichment`, containing:

- record schema;
- baseline ID and baseline semantic hash;
- exact target ID;
- canonical field records;
- blockers with `value: null`;
- status summary;
- record semantic hash.

The export envelope carries schema, baseline ID/hash, source model hash, exporter version, joined record count, preservation hashes, and export semantic hash.

## Determinism and parity

Fixtures use generator version `1.0.0`, fixed seeds, stable IDs, code-point key ordering, and pinned timestamp `2026-08-02T00:00:00.000Z`. Same-process, child-process, and cross-timezone runs must produce identical fixture, export, file, API, and streaming hashes.

File transport, simulated API transport, and bounded canonical streaming must produce the same canonical semantic hash. The large fixture is serialized in chunks capped by a declared byte bound; elapsed time and memory are evidence, while stable hashes, counts, preservation hashes, and chunk bounds are correctness gates.


## Pinned fixture and export hashes

| Fixture | Root shape | Branches | Components | Targets | Fixture semantic hash | Export semantic hash | Canonical transport hash |
|---|---|---:|---:|---:|---|---|---|
| `singleRoot` | single-root object | 4 | 24 | 29 | `sha256:23626b7572a2ae9ebc74cc8cc23c9b878ea359652dca6ec6d8c1f4c34f86ab00` | `sha256:ee76c900a4fcca25fde240eb33da2cec512547a3d5ec48fd70696b81de155845` | `sha256:13f7865c9904507f8f2ee5c011042b82aef966c831d12eb63d3613b936c07a49` |
| `branchArray` | branch-array root | 5 | 35 | 40 | `sha256:926418d5307f382f7533c0fe31822efe6420c1ab2648c4d6a0b847a1d721f2ef` | `sha256:3aaa2988bffc637bd1fb44142b99e51a17f72e8674406992d2eacc3253ffd0d4` | `sha256:497473f46558079460d8cbf3e6e3f350c7aa176b3455b925cd0048d002dbafe7` |
| `large` | branch-array root | 500 | 10,000 | 10,500 | `sha256:f5be5ade789df9e89906362e18045dced474d27402cc4b46fbeb21d7df4ea27e` | `sha256:c434d5f18c37d272090d298a278c040c3dcc33d01341719f7578b308964b9c43` | `sha256:74daf1430486267f42f95c82230b765d93040240c953faadcc1231e2b9ba778c` |

The large transport is 30,286,306 canonical bytes and is qualified with 1,849 chunks, each no larger than 16,384 bytes. The structural gate is 10,500 preserved nodes, 10,500 exact joins, equal file/API/stream hashes, and unchanged full-source, geometry, hierarchy, attributes, identity/reference, and child-order hashes.

## Stable failure codes

- `ENRICHED_STAGED_JSON_SOURCE_MUTATED`
- `ENRICHED_STAGED_JSON_TARGET_JOIN_MISSING`
- `ENRICHED_STAGED_JSON_TARGET_JOIN_DUPLICATE`
- `ENRICHED_STAGED_JSON_BASELINE_HASH_MISMATCH`
- `ENRICHED_STAGED_JSON_GEOMETRY_HASH_MISMATCH`
- `ENRICHED_STAGED_JSON_DUPLICATE_AUTHORITY_NAMESPACE`
- `ENRICHED_STAGED_JSON_BLOCKER_VALUE_INVENTED`
- `ENRICHED_STAGED_JSON_FILE_API_PARITY_MISMATCH`

Additional internal codes cover invalid canonical values, schema errors, forbidden imports, and invalid streaming bounds.

## Anti-drift boundary

The harness rejects duplicate authority namespaces including `enrichedAttributes`, `engineering`, and `processData`. It has no name/path/branch-text matching, regex/substring/fuzzy/ranked selection, first-row or first-found selection, default/zero substitution, local engineering override, topology repair, identity rewriting, Project Data write, source write-back, empirical calculation, LFEA binding, solver authorization, or API implementation.

Static and runtime guards reject production imports and hidden clocks, random IDs, locale-sensitive ordering, and production `src/` imports from the qualification modules.

## Aggregate command

```bash
node scripts/run-enriched-staged-json-qualification-checks.mjs
```

This command exercises deterministic fixtures, both root shapes, exact joins, missing/duplicate joins, blocker preservation, geometry/hierarchy preservation, source immutability, duplicate namespace rejection, baseline and export tamper rejection, file/API parity, process/timezone determinism, bounded large-fixture streaming, and static/runtime anti-drift checks.

## non-authority boundary

This is a qualification artifact only. It modifies no production code and creates no engineering approval, Project Data publication, geometry/topology validity, empirical-load authority, LFEA readiness, candidate binding, solver authorization, production API, stagedJson production exporter, release qualification, or release evidence.
