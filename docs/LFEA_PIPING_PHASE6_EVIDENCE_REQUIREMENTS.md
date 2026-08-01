# LFEA Piping Phase 6 Evidence Requirements

Program disposition remains `BLOCKED` until every required external and exact-head artifact is retained.

## 1. Purpose

Phase 6A provides a deterministic comparison harness. Phase 6B provides a fail-closed package contract for validating supplied G8, G9, performance, rollback and signed-disposition records together.

Neither phase provides project evidence by itself. Phase 6B can produce only `ELIGIBLE_FOR_RELEASE_REVIEW`; it cannot change a release gate to `VERIFIED`, populate the release ledger, execute commercial software, create a signature or manufacture an independent expected value.

The committed analytical fixtures are explicitly fictional or simulated and are ineligible for:

- `G8_REAL_MODEL_RECONCILIATION`;
- `G9_COMMERCIAL_CORROBORATION`;
- `G10_RELEASE_ROLLBACK`;
- release qualification;
- project acceptance;
- vendor or code-compliance claims.

## 2. Phase 6B package boundary

A Phase 6B external-evidence package must bind all of the following to one exact application and presentation identity:

- a passing `REAL_MODEL_RECONCILIATION` comparison;
- a passing `COMMERCIAL_CORROBORATION` comparison;
- exact-head performance evidence;
- successful rollback evidence;
- a signed `ACCEPT_FOR_RELEASE_REVIEW` disposition;
- hash-bound artifact references for every retained external record.

The package derives required comparison categories from the current presentation. Where present, both G8 and G9 must cover:

- local interface force;
- local reference-point moment;
- nozzle utilization;
- B31.3 calculated stress;
- B31.3 utilization.

The package is rejected when comparison coverage is incomplete, G8 and G9 authority identities are not independent, an authority aliases application evidence, a production limit is exceeded, rollback does not restore the prior application path or project data, a disposition is stale, or an artifact reference does not match its retained record.

## 3. Real-model reconciliation evidence

A qualifying G8 artifact must identify:

- the imported project model and revision;
- the exact application-result semantic and evidence hashes;
- the exact presentation semantic and evidence hashes;
- independent expected values not copied from the application result;
- selected interface forces and reference-point moments;
- selected nozzle utilizations where configured;
- selected B31.3 calculated stresses and utilizations;
- units and sign conventions;
- source document, revision and source semantic hash;
- reviewer identity and exact UTC review time;
- caller-declared absolute and relative tolerances with sources;
- every PASS and FAIL comparison without suppression;
- the generated qualification comparison semantic and evidence hashes.

A real-model artifact is not accepted when the authority is fictional, self-generated from the application output, missing source identity, stale against the current application, or incomplete.

## 4. Commercial corroboration evidence

A qualifying G9 artifact must identify:

- the named commercial pipe-stress program;
- product version and analysis run ID;
- source model and revision;
- modelling assumptions and formulation differences;
- selected load cases and combinations;
- coordinate frame, units and sign sense;
- support, anchor and nozzle comparison points;
- selected B31.3 categories and code points;
- independently exported reference values;
- reviewer identity and exact UTC review time;
- caller-declared tolerances with sources;
- all unexplained differences and disposition;
- the generated qualification comparison semantic and evidence hashes.

Commercial output is corroborating evidence. It does not replace controlled analytical benchmarks or exact-head repository qualification.

## 5. Performance evidence

Performance evidence must record:

- exact repository head;
- runtime, operating system and dependency-lock identity;
- model sizes and load-case counts;
- compile, solve, recovery, presentation and export timings;
- memory measurements;
- deterministic replay results from at least two runs;
- cancellation and invalid-input failure behavior;
- the declared production envelope and every exceeded limit;
- source document, reviewer and exact UTC review time;
- current semantic and evidence hashes.

A Phase 6B package is ineligible when node, element, load-case, timing or memory limits are exceeded.

## 6. Rollback evidence

Rollback evidence must record:

- exact qualified release head;
- exact rollback target;
- release and rollback commands with command and log hashes;
- database or file migration implications, if any;
- successful restoration of the prior application path;
- preservation of existing project data;
- passing post-rollback checks with evidence hashes;
- source document, reviewer and exact UTC completion time;
- current semantic and evidence hashes.

The package does not run these commands. It validates records supplied after a controlled rehearsal.

## 7. Artifact-reference requirements

Every external record must have a unique repository-relative artifact reference containing:

- media type;
- artifact content hash;
- retained-record semantic hash;
- retained-record evidence hash.

Paths under scripts, tests, fixtures or mocks are ineligible. A committed simulated fixture cannot be renamed or referenced as project evidence.

## 8. Promotion rule

No simulated fixture, code-only pull request, passing unit test, eligibility package or commercial-program name may change G8, G9 or G10 to `VERIFIED`.

Promotion requires all of the following:

1. A current exact-head repository gate with retained command logs.
2. Complete non-fictional G8 and G9 artifacts under independent authorities.
3. Performance evidence within the declared production envelope.
4. A successful rollback rehearsal.
5. Populated release-evidence artifact paths.
6. A signed program disposition.
7. A Phase 6B package that revalidates as `ELIGIBLE_FOR_RELEASE_REVIEW`.
8. A passing `npm run check:lfea-piping-release` at the exact release head.
