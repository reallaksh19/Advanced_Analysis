# Authorized enrichment workspace API

The browser application exposes two explicit non-LFEA methods on `globalThis.AnalysisWorkspace`:

- `executeAuthorizedEmpiricalLoads(request)` forwards a validated authorized empirical consumer request to the governed empirical execution controller.
- `downloadAuthorizedEnrichedStagedJson(request, runtime?)` forwards a validated stagedJson consumer request and binds it to the application's document for an explicit download.

The API is a thin, frozen adapter. It does not register listeners, subscribe to events, create approvals, synthesize timestamps or IDs, persist Project Data, or replace the existing legacy calculation button. Callers must already possess the complete authorized request artifacts.
