import { discretiseBend } from '../centerline-beam-fea/index.js';
import { resolveBendArcCentre } from '../geometry/adapters/inputxml-bend-arc.js';
import {
  COMPONENT_GEOMETRY_SCHEMA,
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  calculateB31Factors,
} from '../linear-fea-b31-factor-calculator/index.js';
import { compilePipingComponent } from '../linear-fea-piping-components/index.js';

const POSITION_TOLERANCE = 1e-10;

export function compileInputXmlBendDefinition({
  canonicalGeometry,
  segment,
  sourceNodes,
  editionProfileId,
  momentDirectionMapping,
  smooth90FlexibilityCorrection,
  material,
  section,
  frameProfile,
  componentProfile,
  localAxisProfile,
}) {
  const outgoing = canonicalGeometry.segments.filter((candidate) =>
    String(candidate.startNodeId) === String(segment.endNodeId));
  if (outgoing.length !== 1) {
    fail(
      'INPUTXML_BEND_EXPANSION_OUTLET_AMBIGUOUS',
      `Bend ${segment.id} requires exactly one outgoing source segment at node ${segment.endNodeId}; found ${outgoing.length}.`,
    );
  }
  const start = position(sourceNodes, segment.startNodeId);
  const intersection = position(sourceNodes, segment.endNodeId);
  const outletEnd = position(sourceNodes, outgoing[0].endNodeId);
  const incomingDirection = unit(subtract(intersection, start), `${segment.id} incoming direction`);
  const outgoingDirection = unit(subtract(outletEnd, intersection), `${segment.id} outgoing direction`);
  const bendAngle = Math.acos(clamp(dot(incomingDirection, outgoingDirection), -1, 1));
  if (!(bendAngle > 0 && bendAngle < Math.PI)) {
    fail('INPUTXML_BEND_EXPANSION_ANGLE_DEGENERATE', `Bend ${segment.id} has a degenerate ${bendAngle} rad turn angle.`);
  }
  const radius = segment.meta?.bendDeclaredRadius ?? segment.meta?.bendComputedRadius;
  if (!(typeof radius === 'number' && Number.isFinite(radius) && radius > 0)) {
    fail('INPUTXML_BEND_EXPANSION_RADIUS_MISSING', `Bend ${segment.id} has no positive resolved radius.`);
  }
  const tangentLength = radius * Math.tan(bendAngle / 2);
  const incomingLength = norm(subtract(intersection, start));
  const outgoingLength = norm(subtract(outletEnd, intersection));
  if (!(tangentLength < incomingLength && tangentLength < outgoingLength)) {
    fail(
      'INPUTXML_BEND_EXPANSION_TANGENT_OVERRUN',
      `Bend ${segment.id} tangent length ${tangentLength} does not fit its adjacent source spans.`,
    );
  }
  const tangentStart = subtract(intersection, scale(incomingDirection, tangentLength));
  const tangentEnd = add(intersection, scale(outgoingDirection, tangentLength));
  const componentId = `IXBEND.${safe(segment.id)}`;
  const analysis = segment.meta?.analysis ?? {};
  const pressure = Number.isFinite(analysis.pressure) && analysis.pressure >= 0 ? analysis.pressure : 0;
  const factorResult = calculateB31Factors({
    schema: FACTOR_CALCULATION_REQUEST_SCHEMA,
    calculationId: `${componentId}.B31.FACTORS`,
    componentId,
    editionProfileId,
    componentType: 'BEND',
    geometry: {
      schema: COMPONENT_GEOMETRY_SCHEMA,
      componentType: 'BEND',
      lengthUnit: 'm',
      outerDiameter: section.dimensions.outerDiameter,
      wallThickness: section.dimensions.wallThickness,
      bendRadius: radius,
      pressure,
      elasticModulus: material.materialState.elasticModulus,
      bendAngleDegrees: bendAngle * 180 / Math.PI,
      smooth90FlexibilityCorrection,
      sourceEvidence: {
        sourceId: `${canonicalGeometry.source ?? 'INPUTXML'}:${segment.sourceComponentUid ?? segment.id}`,
        sourceRevision: `${canonicalGeometry.summary?.jobName ?? canonicalGeometry.schemaVersion ?? 'canonical'}:${segment.id}`,
      },
    },
    momentDirectionMapping,
    semanticHash: '',
  });
  if (factorResult.status !== 'QUALIFIED' || !factorResult.componentFactorSet) {
    fail('INPUTXML_BEND_EXPANSION_FACTOR_NOT_QUALIFIED', `Bend ${segment.id} has no qualified component flexibility factor.`);
  }
  const component = compilePipingComponent({
    componentId,
    componentType: 'BEND',
    profile: componentProfile,
    arc: { tangentStart, tangentEnd, incomingDirection, declaredRadius: radius },
    material,
    section,
    frameElementProfile: frameProfile,
    localAxisProfile,
    referenceVector: null,
    factorSet: factorResult.componentFactorSet,
  });
  if (component.acceptanceState === 'BLOCKED') {
    fail('INPUTXML_BEND_EXPANSION_COMPONENT_BLOCKED', `Bend ${segment.id} B-3.2 component is blocked by its own approximation evidence.`);
  }

  const resolved = resolveBendArcCentre(asPoint(incomingDirection), asPoint(tangentStart), asPoint(tangentEnd));
  if (resolved === null) {
    fail('INPUTXML_BEND_EXPANSION_ARC_DEGENERATE', `Bend ${segment.id} tangent geometry does not resolve a unique arc.`);
  }
  const chain = discretiseBend(asPoint(tangentStart), asPoint(tangentEnd), resolved.centre, component.subdivision.elementCount);
  const middleIndex = component.subdivision.elementCount / 2;
  if (!Number.isInteger(middleIndex)) {
    fail('INPUTXML_BEND_EXPANSION_MID_STATION_UNRESOLVED', `Bend ${segment.id} subdivision must carry an exact mid-arc station.`);
  }
  const stationNodeIds = Array.from({ length: chain.points.length }, (_, index) => {
    if (index === 0 && validStationNode(segment.meta?.bendStationNode2)) return String(segment.meta.bendStationNode2);
    if (index === middleIndex && validStationNode(segment.meta?.bendStationNode1)) return String(segment.meta.bendStationNode1);
    if (index === component.subdivision.elementCount) return String(segment.endNodeId);
    return `${segment.id}.BEND.N${index}`;
  });
  const analysisSegmentIds = [];
  if (norm(subtract(tangentStart, start)) > POSITION_TOLERANCE) analysisSegmentIds.push(`${segment.id}.STRAIGHT`);
  for (let index = 0; index < component.subdivision.elementCount; index += 1) {
    analysisSegmentIds.push(component.elements[index].elementId);
  }
  return Object.freeze({
    sourceSegmentId: String(segment.id),
    sourceEndNodeId: String(segment.endNodeId),
    sourceSegment: segment,
    component,
    factorResult,
    start,
    intersection,
    tangentStart,
    tangentEnd,
    incomingDirection,
    outgoingDirection,
    bendAngle,
    tangentLength,
    chain,
    stationNodeIds: Object.freeze(stationNodeIds),
    analysisSegmentIds: Object.freeze(analysisSegmentIds),
  });
}

function position(nodes, nodeId) {
  const node = nodes.get(String(nodeId));
  if (!node) fail('INPUTXML_BEND_EXPANSION_NODE_MISSING', `Node ${nodeId} is missing.`);
  return [node.x, node.y, node.z];
}
function validStationNode(value) {
  const text = String(value ?? '').trim();
  return text.length > 0 && text !== '-1.0101' && text !== '-1.010100';
}
function asPoint(vector) { return { x: vector[0], y: vector[1], z: vector[2] }; }
function add(a, b) { return a.map((value, index) => value + b[index]); }
function subtract(a, b) { return a.map((value, index) => value - b[index]); }
function scale(a, factor) { return a.map((value) => value * factor); }
function dot(a, b) { return a.reduce((sum, value, index) => sum + value * b[index], 0); }
function norm(a) { return Math.hypot(...a); }
function unit(a, field) {
  const length = norm(a);
  if (!(length > 0)) fail('INPUTXML_BEND_EXPANSION_DIRECTION_DEGENERATE', `${field} has zero length.`);
  return scale(a, 1 / length);
}
function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }
function safe(value) { return String(value).replace(/[^A-Za-z0-9_.-]/gu, '-'); }
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
