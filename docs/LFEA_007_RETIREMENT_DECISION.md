# LFEA-007 Retirement Decision

Status: PROPOSED ON PHASE 1B BRANCH

## Decision

The orphaned `lfea-007` read-only Local FEA consumer suite is formally retired rather than repaired.

The retired package described a historical application-shell consumer for already-qualified continuum review/export artifacts. Its production modules are absent, its checks are not registered in `package.json`, and its workflow cannot qualify the current application shell. It is not the Priority 2 piping consumer and must not be used as evidence for the B-2/B-3/B-4 piping chain.

## Retirement boundary

The retirement removes together:

- `.github/workflows/lfea-007-certification.yml`;
- `scripts/lfea-007-*.mjs`;
- `e2e/lfea-007-local-fea-consumer.spec.js`;
- `docs/element-fea/LFEA-007_APPLICATION_CONSUMER.md`.

The historical v10 registry schema is retained only as an immutable legacy contract. It is not the active application registry. The current v11 application registry and navigation do not advertise `LOCAL_FEA`; they expose the independent `LAFEA` and `LFEA` workbenches instead.

## Non-scope

This retirement does not modify:

- continuum element mechanics;
- LAFEA mechanics or meshing;
- the current v11 LFEA workbench;
- Priority 2 piping mechanics;
- the bounded `linear-piping-analysis-consumer` T0 package.

## Audit finding

This decision addresses `AUD-L007-001` only when the retirement source guard passes and the deleted workflow/scripts/document/browser suite are absent at the exact phase head.
