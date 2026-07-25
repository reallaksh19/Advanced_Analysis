# Phase 6 — Immutable Analysis Sessions

## Purpose

Phase 6 adds a visible, reviewable engineering-input boundary between contextual capability discovery and certified solver execution.

The imported workspace dataset remains immutable. User-entered values are stored only as reviewed session overrides.

```text
Selected entity
→ capability input inspection
→ source / derived / missing evidence
→ analysis-session/v1
→ reviewed overrides
→ readiness recomputation
→ analysis:requested(sessionId)
→ AnalysisCoordinator
→ certified solver result
→ session result linkage
```

## Source-of-truth rules

1. `analysis-workspace-dataset/v1` remains the imported engineering evidence.
2. `WorkspaceState` remains the selection and dataset-state owner.
3. `analysis-session/v1` is a downstream review/execution record, not a replacement dataset.
4. Session overrides never mutate normalized entities or source package content.
5. Solver results remain `solver-result-contract-v1`.

## Session contract

An active session contains:

- deterministic `sessionId`;
- `targetId` and `analysisType`;
- source `datasetId` and `workspaceVersion`;
- session `version`;
- immutable input field descriptors;
- reviewed `overrides`;
- per-field validation errors;
- readiness and missing-input evidence;
- execution status;
- linked certified result or deterministic failure.

Only one active session is supported in Phase 6. Opening another session replaces the previous review context.

## Input field descriptor

Each capability-owned input descriptor contains:

```text
key
label
unit
kind
required
editable
value
source
sourcePath
validation
```

`source` is one of:

- `source` — explicit imported engineering evidence;
- `derived` — deterministic value derived from imported evidence or geometry;
- `override` — reviewed session value;
- `missing` — unresolved input.

The inspector is bounded to 64 fields per capability.

## Runtime ownership

### AnalysisCapabilityRegistry

- registers capability definitions;
- lists readiness for selected entities;
- inspects capability-owned input descriptors;
- evaluates readiness against a frozen session context;
- executes validated adapters.

### AnalysisSessionStore

- creates deterministic session identities;
- stores deeply immutable snapshots;
- revisions clear stale results;
- retains prior valid overrides when a new value fails validation;
- links running, completed, and failed execution states.

### AnalysisSessionController

- owns open, override, reset, close, selection, and clear workflows;
- validates overrides against field contracts;
- recomputes capability inspection after every valid change;
- publishes session snapshots;
- follows analysis lifecycle events for result linkage.

### AnalysisCoordinator

- remains the only runtime solver invoker;
- validates session target, capability, dataset, and workspace version;
- injects only frozen session overrides into the capability context;
- validates every completed solver result;
- suppresses stale completions.

### Properties panel

The Properties panel is presentation-only. It publishes commands and renders:

- provenance and evidence paths;
- effective values and units;
- reviewed override controls;
- validation messages;
- readiness;
- manual run/reset/close actions;
- current result/failure.

It does not import solvers, capability implementations, the registry, or the session store.

## Capability behavior

### Support-load screening

Reviewed overrides map only to documented canonical source fields such as OD, wall, unit weights, insulation data, temperature, spans, and component weight.

The fixed certified formula profile remains explicit. Project engineering inputs are never defaulted.

### Pipe-flexibility screening

Reviewed inputs are:

- `deltaT`;
- `alpha`;
- `E`;
- `od`;
- `Sa`.

Connected route geometry remains read-only derived evidence and cannot be overridden. Objects that only share a line identifier are not combined unless geometrically connected.

## Event contract

```text
analysis:sessionOpenRequested
analysis:sessionOverrideRequested
analysis:sessionResetRequested
analysis:sessionCloseRequested
analysis:sessionChanged
```

`analysis:requested`, `analysis:started`, `analysis:completed`, and `analysis:failed` accept an optional `sessionId`.

## Lifecycle guarantees

- Selection change discards a session for the prior target.
- Dataset clear discards the active session.
- Closing review discards the session.
- Destroy removes all session listeners and clears the store.
- Invalid overrides leave the prior valid override unchanged.
- Session revision clears stale results.
- Mismatched or stale sessions fail before solver execution.
- No timestamps or random identifiers are used.

## Non-goals

- multiple saved sessions or history;
- report export;
- dataset enrichment writes;
- model editing;
- automatic solver execution;
- legacy calculation-tab restoration;
- final code stress-analysis claims.

These are candidates for later phases after Phase 6 is certified.
