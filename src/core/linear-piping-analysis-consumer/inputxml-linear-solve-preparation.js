import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { requireInputXmlLinearModelHealth } from './inputxml-model-health-contract.js';
import {
  requireInputXmlLinearLoadPreparationProfile,
  resolveInputXmlGravityDirection,
} from './inputxml-linear-load-profile.js';
import { compileInputXmlPhysicalCases } from './inputxml-linear-physical-cases.js';
import { compileInputXmlSourceLoadAuthorities } from './inputxml-linear-source-load-authority.js';
import {
  INPUTXML_LINEAR_SOLVE_PREPARATION_SCHEMA,
  sealInputXmlLinearSolvePreparation,
} from './inputxml-linear-solve-preparation-contract.js';
import {
  prepareInputXmlLinearStructure,
} from './inputxml-linear-structural-preparation.js';
import {
  requireInputXmlLinearStructuralPreparation,
} from './inputxml-linear-structural-preparation-contract.js';
import { compileInputXmlWeightAuthorities } from './inputxml-linear-weight-authority.js';

export function prepareInputXmlLinearSolve(healthContext, analysisProfileId, options) {
  const accepted = options ?? {};
  const report = requireInputXmlLinearModelHealth(
    healthContext?.report,
    healthContext?.sourceBundle,
    healthContext?.topology,
  );
  const loadProfile = requireInputXmlLinearLoadPreparationProfile(analysisProfileId);
  const structuralPreparation = accepted.structuralPreparation
    ? requireInputXmlLinearStructuralPreparation(accepted.structuralPreparation, healthContext)
    : prepareInputXmlLinearStructure(healthContext, analysisProfileId, accepted);
  if (structuralPreparation.analysisProfileId !== analysisProfileId) {
    throw new TypeError('InputXML structural and load preparation profiles must match.');
  }
  const gravityDirection = resolveInputXmlGravityDirection(accepted.gravityDirection);
  const weightAuthorities = compileInputXmlWeightAuthorities({
    sourceBundle: healthContext.sourceBundle,
    structuralPreparation,
    gravityDirection,
  });
  const sourceAuthorities = compileInputXmlSourceLoadAuthorities({
    sourceBundle: healthContext.sourceBundle,
    structuralPreparation,
    loadProfile,
  });
  const physical = compileInputXmlPhysicalCases({
    report,
    structuralPreparation,
    loadProfile,
    weightAuthorities,
    sourceAuthorities,
  });
  const limitations = uniqueAscii([
    ...structuralPreparation.limitations,
    ...physical.physicalCases.flatMap((row) => row.loadCase.limitations.map((item) => item.code)),
    ...physical.loadLedger.map((row) => row.limitationCode),
  ].filter(Boolean));

  return sealInputXmlLinearSolvePreparation({
    schema: INPUTXML_LINEAR_SOLVE_PREPARATION_SCHEMA,
    preparationId: `IXSP-${semanticHash({
      structure: structuralPreparation.semanticHash,
      profile: analysisProfileId,
      cases: physical.physicalCases.map((row) => row.loadCase.semanticHash),
    })}`,
    analysisProfileId,
    sourceBundleSemanticHash: healthContext.sourceBundle.semanticHash,
    sourceBundleEvidenceHash: healthContext.sourceBundle.evidenceHash,
    modelHealthSemanticHash: report.semanticHash,
    modelHealthEvidenceHash: report.evidenceHash,
    structuralPreparationSemanticHash: structuralPreparation.semanticHash,
    structuralPreparationEvidenceHash: structuralPreparation.evidenceHash,
    loadCaseProfileSemanticHash: physical.loadCaseProfile.semanticHash,
    structuralPreparation,
    physicalCases: physical.physicalCases,
    loadLedger: physical.loadLedger,
    limitations,
    summary: summaryOf(physical.physicalCases, physical.loadLedger, limitations),
    executionAvailability: {
      stiffnessPreflight: 'NOT_IMPLEMENTED',
      factorizationHandle: 'NOT_CREATED',
      solveExecution: 'NOT_AUTHORIZED',
    },
  });
}

function summaryOf(cases, ledger, limitations) {
  const roles = countBy(cases, 'caseRole');
  const dispositions = countBy(ledger, 'disposition');
  return Object.freeze({
    physicalCaseCount: cases.length,
    loadLedgerCount: ledger.length,
    compiledPrimitiveCount: new Set(cases.flatMap((row) => row.primitiveIds)).size,
    activeLedgerCount: ledger.filter((row) => row.disposition !== 'INACTIVE').length,
    inactiveLedgerCount: dispositions.INACTIVE ?? 0,
    limitedLedgerCount: dispositions.COMPILED_WITH_DECLARED_LIMITATION ?? 0,
    forceMomentCaseCount: roles.APPLIED_FORCE_MOMENT ?? 0,
    operatingCaseCount: (roles.WEIGHT_TEMPERATURE ?? 0)
      + (roles.WEIGHT_PRESSURE_TEMPERATURE ?? 0),
    pressureCaseCount: (roles.WEIGHT_PRESSURE ?? 0)
      + (roles.WEIGHT_PRESSURE_TEMPERATURE ?? 0),
    limitationCount: limitations.length,
    physicalLoadCaseHashes: Object.freeze(cases.map((row) => row.loadCase.physicalLoadCaseHash)),
  });
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) counts[row[key]] = (counts[row[key]] ?? 0) + 1;
  return counts;
}

function uniqueAscii(values) {
  return [...new Set(values.map(String))].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}
