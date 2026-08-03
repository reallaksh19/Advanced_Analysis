import {
  computeLoadCaseEvidenceHash,
  computeLoadCaseSemanticHash,
  computePhysicalLoadCaseHash,
  requirePhysicalLoadCase,
} from '../linear-fea-load-case/index.js';
import { compareAscii, failLinearPipingAnalysis } from './validation.js';

export const GRAVITY_PIPE_WALL_EXPANSION_ID = 'LFEA-M007-GRAVITY-PIPE-WALL-UDL-V1';

export function gravityDerivation({
  acceptedCompilation,
  gravity,
  element,
  material,
  section,
  density,
  area,
  acceleration,
  lineWeight,
  intensity,
}) {
  return {
    schema: 'lfea-m007-gravity-pipe-wall-derivation/v1',
    expansionId: GRAVITY_PIPE_WALL_EXPANSION_ID,
    compilationSemanticHash: acceptedCompilation.semanticHash,
    mechanicalModelSemanticHash: acceptedCompilation.mechanicalModelSemanticHash,
    gravity: {
      primitiveId: gravity.primitiveId,
      semanticHash: gravity.semanticHash,
      sourceEvidence: gravity.sourceEvidence,
      direction: gravity.direction,
      accelerationMagnitude: gravity.accelerationMagnitude,
    },
    element: {
      elementId: element.elementId,
      materialStateId: element.materialStateId,
      sectionStateId: element.sectionStateId,
      sourceAncestry: element.sourceAncestry,
    },
    material: {
      materialStateId: material.materialStateId,
      massDensity: density,
      sourceEvidence: material.sourceEvidence,
    },
    section: {
      sectionStateId: section.sectionStateId,
      area,
      sourceEvidence: section.sourceEvidence,
    },
    lineWeight,
    intensity,
  };
}

export function expandLoadCase(loadCase, generatedPrimitives) {
  const primitives = [...loadCase.primitives, ...generatedPrimitives]
    .sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  const diagnostics = [
    ...loadCase.diagnostics,
    ...generatedPrimitives.map((primitive) => ({
      severity: 'INFO',
      code: 'LOAD_CASE_GRAVITY_PIPE_WALL_EXPANDED',
      entityType: 'LOAD_PRIMITIVE',
      entityId: primitive.primitiveId,
      message: `PIPE_WALL gravity expanded deterministically to a uniform distributed load on element ${primitive.elementId}.`,
      evidence: [{
        evidenceId: 'GRAVITY-PIPE-WALL-DERIVATION',
        sourceId: primitive.sourceEvidence.sourceId,
        sourceRevision: primitive.sourceEvidence.sourceRevision,
        sourceSemanticHash: primitive.sourceEvidence.sourceSemanticHash,
      }],
      qualificationEvidenceIds: ['LFEA-M007'],
    })),
  ].sort((left, right) => {
    const entity = compareAscii(left.entityId, right.entityId);
    return entity !== 0 ? entity : compareAscii(left.code, right.code);
  });
  const draft = {
    ...loadCase,
    primitives,
    diagnostics,
    physicalLoadCaseHash: '',
    semanticHash: '',
    evidenceHash: '',
  };
  draft.physicalLoadCaseHash = computePhysicalLoadCaseHash(draft);
  draft.semanticHash = computeLoadCaseSemanticHash(draft);
  draft.evidenceHash = computeLoadCaseEvidenceHash(draft);
  return requirePhysicalLoadCase(draft);
}

export function groupByElement(primitives) {
  const result = new Map();
  for (const primitive of primitives) {
    const entries = result.get(primitive.elementId) ?? [];
    entries.push(primitive);
    result.set(primitive.elementId, entries);
  }
  for (const entries of result.values()) {
    entries.sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  }
  return result;
}

export function requirePositiveFinite(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) {
    failLinearPipingAnalysis(
      `${field} must be positive and finite for PIPE_WALL gravity expansion.`,
      'PIPING_ANALYSIS_GRAVITY_PROPERTY_INVALID',
      { field, value },
    );
  }
  return value;
}

export function cleanNumber(value) {
  if (!Number.isFinite(value)) {
    failLinearPipingAnalysis(
      'PIPE_WALL gravity intensity is not finite.',
      'PIPING_ANALYSIS_GRAVITY_INTENSITY_INVALID',
      { value },
    );
  }
  return Object.is(value, -0) ? 0 : value;
}
