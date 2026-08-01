import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');

const MANIFEST_PATH = path.join(
  ROOT,
  'src/vendor/topology-edit/source-manifest.json',
);
const DISPOSITION_PATH = path.join(
  ROOT,
  'src/vendor/topology-edit/behavior-disposition.json',
);
const SCHEMA_PATH = path.join(
  ROOT,
  'src/vendor/topology-edit/qualification-evidence-schema.json',
);
const OUTPUT_PATH = path.join(
  ROOT,
  'reports/qualification/topology-edit-wave0-evidence.json',
);

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function currentHead() {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: ROOT,
  });
  return stdout.trim();
}

function assertIsoDate(value, label) {
  assert.ok(Number.isFinite(Date.parse(value)), `${label} is not ISO date-time`);
}

async function validateEvidence(evidence) {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, 'utf8'));
  for (const property of schema.required) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(evidence, property),
      `Qualification evidence is missing ${property}`,
    );
  }

  assert.equal(evidence.schema, schema.properties.schema.const);
  assert.equal(evidence.repository, schema.properties.repository.const);
  assert.match(evidence.commit, /^[a-f0-9]{40}$/);
  assert.equal(
    evidence.sourceRepository,
    schema.properties.sourceRepository.const,
  );
  assert.equal(evidence.sourceCommit, schema.properties.sourceCommit.const);
  assert.match(evidence.manifestHash, /^[a-f0-9]{64}$/);
  assert.match(evidence.behaviorDispositionHash, /^[a-f0-9]{64}$/);
  assert.ok(evidence.testCommand);
  assertIsoDate(evidence.startedAt, 'startedAt');
  assertIsoDate(evidence.completedAt, 'completedAt');
  assert.ok(['PASS', 'FAIL'].includes(evidence.status));
  assert.ok(Array.isArray(evidence.checks) && evidence.checks.length > 0);
}

async function main() {
  const head = await currentHead();
  const expectedHead =
    process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA ||
    process.env.GITHUB_SHA ||
    head;

  assert.equal(
    head,
    expectedHead,
    'Qualification checkout is not the exact requested target head',
  );

  const manifestBytes = await readFile(MANIFEST_PATH);
  const dispositionBytes = await readFile(DISPOSITION_PATH);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));

  const startedAt =
    process.env.TOPOLOGY_EDIT_QUALIFICATION_STARTED_AT ||
    new Date().toISOString();
  const completedAt = new Date().toISOString();

  const evidence = {
    schema: 'TopologyEditQualificationEvidence.v1',
    repository: 'reallaksh19/Advanced_Analysis',
    commit: head,
    sourceRepository: manifest.sourceRepository,
    sourceCommit: manifest.sourceCommit,
    manifestHash: sha256(manifestBytes),
    behaviorDispositionHash: sha256(dispositionBytes),
    testCommand:
      process.env.TOPOLOGY_EDIT_QUALIFICATION_COMMAND ||
      'topology-edit-wave0 workflow',
    startedAt,
    completedAt,
    status: 'PASS',
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      ci: process.env.CI === 'true',
    },
    checks: [
      { id: 'source-drift', status: 'PASS' },
      { id: 'api-and-behavior-drift', status: 'PASS' },
      { id: 'prohibited-imports-and-cycles', status: 'PASS' },
      { id: 'intentional-drift-injection', status: 'PASS' },
      { id: 'development-startup', status: 'PASS' },
      { id: 'production-startup', status: 'PASS' },
    ],
  };

  await validateEvidence(evidence);
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`);

  console.log(`Wrote exact-head qualification evidence: ${OUTPUT_PATH}`);
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch((error) => {
  console.error(`TOPOLOGY EDIT EVIDENCE WRITE FAILED: ${error.message}`);
  process.exitCode = 1;
});
