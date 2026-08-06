import {
  deepFreeze,
  requireFiniteNumber,
  requireNonEmptyString,
  requireNonNegativeNumber,
  requirePositiveNumber,
} from './contracts.js';
import { semanticHash } from './identity.js';

export const VERTICAL_RETENTION_SCHEMA = 'empirical-vertical-retention-result/v1';
export const VERTICAL_REDISTRIBUTION_SCHEMA = 'empirical-vertical-redistribution-result/v1';

const FORMULAS = Object.freeze({
  relativeOpening: 'VRT-DSP-01',
  halfLoadCurve: 'VRT-ETA-01',
  unloadingStiffness: 'VRT-ETA-02',
  tabulatedCurve: 'VRT-ETA-03',
  retainedLoad: 'VRT-RXN-01',
  releasedLoad: 'VRT-RXN-02',
  redistribution: 'VRT-RDS-01',
  eulerCritical: 'PD-CR-01',
  bucklingRatio: 'PD-RAT-01',
  pDeltaAmplification: 'PD-AMP-01',
  amplifiedDisplacement: 'PD-DSP-01',
});

export function calculateVerticalRetention(input) {
  const supportId = requireNonEmptyString(input?.supportId, 'supportId');
  const sustainedReactionN = requireNonNegativeNumber(input?.sustainedReactionN, 'sustainedReactionN');
  const firstOrderPipeMovementMm = requireFiniteNumber(input?.firstOrderPipeMovementMm, 'firstOrderPipeMovementMm');
  const supportMovementMm = requireFiniteNumber(input?.supportMovementMm, 'supportMovementMm');
  const coldGapMm = requireNonNegativeNumber(input?.coldGapMm, 'coldGapMm');
  const deadbandMm = requireNonNegativeNumber(input?.deadbandMm, 'deadbandMm');
  const model = requireNonEmptyString(input?.model, 'model');

  const firstOrderRelativeOpeningMm = firstOrderPipeMovementMm - supportMovementMm - coldGapMm;
  const pDelta = calculatePDelta(input.pDelta, firstOrderRelativeOpeningMm);
  const governingRelativeOpeningMm = pDelta.enabled
    ? pDelta.amplifiedRelativeOpeningMm
    : firstOrderRelativeOpeningMm;
  const effectiveOpeningMm = Math.max(0, governingRelativeOpeningMm - deadbandMm);
  const retainedFraction = evaluateRetentionFraction(model, effectiveOpeningMm, input);
  const retainedReactionN = sustainedReactionN * retainedFraction;
  const releasedReactionN = sustainedReactionN - retainedReactionN;
  const state = retainedFraction >= 1 - 1e-12
    ? 'ACTIVE_FULL_RETENTION'
    : retainedFraction <= 1e-12
      ? 'LIFTED_SCREENING'
      : 'PARTIAL_RETENTION_SCREENING';

  const result = {
    schema: VERTICAL_RETENTION_SCHEMA,
    supportId,
    model,
    sustainedReactionN,
    firstOrderPipeMovementMm,
    supportMovementMm,
    coldGapMm,
    deadbandMm,
    firstOrderRelativeOpeningMm,
    governingRelativeOpeningMm,
    effectiveOpeningMm,
    retainedFraction,
    retainedReactionN,
    releasedReactionN,
    state,
    pDelta,
    qualification: input.qualification ?? 'PROJECT_SCREENING_ONLY',
    formulaTrace: Object.freeze([
      FORMULAS.relativeOpening,
      ...retentionFormulaTrace(model),
      FORMULAS.retainedLoad,
      FORMULAS.releasedLoad,
      ...(pDelta.enabled ? [
        FORMULAS.eulerCritical,
        FORMULAS.bucklingRatio,
        FORMULAS.pDeltaAmplification,
        FORMULAS.amplifiedDisplacement,
      ] : []),
    ]),
  };
  return deepFreeze({ ...result, semanticIdentity: semanticHash(result) });
}

export function redistributeReleasedReaction(input) {
  const sourceSupportId = requireNonEmptyString(input?.sourceSupportId, 'sourceSupportId');
  const releasedReactionN = requireNonNegativeNumber(input?.releasedReactionN, 'releasedReactionN');
  const sourcePositionM = requireFiniteNumber(input?.sourcePositionM, 'sourcePositionM');
  const left = normalizeSupport(input?.leftSupport, 'leftSupport');
  const right = normalizeSupport(input?.rightSupport, 'rightSupport');
  if (!(right.positionM > left.positionM)) {
    throw new RangeError('rightSupport.positionM must be greater than leftSupport.positionM.');
  }
  if (sourcePositionM < left.positionM || sourcePositionM > right.positionM) {
    throw new RangeError('sourcePositionM must lie between the adjacent active supports.');
  }
  const span = right.positionM - left.positionM;
  const incrementLeftN = releasedReactionN * (right.positionM - sourcePositionM) / span;
  const incrementRightN = releasedReactionN * (sourcePositionM - left.positionM) / span;
  const forceResidualN = incrementLeftN + incrementRightN - releasedReactionN;
  const momentResidualAboutLeftNm = incrementRightN * span
    - releasedReactionN * (sourcePositionM - left.positionM);
  const result = {
    schema: VERTICAL_REDISTRIBUTION_SCHEMA,
    sourceSupportId,
    sourcePositionM,
    releasedReactionN,
    leftSupport: left,
    rightSupport: right,
    increments: deepFreeze({
      [left.supportId]: incrementLeftN,
      [right.supportId]: incrementRightN,
    }),
    equilibrium: deepFreeze({ forceResidualN, momentResidualAboutLeftNm }),
    formulaTrace: Object.freeze([FORMULAS.redistribution]),
  };
  return deepFreeze({ ...result, semanticIdentity: semanticHash(result) });
}

function evaluateRetentionFraction(model, openingMm, input) {
  if (model === 'RIGID_UNILATERAL') return openingMm <= 0 ? 1 : 0;
  if (model === 'HALF_LOAD_DISPLACEMENT') {
    const halfLoadDisplacementMm = requirePositiveNumber(
      input.halfLoadDisplacementMm,
      'halfLoadDisplacementMm',
    );
    const retainedFractionAtHalfLoadPoint = requireFiniteFraction(
      input.retainedFractionAtHalfLoadPoint,
      'retainedFractionAtHalfLoadPoint',
    );
    const curveExponent = requirePositiveNumber(input.curveExponent, 'curveExponent');
    const value = 1 - (1 - retainedFractionAtHalfLoadPoint)
      * ((openingMm / halfLoadDisplacementMm) ** curveExponent);
    return clamp01(value);
  }
  if (model === 'EFFECTIVE_UNLOADING_STIFFNESS') {
    const sustainedReactionN = requireNonNegativeNumber(input.sustainedReactionN, 'sustainedReactionN');
    if (sustainedReactionN === 0) return 0;
    const unloadingStiffnessNPerMm = requirePositiveNumber(
      input.unloadingStiffnessNPerMm,
      'unloadingStiffnessNPerMm',
    );
    return clamp01((sustainedReactionN - unloadingStiffnessNPerMm * openingMm) / sustainedReactionN);
  }
  if (model === 'TABULATED_RETENTION_CURVE') {
    return interpolateCurve(normalizeCurve(input.retentionCurve));
  }
  throw new RangeError(`Unsupported vertical retention model: ${model}.`);

  function interpolateCurve(curve) {
    if (openingMm <= curve[0].openingMm) return curve[0].retainedFraction;
    if (openingMm >= curve[curve.length - 1].openingMm) return curve[curve.length - 1].retainedFraction;
    for (let index = 1; index < curve.length; index += 1) {
      const upper = curve[index];
      const lower = curve[index - 1];
      if (openingMm <= upper.openingMm) {
        const ratio = (openingMm - lower.openingMm) / (upper.openingMm - lower.openingMm);
        return lower.retainedFraction + ratio * (upper.retainedFraction - lower.retainedFraction);
      }
    }
    return 0;
  }
}

function calculatePDelta(config, firstOrderRelativeOpeningMm) {
  if (!config || config.enabled !== true) {
    return deepFreeze({
      enabled: false,
      method: null,
      criticalLoadN: null,
      compressionRatio: null,
      amplificationFactor: 1,
      amplifiedRelativeOpeningMm: firstOrderRelativeOpeningMm,
      status: 'NOT_ENABLED',
    });
  }
  if (config.method !== 'ONE_PASS_EULER_AMPLIFICATION') {
    throw new RangeError(`Unsupported P-delta method: ${config.method}.`);
  }
  const compressionForceN = requireNonNegativeNumber(config.compressionForceN, 'pDelta.compressionForceN');
  const elasticModulusPa = requirePositiveNumber(config.elasticModulusPa, 'pDelta.elasticModulusPa');
  const secondMomentM4 = requirePositiveNumber(config.secondMomentM4, 'pDelta.secondMomentM4');
  const effectiveLengthFactor = requirePositiveNumber(config.effectiveLengthFactor, 'pDelta.effectiveLengthFactor');
  const effectiveLengthM = requirePositiveNumber(config.effectiveLengthM, 'pDelta.effectiveLengthM');
  const maximumCompressionRatio = requirePositiveNumber(
    config.maximumCompressionRatio,
    'pDelta.maximumCompressionRatio',
  );
  if (maximumCompressionRatio >= 1) {
    throw new RangeError('pDelta.maximumCompressionRatio must be less than 1.');
  }
  const criticalLoadN = (Math.PI ** 2) * elasticModulusPa * secondMomentM4
    / ((effectiveLengthFactor * effectiveLengthM) ** 2);
  const compressionRatio = compressionForceN / criticalLoadN;
  if (compressionRatio > maximumCompressionRatio) {
    throw new RangeError(
      `P-delta compression ratio ${compressionRatio} exceeds the qualified maximum ${maximumCompressionRatio}.`,
    );
  }
  const amplificationFactor = compressionForceN === 0 ? 1 : 1 / (1 - compressionRatio);
  const amplifiedRelativeOpeningMm = firstOrderRelativeOpeningMm * amplificationFactor;
  return deepFreeze({
    enabled: true,
    method: config.method,
    criticalLoadN,
    compressionRatio,
    amplificationFactor: amplificationFactor,
    amplifiedRelativeOpeningMm,
    status: 'CALCULATED_ONE_PASS',
  });
}

function normalizeCurve(value) {
  if (!Array.isArray(value) || value.length < 2) {
    throw new TypeError('retentionCurve must contain at least two points.');
  }
  const curve = value.map((row, index) => deepFreeze({
    openingMm: requireNonNegativeNumber(row?.openingMm, `retentionCurve[${index}].openingMm`),
    retainedFraction: requireFiniteFraction(row?.retainedFraction, `retentionCurve[${index}].retainedFraction`),
  })).sort((a, b) => a.openingMm - b.openingMm);
  for (let index = 1; index < curve.length; index += 1) {
    if (!(curve[index].openingMm > curve[index - 1].openingMm)) {
      throw new RangeError('retentionCurve opening values must be strictly increasing.');
    }
    if (curve[index].retainedFraction > curve[index - 1].retainedFraction) {
      throw new RangeError('retentionCurve retained fractions must be non-increasing.');
    }
  }
  return Object.freeze(curve);
}

function normalizeSupport(value, fieldName) {
  if (!value || typeof value !== 'object') throw new TypeError(`${fieldName} is required.`);
  return deepFreeze({
    supportId: requireNonEmptyString(value.supportId, `${fieldName}.supportId`),
    positionM: requireFiniteNumber(value.positionM, `${fieldName}.positionM`),
  });
}

function retentionFormulaTrace(model) {
  if (model === 'HALF_LOAD_DISPLACEMENT') return [FORMULAS.halfLoadCurve];
  if (model === 'EFFECTIVE_UNLOADING_STIFFNESS') return [FORMULAS.unloadingStiffness];
  if (model === 'TABULATED_RETENTION_CURVE') return [FORMULAS.tabulatedCurve];
  return [];
}

function requireFiniteFraction(value, fieldName) {
  const number = requireFiniteNumber(value, fieldName);
  if (number < 0 || number > 1) throw new RangeError(`${fieldName} must be between zero and one.`);
  return number;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}
