# Authorized empirical-load input adapter

This adapter is the first production-consumption seam for the common enrichment chain. It accepts only:

- a validated `AUTHORIZED` handoff for `EMPIRICAL_LOADS`;
- the exact projection payload bound by that handoff; and
- the fixed `advanced-analysis-empirical-load-input/v1` payload schema.

It compiles the payload into an immutable, semantic-hashed load-calculation overlay containing:

- pipe section properties by exact line key;
- material density by exact material code;
- operating and hydro fluid density by exact line key;
- insulation density by exact insulation code; and
- component weight by exact catalog key.

Duplicate line keys are rejected. Repeated material, insulation, or catalog keys are accepted only when their exact values agree; conflicting values fail closed instead of overwriting earlier records. Pipe dimensions and insulation-state consistency are validated before the overlay is emitted.

The adapter does not modify Project Data, merge the overlay into a profile, calculate support loads, write stagedJson, or invoke any downstream engineering consumer. Those operations remain separate authority and execution steps.

```bash
node scripts/run-authorized-empirical-load-input-checks.mjs
```
