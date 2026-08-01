# LFEA-007 Retirement Decision

Decision date: 2026-07-31  
Decision status: **FORMALLY RETIRED FROM THE ACTIVE APPLICATION**  
Audit finding: `AUD-L007-001`

## 1. Decision

The orphaned `LFEA-007` continuum Local FEA consumer suite is **formally retired** from the active application.

This retirement closes the contradictory state in which historical checks and workflow references remained while the required consumer, controller and view implementation was incomplete. Retirement is a containment decision; it does not assert that the retired path was qualified or complete.

## 2. Registry authority

The **historical v10 registry schema** is retained as immutable legacy evidence. Its `LOCAL_FEA` consumer identity and historical navigation entry remain unchanged so that prior records can still be interpreted against the contract that produced them.

The **current v11 application registry** is the active authority. It does not advertise `LOCAL_FEA`. It continues to advertise the governed `LAFEA` and `LFEA` application workbenches under their existing engineering-claim policies.

No active application consumer may reintroduce `LOCAL_FEA` without a new, separately governed implementation and qualification package.

## 3. Priority 2 boundary

The retired `LFEA-007` continuum consumer is **not the Priority 2 piping consumer**.

Priority 2 linear piping analysis is owned by the separately governed linear-piping application chain, including `src/core/linear-piping-analysis-consumer/` and its B-2.x, B-3.x and B-4.0 parent authorities. Retiring `LFEA-007` neither qualifies nor changes that piping chain.

## 4. Retired surface

The retirement removes or prohibits the obsolete active paths identified by `scripts/lfea-007-retirement-check.mjs`, including:

- the former LFEA-007 certification workflow;
- the former LFEA-007 scripts, fixtures and browser specification;
- the obsolete LFEA-007 implementation document;
- `src/core/lfea-consumer/`;
- `src/workspace/lfea-consumer-controller.js`;
- `src/workspace/lfea-consumer-view.js`.

The retirement check must fail if any prohibited path or package-script registration reappears.

## 5. Preserved authorities

This decision does not modify:

- numerical kernels or solver authority;
- the historical v10 registry contract;
- the current v11 `LAFEA` or `LFEA` workbenches;
- the Priority 2 piping mechanics or evidence chain;
- engineering tolerances, code datasets or project inputs;
- release qualification or promotion status.

## 6. Verification

The retirement is executable only when all of the following pass on one exact head:

```text
node scripts/lfea-007-retirement-check.mjs
node scripts/lfea-piping-phase-findings-check.mjs
npm run gate
git diff --check
test -z "$(git status --short)"
```

Until exact-head workflow evidence is retained, the associated phase finding remains `PARTIALLY_VERIFIED`; this decision document alone is not release evidence.
