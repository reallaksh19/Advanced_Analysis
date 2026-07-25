import { semanticHash } from '../shared-piping-model/index.js';
import { TRANSFORMATION_EVIDENCE_SCHEMA } from './constants.js';
export function sourceSemanticHash(sourceEvidence) { return semanticHash(sourceEvidence); }
export function transformationEvidence(model) {
  return {
    schema: TRANSFORMATION_EVIDENCE_SCHEMA,
    sourceSemanticHash: model.sourceAncestry.sourceSemanticHash,
    adapterIdentity: model.sourceAncestry.adapterIdentity,
    adapterVersion: model.sourceAncestry.adapterVersion,
    units: model.units,
    sourceReferences: collectSourceReferences(model.sourceEvidence),
  };
}
export function transformationEvidenceHash(model) { return semanticHash(transformationEvidence(model)); }
export function canonicalModelPayload(model) {
  const ancestry = { ...model.sourceAncestry };
  delete ancestry.canonicalModelSemanticHash;
  const payload = { ...model, sourceAncestry: ancestry };
  delete payload.semanticHash;
  return payload;
}
export function canonicalModelSemanticHash(model) { return semanticHash(canonicalModelPayload(model)); }
export function collectSourceReferences(value, found = new Set()) {
  if (Array.isArray(value)) value.forEach((child) => collectSourceReferences(child, found));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, child]) => {
      if (key === 'sourceRef') found.add(child);
      else collectSourceReferences(child, found);
    });
  }
  return [...found].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}
