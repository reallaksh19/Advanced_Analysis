# LFEA Piping Phase 6 Evidence Requirements

Program disposition remains `BLOCKED` until every required external and exact-head artifact is retained.

## 1. Purpose

The Phase 6A code provides a deterministic comparison harness. It does not provide project evidence by itself.

The committed analytical fixtures are explicitly fictional and are ineligible for:

- `G8_REAL_MODEL_RECONCILIATION`;
- `G9_COMMERCIAL_CORROBORATION`;
- release qualification;
- project acceptance;
- vendor or code-compliance claims.

## 2. Real-model reconciliation evidence

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

## 3. Commercial corroboration evidence

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

## 4. Performance evidence

Performance evidence must record:

- exact repository head;
- runtime, operating system and dependency-lock identity;
- model sizes and load-case counts;
- compile, solve, recovery, presentation and export timings;
- memory measurements;
- deterministic replay results;
- cancellation and failure behavior where applicable;
- the declared production envelope and any exceeded limit.

## 5. Rollback evidence

Rollback evidence must record:

- exact qualified release head;
- exact rollback target;
- release and rollback commands;
- database or file migration implications, if any;
- successful restoration of the prior application path;
- preservation of existing project data;
- post-rollback smoke checks;
- reviewer and exact UTC completion time.

## 6. Promotion rule

No simulated fixture, code-only pull request, passing unit test or commercial-program name may change G8, G9 or G10 to `VERIFIED`.

Promotion requires all of the following:

1. A current exact-head repository gate with retained command logs.
2. Complete non-fictional G8 and G9 artifacts.
3. Performance evidence.
4. A successful rollback rehearsal.
5. Populated release-evidence artifact paths.
6. A signed program disposition.
7. A passing `npm run check:lfea-piping-release` at the exact release head.
