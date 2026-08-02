# LFEA Piping Phase 6H — WP-2 Authority Binding

## Scope

Phase 6H materializes caller-supplied external evidence. It does not create engineering authority. This control requires the approved WP-2 Project Authority Index to be present and valid before any external qualification package can be compiled.

## Contract transition

| Contract | Previous | Current |
|---|---|---|
| Materialization request | `lfea-piping-external-materialization-request/v1` | `lfea-piping-external-materialization-request/v2` |
| Materialization summary | `lfea-piping-external-materialization-summary/v1` | `lfea-piping-external-materialization-summary/v2` |
| External package request | `linear-piping-external-qualification-package-request/v1` | `linear-piping-external-qualification-package-request/v2` |
| External package | `linear-piping-external-qualification-package/v1` | `linear-piping-external-qualification-package/v2` |

Legacy materialization requests are rejected.

## Required request structure

```json
{
  "schema": "lfea-piping-external-materialization-request/v2",
  "packageId": "<package identity>",
  "exactHead": "<40-character execution head>",
  "projectAuthorityIndex": "records/project-authority-index.json",
  "records": {
    "applicationResult": "records/application-result.json",
    "presentation": "records/presentation.json",
    "realModelReconciliation": "records/real-model-reconciliation.json",
    "commercialCorroboration": "records/commercial-corroboration.json",
    "performanceEvidence": "records/performance-evidence.json",
    "rollbackEvidence": "records/rollback-evidence.json",
    "reviewDisposition": "records/signed-disposition.json"
  }
}
```

All paths must be unique, safe, relative JSON paths outside test, fixture, mock and script roots.

## Validation order

1. Validate invocation and exact execution head.
2. Validate the v2 request and all paths.
3. Read and require an exact canonical `WP2_COMPLETE` authority index.
4. Read the seven external records.
5. Compile and validate the v2 external package.
6. Confirm the package embeds the same authority semantic and evidence identities.
7. Materialize records through a staging directory and atomic rename.
8. Run the existing external release-evidence intake validation.

An unresolved, unsigned, tampered or wrong-candidate authority record stops processing before package compilation.

## Hash and downstream binding

The authority index semantic hash is included in the external package semantic projection. Its evidence hash is included in the package evidence hash.

Phase 6G and Phase 6E already bind and validate the external package semantic and evidence hashes. Therefore, changing the authority index necessarily changes the package identities and invalidates stale downstream evidence without introducing another release route.

## Authority boundary

This control:

- does not populate the WP-2 template;
- does not approve engineering values;
- does not sign for the responsible engineer;
- does not execute a solver or commercial program;
- does not promote G8, G9, G10 or release qualification;
- does not modify the frozen candidate ref.

The source-contract change requires a new immutable execution candidate before real Phase 6H evidence is produced.
