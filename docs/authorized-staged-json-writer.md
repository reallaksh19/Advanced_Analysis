# Authorized stagedJson writer

The writer consumes one validated `authorized-staged-json-sidecar/v1` and one exact source stagedJson text artifact.

It verifies the caller-declared source byte length and SHA-256 before parsing. The caller must explicitly provide direct field names for source-record identity, target identity, line identity, attributes, and children, plus output formatting and file name. No repository-specific field mapping or formatting default is inferred.

The writer traverses the cloned source tree, joins every sidecar entry to exactly one source record, verifies optional target and line identities, and merges scalar attributes only. Existing identical values are retained. Existing different values fail closed; the writer never overwrites explicit source evidence. Duplicate source identities, missing sidecar targets, unsafe keys, malformed children, and non-object attributes are blockers.

The output is returned in memory as UTF-8 JSON text with an immutable receipt binding:

- exact source and output SHA-256 digests and byte lengths;
- source and output semantic hashes;
- sidecar identity and semantic hash;
- explicit field mapping and formatting policy;
- visited, identified, matched, added, and retained counts; and
- caller-supplied write identity and timestamp.

This module does not access the file system, download APIs, workspace state, Project Data, topology, calculations, or LFEA paths. Persisting or downloading the returned output remains a separate user action and authority boundary.
