import { compareCanonicalIds } from './identifiers.js';

function copyArray(value) {
  return Array.isArray(value) ? value.map((entry) => cloneValue(entry)) : value;
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
  }
  return value;
}

function compareOptionalCanonical(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  if (a === b) return 0;
  if (a === '') return -1;
  if (b === '') return 1;
  return compareCanonicalIds(a, b);
}

function byFields(...fields) {
  return (left, right) => {
    for (const field of fields) {
      const compared = compareOptionalCanonical(left[field], right[field]);
      if (compared !== 0) return compared;
    }
    return 0;
  };
}

export function canonicalizeSourceEvidence(sourceEvidence) {
  return copyArray(sourceEvidence).sort(byFields(
    'sourceId',
    'sourceRevision',
    'sourceSemanticHash',
  ));
}

export function canonicalizeDiagnostics(diagnostics) {
  return copyArray(diagnostics)
    .map((diagnostic) => ({
      ...diagnostic,
      evidence: canonicalizeSourceEvidence(diagnostic.evidence),
      qualificationEvidenceIds: copyArray(diagnostic.qualificationEvidenceIds)
        .sort(compareOptionalCanonical),
    }))
    .sort(byFields('severity', 'code', 'entityType', 'entityId'));
}

export function canonicalizeLinearFeaModel(candidate) {
  const model = cloneValue(candidate);
  model.nodes = copyArray(model.nodes)
    .map((node) => ({
      ...node,
      sourceAncestry: {
        ...node.sourceAncestry,
        sourceNodeIds: copyArray(node.sourceAncestry.sourceNodeIds).sort(compareOptionalCanonical),
        sourceComponentIds: copyArray(node.sourceAncestry.sourceComponentIds).sort(compareOptionalCanonical),
      },
    }))
    .sort(byFields('nodeId'));
  model.materialStates = copyArray(model.materialStates)
    .map((state) => ({ ...state, sourceEvidence: canonicalizeSourceEvidence(state.sourceEvidence) }))
    .sort(byFields('materialStateId'));
  model.sectionStates = copyArray(model.sectionStates)
    .map((state) => ({ ...state, sourceEvidence: canonicalizeSourceEvidence(state.sourceEvidence) }))
    .sort(byFields('sectionStateId'));
  model.elements = copyArray(model.elements).sort(byFields('elementId'));
  model.constraints = copyArray(model.constraints).sort(byFields('constraintId'));
  model.limitations = copyArray(model.limitations).sort(byFields('code'));
  model.diagnostics = canonicalizeDiagnostics(model.diagnostics);
  return model;
}
