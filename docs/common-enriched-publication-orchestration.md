# Common enriched publication orchestration

Phase 10 adds deterministic orchestration around the low-level baseline publisher.

## Authority rules

- A caller must supply a validated `common-enriched-publication-decision/v1`.
- The orchestrator never constructs, defaults, or infers an `APPROVE` decision.
- The decision must bind the exact candidate semantic hash.
- The decision evidence hash must equal the candidate review-ledger hash.
- `REJECT` produces an immutable rejected outcome and never a baseline.
- `APPROVE` requires an explicit baseline ID and publication timestamp.

## Revision and chronology rules

- The first publishable candidate revision is `1`.
- Later candidates must continue the preceding baseline revision by exactly one.
- A predecessor must belong to the same project.
- New baselines cannot reuse the predecessor baseline ID.
- Candidate creation cannot predate the predecessor baseline.
- Decisions cannot predate candidates.
- Publication cannot predate approval.

## Outcome receipt

Every orchestration returns an immutable, semantic-hashed `common-enriched-publication-outcome/v1` receipt. It records the transaction, candidate, review ledger, external decision, predecessor evidence, outcome status, and published baseline when applicable.

The receipt is not Project Data persistence, consumer readiness, stagedJson export, engineering calculation, LFEA binding, solver authorization, or release evidence.

## Qualification

```bash
node scripts/run-common-enriched-publication-orchestration-checks.mjs
```
