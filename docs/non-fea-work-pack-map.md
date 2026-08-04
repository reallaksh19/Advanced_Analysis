# Non-FEA P0–P7 Work Pack and Ownership Map

## Authority

This map operationalizes [`docs/Nonfeaplan.md`](./Nonfeaplan.md). P0 owns only audit/evidence files. No P1–P7 production edit is authorized until the Owner accepts P0.

## Dependency graph

```text
P0 baseline + fixture/ownership freeze
 ├─ P1 import/render performance qualification and fixes
 ├─ P5 enrichment authority and bypass closure
 └─ P6-A empirical formula register/oracle audit

P2 topology core certification
 └─ P3 professional 3D Edit activation

P1 accepted
 └─ P4 large-model navigation certification

P5 accepted + P6 accepted
 └─ P7 common load presentation
```

P1 issue: [#541](https://github.com/reallaksh19/Advanced_Analysis/issues/541).

## Frozen ownership matrix

| Area | P1 | P2 | P3 | P4 | P5 | P6 | P7 |
|---|---:|---:|---:|---:|---:|---:|---:|
| `dataset-controller.js` | owner | read | no | no | read | read | no |
| `dataset-adapter.js` | owner | read | no | no | read | read | no |
| `engineering-model-controller.js` | owner | shared-stop | no | no | read | shared-stop | read |
| `engineering-model-store.js` | owner | shared-stop | no | no | read | shared-stop | read |
| `support-sites/**` | read | owner | read | read | read | shared-stop | read |
| `routes/**` | read | owner | read | read | read | shared-stop | read |
| `resolved-engineering-geometry.js` | owner | read | read | read | no | no | read |
| `viewport-render-model.js` | owner | read | read | read | no | no | read |
| ordinary `three-viewport-*` | owner | no | read | owner after P1 | no | no | overlay-only |
| `topology-edit/**` | read | owner | owner after P2 | routing-only | no | no | read |
| `enrichment/**` | no | no | no | no | owner | read | adapter-only |
| `engineering-loads/**` | no | read | no | no | authority-read | owner | read |
| `SupportLoadPresenter` | no | no | no | no | read | read | owner |
| LFEA/LAFEA packages | forbidden | forbidden | forbidden | forbidden | forbidden | forbidden | read-only adapter only |

## Shared-stop rule

A branch must stop before editing a file marked `shared-stop`, `read`, `no`, `forbidden`, or owned by another active Work Pack. The Owner must revise this map before work continues.

## Branches

- P0: `orchestrator/non-fea-workspace-hardening`
- P1: `agent/p1-import-render-performance`
- P2: `agent/p2-topology-core-certification`
- P3: `agent/p3-professional-3d-edit`
- P4: `agent/p4-large-model-navigation-certification`
- P5: `agent/p5-enrichment-authority-workflow`
- P6: `agent/p6-empirical-formula-certification`
- P7: `agent/p7-common-load-presentation`

Each branch must name the accepted predecessor SHA in its execution ledger but must qualify live behavior rather than asserting that a historical commit is correct.

## Merge order

1. Accept P0.
2. P1/P5/P6-A may proceed in parallel under the frozen ownership map.
3. P2 before P3.
4. P1 before P4.
5. P5 and P6 before P7.
6. Re-run current-main regression after each merge; do not merge a stack and test only at the end.
