import {
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_REQUEST_SCHEMA,
  computePipeSectionRequestSemanticHash,
} from '../src/core/linear-fea-section/index.js';

export const NPS6_LIKE_EXPECTED = Object.freeze({
  outerDiameter: 0.1683,
  wallThickness: 0.00711,
  innerDiameter: 0.15408,
  area: 0.0036004565040065067,
  secondMomentY: 0.00001171623119787297,
  secondMomentZ: 0.00001171623119787297,
  polarMoment: 0.00002343246239574594,
});

export const THICK_WALL_EXPECTED = Object.freeze({
  outerDiameter: 0.100,
  wallThickness: 0.010,
  innerDiameter: 0.080,
  area: 0.002827433388230814,
  secondMomentY: 0.0000028981192229365843,
  secondMomentZ: 0.0000028981192229365843,
  polarMoment: 0.000005796238445873169,
});

export const SOURCE_EVIDENCE = Object.freeze({
  sourceId: 'PROJECT/PIPE-CATALOGUE',
  sourceRevision: 'Rev 4',
  sourceSemanticHash: 'fnv1a64:0123456789abcdef',
});

export function pipeSectionRequest(overrides = {}) {
  const payload = {
    schema: PIPE_SECTION_REQUEST_SCHEMA,
    sectionStateId: 'SEC-NPS6-SCH40',
    formulationId: PIPE_SECTION_FORMULATION_ID,
    outerDiameter: NPS6_LIKE_EXPECTED.outerDiameter,
    wallThickness: NPS6_LIKE_EXPECTED.wallThickness,
    sourceEvidence: { ...SOURCE_EVIDENCE },
    ...overrides,
  };
  if (overrides.sourceEvidence) payload.sourceEvidence = { ...overrides.sourceEvidence };
  return {
    ...payload,
    semanticHash: computePipeSectionRequestSemanticHash(payload),
  };
}
