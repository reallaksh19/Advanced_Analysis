#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  canonicalStringify,
  semanticHash,
} from '../src/core/shared-piping-model/canonical-json.js';
import {
  requireProjectAuthorityBoundExternalPackage,
} from '../src/core/linear-piping-project-qualification/project-authority-bound-external-package.js';
import {
  assembleRuntimeReleaseBundle,
} from './lfea-piping-runtime-bundle-assembler.mjs';

const MODULE_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const RELEASE_MANIFEST_PATH = 'release-evidence.json';
const ASSEMBLY_SUMMARY_PATH = 'bundle/assembly-summary.json';
const LEGACY_EXTERNAL_PACKAGE_PATH = 'external/external-qualification-package.json';
const ASSEMBLY_SCHEMA = 'lfea-piping-wp2-runtime-bundle-assembly/v1';
const HEAD_PATTERN = /^[0-9a-f]{40}$/u;
const INELIGIBLE_ROOTS = Object.freeze([
  'e2e', 'script', 'scripts', 'test', 'tests', 'fixture', 'fixtures', 'mock', 'mocks',
]);

if (path.resolve(process.argv[1] ?? '') === MODULE_PATH) {
  const options = parseWp2RuntimeBundleAssemblyInvocation(process.argv.slice(2));
  const result = await assembleWp2RuntimeReleaseBundle(options);
  console.log(JSON.stringify(result));
}

export function parseWp2RuntimeBundleAssemblyInvocation(args) {
  const required = new Set([
    'bound-package',
    'exact-head',
    'external-root',
    'internal-root',
    'output',
  ]);
  const optional = new Set(['internal-manifest']);
  const values = new Map();
  for (const argument of args) {
    if (!argument.startsWith('--') || !argument.includes('=')) {
      fail('LFEA_WP2_RUNTIME_BUNDLE_OPTION_INVALID', { argument });
    }
    const separator = argument.indexOf('=');
    const key = argument.slice(2, separator);
    const value = argument.slice(separator + 1);
    if ((!required.has(key) && !optional.has(key))
      || values.has(key)
      || value.trim() === '') {
      fail('LFEA_WP2_RUNTIME_BUNDLE_OPTION_INVALID', { argument });
    }
    values.set(key, value);
  }
  const missing = [...required].filter((key) => !values.has(key));
  if (missing.length > 0) {
    fail('LFEA_WP2_RUNTIME_BUNDLE_OPTIONS_MISSING', { missing });
  }
  const exactHead = values.get('exact-head');
  if (!HEAD_PATTERN.test(exactHead)) {
    fail('LFEA_WP2_RUNTIME_BUNDLE_HEAD_INVALID', { exactHead });
  }
  return Object.freeze({
    repositoryRoot: REPOSITORY_ROOT,
    internalRoot: path.resolve(values.get('internal-root')),
    externalRoot: path.resolve(values.get('external-root')),
    boundPackagePath: values.get('bound-package'),
    internalManifestPath: values.get('internal-manifest'),
    outputRoot: path.resolve(values.get('output')),
    exactHead,
  });
}

export async function assembleWp2RuntimeReleaseBundle({
  repositoryRoot = REPOSITORY_ROOT,
  internalRoot,
  externalRoot,
  boundPackagePath,
  outputRoot,
  exactHead,
  internalManifestPath,
  boundPackageValidator = requireProjectAuthorityBoundExternalPackage,
  baseAssembler = assembleRuntimeReleaseBundle,
}) {
  if (!HEAD_PATTERN.test(exactHead ?? '')) {
    fail('LFEA_WP2_RUNTIME_BUNDLE_HEAD_INVALID', { exactHead });
  }
  const repository = requireDirectory(
    repositoryRoot,
    'LFEA_WP2_RUNTIME_BUNDLE_REPOSITORY_INVALID',
  );
  const internal = requireDirectory(
    internalRoot,
    'LFEA_WP2_RUNTIME_BUNDLE_INTERNAL_ROOT_INVALID',
  );
  const external = requireDirectory(
    externalRoot,
    'LFEA_WP2_RUNTIME_BUNDLE_EXTERNAL_ROOT_INVALID',
  );
  if (internal === external) fail('LFEA_WP2_RUNTIME_BUNDLE_INPUT_ROOTS_ALIAS');
  const output = prepareOutputPath(repository, internal, external, outputRoot);
  const boundRelative = requireSafeRelativeJsonPath(
    boundPackagePath,
    'LFEA_WP2_RUNTIME_BUNDLE_BOUND_PACKAGE_PATH_INVALID',
  );
  const boundPackage = boundPackageValidator(readJson(
    resolveSourceFile(external, boundRelative),
    'LFEA_WP2_RUNTIME_BUNDLE_BOUND_PACKAGE_JSON_INVALID',
  ));
  if (boundPackage.exactHead !== exactHead) {
    fail('LFEA_WP2_RUNTIME_BUNDLE_INPUT_HEAD_MISMATCH', {
      exactHead,
      boundHead: boundPackage.exactHead,
    });
  }
  const occupiedPaths = [
    boundRelative,
    boundPackage.projectAuthorityIndexArtifact.path,
    LEGACY_EXTERNAL_PACKAGE_PATH,
    RELEASE_MANIFEST_PATH,
    ASSEMBLY_SUMMARY_PATH,
    ...Object.values(boundPackage.externalPackage.artifactReferences)
      .map((entry) => entry.path),
  ].map((entry) => entry.toLowerCase());
  if (new Set(occupiedPaths).size !== occupiedPaths.length) {
    fail('LFEA_WP2_RUNTIME_BUNDLE_PATH_COLLISION');
  }
  requireRetainedAuthorityArtifact(external, boundPackage);

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'lfea-wp2-runtime-'));
  const legacyExternal = path.join(temp, 'external');
  const legacyOutput = path.join(temp, 'legacy-output');
  const staging = `${output}.staging-${process.pid}-${Date.now()}`;
  try {
    fs.mkdirSync(legacyExternal, { recursive: true });
    writeJson(
      path.join(legacyExternal, ...LEGACY_EXTERNAL_PACKAGE_PATH.split('/')),
      boundPackage.externalPackage,
    );
    for (const reference of Object.values(
      boundPackage.externalPackage.artifactReferences,
    )) {
      copyFile(
        resolveSourceFile(external, reference.path),
        legacyExternal,
        reference.path,
      );
    }
    await baseAssembler({
      repositoryRoot: repository,
      internalRoot: internal,
      externalRoot: legacyExternal,
      externalPackagePath: LEGACY_EXTERNAL_PACKAGE_PATH,
      outputRoot: legacyOutput,
      exactHead,
      ...(internalManifestPath === undefined ? {} : { internalManifestPath }),
    });
    requireLegacyAssembly(legacyOutput, exactHead);

    fs.mkdirSync(staging, { recursive: false });
    for (const entry of fs.readdirSync(legacyOutput)) {
      fs.cpSync(
        path.join(legacyOutput, entry),
        path.join(staging, entry),
        { recursive: true, errorOnExist: true, force: false },
      );
    }
    copyFile(
      resolveSourceFile(external, boundPackage.projectAuthorityIndexArtifact.path),
      staging,
      boundPackage.projectAuthorityIndexArtifact.path,
    );
    copyFile(resolveSourceFile(external, boundRelative), staging, boundRelative);

    const legacySummary = readJson(
      path.join(staging, ASSEMBLY_SUMMARY_PATH),
      'LFEA_WP2_RUNTIME_BUNDLE_LEGACY_SUMMARY_INVALID',
    );
    const summary = Object.freeze({
      schema: ASSEMBLY_SCHEMA,
      status: 'ELIGIBLE_FOR_RELEASE_CERTIFICATION',
      exactHead,
      manifestPath: RELEASE_MANIFEST_PATH,
      internalManifestPath: legacySummary.internalManifestPath,
      externalPackagePath: LEGACY_EXTERNAL_PACKAGE_PATH,
      projectAuthorityIndexPath:
        boundPackage.projectAuthorityIndexArtifact.path,
      projectAuthorityBoundPackagePath: boundRelative,
      copiedFileCount: legacySummary.copiedFileCount + 2,
      verifiedGateCount: legacySummary.verifiedGateCount,
      internalManifestSemanticHash: legacySummary.internalManifestSemanticHash,
      internalManifestEvidenceHash: legacySummary.internalManifestEvidenceHash,
      externalPackageSemanticHash: boundPackage.externalPackage.semanticHash,
      externalPackageEvidenceHash: boundPackage.externalPackage.evidenceHash,
      projectAuthorityIndexSemanticHash:
        boundPackage.externalPackage.projectAuthorityIndex.semanticHash,
      projectAuthorityIndexEvidenceHash:
        boundPackage.externalPackage.projectAuthorityIndex.evidenceHash,
      projectAuthorityBoundPackageSemanticHash: boundPackage.semanticHash,
      projectAuthorityBoundPackageEvidenceHash: boundPackage.evidenceHash,
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

function requireRetainedAuthorityArtifact(root, boundPackage) {
  const reference = boundPackage.projectAuthorityIndexArtifact;
  const record = readJson(
    resolveSourceFile(root, reference.path),
    'LFEA_WP2_RUNTIME_BUNDLE_AUTHORITY_JSON_INVALID',
  );
  const expected = boundPackage.externalPackage.projectAuthorityIndex;
  if (canonicalStringify(record) !== canonicalStringify(expected)
    || semanticHash(record) !== reference.contentHash
    || record.semanticHash !== reference.recordSemanticHash
    || record.evidenceHash !== reference.recordEvidenceHash) {
    fail('LFEA_WP2_RUNTIME_BUNDLE_AUTHORITY_ARTIFACT_MISMATCH');
  }
}

function requireLegacyAssembly(root, exactHead) {
  const manifest = readJson(
    path.join(root, RELEASE_MANIFEST_PATH),
    'LFEA_WP2_RUNTIME_BUNDLE_RELEASE_MANIFEST_INVALID',
  );
  const summary = readJson(
    path.join(root, ASSEMBLY_SUMMARY_PATH),
    'LFEA_WP2_RUNTIME_BUNDLE_LEGACY_SUMMARY_INVALID',
  );
  if (manifest.schema !== 'lfea-piping-release-evidence/v1'
    || manifest.programDisposition !== 'QUALIFIED'
    || manifest.exactHead !== exactHead
    || summary.schema !== 'lfea-piping-runtime-bundle-assembly/v1'
    || summary.status !== 'ELIGIBLE_FOR_RELEASE_CERTIFICATION'
    || summary.exactHead !== exactHead
    || !Number.isInteger(summary.copiedFileCount)
    || !Number.isInteger(summary.verifiedGateCount)) {
    fail('LFEA_WP2_RUNTIME_BUNDLE_LEGACY_ASSEMBLY_INVALID');
  }
}

function prepareOutputPath(repository, internal, external, outputRoot) {
  const output = path.resolve(outputRoot);
  if (fs.existsSync(output)) fail('LFEA_WP2_RUNTIME_BUNDLE_OUTPUT_EXISTS', { output });
  const parent = requireDirectory(
    path.dirname(output),
    'LFEA_WP2_RUNTIME_BUNDLE_OUTPUT_PARENT_INVALID',
  );
  const resolved = path.join(parent, path.basename(output));
  for (const [name, root] of [
    ['repository', repository],
    ['internal', internal],
    ['external', external],
  ]) {
    if (isWithin(root, resolved) || isWithin(resolved, root)) {
      fail('LFEA_WP2_RUNTIME_BUNDLE_OUTPUT_OVERLAP', { name, output: resolved, root });
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
    fail('LFEA_WP2_RUNTIME_BUNDLE_SOURCE_INVALID', { relativePath });
  }
  const status = fs.lstatSync(absolute);
  if (status.isSymbolicLink() || !status.isFile()) {
    fail('LFEA_WP2_RUNTIME_BUNDLE_SOURCE_INVALID', { relativePath });
  }
  const real = fs.realpathSync(absolute);
  const realRelative = path.relative(root, real);
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    fail('LFEA_WP2_RUNTIME_BUNDLE_SOURCE_INVALID', { relativePath });
  }
  return real;
}

function copyFile(source, outputRoot, relativePath) {
  const target = path.resolve(outputRoot, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
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

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function fail(code, evidence = {}) {
  const error = new Error(code);
  error.code = code;
  error.evidence = evidence;
  throw error;
}
