# LAFEA B7H — Self-Hosted Exact-Current-Main Gate Closure

## Purpose

B7H provides a repository-controlled GitHub Actions execution route for the bounded pilot:

```text
C2D-LUG-PINHOLE -> LAFEA.3
```

It exists because GitHub-hosted jobs in this private repository have repeatedly failed before allocating any executable step. That infrastructure condition affects unrelated workflows as well as LAFEA, so changing numerical or product code cannot resolve it.

B7H does not replace B7E, B7F or B7G. It executes and composes them on a registered self-hosted runner.

## Runner prerequisite

Register a repository or organization self-hosted runner with all of these labels:

```text
self-hosted
linux
x64
lafea
```

The runner must provide:

- Git capable of fetching the private repository;
- network access to GitHub Actions and the npm registry;
- enough storage for `npm ci`, the production build and retained artifacts;
- permission to execute the repository checkout without modifying tracked files.

The workflow installs Node.js 20 through `actions/setup-node@v4` and installs the exact lockfile with `npm ci`.

A queued job with no matching runner is not evidence.

## Dispatch rule

Dispatch **LAFEA B7H Self-Hosted Gate Closure** from the `main` branch only.

The workflow fails closed unless all identities are equal:

```text
github.sha
checkout HEAD
refs/remotes/origin/main
EXPECTED_HEAD_SHA
```

If `main` advances before the runner starts, the run blocks and must be dispatched again against the new exact head.

## Executed chain

```text
B7E retained aggregate
  -> B7F exact-current-main qualification
  -> B7G portable bundle
  -> B7G independent verifier
  -> B7H self-hosted gate-closure checker
```

B7F classifies a manual dispatch as `CURRENT_MAIN` only when:

- `GITHUB_EVENT_NAME=workflow_dispatch`;
- `GITHUB_REF=refs/heads/main`;
- the exact checkout equals `origin/main`.

No event variable is spoofed and no caller-provided flag can manufacture current-main status.

## Required PASS state

A B7H PASS requires:

```text
execution.context                       = GITHUB_ACTIONS_SELF_HOSTED
B7E.status                              = PASS
B7F.status                              = PASS
B7F.context                             = CURRENT_MAIN
B7F.currentMainQualified                = true
B7F.b7GateClosureEligible               = true
B7G.status                              = PASS
B7G retained B7F current-main state     = true
B7H.status                              = PASS
B7H.exactCurrentMainExecutableEvidence  = true
B7H.selfHostedCiQualified               = true
B7H.b7GateClosureEligible               = true
```

The run retains:

- complete execution log;
- B7E report;
- B7F report;
- B7G bundle and aggregate log;
- B7H closure report.

## Authority boundary

B7H changes qualification transport only. It does not change:

```text
production or numerical behavior
solver or recovery formulas
tolerances or benchmark expectations
lifecycle or display authority
general T7D authority
additional continuum-template authority
arbitrary outer-profile or hole-topology authority
shell, SCL or structural-stress authority
assessment, code or formal-report authority
release qualification
LAFEA.6 enablement
```

All listed broader authority values remain `false`.

A self-hosted PASS is exact-head executable CI evidence, but it is not represented as a GitHub-hosted runner PASS. B7G retains `hostedCiPassClaimedByB7g=false`.

## Gate closure

B7H never closes Issue #269 automatically. A governing review must inspect the successful run, visible steps, logs, retained artifacts and B7H report before closing the gate.

Local operator execution is useful diagnostic evidence but cannot satisfy B7H. A missing runner, queued job, zero-step job, absent log, missing artifact, stale head or altered authority state keeps the gate open.
