export const PHASE6I_ANTI_DRIFT_CATALOG_SCHEMA =
  'lfea-piping-phase6i-anti-drift-catalog/v1';

export const SUPERSEDED_PHASE6I_HEADS = Object.freeze([
  '921491eaee42a89115c958797508686c551e19b6',
  'e76d2171015275836fe80e7d5e8b12d426eeb79e',
]);

const scenarios = [
  scenario('AD-01', 'Moving-head drift',
    'Bind internal and external evidence to different commit SHAs.',
    'The collector, materializer or assembler rejects the chain before publication.', [
      evidence('scripts/lfea-piping-internal-evidence-collector.mjs',
        'LFEA_INTERNAL_COLLECTION_CHECKOUT_HEAD_MISMATCH'),
      evidence('scripts/lfea-piping-external-evidence-materializer.mjs',
        'LFEA_EXTERNAL_MATERIALIZATION_REQUEST_HEAD_MISMATCH'),
    ]),
  scenario('AD-02', 'Superseded artifact',
    'Use an artifact from a superseded Phase 6I candidate.',
    'Candidate policy rejects the artifact head.', [
      evidence('scripts/lfea-piping-phase6i-evidence-policy.mjs',
        'LFEA_PHASE6I_SUPERSEDED_HEAD'),
    ]),
  scenario('AD-03', 'Mixed internal/external heads',
    'Provide individually sealed internal and external artifacts from different heads.',
    'Phase 6G rejects the input pair and publishes no bundle.', [
      evidence('scripts/lfea-piping-runtime-bundle-assembler.mjs',
        'LFEA_RUNTIME_BUNDLE_INPUT_HEAD_MISMATCH'),
    ]),
  scenario('AD-04', 'Stale semantic hash',
    'Modify a sealed record without recomputing its semantic and evidence identities.',
    'Phase 6C or Phase 6D rejects the stale identity.', [
      evidence('src/core/linear-piping-project-qualification/external-evidence-package.js',
        'PIPING_EXTERNAL_PACKAGE_HASH_MISMATCH'),
      evidence('scripts/lfea-piping-internal-release-evidence-check.mjs',
        'LFEA_INTERNAL_MANIFEST_HASH_MISMATCH'),
    ]),
  scenario('AD-05', 'Content-hash mismatch',
    'Change persisted artifact bytes while retaining the old content hash.',
    'Persisted intake rejects the artifact.', [
      evidence('scripts/lfea-piping-external-release-evidence-check.mjs',
        'LFEA_EXTERNAL_ARTIFACT_CONTENT_HASH_MISMATCH'),
      evidence('scripts/lfea-piping-internal-release-evidence-check.mjs',
        'LFEA_INTERNAL_ARTIFACT_CONTENT_HASH_MISMATCH'),
    ]),
  scenario('AD-06', 'Committed-template promotion',
    'Populate runtime paths or mark the committed repository template qualified.',
    'Policy checks fail; the committed template remains blocked and null-headed.', [
      evidence('release-evidence/lfea-piping-release-evidence.json',
        '"programDisposition": "BLOCKED"', '"exactHead": null'),
      evidence('scripts/lfea-piping-phase6e-anti-drift-check.mjs',
        "assert.equal(release.programDisposition, 'BLOCKED')"),
    ]),
  scenario('AD-07', 'Fixture or mock evidence',
    'Use simulated identity or a test, fixture, mock or demo evidence root.',
    'External evidence contracts or file materialization reject the record.', [
      evidence('src/core/linear-piping-project-qualification/external-evidence-contracts.js',
        'PIPING_EXTERNAL_EVIDENCE_INELIGIBLE', 'SIMULATED', 'FIXTURE'),
      evidence('scripts/lfea-piping-external-evidence-materializer.mjs',
        'INELIGIBLE_ROOTS'),
    ]),
  scenario('AD-08', 'Authority circularity',
    'Make G8 and G9 share an authority identity or application-derived expected values.',
    'The Phase 6B package rejects the authority set.', [
      evidence('src/core/linear-piping-project-qualification/external-evidence-package.js',
        'PIPING_EXTERNAL_PACKAGE_AUTHORITY_NOT_INDEPENDENT'),
    ]),
  scenario('AD-09', 'Missing or stale signed head',
    'Use a release-review disposition that omits or differs from the selected head.',
    'The external package rejects the disposition.', [
      evidence('src/core/linear-piping-project-qualification/external-evidence-package.js',
        'PIPING_EXTERNAL_PACKAGE_DISPOSITION_MISMATCH'),
    ]),
  scenario('AD-10', 'Performance-head drift',
    'Supply performance evidence from another commit or outside the declared envelope.',
    'The external package rejects the performance evidence.', [
      evidence('src/core/linear-piping-project-qualification/external-evidence-package.js',
        'PIPING_EXTERNAL_PACKAGE_PERFORMANCE_INVALID'),
    ]),
  scenario('AD-11', 'Rollback-head drift',
    'Use rollback evidence that does not identify the selected candidate or passing prior release.',
    'The external package rejects the rollback evidence.', [
      evidence('src/core/linear-piping-project-qualification/external-evidence-package.js',
        'PIPING_EXTERNAL_PACKAGE_ROLLBACK_INVALID'),
    ]),
  scenario('AD-12', 'Unsafe path',
    'Use an absolute, traversal, drive-qualified, empty-segment or symbolic-link path.',
    'The materializer or assembler rejects the path.', [
      evidence('scripts/lfea-piping-external-evidence-materializer.mjs',
        'requireSafeRelativeJsonPath', 'isSymbolicLink'),
      evidence('scripts/lfea-piping-runtime-bundle-assembler.mjs',
        'requireSafeRelativePath', 'isSymbolicLink'),
    ]),
  scenario('AD-13', 'Case-insensitive path collision',
    'Provide two bundle destinations that differ only by case.',
    'Phase 6G rejects the copy plan.', [
      evidence('scripts/lfea-piping-runtime-bundle-assembler.mjs',
        'LFEA_RUNTIME_BUNDLE_PATH_COLLISION', 'toLowerCase'),
    ]),
  scenario('AD-14', 'Failed-command manifest',
    'Attempt to seal an exact-head manifest after any governed command fails.',
    'The collector writes failure evidence and omits the manifest.', [
      evidence('scripts/lfea-piping-internal-evidence-collector.mjs',
        'LFEA_INTERNAL_COLLECTION_COMMAND_FAILED', 'collection-failure.json'),
      evidence('scripts/lfea-piping-internal-release-evidence-check.mjs',
        'LFEA_INTERNAL_COMMAND_NOT_PASSED'),
    ]),
  scenario('AD-15', 'Failure-artifact reuse',
    'Feed a Phase 6F failure output to Phase 6G.',
    'The missing manifest or non-PASS collection summary is rejected.', [
      evidence('scripts/lfea-piping-runtime-bundle-assembler.mjs',
        'LFEA_RUNTIME_BUNDLE_COLLECTION_SUMMARY_INVALID', "summary.status !== 'PASS'"),
    ]),
  scenario('AD-16', 'Dirty checkout',
    'Modify source or generated files before the clean-tree gate.',
    'Phase 6F fails and no eligible manifest can be accepted.', [
      evidence('scripts/lfea-piping-internal-release-evidence-check.mjs',
        'LFEA_INTERNAL_CLEAN_TREE_NOT_PROVEN'),
      evidence('scripts/lfea-piping-internal-evidence-plan.mjs',
        'CLEAN_TREE', 'git status --porcelain'),
    ]),
  scenario('AD-17', 'Stale presentation',
    'Change the application after generating the presentation.',
    'Presentation, export and external package validation reject the stale parent chain.', [
      evidence('scripts/linear-piping-presentation-anti-drift-check.mjs',
        'requireCurrentLinearPipingPresentation'),
      evidence('src/core/linear-piping-project-qualification/external-evidence-package.js',
        'PIPING_EXTERNAL_PACKAGE_COMPARISON_STALE'),
    ]),
  scenario('AD-18', 'Null or duplicate artifact path',
    'Remove or duplicate a required runtime artifact path.',
    'Persisted intake or assembly rejects the manifest.', [
      evidence('scripts/lfea-piping-internal-release-evidence-check.mjs',
        'LFEA_INTERNAL_ARTIFACT_PATH_DUPLICATE', 'LFEA_INTERNAL_ARTIFACT_PATH_MISSING'),
      evidence('src/core/linear-piping-project-qualification/external-evidence-package.js',
        'PIPING_EVIDENCE_ARTIFACT_REFERENCE_DUPLICATE'),
    ]),
  scenario('AD-19', 'Partial or cancelled workflow',
    'Use artifacts or status from a partial, cancelled or unsuccessful workflow.',
    'Phase 6I workflow-evidence policy rejects the run.', [
      evidence('scripts/lfea-piping-phase6i-evidence-policy.mjs',
        'LFEA_PHASE6I_WORKFLOW_NOT_COMPLETED',
        'LFEA_PHASE6I_WORKFLOW_NOT_SUCCESSFUL',
        'LFEA_PHASE6I_WORKFLOW_ARTIFACT_MISSING'),
    ]),
  scenario('AD-20', 'Pre-step failure promotion',
    'Treat a failed job with no executable steps or downloadable logs as passing evidence.',
    'Phase 6I workflow-evidence policy rejects the run as ineligible.', [
      evidence('scripts/lfea-piping-phase6i-evidence-policy.mjs',
        'LFEA_PHASE6I_WORKFLOW_STEPS_MISSING',
        'LFEA_PHASE6I_WORKFLOW_LOGS_MISSING'),
    ]),
  scenario('AD-21', 'Path-dependent identity',
    'Run the Phase 6F collector under different temporary output paths.',
    'Normalized manifest identities remain equal.', [
      evidence('scripts/lfea-piping-internal-evidence-collector-check.mjs',
        'Manifest identity is independent of runner-temporary output paths'),
    ]),
  scenario('AD-22', 'Timestamp or random drift',
    'Repeat identical evidence generation with different collection timestamps.',
    'Semantic identity remains stable while evidence metadata remains separately bound.', [
      evidence('scripts/lfea-piping-internal-release-evidence-check.mjs',
        'createdAtUtc: _createdAtUtc'),
      evidence('scripts/lfea-piping-phase6i-evidence-policy-check.mjs',
        'Timestamp metadata does not change manifest semantic identity'),
      evidence('scripts/linear-piping-project-qualification-anti-drift-check.mjs',
        'RANDOM_IDENTITY'),
    ]),
  scenario('AD-23', 'Code-dataset substitution',
    'Change the B31.3 dataset or nozzle profile while retaining an old assessment.',
    'Parent-identity or evidence-hash validation rejects the stale result.', [
      evidence('scripts/linear-piping-code-application-anti-drift-check.mjs',
        'allowableProfileHash', 'recoveryEvidenceHash', 'computeApplicationResultEvidenceHash'),
    ]),
  scenario('AD-24', 'Unsupported nonlinear claim',
    'Mark gap, lift-off, contact or friction behavior qualified in the linear release.',
    'Interface scope and source guards reject nonlinear implementation or promotion.', [
      evidence('scripts/linear-piping-interface-anti-drift-check.mjs',
        'NONLINEAR_APPROXIMATION', 'PROHIBITED_INTERFACE_STATES'),
    ]),
  scenario('AD-25', 'Licensed-table embedding',
    'Add unapproved ASME or vendor numerical tables to source.',
    'B-4.0 and code-application source guards reject embedded values or tables.', [
      evidence('scripts/lfea-b4.0-source-guard.mjs',
        'No real ASME table value may be embedded'),
      evidence('scripts/linear-piping-code-application-anti-drift-check.mjs',
        'EMBEDDED_ALLOWABLE_TABLE'),
    ]),
];

export const PHASE6I_ANTI_DRIFT_CATALOG = deepFreeze({
  schema: PHASE6I_ANTI_DRIFT_CATALOG_SCHEMA,
  status: 'ENFORCEMENT_CATALOG_ONLY',
  scenarioCount: scenarios.length,
  scenarios,
});

function scenario(id, name, injection, requiredResult, enforcement) {
  return { id, name, injection, requiredResult, enforcement };
}

function evidence(path, ...requiredTokens) {
  return { path, requiredTokens };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
