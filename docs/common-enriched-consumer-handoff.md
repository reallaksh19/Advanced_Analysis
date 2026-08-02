# Common enriched consumer handoff

Phase 12 creates a readiness-gated, immutable handoff authorization envelope without executing a consumer.

- The envelope binds a published baseline, one exact readiness evaluation record, a payload descriptor, and an external handoff decision.
- `AUTHORIZE` requires the selected consumer readiness status to be `READY`.
- Blocked readiness may only produce a `DENIED` receipt.
- The decision must bind the exact consumer, baseline hash, readiness hash, and payload hash.
- The payload adapter version and configuration hash must equal the readiness record.
- Payload creation cannot predate baseline publication, and the decision cannot predate payload creation.
- The envelope embeds its validated evidence and is deeply immutable and semantic-hashed.

This contract does not execute empirical calculations, write stagedJson, create an LFEA model, invoke a solver, mutate topology, persist Project Data, or constitute release qualification.

```bash
node scripts/run-common-enriched-consumer-handoff-checks.mjs
```
