# Authorized empirical-load execution seam

This seam performs an explicit empirical support-load calculation from one validated `authorized-empirical-load-input/v1` package.

It creates a deterministic ephemeral Project Data profile by retaining the active project's topology, gravity, load-case and tolerance authority while replacing only these enrichment-derived fields:

- pipe sections;
- material densities;
- operating fluid densities;
- hydrotest fluid densities;
- insulation densities; and
- component weights.

The ephemeral profile is never written to `projectDataStore`. Every replacement field carries approval evidence bound to the authorized input, baseline, readiness, handoff and projection hashes.

The existing `calculateSupportLoadDistribution` engine is invoked unchanged. The result is wrapped in an immutable `authorized-empirical-load-execution/v1` receipt that binds the caller-supplied execution identity and timestamp, the authorized input, the ephemeral profile hash and the exact distribution hash.

`CALCULATED` and `BLOCKED` are both truthful execution outcomes. The seam does not convert a blocked distribution into a success, automatically trigger calculation, write stagedJson, modify topology or touch LFEA/solver code.
