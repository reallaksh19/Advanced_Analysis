# LAFEA Bucket B0 — Every-Main Exact-Head Status

## 1. Purpose

The current-main B0 gate must certify the exact repository head that users and later work packages consume. A path-filtered push workflow is insufficient because a change outside the Bucket write set can still alter repository integration, imported dependencies, package scripts, browser fixtures or retained authority checks.

This package therefore adds one status-producing workflow that runs on every push to `main` and publishes an exact-head Git commit status.

## 2. Status identity

```text
workflow: LAFEA B0 Every-Main Certification Status
context:  lafea-template-b0/current-main
```

A successful status is bound to one exact commit SHA and means that the following completed on that SHA:

```text
exact checkout and base ancestry
locked dependency installation
B0 freshness and compatibility check
retained Bucket template stack
current non-Bucket authority stack
production build
full repository gate
patch hygiene and tracked clean tree
```

The status is not transferable to a later `main` head.

## 3. Trigger policy

```text
push to main: every push, without path filtering
pull request: B0-relevant paths only
```

The unfiltered `main` trigger is intentional. It closes the gap where an unrelated merge advances `main` without running B0 against the resulting repository composition.

## 4. Evidence

Every run writes:

```text
lafea-template-b0-every-main-status/v1
```

The matrix includes:

```text
exactHead
baseSha
eventName
status
disposition
per-step outcomes
failures
template counts
authority summary
```

The workflow uploads SHA-bound logs, the B0 report and the status matrix as an Actions artifact. The published commit status links to the exact workflow run.

## 5. Authority retained

A successful status does not promote a template. It retains:

```text
CATALOGUED          27
ENGINE_EXECUTABLE    0
LIFECYCLE_READY      0
RESULT_READY         0
RELEASE_QUALIFIED    0
T7C                   IMPORT_FOR_EDITING_ONLY
T7D                   UNAUTHORIZED
```

The workflow does not issue source authority, execute a template, initialize or register lifecycle evidence, bind results, generate meshes, change shell formulation, alter numerical tolerances or qualify release.

## 6. B1 entry gate

B1 may start only when the currently resolved `main` SHA has:

```text
context = lafea-template-b0/current-main
state   = success
```

If `main` advances, the previous success becomes historical evidence and B1 pauses until the new head receives its own successful status.

## 7. Failure behavior

Any failed or missing step produces:

```text
status       = FAIL
disposition  = CURRENT_MAIN_B0_NOT_CERTIFIED
commit state = failure
```

The failure matrix and logs are retained. The workflow never converts a repository integration failure into a bounded PASS and never weakens tests, tolerances, benchmark values or authority boundaries to make the status green.
