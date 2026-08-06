import {
  createLinearFactorizationRuntime,
  requireLinearFactorizationRuntime,
} from '../linear-fea-solver/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { compileInputXmlStiffnessElementAuthorities } from './inputxml-linear-stiffness-elements.js';
import {
  requireInputXmlLinearStiffnessPreflight,
} from './inputxml-linear-stiffness-preflight-contract.js';
import {
  inputXmlStiffnessFrameElementProfile,
  inputXmlStiffnessSolverProfile,
} from './inputxml-linear-stiffness-profile.js';
import { requireInputXmlLinearSolvePreparation } from './inputxml-linear-solve-preparation-contract.js';

export const INPUTXML_LINEAR_SOLVE_RUNTIME_SCHEMA = 'fea-inputxml-linear-solve-runtime/v1';

const runtimeRegistry = new WeakSet();

export function createInputXmlLinearSolveRuntime(solvePreparation, preflight, options) {
  const acceptedPreparation = requireInputXmlLinearSolvePreparation(solvePreparation);
  const acceptedPreflight = requireInputXmlLinearStiffnessPreflight(
    preflight,
    acceptedPreparation,
  );
  const settings = options ?? {};
  if (acceptedPreflight.status === 'BLOCK') {
    throw new TypeError('InputXML solve runtime cannot be created from a blocked preflight.');
  }
  if (acceptedPreflight.status === 'WARN'
    && settings.authorizeConditionalPreflight !== true) {
    throw new TypeError(
      'InputXML conditional preflight requires explicit authorizeConditionalPreflight=true.',
    );
  }
  const frameProfile = inputXmlStiffnessFrameElementProfile();
  const solverProfile = inputXmlStiffnessSolverProfile(settings.solverProfile);
  if (frameProfile.semanticHash !== acceptedPreflight.frameElementProfileSemanticHash
    || solverProfile.semanticHash !== acceptedPreflight.solverProfileSemanticHash) {
    throw new TypeError('InputXML solve runtime profiles differ from the qualified preflight.');
  }
  const structural = acceptedPreparation.structuralPreparation;
  const elements = compileInputXmlStiffnessElementAuthorities(structural, frameProfile);
  if (semanticHash(elements.elementLedger) !== semanticHash(acceptedPreflight.elementLedger)) {
    throw new TypeError('InputXML solve runtime stiffness-element custody differs from preflight.');
  }
  const genericRuntime = createLinearFactorizationRuntime({
    compilation: structural.compilation,
    elementContributions: elements.elementContributions,
    solverProfile,
  });
  requireRuntimeMatchesPreflight(genericRuntime, acceptedPreflight);
  const authorizedCaseIds = resolveAuthorizedCaseIds(
    acceptedPreparation.physicalCases,
    settings.caseIds,
  );
  const publicRecord = {
    schema: INPUTXML_LINEAR_SOLVE_RUNTIME_SCHEMA,
    runtimeId: '',
    runtimeHash: '',
    analysisProfileId: acceptedPreparation.analysisProfileId,
    solvePreparationSemanticHash: acceptedPreparation.semanticHash,
    solvePreparationEvidenceHash: acceptedPreparation.evidenceHash,
    preflightSemanticHash: acceptedPreflight.semanticHash,
    preflightEvidenceHash: acceptedPreflight.evidenceHash,
    stiffnessAssessmentHash: acceptedPreflight.stiffnessAssessmentHash,
    stiffnessRuntimeHash: genericRuntime.runtimeHash,
    stiffnessStateHash: genericRuntime.stiffnessStateHash,
    partitionHash: genericRuntime.partitionHash,
    solverProfileSemanticHash: solverProfile.semanticHash,
    frameElementProfileSemanticHash: frameProfile.semanticHash,
    authorizedCaseIds: Object.freeze(authorizedCaseIds),
    authorizationMode: acceptedPreflight.status === 'WARN'
      ? 'CONDITIONAL_PREFLIGHT_EXPLICIT_OPT_IN'
      : 'QUALIFIED_PREFLIGHT',
    factorization: genericRuntime.factorization,
    executionAvailability: Object.freeze({
      factorizationHandle: 'CREATED_RUNTIME_ONLY',
      solveExecution: acceptedPreflight.status === 'WARN'
        ? 'CONDITIONAL_AUTHORIZED'
        : 'AUTHORIZED',
      resultRecovery: acceptedPreflight.status === 'WARN'
        ? 'CONDITIONAL_AUTHORIZED'
        : 'AUTHORIZED',
    }),
  };
  publicRecord.runtimeId = `IXRT-${semanticHash(runtimeIdentityProjection(publicRecord))}`;
  publicRecord.runtimeHash = semanticHash(runtimeProjection(publicRecord));
  Object.defineProperties(publicRecord, {
    solvePreparation: hidden(acceptedPreparation),
    preflight: hidden(acceptedPreflight),
    genericRuntime: hidden(genericRuntime),
    solverProfile: hidden(solverProfile),
    frameProfile: hidden(frameProfile),
  });
  runtimeRegistry.add(publicRecord);
  return Object.freeze(publicRecord);
}

export function requireInputXmlLinearSolveRuntime(value) {
  if (!value || value.schema !== INPUTXML_LINEAR_SOLVE_RUNTIME_SCHEMA
    || !runtimeRegistry.has(value)) {
    throw new TypeError('InputXML solve runtime was not created by the runtime authority.');
  }
  if (value.runtimeHash !== semanticHash(runtimeProjection(value))) {
    throw new TypeError('InputXML solve runtime public identity is stale.');
  }
  requireInputXmlLinearSolvePreparation(value.solvePreparation);
  requireInputXmlLinearStiffnessPreflight(value.preflight, value.solvePreparation);
  requireLinearFactorizationRuntime(value.genericRuntime, {
    compilation: value.solvePreparation.structuralPreparation.compilation,
    solverProfile: value.solverProfile,
  });
  if (value.solvePreparationSemanticHash !== value.solvePreparation.semanticHash
    || value.preflightSemanticHash !== value.preflight.semanticHash
    || value.stiffnessRuntimeHash !== value.genericRuntime.runtimeHash) {
    throw new TypeError('InputXML solve runtime retained authorities are stale.');
  }
  return value;
}

export function inputXmlLinearRuntimeAuthorities(value) {
  const runtime = requireInputXmlLinearSolveRuntime(value);
  return Object.freeze({
    solvePreparation: runtime.solvePreparation,
    preflight: runtime.preflight,
    genericRuntime: runtime.genericRuntime,
    solverProfile: runtime.solverProfile,
    frameProfile: runtime.frameProfile,
  });
}

function requireRuntimeMatchesPreflight(runtime, preflight) {
  const generic = preflight.genericPreflight;
  if (runtime.stiffnessStateHash !== preflight.stiffnessStateHash
    || runtime.partitionHash !== generic.assembly.partitionHash
    || runtime.assembly.freeDofCount !== generic.assembly.freeDofCount
    || runtime.assembly.constrainedDofCount !== generic.assembly.constrainedDofCount
    || runtime.factorization.kind !== generic.factorization.kind
    || runtime.factorization.conditionEstimate !== generic.factorization.conditionEstimate
    || semanticHash(runtime.factorization.pivotStatistics)
      !== semanticHash(generic.factorization.pivotStatistics)) {
    throw new TypeError('InputXML solve runtime factorization differs from qualified preflight.');
  }
}

function resolveAuthorizedCaseIds(physicalCases, requested) {
  const available = physicalCases.map((row) => row.caseId);
  const selected = requested === undefined ? available : requested;
  if (!Array.isArray(selected) || selected.length === 0) {
    throw new TypeError('InputXML solve runtime requires at least one authorized physical case.');
  }
  const ids = new Set();
  for (const value of selected) {
    if (typeof value !== 'string' || !available.includes(value) || ids.has(value)) {
      throw new TypeError('InputXML solve runtime case authorization is invalid or duplicated.');
    }
    ids.add(value);
  }
  return [...ids].sort(compareAscii);
}

function hidden(value) {
  return { value, enumerable: false, configurable: false, writable: false };
}

function runtimeIdentityProjection(value) {
  return {
    schema: value.schema,
    solvePreparationSemanticHash: value.solvePreparationSemanticHash,
    preflightSemanticHash: value.preflightSemanticHash,
    stiffnessAssessmentHash: value.stiffnessAssessmentHash,
    stiffnessRuntimeHash: value.stiffnessRuntimeHash,
    authorizedCaseIds: value.authorizedCaseIds,
    authorizationMode: value.authorizationMode,
  };
}

function runtimeProjection(value) {
  return {
    ...runtimeIdentityProjection(value),
    runtimeId: value.runtimeId,
    analysisProfileId: value.analysisProfileId,
    solvePreparationEvidenceHash: value.solvePreparationEvidenceHash,
    preflightEvidenceHash: value.preflightEvidenceHash,
    stiffnessStateHash: value.stiffnessStateHash,
    partitionHash: value.partitionHash,
    solverProfileSemanticHash: value.solverProfileSemanticHash,
    frameElementProfileSemanticHash: value.frameElementProfileSemanticHash,
    factorization: value.factorization,
    executionAvailability: value.executionAvailability,
  };
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
