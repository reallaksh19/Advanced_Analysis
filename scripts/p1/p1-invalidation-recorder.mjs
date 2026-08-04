import { canonicalStringify } from '../../src/core/shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../src/core/shared-piping-model/immutable.js';
import {
  P1_ACTION_IDS,
  P1_INVALIDATION_EVIDENCE_SCHEMA,
  P1_INVOCATION_IDS,
  P1_VIEWPORT_ROUTES,
  requireExactKeys,
  requireFiniteNonNegative,
  requireIntegerNonNegative,
  requireSha1,
  requireString,
  roundMilliseconds,
} from './p1-contracts.mjs';

const EVIDENCE_KEYS = [
  'schema', 'executionId', 'exactHeadSha', 'fixtureRole', 'viewportRoute',
  'actionIds', 'invocationIds', 'runs',
];
const RUN_KEYS = [
  'sequence', 'actionId', 'status', 'durationMs', 'metadata', 'counts', 'durations',
];

export class P1InvalidationRecorder {
  constructor({ executionId, exactHeadSha, fixtureRole, viewportRoute }) {
    requireString(executionId, 'executionId');
    requireSha1(exactHeadSha, 'exactHeadSha');
    requireString(fixtureRole, 'fixtureRole');
    if (!P1_VIEWPORT_ROUTES.includes(viewportRoute)) {
      throw new RangeError(`Unsupported P1 viewport route: ${viewportRoute}.`);
    }
    this.executionId = executionId;
    this.exactHeadSha = exactHeadSha;
    this.fixtureRole = fixtureRole;
    this.viewportRoute = viewportRoute;
    this.sequence = 0;
    this.active = null;
    this.runs = [];
  }

  begin(actionId, metadata = {}) {
    if (!P1_ACTION_IDS.includes(actionId)) {
      throw new RangeError(`Unsupported P1 action: ${actionId}.`);
    }
    if (this.active) throw new Error(`P1 action ${this.active.actionId} is still active.`);
    this.active = {
      sequence: this.sequence += 1,
      actionId,
      metadata: { ...metadata },
      startedAtMs: now(),
      counts: Object.fromEntries(P1_INVOCATION_IDS.map((id) => [id, 0])),
      durations: Object.fromEntries(P1_INVOCATION_IDS.map((id) => [id, []])),
    };
    return this.active.sequence;
  }

  record(invocationId, durationMs = 0) {
    if (!this.active) throw new Error('P1 invalidation recorder has no active action.');
    if (!P1_INVOCATION_IDS.includes(invocationId)) {
      throw new RangeError(`Unsupported P1 invocation: ${invocationId}.`);
    }
    requireFiniteNonNegative(durationMs, `durationMs:${invocationId}`);
    this.active.counts[invocationId] += 1;
    this.active.durations[invocationId].push(roundMilliseconds(durationMs));
  }

  end({ status = 'PASS', metadata = {} } = {}) {
    if (!this.active) throw new Error('P1 invalidation recorder has no active action.');
    if (!['PASS', 'SKIPPED', 'FAIL'].includes(status)) {
      throw new RangeError(`Unsupported P1 action status: ${status}.`);
    }
    const active = this.active;
    this.active = null;
    const row = deepFreeze({
      sequence: active.sequence,
      actionId: active.actionId,
      status,
      durationMs: roundMilliseconds(now() - active.startedAtMs),
      metadata: deepFreeze({ ...active.metadata, ...metadata }),
      counts: deepFreeze({ ...active.counts }),
      durations: deepFreeze(Object.fromEntries(
        Object.entries(active.durations).map(([key, values]) => [key, deepFreeze([...values])]),
      )),
    });
    this.runs.push(row);
    return row;
  }

  abort(message) {
    requireString(message, 'message');
    return this.end({ status: 'FAIL', metadata: { message } });
  }

  snapshot() {
    if (this.active) throw new Error(`P1 action ${this.active.actionId} is still active.`);
    return deepFreeze({
      schema: P1_INVALIDATION_EVIDENCE_SCHEMA,
      executionId: this.executionId,
      exactHeadSha: this.exactHeadSha,
      fixtureRole: this.fixtureRole,
      viewportRoute: this.viewportRoute,
      actionIds: deepFreeze([...P1_ACTION_IDS]),
      invocationIds: deepFreeze([...P1_INVOCATION_IDS]),
      runs: deepFreeze([...this.runs]),
    });
  }
}

export function requireP1InvalidationEvidence(value) {
  requireExactKeys(value, EVIDENCE_KEYS, 'p1InvalidationEvidence');
  if (value.schema !== P1_INVALIDATION_EVIDENCE_SCHEMA) fail('P1_INVALIDATION_SCHEMA_INVALID');
  requireString(value.executionId, 'invalidation.executionId');
  requireSha1(value.exactHeadSha, 'invalidation.exactHeadSha');
  requireString(value.fixtureRole, 'invalidation.fixtureRole');
  if (!P1_VIEWPORT_ROUTES.includes(value.viewportRoute)) fail('P1_INVALIDATION_ROUTE_INVALID');
  if (canonicalStringify(value.actionIds) !== canonicalStringify(P1_ACTION_IDS)) {
    fail('P1_INVALIDATION_ACTION_REGISTRY_INVALID');
  }
  if (canonicalStringify(value.invocationIds) !== canonicalStringify(P1_INVOCATION_IDS)) {
    fail('P1_INVALIDATION_INVOCATION_REGISTRY_INVALID');
  }
  if (!Array.isArray(value.runs)) fail('P1_INVALIDATION_RUNS_INVALID');
  value.runs.forEach((row, index) => requireRun(row, index));
  return value;
}

export function aggregateP1InvalidationEvidence(evidence) {
  requireP1InvalidationEvidence(evidence);
  const result = {};
  for (const actionId of P1_ACTION_IDS) {
    const rows = evidence.runs.filter((row) => row.actionId === actionId);
    result[actionId] = deepFreeze({
      sampleCount: rows.length,
      passingSampleCount: rows.filter((row) => row.status === 'PASS').length,
      counts: deepFreeze(Object.fromEntries(P1_INVOCATION_IDS.map((invocationId) => [
        invocationId,
        rows.reduce((total, row) => total + Number(row.counts?.[invocationId] || 0), 0),
      ]))),
    });
  }
  return deepFreeze(result);
}

function requireRun(row, index) {
  requireExactKeys(row, RUN_KEYS, `invalidation.runs[${index}]`);
  requireIntegerNonNegative(row.sequence, `invalidation.runs[${index}].sequence`);
  if (!P1_ACTION_IDS.includes(row.actionId)) fail('P1_INVALIDATION_ACTION_INVALID');
  if (!['PASS', 'SKIPPED', 'FAIL'].includes(row.status)) fail('P1_INVALIDATION_STATUS_INVALID');
  requireFiniteNonNegative(row.durationMs, `invalidation.runs[${index}].durationMs`);
  if (!row.metadata || typeof row.metadata !== 'object' || Array.isArray(row.metadata)) {
    fail('P1_INVALIDATION_METADATA_INVALID');
  }
  requireExactKeys(row.counts, P1_INVOCATION_IDS, `invalidation.runs[${index}].counts`);
  requireExactKeys(row.durations, P1_INVOCATION_IDS, `invalidation.runs[${index}].durations`);
  P1_INVOCATION_IDS.forEach((invocationId) => {
    requireIntegerNonNegative(row.counts[invocationId], `count:${invocationId}`);
    const samples = row.durations[invocationId];
    if (!Array.isArray(samples)) fail('P1_INVALIDATION_DURATIONS_INVALID');
    samples.forEach((duration, sampleIndex) =>
      requireFiniteNonNegative(duration, `duration:${invocationId}[${sampleIndex}]`));
    if (samples.length !== row.counts[invocationId]) {
      fail('P1_INVALIDATION_COUNT_DURATION_MISMATCH');
    }
  });
}
function now() { return globalThis.performance?.now?.() ?? Date.now(); }
function fail(code) { const error = new Error(code); error.code = code; throw error; }
