import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  ENGINEERING_FIELDS,
  FIXTURE_MANIFESTS,
  LINE_FLAG,
  buildEnrichmentUiFixture,
  fixtureSummary,
  materializeComponentRecord,
  materializeLineRecord,
  sourceLocatorsForLine,
} from './enrichment-ui-phase0-fixtures.mjs';
import {
  assertIndexInvariants,
  buildEnrichmentUiIndexes,
  lookupNormalizedLineKey,
} from './enrichment-ui-phase0-indexes.mjs';

const EXPECTED_SEMANTIC_HASHES = Object.freeze({
  small: '4b51263181e6ae265f6c9bd03ae149be7cb601d651b55562b9df9c8545725532',
  medium: 'c4a7219fbac782928bba0ef9f482a7215100891c622f90b1186464463314e845',
  large: '0cc665ab2eca644c2c286ca558914e23757ec9723a88b5f4cb573782efee8bfd',
});

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(scriptDirectory, 'enrichment-ui-phase0-fixture-hash-worker.mjs');
const evidence = [];

for (const [name, manifest] of Object.entries(FIXTURE_MANIFESTS)) {
  const fixture = buildWithNondeterminismGuards(name);
  const summary = fixtureSummary(fixture);

  assert.equal(summary.lineCount, manifest.lineCount, 'E_QF_MANIFEST_DRIFT');
  assert.equal(summary.componentCount, manifest.componentCount, 'E_QF_MANIFEST_DRIFT');
  assert.equal(summary.engineeringColumnCount, ENGINEERING_FIELDS.length, 'E_QF_FIELD_SCHEMA_DRIFT');
  assert.deepEqual(summary.flagCounts, {
    DUPLICATE_KEY: manifest.duplicateKeyTargetCount,
    MISSING_MASTER: manifest.missingMasterTargetCount,
    AMBIGUOUS_CONTAINMENT: manifest.ambiguousContainmentTargetCount,
    STALE_HASH: manifest.staleSourceTargetCount,
    BLOCKED_FIELD: manifest.blockedFieldTargetCount,
  }, 'E_QF_MANIFEST_DRIFT');

  const repeated = buildEnrichmentUiFixture(name);
  assert.equal(repeated.semanticHash, fixture.semanticHash, 'E_QF_REPEATED_RUN_MISMATCH');

  const utc = runWorker(name, 'UTC');
  const muscat = runWorker(name, 'Asia/Muscat');
  assert.equal(utc.semanticHash, fixture.semanticHash, 'E_QF_CROSS_PROCESS_MISMATCH');
  assert.equal(muscat.semanticHash, fixture.semanticHash, 'E_QF_TIMEZONE_DRIFT');

  const indexes = buildEnrichmentUiIndexes(fixture);
  assert.equal(assertIndexInvariants(indexes, fixture), true);
  for (let group = 0; group < manifest.duplicateKeyGroups; group += 1) {
    const ordinal = group * 2;
    const key = fixture.lines.normalizedLineKeyByOrdinal[ordinal];
    const result = lookupNormalizedLineKey(indexes, fixture, key);
    assert.equal(result.status, 'BLOCKED_AMBIGUOUS', 'E_QF_DUPLICATE_OVERWRITE');
    assert.equal(result.selectedTargetId, null, 'E_QF_DUPLICATE_OVERWRITE');
    assert.equal(result.candidateTargetIds.length, 2, 'E_QF_DUPLICATE_OVERWRITE');
  }

  const firstLine = materializeLineRecord(fixture, 0, ENGINEERING_FIELDS.slice(0, 4));
  assert.equal(firstLine.targetId, fixture.lines.targetIdByOrdinal[0]);
  assert(sourceLocatorsForLine(fixture, 0).length >= manifest.sourceLocatorCountMin);
  const firstComponent = materializeComponentRecord(fixture, 0);
  assert.equal(firstComponent.parentLineTargetId, firstLine.targetId);

  if (!EXPECTED_SEMANTIC_HASHES[name].startsWith('TO_BE_PINNED')) {
    assert.equal(fixture.semanticHash, EXPECTED_SEMANTIC_HASHES[name], 'E_QF_MANIFEST_DRIFT');
  }

  evidence.push({
    fixture: name,
    semanticHash: fixture.semanticHash,
    manifestHash: summary.manifestHash,
    lineCount: manifest.lineCount,
    componentCount: manifest.componentCount,
    duplicateKeyGroups: manifest.duplicateKeyGroups,
    repeatedRunEquality: true,
    crossProcessEquality: true,
    timezoneEquality: true,
  });
}

console.log(JSON.stringify({
  check: 'enrichment-ui-phase0-fixtures',
  status: 'PASS',
  evidence,
}));

function buildWithNondeterminismGuards(name) {
  const originalDateNow = Date.now;
  const originalMathRandom = Math.random;
  const globalCrypto = globalThis.crypto;
  const originalRandomUuid = globalCrypto?.randomUUID;
  Date.now = () => {
    const error = new Error('E_QF_HIDDEN_CLOCK');
    error.code = 'E_QF_HIDDEN_CLOCK';
    throw error;
  };
  Math.random = () => {
    const error = new Error('E_QF_RANDOM_SOURCE');
    error.code = 'E_QF_RANDOM_SOURCE';
    throw error;
  };
  if (globalCrypto && typeof originalRandomUuid === 'function') {
    globalCrypto.randomUUID = () => {
      const error = new Error('E_QF_RANDOM_SOURCE');
      error.code = 'E_QF_RANDOM_SOURCE';
      throw error;
    };
  }
  try {
    return buildEnrichmentUiFixture(name);
  } finally {
    Date.now = originalDateNow;
    Math.random = originalMathRandom;
    if (globalCrypto && typeof originalRandomUuid === 'function') globalCrypto.randomUUID = originalRandomUuid;
  }
}

function runWorker(name, timezone) {
  const result = spawnSync(process.execPath, [workerPath, name], {
    cwd: path.dirname(scriptDirectory),
    env: { ...process.env, TZ: timezone },
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || `E_QF_CROSS_PROCESS_MISMATCH: ${name} ${timezone}`);
  return JSON.parse(result.stdout.trim());
}
