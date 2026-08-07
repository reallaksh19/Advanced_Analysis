import { discretiseBend, FRAME_LOCAL_AXIS_PROFILE } from '../centerline-beam-fea/index.js';
import { resolveBendArcCentre } from '../geometry/adapters/inputxml-bend-arc.js';
import {
  COMPONENT_GEOMETRY_SCHEMA,
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  calculateB31Factors,
} from '../linear-fea-b31-factor-calculator/index.js';
import { requireFrameElementProfile } from '../linear-fea-frame-element/index.js';
import { requireMaterialResolutionResult } from '../linear-fea-material/index.js';
import {
  compilePipingComponent,
  requirePipingComponentProfile,
} from '../linear-fea-piping-components/index.js';
import { requirePipeSectionResolution } from '../linear-fea-section/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';

const POSITION_TOLERANCE = 1e-10;

/**
 * Expand canonical InputXML bend tags into real tangent-to-tangent arc geometry
 * and B-3.2 bend components. This is model-agnostic: the caller supplies the
 * code-edition profile, smooth-90 policy and qualified B-3.1/B-3.2 profiles;
 * no benchmark or node identity is embedded here.
 */
export function compileInputXmlBendFeatureExpansion({
  canonicalGeometry,
  editionProfileId,
  momentDirectionMapping,
  smooth90FlexibilityCorrection,
  materialBySegmentId,
  sectionBySegmentId,
  frameElementProfile,
  pipingComponentProfile,
  localAxisProfile = FRAME_LOCAL_AXIS_PROFILE,
  segmentIds = null,
}) {
  requireCanonicalGeometry(canonicalGeometry);
  if (typeof smooth90FlexibilityCorrection !== 'boolean') {
    throw new TypeError('smooth90FlexibilityCorrection must be explicitly declared true or false.');
  }
  const frameProfile = requireFrameElementProfile(frameElementProfile);
  const componentProfile = requirePipingComponentProfile(pipingComponentProfile);
  requireMap(materialBySegmentId, 'materialBySegmentId');
  requireMap(sectionBySegmentId, 'sectionBySegmentId');

  const selected = segmentIds === null ? null : new Set(segmentIds.map(String));
  const bends = canonicalGeometry.segments.filter((segment) =>
    segment.type === 'BEND' && (selected === null || selected.has(String(segment.id))));
  if (selected !== null) {
    const found = new Set(bends.map((row) => String(row.id)));
    const missing = [...selected].filter((id) => !found.has(id));
    if (missing.length > 0) {
      fail('INPUTXML_BEND_EXPANSION_SEGMENT_NOT_FOUND', `Selected bend segment(s) were not found: ${missing.join(', ')}.`);
    }
  }
  if (bends.length === 0) {
    const draft = {
      schema: 'fea-inputxml-bend-feature-expansion/v1',
      sourceGeometrySemanticHash: semanticHash(geometryProjection(canonicalGeometry)),
      analysisGeometry: canonicalGeometry,
      components: Object.freeze([]),
      definitions: Object.freeze([]),
      sourceToAnalysisSegmentIds: Object.freeze({}),
    };
    return Object.freeze({ ...draft, semanticHash: semanticHash(draft) });
  }

  const sourceNodes = new Map(canonicalGeometry.nodes.map((node) => [String(node.id), node]));
  const definitions = bends.map((segment) => compileDefinition({
    canonicalGeometry,
    segment,
    sourceNodes,
    editionProfileId,
    momentDirectionMapping,
    smooth90FlexibilityCorrection,
    material: requireAuthority(materialBySegmentId, segment.id, requireMaterialResolutionResult, 'material'),
    section: requireAuthority(sectionBySegmentId, segment.id, requirePipeSectionResolution, 'section'),
    frameProfile,
    componentProfile,
    localAxisProfile,
  }));
  const expanded = expandGeometry(canonicalGeometry, definitions);
  const sourceToAnalysisSegmentIds = Object.freeze(Object.fromEntries(
    definitions.map((definition) => [definition.sourceSegmentId, definition.analysisSegmentIds]),
  ));
  const draft = {
    schema: 'fea-inputxml-bend-feature-expansion/v1',
    sourceGeometrySemanticHash: semanticHash(geometryProjection(canonicalGeometry)),
    analysisGeometry: expanded,
    components: Object.freeze(definitions.map((row) => row.component)),
    definitions: Object.freeze(definitions.map((row) => Object.freeze({
      sourceSegmentId: row.sourceSegmentId,
      sourceEndNodeId: row.sourceEndNodeId,
      tangentStart: row.tangentStart,
      tangentEnd: row.tangentEnd,
      intersection: row.intersection,
      bendAngle: row.bendAngle,
      tangentLength: row.tangentLength,
      stationNodeIds: row.stationNodeIds,
      analysisSegmentIds: row.analysisSegmentIds,
      factorResultSemanticHash: row.factorResult.semanticHash,
      componentSemanticHash: row.component.semanticHash,
    }))),
    sourceToAnalysisSegmentIds,
  };
  return Object.freeze({ ...draft, semanticHash: semanticHash(draft) });
}

function compileDefinition({
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
    arc: {
      tangentStart,
      tangentEnd,
      incomingDirection,
      declaredRadius: radius,
    },
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

function expandGeometry(canonicalGeometry, definitions) {
  const nodes = new Map(canonicalGeometry.nodes.map((node) => [String(node.id), structuredClone(node)]));
  const bySource = new Map(definitions.map((row) => [row.sourceSegmentId, row]));
  for (const definition of definitions) {
    definition.chain.points.forEach((point, index) => {
      const nodeId = definition.stationNodeIds[index];
      setNodePosition(nodes, nodeId, point, definition.sourceSegmentId, index);
    });
  }
  const segments = [];
  for (const sourceSegment of canonicalGeometry.segments) {
    const definition = bySource.get(String(sourceSegment.id));
    if (!definition) {
      segments.push(withUpdatedLength(sourceSegment, nodes));
      continue;
    }
    const firstArcNode = definition.stationNodeIds[0];
    if (definition.analysisSegmentIds[0] === `${sourceSegment.id}.STRAIGHT`) {
      segments.push(expandedSegment(sourceSegment, `${sourceSegment.id}.STRAIGHT`, sourceSegment.startNodeId, firstArcNode, 'BEND_INCOMING_STRAIGHT', nodes));
    }
    for (let index = 0; index < definition.component.elements.length; index += 1) {
      segments.push(expandedSegment(
        sourceSegment,
        definition.component.elements[index].elementId,
        definition.stationNodeIds[index],
        definition.stationNodeIds[index + 1],
        'BEND_ARC',
        nodes,
        index,
        definition.component.componentId,
      ));
    }
  }
  const geometry = {
    ...structuredClone(canonicalGeometry),
    nodes: Object.freeze([...nodes.values()]),
    segments: Object.freeze(segments),
    diagnostics: Object.freeze([
      ...(canonicalGeometry.diagnostics ?? []).map((row) => structuredClone(row)),
      {
        severity: 'info',
        code: 'INPUTXML_BEND_REAL_ARC_EXPANDED',
        message: 'InputXML bends were expanded into tangent-to-tangent B-3.2 arc components; straight-chord bend approximation was not used.',
        data: { bendCount: definitions.length },
      },
    ]),
    summary: {
      ...(canonicalGeometry.summary ?? {}),
      nodeCount: nodes.size,
      segmentCount: segments.length,
      sourceBendCount: definitions.length,
    },
    valid: true,
  };
  return Object.freeze(geometry);
}

function expandedSegment(source, id, startNodeId, endNodeId, analysisRole, nodes, componentElementIndex = null, componentId = null) {
  const start = position(nodes, startNodeId);
  const end = position(nodes, endNodeId);
  return Object.freeze({
    ...structuredClone(source),
    id,
    startNodeId: String(startNodeId),
    endNodeId: String(endNodeId),
    type: 'PIPE',
    length: norm(subtract(end, start)),
    meta: {
      ...structuredClone(source.meta ?? {}),
      sourceSegmentId: String(source.id),
      analysisRole,
      componentId,
      componentElementIndex,
    },
  });
}

function withUpdatedLength(source, nodes) {
  const start = position(nodes, source.startNodeId);
  const end = position(nodes, source.endNodeId);
  return Object.freeze({ ...structuredClone(source), length: norm(subtract(end, start)) });
}

function setNodePosition(nodes, nodeId, point, sourceSegmentId, stationIndex) {
  const value = { x: point.x, y: point.y, z: point.z };
  const existing = nodes.get(String(nodeId));
  if (existing) {
    const delta = Math.hypot(existing.x - value.x, existing.y - value.y, existing.z - value.z);
    const previouslyExpanded = existing.meta?.inputXmlBendExpanded === true;
    if (previouslyExpanded && delta > POSITION_TOLERANCE) {
      fail('INPUTXML_BEND_EXPANSION_NODE_POSITION_CONFLICT', `Bend expansion assigns conflicting positions to node ${nodeId}.`);
    }
    nodes.set(String(nodeId), {
      ...existing,
      ...value,
      meta: { ...(existing.meta ?? {}), inputXmlBendExpanded: true, sourceBendSegmentId: sourceSegmentId, bendStationIndex: stationIndex },
    });
    return;
  }
  nodes.set(String(nodeId), {
    id: String(nodeId),
    ...value,
    restraint: 'FREE',
    meta: { inputXmlBendExpanded: true, sourceBendSegmentId: sourceSegmentId, bendStationIndex: stationIndex },
  });
}

function requireAuthority(map, segmentId, validator, label) {
  const value = map.get(String(segmentId)) ?? map.get(segmentId);
  if (!value) fail('INPUTXML_BEND_EXPANSION_AUTHORITY_MISSING', `Bend ${segmentId} has no ${label} authority.`);
  return validator(value);
}

function requireCanonicalGeometry(value) {
  if (!value || value.unit !== 'm' || !Array.isArray(value.nodes) || !Array.isArray(value.segments)) {
    throw new TypeError('canonicalGeometry must be normalized to metres and carry nodes/segments.');
  }
}

function requireMap(value, field) {
  if (!(value instanceof Map)) throw new TypeError(`${field} must be a Map keyed by canonical segment id.`);
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
function geometryProjection(geometry) {
  const { diagnostics: _diagnostics, summary: _summary, valid: _valid, ...rest } = geometry;
  return rest;
}
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
