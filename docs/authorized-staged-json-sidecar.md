# Authorized stagedJson enrichment sidecar

This adapter compiles a readiness-qualified projection into an immutable stagedJson enrichment sidecar. It accepts only an `AUTHORIZED` handoff for `ENRICHED_STAGED_JSON_EXPORT` and the exact projection payload bound by that handoff.

The output contains one canonical entry per exact source-record identity. Each entry retains the target identity, target kind, source record, line context, projected scalar attributes, and the projection-record semantic hash.

The adapter rejects:

- duplicate source-record identities;
- blocked or unauthorized handoffs;
- payload, readiness, baseline, adapter, or configuration mismatches;
- path-like attribute names;
- identity, geometry, connectivity, topology, coordinate, port, node, or edge fields; and
- non-scalar or non-finite values.

It produces a sidecar artifact only. It does not open, modify, or write stagedJson; mutate source records; persist Project Data; alter topology; or execute a downstream consumer. A separate writer must validate the exact source artifact and apply this sidecar under its own authority.

```bash
node scripts/run-authorized-staged-json-sidecar-checks.mjs
```
