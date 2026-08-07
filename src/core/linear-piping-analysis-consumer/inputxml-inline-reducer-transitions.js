import { semanticHash } from '../shared-piping-model/canonical-json.js';

export const INPUTXML_INLINE_REDUCER_TRANSITIONS_SCHEMA =
  'fea-inputxml-inline-reducer-transitions/v1';

/**
 * Detect degree-2 inline pipe section transitions from topology rather than
 * XML row adjacency. A transition is evidence of a reducer location, not
 * evidence of a finite reducer length or of CAESAR's internal stiffness
 * representation. Therefore this detector never activates condensation alone.
 */
export function detectInputXmlInlineReducerTransitions({
  canonicalGeometry,
  relativeTolerance = 1e-9,
}) {
  requireGeometry(canonicalGeometry);
  if (!(typeof relativeTolerance === 'number' && Number.isFinite(relativeTolerance) && relativeTolerance >= 0)) {
    throw new TypeError('relativeTolerance must be a finite nonnegative number.');
  }
  const incidentByNode = new Map(canonicalGeometry.nodes.map((node) => [String(node.id), []]));
  for (const segment of canonicalGeometry.segments) {
    pushIncident(incidentByNode, segment.startNodeId, segment);
    pushIncident(incidentByNode, segment.endNodeId, segment);
  }

  const transitions = [];
  for (const [nodeId, incident] of [...incidentByNode.entries()].sort(([a], [b]) => compareAscii(a, b))) {
    if (incident.length !== 2 || !incident.every(hasPhysicalSection)) continue;
    const ordered = [...incident].sort((left, right) => sourceIndex(left) - sourceIndex(right));
    const upstream = ordered[0];
    const downstream = ordered[1];
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
      topology: Object.freeze({ nodeDegree: 2, incidentSegmentIds: Object.freeze(ordered.map((row) => String(row.id))) }),
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
      topologyRule: 'DEGREE_2_SECTION_TRANSITION_V1',
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
function pushIncident(map, nodeId, segment) {
  const id = String(nodeId);
  const rows = map.get(id) ?? [];
  rows.push(segment);
  map.set(id, rows);
}
function differs(left, right, tolerance) {
  const scale = Math.max(Math.abs(left), Math.abs(right), Number.MIN_VALUE);
  return Math.abs(left - right) > tolerance * scale;
}
function compareAscii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function requireGeometry(value) {
  if (!value || value.unit !== 'm' || !Array.isArray(value.nodes) || !Array.isArray(value.segments)) {
    throw new TypeError('canonicalGeometry must be normalized to metres and carry nodes/segments.');
  }
}
function geometryProjection(geometry) {
  const { diagnostics: _diagnostics, summary: _summary, valid: _valid, ...rest } = geometry;
  return rest;
}
