# LFEA Piping Phase 6E — Runtime Release-Bundle Orchestration

Program disposition remains `BLOCKED` in the committed repository manifest.

## Problem resolved

A release manifest committed inside the repository cannot truthfully contain the SHA of the commit that contains that manifest: changing the manifest changes the commit SHA. The previous release path also imported simulated checks that require a blocked, null-artifact template during explicit release validation.

Phase 6E separates these authorities:

- **policy mode** reads the committed blocked template and runs simulated source and anti-drift checks;
- **release mode** reads a supplied runtime evidence bundle, binds it to the checked-out SHA and runs the persisted Phase 6C and Phase 6D validators;
- simulated policy checks are not executed in release mode;
- persisted release validators are not executed in policy mode.

## Policy mode

The existing command remains:

```bash
npm run check:lfea-piping-release-policy
```

Policy mode:

- reads `release-evidence/lfea-piping-release-evidence.json` from the repository;
- requires `programDisposition: BLOCKED`;
- runs Phase 6A–6E simulated and anti-drift checks;
- permits `npm run gate` to qualify the exact repository head without introducing a self-referential manifest.

Runtime release options are rejected unless `--release` is present.

## Runtime release mode

The existing release command accepts three additional required options:

```bash
npm run check:lfea-piping-release -- \
  --evidence-root=/absolute/path/to/release-bundle \
  --manifest=release-evidence.json \
  --expected-head=<40-character checked-out SHA>
```

The package script supplies `--release`; callers supply:

- `--evidence-root` — directory containing the runtime release bundle;
- `--manifest` — safe relative JSON path inside that root;
- `--expected-head` — exact checked-out repository SHA supplied by the certification environment.

Release mode requires:

1. A valid runtime release manifest with the exact key contract.
2. `programDisposition: QUALIFIED` in that runtime manifest.
3. Every G0–G10 gate set to `VERIFIED`.
4. Every required artifact path populated.
5. Runtime manifest `exactHead` equal to `--expected-head`.
6. Phase 6D internal intake returning `ELIGIBLE_FOR_RELEASE_REVIEW` at that head.
7. Phase 6C external intake returning `ELIGIBLE_FOR_RELEASE_REVIEW` at that head.
8. Both intake records marked `releaseEligible: true`.

Release mode does not execute simulated project fixtures or blocked-template assertions.

## Runtime path policy

The evidence root must exist, be a real directory and not be a symbolic link. The runtime manifest must:

- be a relative `.json` path inside the evidence root;
- contain no absolute path, drive prefix, empty segment, `.` or `..` segment;
- exist as a regular non-symbolic-link file;
- resolve inside the evidence root.

The Phase 6C and Phase 6D validators independently apply their own path, identity and hash controls to every referenced artifact.

## CI workflow

`.github/workflows/lfea-piping-runtime-release-certification.yml` is manual and requires:

- the workflow run ID that retained the evidence bundle;
- the artifact name;
- the manifest path inside that bundle.

The workflow:

1. Checks out the selected repository head.
2. Runs the full repository gate against the committed blocked template.
3. Downloads the retained evidence bundle from the supplied run.
4. Runs runtime release validation with `--expected-head=${{ github.sha }}`.
5. Uploads the validation result as a retained artifact.

The workflow does not create, edit or sign release evidence.

## Qualification coverage

The Phase 6E suite is marked `[SIMULATED][INELIGIBLE_FOR_RELEASE_EVIDENCE]`. It proves:

- blocked policy mode invokes only policy checks;
- release mode invokes both persisted intakes and skips policy checks;
- runtime options require explicit release mode;
- all runtime options are mandatory;
- runtime manifest path containment;
- runtime manifest versus checkout-head equality;
- complete gate and artifact requirements;
- qualified disposition requirement;
- internal and external intake status/head enforcement;
- the committed manifest remains blocked, null-headed and self-reference free.

## Remaining conditions

- Produce the real internal and external evidence files for one exact checked-out head.
- Retain them as one runtime evidence bundle.
- Supply the evidence run ID and artifact name to the manual certification workflow.
- Retain successful full-gate and runtime release-validation logs.
- Obtain the governed signed release disposition outside the repository template.
