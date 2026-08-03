# Authorized enrichment consumer controller

This controller is the application-facing seam for the two non-LFEA consumers.

`executeEmpirical(...)` accepts one validated `authorized-empirical-load-input/v1`, an explicit execution identity and timestamp, and passes it to the existing authorized engineering-model store with the current master-data container.

`downloadStagedJson(...)` accepts one validated `authorized-staged-json-sidecar/v1`, exact source text evidence, explicit mapping/formatting, write identity/time and download identity/time. It runs the merged writer and explicit browser-download boundary, then returns an immutable operation result binding every sidecar, write and download hash.

The controller registers no events or listeners and creates no automatic execution path. It does not approve inputs, persist Project Data, mutate workspace state or topology, or touch LFEA/solver code.
