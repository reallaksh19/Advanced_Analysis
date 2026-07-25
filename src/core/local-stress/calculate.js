import { deepFreeze } from '../shared-piping-model/index.js';
import {
  BASE_LIMITATIONS, ENGINEERING_LEVEL, QUALIFICATION_STATES, RESULT_SCHEMA,
} from './constants.js';
import { FoundationError, unsupportedError } from './errors.js';
import { validateCanonicalLocalAttachmentFoundationModel } from './canonical-model.js';
import { createPipeLocalFrame } from './coordinates.js';
import { transformRequestedLoadCases } from './loads.js';
import { calculateRequestedPressureResults } from './pressure.js';
import { attachResultHashes, reconstructResultHashes } from './result-hashes.js';

export function calculateLocalAttachmentFoundation(input) {
  try {
    const model = validateCanonicalLocalAttachmentFoundationModel(input);
    return acceptedResult(model);
  } catch (error) {
    return rejectedResult(input, normalizeError(error));
  }
}
export const calculateLocalStressFoundation = calculateLocalAttachmentFoundation;
export { reconstructResultHashes };

function acceptedResult(model) {
  ensureSupportedRequests(model);
  const coordinateSystemEvidence = createPipeLocalFrame(model);
  const transformedLoadCases = transformRequestedLoadCases(model, coordinateSystemEvidence);
  const pressureStressResults = calculateRequestedPressureResults(model);
  const formulaTrace = executedFormulas(coordinateSystemEvidence, transformedLoadCases, pressureStressResults);
  const base = {
    schema: RESULT_SCHEMA,
    modelIdentity: model.modelIdentity,
    modelVersion: model.modelVersion,
    sourceAncestry: model.sourceAncestry,
    qualification: {
      state: QUALIFICATION_STATES.ACCEPTED,
      engineeringLevel: ENGINEERING_LEVEL,
      qualificationProfile: model.qualificationProfile,
    },
    coordinateSystemEvidence,
    transformedLoadCases,
    pressureStressResults,
    forceMomentAccounting: accounting(transformedLoadCases),
    formulaTrace,
    diagnostics: [],
    limitations: model.limitations,
  };
  return deepFreeze(attachResultHashes(base));
}
function ensureSupportedRequests(model) {
  const supported = new Set(['LOAD_TRANSFER', 'PRESSURE_STRESS']);
  const unsupported = model.resultRequests.requestedAnalyses.find((value) => !supported.has(value));
  if (unsupported) throw unsupportedError('UNSUPPORTED_ANALYSIS_REQUEST', 'resultRequests.requestedAnalyses', `Unsupported request ${unsupported}.`);
}
function rejectedResult(input, diagnostic) {
  const limitations = [...new Set([...BASE_LIMITATIONS, 'NO_AUTHORITATIVE_TRANSFORMED_LOAD_OR_STRESS_EVIDENCE'])].sort();
  const base = {
    schema: RESULT_SCHEMA,
    modelIdentity: safeString(input?.modelIdentity),
    modelVersion: safeString(input?.modelVersion),
    sourceAncestry: safeAncestry(input?.sourceAncestry),
    qualification: {
      state: diagnostic.state,
      engineeringLevel: ENGINEERING_LEVEL,
      qualificationProfile: safeProfile(input?.qualificationProfile),
    },
    formulaTrace: [],
    diagnostics: [diagnostic],
    limitations,
  };
  return deepFreeze(attachResultHashes(base));
}
function accounting(loadCases) {
  return loadCases.map((row) => ({
    loadCaseIdentity: row.identity,
    forceResidualGlobal: row.forceResidualGlobal,
    momentResidualGlobal: row.momentResidualGlobal,
    commonOriginMomentResidualGlobal: row.commonOriginMomentResidualGlobal,
    tolerances: row.tolerances,
    accepted: true,
  }));
}
function executedFormulas(frame, loads, pressures) {
  const ids = [frame, ...loads, ...pressures].flatMap((row) => row.formulaIds ?? []);
  return [...new Set(ids)].sort();
}
function normalizeError(error) {
  if (error instanceof FoundationError) {
    return { state: error.state, code: error.code, path: error.path, message: error.message };
  }
  return {
    state: QUALIFICATION_STATES.NUMERICAL_FAILURE,
    code: 'UNEXPECTED_NUMERICAL_FAILURE',
    path: 'calculation',
    message: error instanceof Error ? error.message : 'Unknown numerical failure.',
  };
}
function safeString(value) { return typeof value === 'string' && value.trim() ? value.trim() : null; }
function safeAncestry(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    sourceModelIdentity: safeString(value.sourceModelIdentity),
    sourceVersion: safeString(value.sourceVersion),
    sourceSemanticHash: safeString(value.sourceSemanticHash),
    adapterIdentity: safeString(value.adapterIdentity),
    adapterVersion: safeString(value.adapterVersion),
    transformationEvidenceHash: safeString(value.transformationEvidenceHash),
    canonicalModelSemanticHash: safeString(value.canonicalModelSemanticHash),
  };
}
function safeProfile(value) {
  if (!value || typeof value !== 'object') return null;
  return { schema: safeString(value.schema), identity: safeString(value.identity) };
}
