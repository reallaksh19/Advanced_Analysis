import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const MANIFEST_PATH = path.join(ROOT, 'src/vendor/topology-edit/source-manifest.json');
const DISPOSITION_PATH = path.join(ROOT, 'src/vendor/topology-edit/behavior-disposition.json');

export const EXPECTED_DISPOSITION_SHA256 = '2b77f2750c5a61421e56f4980cc8c7550d07453f3ed27e02917ee66aa640790c';
export const EXPECTED_NATIVE_COMMANDS = Object.freeze([
  'MOVE_NODE',
  'MERGE_NODES',
  'BRIDGE_GAP',
  'ADD_STRAIGHT_ELEMENT',
  'SPLIT_EDGE',
  'DISCONNECT_ENDPOINT',
  'DELETE_EDGE',
]);
export const EXPECTED_CORE_FUNCTIONS = Object.freeze([
  'buildComponentTopologyArtifacts',
  'buildEditedComponentTopologyArtifacts',
  'topologyArtifactOutputs',
  'createTopologyEditDraft',
  'appendTopologyEditCommand',
  'appendTopologyEditTransaction',
  'undoTopologyEditCommand',
  'redoTopologyEditCommand',
  'runTopologyChecks',
  'buildTopologyFixSuggestions',
]);
export const EXPECTED_CAPABILITY_IDS = Object.freeze([
  'tool.select',
  'tool.move',
  'tool.connect',
  'tool.add',
  'tool.split',
  'tool.measure',
  'operation.merge',
  'operation.merge-request',
  'operation.bridge-request',
  'operation.disconnect',
  'operation.delete',
  'history.undo',
  'history.redo',
  'view.zoom-in',
  'view.zoom-out',
  'view.fit',
  'scene.previous',
  'scene.next',
  'scene.focus',
]);
const CLASSIFICATIONS = new Set([
  'AS_IS',
  'WRAPPED',
  'FORKED',
  'REFERENCE_ONLY',
]);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

async function walkJavaScript(targetPath) {
  const info = await stat(targetPath);
  if (info.isFile()) return /\.(?:js|mjs)$/.test(targetPath) ? [targetPath] : [];
  const files = [];
  for (const entry of await readdir(targetPath, { withFileTypes: true })) {
    const child = path.join(targetPath, entry.name);
    if (entry.isDirectory()) files.push(...await walkJavaScript(child));
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(child);
  }
  return files;
}

function repositoryPath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

export async function verifyTopologyEditApiAuthority() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const dispositionBytes = await readFile(DISPOSITION_PATH);
  assert.equal(
    sha256(dispositionBytes),
    EXPECTED_DISPOSITION_SHA256,
    'Topology Edit behavior disposition changed without a reviewed lock update',
  );

  const disposition = JSON.parse(dispositionBytes.toString('utf8'));
  assert.equal(disposition.schema, 'TopologyEditBehaviorDisposition.v1');
  assert.equal(disposition.sourceCommit, manifest.sourceCommit);
  assert.equal(disposition.targetRepository, manifest.targetRepository);
  assert.equal(disposition.baselineTargetCommit, manifest.baselineTargetCommit);
  assert.deepEqual(
    manifest.publicApi.nativeCommands,
    EXPECTED_NATIVE_COMMANDS,
    'Native command vocabulary drifted',
  );
  assert.deepEqual(
    manifest.publicApi.requiredFunctions,
    EXPECTED_CORE_FUNCTIONS,
    'Pinned core API vocabulary drifted',
  );
  assert.deepEqual(
    manifest.publicApi.capabilityIds,
    EXPECTED_CAPABILITY_IDS,
    'Topology Edit capability vocabulary drifted',
  );

  const declared = new Map();
  for (const module of disposition.modules) {
    assert.ok(module.targetPath, 'Behavior disposition module is missing targetPath');
    assert.ok(CLASSIFICATIONS.has(module.classification));
    assert.ok(module.authority, `${module.targetPath} is missing authority`);
    assert.ok(module.status, `${module.targetPath} is missing status`);
    assert.ok(!declared.has(module.targetPath), `Duplicate module disposition: ${module.targetPath}`);
    declared.set(module.targetPath, module);
    await stat(path.join(ROOT, module.targetPath));
  }

  const actualFiles = [];
  for (const scopeRoot of disposition.scopeRoots) {
    actualFiles.push(...await walkJavaScript(path.join(ROOT, scopeRoot)));
  }
  const actual = sorted(new Set(actualFiles.map(repositoryPath)));
  const expected = sorted(declared.keys());
  assert.deepEqual(
    actual,
    expected,
    'Every current Topology Edit JavaScript module must have one explicit behavior disposition',
  );

  const targetAuthority = new Set(
    manifest.behaviorAuthorities.flatMap((authority) => authority.targetPaths),
  );
  for (const modulePath of expected) {
    assert.ok(
      targetAuthority.has(modulePath) || modulePath.endsWith('topology-edit-baseline-manifest.js'),
      `${modulePath} has no source or approved target behavior authority`,
    );
  }

  const smokeSource = await readFile(
    path.join(ROOT, 'tests/topology-edit-anti-drift.test.js'),
    'utf8',
  );
  assert.ok(
    !smokeSource.includes('100% SUCCESS'),
    'Phase-one smoke suite still claims unbounded 100% success',
  );
  assert.ok(
    smokeSource.includes('TOPOLOGY EDIT PHASE-ONE SMOKE CONTRACTS PASSED'),
    'Phase-one smoke suite is missing its bounded result label',
  );

  return Object.freeze({
    nativeCommands: EXPECTED_NATIVE_COMMANDS.length,
    coreFunctions: EXPECTED_CORE_FUNCTIONS.length,
    capabilityIds: EXPECTED_CAPABILITY_IDS.length,
    classifiedModules: expected.length,
    dispositionSha256: EXPECTED_DISPOSITION_SHA256,
  });
}

async function main() {
  const evidence = await verifyTopologyEditApiAuthority();
  console.log(JSON.stringify(evidence, null, 2));
  console.log('TOPOLOGY EDIT API AND BEHAVIOR AUTHORITY DRIFT CHECK PASSED');
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`TOPOLOGY EDIT API AND BEHAVIOR AUTHORITY DRIFT CHECK FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
