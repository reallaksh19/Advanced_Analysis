# LAFEA Bucket B7G — Portable Exact-Head Qualification Bundle

## 1. Purpose

B7G is an evidence-only continuation of B7F for the bounded pilot:

```text
C2D-LUG-PINHOLE -> LAFEA.3
```

The selected-pilot implementation is merged through NB-T6G. B7E and B7F provide the retained executable aggregate, but GitHub-hosted attempts have repeatedly terminated before allocating executable steps, logs or artifacts.

B7G does not weaken the gate. It makes one completed execution portable and independently verifiable without changing what must pass.

## 2. Retained execution chain

B7G invokes only:

```text
scripts/lafea-template-b7f-current-main-qualification-check.mjs
```

B7F retains:

```text
B7E aggregate
+ NB-T6G current-context panel qualification
+ complete non-bucket stack through NB-T6G
```

B7E retains the B7D, B7C, B7B, B7A, B6, strict syntax, import, production build, patch-hygiene and tracked-tree checks.

B7G does not reimplement or substitute any numerical assertion.

## 3. Produced evidence

The runner produces:

```text
reports/qualification/lafea-b7g-portable-qualification-bundle.json
reports/qualification/lafea-b7g-portable-qualification.log
reports/qualification/lafea-b7f-current-main-qualification.json
reports/qualification/lafea-b7e-b7-gate-closure.json
```

The bundle schema is:

```text
lafea-b7g-portable-qualification-bundle/v1
```

It binds:

- exact checked-out head;
- expected head and diff base;
- execution context and runtime;
- exact retained B7F command and exit state;
- complete captured aggregate log;
- B7E and B7F reports;
- byte lengths and SHA-256 hashes for every evidence file;
- retained B7F current-main and gate-eligibility disposition;
- immutable authority and non-claim matrices;
- canonical bundle SHA-256.

No wall-clock time is included in the bundle identity.

## 4. Independent verification

The verifier is:

```text
scripts/lafea-template-b7g-portable-qualification-verify.mjs
```

It requires:

- bundle schema and canonical hash validity;
- bundle status `PASS`;
- verifier checkout equal to the bundle exact head;
- B7D, B7E and NB-T6G merge ancestry;
- repository-bounded evidence paths;
- exact log and report byte lengths and SHA-256 hashes;
- B7E and B7F report schemas, `PASS` states and exact-head identity;
- exact reproduction of retained B7F context and gate disposition;
- no true authority-promotion flag;
- a clean tracked tree.

Changed head, path escape, missing file, changed bytes, changed report, changed authority, changed gate disposition or bundle tamper blocks verification.

## 5. Execution contexts

The bundle distinguishes:

```text
LOCAL_OPERATOR
GITHUB_ACTIONS_SELF_HOSTED
GITHUB_ACTIONS_HOSTED
```

These contexts are evidence metadata, not equivalent authority declarations.

A local or self-hosted bundle may demonstrate a completed exact-head execution. It does not, by itself, manufacture a GitHub-hosted CI PASS or authorize automatic gate closure.

## 6. Gate semantics

B7G always retains:

```text
hostedCiPassClaimedByB7g       = false
automaticIssueClosureAuthorized = false
governingAcceptanceRequired     = true
```

The bundle separately reproduces the B7F report fields:

```text
retainedB7fContext
retainedB7fCurrentMainQualified
retainedB7fGateClosureEligible
```

B7G does not reinterpret them.

Issue #269 may close only under the governing B7 acceptance rule. B7G does not close it automatically.

## 7. Authority boundary

B7G changes no product behavior and retains:

```text
GENERAL_T7D_AUTHORIZED                    = false
ADDITIONAL_CONTINUUM_TEMPLATES_AUTHORIZED = false
ARBITRARY_OUTER_PROFILE_AUTHORIZED        = false
ARBITRARY_HOLE_TOPOLOGY_AUTHORIZED        = false
SHELL_AUTHORIZED                          = false
SCL_AUTHORIZED                            = false
STRUCTURAL_STRESS_AUTHORIZED              = false
ASSESSMENT_READY                          = false
CODE_READY                                = false
REPORT_AUTHORITY                          = false
RELEASE_QUALIFIED                         = false
LAFEA_6_ENABLED                           = false
DISPLAY_VALUES_AUTHORITATIVE              = false
```

It does not execute a solver directly, alter a formula or tolerance, register lifecycle evidence, install display data, assess a code, generate a formal engineering report or promote release.

## 8. Commands

Produce the bundle:

```bash
npm ci
node scripts/lafea-template-b7g-portable-qualification-bundle.mjs
```

Verify it from the same exact checkout:

```bash
node scripts/lafea-template-b7g-portable-qualification-verify.mjs \
  reports/qualification/lafea-b7g-portable-qualification-bundle.json
```

The runner exits nonzero when B7F or any retained evidence condition is blocked. The verifier exits nonzero for any integrity, lineage, authority or exact-head failure.

## 9. Hosted workflow disposition

The exact-head workflow runs the producer and verifier and uploads all four evidence files.

A workflow that terminates before executable steps produces no eligible B7G evidence and remains:

```text
PRE_STEP_INFRASTRUCTURE_FAILURE
```

It is neither a product failure nor a qualification PASS.
