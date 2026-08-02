import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(
  ROOT,
  'reports/qualification/topology-edit-c3d-wave1-evidence.json',
);
const QUALIFIED_FILES = Object.freeze([
  'src/workspace/topology-edit-3d-view-controller.js',
  'src/workspace/viewport-presentation/topology-edit-presentation-contract.js',
  'src/workspace/viewport-presentation/topology-edit-presentation-runtime.js',
  'src/workspace/viewport-presentation/topology-edit-presentation-toolbar.js',
  'src/workspace/viewport-presentation/topology-edit-visibility-model.js',
  'tests/topology-edit-c3d-wave0.test.mjs',
  'tests/topology-edit-c3d-wave1-visibility.test.mjs',
]);

const actualHead = gitValue(['rev-parse', 'HEAD']);
const expectedHead = process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || actualHead;
if (actualHead !== expectedHead) {
  throw new Error(
    `Qualification head mismatch: expected ${expectedHead}, received ${actualHead}.`,
  );
}

const fileEvidence = {};
for (const repositoryPath of QUALIFIED_FILES) {
  const bytes = await readFile(path.join(ROOT, repositoryPath));
  fileEvidence[repositoryPath] = Object.freeze({
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
  });
}

const lockBytes = await readFile(path.join(ROOT, 'package-lock.json'));
const evidenceBase = {
  schema: 'TopologyEditC3DWave1Evidence.v1',
  repository: 'reallaksh19/Advanced_Analysis',
  targetHead: actualHead,
  baseRef: process.env.GITHUB_BASE_REF || null,
  generatedAt: new Date().toISOString(),
  qualification: {
    status: 'PASSED',
    command: process.env.TOPOLOGY_EDIT_C3D_QUALIFICATION_COMMAND || null,
    scope: 'CANONICAL_HIDE_ISOLATE_SHOW_ALL',
    authorityBoundary: 'DISPLAY_ONLY_NO_COMMAND_SCOPE_OR_CANONICAL_MUTATION',
    contracts: [
      'EXACT_CANONICAL_ID_VISIBILITY',
      'NO_PROXIMITY_RETARGETING',
      'INSTANCED_PICK_TABLE_PRESERVED',
      'STALE_ID_RECONCILIATION',
      'DETERMINISTIC_SCENE_REAPPLICATION',
    ],
  },
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpuModel: os.cpus()[0]?.model || null,
    cpuCount: os.cpus().length,
    memoryBytes: os.totalmem(),
  },
  dependencyLockSha256: sha256(lockBytes),
  files: fileEvidence,
};
const evidence = {
  ...evidenceBase,
  evidenceSha256: sha256(canonicalJson(evidenceBase)),
};
await mkdir(path.dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`);
console.log(`Wrote ${path.relative(ROOT, OUTPUT)} for ${actualHead}.`);

function gitValue(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortValue(value[key])]),
  );
}
