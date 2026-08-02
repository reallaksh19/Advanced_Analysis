import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {
  ENGINEERING_FIELDS,
  FIXTURE_MANIFESTS,
  buildEnrichmentUiFixture,
  fixtureSummary,
  sha256Text,
  stableStringify,
} from './enrichment-ui-phase0-fixtures.mjs';
import {
  applyFilter,
  assertIndexInvariants,
  buildEnrichmentUiIndexes,
  buildExceptionQueues,
  buildGroups,
  buildVisibleOrder,
  indexEvidence,
  materializeViewport,
} from './enrichment-ui-phase0-indexes.mjs';


const EXPECTED_STAGE_DIGESTS = Object.freeze({
  small: Object.freeze({
    'index-construction': '392e5ddbf742706cd17e248dbfe5b58c1033b4ccad1c52de4319e56a9d3d4cca',
    grouping: '010551d04f2ee4bac1289b67f5a17bc58225024640aa2f7619653516f505c644',
    filtering: '2d94bd2f7bcf436ee82ff36f66d377c2ce2a5f7cb3528101d3e68a51e1bae5f8',
    'exception-queue-construction': '7b3f45078796b314ccccc35f96b9d94acd7116b134bcecd6f7c745c1aba6154f',
    'viewport-materialization': 'a6934633b25f57e46b97bb14b02f8460e832615c631613ac4f86f06cd74cb535',
  }),
  medium: Object.freeze({
    'index-construction': '6de170100c8fe5d37280e36c672e8057214a036edd7a030ed96844bcf9679ac8',
    grouping: 'df0ead876e2c5e49f71a6e5b39417e0234fc98da18b1a3bdffaa8664b2154ebe',
    filtering: 'b549184315fb7dc089b54dbe9e51afecfca0dac14a9eb6011c52bb3bee7f293d',
    'exception-queue-construction': 'fc8084ffbe8b7e92bcc520bb50284abd6dba5261bd4ce5c1483a847b4a0881cf',
    'viewport-materialization': '4cca515b20ede9819904c2ee946e8cd228eb2c72d95c7d21ffe01a55ee38fb03',
  }),
  large: Object.freeze({
    'index-construction': '43b4429cce01bb27992d5815a4866861cd669c6532c105ae0826703de55af3d7',
    grouping: '2348065246e42daec565dd28736109c84ed4c7551716f83f1882666ebc9c7c5f',
    filtering: 'ee90545607412cfb888eee946d8449cfe5f9784e994c9b5782e68da7201faaf5',
    'exception-queue-construction': '59c80a83d7f989652cf43e03ada5fc236939b9184337b93eb497ff0b2771a2f8',
    'viewport-materialization': 'd1707a0764ac4db0fbbe715b51121acad09a5ba57eff261271850ca794e40ae1',
  }),
});

const requested = argumentValue('--fixture') ?? 'all';
const fixtureNames = requested === 'all' ? Object.keys(FIXTURE_MANIFESTS) : [requested];
for (const name of fixtureNames) {
  if (!FIXTURE_MANIFESTS[name]) throw new RangeError(`Unknown fixture: ${name}`);
}

const allEvidence = [];
for (const fixtureName of fixtureNames) {
  const manifest = FIXTURE_MANIFESTS[fixtureName];

  const fixtureMeasurement = measureStage('fixture-generation', fixtureName, () => buildEnrichmentUiFixture(fixtureName));
  const fixture = fixtureMeasurement.value;
  const fixtureEvidence = {
    ...baseEvidence(fixtureName, manifest, fixtureMeasurement),
    output: fixtureSummary(fixture),
    operations: {
      lineVisits: manifest.lineCount,
      componentVisits: manifest.componentCount,
      engineeringCellWrites: manifest.lineCount * manifest.engineeringColumnCount,
      domAccesses: 0,
      materializedRows: 0,
    },
  };
  emit(fixtureEvidence);
  allEvidence.push(fixtureEvidence);

  const indexMeasurement = measureStage('index-construction', fixtureName, () => buildEnrichmentUiIndexes(fixture));
  const indexes = indexMeasurement.value;
  assert.equal(assertIndexInvariants(indexes, fixture), true);
  assert.equal(indexes.structuralDigest, EXPECTED_STAGE_DIGESTS[fixtureName]['index-construction'], 'E_QF_INDEX_DRIFT');
  const indexRecord = {
    ...baseEvidence(fixtureName, manifest, indexMeasurement),
    output: indexEvidence(indexes, fixture),
    operations: {
      lineVisits: manifest.lineCount,
      componentVisits: manifest.componentCount,
      keyBindings: manifest.lineCount,
      domAccesses: 0,
      materializedRows: 0,
    },
  };
  emit(indexRecord);
  allEvidence.push(indexRecord);

  const groupMeasurement = measureStage('grouping', fixtureName, () => buildGroups(indexes, fixture));
  const groups = groupMeasurement.value;
  assert.equal(groups.digest, EXPECTED_STAGE_DIGESTS[fixtureName].grouping, 'E_QF_GROUP_DRIFT');
  const groupRecord = {
    ...baseEvidence(fixtureName, manifest, groupMeasurement),
    output: {
      groupCount: groups.groups.length,
      lineCount: groups.lineCount,
      structuralDigest: groups.digest,
    },
    operations: {
      lineVisits: manifest.lineCount,
      groupCount: groups.groups.length,
      domAccesses: 0,
      materializedRows: 0,
    },
  };
  emit(groupRecord);
  allEvidence.push(groupRecord);

  const filterRequest = Object.freeze({ serviceIds: [0, 1, 2], classIds: [0, 1, 2, 3] });
  const filterMeasurement = measureStage('filtering', fixtureName, () => applyFilter(indexes, filterRequest));
  const filtered = filterMeasurement.value;
  assert.equal(filtered.digest, EXPECTED_STAGE_DIGESTS[fixtureName].filtering, 'E_QF_FILTER_DRIFT');
  const filterRecord = {
    ...baseEvidence(fixtureName, manifest, filterMeasurement),
    output: {
      filteredLineCount: filtered.count,
      structuralDigest: filtered.digest,
      filterRequest,
    },
    operations: {
      bitsetWordsVisitedUpperBound: Math.ceil(manifest.lineCount / 32) * 7,
      domAccesses: 0,
      materializedRows: 0,
    },
  };
  emit(filterRecord);
  allEvidence.push(filterRecord);

  const queueMeasurement = measureStage('exception-queue-construction', fixtureName, () => buildExceptionQueues(indexes, fixture));
  const queues = queueMeasurement.value;
  assert.equal(queues.digest, EXPECTED_STAGE_DIGESTS[fixtureName]['exception-queue-construction'], 'E_QF_EXCEPTION_QUEUE_DRIFT');
  assert.equal(queues.counts.duplicateIdentities, manifest.duplicateKeyTargetCount, 'E_QF_EXCEPTION_QUEUE_DRIFT');
  assert.equal(queues.counts.missingMasters, manifest.missingMasterTargetCount, 'E_QF_EXCEPTION_QUEUE_DRIFT');
  assert.equal(queues.counts.ambiguousContainment, manifest.ambiguousContainmentTargetCount, 'E_QF_EXCEPTION_QUEUE_DRIFT');
  assert.equal(queues.counts.staleHashes, manifest.staleSourceTargetCount, 'E_QF_EXCEPTION_QUEUE_DRIFT');
  assert.equal(queues.counts.blockedFields, manifest.blockedFieldTargetCount, 'E_QF_EXCEPTION_QUEUE_DRIFT');
  const queueRecord = {
    ...baseEvidence(fixtureName, manifest, queueMeasurement),
    output: {
      counts: queues.counts,
      membershipDigests: queues.membershipDigests,
      structuralDigest: queues.digest,
    },
    operations: {
      lineVisits: manifest.lineCount,
      normalizedKeyBucketVisits: indexes.lineOrdinalsByNormalizedKey.size,
      domAccesses: 0,
      materializedRows: 0,
    },
  };
  emit(queueRecord);
  allEvidence.push(queueRecord);

  const visibleOrder = buildVisibleOrder(filtered.ordinals, fixture, [
    { fieldId: 'serviceId', direction: 'asc' },
    { fieldId: 'normalizedLineKey', direction: 'asc' },
  ]);
  const viewportMeasurement = measureStage('viewport-materialization', fixtureName, () => withDomAccessRejected(() => materializeViewport({
    fixture,
    indexes,
    visibleOrder,
    rowStart: Math.min(100, Math.max(0, visibleOrder.length - 1)),
    viewportRowCount: 50,
    rowOverscan: 20,
    visibleColumnIds: ENGINEERING_FIELDS,
    columnStart: 10,
    viewportColumnCount: 12,
    columnOverscan: 2,
  })));
  const viewport = viewportMeasurement.value;
  assert.equal(viewport.digest, EXPECTED_STAGE_DIGESTS[fixtureName]['viewport-materialization'], 'E_QF_VIEWPORT_DRIFT');
  assert(viewport.materializedLineRows <= 90, 'E_QF_RENDER_ALL_ROWS');
  assert(viewport.materializedComponentRows === 0, 'E_QF_EAGER_COMPONENT_ROWS');
  assert(viewport.materializedCells <= 90 * 16, 'E_QF_DATASET_SCALED_DOM');
  const viewportRecord = {
    ...baseEvidence(fixtureName, manifest, viewportMeasurement),
    output: {
      totalDatasetLines: viewport.totalDatasetLines,
      totalDatasetComponents: viewport.totalDatasetComponents,
      materializedLineRows: viewport.materializedLineRows,
      materializedComponentRows: viewport.materializedComponentRows,
      materializedCells: viewport.materializedCells,
      structuralDigest: viewport.digest,
    },
    operations: {
      rowDtoVisits: viewport.materializedLineRows,
      cellDtoVisits: viewport.materializedCells,
      domAccesses: 0,
      materializedRows: viewport.materializedLineRows,
    },
  };
  emit(viewportRecord);
  allEvidence.push(viewportRecord);
}

console.log(JSON.stringify({
  benchmark: 'enrichment-ui-phase0',
  status: 'PASS',
  fixtureNames,
  stageCount: allEvidence.length,
  timingThresholdUsedAsCorrectnessGate: false,
  structuralCorrectnessGates: true,
}));

function measureStage(stage, fixtureName, operation) {
  const memoryBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const start = performance.now();
  const value = operation();
  const wallMs = performance.now() - start;
  const cpu = process.cpuUsage(cpuBefore);
  const memoryAfter = process.memoryUsage();
  return {
    stage,
    fixtureName,
    value,
    resources: {
      wallMs: round(wallMs),
      cpuUserMs: round(cpu.user / 1000),
      cpuSystemMs: round(cpu.system / 1000),
      rssBeforeBytes: memoryBefore.rss,
      rssAfterBytes: memoryAfter.rss,
      heapUsedBeforeBytes: memoryBefore.heapUsed,
      heapUsedAfterBytes: memoryAfter.heapUsed,
      externalBeforeBytes: memoryBefore.external,
      externalAfterBytes: memoryAfter.external,
    },
  };
}

function baseEvidence(fixtureName, manifest, measurement) {
  return {
    schema: 'EnrichmentUiPhase0BenchmarkEvidence.v1',
    fixture: fixtureName,
    manifestHash: sha256Text(stableStringify(manifest)),
    generatorVersion: manifest.generatorVersion,
    seed: manifest.seed,
    stage: measurement.stage,
    repetition: 1,
    warmup: false,
    input: {
      lineCount: manifest.lineCount,
      componentCount: manifest.componentCount,
      engineeringColumnCount: manifest.engineeringColumnCount,
    },
    resources: measurement.resources,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      commit: process.env.GITHUB_SHA ?? process.env.COMMIT_SHA ?? 'LOCAL_UNBOUND',
    },
    timingThresholdUsedAsCorrectnessGate: false,
    status: 'PASS',
  };
}

function withDomAccessRejected(operation) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    get() {
      const error = new Error('E_QF_DOM_ACCESS');
      error.code = 'E_QF_DOM_ACCESS';
      throw error;
    },
  });
  try {
    return operation();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else delete globalThis.document;
  }
}

function emit(record) {
  console.log(JSON.stringify(record));
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
