import { deepFreeze } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { CONTINUUM_RESULT_SCHEMA, CONTINUUM_RESULT_SCHEMA_V2, CONTINUUM_RESULT_SCHEMA_V3, LINEAR_BACKENDS } from './constants.js';
import { createConvergenceStudy as createBaseStudy, quantityHistory } from './convergence-study-base.js';

export { quantityHistory };

export function createConvergenceStudy(input) {
  if (!containsSparseV3(input)) return createBaseStudy(input);
  const originals = new Map(); const compatible = structuredClone(input);
  compatible.levels = compatible.levels.map((level) => compatibilityLevel(level, originals));
  delete compatible.semanticHash;
  const normalized = createBaseStudy(compatible);
  const levels = normalized.levels.map((level) => restoreSparseLevel(level, originals));
  const { semanticHash: _oldHash, ...base } = normalized; const result = { ...base, levels };
  const hash = semanticHash(result);
  if (input.semanticHash !== undefined && input.semanticHash !== hash) throw new TypeError('Convergence study semantic hash mismatch.');
  return deepFreeze({ ...result, semanticHash: hash });
}

function containsSparseV3(input) { return Array.isArray(input?.levels) && input.levels.some((level) => level?.result?.schema === CONTINUUM_RESULT_SCHEMA_V3); }

function compatibilityLevel(level, originals) {
  if (level?.result?.schema !== CONTINUUM_RESULT_SCHEMA_V3) return level;
  validateSparseResult(level.model, level.result);
  originals.set(level.levelId, { result: level.result, resultSemanticHash: level.result.semanticHash });
  const result = predecessorView(level.result);
  return { ...level, result, resultSemanticHash: result.semanticHash };
}

function restoreSparseLevel(level, originals) {
  const original = originals.get(level.levelId);
  return original ? { ...level, result: original.result, resultSemanticHash: original.resultSemanticHash } : level;
}

function predecessorView(result) {
  const predecessor = result?.resultContractCompatibility?.predecessor;
  if (![CONTINUUM_RESULT_SCHEMA, CONTINUUM_RESULT_SCHEMA_V2].includes(predecessor)) throw new TypeError('Sparse convergence result predecessor evidence is invalid.');
  const clone = structuredClone(result);
  ['semanticHash','backendIdentity','sparseMatrixEvidence','capacityEvidence','iterativeSolverEvidence','resultContractCompatibility'].forEach((key) => { delete clone[key]; });
  clone.schema = predecessor;
  return { ...clone, semanticHash: semanticHash(clone) };
}

function validateSparseResult(model, result) {
  if (result.status !== 'QUALIFIED' || result.qualifiedResults !== 'complete') throw new TypeError('Sparse convergence levels require a qualified complete result.');
  if (result.backendIdentity !== LINEAR_BACKENDS.SPARSE_PCG_V1 || result.iterativeSolverEvidence?.terminationStatus !== 'RESIDUAL_TARGET_SATISFIED') throw new TypeError('Sparse convergence result backend evidence is invalid.');
  if (result.modelSemanticHash !== model?.semanticHash || result.modelEvidence?.semanticHash !== model?.semanticHash) throw new TypeError('Sparse convergence model/result semantic hashes are stale or mismatched.');
  const { semanticHash: _hash, ...base } = result;
  if (result.semanticHash !== semanticHash(base)) throw new TypeError('Sparse convergence result semantic hash is stale.');
}
