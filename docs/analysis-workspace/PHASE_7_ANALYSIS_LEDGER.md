# Phase 7 — Analysis Ledger, Comparison, and Report Export

## Status

Phase 7 adds dataset-scoped immutable analysis history to the consolidated Analysis Workspace. It does not change solver execution, `AnalysisSession.v1`, `WorkspaceState`, or the certified solver-result contract.

## Canonical flow

```text
Completed / failed AnalysisSession.v1
→ AnalysisLedgerController
→ AnalysisLedger.v1
→ active entry / comparison pair
→ AnalysisReport.v1
→ deterministic JSON / CSV / Markdown artifact
→ explicit browser download
```

## Ownership boundaries

### `AnalysisSessionStore`

Owns one active reviewed session and its input lifecycle:

- draft
- ready
- running
- completed
- failed

Closing or replacing the active session does not own or delete historical evidence.

### `AnalysisLedgerStore`

Owns immutable terminal evidence for the active dataset:

- deterministic ledger entry sequence
- the latest 100 archived completed and failed session snapshots
- dataset-wide duplicate suppression until the dataset resets
- active result designation
- optional left/right comparison selection
- dataset-scoped lifecycle

The visible entry list is bounded to 100 records. Entry IDs remain monotonic for the dataset, and archive keys remain remembered for the complete dataset lifetime so a delayed duplicate event cannot reintroduce a rolled-off session request.

The ledger never invokes a solver and never mutates a session.

### `AnalysisLedgerController`

Owns EventBus orchestration for:

- terminal-session archival
- dataset reset
- active-entry selection
- comparison selection/reset
- history clearing
- report construction
- explicit export and download

### Properties panel

The Properties panel remains presentation-only. It publishes validated ledger commands and renders ledger snapshots. It does not import the ledger store, report builder, export serializer, or solver implementation.

## Contracts

### `analysis-ledger/v1`

```text
schema
├── datasetId
├── entries[]
├── activeEntryId
├── comparison
│   ├── leftEntryId
│   └── rightEntryId
└── version
```

### `analysis-ledger-entry/v1`

Each entry contains:

- deterministic `entryId`
- deterministic sequence
- archive key derived from `sessionId + requestId`
- dataset identity
- the complete deeply immutable terminal `AnalysisSession.v1`

Duplicate completion or failure notifications cannot create duplicate entries, including after an older visible record has rolled off the 100-entry window.

### `analysis-ledger-comparison/v1`

Comparison is allowed only when entries:

- are distinct;
- belong to the same dataset;
- use the same analysis capability.

The comparison flattens bounded engineering evidence into stable paths and classifies every row as:

- `equal`
- `changed`
- `left-only`
- `right-only`

Compared domains include:

- archive, session, request, workspace-version, and session-version trace
- target and capability identity
- inspected input evidence
- reviewed overrides and field-validation evidence
- readiness
- result status, summary, values, warnings, diagnostics, and metadata
- failure evidence

### `analysis-report/v1`

Report mode is either:

- `single` — the selected active ledger entry;
- `comparison` — a complete compatible left/right pair.

The report preserves dataset, archive, entry, session, request, target, capability, workspace-version, session-version, input, override, field-validation, result, and failure traceability.

### `analysis-export-artifact/v1`

Supported formats:

- JSON
- CSV
- Markdown

Artifacts contain:

- stable filename
- MIME type
- UTF-8 content
- deterministic byte length
- source report ID

No dates, timestamps, randomness, or environment-dependent identifiers are written.

## Lifecycle rules

History is preserved when:

- the selected entity changes;
- the active reviewed session is closed;
- another reviewed session is opened;
- an entry is designated active;
- comparison is reset.

History is cleared when:

- a new dataset is loaded;
- the dataset is cleared;
- the user explicitly clears history;
- the workspace is destroyed.

Explicit history clearing retains the current dataset identity and resets the visible entry sequence for that new history window. Dataset clearing removes the dataset identity and all duplicate-suppression evidence.

When rollover removes an entry selected for comparison, the comparison selection is cleared. The newest archived entry becomes active.

## Event contracts

```text
analysis:ledgerChanged
analysis:ledgerActiveRequested
analysis:ledgerComparisonRequested
analysis:ledgerComparisonResetRequested
analysis:ledgerClearRequested
analysis:ledgerFailed
analysis:exportRequested
analysis:exportCompleted
analysis:exportFailed
```

All write operations are command events. `analysis:ledgerChanged` is the canonical immutable state notification.

## Guardrails

- No solver execution from the ledger.
- No imported-dataset or normalized-entity mutation.
- No active-session mutation during archival.
- No duplicate archival for the same session request.
- Visible history is limited to 100 terminal entries.
- No timestamp or random identifiers.
- No automatic exports.
- No report-tab restoration.
- No React or Zustand inside `src/workspace`.
- No runtime module over 300 lines.

## Certification

Phase 7 certification covers:

1. deterministic terminal archival;
2. duplicate-event idempotency, including after rollover;
3. 100-entry bounded retention and comparison invalidation;
4. deep immutability;
5. active-result selection;
6. compatible comparison and stable row classification;
7. complete archive/session/request traceability;
8. single and comparison report validation;
9. byte-stable JSON, CSV, and Markdown output;
10. explicit browser download behavior;
11. session-close and selection preservation;
12. dataset and teardown reset boundaries;
13. listener disposal;
14. all prior workspace, engineering, benchmark, release, and production-build gates.

## Non-goals

Phase 7 does not provide:

- persistent server or browser storage across reloads;
- signatures or issue approval workflow;
- PDF generation;
- spreadsheet generation;
- report templates;
- model editing;
- additional engineering calculators.
