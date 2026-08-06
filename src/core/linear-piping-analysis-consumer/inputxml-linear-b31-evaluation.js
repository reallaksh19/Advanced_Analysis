import {
  EXPANSION_RANGE_ENVELOPE,
  SUSTAINED,
  compileCodeResult,
  requireCodeProfile,
  requireEditionDataset,
  requireStressFactorSet,
} from '../linear-fea-b31-code-engine/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { resolveInputXmlB31Authorities } from './inputxml-linear-b31-authorities.js';
import {
  INPUTXML_LINEAR_B31_EVALUATION_SCHEMA,
  requireInputXmlLinearB31Evaluation,
  sealInputXmlLinearB31Evaluation,
} from './inputxml-linear-b31-evaluation-contract.js';
import {
  INPUTXML_LINEAR_B31_CHECK_KEYS,
  INPUTXML_LINEAR_B31_EVALUATION_REQUEST_SCHEMA,
  compareAscii,
  inputXmlB31ApproximationLimitations,
  requireInputXmlB31ApproximationApproval,
  requireInputXmlB31CategoryAlgebra,
  requireInputXmlB31Check,
  requireInputXmlB31Request,
  uniqueAscii,
} from './inputxml-linear-b31-definition.js';
import { inputXmlB31Failure as fail } from './inputxml-linear-b31-error.js';
import { resolveInputXmlB31Pressure } from './inputxml-linear-b31-pressure.js';
import { requireInputXmlLinearDerivedCase } from './inputxml-linear-derived-case-contract.js';
import { requireInputXmlLinearSolvePreparation } from './inputxml-linear-solve-preparation-contract.js';
import { requireInputXmlLinearStiffnessPreflight } from './inputxml-linear-stiffness-preflight-contract.js';

export {
  INPUTXML_LINEAR_B31_CHECK_KEYS,
  INPUTXML_LINEAR_B31_EVALUATION_REQUEST_SCHEMA,
};

export function evaluateInputXmlLinearB31(requestValue) {
  const request = requireInputXmlB31Request(requestValue);
  const solve = requireInputXmlLinearSolvePreparation(request.solvePreparation);
  const preflight = requireInputXmlLinearStiffnessPreflight(request.preflight, solve);
  const codeProfile = requireCodeProfile(request.codeProfile);
  const editionDataset = requireEditionDataset(request.editionDataset);
  const derivedCases = derivedCaseMap(request.derivedCases);
  const definitions = checkMap(request.checks);
  const compiled = new Map();
  const active = new Set();
  const compileById = (checkId) => {
    if (compiled.has(checkId)) return compiled.get(checkId);
    if (active.has(checkId)) fail(
      `InputXML B31 check dependency cycle includes ${checkId}.`,
      'INPUTXML_B31_DEPENDENCY_CYCLE',
    );
    const check = definitions.get(checkId);
    if (!check) fail(
      `InputXML B31 check ${checkId} is missing.`,
      'INPUTXML_B31_CHECK_MISSING',
    );
    active.add(checkId);
    const result = compileCheck({
      check, solve, preflight, derivedCases, codeProfile,
      editionDataset, compileById,
    });
    active.delete(checkId);
    compiled.set(checkId, result);
    return result;
  };
  [...definitions.keys()].sort(compareAscii).forEach(compileById);
  const results = [...compiled.values()].sort(
    (left, right) => compareAscii(left.checkId, right.checkId),
  );
  const bindings = uniqueAscii(results.map((row) => row.derivedCaseId))
    .map((derivedCaseId) => {
      const derived = derivedCases.get(derivedCaseId);
      return {
        derivedCaseId,
        semanticHash: derived.semanticHash,
        evidenceHash: derived.evidenceHash,
        purpose: derived.purpose,
        algebraKind: derived.algebra.kind,
      };
    });
  return sealInputXmlLinearB31Evaluation({
    schema: INPUTXML_LINEAR_B31_EVALUATION_SCHEMA,
    evaluationId: request.evaluationId,
    analysisProfileId: solve.analysisProfileId,
    sourceIdentity: {
      solvePreparationSemanticHash: solve.semanticHash,
      solvePreparationEvidenceHash: solve.evidenceHash,
      structuralPreparationSemanticHash: solve.structuralPreparationSemanticHash,
      preflightSemanticHash: preflight.semanticHash,
      preflightEvidenceHash: preflight.evidenceHash,
      mechanicalModelSemanticHash: preflight.mechanicalModelSemanticHash,
      stiffnessStateHash: preflight.stiffnessStateHash,
    },
    codeAuthorityIdentity: {
      codeProfileSemanticHash: codeProfile.semanticHash,
      editionDatasetSemanticHash: editionDataset.semanticHash,
    },
    derivedCaseBindings: bindings,
    results,
    limitations: uniqueAscii(results.flatMap((row) => row.limitations)),
    status: results.some((row) => row.status === 'CONDITIONAL')
      ? 'CONDITIONAL' : 'QUALIFIED',
    semanticHash: '',
    evidenceHash: '',
  });
}

function compileCheck(context) {
  const { check, solve, preflight, derivedCases, codeProfile,
    editionDataset, compileById } = context;
  const derived = derivedCases.get(check.derivedCaseId);
  if (!derived) fail(
    `InputXML B31 check ${check.checkId} references missing derived case ${check.derivedCaseId}.`,
    'INPUTXML_B31_DERIVED_CASE_MISSING',
  );
  requireInputXmlB31CategoryAlgebra(check.category, derived);
  const station = derived.resultState?.sourceStations.find(
    (row) => row.stationId === check.sourceStationId,
  );
  if (!station || station.elementId !== check.sourceElementId
    || station.internalSectionLocalAction === null) fail(
    `InputXML B31 station ${check.sourceStationId} is missing or has no internal-section action.`,
    'INPUTXML_B31_CODE_STATION_MISSING',
  );
  const approximationCodes = inputXmlB31ApproximationLimitations(derived, station);
  const approval = requireInputXmlB31ApproximationApproval(
    check.approximationApproval, approximationCodes, check.checkId,
  );
  const authorities = resolveInputXmlB31Authorities({
    solvePreparation: solve,
    preflight,
    derivedCase: derived,
    sourceRecoveredCaseId: check.sourceRecoveredCaseId,
    elementId: check.sourceElementId,
  });
  const factorSet = requireStressFactorSet(check.stressFactorSet);
  if (factorSet.componentId !== check.componentId) fail(
    `InputXML B31 stress-factor component ${factorSet.componentId} does not match ${check.componentId}.`,
    'INPUTXML_B31_COMPONENT_MISMATCH',
  );
  const pressure = resolveInputXmlB31Pressure(
    check.category, derived, authorities.sectionResolution, check.sourceElementId,
  );
  const sustainedStress = sustainedStressFor(check, compileById);
  const codeResult = compileCodeResult({
    codeProfile,
    editionDataset,
    stressFactorSet: factorSet,
    category: check.category,
    codePointId: codePointId(station),
    componentId: check.componentId,
    combinationId: derived.derivedCaseId,
    frameElementRecord: authorities.frameElement,
    sectionResolution: authorities.sectionResolution,
    sustainedSectionResolution: check.sustainedSectionResolution,
    materialResolution: authorities.materialResolution,
    localAction: station.internalSectionLocalAction,
    pressureStressContribution: pressure.contribution,
    coldTemperature: check.coldTemperature,
    sustainedStress,
    occasionalCategoryId: check.occasionalCategoryId,
  });
  const limitations = uniqueAscii([
    ...approximationCodes,
    ...(approval === null ? [] : ['INPUTXML_B31_APPROXIMATION_EXPLICITLY_APPROVED']),
    ...codeResult.limitations.map((row) => row.code),
  ]);
  return {
    checkId: check.checkId,
    category: check.category,
    derivedCaseId: derived.derivedCaseId,
    derivedCaseSemanticHash: derived.semanticHash,
    sourceStationId: station.stationId,
    sourceElementId: station.elementId,
    sourceRecoveredCaseId: authorities.source.recoveredCaseId,
    sourceRecoverySemanticHash: authorities.source.recoveredCaseSemanticHash,
    stationCustodyHash: semanticHash(station),
    authorityIdentity: {
      frameElementSemanticHash: authorities.frameElement.semanticHash,
      sectionResolutionSemanticHash: authorities.sectionResolution.semanticHash,
      materialResolutionSemanticHash: authorities.materialResolution.semanticHash,
      stressFactorSetSemanticHash: factorSet.semanticHash,
      sustainedSectionResolutionSemanticHash:
        check.sustainedSectionResolution?.semanticHash ?? 'NONE',
      approximationApprovalHash: approval === null ? 'NONE' : semanticHash(approval),
    },
    pressureCustodyIds: pressure.custodyIds,
    pressureStressContribution: pressure.contribution,
    codeResult,
    limitations,
    status: approval !== null || codeResult.status === 'CONDITIONAL'
      ? 'CONDITIONAL' : 'QUALIFIED',
  };
}

function sustainedStressFor(check, compileById) {
  if (check.category !== EXPANSION_RANGE_ENVELOPE) {
    if (check.sustainedCheckId !== null) fail(
      `${check.checkId}.sustainedCheckId is only valid for expansion envelopes.`,
      'INPUTXML_B31_SUSTAINED_DEPENDENCY_INVALID',
    );
    return null;
  }
  if (check.sustainedCheckId === null) fail(
    `${check.checkId} requires a governed sustained check.`,
    'INPUTXML_B31_SUSTAINED_DEPENDENCY_REQUIRED',
  );
  const sustained = compileById(check.sustainedCheckId);
  if (sustained.category !== SUSTAINED
    || sustained.sourceStationId !== check.sourceStationId
    || sustained.sourceElementId !== check.sourceElementId) fail(
    `${check.checkId} sustained dependency must evaluate the same code station.`,
    'INPUTXML_B31_SUSTAINED_DEPENDENCY_INVALID',
  );
  return {
    value: sustained.codeResult.calculatedStress,
    source: `INPUTXML-B31-SUSTAINED:${sustained.codeResult.semanticHash}`,
  };
}

function derivedCaseMap(values) {
  const result = new Map();
  values.forEach((value) => {
    const derived = requireInputXmlLinearDerivedCase(value);
    if (result.has(derived.derivedCaseId)) fail(
      `Derived case ${derived.derivedCaseId} is duplicated.`,
      'INPUTXML_B31_DUPLICATE',
    );
    result.set(derived.derivedCaseId, derived);
  });
  return result;
}

function checkMap(values) {
  const result = new Map();
  values.forEach((value, index) => {
    const check = requireInputXmlB31Check(value, index);
    if (result.has(check.checkId)) fail(
      `InputXML B31 check ${check.checkId} is duplicated.`,
      'INPUTXML_B31_DUPLICATE',
    );
    result.set(check.checkId, check);
  });
  return result;
}

function codePointId(station) {
  return `IXCP-${semanticHash({
    stationId: station.stationId,
    sourceRecordSemanticHash: station.sourceRecordSemanticHash,
  }).slice(8)}`;
}

export { requireInputXmlLinearB31Evaluation };
