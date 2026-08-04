# M022-A — StagedJSON resolution contracts and selected-branch inventory

## Scope

M022-A establishes the fail-closed authority boundary for one real StagedJSON branch:

```text
/ASIM-1885-8"-S8810103-91261M7-HC-01/B1
```

It does not project canonical geometry, generalize the M008-C catalogs, resolve physical support assemblies, or invoke B-2.5.

## Contracts

- `stagedjson-process-authority/v1`
- `stagedjson-support-authority/v1`
- `stagedjson-resolved-analysis/v1`
- `stagedjson-selected-branch-inventory/v1`

All sealed records retain dataset byte/semantic identity and use independent semantic/evidence hashes where evidence is present.

## Resolution semantics

The shared field status is one of:

- `DECLARED`
- `INHERITED`
- `MISSING`

Process authority additionally requires:

```text
PROHIBIT_ENTITY_ORDER_CARRY_FORWARD
```

The process contract rejects `INHERITED` fields. A later StagedJSON entity with a missing effective value therefore remains `MISSING`; it cannot inherit the previous JSON entity's value.

## Temperature roles

The resolved-analysis boundary distinguishes:

- `REFERENCE` → `referenceTemperature`
- `OPERATING` → `operatingTemperature`
- `DESIGN` → `designTemperature`

A material state cannot be marked resolved when its governing process temperature is missing. Operating and design requirements retain their requested kelvin values even when the corresponding material state is still missing.

## Real-fixture findings retained as blockers

The selected-branch inventory check proves against `benchmarks/1885Sjson/EnrichedSjson` that:

- the branch contains 16 normalized entities;
- nine are support source records;
- M008-C currently resolves five frame entities;
- operating temperature is 309 °C / 582.15 K;
- design temperature is 325 °C / 598.15 K;
- no installation/reference temperature is declared;
- `designPressureMpa` exists, but no separately governed operating analysis pressure exists;
- `hydroPressure` has no sealed unit authority;
- current M008-C material tables end at 393.15 K;
- M008-C embeds its material aliases, NPS 8 Schedule 100 section, and 293.15 K evaluation request in source code;
- raw versus enriched material/section conflicts remain visible;
- support attachment/restraint authority remains unresolved.

These are reviewable qualification blockers, not silently substituted defaults.

## Checks

```text
npm run check:m022a
```

This runs:

1. synthetic contract sealing, revalidation, inheritance rejection, and tamper checks;
2. the real selected-branch inventory oracle plus a two-entity no-carry-forward probe;
3. a source guard preventing solver, canonical-projector, UI, and InputXML coupling in M022-A.
