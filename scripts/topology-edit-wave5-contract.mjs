const MAX_COLOR_ID = 0xFFFFFF;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const REQUIRED_WAVES = Object.freeze(['WAVE_0', 'WAVE_1', 'WAVE_2', 'WAVE_3', 'WAVE_4']);

export const TOPOLOGY_EDIT_PICKING_MODES = Object.freeze({
  RAYCAST: 'RAYCAST',
  GPU_COLOR_ID: 'GPU_COLOR_ID',
});

export function encodeTopologyEditColorId(value) {
  const id = positiveColorId(value);
  return Object.freeze({
    id,
    r: (id >> 16) & 0xff,
    g: (id >> 8) & 0xff,
    b: id & 0xff,
    hex: id.toString(16).padStart(6, '0'),
  });
}

export function decodeTopologyEditColorId(value) {
  const channels = Array.isArray(value)
    ? value
    : [value?.r, value?.g, value?.b];
  if (channels.length < 3) throw new TypeError('RGB channels are required.');
  const [r, g, b] = channels.map(channel);
  return (r << 16) | (g << 8) | b;
}

export function createTopologyEditColorIdRegistry(targets = []) {
  if (!Array.isArray(targets)) throw new TypeError('Picking targets must be an array.');
  const sorted = targets.map(normalizeTarget).sort((left, right) => (
    left.objectId.localeCompare(right.objectId, 'en')
  ));
  if (sorted.length > MAX_COLOR_ID) {
    throw new RangeError(`GPU color-ID picking supports at most ${MAX_COLOR_ID} targets.`);
  }
  const objectIds = new Set();
  const entries = sorted.map((target, index) => {
    if (objectIds.has(target.objectId)) {
      throw new TypeError(`Duplicate topology-edit pick objectId: ${target.objectId}`);
    }
    objectIds.add(target.objectId);
    const color = encodeTopologyEditColorId(index + 1);
    return Object.freeze({ ...target, colorId: color.id, color });
  });
  return Object.freeze({
    schema: 'TopologyEditGpuColorRegistry.v1',
    count: entries.length,
    entries: Object.freeze(entries),
    registryHashInput: Object.freeze(entries.map((entry) => Object.freeze({
      objectId: entry.objectId,
      objectKind: entry.objectKind,
      colorId: entry.colorId,
    }))),
  });
}

export function selectTopologyEditPickingMode(input = {}) {
  const componentCount = nonNegativeInteger(input.componentCount ?? 0, 'componentCount');
  const gpuThreshold = positiveInteger(input.gpuThreshold ?? 5_000, 'gpuThreshold');
  const pickBudgetMs = positiveNumber(input.pickBudgetMs ?? 100, 'pickBudgetMs');
  const cpu = normalizeLatencyEvidence(input.cpuEvidence);
  const gpu = normalizeLatencyEvidence(input.gpuEvidence);

  if (componentCount < gpuThreshold) {
    return decision(TOPOLOGY_EDIT_PICKING_MODES.RAYCAST, 'BELOW_GPU_SCALE_THRESHOLD', {
      componentCount, gpuThreshold, pickBudgetMs, cpu, gpu,
    });
  }
  if (!cpu.complete || cpu.identityErrorCount > 0) {
    return decision(TOPOLOGY_EDIT_PICKING_MODES.RAYCAST, 'CPU_EVIDENCE_INCOMPLETE_OR_INCORRECT', {
      componentCount, gpuThreshold, pickBudgetMs, cpu, gpu,
    });
  }
  if (cpu.p95Ms <= pickBudgetMs) {
    return decision(TOPOLOGY_EDIT_PICKING_MODES.RAYCAST, 'CPU_RAYCAST_WITHIN_RELEASE_BUDGET', {
      componentCount, gpuThreshold, pickBudgetMs, cpu, gpu,
    });
  }
  if (!gpu.complete || gpu.identityErrorCount > 0) {
    return decision(TOPOLOGY_EDIT_PICKING_MODES.RAYCAST, 'GPU_EVIDENCE_NOT_QUALIFIED', {
      componentCount, gpuThreshold, pickBudgetMs, cpu, gpu,
    });
  }
  if (gpu.p95Ms > pickBudgetMs || gpu.p95Ms >= cpu.p95Ms) {
    return decision(TOPOLOGY_EDIT_PICKING_MODES.RAYCAST, 'GPU_DOES_NOT_IMPROVE_RELEASE_RESULT', {
      componentCount, gpuThreshold, pickBudgetMs, cpu, gpu,
    });
  }
  return decision(TOPOLOGY_EDIT_PICKING_MODES.GPU_COLOR_ID, 'MEASURED_SCALE_JUSTIFIES_GPU_PICKING', {
    componentCount, gpuThreshold, pickBudgetMs, cpu, gpu,
  });
}

export function validateTopologyEditFixtureManifest(manifest) {
  if (!manifest || manifest.schema !== 'TopologyEditPortableFixtureManifest.v1') {
    throw new TypeError('Unsupported topology-edit fixture manifest.');
  }
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new TypeError('Fixture manifest must declare sources.');
  }
  const ids = new Set();
  const normalized = manifest.sources.map((source) => {
    const sourceId = requiredString(source?.sourceId, 'sourceId');
    if (ids.has(sourceId)) throw new TypeError(`Duplicate fixture sourceId: ${sourceId}`);
    ids.add(sourceId);
    const sha256 = requiredString(source.sha256, `${sourceId}.sha256`).toLowerCase();
    if (!SHA256_PATTERN.test(sha256)) throw new TypeError(`${sourceId}.sha256 must be lowercase SHA-256.`);
    const repositoryPath = optionalString(source.repositoryPath);
    const contentAddress = optionalString(source.contentAddress);
    if (Boolean(repositoryPath) === Boolean(contentAddress)) {
      throw new TypeError(`${sourceId} must declare exactly one repositoryPath or contentAddress.`);
    }
    if (repositoryPath && isAbsoluteFixturePath(repositoryPath)) {
      throw new TypeError(`${sourceId} repositoryPath must be repository-relative.`);
    }
    if (contentAddress !== null && contentAddress !== `sha256:${sha256}`) {
      throw new TypeError(`${sourceId} contentAddress must match its SHA-256.`);
    }
    return Object.freeze({
      sourceId,
      sha256,
      repositoryPath,
      contentAddress,
      mediaType: optionalString(source.mediaType),
      required: source.required !== false,
    });
  });
  return Object.freeze({
    schema: manifest.schema,
    fixtureId: requiredString(manifest.fixtureId, 'fixtureId'),
    projectId: optionalString(manifest.projectId),
    sources: Object.freeze(normalized),
    portable: true,
  });
}

export function createTopologyEditWave5ReleaseReceipt(input = {}) {
  const candidateHead = requiredString(input.candidateHead, 'candidateHead');
  const expectedHead = requiredString(input.expectedHead, 'expectedHead');
  const prerequisites = normalizePrerequisites(input.prerequisites);
  const performanceStatus = statusOf(input.performanceEvidence);
  const browserStatus = statusOf(input.browserEvidence);
  const fixtureStatus = statusOf(input.fixtureEvidence);
  const driftStatus = statusOf(input.driftEvidence);

  const failures = [];
  if (candidateHead !== expectedHead) failures.push('EXACT_HEAD_MISMATCH');
  prerequisites.filter((row) => row.status === 'FAIL').forEach((row) => {
    failures.push(`${row.waveId}_FAILED`);
  });
  if (performanceStatus === 'FAIL') failures.push('PERFORMANCE_FAILED');
  if (browserStatus === 'FAIL') failures.push('BROWSER_FAILED');
  if (fixtureStatus === 'FAIL') failures.push('FIXTURE_FAILED');
  if (driftStatus === 'FAIL') failures.push('DRIFT_GATE_FAILED');

  const blockers = prerequisites
    .filter((row) => row.status !== 'PASS')
    .map((row) => `${row.waveId}_${row.status}`);
  if (performanceStatus !== 'PASS') blockers.push(`PERFORMANCE_${performanceStatus}`);
  if (browserStatus !== 'PASS') blockers.push(`BROWSER_${browserStatus}`);
  if (fixtureStatus !== 'PASS') blockers.push(`FIXTURE_${fixtureStatus}`);
  if (driftStatus !== 'PASS') blockers.push(`DRIFT_${driftStatus}`);

  const status = failures.length
    ? 'FAIL'
    : blockers.length
      ? 'BLOCKED_PREREQUISITES'
      : 'PASS_RELEASE';
  return Object.freeze({
    schema: 'TopologyEditWave5ReleaseReceipt.v1',
    status,
    candidateHead,
    expectedHead,
    prerequisites,
    evidenceStatus: Object.freeze({
      performance: performanceStatus,
      browser: browserStatus,
      fixtures: fixtureStatus,
      drift: driftStatus,
    }),
    failures: Object.freeze(failures),
    blockers: Object.freeze([...new Set(blockers)].sort()),
  });
}

export function isAbsoluteFixturePath(value) {
  const text = String(value ?? '').trim();
  return /^[A-Za-z]:[\\/]/u.test(text) || text.startsWith('/') || text.startsWith('\\\\');
}

function normalizePrerequisites(rows = []) {
  const byId = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.waveId, row]));
  return Object.freeze(REQUIRED_WAVES.map((waveId) => {
    const row = byId.get(waveId) || {};
    return Object.freeze({
      waveId,
      status: normalizeStatus(row.status),
      mergeCommit: optionalString(row.mergeCommit),
      evidenceHash: optionalString(row.evidenceHash),
      reason: optionalString(row.reason),
    });
  }));
}

function normalizeLatencyEvidence(value) {
  if (!value) return Object.freeze({ complete: false, sampleCount: 0, p95Ms: null, identityErrorCount: 0 });
  const sampleCount = nonNegativeInteger(value.sampleCount ?? 0, 'sampleCount');
  const p95Ms = value.p95Ms === null || value.p95Ms === undefined
    ? null
    : nonNegativeNumber(value.p95Ms, 'p95Ms');
  const identityErrorCount = nonNegativeInteger(value.identityErrorCount ?? 0, 'identityErrorCount');
  return Object.freeze({
    complete: sampleCount >= 20 && p95Ms !== null,
    sampleCount,
    p95Ms,
    identityErrorCount,
  });
}

function decision(mode, reason, evidence) {
  return Object.freeze({
    schema: 'TopologyEditPickingModeDecision.v1',
    mode,
    reason,
    evidence: Object.freeze(evidence),
  });
}

function statusOf(value) {
  const status = typeof value === 'string' ? value : value?.status;
  return normalizeStatus(status);
}

function normalizeStatus(value) {
  const status = String(value ?? 'BLOCKED').toUpperCase();
  if (status.startsWith('PASS')) return 'PASS';
  if (status.startsWith('FAIL')) return 'FAIL';
  return 'BLOCKED';
}

function normalizeTarget(target) {
  return Object.freeze({
    objectId: requiredString(target?.objectId, 'objectId'),
    objectKind: requiredString(target?.objectKind, 'objectKind'),
    canonicalId: optionalString(target?.canonicalId) ?? requiredString(target?.objectId, 'objectId'),
    instanceId: target?.instanceId === undefined ? null : nonNegativeInteger(target.instanceId, 'instanceId'),
  });
}

function positiveColorId(value) {
  const id = positiveInteger(value, 'colorId');
  if (id > MAX_COLOR_ID) throw new RangeError(`colorId must be <= ${MAX_COLOR_ID}.`);
  return id;
}

function channel(value) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric > 255) {
    throw new TypeError('RGB channels must be integers from 0 to 255.');
  }
  return numeric;
}

function requiredString(value, label) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${label} is required.`);
  return text;
}

function optionalString(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

function positiveInteger(value, label) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) throw new TypeError(`${label} must be a positive integer.`);
  return numeric;
}

function nonNegativeInteger(value, label) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return numeric;
}

function positiveNumber(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new TypeError(`${label} must be positive.`);
  return numeric;
}

function nonNegativeNumber(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new TypeError(`${label} must be finite and non-negative.`);
  return numeric;
}
