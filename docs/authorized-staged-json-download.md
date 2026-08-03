# Authorized stagedJson download

This module is the explicit user-action boundary after creation of an `authorized-staged-json-write-artifact/v1`.

It revalidates the write artifact, creates a browser download artifact bound to the exact output text, byte length, SHA-256, write-artifact hash and write-receipt hash, and triggers the repository-standard Blob URL plus anchor-click flow only when called directly.

The caller supplies a download identity and canonical timestamp. A successful click returns an immutable `authorized-staged-json-download-receipt/v1`; URL revocation occurs in a `finally` block even when the click fails.

No listener is registered automatically. The module does not mutate workspace state, Project Data, topology or source stagedJson, and it does not invoke calculations or LFEA paths.
