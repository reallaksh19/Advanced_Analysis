import { semanticHash } from '../shared-piping-model/canonical-json.js';

export const INPUTXML_INLINE_REDUCER_TRANSITIONS_SCHEMA =
  'fea-inputxml-inline-reducer-transitions/v1';

/**
 * Detect source-order, degree-2 inline pipe section transitions. A transition
 * is evidence of a reducer location, not evidence of a finite reducer length
 * or of CAESAR's internal stiffness representation. Therefore this detector
 * never activates condensation by itself.
 */
export function detectInputXmlInlineReducerTransitions({
  canonicalGeometry,
  relativeTolerance = 1e-9,
}) {
  requireGeometry(canonicalGeometry);
  if (!(typeof relativeTolerance === 'number' && Number.isFinite(relativeTolerance) && relativeTolerance >= 0)) {
    throw new TypeError('relativeTolerance must be a finite nonnegative number.');
  }
  const degreeByNode = new Map(canonicalGeometry.nodes.map((node) => [String(node.id), 0]));
  for (const segment of canonicalGeometry.segments) {
    increment(degreeByNode, segment.startNodeId);
    increment(degreeByNode, segment.endNodeId);
  }
  const ordered = [...canonicalGeometry.segments]
    .filter(hasPhysicalSection)
    .sort((left, right) => sourceIndex(left) - sourceIndex(right));
  const transitions = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const upstream = ordered[index - 1];
    const downstream = ordered[index];
    const nodeId = String(downstream.startNodeId);
    if (String(upstream.endNodeId) !== nodeId) continue;
    if (degreeByNode.get(nodeId) !== 2) continue;
    const outerDiameterChanged = differs(upstream.diameter, downstream.diameter, relativeTolerance);
    const wallThicknessChanged = differs(upstream.thickness, downstream.thickness, relativeTolerance);
    if (!outerDiameterChanged && !wallThicknessChanged) continue;
    const draft = {
      transitionId: `INLINE-REDUCER@${nodeId}`,
      nodeId,
      upstreamSegmentId: String(upstream.id),
      downstreamSegmentId: String(downstream.id),
      fromSection: Object.freeze({ outerDiameter: upstream.diameter, wallThickness: upstream.thickness }),
      toSection: Object.freeze({ outerDiameter: downstream.diameter, wallThickness: downstream.thickness }),
      changedFields: Object.freeze([
        ...(outerDiameterChanged ? ['outerDiameter'] : []),
        ...(wallThicknessChanged ? ['wallThickness'] : []),
      ]),
      sourceOrder: Object.freeze({ upstream: sourceIndex(upstream), downstream: sourceIndex(downstream) }),
      condensationActivation: Object.freeze({
        status: 'BLOCKED_PENDING_FINITE_REDUCER_GEOMETRY_AND_PARITY',
        reducerLength: null,
        samplingRule: null,
        reasonCodes: Object.freeze([
          'INLINE_REDUCER_LENGTH_NOT_DECLARED',
          'TEN_CYLINDER_STIFFNESS_PARITY_NOT_ESTABLISHED',
          'SECTION_SAMPLING_RULE_NOT_QUALIFIED',
        ]),
      }),
    };
    transitions.push(Object.freeze({ ...draft, semanticHash: semanticHash(draft) }));
  }
  const result = {
    schema: INPUTXML_INLINE_REDUCER_TRANSITIONS_SCHEMA,
    geometrySemanticHash: semanticHash(geometryProjection(canonicalGeometry)),
    transitionCount: transitions.length,
    transitions: Object.freeze(transitions),
    policy: Object.freeze({
      detectFromInlineSectionChange: true,
      inferFiniteLength: false,
      activateCondensationWithoutIndependentEvidence: false,
      fitToBenchmarkOutput: false,
    }),
  };
  return Object.freeze({ ...result, semanticHash: semanticHash(result) });
}

function hasPhysicalSection(segment) {
  return Number.isFinite(segment.diameter) && segment.diameter > 0
    && Number.isFinite(segment.thickness) && segment.thickness > 0;
}
function sourceIndex(segment) {
  const value = segment.meta?.sourceIndex;
  return Number.isInteger(value) ? value : Number.MAX_SAFE_INTEGER;
}
function increment(map, nodeId) {
  const id = String(nodeId);
  map.set(id, (map.get(id) ?? 0) + 1);
}
function differs(left, right, tolerance) {
  const scale = Math.max(Math.abs(left), Math.abs(right), Number.MIN_VALUE);
  return Math.abs(left - right) > tolerance * scale;
}
function requireGeometry(value) {
  if (!value || value.unit !== 'm' || !Array.isArray(value.nodes) || !Array.isArray(value.segments)) {
    throw new TypeError('canonicalGeometry must be normalized to metres and carry nodes/segments.');
  }
}
function geometryProjection(geometry) {
  const { diagnostics: _diagnostics, summary: _summary, valid: _valid, ...rest } = geometry;
  return rest;
}
