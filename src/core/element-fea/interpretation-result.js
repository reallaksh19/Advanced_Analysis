import { deepFreeze } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { CONVERGENCE_RESULT_SCHEMA } from './interpretation-constants.js';
import { createConvergenceStudy, quantityHistory } from './convergence-study.js';
import { scalarConvergenceEvidence, stressTrendEvidence } from './stress-trend.js';

export function interpretConvergenceStudy(input) {
  const study = createConvergenceStudy(input);
  const quantityResults = study.quantities.map((quantity) => interpretQuantity(study, quantity));
  const base = {
    schema: CONVERGENCE_RESULT_SCHEMA,
    interpretationIdentity: `${study.studyIdentity}:INTERPRETATION`,
    interpretationVersion: '1',
    sourceStudyIdentity: study.studyIdentity,
    sourceStudySemanticHash: study.semanticHash,
    sourceSemanticHash: study.sourceSemanticHash,
    status: 'QUALIFIED_INTERPRETATION_EVIDENCE',
    studyEvidence: study,
    levelEvidence: levelEvidence(study),
    quantityResults,
    globalQuantityTrends: quantityResults.filter((row) => globalQuantity(row.quantityType)),
    fixedProbeStressTrends: quantityResults.filter((row) => row.quantityType === 'POINT' && stressComponent(row.component)),
    regionalMaximumStressTrends: quantityResults.filter((row) => row.quantityType === 'MAX_RAW_STRESS'),
    authorityPolicy: authorityPolicy(),
    diagnostics: [],
    limitations: interpretationLimitations(),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateConvergenceResult(value) {
  const errors = [];
  if (value?.schema !== CONVERGENCE_RESULT_SCHEMA) errors.push('Invalid fea-convergence-result/v1 schema.');
  if (value?.status !== 'QUALIFIED_INTERPRETATION_EVIDENCE') errors.push('Convergence interpretation status is invalid.');
  if (!Array.isArray(value?.quantityResults) || value.quantityResults.length < 1) errors.push('Convergence result quantity evidence is missing.');
  if (value?.sourceStudySemanticHash !== value?.studyEvidence?.semanticHash) errors.push('Convergence result study ancestry is inconsistent.');
  if (value?.quantityResults?.some((row) => row.sourceAuthority !== 'RAW_QUALIFIED_RESULT')) errors.push('Convergence result contains non-authoritative quantity evidence.');
  if (value?.quantityResults?.some((row) => row.classification === 'CONVERGED')) errors.push('Convergence result uses a prohibited generic convergence status.');
  if (value?.authorityPolicy?.projectedStressForConvergence !== 'PROHIBITED') errors.push('Convergence result does not prohibit projected stress.');
  if (value?.authorityPolicy?.singularityProof !== 'PROHIBITED') errors.push('Convergence result improperly permits singularity proof.');
  try { if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('Convergence result semantic hash mismatch.'); } catch (error) { errors.push(error.message); }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function interpretQuantity(study, quantity) {
  const history = quantityHistory(study, quantity);
  const scalar = scalarConvergenceEvidence(history, study.profile);
  const base = {
    quantityId: quantity.quantityId,
    quantityType: quantity.quantityType,
    component: quantity.component || null,
    probeId: quantity.probeId || null,
    regionId: quantity.regionId || null,
    sourceAuthority: quantity.sourceAuthority,
    ...scalar,
  };
  if (!stressQuantity(quantity)) return base;
  const locations = quantity.quantityType === 'MAX_RAW_STRESS' ? history.map((row) => row.location).filter(Boolean) : [];
  const features = study.singularFeatures;
  return { ...base, stressTrend: stressTrendEvidence(scalar, locations, features, study.profile.coordinateResidualAbsolute) };
}

function levelEvidence(study) {
  return study.levels.map((level, index) => ({
    levelId: level.levelId,
    declaredOrder: level.declaredOrder,
    modelIdentity: level.model.modelIdentity,
    modelSemanticHash: level.model.semanticHash,
    resultSemanticHash: level.result.semanticHash,
    nodeCount: level.model.nodes.length,
    elementCount: level.model.elements.length,
    formulation: level.model.solverProfile.formulation,
    meshMetrics: level.meshMetrics,
    refinementRatioToNext: study.refinementRatios[index]?.ratio || null,
  }));
}
function stressQuantity(quantity) { return quantity.quantityType === 'MAX_RAW_STRESS' || (quantity.quantityType === 'POINT' && stressComponent(quantity.component)); }
function stressComponent(value) { return ['SX','SY','TXY','SIGMA_Z','VON_MISES','PRINCIPAL_1','PRINCIPAL_2','PRINCIPAL_3'].includes(value); }
function globalQuantity(type) { return ['REACTION_RESULTANT','STRAIN_ENERGY','DISPLACEMENT_FUNCTIONAL'].includes(type); }
function authorityPolicy() { return { rawStressAuthority: 'QUALIFIED_ELEMENT_OR_INTEGRATION_POINT_RESULT', projectedStressAuthority: 'NON_AUTHORITATIVE_REVIEW_PROJECTION', projectedStressForConvergence: 'PROHIBITED', nearestNodeProbeSubstitution: 'PROHIBITED', singularityProof: 'PROHIBITED', richardsonMeaning: 'ESTIMATED_ASYMPTOTIC_VALUE_NOT_EXACT_OR_ERROR_BOUND', gridConvergenceIndex: 'NOT_IMPLEMENTED' }; }
function interpretationLimitations() { return ['Convergence evidence does not validate physical reality or eliminate model-form uncertainty.', 'A rising stress sequence may support SINGULARITY_SUSPECTED but cannot prove a mathematical singularity.', 'Richardson extrapolation is conditional asymptotic evidence, not an exact answer or certified error bound.']; }
function withoutHash(value) { const { semanticHash: _hash, ...base } = value || {}; return base; }
