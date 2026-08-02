# LAFEA Bucket B7F — Current-Main Qualification

## 1. Purpose

B7F is an evidence-only current-main qualification package for the bounded pilot:

```text
C2D-LUG-PINHOLE -> LAFEA.3
```

It changes no engineering, numerical, lifecycle, display, assessment, code, report or release behavior.

B7F composes the already-merged B7E bucket gate with the complete non-bucket implementation through NB-T6G. It exists because a candidate-head or historical-main PASS is insufficient after `main` advances. The governing B7 issue may close only from retained executable evidence for the exact current `main` head.

## 2. Required retained ancestry

Every candidate and current-main head must contain:

```text
B7D controller merge: 4ea645b91c8b74fae3d2e8af31278d52505cac84
B7E gate merge:       07af67696bede4a809f3a61d1670609a5888b4fe
NB-T6G review merge:  13792e342fe5b9fb494a8103e6d8936245bd05ff
```

Missing ancestry blocks the report.

## 3. Executable composition

The B7F script executes, rather than duplicates:

```text
B7E exact-head aggregate
NB-T6G current-context review-panel check
complete non-bucket stack certification
```

B7E retains:

```text
B7D controller
B7C contracts
B7B benchmark contracts
B7A mapping evidence
B6 caller-mesh binding
strict syntax
import boundaries
production build
patch hygiene
tracked-worktree cleanliness
```

The non-bucket stack retains the complete NB-T0 through NB-T6G, U1 through U4 and workbench contract ladder.

## 4. Reports

B7F retains both reports:

```text
reports/qualification/lafea-b7e-b7-gate-closure.json
reports/qualification/lafea-b7f-current-main-qualification.json
```

The B7F schema is:

```text
lafea-b7f-current-main-qualification-report/v1
```

Its status is limited to:

```text
PASS
BLOCKED
```

A report cannot be `PASS` unless B7E passes for the same exact head, NB-T6G passes, the non-bucket stack passes, required ancestry is present, and the tracked worktree remains clean.

## 5. Candidate versus current-main evidence

A pull-request run produces:

```text
context = CANDIDATE_HEAD
currentMainQualified = false
b7GateClosureEligible = false
```

Even when all executable checks pass, candidate evidence alone cannot close issue #269.

A push run on `refs/heads/main` may produce:

```text
context = CURRENT_MAIN
currentMainQualified = true
b7GateClosureEligible = true
```

only when every retained check passes on that exact main SHA.

The workflow therefore runs on every advance to `main`, including advances caused by unrelated workstreams. This prevents a stale B7 qualification claim after repository integration changes.

## 6. Hosted infrastructure failure

A job with no executable steps, no decoded logs or no uploaded reports remains:

```text
PRE_STEP_INFRASTRUCTURE_FAILURE
```

It is neither a product failure nor qualification evidence. B7 remains open.

## 7. Authority boundary

B7F never authorizes:

```text
general T7D
additional continuum templates
arbitrary lug outer profiles
arbitrary or multiple-hole topology
shell execution
SCL or structural-stress assessment
design-code assessment
formal calculation-report authority
release qualification
LAFEA.6
engineering-authoritative display values
```

The B7F report fixes every corresponding authority field to `false`.

## 8. Gate-closure rule

Issue #269 may close only when all of the following are retained for the same exact current-main SHA:

1. the B7F job contains executable steps;
2. the B7F log exists;
3. both B7E and B7F reports exist;
4. both reports identify the exact current-main SHA;
5. B7E status is `PASS`;
6. B7F status is `PASS`;
7. `context` is `CURRENT_MAIN`;
8. `currentMainQualified` and `b7GateClosureEligible` are `true`;
9. all broader authority flags remain `false`.

Until those conditions are met, the correct disposition remains:

```text
IMPLEMENTATION MERGED THROUGH NB-T6G
CURRENT-MAIN EXECUTABLE QUALIFICATION UNRESOLVED
B7 GATE OPEN
```
