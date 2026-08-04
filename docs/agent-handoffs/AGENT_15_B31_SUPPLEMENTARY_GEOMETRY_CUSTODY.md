# Agent 15 handoff — B31 supplementary geometry custody

This change replaces the calculator's ad hoc per-segment supplementary map with the sealed `fea-b31-supplementary-geometry-set/v1` contract.

## Implemented

- exact-keyed bend, welding-tee and reducer geometry variants;
- deterministic entry ordering and duplicate-segment refusal;
- source identity and per-entry evidence hashes;
- stale-hash detection and deep-frozen records;
- one normalized SI path for staged canonical geometry and InputXML;
- explicit tee/reducer fail-closed behavior when canonical geometry is incomplete;
- physical-unit equivalence checks;
- removal of the old map from the primary public API.

## Boundary

The contract supplies missing geometry only. It does not apply flexibility, combine stress, change reducer structural stiffness, or consume vendor SIF declarations as calculated authority.
