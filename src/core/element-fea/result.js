import { deepFreeze } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { CONTINUUM_MODEL_SCHEMA, CONTINUUM_RESULT_SCHEMA, CONTINUUM_RESULT_SCHEMA_V2, CONTINUUM_RESULT_SCHEMA_V3, ELEMENT_TYPES, LFEA_PROFILE_SCHEMA_V2, LINEAR_BACKENDS, RESULT_STATUS } from './constants.js';

export function rejectedResult(input, status, diagnostics, limitations = [], trace = {}) {
  const modelEvidence = normalizedModelEvidence(input); const schema = resultSchemaForInput(input);
  const base = { schema, status, qualifiedResults: null, modelIdentity: textOrEmpty(input?.modelIdentity), modelVersion: textOrEmpty(input?.modelVersion), sourceSemanticHash: textOrEmpty(input?.sourceSemanticHash), modelSemanticHash: modelEvidence?.semanticHash || null, modelEvidence, diagnostics: normalizedDiagnostics(diagnostics), limitations: normalizedText(limitations), ...trace };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function qualifiedResult(model, loadCase, evidence) {
  const base = { schema: evidence.resultSchema, status: RESULT_STATUS.QUALIFIED, qualifiedResults: 'complete', modelIdentity: model.modelIdentity, modelVersion: model.modelVersion, sourceSemanticHash: model.sourceSemanticHash, modelSemanticHash: model.semanticHash, modelEvidence: model, solverProfile: model.solverProfile, runtimeTrace: { runtimeIdentity: model.solverProfile.runtimeIdentity }, loadCaseIdentity: loadCase.loadCaseId, ...systemEvidence(evidence), ...recoveryEvidence(model, evidence) };
  addCompatibility(base, evidence);
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateContinuumResult(value) {
  const errors = []; const schemas = [CONTINUUM_RESULT_SCHEMA, CONTINUUM_RESULT_SCHEMA_V2, CONTINUUM_RESULT_SCHEMA_V3];
  if (!schemas.includes(value?.schema)) errors.push('Invalid LFEA continuum result schema.');
  if (!Object.values(RESULT_STATUS).includes(value?.status)) errors.push('LFEA result status is invalid.');
  if (!Array.isArray(value?.diagnostics) || !Array.isArray(value?.limitations)) errors.push('LFEA result diagnostics or limitations are invalid.');
  validateModelEvidence(value, errors); if (value?.status === RESULT_STATUS.QUALIFIED) validateQualifiedEvidence(value, errors); else validateRejectedEvidence(value, errors);
  try { if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('LFEA result semantic hash mismatch.'); } catch (error) { errors.push(error.message); }
  return deepFreeze({ ok: errors.length === 0, errors });
}

function addCompatibility(base, evidence) {
  if (evidence.resultSchema === CONTINUUM_RESULT_SCHEMA_V2) base.resultContractCompatibility = { predecessor: CONTINUUM_RESULT_SCHEMA, t3OnlyProjection: 'EXACT_V1_WHEN_NO_Q4_ELEMENTS', q4RawStressPolicy: 'FOUR_GAUSS_POINTS_NO_EXTRAPOLATION' };
  if (evidence.resultSchema === CONTINUUM_RESULT_SCHEMA_V3) base.resultContractCompatibility = { predecessor: evidence.predecessorResultSchema, denseReferenceMeaning: 'UNCHANGED', sparseEvidence: 'ADDITIVE_CLOSED_SUCCESSOR', rawStressPolicy: 'AUTHORITATIVE_ELEMENT_OR_INTEGRATION_POINT_STRESS' };
}

function systemEvidence(evidence) {
  const base = { assembledSystemHash: evidence.assembledSystemHash, backendTrace: evidence.backendTrace, dofMap: evidence.dofMap, constraintPartition: evidence.constraintPartition, directNodalLoads: evidence.directNodalLoads, directNodalLoadEvidence: evidence.directNodalLoadEvidence, equivalentEdgeLoads: evidence.equivalentEdgeLoads, edgeLoadEvidence: evidence.edgeLoadEvidence, appliedLoadVector: evidence.appliedLoadVector, effectiveFreeLoad: evidence.effectiveFreeLoad };
  if (evidence.resultSchema === CONTINUUM_RESULT_SCHEMA_V3) return { ...base, backendIdentity: LINEAR_BACKENDS.SPARSE_PCG_V1, sparseMatrixEvidence: evidence.sparseMatrixEvidence, capacityEvidence: evidence.capacityEvidence, iterativeSolverEvidence: evidence.iterativeSolverEvidence };
  return base;
}

function recoveryEvidence(model, evidence) {
  const common = { nodalDisplacements: evidence.nodalDisplacements, reactions: evidence.reactions, constrainedDofImbalance: evidence.constrainedDofImbalance, elementInternalForces: evidence.elementInternalForces, elementStrainEnergy: evidence.elementStrainEnergy, freeDofResidual: evidence.freeDofResidual, globalResidual: evidence.globalResidual, appliedLoadTotals: evidence.appliedLoadTotals, reactionTotals: evidence.reactionTotals, equilibriumTotals: evidence.equilibriumTotals, strainEnergy: evidence.strainEnergy, energyConsistency: evidence.energyConsistency, diagnostics: evidence.diagnostics, limitations: normalizedText([...model.limitations, ...model.solverProfile.limitations, ...(evidence.additionalLimitations || [])]) };
  if (evidence.resultSchema === CONTINUUM_RESULT_SCHEMA) return { ...common, elementStrains: evidence.elementStrains, elementStresses: evidence.elementStresses, principalStresses: evidence.principalStresses, vonMisesStress: evidence.vonMisesStress };
  return { ...common, integrationPointResults: evidence.integrationPointResults, elementIntegrationEvidence: evidence.elementIntegrationEvidence, elementQualityEvidence: evidence.elementQualityEvidence };
}

function validateModelEvidence(value, errors) {
  if (value?.modelEvidence === null) { if (value?.modelSemanticHash !== null) errors.push('LFEA result model identity is inconsistent.'); return; }
  if (value?.modelEvidence?.schema !== CONTINUUM_MODEL_SCHEMA) errors.push('LFEA result model evidence is invalid.');
  if (value?.modelSemanticHash !== value?.modelEvidence?.semanticHash) errors.push('LFEA result model semantic hash mismatch.');
}

function validateQualifiedEvidence(value, errors) {
  if (value?.qualifiedResults !== 'complete') errors.push('Qualified LFEA result is incomplete.');
  if (!value?.modelEvidence || !value?.modelSemanticHash) errors.push('Qualified LFEA result is missing model evidence.');
  const common = ['dofMap','directNodalLoads','equivalentEdgeLoads','appliedLoadVector','effectiveFreeLoad','nodalDisplacements','reactions','constrainedDofImbalance','elementInternalForces','elementStrainEnergy'];
  common.forEach((field) => { if (!Array.isArray(value?.[field])) errors.push(`Qualified LFEA result ${field} is invalid.`); });
  if (value?.schema === CONTINUUM_RESULT_SCHEMA) ['elementStrains','elementStresses','principalStresses','vonMisesStress'].forEach((field) => { if (!Array.isArray(value?.[field])) errors.push(`Qualified LFEA result ${field} is invalid.`); });
  if (value?.schema === CONTINUUM_RESULT_SCHEMA_V2 || value?.schema === CONTINUUM_RESULT_SCHEMA_V3) validateIntegrationEvidence(value, errors);
  if (value?.schema === CONTINUUM_RESULT_SCHEMA_V3) validateV3Evidence(value, errors);
  if (!value?.backendTrace || !value?.constraintPartition || !value?.freeDofResidual || !value?.globalResidual) errors.push('Qualified LFEA result is missing system evidence.');
}

function validateIntegrationEvidence(value, errors) {
  ['integrationPointResults','elementIntegrationEvidence','elementQualityEvidence'].forEach((field) => { if (!Array.isArray(value?.[field])) errors.push(`Qualified LFEA integration result ${field} is invalid.`); });
  const q4Ids = value?.modelEvidence?.elements?.filter((row) => row.type === ELEMENT_TYPES.Q4).map((row) => row.elementId) || [];
  q4Ids.forEach((elementId) => { const rows = value.integrationPointResults?.filter((row) => row.elementId === elementId) || []; if (rows.length !== 4) errors.push(`Q4 element ${elementId} must retain four raw integration-point results.`); });
}

function validateV3Evidence(value, errors) {
  if (value?.backendIdentity !== LINEAR_BACKENDS.SPARSE_PCG_V1) errors.push('Qualified LFEA v3 backend identity is invalid.');
  if (value?.solverProfile?.schema !== LFEA_PROFILE_SCHEMA_V2 || value?.solverProfile?.linearBackend !== LINEAR_BACKENDS.SPARSE_PCG_V1) errors.push('Qualified LFEA v3 profile evidence is invalid.');
  if (!value?.sparseMatrixEvidence || value.sparseMatrixEvidence.storageIdentity !== 'CSR_FULL_V1') errors.push('Qualified LFEA v3 sparse matrix evidence is invalid.');
  if (value?.capacityEvidence?.status !== 'ACCEPTED') errors.push('Qualified LFEA v3 capacity evidence is invalid.');
  if (value?.iterativeSolverEvidence?.terminationStatus !== 'RESIDUAL_TARGET_SATISFIED') errors.push('Qualified LFEA v3 iterative termination is invalid.');
  if (!(value?.iterativeSolverEvidence?.finalTrueResidualL2 <= value?.iterativeSolverEvidence?.targetResidual)) errors.push('Qualified LFEA v3 true residual exceeds its target.');
  if (![CONTINUUM_RESULT_SCHEMA, CONTINUUM_RESULT_SCHEMA_V2].includes(value?.resultContractCompatibility?.predecessor)) errors.push('Qualified LFEA v3 predecessor evidence is invalid.');
}

function validateRejectedEvidence(value, errors) {
  if (value?.qualifiedResults !== null) errors.push('Rejected LFEA result cannot contain qualified results.');
  ['nodalDisplacements','reactions','elementStrains','elementStresses','integrationPointResults','strainEnergy','elementStrainEnergy'].forEach((field) => { if (Object.hasOwn(value || {}, field)) errors.push(`Rejected LFEA result contains partial ${field} evidence.`); });
}

function resultSchemaForInput(value) { if (value?.solverProfile?.schema === LFEA_PROFILE_SCHEMA_V2 || value?.solverProfile?.linearBackend === LINEAR_BACKENDS.SPARSE_PCG_V1) return CONTINUUM_RESULT_SCHEMA_V3; return value?.elements?.some?.((row) => row?.type === ELEMENT_TYPES.Q4) ? CONTINUUM_RESULT_SCHEMA_V2 : CONTINUUM_RESULT_SCHEMA; }
function normalizedModelEvidence(value) { return value?.schema === CONTINUUM_MODEL_SCHEMA && typeof value?.semanticHash === 'string' ? value : null; }
function normalizedDiagnostics(value) { if (!Array.isArray(value)) return []; return [...value].map((row) => ({ code: textOrEmpty(row?.code), severity: textOrEmpty(row?.severity), message: textOrEmpty(row?.message) })).sort((a, b) => compare(a.code, b.code) || compare(a.message, b.message)); }
function normalizedText(value) { return [...new Set((Array.isArray(value) ? value : []).filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].sort(compare); }
function textOrEmpty(value) { return typeof value === 'string' ? value : ''; }
function withoutHash(value) { const { semanticHash: _hash, ...base } = value || {}; return base; }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
