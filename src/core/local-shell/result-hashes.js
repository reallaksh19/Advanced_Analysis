import { semanticHash, strictClone } from './json.js';

export function reconstructShellResultHashes(result) {
  const cloned = strictClone(result);
  delete cloned.semanticHashes;
  return {
    sourceEvidenceSemanticHash: sourceEvidenceHash(cloned),
    canonicalModelSemanticHash: cloned.canonicalModelSemanticHash,
    loadCaseInputSemanticHash: loadCaseInputHash(cloned),
    resultPayloadSemanticHash: semanticHash(cloned),
    executionEvidenceHash: executionEvidenceHash(cloned),
    qualificationEvidenceHash: qualificationEvidenceHash(cloned),
  };
}

function sourceEvidenceHash(result) {
  const references = result.meshEvidence
    ? unique(result.meshEvidence.elements.flatMap((element) => element.sourceReferences))
    : [];
  return semanticHash({
    modelIdentity: result.modelIdentity,
    modelVersion: result.modelVersion,
    sourceAncestry: result.sourceAncestry,
    sourceReferences: references,
  });
}

function loadCaseInputHash(result) {
  const inputs = result.loadCaseResults
    ? result.loadCaseResults.map((row) => ({
      loadCaseId: row.loadCaseId,
      contributions: row.appliedLoadEvidence.contributions,
    }))
    : [];
  return semanticHash(inputs);
}

function executionEvidenceHash(result) {
  const mesh = result.meshEvidence ? {
    dofOrdering: result.meshEvidence.dofOrdering,
    globalStiffness: result.meshEvidence.globalStiffness,
    elementEvidence: result.meshEvidence.elements.map((element) => ({
      elementId: element.elementId,
      membraneBMatrix: element.membraneBMatrix,
      dktIntegrationPoints: element.dktIntegrationPoints,
      membraneStiffness: element.membraneStiffness,
      bendingStiffness: element.bendingStiffness,
      transformation: element.nodalBasisTransformation,
      globalStiffness: element.globalStiffness,
      formulaIds: element.formulaIds,
    })),
  } : null;
  const cases = result.loadCaseResults ? result.loadCaseResults.map((row) => ({
    loadCaseId: row.loadCaseId,
    solverEvidence: row.solverEvidence,
    formulaIds: row.formulaIds,
  })) : [];
  return semanticHash({ formulaTrace: result.formulaTrace, mesh, cases });
}

function qualificationEvidenceHash(result) {
  const mesh = result.meshEvidence ? {
    nodeBasisQualification: result.meshEvidence.nodeBasisQualification,
    globalStiffnessSymmetry: result.meshEvidence.globalStiffnessSymmetry,
    elementQualification: result.meshEvidence.elements.map((element) => ({
      elementId: element.elementId,
      areaQualification: element.areaQualification,
      directorAlignment: element.directorAlignment,
      qualification: element.qualification,
    })),
  } : null;
  const cases = result.loadCaseResults ? result.loadCaseResults.map((row) => ({
    loadCaseId: row.loadCaseId,
    qualification: row.qualification,
    freeDofResidualQualification: row.freeDofResidualQualification,
    forceEquilibrium: row.forceEquilibrium,
    momentEquilibrium: row.momentEquilibrium,
    energyQualification: row.energyQualification,
  })) : [];
  return semanticHash({ qualification: result.qualification, mesh, cases });
}

function unique(values) {
  return [...new Set(values)].sort();
}
