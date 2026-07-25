import {
  ENGINEERING_LEVEL,
  FORMULA_IDS,
  QUALIFICATION_STATES,
  RESULT_SCHEMA,
} from './constants.js';
import { assembleGlobalSystem } from './assembly.js';
import { validateCanonicalLocalShellModel } from './canonical-model.js';
import { buildNodeBasisEvidence, buildShellElementEvidence } from './element.js';
import {
  ShellLoadCaseError,
  ShellModelError,
  ShellNumericalError,
  ShellSingularSystemError,
} from './errors.js';
import { deepFreeze } from './json.js';
import { assembleLoadCase } from './loads.js';
import { recoverLoadCase } from './recovery.js';
import { reconstructShellResultHashes } from './result-hashes.js';
import { solveLoadCase } from './solver.js';

export function calculateLocalShell(model) {
  let canonical;
  try {
    canonical = validateCanonicalLocalShellModel(model);
    return calculateAccepted(canonical);
  } catch (error) {
    return rejectedResult(canonical ?? model, error);
  }
}

function calculateAccepted(model) {
  const elements = buildShellElementEvidence(model);
  const nodeBasisQualification = buildNodeBasisEvidence(model);
  const assembly = assembleGlobalSystem(model, elements);
  if (!assembly.symmetry.accepted) throw new ShellNumericalError('Global stiffness symmetry failed qualification', assembly.symmetry);
  const loadCaseResults = model.loadCases.map((loadCase) => calculateLoadCase(model, loadCase, assembly, elements));
  if (loadCaseResults.some((row) => !row.qualification.accepted)) throw new ShellNumericalError('A load case failed numerical qualification');
  const meshEvidence = {
    dofOrdering: assembly.dofOrdering,
    nodeBasisQualification,
    elements,
    globalStiffness: assembly.stiffness,
    globalStiffnessSymmetry: assembly.symmetry,
    elementAssembly: assembly.elementAssembly,
    formulaIds: [FORMULA_IDS.NODE_BASIS, FORMULA_IDS.GLOBAL_ASSEMBLY],
  };
  const formulaTrace = collectFormulaTrace(elements, loadCaseResults);
  const result = acceptedPayload(model, meshEvidence, loadCaseResults, formulaTrace);
  result.semanticHashes = reconstructShellResultHashes(result);
  return deepFreeze(result);
}

function calculateLoadCase(model, loadCase, assembly, elements) {
  const loads = assembleLoadCase(model, loadCase, assembly, elements);
  const solution = solveLoadCase(model, assembly, loads);
  return recoverLoadCase(model, assembly, elements, loads, solution);
}

function acceptedPayload(model, meshEvidence, loadCaseResults, formulaTrace) {
  return {
    schema: RESULT_SCHEMA,
    modelIdentity: model.modelIdentity,
    modelVersion: model.modelVersion,
    sourceAncestry: [...model.sourceAncestry],
    formulation: model.formulation,
    engineeringLevel: ENGINEERING_LEVEL,
    qualification: {
      state: QUALIFICATION_STATES.ACCEPTED,
      engineeringLevel: ENGINEERING_LEVEL,
      accepted: true,
      summary: 'All retained shell-kernel qualifications passed',
    },
    canonicalModelSemanticHash: model.semanticHash,
    meshEvidence,
    loadCaseResults,
    formulaTrace,
    diagnostics: [],
    limitations: [...model.limitations],
  };
}

function rejectedResult(source, error) {
  const identity = safeIdentity(source);
  const state = stateForError(error);
  const payload = {
    schema: RESULT_SCHEMA,
    modelIdentity: identity.modelIdentity,
    modelVersion: identity.modelVersion,
    sourceAncestry: identity.sourceAncestry,
    formulation: identity.formulation,
    engineeringLevel: ENGINEERING_LEVEL,
    qualification: {
      state,
      engineeringLevel: ENGINEERING_LEVEL,
      accepted: false,
      summary: error instanceof Error ? error.message : 'Unknown shell-kernel rejection',
    },
    canonicalModelSemanticHash: identity.semanticHash,
    formulaTrace: [],
    diagnostics: [{ code: state, message: error instanceof Error ? error.message : 'Unknown shell-kernel rejection' }],
    limitations: identity.limitations,
  };
  payload.semanticHashes = reconstructShellResultHashes(payload);
  return deepFreeze(payload);
}

function safeIdentity(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source) || Object.getPrototypeOf(source) !== Object.prototype) return emptyIdentity();
  return {
    modelIdentity: safeString(source, 'modelIdentity'),
    modelVersion: safeString(source, 'modelVersion'),
    sourceAncestry: safeStringArray(source, 'sourceAncestry'),
    formulation: safeString(source, 'formulation'),
    semanticHash: safeString(source, 'semanticHash'),
    limitations: safeStringArray(source, 'limitations'),
  };
}

function safeString(record, key) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && descriptor.enumerable && 'value' in descriptor && typeof descriptor.value === 'string'
    ? descriptor.value
    : null;
}

function safeStringArray(record, key) {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return [];
  const value = descriptor.value;
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return [];
  for (let index = 0; index < value.length; index += 1) {
    const item = Object.getOwnPropertyDescriptor(value, String(index));
    if (!item || !item.enumerable || !('value' in item) || typeof item.value !== 'string') return [];
  }
  return [...value].sort();
}

function emptyIdentity() {
  return { modelIdentity: null, modelVersion: null, sourceAncestry: [], formulation: null, semanticHash: null, limitations: [] };
}

function stateForError(error) {
  if (error instanceof ShellSingularSystemError) return QUALIFICATION_STATES.SINGULAR_SYSTEM;
  if (error instanceof ShellLoadCaseError) return QUALIFICATION_STATES.REJECTED_LOAD_CASE;
  if (error instanceof ShellNumericalError) return QUALIFICATION_STATES.NUMERICAL_FAILURE;
  if (error instanceof ShellModelError) return QUALIFICATION_STATES.REJECTED_MODEL;
  return QUALIFICATION_STATES.NUMERICAL_FAILURE;
}

function collectFormulaTrace(elements, loadCases) {
  const ids = new Set([FORMULA_IDS.NODE_BASIS, FORMULA_IDS.GLOBAL_ASSEMBLY]);
  for (const element of elements) element.formulaIds.forEach((id) => ids.add(id));
  for (const loadCase of loadCases) loadCase.formulaIds.forEach((id) => ids.add(id));
  return [...ids].sort();
}
