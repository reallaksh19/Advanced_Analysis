#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  requireLinearPipingExternalQualificationPackage,
} from '../src/core/linear-piping-project-qualification/index.js';
import {
  validateExternalReleaseEvidence,
} from './lfea-piping-external-release-evidence-check.mjs';
import {
  requireInternalExactHeadManifest,
  validateInternalReleaseEvidence,
} from './lfea-piping-internal-release-evidence-check.mjs';
import { evaluateReleaseReadiness } from './lfea-piping-release-orchestrator.mjs';

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const RELEASE_MANIFEST_PATH = 'release-evidence.json';
const ASSEMBLY_SUMMARY_PATH = 'bundle/assembly-summary.json';
const INTERNAL_MANIFEST_DEFAULT = 'internal/exact-head-manifest.json';
const INTERNAL_COLLECTION_SUMMARY = 'internal/collection-summary.json';
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const RELEASE_SCHEMA = 'lfea-piping-release-evidence/v1';
const RELEASE_PROGRAM = 'PRIORITY_2_LINEAR_PIPING_FEA_APPLICATION_CHAIN';
const ASSEMBLY_SCHEMA = 'lfea-piping-runtime-bundle-assembly/v1';
const INTERNAL_ROLES = Object.freeze([
  'upstreamGateLog',
  't0GateLog',
  'sourceOrchestrationEvidence',
  'interfaceEvidence',
  'interfaceRecoveryEvidence',
  'codeAndAllowableEvidence',
  'presentationExportEvidence',
]);
const EXTERNAL_ROLES = Object.freeze([
  'realModelReconciliation',
  'commercialCorroboration',
  'performanceEvidence',
  'rollbackEvidence',
  'signedDisposition',
]);
const GATE_KEYS = Object.freeze([
  'G0_EXACT_HEAD',
  'G1_UPSTREAM_NUMERICAL_CHAIN',
  'G2_T0_APPLICATION_SEQUENCING',
  'G3_SOURCE_ORCHESTRATION',
  'G4_INTERFACES',
  'G5_INTERFACE_RECOVERY',
  'G6_CODE_AND_ALLOWABLES',
  'G7_PRESENTATION_EXPORT',
  'G8_REAL_MODEL_RECONCILIATION',
  'G9_COMMERCIAL_CORROBORATION',
  'G10_RELEASE_ROLLBACK',
]);
const INELIGIBLE_ROOTS = Object.freeze([
  'e2e', 'script', 'scripts', 'test', 'tests', 'fixture', 'fixtures', 'mock', 'mocks',
]);

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const options = parseRuntimeBundleAssemblyInvocation(process.argv.slice(2));
  const result = await assembleRuntimeReleaseBundle({
    repositoryRoot: REPOSITORY_ROOT,
    ...options,
  });
  console.log(JSON.stringify(result));
}

export function parseRuntimeBundleAssemblyInvocation(args) {
  const allowed = new Set([
    'exact-head', 'external-package', 'external-root', 'internal-manifest',
    'internal-root', 'output',
  ]);
  const options = new Map();
  for (const argument of args) {
    if (!argument.startsWith('--') || !argument.includes('=')) {
      fail('LFEA_RUNTIME_BUNDLE_OPTION_INVALID', { argument });
    }
    const separator = argument.indexOf('=');
    const key = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if (!allowed.has(key) || options.has(key) || value.trim() === '') {
      fail('LFEA_RUNTIME_BUNDLE_OPTION_INVALID', { argument });
    }
    options.set(key, value);
  }
  const required = ['exact-head', 'external-package', 'external-root', 'internal-root', 'output'];
  const missing = required.filter((key) => !options.has(key));
  if (missing.length > 0) fail('LFEA_RUNTIME_BUNDLE_OPTIONS_MISSING', { missing });
  const exactHead = options.get('exact-head');
  if (!HEAD_PATTERN.test(exactHead)) {
    fail('LFEA_RUNTIME_BUNDLE_HEAD_INVALID', { exactHead });
  }
  return Object.freeze({
    exactHead,
    externalPackagePath: options.get('external-package'),
    externalRoot: path.resolve(options.get('external-root')),
    internalManifestPath: options.get('internal-manifest') ?? INTERNAL_MANIFEST_DEFAULT,
    internalRoot: path.resolve(options.get('internal-root')),
    outputRoot: path.resolve(options.get('output')),
  });
}

export async function assembleRuntimeReleaseBundle({
  repositoryRoot,
  internalRoot,
  externalRoot,
  externalPackagePath,
  outputRoot,
  exactHead,
  internalManifestPath = INTERNAL_MANIFEST_DEFAULT,
  internalManifestValidator = requireInternalExactHeadManifest,
  externalPackageValidator = requireLinearPipingExternalQualificationPackage,
  releaseEvaluator = evaluateReleaseReadiness,
  validators = Object.freeze({
    internal: validateInternalReleaseEvidence,
    external: validateExternalReleaseEvidence,
  }),
}) {
  requireHead(exactHead);
  const repository = requireDirectory(repositoryRoot, 'LFEA_RUNTIME_BUNDLE_REPOSITORY_INVALID');
  const internal = requireDirectory(internalRoot, 'LFEA_RUNTIME_BUNDLE_INTERNAL_ROOT_INVALID');
  const external = requireDirectory(externalRoot, 'LFEA_RUNTIME_BUNDLE_EXTERNAL_ROOT_INVALID');
  const output = prepareOutputPath(repository, internal, external, outputRoot);
  const internalManifestRelative = requireSafeRelativePath(
    internalManifestPath,
    'application/json',
    'LFEA_RUNTIME_BUNDLE_INTERNAL_MANIFEST_PATH_INVALID',
  );
  const externalPackageRelative = requireSafeRelativePath(
    externalPackagePath,
    'application/json',
    'LFEA_RUNTIME_BUNDLE_EXTERNAL_PACKAGE_PATH_INVALID',
  );

  const internalManifest = internalManifestValidator(readJson(
    resolveSourceFile(internal, internalManifestRelative),
    'LFEA_RUNTIME_BUNDLE_INTERNAL_MANIFEST_JSON_INVALID',
  ));
  const externalPackage = externalPackageValidator(readJson(
    resolveSourceFile(external, externalPackageRelative),
    'LFEA_RUNTIME_BUNDLE_EXTERNAL_PACKAGE_JSON_INVALID',
  ));
  if (internalManifest.exactHead !== exactHead || externalPackage.exactHead !== exactHead) {
    fail('LFEA_RUNTIME_BUNDLE_INPUT_HEAD_MISMATCH', {
      exactHead,
      internalHead: internalManifest.exactHead,
      externalHead: externalPackage.exactHead,
    });
  }

  const collectionSummary = requireCollectionSummary(
    internal,
    internalManifestRelative,
    internalManifest,
    exactHead,
  );
  const copyPlan = buildCopyPlan({
    internalRoot: internal,
    externalRoot: external,
    internalManifestPath: internalManifestRelative,
    internalManifest,
    collectionSummary,
    externalPackagePath: externalPackageRelative,
    externalPackage,
  });
  const staging = `${output}.staging-${process.pid}-${Date.now()}`;
  fs.mkdirSync(staging, { recursive: false });
  try {
    for (const entry of copyPlan) copyFile(entry.source, staging, entry.relativePath);
    const manifest = buildRuntimeReleaseManifest({
      exactHead,
      internalManifestPath: internalManifestRelative,
      internalManifest,
      externalPackagePath: externalPackageRelative,
      externalPackage,
    });
    const readiness = await releaseEvaluator({
      root: staging,
      evidence: manifest,
      releaseMode: true,
      expectedHead: exactHead,
      validators,
      policyRunner: null,
    });
    requireReleaseReadiness(readiness, exactHead);
    writeJson(staging, RELEASE_MANIFEST_PATH, manifest);
    const summary = Object.freeze({
      schema: ASSEMBLY_SCHEMA,
      status: 'ELIGIBLE_FOR_RELEASE_CERTIFICATION',
      exactHead,
      manifestPath: RELEASE_MANIFEST_PATH,
      internalManifestPath: internalManifestRelative,
      externalPackagePath: externalPackageRelative,
      copiedFileCount: copyPlan.length,
      verifiedGateCount: readiness.verifiedGateCount,
      internalManifestSemanticHash: internalManifest.semanticHash,
      internalManifestEvidenceHash: internalManifest.evidenceHash,
      externalPackageSemanticHash: externalPackage.semanticHash,
      externalPackageEvidenceHash: externalPackage.evidenceHash,
    });
    writeJson(staging, ASSEMBLY_SUMMARY_PATH, summary);
    fs.renameSync(staging, output);
    return summary;
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function requireCollectionSummary(root, manifestPath, manifest, exactHead) {
  const summary = readJson(
    resolveSourceFile(root, INTERNAL_COLLECTION_SUMMARY),
    'LFEA_RUNTIME_BUNDLE_COLLECTION_SUMMARY_INVALID',
  );
  requireExactKeys(summary, [
    'schema', 'status', 'exactHead', 'commandCount', 'artifactCount', 'manifestPath',
    'auditBaselinePath', 'auditBaselineContentHash', 'manifestSemanticHash',
    'manifestEvidenceHash',
  ], 'LFEA_RUNTIME_BUNDLE_COLLECTION_SUMMARY_INVALID');
  if (summary.schema !== 'lfea-piping-internal-evidence-collection/v1'
    || summary.status !== 'PASS'
    || summary.exactHead !== exactHead
    || summary.commandCount !== 10
    || summary.artifactCount !== INTERNAL_ROLES.length
    || summary.manifestPath !== manifestPath
    || summary.manifestSemanticHash !== manifest.semanticHash
    || summary.manifestEvidenceHash !== manifest.evidenceHash) {
    fail('LFEA_RUNTIME_BUNDLE_COLLECTION_SUMMARY_INVALID');
  }
  const baselinePath = requireSafeRelativePath(
    summary.auditBaselinePath,
    'application/json',
    'LFEA_RUNTIME_BUNDLE_BASELINE_PATH_INVALID',
  );
  const baseline = readJson(
    resolveSourceFile(root, baselinePath),
    'LFEA_RUNTIME_BUNDLE_BASELINE_INVALID',
  );
  if (baseline.schema !== 'lfea-piping-audit-baseline-runtime/v1'
    || baseline.repository !== 'reallaksh19/Advanced_Analysis'
    || baseline.exactHeadCommit !== exactHead
    || baseline.checkout?.clean !== true
    || baseline.evidenceStatus !== 'EXACT_HEAD_BASELINE_CAPTURED'
    || semanticHash(baseline) !== summary.auditBaselineContentHash) {
    fail('LFEA_RUNTIME_BUNDLE_BASELINE_INVALID');
  }
  return Object.freeze({ ...summary, auditBaselinePath: baselinePath });
}

function buildCopyPlan({
  internalRoot,
  externalRoot,
  internalManifestPath,
  internalManifest,
  collectionSummary,
  externalPackagePath,
  externalPackage,
}) {
  const entries = [
    sourceEntry(internalRoot, internalManifestPath),
    sourceEntry(internalRoot, INTERNAL_COLLECTION_SUMMARY),
    sourceEntry(internalRoot, collectionSummary.auditBaselinePath),
    ...INTERNAL_ROLES.map((role) => sourceEntry(
      internalRoot,
      requireSafeRelativePath(
        internalManifest.artifactReferences[role]?.path,
        internalManifest.artifactReferences[role]?.mediaType,
        'LFEA_RUNTIME_BUNDLE_INTERNAL_ARTIFACT_PATH_INVALID',
      ),
    )),
    sourceEntry(externalRoot, externalPackagePath),
    ...EXTERNAL_ROLES.map((role) => sourceEntry(
      externalRoot,
      requireSafeRelativePath(
        externalPackage.artifactReferences[role]?.path,
        'application/json',
        'LFEA_RUNTIME_BUNDLE_EXTERNAL_ARTIFACT_PATH_INVALID',
      ),
    )),
  ];
  const reserved = new Set([
    RELEASE_MANIFEST_PATH.toLowerCase(),
    ASSEMBLY_SUMMARY_PATH.toLowerCase(),
  ]);
  const seen = new Set();
  for (const entry of entries) {
    const key = entry.relativePath.toLowerCase();
    if (reserved.has(key) || seen.has(key)) {
      fail('LFEA_RUNTIME_BUNDLE_PATH_COLLISION', { path: entry.relativePath });
    }
    seen.add(key);
  }
  return Object.freeze(entries);
}

function buildRuntimeReleaseManifest({
  exactHead,
  internalManifestPath,
  internalManifest,
  externalPackagePath,
  externalPackage,
}) {
  const gates = Object.fromEntries(GATE_KEYS.map((gate) => [gate, 'VERIFIED']));
  return Object.freeze({
    schema: RELEASE_SCHEMA,
    program: RELEASE_PROGRAM,
    programDisposition: 'QUALIFIED',
    exactHead,
    gates: Object.freeze(gates),
    artifacts: Object.freeze({
      exactHeadManifest: internalManifestPath,
      upstreamGateLog: internalManifest.artifactReferences.upstreamGateLog.path,
      t0GateLog: internalManifest.artifactReferences.t0GateLog.path,
      sourceOrchestrationEvidence: internalManifest.artifactReferences.sourceOrchestrationEvidence.path,
      interfaceEvidence: internalManifest.artifactReferences.interfaceEvidence.path,
      interfaceRecoveryEvidence: internalManifest.artifactReferences.interfaceRecoveryEvidence.path,
      codeAndAllowableEvidence: internalManifest.artifactReferences.codeAndAllowableEvidence.path,
      presentationExportEvidence: internalManifest.artifactReferences.presentationExportEvidence.path,
      realModelReconciliation: externalPackage.artifactReferences.realModelReconciliation.path,
      commercialCorroboration: externalPackage.artifactReferences.commercialCorroboration.path,
      performanceEvidence: externalPackage.artifactReferences.performanceEvidence.path,
      rollbackEvidence: externalPackage.artifactReferences.rollbackEvidence.path,
      signedDisposition: externalPackage.artifactReferences.signedDisposition.path,
      externalQualificationPackage: externalPackagePath,
    }),
  });
}

function sourceEntry(root, relativePath) {
  return Object.freeze({
    relativePath,
    source: resolveSourceFile(root, relativePath),
  });
}

function copyFile(source, outputRoot, relativePath) {
  const target = path.resolve(outputRoot, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
}

function prepareOutputPath(repository, internal, external, outputRoot) {
  const output = path.resolve(outputRoot);
  if (fs.existsSync(output)) fail('LFEA_RUNTIME_BUNDLE_OUTPUT_EXISTS', { output });
  const parent = path.dirname(output);
  const parentReal = requireDirectory(parent, 'LFEA_RUNTIME_BUNDLE_OUTPUT_PARENT_INVALID');
  const resolvedOutput = path.join(parentReal, path.basename(output));
  for (const [name, root] of [
    ['repository', repository], ['internal', internal], ['external', external],
  ]) {
    if (isWithin(root, resolvedOutput) || isWithin(resolvedOutput, root)) {
      fail('LFEA_RUNTIME_BUNDLE_OUTPUT_OVERLAP', { name, output: resolvedOutput, root });
    }
  }
  if (internal === external) fail('LFEA_RUNTIME_BUNDLE_INPUT_ROOTS_ALIAS');
  return resolvedOutput;
}

function requireDirectory(value, code) {
  const absolute = path.resolve(value);
  if (!fs.existsSync(absolute)) fail(code, { value });
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isDirectory()) fail(code, { value });
  return fs.realpathSync(absolute);
}

function requireSafeRelativePath(value, mediaType, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code, { value });
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (path.posix.isAbsolute(normalized)
    || /^[A-Za-z]:\//u.test(normalized)
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    || INELIGIBLE_ROOTS.includes(segments[0].toLowerCase())) {
    fail(code, { value });
  }
  if (mediaType === 'application/json' && !normalized.toLowerCase().endsWith('.json')) {
    fail(code, { value, mediaType });
  }
  if (mediaType === 'text/plain' && !normalized.toLowerCase().endsWith('.log')) {
    fail(code, { value, mediaType });
  }
  if (!['application/json', 'text/plain'].includes(mediaType)) fail(code, { value, mediaType });
  return normalized;
}

function resolveSourceFile(root, relativePath) {
  const absolute = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(absolute)) {
    fail('LFEA_RUNTIME_BUNDLE_SOURCE_FILE_INVALID', { relativePath });
  }
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isFile()) {
    fail('LFEA_RUNTIME_BUNDLE_SOURCE_FILE_INVALID', { relativePath });
  }
  const real = fs.realpathSync(absolute);
  const realRelative = path.relative(root, real);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    fail('LFEA_RUNTIME_BUNDLE_SOURCE_FILE_INVALID', { relativePath });
  }
  return real;
}

function requireReleaseReadiness(value, exactHead) {
  if (!value
    || value.mode !== 'RELEASE'
    || value.releaseEligible !== true
    || value.programDisposition !== 'QUALIFIED'
    || value.exactHead !== exactHead
    || value.verifiedGateCount !== GATE_KEYS.length) {
    fail('LFEA_RUNTIME_BUNDLE_RELEASE_VALIDATION_INVALID', { value, exactHead });
  }
}

function requireHead(value) {
  if (!HEAD_PATTERN.test(value ?? '')) fail('LFEA_RUNTIME_BUNDLE_HEAD_INVALID', { value });
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function writeJson(root, relativePath, value) {
  const target = path.resolve(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(code, { filePath, message: error.message });
  }
}

function requireExactKeys(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort(compareAscii);
  const expected = [...keys].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code, { actual, expected });
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code, evidence = {}) {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  throw error;
}
