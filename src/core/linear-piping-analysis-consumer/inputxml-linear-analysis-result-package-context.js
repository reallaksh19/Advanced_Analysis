import { requireInputXmlLinearModelHealth } from './inputxml-model-health-contract.js';
import { requireInputXmlLinearSolvePreparation } from './inputxml-linear-solve-preparation-contract.js';
import { requireInputXmlLinearStiffnessPreflight } from './inputxml-linear-stiffness-preflight-contract.js';
import { inputXmlAnalysisResultPackageFailure as fail } from './inputxml-linear-analysis-result-package-error.js';

export function requirePackageContext(value) {
  const health = requireInputXmlLinearModelHealth(value.modelHealth);
  const solve = requireInputXmlLinearSolvePreparation(value.solvePreparation);
  const preflight = requireInputXmlLinearStiffnessPreflight(value.preflight, solve);
  if (value.analysisProfileId !== solve.analysisProfileId
    || value.analysisProfileId !== preflight.analysisProfileId
    || solve.modelHealthSemanticHash !== health.semanticHash
    || solve.modelHealthEvidenceHash !== health.evidenceHash
    || solve.sourceBundleSemanticHash !== health.sourceBundleSemanticHash
    || solve.sourceBundleEvidenceHash !== health.sourceBundleEvidenceHash) fail(
    'InputXML result package source or preparation ancestry is stale.',
    'INPUTXML_RESULT_PACKAGE_CONTEXT_STALE',
  );
  requireSourceIdentity(value.sourceIdentity, health, solve, preflight);
  return { health, solve, preflight };
}

function requireSourceIdentity(identity, health, solve, preflight) {
  const expected = {
    sourceBundleSemanticHash: health.sourceBundleSemanticHash,
    sourceBundleEvidenceHash: health.sourceBundleEvidenceHash,
    topologySemanticHash: health.topologySemanticHash,
    topologyEvidenceHash: health.topologyEvidenceHash,
    modelHealthSemanticHash: health.semanticHash,
    modelHealthEvidenceHash: health.evidenceHash,
    solvePreparationSemanticHash: solve.semanticHash,
    solvePreparationEvidenceHash: solve.evidenceHash,
    preflightSemanticHash: preflight.semanticHash,
    preflightEvidenceHash: preflight.evidenceHash,
  };
  if (Object.entries(expected).some(([key, entry]) => identity[key] !== entry)) fail(
    'InputXML result package source identity is inconsistent.',
    'INPUTXML_RESULT_PACKAGE_CONTEXT_STALE',
  );
}
