# Phase 9 — Unified Analysis Readiness and Solver Applicability

## Status

Phase 9 professionalizes the Workspace pre-calculation boundary. It does not change solver equations, engineering datasets, viewport geometry, result history, or report serialization.

## Canonical flow

```text
selected entity
→ capability manifest
→ input inspection
→ applicability evaluation
→ workspace-analysis-readiness/v1
→ Properties readiness card
→ reviewed analysis session
→ coordinator execution gate
```

## Core contract

`workspace-analysis-readiness/v1` contains:

- capability identity;
- target and dataset identity;
- solver ID and version;
- method ID and version;
- engineering level;
- code or method basis;
- applicability decision and reason;
- qualification status;
- required, resolved, missing, and invalid input evidence;
- assumptions and limitations;
- deterministic diagnostics;
- `readyToReview` and `readyToRun` decisions.

Qualification status is one of:

```text
READY_FOR_REVIEWED_EXECUTION
INPUT_REQUIRED
NOT_APPLICABLE
```

## Applicability versus readiness

Applicability and input completeness are separate decisions.

### Applicable and ready

The selected entity is within the method domain and all required input evidence is available and valid.

```text
readyToReview = true
readyToRun = true
```

### Applicable but input required

The selected entity is within the method domain, but required evidence is missing or invalid. A review session may be opened so explicit overrides can complete the input set.

```text
readyToReview = true
readyToRun = false
```

### Not applicable

The selected entity is outside the method domain. No session can be opened and no execution command is accepted.

```text
readyToReview = false
readyToRun = false
```

## Capability manifests

Every Workspace capability must provide:

```text
solverId
solverVersion
methodId
methodVersion
codeBasis[]
assumptions[]
limitations[]
applicability(context)
```

Missing or empty manifests are registration errors. Solver and method metadata are presented in Properties and copied into the active analysis session readiness snapshot.

## Registered capabilities

### Support-load screening

```text
solverId: workspace-support-load-screening
solverVersion: 1.0.0
methodId: ACCESS_TEMP_WALL_WEIGHTED_V1
methodVersion: 1
engineeringLevel: BENCHMARKED_SCREENING
```

Applicable to:

- a selected pipe;
- a selected support linked unambiguously to one pipe.

Not applicable to unrelated components or ambiguous support-to-pipe relationships.

### Pipe-flexibility screening

```text
solverId: workspace-simplified-2d-screening
solverVersion: 1.0.0
methodId: SIMPLIFIED_2D_TOPOLOGY_SCREENING
methodVersion: 1
engineeringLevel: BENCHMARKED_SCREENING
```

Applicable only to selected pipe entities. Missing line identity, connected legs, or engineering parameters creates an input-required state rather than a false non-applicability result.

## Session rules

- A non-applicable readiness contract cannot create a session.
- Applicable incomplete readiness creates a draft session.
- Applicable complete readiness creates a ready session.
- Every session retains the exact immutable readiness snapshot used during inspection.
- Overrides trigger reinspection and a new session revision.
- Imported and normalized dataset records remain unchanged.

## Execution rules

The Workspace coordinator accepts execution only when:

1. an active session ID is supplied;
2. the session matches dataset, target, workspace version, and capability;
3. readiness is recomputed using the reviewed session overrides;
4. the recomputed contract is `readyToRun`;
5. the capability execution succeeds;
6. the returned solver result satisfies `solver-result-contract-v1`.

A direct request without a reviewed session fails with:

```text
UNREVIEWED_ANALYSIS_SESSION
```

An inspected session that is no longer runnable fails with:

```text
REVIEWED_INPUTS_NOT_RUNNABLE
```

## Presentation boundary

`analysis-readiness-view.js` renders:

- qualification badge;
- solver and method versions;
- engineering level;
- applicability;
- code or method basis;
- missing and invalid counts;
- assumptions;
- limitations;
- diagnostics;
- review action state.

The view imports no solver, capability implementation, registry, or session store.

## Guardrails

- No new solver mathematics.
- No hidden engineering defaults.
- No automatic execution.
- No renderer-side readiness logic.
- No mutation of imported data.
- No React or Zustand in `src/workspace`.
- No runtime module over 300 lines.
- No timestamps or random identifiers.
- Existing Phase 1–8 behavior remains compatible.

## Certification

Phase 9 certification proves:

1. strict manifest validation;
2. deeply immutable readiness contracts;
3. ready, input-required, and not-applicable states;
4. missing and invalid evidence separation;
5. solver and method provenance in Properties and sessions;
6. incomplete applicable session opening;
7. non-applicable session denial;
8. unreviewed execution denial;
9. reviewed successful execution;
10. selection, clear, and teardown lifecycle compatibility;
11. all prior Workspace, engineering, benchmark, release, and build gates remain green.
