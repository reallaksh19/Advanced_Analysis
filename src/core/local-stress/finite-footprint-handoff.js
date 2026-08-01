import { createValidatedLafeaAnalyticalHandoff } from '../lafea-analytical-handoff.js';
import { validateFiniteFootprintDistribution } from './finite-footprint.js';

export function createFiniteFootprintHandoff(input) {
  const row = exactRecord(input, [
    'handoffIdentity', 'handoffVersion', 'footprintResult', 'targetStageId',
    'targetSource', 'targetLoadBindings', 'sourceReference', 'limitations',
  ], 'handoff');
  const result = validateFiniteFootprintDistribution(row.footprintResult);
  return createValidatedLafeaAnalyticalHandoff({
    handoffIdentity: row.handoffIdentity,
    handoffVersion: row.handoffVersion,
    sourceStageId: 'LAFEA.1',
    sourceResultHash: result.semanticHash,
    governingRecord: {
      footprintIdentity: result.footprint.footprintIdentity,
      footprintType: result.footprint.type,
      loadCaseIdentity: result.sourceAuthority.loadCaseIdentity,
      foundationSourceSemanticHash:
        result.sourceAuthority.foundationSourceSemanticHash,
      foundationCanonicalModelSemanticHash:
        result.sourceAuthority.foundationCanonicalModelSemanticHash,
      foundationResultPayloadSemanticHash:
        result.sourceAuthority.foundationResultPayloadSemanticHash,
      equilibriumAccepted: result.equilibrium.accepted,
    },
    resultant: {
      coordinateSystem: 'GLOBAL',
      referencePoint: result.referencePoint,
      force: result.appliedResultant.force,
      moment: result.appliedResultant.moment,
    },
    targetStageId: row.targetStageId,
    targetSource: row.targetSource,
    targetLoadBindings: row.targetLoadBindings,
    sourceReference: row.sourceReference,
    limitations: row.limitations,
  });
}

function exactRecord(value, keys, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw handoffError('FOUNDATION_HANDOFF_OBJECT_REQUIRED', path);
  }
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    throw handoffError('FOUNDATION_HANDOFF_EXACT_KEYS_REQUIRED', path);
  }
  return value;
}

function handoffError(code, path) {
  const error = new TypeError(`${code}: ${path}`);
  error.code = code;
  error.path = path;
  return error;
}
