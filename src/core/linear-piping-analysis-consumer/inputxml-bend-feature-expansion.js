import { FRAME_LOCAL_AXIS_PROFILE } from '../centerline-beam-fea/index.js';
import { requireFrameElementProfile } from '../linear-fea-frame-element/index.js';
import { requireMaterialResolutionResult } from '../linear-fea-material/index.js';
import { requirePipingComponentProfile } from '../linear-fea-piping-components/index.js';
import { requirePipeSectionResolution } from '../linear-fea-section/index.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { compileInputXmlBendDefinition } from './inputxml-bend-feature-definition.js';

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
  localAxisProfile,
  segmentIds,
}) {
  const resolvedLocalAxisProfile = localAxisProfile ?? FRAME_LOCAL_AXIS_PROFILE;
  const resolvedSegmentIds = segmentIds ?? null;
  requireCanonicalGeometry(canonicalGeometry);
  if (typeof smooth90FlexibilityCorrection !== 'boolean') {
    throw new TypeError('smooth90FlexibilityCorrection must be explicitly declared true or false.');
  }
  const frameProfile = requireFrameElementProfile(frameElementProfile);
  const componentProfile = requirePipingComponentProfile(pipingComponentProfile);
  requireMap(materialBySegmentId, 'materialBySegmentId');
  requireMap(sectionBySegmentId, 'sectionBySegmentId');

  const selected = resolvedSegmentIds === null ? null : new Set(resolvedSegmentIds.map(String));
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
  const definitions = bends.map((segment) => compileInputXmlBendDefinition({
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
    localAxisProfile: resolvedLocalAxisProfile,
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
      segments.push(expandedSegment(sourceSegment, `${sourceSegment.id}.STRAIGHT`, sourceSegment.startNodeId, firstArcNode, 'BEND_INCOMING_STRAIGHT', nodes, null, null));
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

function expandedSegment(source, id, startNodeId, endNodeId, analysisRole, nodes, componentElementIndex, componentId) {
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

function subtract(a, b) { return a.map((value, index) => value - b[index]); }
function norm(a) { return Math.hypot(...a); }
function geometryProjection(geometry) {
  const { diagnostics: _diagnostics, summary: _summary, valid: _valid, ...rest } = geometry;
  return rest;
}
function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}
