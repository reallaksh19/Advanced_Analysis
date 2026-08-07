# Non-FEA Load Calc — Practical End-to-End Operating Plan

This document is the practical release plan for the governed Non-FEA workflow inside **Advanced Analysis → Load Calc**. It is intentionally operational: each stage names the user action, authority owner, durable evidence, fail-closed stop condition, and what the stage is *not* allowed to become.

## Release principle

A usable calculation is not “data loaded → solver ran”. The governed path is:

**source → project/master custody → enrichment review → common checker → seal → analysis plan → qualified implementation binding → Engineering Foundation handoff → explicit authorization → execution → result custody/currentness → 3D investigation → edit/staleness/reseal loop**.

No downstream stage may silently repair, default, reinterpret, or outrank an upstream authority.

## 1. Load and normalize the source model

- **User action:** open/import the project SJSON/dataset and review normalization/topology diagnostics.
- **Authority owner:** normalized dataset/shared piping model plus topology/support attachment source contracts.
- **Evidence:** dataset/source SHA-256, shared-model semantic hash, topology/support attachment hashes.
- **Proceed when:** the source model needed by the requested method is available with exact stable entity identity.
- **Stop when:** source identity, connectivity, or required support attachment identity is missing/ambiguous.
- **Not authority:** Load Calc UI, 3D rendering, enrichment, or a method runtime may not repair source topology or invent entity identity.

## 2. Establish Project Data and canonical load cases

- **User action:** review/edit Project Data on its owning surface and select explicit canonical analysis load cases.
- **Authority owner:** Project Data store/policy contracts and canonical Load Case authority.
- **Evidence:** Project Data profile/revision semantic hash, configured-default usage ledger, canonical load-case authority receipt.
- **Proceed when:** the requested workflow audits are valid and every method case configuration refers to an authorized canonical load case.
- **Stop when:** required values are missing or legacy/free-form selection would require an invented precedence rule.
- **Not authority:** a method runtime must not choose a project default, temperature case, or load case by guesswork.

## 3. Review Master Data exact-match candidates

- **User action:** load/approve the relevant Masters, inspect exact candidate matches, and decide whether to accept useful proposals.
- **Authority owner:** approved Master snapshot for provenance; accepted project enrichment remains the project-value authority.
- **Evidence:** Master source hash/snapshot hash, exact-match basis, candidate provenance, accepted enrichment record when explicitly accepted.
- **Proceed when:** exact candidate identity is unique and any required project enrichment is explicitly accepted.
- **Stop when:** a Master is unapproved, duplicate exact matches conflict, or only fuzzy/display-name matching is possible.
- **Not authority:** Master automation cannot auto-accept a value or directly become calculation/authorization authority.

## 4. Resolve enrichment and overrides

- **User action:** review accepted project enrichment, exact ephemeral defaults, configured project defaults, and unresolved fields on **Enrichment & Overrides**.
- **Authority owner:** common enrichment resolver and accepted enrichment sidecar.
- **Evidence:** enrichment sidecar, field-resolution ledger, source-bound proposal/acceptance provenance.
- **Resolution order:** accepted project enrichment → auto exact line/class/Master candidate where allowed → configured project default → proposal-only candidate.
- **Proceed when:** all fields required by the requested methods resolve without same-authority conflict.
- **Stop when:** required fields remain unresolved, source custody is stale, or equal-authority values conflict.
- **Not authority:** enrichment cannot mutate coordinates, ports, connectivity, attachments, or support membership.

## 5. Run the common Input Check

- **User action:** open **Input Check** and evaluate the current source/project/master/enrichment state.
- **Authority owner:** common checker; the workspace status projection is read-only presentation only.
- **Evidence:** checker request/report, field-resolution ledger, eight A–H lifecycle gates, per-common-method readiness rows.
- **Proceed when:** the requested common methods are `READY` and the package state permits sealing.
- **Stop when:** any required method is blocked; unrelated method blockers remain visible but do not silently contaminate a method that has independent complete evidence.
- **Not authority:** `non-fea-workspace-status-projection/v1` cannot resolve fields, seal, authorize, execute, or calculate.

## 6. Seal the current common input

- **User action:** explicitly seal the checker output on **Seal & Export**; acknowledge any permitted partial seal exactly.
- **Authority owner:** common-input seal contract.
- **Evidence:** `common-enriched-piping-input/v1`, seal semantic hash, source/project/master/enrichment revision vector.
- **Proceed when:** the exact requested method set is sealed and the seal is current.
- **Stop when:** any bound authority changes after sealing; the seal becomes stale and must be re-evaluated/resealed.
- **Not authority:** a seal proves current input custody/readiness; it is **not** method authorization.

## 7. Build the analysis plan and select a qualified implementation

- **User action:** review **Method Basis** and explicitly select the implementation appropriate to the requested common method/topology.
- **Authority owner:** common analysis plan plus implementation registry/bindings.
- **Evidence:** `non-fea-analysis-plan/v1`, implementation registry hash, explicit implementation binding(s), topology eligibility receipt where applicable.
- **Proceed when:** the implementation is registered and qualified for the requested common method and topology.
- **Stop when:** implementation is unregistered/unqualified, topology is disconnected/unsupported, or a branch/cycle requires a coupled implementation that is not available.
- **Not authority:** topology eligibility recommends/blocks implementation families; it does not authorize execution.

### Reconciled empirical runtime availability

After current-main reconciliation, the runtime registry contains:

- `EMPIRICAL_BEAM_CONTACT_V1` — registered, qualified restricted domain.
- `EMPIRICAL_RESTRAINT_NETWORK_V1` — registered, qualified restricted domain for the simple-chain line-stop domain.
- `EMPIRICAL_RESTRAINT_NETWORK_V2` — registered, qualified restricted domain for coupled branch/loop thermal screening.

The common method-consumption map binds both restraint-network implementations to `THERMAL_FREE_DISPLACEMENT` + `RESTRAINT_REACTIONS` and binds beam/contact to the sustained/vertical-contact common methods. Selection remains explicit and topology-gated.

`EMPIRICAL_OPERATING_REACTION_SUPERPOSITION_V1` is intentionally **not claimed as common executable authority** merely because current main contains an operating-reaction combiner. The common operating-reaction DAG remains preparation-only until that implementation is explicitly registered and qualified in the common implementation registry.

## 8. Build and bind the Engineering Foundation handoff

- **User action:** review the method-basis/Foundation evidence produced for the selected implementation.
- **Authority owner:** neutral Engineering Foundation contracts.
- **Evidence:** Foundation semantic hash, capability binding hash, handoff semantic hash, effective restraint capability, topology/mass/thermal/governance evidence actually consumed by the method.
- **Proceed when:** every capability required by the selected implementation is present and current.
- **Stop when:** a required capability is missing/stale or source identity cannot be crosswalked exactly.
- **Not authority:** Engineering Foundation prepares governed engineering evidence but does not authorize or execute a method.

## 9. Explicitly authorize the method

- **User action:** press **Authorize scenario** only after reviewing the current seal, implementation, scenario request, plan, and Foundation handoff.
- **Authority owner:** one `NonFeaMethodExecutionCoordinator` and method-authorization contract.
- **Evidence:** `non-fea-method-authorization-receipt/v3` binding implementation ID, scenario/method request, common seal, revision vector, analysis plan, implementation binding, and Foundation handoff.
- **Proceed when:** authorization is recorded and remains current.
- **Stop when:** any bound authority changes; authorization becomes stale and cannot be used for execution.
- **Not authority:** a common method ID or scenario draft is not implementation authorization.

## 10. Execute the method-specific runtime

- **User action:** press **Calculate empirical method**.
- **Authority owner:** selected method runtime, invoked only after the common coordinator confirms current authorization.
- **Evidence:** exact engine execution artifact/result plus `non-fea-method-execution-receipt/v3`.
- **Proceed when:** execution receipt recording succeeds against the exact authorized implementation and current Foundation/common-input bindings.
- **Stop when:** authorization is stale, implementation binding changed, Foundation changed, or result/engine semantic hashes cannot be recorded consistently.
- **Fail-closed reconciliation rule:** if a runtime result is produced but common execution-receipt recording fails, the empirical scenario/result overlay is forced stale; it cannot remain displayed as current governed evidence.

## 11. Record and assess results

- **User action:** review method-owned result tables/evidence and export/package where required.
- **Authority owner:** method-specific result schema; common result package only provides custody/indexing.
- **Evidence:** method result semantic hash, execution receipt, `non-fea-result-package-envelope/v1`, result/currentness assessment.
- **Proceed when:** the result package matches the execution receipt and currentness is acceptable for the intended reuse.
- **Stop when:** result payload/engine execution does not match its receipt or current authority has changed.
- **Not authority:** the common result envelope does not translate result schemas or recalculate/reinterpret forces/moments.

## 12. Investigate in shared 3D

- **User action:** use **Inspect 3D** from restraint/result rows or open the shared governed SJSON viewport.
- **Authority owner:** existing governed renderer and canonical selection coordinator for display identity only.
- **Evidence:** `non-fea-3d-investigation-projection/v1`, exact workspace entity → canonical render identity crosswalk, governed result overlay currentness.
- **Proceed when:** an exact workspace entity maps to a current render target.
- **Stop when:** identity is ambiguous/missing; no proximity/coordinate fallback is permitted.
- **Not authority:** 3D cannot repair topology, mutate engineering geometry, translate result schemas, calculate, authorize, execute, or make a stale result current.

## 13. Edit → stale → re-evaluate → reseal → reauthorize → re-execute

Any source, Project Data, relevant Master, accepted enrichment, implementation binding, or Foundation change invalidates downstream custody according to its revision bindings.

Operational loop:

1. make the edit on the owning surface;
2. observe stale state in the read-only workspace projection;
3. rerun Input Check;
4. explicitly reseal;
5. rebuild/review analysis plan and Foundation handoff if affected;
6. explicitly reauthorize;
7. explicitly re-execute;
8. reassess result currentness.

No stale downstream artifact is silently upgraded to current.

## 14. Combined operating reaction path

The combined operating reaction architecture is deliberately split:

- thermal free movement is calculated only by its governed basis contract for explicit load cases;
- topology selects V1 versus V2 restraint-network eligibility without fallback;
- the operating-reaction dependency DAG verifies prerequisites, source-binding compatibility, support custody, coordinate frame, superposition policy, and force/moment ownership;
- vertical and line-stop child results remain method-owned and are not recomputed by the DAG;
- the DAG performs **no vector arithmetic and no execution**.

Only after `EMPIRICAL_OPERATING_REACTION_SUPERPOSITION_V1` is explicitly registered/qualified and a current authorization path exists may a runtime combiner be treated as common executable authority.

## 15. Release / merge gate

A reconciled release head may merge only when all of the following are true:

1. the feature head contains current `main` as an ancestor (or an intentional two-parent reconciliation commit);
2. GitHub reports the PR mergeable with no unresolved content conflicts;
3. the dedicated exact-head Non-FEA workflow proves the exact reconciled SHA;
4. deterministic Phase 2–6 checks pass;
5. current-main empirical beam/restraint/coupled-restraint/operating-reaction/result-overlay regression checks pass alongside the common authority checks;
6. import graph and production build pass;
7. Chromium dataset-bootstrap and integrated Load Calc/Input Check browser contracts pass;
8. the exact qualified SHA is the SHA supplied to the merge operation;
9. if `main` moves after reconciliation, integration is repeated before merge.

## Practical completion criterion

The plan is complete only when a user can trace, in the product and evidence, **where a value came from, why a method is ready, which implementation is qualified, what exact seal/Foundation/authorization it consumed, what result was produced, whether that result is current, and what action is required after an edit**—without relying on 3D, a Master candidate, a common seal, or a result envelope as a substitute for the authority that actually owns that decision.
