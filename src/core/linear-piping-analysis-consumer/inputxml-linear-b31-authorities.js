import { compileInputXmlCaseElementAuthorities } from './inputxml-linear-case-elements.js';
import { requireInputXmlLinearDerivedCase } from './inputxml-linear-derived-case-contract.js';
import { inputXmlB31Failure as fail } from './inputxml-linear-b31-error.js';
import { requireInputXmlLinearSolvePreparation } from './inputxml-linear-solve-preparation-contract.js';
import { requireInputXmlLinearStiffnessPreflight } from './inputxml-linear-stiffness-preflight-contract.js';
import { inputXmlStiffnessFrameElementProfile } from './inputxml-linear-stiffness-profile.js';

export function resolveInputXmlB31Authorities(request) {
  const solve = requireInputXmlLinearSolvePreparation(request.solvePreparation);
  const preflight = requireInputXmlLinearStiffnessPreflight(
    request.preflight,
    solve,
  );
  const derived = requireInputXmlLinearDerivedCase(request.derivedCase);
  requireContext(derived, solve, preflight);
  const source = derived.sourceCases.find(
    (row) => row.recoveredCaseId === request.sourceRecoveredCaseId,
  );
  if (!source) fail(
    `Derived case ${derived.derivedCaseId} does not cite recovered case ${request.sourceRecoveredCaseId}.`,
    'INPUTXML_B31_SOURCE_RECOVERY_MISSING',
  );
  const physicalCase = solve.physicalCases.find((row) => row.caseId === source.caseId);
  if (!physicalCase
    || physicalCase.loadCase.semanticHash !== source.physicalLoadCaseSemanticHash
    || physicalCase.loadCase.evidenceHash !== source.physicalLoadCaseEvidenceHash) fail(
    `Recovered source ${source.recoveredCaseId} is stale for solve preparation.`,
    'INPUTXML_B31_SOURCE_RECOVERY_STALE',
  );
  const compiled = compileInputXmlCaseElementAuthorities({
    structuralPreparation: solve.structuralPreparation,
    frameProfile: inputXmlStiffnessFrameElementProfile(),
    physicalCase: physicalCase.loadCase,
    stiffnessElementLedger: preflight.elementLedger,
  });
  const frameElement = compiled.frameElements.find(
    (row) => row.elementId === request.elementId,
  );
  if (!frameElement) fail(
    `Element ${request.elementId} is unavailable in source recovered case ${source.recoveredCaseId}.`,
    'INPUTXML_B31_ELEMENT_MISSING',
  );
  const resultElement = derived.resultState?.elementResults.find(
    (row) => row.elementId === request.elementId,
  );
  const sourceAuthority = resultElement?.sourceElementAuthorities.find(
    (row) => row.recoveredCaseId === source.recoveredCaseId,
  );
  if (!sourceAuthority
    || sourceAuthority.frameElementSemanticHash !== frameElement.semanticHash) fail(
    `Element ${request.elementId} authority differs from the retained derived-case ledger.`,
    'INPUTXML_B31_ELEMENT_AUTHORITY_MISMATCH',
  );
  const structural = solve.structuralPreparation;
  const sectionResolution = structural.sectionResolutions.find(
    (row) => row.semanticHash === frameElement.section.resolutionSemanticHash,
  );
  const materialResolution = structural.materialResolutions.find(
    (row) => row.materialState.materialStateId === frameElement.material.materialStateId,
  );
  if (!sectionResolution || !materialResolution) fail(
    `Element ${request.elementId} lacks retained section or material authority.`,
    'INPUTXML_B31_CODE_AUTHORITY_MISSING',
  );
  return {
    solve,
    preflight,
    derived,
    source,
    physicalCase,
    frameElement,
    sectionResolution,
    materialResolution,
    resultElement,
  };
}

function requireContext(derived, solve, preflight) {
  const identity = derived.compatibilityIdentity;
  if (derived.analysisProfileId !== solve.analysisProfileId
    || identity.solvePreparationSemanticHash !== solve.semanticHash
    || identity.structuralPreparationSemanticHash
      !== solve.structuralPreparationSemanticHash
    || identity.preflightSemanticHash !== preflight.semanticHash
    || identity.mechanicalModelSemanticHash !== preflight.mechanicalModelSemanticHash
    || identity.stiffnessStateHash !== preflight.stiffnessStateHash) fail(
    `Derived case ${derived.derivedCaseId} is stale for the supplied preparation or preflight.`,
    'INPUTXML_B31_CONTEXT_STALE',
  );
}
