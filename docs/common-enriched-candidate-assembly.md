# Exact Candidate Assembly

Phase 9 composes the exact enrichment resolutions into one immutable `common-enriched-properties-candidate/v1`.

The assembler requires exactly six immutable source snapshots: line list, piping class, material register, fluid register, insulation register, and component-weight master. It validates every upstream semantic-hash dependency before reading target records.

Five line-resolution sets must cover every line target in the inventory. The component-weight resolution must cover every component target. Record identities, line keys, source-model hashes, and target relationships must match the inventory exactly.

Line fields are merged without precedence. A duplicate target/field from two resolutions fails with `COMMON_ENRICHED_CANDIDATE_FIELD_CONFLICT`, even when the values agree. No source wins by order, recency, confidence, or first-found selection.

The result always remains `UNAPPROVED_CANDIDATE`. Candidate assembly does not publish Project Data, create an approval decision, authorize consumers or solvers, mutate stagedJson, or claim release qualification.

Qualification:

```bash
node scripts/run-common-enriched-candidate-assembly-checks.mjs
```
