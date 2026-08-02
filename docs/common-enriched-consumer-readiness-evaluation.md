# Common enriched consumer-readiness evaluation

Phase 11 evaluates a published enrichment baseline against explicit consumer policies.

- Exactly one policy is required for each supported consumer.
- An unconfigured consumer is `BLOCKED_NOT_CONFIGURED`; it is never omitted or assumed ready.
- Current shared-model and master-snapshot bindings are compared with the baseline before field checks.
- Required fields are evaluated on every target of the configured target kind.
- Stale source evidence has highest blocker precedence, followed by missing/unresolved fields, then unapproved fields.
- `READY` requires every required field to be present, current, approved, and applicable under the policy.
- A single aggregate field index avoids rescanning every target for each requirement.

The evaluator emits immutable `common-enriched-consumer-readiness/v1` records and a semantic-hashed evaluation envelope. It does not execute empirical calculations, stagedJson export, LFEA, topology work, or a solver.

```bash
node scripts/run-common-enriched-consumer-readiness-evaluation-checks.mjs
```
