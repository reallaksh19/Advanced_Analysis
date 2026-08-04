# P1 Agent Work Pack — Import-to-First-Frame Performance

**GitHub issue:** [#541](https://github.com/reallaksh19/Advanced_Analysis/issues/541)  
**Controlling plan:** [`docs/Nonfeaplan.md`, P1](./Nonfeaplan.md#p1--import-and-geometry-rendering-performance)  
**Dependency:** P0 Owner acceptance.

The assigned agent may run qualification and prepare a bounded proposal before P0 acceptance. Production edits are prohibited until the P0 baseline, fixture authority, and ownership matrix are accepted.

## Three mandatory qualification questions

1. **Which exact production stage violates a frozen threshold on the accepted real large-model fixture?** Provide exact head, fixture SHA-256, cold/warm sample counts, median/p95/max per stage, long tasks, one-canvas/one-render-owner counts, and raw browser evidence. Stop if no threshold is violated.
2. **Which exact event/invalidation path causes redundant work?** Count normalization, engineering rebuild, support/route construction, geometry/render compile, Three materialization, and scene installation for import, selection, navigation, model-zone, engineering change, Project Data change, reload, and context restore. Name the first unnecessary call and its trigger. Stop if it cannot be reproduced deterministically.
3. **What protected manifest proves the proposed optimization does not alter engineering or pick identity?** Freeze source SHA-256, normalized/shared/support/route/resolved/render hashes, diagnostics, model-zone membership, bounds, object IDs, and byte-for-byte pick targets. Timing/resource counts may change; protected values may not. Reject the optimization on any drift.

The full allowed scope, implementation order, test matrix, branch name, PR contract, and stop conditions are maintained in issue #541.
