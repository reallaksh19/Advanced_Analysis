import { normalizeLinearFeaNumber } from '../linear-fea-contract/conventions.js';

export function compareMaterialText(left, right) {
  const a = String(left);
  const b = String(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = a.charCodeAt(index) - b.charCodeAt(index);
    if (difference < 0) return -1;
    if (difference > 0) return 1;
  }
  if (a.length < b.length) return -1;
  if (a.length > b.length) return 1;
  return 0;
}

export function canonicalizeMaterialPoints(points) {
  return points.map((point) => ({
    absoluteTemperature: normalizeLinearFeaNumber(point.absoluteTemperature),
    elasticModulus: normalizeLinearFeaNumber(point.elasticModulus),
    shearModulus: normalizeLinearFeaNumber(point.shearModulus),
    poissonRatio: normalizeLinearFeaNumber(point.poissonRatio),
    massDensity: normalizeLinearFeaNumber(point.massDensity),
    thermalExpansionCoefficient:
      normalizeLinearFeaNumber(point.thermalExpansionCoefficient),
  })).sort((left, right) => left.absoluteTemperature - right.absoluteTemperature);
}

export function canonicalizeMaterialSourceEvidence(evidence) {
  return {
    sourceId: evidence.sourceId,
    sourceRevision: evidence.sourceRevision,
    sourceSemanticHash: evidence.sourceSemanticHash,
  };
}

export function canonicalizeMaterialTable(table) {
  return {
    schema: table.schema,
    materialId: table.materialId,
    sourceEvidence: canonicalizeMaterialSourceEvidence(table.sourceEvidence),
    points: canonicalizeMaterialPoints(table.points),
    semanticHash: table.semanticHash,
  };
}

export function canonicalizeMaterialDiagnostics(diagnostics) {
  return diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity,
    code: diagnostic.code,
    entityType: diagnostic.entityType,
    entityId: diagnostic.entityId,
    message: diagnostic.message,
    evidence: diagnostic.evidence.map((entry) => ({ ...entry })).sort(compareEvidence),
    qualificationEvidenceIds: [...diagnostic.qualificationEvidenceIds].sort(compareMaterialText),
  })).sort(compareDiagnostic);
}

function compareEvidence(left, right) {
  for (const key of ['sourceId', 'sourceRevision', 'sourceSemanticHash', 'evidenceId']) {
    const difference = compareMaterialText(left[key] ?? '', right[key] ?? '');
    if (difference !== 0) return difference;
  }
  return 0;
}

function compareDiagnostic(left, right) {
  for (const key of ['severity', 'code', 'entityType', 'entityId']) {
    const difference = compareMaterialText(left[key], right[key]);
    if (difference !== 0) return difference;
  }
  return 0;
}
