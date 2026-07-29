import { compareCanonicalIds } from './identifiers.js';

function copyArray(value) {
  return Array.isArray(value) ? value.map((entry) => cloneValue(entry)) : [];
}

function cloneValue(value) {
  if (Array.isArray(value)) return value.map((entry) => cloneValue(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
  }
  return value;
}

function compareAsciiStrings(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
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

function byFields(...fields) {
  return (left, right) => {
    for (const field of fields) {
      const compared = compareAsciiStrings(left[field], right[field]);
      if (compared !== 0) return compared;
    }
    return 0;
  };
}

function byCanonicalField(field) {
  return (left, right) => compareCanonicalIds(left[field], right[field]);
}

export function canonicalizeSourceEvidence(sourceEvidence) {
  return copyArray(sourceEvidence).sort(byFields(
    'sourceId',
    'sourceRevision',
    'sourceSemanticHash',
  ));
}

export function canonicalizeDiagnosticEvidence(evidence) {
  return copyArray(evidence).sort(byFields(
    'evidenceId',
    'sourceId',
    'sourceRevision',
    'sourceSemanticHash',
  ));
}

export function canonicalizeDiagnostics(diagnostics) {
  return copyArray(diagnostics)
    .map((diagnostic) => ({
      ...diagnostic,
      evidence: canonicalizeDiagnosticEvidence(diagnostic.evidence),
      qualificationEvidenceIds: copyArray(diagnostic.qualificationEvidenceIds)
        .sort(compareCanonicalIds),
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
        sourceNodeIds: copyArray(node.sourceAncestry.sourceNodeIds).sort(compareCanonicalIds),
        sourceComponentIds: copyArray(node.sourceAncestry.sourceComponentIds).sort(compareCanonicalIds),
      },
    }))
    .sort(byCanonicalField('nodeId'));
  model.materialStates = copyArray(model.materialStates)
    .map((state) => ({ ...state, sourceEvidence: canonicalizeSourceEvidence(state.sourceEvidence) }))
    .sort(byCanonicalField('materialStateId'));
  model.sectionStates = copyArray(model.sectionStates)
    .map((state) => ({ ...state, sourceEvidence: canonicalizeSourceEvidence(state.sourceEvidence) }))
    .sort(byCanonicalField('sectionStateId'));
  model.elements = copyArray(model.elements).sort(byCanonicalField('elementId'));
  model.constraints = copyArray(model.constraints).sort(byCanonicalField('constraintId'));
  model.limitations = copyArray(model.limitations).sort(byCanonicalField('code'));
  model.diagnostics = canonicalizeDiagnostics(model.diagnostics);
  return model;
}
