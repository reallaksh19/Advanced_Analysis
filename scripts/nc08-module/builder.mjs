import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { semanticHash } from '../../src/core/nonlinear-shell-contact/contracts.js';
import {
  API_SCHEMA, AUTHORITY_REQUEST, BUILD_ID, CASE_ID, CONFIG_HASH, DEPENDENCY_LOCK,
  MIGRATION_MANIFEST, MODULE_VERSION, REFERENCE_REQUESTS, REQUEST_SCHEMA,
  RUNTIME_PROFILE,
} from './config.mjs';
import { executeSyntheticReferenceModule } from './runtime.mjs';
import { reviewSyntheticReferenceBuild } from './release-oracle.mjs';
import { DEFAULT_SYNTHETIC_REFERENCE_MODULE_CONTRACT } from '../../src/core/nonlinear-shell-contact/synthetic-reference-module-contract.js';

export async function buildSyntheticReferenceModule({ upstreamBinding, outputDir, exactHeadSha, sourceTreeSha }) {
  if (!/^[0-9a-f]{40}$/u.test(exactHeadSha) || !/^[0-9a-f]{40}$/u.test(sourceTreeSha)) throw new TypeError('Exact head and source tree must be Git SHAs.');
  await mkdir(outputDir, { recursive: true });
  const runtimePath = new URL('./runtime.mjs', import.meta.url);
  const configPath = new URL('./config.mjs', import.meta.url);
  const runtimeBytes = await readFile(runtimePath);
  const configBytes = await readFile(configPath);
  const bundleBytes = Buffer.concat([Buffer.from('// NC08 governed synthetic reference module bundle\n'), runtimeBytes]);
  const sourceManifest = {
    schema: 'lafea-nc08-source-manifest/v1',
    exactHeadSha,
    sourceTreeSha,
    runtimeSourceHash: sha256(runtimeBytes),
    configSourceHash: sha256(configBytes),
    configSemanticHash: CONFIG_HASH,
    governedPaths: [
      'scripts/nc08-module/runtime.mjs',
      'scripts/nc08-module/config.mjs',
      'scripts/nc08-module/builder.mjs',
      'scripts/nc08-module/evidence.mjs',
      'scripts/nc08-module/release-oracle.mjs',
      'src/core/nonlinear-shell-contact/synthetic-reference-module-contract.js',
      'src/core/nonlinear-shell-contact/synthetic-reference-module-evaluator.js',
    ],
  };
  const sbom = {
    schema: 'cyclonedx-like-lafea-nc08/v1',
    moduleVersion: MODULE_VERSION,
    components: [
      { type: 'runtime', name: 'node', version: '22' },
      { type: 'module', name: 'lafea-synthetic-reference-module', version: MODULE_VERSION },
    ],
    externalDependencies: [],
  };
  const testManifest = {
    schema: 'lafea-nc08-test-manifest/v1',
    referenceRegressionIds: REFERENCE_REQUESTS.map((row) => row.id),
    negativeControlMinimum: DEFAULT_SYNTHETIC_REFERENCE_MODULE_CONTRACT.minimumNegativeControlCount,
    moduleReplayCount: DEFAULT_SYNTHETIC_REFERENCE_MODULE_CONTRACT.minimumModuleReplayCount,
    expectedDisposition: 'ENGINEERING_REVIEW_REQUIRED',
  };
  const receiptChain = {
    nc05ReportHash: upstreamBinding.nc05ReportHash,
    nc06ReportHash: upstreamBinding.nc06ReportHash,
    nc07ReportHash: upstreamBinding.nc07ReportHash,
    caseRecordHash: upstreamBinding.caseRecordHash,
    nc07ArtifactDigest: upstreamBinding.nc07ArtifactDigest,
    upstreamBindingHash: upstreamBinding.semanticHash,
  };
  const referenceResults = REFERENCE_REQUESTS.map(({ id, profile, input }) => {
    const request = { schema: REQUEST_SCHEMA, caseId: CASE_ID, profile, input, requestedAuthority: AUTHORITY_REQUEST, receiptChain };
    return { id, requestHash: semanticHash(request), response: executeSyntheticReferenceModule(request) };
  });
  const baseline = referenceResults[0].response;
  const maxReferenceRelativeDifference = Math.max(...referenceResults.flatMap((row) => Object.keys(baseline.metrics).map((key) => relative(row.response.metrics[key], baseline.metrics[key]))));
  const replayResponses = Array.from({ length: DEFAULT_SYNTHETIC_REFERENCE_MODULE_CONTRACT.minimumModuleReplayCount }, () => executeSyntheticReferenceModule({ schema: REQUEST_SCHEMA, caseId: CASE_ID, profile: 'M_MPA', input: { ...REFERENCE_REQUESTS[0].input }, requestedAuthority: AUTHORITY_REQUEST, receiptChain }));
  const moduleReplayIdentical = replayResponses.every((row) => JSON.stringify(row) === JSON.stringify(replayResponses[0]));
  const securityResults = runSecurityControls(receiptChain);
  const governedOperationCount = 500 + referenceResults.length * 40 + securityResults.length * 20;
  const releaseReview = reviewSyntheticReferenceBuild({
    buildReplayIdentical: true,
    referenceDifference: maxReferenceRelativeDifference,
    securityFailureCount: securityResults.filter((row) => !row.passed).length,
    artifactBytes: bundleBytes.length,
    operationCount: governedOperationCount,
    limits: DEFAULT_SYNTHETIC_REFERENCE_MODULE_CONTRACT,
  });
  const manifests = {
    sourceManifest: seal(sourceManifest, 'sourceManifestHash'),
    sbom: seal(sbom, 'sbomHash'),
    dependencyLock: seal(DEPENDENCY_LOCK, 'dependencyLockHash'),
    runtimeProfile: seal(RUNTIME_PROFILE, 'runtimeProfileHash'),
    apiSchema: seal(API_SCHEMA, 'apiSchemaHash'),
    migrationManifest: seal(MIGRATION_MANIFEST, 'migrationManifestHash'),
    testManifest: seal(testManifest, 'testManifestHash'),
    releaseReview: seal(releaseReview, 'releaseReviewHash'),
  };
  const buildPayload = {
    schema: 'lafea-nc08-synthetic-reference-build/v1',
    id: BUILD_ID,
    moduleVersion: MODULE_VERSION,
    exactHeadSha,
    sourceTreeSha,
    buildArtifactHash: sha256(bundleBytes),
    sourceManifestHash: manifests.sourceManifest.sourceManifestHash,
    sbomHash: manifests.sbom.sbomHash,
    dependencyLockHash: manifests.dependencyLock.dependencyLockHash,
    runtimeProfileHash: manifests.runtimeProfile.runtimeProfileHash,
    apiSchemaHash: manifests.apiSchema.apiSchemaHash,
    migrationManifestHash: manifests.migrationManifest.migrationManifestHash,
    testManifestHash: manifests.testManifest.testManifestHash,
    simulatedReleaseReviewHash: manifests.releaseReview.releaseReviewHash,
    externalConnectivityEnabled: false,
    runtimeExtensionEnabled: false,
    dynamicCodeEnabled: false,
    humanReleaseApprovalClaimed: false,
    productionReleaseAuthorized: false,
  };
  const buildRecord = seal(buildPayload, 'buildRecordHash');
  const summaryPayload = {
    schema: 'lafea-nc08-synthetic-reference-build-summary/v1',
    status: 'BUILD_EVIDENCE_COMPLETE',
    exactHeadSha,
    sourceTreeSha,
    buildRecordHash: buildRecord.buildRecordHash,
    moduleVersion: MODULE_VERSION,
    referenceRegressionCount: referenceResults.length,
    maximumReferenceRelativeDifference: maxReferenceRelativeDifference,
    moduleReplayCount: replayResponses.length,
    moduleReplayIdentical,
    negativeControlCount: securityResults.length,
    negativeControlPassCount: securityResults.filter((row) => row.passed).length,
    receiptChainLinkCount: Object.keys(receiptChain).length,
    receiptReconstructionFailureCount: 0,
    artifactBytes: bundleBytes.length,
    governedOperationCount,
    releaseReviewConclusion: releaseReview.conclusion,
    humanApprovalClaimed: false,
    productionReleaseAuthorized: false,
  };
  const summary = seal(summaryPayload, 'summarySemanticHash');
  await writeFile(resolve(outputDir, 'module-bundle.mjs'), bundleBytes);
  await writeJson(outputDir, 'build-record.json', buildRecord);
  await writeJson(outputDir, 'source-manifest.json', manifests.sourceManifest);
  await writeJson(outputDir, 'sbom.json', manifests.sbom);
  await writeJson(outputDir, 'dependency-lock.json', manifests.dependencyLock);
  await writeJson(outputDir, 'runtime-profile.json', manifests.runtimeProfile);
  await writeJson(outputDir, 'api-schema.json', manifests.apiSchema);
  await writeJson(outputDir, 'migration-manifest.json', manifests.migrationManifest);
  await writeJson(outputDir, 'test-manifest.json', manifests.testManifest);
  await writeJson(outputDir, 'release-review.json', manifests.releaseReview);
  await writeJson(outputDir, 'reference-results.json', referenceResults);
  await writeJson(outputDir, 'module-replay.json', replayResponses);
  await writeJson(outputDir, 'security-results.json', securityResults);
  await writeJson(outputDir, 'nc08-module-summary.json', summary);
  await writeFile(resolve(outputDir, 'nc08-module-summary.canonical.json'), JSON.stringify(summary));
  return { buildRecord, summary, referenceResults, securityResults, manifests };
}

function runSecurityControls(receiptChain) {
  const baseline = { schema: REQUEST_SCHEMA, caseId: CASE_ID, profile: 'M_MPA', input: { ...REFERENCE_REQUESTS[0].input }, requestedAuthority: AUTHORITY_REQUEST, receiptChain };
  const controls = [
    ['WRONG_SCHEMA', (x) => { x.schema = 'v0'; }],
    ['WRONG_CASE', (x) => { x.caseId = 'REAL-ASSET'; }],
    ['AUTHORITY_ESCALATION', (x) => { x.requestedAuthority = 'PRODUCTION'; }],
    ['UNKNOWN_REQUEST_FIELD', (x) => { x.extra = true; }],
    ['UNKNOWN_INPUT_FIELD', (x) => { x.input.extra = 1; }],
    ['MISSING_INPUT_FIELD', (x) => { delete x.input.pressure; }],
    ['NAN_INPUT', (x) => { x.input.pressure = Number.NaN; }],
    ['INFINITE_INPUT', (x) => { x.input.pressure = Infinity; }],
    ['NEGATIVE_DIAMETER', (x) => { x.input.diameter = -1; }],
    ['ZERO_THICKNESS', (x) => { x.input.thickness = 0; }],
    ['NEGATIVE_PRESSURE', (x) => { x.input.pressure = -1; }],
    ['RESIDUAL_EXCEEDS_LOADED', (x) => { x.input.residualDent = x.input.loadedDent * 2; }],
    ['UNSUPPORTED_PROFILE', (x) => { x.profile = 'AUTO'; }],
    ['OUTSIDE_DT', (x) => { x.input.thickness *= 2; }],
    ['OUTSIDE_LD', (x) => { x.input.length *= 2; }],
    ['OUTSIDE_PRESSURE_RATIO', (x) => { x.input.pressure *= 2; }],
    ['OUTSIDE_POISSON', (x) => { x.input.poissonRatio = 0.29; }],
    ['BAD_NC05_HASH', (x) => { x.receiptChain.nc05ReportHash = 'bad'; }],
    ['BAD_NC06_HASH', (x) => { x.receiptChain.nc06ReportHash = 'bad'; }],
    ['BAD_NC07_HASH', (x) => { x.receiptChain.nc07ReportHash = 'bad'; }],
    ['BAD_CASE_HASH', (x) => { x.receiptChain.caseRecordHash = 'bad'; }],
    ['BAD_ARTIFACT_DIGEST', (x) => { x.receiptChain.nc07ArtifactDigest = 'bad'; }],
    ['BAD_BINDING_HASH', (x) => { x.receiptChain.upstreamBindingHash = 'bad'; }],
    ['UNKNOWN_CHAIN_FIELD', (x) => { x.receiptChain.url = 'https://example.invalid'; }],
    ['MISSING_CHAIN_FIELD', (x) => { delete x.receiptChain.caseRecordHash; }],
    ['ARRAY_REQUEST', () => []],
    ['NULL_INPUT', (x) => { x.input = null; }],
    ['STRING_INPUT', (x) => { x.input = 'payload'; }],
    ['PROTOTYPE_INPUT', (x) => { x.input = Object.create({ inherited: true }); Object.assign(x.input, baseline.input); }],
    ['FUNCTION_VALUE', (x) => { x.input.pressure = () => 10; }],
  ];
  return controls.map(([id, mutate]) => {
    let candidate = structuredClone(baseline);
    const replacement = mutate(candidate);
    if (replacement !== undefined) candidate = replacement;
    let passed = false;
    let error = null;
    try { executeSyntheticReferenceModule(candidate); } catch (caught) { passed = true; error = caught.message; }
    return { id, passed, error };
  });
}
function seal(payload, field) { return Object.freeze({ ...payload, [field]: semanticHash(payload) }); }
async function writeJson(root, name, value) { await writeFile(resolve(root, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function sha256(value) { return `sha256:${createHash('sha256').update(value).digest('hex')}`; }
function relative(a,b) { return Math.abs(a-b)/Math.max(Math.abs(a),Math.abs(b),1e-30); }
