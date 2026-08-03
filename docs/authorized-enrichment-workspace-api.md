# Authorized enrichment workspace API

The browser application exposes two explicit non-LFEA methods on `globalThis.AnalysisWorkspace`:

- `executeAuthorizedEmpiricalLoads(request)` forwards a validated authorized empirical consumer request to the governed empirical execution controller.
- `downloadAuthorizedEnrichedStagedJson(request, runtime?)` forwards a validated stagedJson consumer request and binds it to the application's document for an explicit download.

After an explicit empirical call succeeds, the adapter publishes the existing engineering-model `CHANGED` event with the returned distribution. If validation or execution fails, it publishes the existing `FAILED` event and rethrows the same error. This refreshes the current Load Calc view without adding a listener, a new event topic, or an automatic trigger.

The API is a thin, frozen adapter. It does not create approvals, synthesize timestamps or IDs, persist Project Data, or replace the existing legacy calculation button. Callers must already possess the complete authorized request artifacts.
