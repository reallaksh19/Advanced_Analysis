/**
 * NB-T3 stage benchmark bindings.
 *
 * These manifests identify required independent benchmark and anti-drift gates.
 * They do not contain expected numerical values and do not qualify a release.
 */
export const LAFEA_STAGE_BENCHMARK_MANIFEST_SCHEMA =
  'lafea-stage-benchmark-manifest/v1';
export const LAFEA_BENCHMARK_GATE_SCHEMA = 'lafea-benchmark-gate/v1';
export const LAFEA_BENCHMARK_MANIFEST_QUALIFICATION_STATES = Object.freeze([
  'NOT_QUALIFIED',
  'QUALIFIED',
]);
export const LAFEA_BENCHMARK_GATE_STATUSES = Object.freeze([
  'REQUIRED_UNBOUND',
  'PASS',
  'FAIL',
]);

export const LAFEA_REQUIRED_BENCHMARK_GATE_IDS = Object.freeze(
  range('NB-BM', 16),
);
export const LAFEA_REQUIRED_ANTI_DRIFT_GATE_IDS = Object.freeze(
  range('NB-AD', 16),
);

export const LAFEA_BENCHMARK_GATE_CATALOG = deepFreeze([
  ...LAFEA_REQUIRED_BENCHMARK_GATE_IDS.map((gateId) => gate(gateId, 'INDEPENDENT_BENCHMARK')),
  ...LAFEA_REQUIRED_ANTI_DRIFT_GATE_IDS.map((gateId) => gate(gateId, 'ANTI_DRIFT')),
]);

const STAGE_GATE_BINDINGS = Object.freeze({
  'LAFEA.1': Object.freeze({ benchmark: slice(1, 3), antiDrift: antiSlice(1, 3) }),
  'LAFEA.2': Object.freeze({ benchmark: slice(4, 6), antiDrift: antiSlice(4, 6) }),
  'LAFEA.3': Object.freeze({ benchmark: slice(7, 10), antiDrift: antiSlice(7, 10) }),
  'LAFEA.4': Object.freeze({ benchmark: slice(11, 13), antiDrift: antiSlice(11, 13) }),
  'LAFEA.5': Object.freeze({ benchmark: slice(14, 16), antiDrift: antiSlice(14, 16) }),
});

export const LAFEA_STAGE_BENCHMARK_MANIFESTS = deepFreeze(
  Object.entries(STAGE_GATE_BINDINGS).map(([stageId, binding]) => manifest({
    manifestId: `${stageId}/CURRENT_CORE_BENCHMARK_MANIFEST/V1`,
    stageId,
    benchmarkGateIds: binding.benchmark,
    antiDriftGateIds: binding.antiDrift,
  })),
);

export const LAFEA_STAGE_BENCHMARK_MANIFEST_IDS = Object.freeze(
  LAFEA_STAGE_BENCHMARK_MANIFESTS.map((row) => row.manifestId),
);

export function requireLafeaStageBenchmarkManifest(manifestId) {
  const result = LAFEA_STAGE_BENCHMARK_MANIFESTS.find(
    (row) => row.manifestId === manifestId,
  );
  if (!result) throw new TypeError(`Unknown LAFEA benchmark manifest: ${manifestId}.`);
  return result;
}

export function requireLafeaBenchmarkGate(gateId) {
  const result = LAFEA_BENCHMARK_GATE_CATALOG.find((row) => row.gateId === gateId);
  if (!result) throw new TypeError(`Unknown LAFEA benchmark gate: ${gateId}.`);
  return result;
}

function manifest(value) {
  const gateIds = [...value.benchmarkGateIds, ...value.antiDriftGateIds];
  return {
    schema: LAFEA_STAGE_BENCHMARK_MANIFEST_SCHEMA,
    ...value,
    benchmarkGateIds: Object.freeze([...value.benchmarkGateIds]),
    antiDriftGateIds: Object.freeze([...value.antiDriftGateIds]),
    requiredGateIds: Object.freeze(gateIds),
    expectedValueAuthority: 'INDEPENDENT_EXPECTED_EVIDENCE_REQUIRED',
    governingFailurePolicy: 'ANY_REQUIRED_GATE_FAILURE_BLOCKS_RELEASE',
    qualificationStatus: 'NOT_QUALIFIED',
    releaseState: 'RELEASE_NOT_QUALIFIED',
    qualifiedGateCount: 0,
    requiredGateCount: gateIds.length,
  };
}

function gate(gateId, gateKind) {
  return {
    schema: LAFEA_BENCHMARK_GATE_SCHEMA,
    gateId,
    gateKind,
    status: 'REQUIRED_UNBOUND',
    expectedEvidenceAuthority: 'INDEPENDENT_EXPECTED_EVIDENCE_REQUIRED',
    releaseBlocking: true,
  };
}

function range(prefix, count) {
  return Array.from({ length: count }, (_, index) => (
    `${prefix}-${String(index + 1).padStart(2, '0')}`
  ));
}

function slice(start, end) {
  return Object.freeze(LAFEA_REQUIRED_BENCHMARK_GATE_IDS.slice(start - 1, end));
}

function antiSlice(start, end) {
  return Object.freeze(LAFEA_REQUIRED_ANTI_DRIFT_GATE_IDS.slice(start - 1, end));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
