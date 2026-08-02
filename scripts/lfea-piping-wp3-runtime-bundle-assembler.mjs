#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  PHASE6I_FROZEN_CANDIDATE,
  requirePhase6iExternalEvidenceHandoff,
  requirePhase6iExternalEvidenceHandoffAcceptance,
  requireProjectAuthorityBoundExternalPackage,
} from '../src/core/linear-piping-project-qualification/index.js';
import { assembleWp2RuntimeReleaseBundle } from './lfea-piping-wp2-runtime-bundle-assembler.mjs';

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const RELEASE_MANIFEST_PATH = 'release-evidence.json';
const ASSEMBLY_SUMMARY_PATH = 'bundle/assembly-summary.json';
const LEGACY_EXTERNAL_PACKAGE_PATH = 'external/external-qualification-package.json';
const ASSEMBLY_SCHEMA = 'lfea-piping-wp3-runtime-bundle-assembly/v1';
const REQUEST_SCHEMA = 'lfea-piping-external-materialization-request/v2';
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const REQUEST_KEYS = Object.freeze([
  'schema', 'packageId', 'exactHead', 'projectAuthorityIndex', 'records',
]);
const RECORD_KEYS = Object.freeze([
  'applicationResult', 'presentation', 'realModelReconciliation',
  'commercialCorroboration', 'performanceEvidence', 'rollbackEvidence',
  'reviewDisposition',
]);
const INELIGIBLE_ROOTS = Object.freeze([
  'e2e', 'script', 'scripts', 'test', 'tests', 'fixture', 'fixtures', 'mock', 'mocks',
]);

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const options = parseWp3RuntimeBundleAssemblyInvocation(process.argv.slice(2));
  const result = await assembleWp3RuntimeReleaseBundle(options);
  console.log(JSON.stringify(result));
}

export function parseWp3RuntimeBundleAssemblyInvocation(args) {
  const required = new Set([
    'bound-package', 'exact-head', 'external-root', 'handoff',
    'handoff-acceptance', 'internal-root', 'output', 'source-request',
  ]);
  const optional = new Set(['internal-manifest']);
  const values = new Map();
  for (const argument of args) {
    if (!argument.startsWith('--') || !argument.includes('=')) {
      fail('LFEA_WP3_RUNTIME_BUNDLE_OPTION_INVALID', { argument });
    }
    const separator = argument.indexOf('=');
    const key = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if ((!required.has(key) && !optional.has(key))
      || values.has(key)
      || value.trim() === '') {
      fail('LFEA_WP3_RUNTIME_BUNDLE_OPTION_INVALID', { argument });
    }
    values.set(key, value);
  }
  const missing = [...required].filter((key) => !values.has(key));
  if (missing.length > 0) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_OPTIONS_MISSING', { missing });
  }
  const exactHead = values.get('exact-head');
  if (!HEAD_PATTERN.test(exactHead) || exactHead !== PHASE6I_FROZEN_CANDIDATE) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_HEAD_INVALID', { exactHead });
  }
  return Object.freeze({
    repositoryRoot: REPOSITORY_ROOT,
    internalRoot: path.resolve(values.get('internal-root')),
    externalRoot: path.resolve(values.get('external-root')),
    boundPackagePath: values.get('bound-package'),
    handoffPath: values.get('handoff'),
    sourceRequestPath: values.get('source-request'),
    handoffAcceptancePath: values.get('handoff-acceptance'),
    internalManifestPath: values.get('internal-manifest'),
    outputRoot: path.resolve(values.get('output')),
    exactHead,
  });
}

export async function assembleWp3RuntimeReleaseBundle({
  repositoryRoot = REPOSITORY_ROOT,
  internalRoot,
  externalRoot,
  boundPackagePath,
  handoffPath,
  sourceRequestPath,
  handoffAcceptancePath,
  outputRoot,
  exactHead,
  internalManifestPath,
  boundPackageValidator = requireProjectAuthorityBoundExternalPackage,
  handoffValidator = requirePhase6iExternalEvidenceHandoff,
  acceptanceValidator = requirePhase6iExternalEvidenceHandoffAcceptance,
  baseAssembler = assembleWp2RuntimeReleaseBundle,
}) {
  if (exactHead !== PHASE6I_FROZEN_CANDIDATE) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_HEAD_INVALID', { exactHead });
  }
  const repository = requireDirectory(
    repositoryRoot,
    'LFEA_WP3_RUNTIME_BUNDLE_REPOSITORY_INVALID',
  );
  const internal = requireDirectory(
    internalRoot,
    'LFEA_WP3_RUNTIME_BUNDLE_INTERNAL_ROOT_INVALID',
  );
  const external = requireDirectory(
    externalRoot,
    'LFEA_WP3_RUNTIME_BUNDLE_EXTERNAL_ROOT_INVALID',
  );
  if (internal === external) fail('LFEA_WP3_RUNTIME_BUNDLE_INPUT_ROOTS_ALIAS');
  const output = prepareOutputPath(repository, internal, external, outputRoot);
  const boundRelative = requireSafeRelativeJsonPath(
    boundPackagePath,
    'LFEA_WP3_RUNTIME_BUNDLE_BOUND_PACKAGE_PATH_INVALID',
  );
  const handoffRelative = requireSafeRelativeJsonPath(
    handoffPath,
    'LFEA_WP3_RUNTIME_BUNDLE_HANDOFF_PATH_INVALID',
  );
  const requestRelative = requireSafeRelativeJsonPath(
    sourceRequestPath,
    'LFEA_WP3_RUNTIME_BUNDLE_SOURCE_REQUEST_PATH_INVALID',
  );
  const acceptanceRelative = requireSafeRelativeJsonPath(
    handoffAcceptancePath,
    'LFEA_WP3_RUNTIME_BUNDLE_ACCEPTANCE_PATH_INVALID',
  );

  const boundPackage = boundPackageValidator(readJson(
    resolveSourceFile(external, boundRelative),
    'LFEA_WP3_RUNTIME_BUNDLE_BOUND_PACKAGE_JSON_INVALID',
  ));
  const handoff = handoffValidator(readJson(
    resolveSourceFile(external, handoffRelative),
    'LFEA_WP3_RUNTIME_BUNDLE_HANDOFF_JSON_INVALID',
  ));
  const request = requireSourceRequest(readJson(
    resolveSourceFile(external, requestRelative),
    'LFEA_WP3_RUNTIME_BUNDLE_SOURCE_REQUEST_JSON_INVALID',
  ), exactHead);
  const acceptance = acceptanceValidator(readJson(
    resolveSourceFile(external, acceptanceRelative),
    'LFEA_WP3_RUNTIME_BUNDLE_ACCEPTANCE_JSON_INVALID',
  ));

  requireCustodyConsistency({
    exactHead, boundPackage, handoff, request, acceptance,
    handoffRelative, requestRelative,
  });
  requireUniquePaths({
    boundPackage, boundRelative, handoffRelative, requestRelative, acceptanceRelative,
  });

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-wp3-runtime-'));
  const wp2Output = path.join(temp, 'wp2-output');
  const staging = `${output}.staging-${process.pid}-${Date.now()}`;
  try {
    await baseAssembler({
      repositoryRoot: repository,
      internalRoot: internal,
      externalRoot: external,
      boundPackagePath: boundRelative,
      outputRoot: wp2Output,
      exactHead,
      ...(internalManifestPath === undefined ? {} : { internalManifestPath }),
    });
    const wp2Summary = requireWp2Assembly(
      wp2Output, exactHead, boundPackage, boundRelative,
    );

    fs.mkdirSync(staging, { recursive: false });
    for (const entry of fs.readdirSync(wp2Output)) {
      fs.cpSync(
        path.join(wp2Output, entry),
        path.join(staging, entry),
        { recursive: true, errorOnExist: true, force: false },
      );
    }
    copyFile(resolveSourceFile(external, handoffRelative), staging, handoffRelative);
    copyFile(resolveSourceFile(external, requestRelative), staging, requestRelative);
    copyFile(resolveSourceFile(external, acceptanceRelative), staging, acceptanceRelative);

    const summary = Object.freeze({
      schema: ASSEMBLY_SCHEMA,
      status: 'ELIGIBLE_FOR_RELEASE_CERTIFICATION',
      exactHead,
      manifestPath: RELEASE_MANIFEST_PATH,
      internalManifestPath: wp2Summary.internalManifestPath,
      externalPackagePath: wp2Summary.externalPackagePath,
      projectAuthorityIndexPath: wp2Summary.projectAuthorityIndexPath,
      projectAuthorityBoundPackagePath:
        wp2Summary.projectAuthorityBoundPackagePath,
      sourceHandoffPath: handoffRelative,
      sourceMaterializationRequestPath: requestRelative,
      sourceHandoffAcceptancePath: acceptanceRelative,
      sourceRunId: handoff.sourceRunId,
      sourceArtifactName: handoff.sourceArtifactName,
      copiedFileCount: wp2Summary.copiedFileCount + 3,
      verifiedGateCount: wp2Summary.verifiedGateCount,
      internalManifestSemanticHash: wp2Summary.internalManifestSemanticHash,
      internalManifestEvidenceHash: wp2Summary.internalManifestEvidenceHash,
      externalPackageSemanticHash: wp2Summary.externalPackageSemanticHash,
      externalPackageEvidenceHash: wp2Summary.externalPackageEvidenceHash,
      projectAuthorityIndexSemanticHash:
        wp2Summary.projectAuthorityIndexSemanticHash,
      projectAuthorityIndexEvidenceHash:
        wp2Summary.projectAuthorityIndexEvidenceHash,
      projectAuthorityBoundPackageSemanticHash:
        wp2Summary.projectAuthorityBoundPackageSemanticHash,
      projectAuthorityBoundPackageEvidenceHash:
        wp2Summary.projectAuthorityBoundPackageEvidenceHash,
      sourceRequestContentHash: handoff.requestContentHash,
      sourceHandoffContentHash: semanticHash(handoff),
      sourceHandoffSemanticHash: handoff.semanticHash,
      sourceHandoffEvidenceHash: handoff.evidenceHash,
      sourceHandoffAcceptanceContentHash: semanticHash(acceptance),
      sourceHandoffAcceptanceSemanticHash: acceptance.semanticHash,
      sourceHandoffAcceptanceEvidenceHash: acceptance.evidenceHash,
    });
    overwriteJson(path.join(staging, ASSEMBLY_SUMMARY_PATH), summary);
    fs.renameSync(staging, output);
    return summary;
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function requireCustodyConsistency({
  exactHead, boundPackage, handoff, request, acceptance,
  handoffRelative, requestRelative,
}) {
  const authority = boundPackage.externalPackage.projectAuthorityIndex;
  if (boundPackage.exactHead !== exactHead
    || handoff.candidateSha !== exactHead
    || acceptance.candidateSha !== exactHead) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_INPUT_HEAD_MISMATCH');
  }
  if (request.packageId !== boundPackage.packageId) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_PACKAGE_ID_MISMATCH');
  }
  if (acceptance.sourceHandoffPath !== handoffRelative
    || acceptance.sourceRequestPath !== requestRelative
    || acceptance.projectAuthorityIndexPath
      !== boundPackage.projectAuthorityIndexArtifact.path) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_ACCEPTANCE_PATH_MISMATCH');
  }
  if (handoff.sourceRunId !== acceptance.sourceRunId
    || handoff.sourceArtifactName !== acceptance.sourceArtifactName
    || handoff.recordCount !== acceptance.recordCount) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_SOURCE_IDENTITY_MISMATCH');
  }
  const requestHash = semanticHash(request);
  if (handoff.requestContentHash !== requestHash
    || acceptance.requestContentHash !== requestHash) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_REQUEST_CONTENT_MISMATCH');
  }
  if (acceptance.sourceHandoffContentHash !== semanticHash(handoff)
    || acceptance.sourceHandoffSemanticHash !== handoff.semanticHash
    || acceptance.sourceHandoffEvidenceHash !== handoff.evidenceHash) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_HANDOFF_IDENTITY_MISMATCH');
  }
  if (handoff.projectAuthorityIndexSemanticHash !== authority.semanticHash
    || handoff.projectAuthorityIndexEvidenceHash !== authority.evidenceHash
    || acceptance.projectAuthorityIndexSemanticHash !== authority.semanticHash
    || acceptance.projectAuthorityIndexEvidenceHash !== authority.evidenceHash) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_AUTHORITY_IDENTITY_MISMATCH');
  }
}

function requireSourceRequest(value, exactHead) {
  requireExactKeys(value, REQUEST_KEYS, 'LFEA_WP3_RUNTIME_BUNDLE_SOURCE_REQUEST_INVALID');
  if (value.schema !== REQUEST_SCHEMA
    || value.exactHead !== exactHead
    || typeof value.packageId !== 'string'
    || value.packageId.trim() === '') {
    fail('LFEA_WP3_RUNTIME_BUNDLE_SOURCE_REQUEST_INVALID');
  }
  const authorityPath = requireSafeRelativeJsonPath(
    value.projectAuthorityIndex,
    'LFEA_WP3_RUNTIME_BUNDLE_SOURCE_REQUEST_INVALID',
  );
  requireExactKeys(
    value.records,
    RECORD_KEYS,
    'LFEA_WP3_RUNTIME_BUNDLE_SOURCE_REQUEST_INVALID',
  );
  const recordPaths = RECORD_KEYS.map((key) => requireSafeRelativeJsonPath(
    value.records[key],
    'LFEA_WP3_RUNTIME_BUNDLE_SOURCE_REQUEST_INVALID',
  ));
  const paths = [authorityPath, ...recordPaths].map((entry) => entry.toLowerCase());
  if (new Set(paths).size !== paths.length) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_SOURCE_REQUEST_PATH_DUPLICATE');
  }
  return value;
}

function requireUniquePaths({
  boundPackage, boundRelative, handoffRelative, requestRelative, acceptanceRelative,
}) {
  const paths = [
    RELEASE_MANIFEST_PATH,
    ASSEMBLY_SUMMARY_PATH,
    LEGACY_EXTERNAL_PACKAGE_PATH,
    boundRelative,
    boundPackage.projectAuthorityIndexArtifact.path,
    handoffRelative,
    requestRelative,
    acceptanceRelative,
    ...Object.values(boundPackage.externalPackage.artifactReferences)
      .map((entry) => entry.path),
  ].map((value) => value.toLowerCase());
  if (new Set(paths).size !== paths.length) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_PATH_COLLISION');
  }
}

function requireWp2Assembly(root, exactHead, boundPackage, boundRelative) {
  const manifest = readJson(
    path.join(root, RELEASE_MANIFEST_PATH),
    'LFEA_WP3_RUNTIME_BUNDLE_RELEASE_MANIFEST_INVALID',
  );
  const summary = readJson(
    path.join(root, ASSEMBLY_SUMMARY_PATH),
    'LFEA_WP3_RUNTIME_BUNDLE_WP2_SUMMARY_INVALID',
  );
  const authority = boundPackage.externalPackage.projectAuthorityIndex;
  if (manifest.schema !== 'lfea-piping-release-evidence/v1'
    || manifest.programDisposition !== 'QUALIFIED'
    || manifest.exactHead !== exactHead
    || summary.schema !== 'lfea-piping-wp2-runtime-bundle-assembly/v1'
    || summary.status !== 'ELIGIBLE_FOR_RELEASE_CERTIFICATION'
    || summary.exactHead !== exactHead
    || summary.projectAuthorityIndexPath
      !== boundPackage.projectAuthorityIndexArtifact.path
    || summary.projectAuthorityBoundPackagePath !== boundRelative
    || summary.externalPackageSemanticHash
      !== boundPackage.externalPackage.semanticHash
    || summary.externalPackageEvidenceHash
      !== boundPackage.externalPackage.evidenceHash
    || summary.projectAuthorityIndexSemanticHash !== authority.semanticHash
    || summary.projectAuthorityIndexEvidenceHash !== authority.evidenceHash
    || summary.projectAuthorityBoundPackageSemanticHash !== boundPackage.semanticHash
    || summary.projectAuthorityBoundPackageEvidenceHash !== boundPackage.evidenceHash
    || !Number.isInteger(summary.copiedFileCount)
    || !Number.isInteger(summary.verifiedGateCount)) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_WP2_ASSEMBLY_INVALID');
  }
  return summary;
}

function prepareOutputPath(repository, internal, external, outputRoot) {
  const output = path.resolve(outputRoot);
  if (fs.existsSync(output)) fail('LFEA_WP3_RUNTIME_BUNDLE_OUTPUT_EXISTS', { output });
  const parent = requireDirectory(
    path.dirname(output),
    'LFEA_WP3_RUNTIME_BUNDLE_OUTPUT_PARENT_INVALID',
  );
  const resolved = path.join(parent, path.basename(output));
  for (const [name, root] of [
    ['repository', repository], ['internal', internal], ['external', external],
  ]) {
    if (isWithin(root, resolved) || isWithin(resolved, root)) {
      fail('LFEA_WP3_RUNTIME_BUNDLE_OUTPUT_OVERLAP', { name, output: resolved, root });
    }
  }
  return resolved;
}

function requireDirectory(value, code) {
  const absolute = path.resolve(value);
  if (!fs.existsSync(absolute)) fail(code, { value });
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isDirectory()) fail(code, { value });
  return fs.realpathSync(absolute);
}

function requireSafeRelativeJsonPath(value, code) {
  if (typeof value !== 'string' || value.trim() === '') fail(code, { value });
  const normalized = value.replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (path.posix.isAbsolute(normalized)
    || /^[A-Za-z]:\//u.test(normalized)
    || segments.some((segment) => segment === '' || segment === '.' || segment === '..')
    || INELIGIBLE_ROOTS.includes(segments[0].toLowerCase())
    || !normalized.toLowerCase().endsWith('.json')) {
    fail(code, { value });
  }
  return normalized;
}

function resolveSourceFile(root, relativePath) {
  const absolute = path.resolve(root, ...relativePath.split('/'));
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(absolute)) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_SOURCE_INVALID', { relativePath });
  }
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isFile()) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_SOURCE_INVALID', { relativePath });
  }
  const real = fs.realpathSync(absolute);
  const realRelative = path.relative(root, real);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    fail('LFEA_WP3_RUNTIME_BUNDLE_SOURCE_INVALID', { relativePath });
  }
  return real;
}

function copyFile(source, outputRoot, relativePath) {
  const target = path.resolve(outputRoot, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
}

function overwriteJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(code, { filePath, message: error.message });
  }
}

function requireExactKeys(value, expectedKeys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort(compareAscii);
  const expected = [...expectedKeys].sort(compareAscii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(code, { actual, expected });
  }
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
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
