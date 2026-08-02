# Engineering Enrichment Preflight UI — Phase 1 Acceptance Checklist

A Phase 1 implementation is acceptable only when every applicable item has executable evidence.

## Identity and duplicates

- [ ] Every line and component uses a stable target identity derived from source-stable model identity and provenance, never row position or DOM index.
- [ ] `Map<targetId, ordinal>` rejects duplicate target IDs.
- [ ] Normalized line keys use duplicate-preserving buckets such as `Map<normalizedKey, Uint32Array>`.
- [ ] Multiple acceptable containment candidates produce `BLOCKED_AMBIGUOUS` with `selectedTargetId: null`.
- [ ] Input-order reversal leaves identities, buckets, queues, and structural hashes unchanged.

## Indexed model and virtualization

- [ ] The 40 engineering columns use a closed, immutable, ordinal-addressed schema.
- [ ] Grouping, filtering, sorting, counts, and selection operate on indexes rather than rendered DOM elements.
- [ ] Row virtualization bounds live rows to viewport plus declared overscan.
- [ ] Column virtualization or an equivalent bounded strategy caps live cells.
- [ ] The 100,000-line fixture never creates render-all DOM rows.
- [ ] The 1,000,000-component fixture creates zero component rows before expansion.
- [ ] Component expansion uses a separate bounded viewport.
- [ ] Dataset growth from medium to large does not increase the configured live DOM cap.

## Exception-first review

- [ ] Missing, ambiguous, conflicting, stale, proposed, and deferred targets are first-class queues.
- [ ] Summary/facet counts come from the complete indexed result.
- [ ] Cells show value, status, source kind/hash, locator, and match/derivation method.
- [ ] Blocked values remain `null`; no implicit zero or hidden fallback is displayed.
- [ ] Bulk actions preview eligible, skipped, conflict, and blocker counts before confirmation.
- [ ] Service/class actions create proposals and never overwrite stronger evidence.
- [ ] Accept, reject, override, defer, and undo create immutable review events.

## Side-effect and authority boundaries

- [ ] Read-only operations cannot mutate DOM, `localStorage`, Project Data, master data, shared model, source files, or event buses.
- [ ] Topology autofix is absent from the enrichment command bar and lives in a separately governed workflow.
- [ ] Empty-model state remains blocked; no demonstration data enters production runtime.
- [ ] Production modules cannot import Phase 0 fixtures or benchmarks.
- [ ] The UI imports no Phase 1 core package until a reviewed integration phase authorizes it.
- [ ] No empirical-load, LFEA, solver, stagedJson export, Project Data publication, geometry, or topology authority is introduced.

## Determinism and anti-drift

- [ ] Fixed seeds, pinned manifests, generator version, source hashes, and timestamp are explicit.
- [ ] Same-process, cross-process, and cross-timezone runs produce identical semantic hashes.
- [ ] Hidden clocks, random IDs, locale-dependent ordering, and first-found selection are rejected.
- [ ] Index, group, filter, exception-queue, and viewport structural digests are pinned.
- [ ] New scripts exit non-zero on assertion failure and emit stable machine-readable failure codes.
- [ ] Timings and memory are evidence only; structural correctness is the pass gate.

## Accessibility and interaction continuity

- [ ] Keyboard selection, focus, group expansion, and review navigation survive sorting/filtering and viewport recycling through stable target IDs.
- [ ] Status is conveyed with text/icons as well as color.
- [ ] Group rows expose descendant counts and expanded/collapsed state.
