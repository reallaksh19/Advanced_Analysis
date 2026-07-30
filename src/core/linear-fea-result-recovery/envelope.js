import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import { requireResultRecovery } from './recovery.js';
import {
  ENVELOPE_CODE_POINT_KEYS,
  ENVELOPE_ENTRY_KEYS,
  ENVELOPE_GOVERNING_KEYS,
  ENVELOPE_QUANTITIES,
  ENVELOPE_RECORD_KEYS,
  RECOVERY_ENVELOPE_SCHEMA,
  compareAscii,
  fail,
  requireArray,
  requireExactKeys,
  requireFinite,
  requireHash,
  requireIdentity,
  requireMember,
} from './recovery-contract.js';

const CODE = 'RECOVERY_ENVELOPE_INVALID';

/**
 * Envelope recovery (section 9 "Envelope"): a pure post-processing fold over
 * already-recovered per-case component resultants — max/min/absolute-max per
 * code point per local-action quantity, retaining the governing
 * execution/load-case identity. No re-solve and no re-derivation happens
 * here; every governing value is copied straight from a sealed
 * `fea-linear-recovery/v1` this package already produced.
 *
 * An envelope call across recoveries that do not share a compilation
 * identity (`modelIdentity`, `modelRevision`, `mechanicalModelSemanticHash`,
 * `stiffnessStateHash`) is refused — a genuinely different model has no
 * comparable code points to fold together.
 */

function requireSameCompilation(recoveries) {
  const first = recoveries[0];
  for (const recovery of recoveries) {
    if (recovery.mechanicalModelSemanticHash !== first.mechanicalModelSemanticHash
      || recovery.stiffnessStateHash !== first.stiffnessStateHash
      || recovery.modelIdentity !== first.modelIdentity
      || recovery.modelRevision !== first.modelRevision) {
      fail(
        'Every recovery folded into one envelope must share the same compilation identity (modelIdentity, modelRevision, mechanicalModelSemanticHash, stiffnessStateHash); a genuinely different model has no comparable code points.',
        'RECOVERY_ENVELOPE_MODEL_MISMATCH',
      );
    }
  }
  return first;
}

function collectCodePointIndex(recoveries) {
  const byStationId = new Map();
  for (const recovery of recoveries) {
    for (const component of recovery.componentResultants) {
      for (const point of component.codePoints) {
        if (!byStationId.has(point.stationId)) {
          byStationId.set(point.stationId, { componentId: component.componentId, nodeId: point.nodeId, samples: [] });
        }
        const entry = byStationId.get(point.stationId);
        if (entry.componentId !== component.componentId || entry.nodeId !== point.nodeId) {
          fail(
            `Code station ${point.stationId} identifies a different component/node across the folded recoveries.`,
            'RECOVERY_ENVELOPE_CODE_POINT_MISMATCH',
          );
        }
        entry.samples.push({
          executionHash: recovery.executionHash,
          physicalLoadCaseHash: recovery.physicalLoadCaseHash,
          local: point.local,
        });
      }
    }
  }
  const stationIds = [...byStationId.keys()].sort(compareAscii);
  for (const stationId of stationIds) {
    if (byStationId.get(stationId).samples.length !== recoveries.length) {
      fail(
        `Code station ${stationId} is not present in every folded recovery; envelopes are a pure fold over recoveries against the same compilation and must cover every code point identically.`,
        'RECOVERY_ENVELOPE_CODE_POINT_MISSING',
      );
    }
  }
  return { byStationId, stationIds };
}

function foldQuantity(samples, quantity) {
  let max = null;
  let min = null;
  let absMax = null;
  for (const sample of samples) {
    const value = sample.local[quantity];
    const governing = { value, executionHash: sample.executionHash, physicalLoadCaseHash: sample.physicalLoadCaseHash };
    if (max === null || value > max.value) max = governing;
    if (min === null || value < min.value) min = governing;
    if (absMax === null || Math.abs(value) > Math.abs(absMax.value)) absMax = governing;
  }
  return { quantity, max, min, absMax };
}

/**
 * @param {Array<Readonly<object>>} recoveries Sealed `fea-linear-recovery/v1` records, all against the same compilation.
 * @returns {Readonly<object>} Sealed `fea-linear-recovery-envelope/v1`.
 */
export function foldRecoveryEnvelope(recoveries) {
  requireArray(recoveries, 'recoveries', CODE);
  if (recoveries.length === 0) fail('recoveries must carry at least one recovery to fold.', CODE);
  const accepted = recoveries.map((recovery) => requireResultRecovery(recovery));
  const first = requireSameCompilation(accepted);
  const { byStationId, stationIds } = collectCodePointIndex(accepted);

  const codePoints = stationIds.map((stationId) => {
    const entry = byStationId.get(stationId);
    return {
      stationId,
      componentId: entry.componentId,
      nodeId: entry.nodeId,
      entries: ENVELOPE_QUANTITIES.map((quantity) => foldQuantity(entry.samples, quantity)),
    };
  });

  const draft = {
    schema: RECOVERY_ENVELOPE_SCHEMA,
    modelIdentity: first.modelIdentity,
    modelRevision: first.modelRevision,
    mechanicalModelSemanticHash: first.mechanicalModelSemanticHash,
    stiffnessStateHash: first.stiffnessStateHash,
    sourceExecutionHashes: [...new Set(accepted.map((recovery) => recovery.executionHash))].sort(compareAscii),
    sourceRecoveryHashes: [...accepted.map((recovery) => recovery.recoveryHash)].sort(compareAscii),
    codePoints,
    envelopeHash: '',
    semanticHash: '',
    evidenceHash: '',
  };
  draft.semanticHash = computeEnvelopeSemanticHash(draft);
  draft.envelopeHash = draft.semanticHash;
  draft.evidenceHash = computeEnvelopeEvidenceHash(draft);
  return requireRecoveryEnvelope(draft);
}

/** Excludes `envelopeHash` from its own hash input for the same reason
 * `recoverySemanticProjection` excludes `recoveryHash`. */
export function envelopeSemanticProjection(record) {
  const projection = {};
  for (const key of ENVELOPE_RECORD_KEYS) {
    if (key === 'semanticHash' || key === 'evidenceHash' || key === 'envelopeHash') continue;
    projection[key] = record[key];
  }
  return projection;
}

export function computeEnvelopeSemanticHash(record) {
  return semanticHash(envelopeSemanticProjection(record));
}

export function computeEnvelopeEvidenceHash(record) {
  return semanticHash({ semanticHash: record.semanticHash, codePointCount: record.codePoints.length });
}

function requireGoverning(value, field) {
  requireExactKeys(value, ENVELOPE_GOVERNING_KEYS, field, CODE);
  requireFinite(value.value, `${field}.value`, CODE);
  requireHash(value.executionHash, `${field}.executionHash`, CODE);
  requireHash(value.physicalLoadCaseHash, `${field}.physicalLoadCaseHash`, CODE);
}

export function requireRecoveryEnvelope(record) {
  requireExactKeys(record, ENVELOPE_RECORD_KEYS, 'envelope', CODE);
  if (record.schema !== RECOVERY_ENVELOPE_SCHEMA) fail(`envelope.schema must be ${RECOVERY_ENVELOPE_SCHEMA}.`, CODE);
  requireIdentity(record.modelIdentity, 'envelope.modelIdentity', CODE);
  for (const field of ['mechanicalModelSemanticHash', 'stiffnessStateHash', 'envelopeHash', 'semanticHash', 'evidenceHash']) {
    requireHash(record[field], `envelope.${field}`, CODE);
  }
  requireArray(record.sourceExecutionHashes, 'envelope.sourceExecutionHashes', CODE);
  record.sourceExecutionHashes.forEach((hash, index) => requireHash(hash, `envelope.sourceExecutionHashes[${index}]`, CODE));
  requireArray(record.sourceRecoveryHashes, 'envelope.sourceRecoveryHashes', CODE);
  record.sourceRecoveryHashes.forEach((hash, index) => requireHash(hash, `envelope.sourceRecoveryHashes[${index}]`, CODE));
  requireArray(record.codePoints, 'envelope.codePoints', CODE);
  record.codePoints.forEach((entry, index) => {
    const field = `envelope.codePoints[${index}]`;
    requireExactKeys(entry, ENVELOPE_CODE_POINT_KEYS, field, CODE);
    requireIdentity(entry.componentId, `${field}.componentId`, CODE);
    requireIdentity(entry.nodeId, `${field}.nodeId`, CODE);
    requireArray(entry.entries, `${field}.entries`, CODE);
    entry.entries.forEach((quantityEntry, quantityIndex) => {
      const quantityField = `${field}.entries[${quantityIndex}]`;
      requireExactKeys(quantityEntry, ENVELOPE_ENTRY_KEYS, quantityField, CODE);
      requireMember(quantityEntry.quantity, ENVELOPE_QUANTITIES, `${quantityField}.quantity`, CODE);
      requireGoverning(quantityEntry.max, `${quantityField}.max`);
      requireGoverning(quantityEntry.min, `${quantityField}.min`);
      requireGoverning(quantityEntry.absMax, `${quantityField}.absMax`);
    });
  });
  if (record.envelopeHash !== record.semanticHash) fail('envelope.envelopeHash must equal envelope.semanticHash.', CODE);
  if (record.semanticHash !== computeEnvelopeSemanticHash(record)) fail('envelope.semanticHash is stale.', 'RECOVERY_HASH_MISMATCH');
  if (record.evidenceHash !== computeEnvelopeEvidenceHash(record)) fail('envelope.evidenceHash is stale.', 'RECOVERY_HASH_MISMATCH');
  return deepFreeze({ ...record });
}
