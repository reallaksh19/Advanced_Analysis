# Engineering Enrichment Preflight UI — Phase 0 Inventory

**Scope:** current-behavior inventory, state-mutation map, deterministic fixture qualification, and Phase 1 preparation only.

**Non-goals:** no virtualized production UI, resolver logic, engineering fallback/defaults, Project Data publication, shared-model mutation, topology repair, empirical-load integration, LFEA/solver authority, stagedJson export, or release evidence.

## Classification

- `RETAIN`: preserve the user goal or navigation concept.
- `REPLACE`: preserve the need but change mechanics or authority semantics.
- `RELOCATE`: move the behavior to a separately governed workflow.
- `RETIRE`: remove unsafe or misleading behavior.

## Current interaction inventory

| Current behavior | Classification | Phase 1 disposition |
|---|---|---|
| Preflight workspace location | `RETAIN` | Keep as the source-readiness, coverage, exception, review, and candidate workbench. |
| Service → Rating → Piping Class → Line hierarchy | `RETAIN` | Keep as indexed grouping/navigation metadata, not permanent descendant DOM rows. |
| Render-all hierarchical HTML table | `REPLACE` | Use row and column virtualization over immutable indexed stores. |
| Hidden component `<tr>` rows created before expansion | `REPLACE` | Use lazy, separately bounded component drill-down. |
| `Load Process Data` source action | `RETAIN` | Convert to an explicit source-hash-bound run with exact/derived/proposed/blocked outcomes. |
| `Map<string, Row>` normalized-key lookup | `REPLACE` | Use `Map<targetId, ordinal>` plus `Map<normalizedKey, readonly ordinal[]>`; duplicates remain explicit. |
| First substring containment match followed by `break` | `RETIRE` | Return the complete stable candidate set; multiple candidates are `BLOCKED_AMBIGUOUS`. |
| Inline editable engineering cells | `REPLACE` | Display value, status, provenance, and evidence; route decisions through a governed review flow. |
| Service/Class fill-down | `REPLACE` | Create impact-previewed proposals only for eligible unresolved targets; preserve stronger evidence. |
| Filters placeholder | `REPLACE` | Implement indexed facets with visible AND/OR semantics and complete-dataset counts. |
| Collapse/expand hierarchy | `RETAIN` | Keep logical expansion state without rendering all descendants. |
| DTXR wall-thickness button | `RELOCATE` | Move exact evidence inspection/approved derivation into the review drawer. |
| Topology autofix and viewer overlays | `RELOCATE` | Move to a separate topology-preflight authority boundary. |
| Topology acceptance mutating `sharedModel.supports` | `RETIRE` from enrichment | Enrichment remains read-only to geometry and topology. |
| Demonstration data when no model is loaded | `RETIRE` | Empty model remains explicitly blocked; synthetic fixtures stay test-only. |
| Run fallback verification | `RETIRE` | No default-zero, config-default, generic density, standard-wall, or hidden fallback authority. |

## State-mutation map

| Authority | Current touchpoint | Phase 0 containment rule |
|---|---|---|
| DOM | `innerHTML`, generated tables/inputs, status text, row visibility | Fixture/index/benchmark code runs with DOM creation and mutation rejected; before/after semantic hashes match. |
| `localStorage` | master-data singleton initialization and persistence | Phase 0 modules neither read nor write storage; spies reject all writes with machine-readable codes. |
| Project Data | topology tolerance read; store exposes import/update/clear | Phase 0 uses read-only snapshots only; mutation APIs fail and semantic hashes remain unchanged. |
| Master data | normalized line-list rows and mutable singleton APIs | Tests use caller-supplied synthetic snapshots; recursive proxies reject mutation. |
| Shared model | component/support reads; topology accept replaces supports | Recursive proxies reject object, array, Map, Set, and typed-array mutation. |
| Topology/viewer events | `topology:*`, `viewport:*`, rebuild events | Valid runs emit no events; guarded dispatch rejects topology and viewport events. |
| Source files | production JS, Project Data, fixture/check files | Before/after SHA-256 manifests match; writes outside an explicit temporary evidence directory fail. |

## Canonical Phase 1 data flow

```text
immutable snapshot
  -> stable target identity table
  -> duplicate-preserving normalized-key and locator indexes
  -> bitset facets and exception queues
  -> stable visible-order vector
  -> bounded row/column viewport DTOs
  -> recycled DOM rows
```

Components use compressed line-to-component adjacency and are materialized only in a separately bounded drill-down viewport.

## Phase 0 invariant

This work freezes and measures current risks without changing `src/workspace/lfea-preflight-ui.js`. It creates no engineering approval, production authority, topology decision, solver authorization, or release qualification.
