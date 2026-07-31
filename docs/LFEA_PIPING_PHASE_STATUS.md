# LFEA Piping Phase Status

Exact development base: `main` at `a59b5d2ac1d47150aebe1609b0ecdaabeeeaec5e`.

Program disposition: `BLOCKED`.

## Closed in the current governance phase

- The T0 implementation is committed and reproducible through merged PR #16; it is no longer an untracked working-tree-only implementation.
- `check:linear-piping-analysis-consumer` is registered inside `check:lfea-core` and remains explicitly present in the full gate.
- A machine-readable exact-head baseline policy exists.
- A machine-readable release-evidence ledger exists.
- The normal gate validates the fail-closed pre-release policy.
- Release mode refuses any unverified gate, missing evidence artifact or missing exact-head identity.
- Repository documentation now explicitly records that `src/core/workspace-consumers/` exists and that the missing piping capability is a complete end-to-end gateway, not the bounded T0 public gateway.

## Still open

- Exact-head CI evidence is unresolved because repository Actions runs are failing before exposing executable steps or retained logs.
- Source-to-B-2.5/B-3.0 application orchestration is not implemented.
- Governed support, anchor and nozzle interface contracts are not implemented.
- Interface reaction grouping, local-frame transformation, offset transfer and deterministic envelopes are not implemented.
- Nozzle allowable assessment and application-level B31.3 orchestration are not implemented.
- Piping presentation and deterministic exports are not implemented.
- Real-model reconciliation and commercial corroboration have not been supplied.
- The separate continuum `lfea-007` consumer is still broken and unregistered. It is not accepted as implemented evidence and must be restored or formally retired in a separate work package.

## Release rule

No downstream phase may change `programDisposition` to `QUALIFIED` until every gate in `release-evidence/lfea-piping-release-evidence.json` is `VERIFIED`, every required artifact path is populated, and `npm run check:lfea-piping-release` passes at the exact release head.
