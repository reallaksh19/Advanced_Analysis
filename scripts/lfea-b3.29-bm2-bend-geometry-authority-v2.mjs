import {
  FRAME_LOCAL_AXIS_PROFILE,
  conditionGeometry,
  discretiseBend,
} from '../src/core/centerline-beam-fea/index.js';
import { validateCanonicalGeometry } from '../src/core/geometry/validateCanonicalGeometry.js';
import {
  attributeValue,
  findElements,
  firstElement,
} from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { convertInputXmlLengthToMetres } from '../src/core/geometry/adapters/inputxml-unit-system.js';
import {
  COMPONENT_GEOMETRY_SCHEMA,
  FACTOR_CALCULATION_REQUEST_SCHEMA,
  calculateB31Factors,
} from '../src/core/linear-fea-b31-factor-calculator/index.js';
import { compilePipingComponent } from '../src/core/linear-fea-piping-components/index.js';
import { componentProfile } from './lfea-b3.2-piping-component-fixtures.mjs';
import { buildBm2JunctionSurfaceNodeAuthorities } from './lfea-b3.28-bm2-junction-surface-node-runtime.mjs';

const SENTINEL = -1.0101;
const SENTINEL_TOLERANCE = 1e-3;
const LENGTH_TOLERANCE = 1e-9;
const POSITION_TOLERANCE = 1e-7;
const INPUTXML_TANGENT_ROUNDING_TOLERANCE = 1e-6;
const ANGLE_TOLERANCE = 1e-9;

export const BM2_BEND_EDITION_PROFILE_ID = 'B31_3_2024_B31J_2023';
export const BM2_BEND_EXPANSION_PROFILE = Object.freeze({
  schema: 'lfea-bm2-bend-expansion-profile/v5',
  prerequisite: 'lfea-bm2-junction-surface-node-profile/v1',
  sourceCoordinateRule: 'CONSTRUCTION_NODE_PLUS_TERMINATING_BEND_FAR_OFFSET_V1',
  spanCoordinateRule: 'CONSTRUCTION_DELTA_PLUS_END_OFFSET_MINUS_START_OFFSET_V1',
  sourceElementRule: 'STRAIGHT_PREFIX_PLUS_B3_2_CURVED_COMPONENT_V1',
  stationRule: 'INPUTXML_NODE2_NEAR_NODE1_ANGLE_TO_NODE_FAR_V1',
  tangentRoundingRule: 'INPUTXML_TANGENT_RESIDUE_COLLAPSE_AT_1E_6_M_V1',
  collapsedSpanRule: 'ZERO_PHYSICAL_LENGTH_REPORT_ACTION_ALIAS_V1',
  internalSubdivisionRule: 'B3_2_DECLARED_BEND_SUBDIVISION_V1',
  flexibilityRule: 'B31_CALCULATOR_TO_B3_2_SINGLE_APPLICATION_V1',
  reportPairRule: 'CAESAR_FROM_TO_PAIR_GROUPS_WITH_ALIAS_V1',
});

function optionalNumber(value) {
  const numeric = Number(String(value ?? '').trim());
  if (!Number.isFinite(numeric)) return null;
  return Math.abs(numeric - SENTINEL) < SENTINEL_TOLERANCE ? null : numeric;
}

function cleanNodeId(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return text;
  return Math.abs(numeric - SENTINEL) < SENTINEL_TOLERANCE ? null : String(numeric);
}

function point(node) {
  if (!node) throw new Error('BM2 bend point requires a node.');
  return [node.x, node.y, node.z];
}

function add(left, right) {
  return left.map((value, index) => value + right[index]);
}

function subtract(left, right) {
  return left.map((value, index) => value - right[index]);
}

function scale(vector, factor) {
  return vector.map((value) => value * factor);
}

function dot(left, right) {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function cross(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function norm(vector) {
  return Math.hypot(...vector);
}

function unit(vector, label) {
  const length = norm(vector);
  if (!(length > LENGTH_TOLERANCE)) throw new Error(`${label} has zero length.`);
  return scale(vector, 1 / length);
}

function distance(left, right) {
  return norm(subtract(left, right));
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function asPoint(vector) {
  return { x: vector[0], y: vector[1], z: vector[2] };
}

function asVector(value) {
  return Array.isArray(value) ? [...value] : [value.x, value.y, value.z];
}

function bendRecords(xmlText, lengthUnit) {
  const records = [];
  for (const [sourceIndex, element] of findElements(xmlText, 'PIPINGELEMENT').entries()) {
    const bend = firstElement(element.inner, ['BEND', 'BENDS', 'ELBOW', 'ELBOWS']);
    if (!bend) continue;
    const radiusRaw = optionalNumber(attributeValue(bend.attributes, 'RADIUS'));
    if (!(radiusRaw > 0)) {
      throw new Error(`BM2 BEND PIPINGELEMENT[${sourceIndex}] has no positive radius.`);
    }
    records.push(Object.freeze({
      sourceIndex,
      radius: convertInputXmlLengthToMetres(radiusRaw, lengthUnit),
      angle1Degrees: optionalNumber(attributeValue(bend.attributes, 'ANGLE1')),
      angle2Degrees: optionalNumber(attributeValue(bend.attributes, 'ANGLE2')),
      node1: cleanNodeId(attributeValue(bend.attributes, 'NODE1')),
      node2: cleanNodeId(attributeValue(bend.attributes, 'NODE2')),
    }));
  }
  return Object.freeze(records);
}

function sourceSegmentsByIndex(geometry) {
  const result = new Map();
  for (const segment of geometry.segments) {
    if (segment.meta?.b31jFictitiousRigid) continue;
    const sourceIndex = segment.meta?.sourceIndex;
    if (sourceIndex == null) continue;
    if (result.has(sourceIndex)) throw new Error(`BM2 source index ${sourceIndex} is duplicated.`);
    result.set(sourceIndex, segment);
  }
  return result;
}

function successorsByNode(geometry) {
  const result = new Map();
  for (const segment of geometry.segments) {
    if (!result.has(segment.startNodeId)) result.set(segment.startNodeId, []);
    result.get(segment.startNodeId).push(segment);
  }
  return result;
}

function predecessorsByNode(geometry) {
  const result = new Map();
  for (const segment of geometry.segments) {
    if (!result.has(segment.endNodeId)) result.set(segment.endNodeId, []);
    result.get(segment.endNodeId).push(segment);
  }
  return result;
}

function constructionDelta(segment, nodeById) {
  return subtract(point(nodeById.get(segment.endNodeId)), point(nodeById.get(segment.startNodeId)));
}

function buildBendDescriptors(authorities, records) {
  const geometry = authorities.geometry;
  const nodeById = new Map(geometry.nodes.map((node) => [node.id, node]));
  const byIndex = sourceSegmentsByIndex(geometry);
  const successors = successorsByNode(geometry);
  const descriptors = new Map();

  for (const record of records) {
    const segment = byIndex.get(record.sourceIndex);
    if (!segment) throw new Error(`BM2 BEND source index ${record.sourceIndex} is missing.`);
    const candidates = (successors.get(segment.endNodeId) ?? []).filter(
      (candidate) => candidate.id !== segment.id && !candidate.meta?.b31jFictitiousRigid,
    );
    if (candidates.length !== 1) {
      throw new Error(`BM2 bend ${segment.id} requires one physical successor; found ${candidates.length}.`);
    }
    const successor = candidates[0];
    const delta = constructionDelta(segment, nodeById);
    const successorDelta = constructionDelta(successor, nodeById);
    const incoming = unit(delta, `BM2 bend ${segment.id} incoming direction`);
    const outgoing = unit(successorDelta, `BM2 bend ${segment.id} outgoing direction`);
    const sweepAngle = Math.acos(clamp(dot(incoming, outgoing), -1, 1));
    if (!(sweepAngle > ANGLE_TOLERANCE && sweepAngle < Math.PI - ANGLE_TOLERANCE)) {
      throw new Error(`BM2 bend ${segment.id} sweep ${sweepAngle} is degenerate.`);
    }
    const tangentDistance = record.radius * Math.tan(sweepAngle / 2);
    if (norm(delta) + LENGTH_TOLERANCE < tangentDistance) {
      throw new Error(
        `BM2 bend ${segment.id} construction length ${norm(delta)} is shorter than tangent ${tangentDistance}.`,
      );
    }
    descriptors.set(segment.id, Object.freeze({
      record,
      segment,
      successor,
      constructionStart: Object.freeze(point(nodeById.get(segment.startNodeId))),
      constructionEnd: Object.freeze(point(nodeById.get(segment.endNodeId))),
      constructionDelta: Object.freeze(delta),
      incoming: Object.freeze(incoming),
      outgoing: Object.freeze(outgoing),
      sweepAngle,
      tangentDistance,
      farOffset: Object.freeze(scale(outgoing, tangentDistance)),
      planeNormal: Object.freeze(unit(cross(incoming, outgoing), `BM2 bend ${segment.id} plane`)),
    }));
  }
  return descriptors;
}

function physicalSourceCoordinates(geometry, descriptors) {
  const terminatingOffsets = new Map();
  for (const descriptor of descriptors.values()) {
    const nodeId = descriptor.segment.endNodeId;
    if (terminatingOffsets.has(nodeId)) throw new Error(`BM2 node ${nodeId} terminates multiple bends.`);
    terminatingOffsets.set(nodeId, descriptor.farOffset);
  }
  const coordinates = new Map();
  for (const node of geometry.nodes) {
    coordinates.set(
      node.id,
      Object.freeze(add(point(node), terminatingOffsets.get(node.id) ?? [0, 0, 0])),
    );
  }
  return { coordinates, terminatingOffsets };
}

function bendGeometry(descriptor, coordinates) {
  const physicalStart = coordinates.get(descriptor.segment.startNodeId);
  const physicalEnd = coordinates.get(descriptor.segment.endNodeId);
  const intersection = descriptor.constructionEnd;
  const nearPoint = subtract(intersection, scale(descriptor.incoming, descriptor.tangentDistance));
  const farPoint = add(intersection, descriptor.farOffset);
  if (distance(farPoint, physicalEnd) > POSITION_TOLERANCE) {
    throw new Error(`BM2 bend ${descriptor.segment.id} far point does not match its analysis node.`);
  }
  const across = unit(
    subtract(descriptor.outgoing, scale(descriptor.incoming, dot(descriptor.outgoing, descriptor.incoming))),
    `BM2 bend ${descriptor.segment.id} centre direction`,
  );
  const centre = add(nearPoint, scale(across, descriptor.record.radius));
  const radiusResidual = Math.max(
    Math.abs(distance(nearPoint, centre) - descriptor.record.radius),
    Math.abs(distance(farPoint, centre) - descriptor.record.radius),
  );
  if (radiusResidual > Math.max(1, descriptor.record.radius) * 1e-8) {
    throw new Error(`BM2 bend ${descriptor.segment.id} radius residual ${radiusResidual}.`);
  }
  return Object.freeze({
    ...descriptor,
    physicalStart,
    physicalEnd,
    intersection,
    nearPoint: Object.freeze(nearPoint),
    farPoint: Object.freeze(farPoint),
    centre: Object.freeze(centre),
  });
}

function calculateFactor(authorities, bend, parentEntry) {
  const analysis = bend.segment.meta.analysis;
  const geometry = {
    schema: COMPONENT_GEOMETRY_SCHEMA,
    componentType: 'BEND',
    lengthUnit: 'm',
    sourceEvidence: {
      sourceId: `M027-BM2-BEND-${bend.segment.id}`,
      sourceRevision: authorities.source.sourceRevision,
    },
    outerDiameter: parentEntry.physicalSection.dimensions.outerDiameter,
    wallThickness: parentEntry.physicalSection.dimensions.wallThickness,
    bendRadius: bend.record.radius,
    pressure: analysis.pressure ?? 0,
    elasticModulus: authorities.material.materialState.elasticModulus,
    bendAngleDegrees: bend.sweepAngle * 180 / Math.PI,
    smooth90FlexibilityCorrection: Math.abs(bend.sweepAngle - Math.PI / 2) <= 1e-9,
  };
  return calculateB31Factors({
    schema: FACTOR_CALCULATION_REQUEST_SCHEMA,
    calculationId: `M027-BM2-BEND-${bend.segment.id}-FACTORS`,
    componentId: `M027-BM2-BEND-${bend.segment.id}`,
    editionProfileId: BM2_BEND_EDITION_PROFILE_ID,
    componentType: 'BEND',
    geometry,
    momentDirectionMapping: { inPlaneField: 'my', outOfPlaneField: 'mz' },
    semanticHash: '',
  });
}

function compileBendAuthority(authorities, bend, parentEntry) {
  const factors = calculateFactor(authorities, bend, parentEntry);
  if (!factors.componentFactorSet) throw new Error(`BM2 bend ${bend.segment.id} has no factor set.`);
  const component = compilePipingComponent({
    componentId: `M027-BM2-BEND-${bend.segment.id}`,
    componentType: 'BEND',
    profile: componentProfile({
      bendPressureStiffeningRule: factors.componentFactorSet.pressureCorrectionApplied
        ? 'BEND_PRESSURE_STIFFENING_DECLARED_FACTOR_V1'
        : 'BEND_PRESSURE_STIFFENING_EXCLUDED_V1',
    }),
    arc: {
      tangentStart: bend.nearPoint,
      tangentEnd: bend.farPoint,
      incomingDirection: bend.incoming,
      declaredRadius: bend.record.radius,
    },
    material: authorities.material,
    section: parentEntry.physicalSection,
    frameElementProfile: authorities.frameProfile,
    localAxisProfile: FRAME_LOCAL_AXIS_PROFILE,
    referenceVector: null,
    factorSet: factors.componentFactorSet,
  });
  return Object.freeze({ factors, component });
}

function resolveAlias(nodeId, aliases) {
  let result = nodeId;
  const seen = new Set();
  while (aliases.has(result)) {
    if (seen.has(result)) throw new Error(`BM2 report-node alias cycle at ${result}.`);
    seen.add(result);
    result = aliases.get(result);
  }
  return result;
}

function addNode(nodes, template, nodeId, coordinates, metadata = {}) {
  const existing = nodes.get(nodeId);
  if (existing) {
    if (distance(point(existing), coordinates) > INPUTXML_TANGENT_ROUNDING_TOLERANCE) {
      throw new Error(`BM2 expanded bend node ${nodeId} conflicts with source geometry.`);
    }
    existing.x = coordinates[0];
    existing.y = coordinates[1];
    existing.z = coordinates[2];
    existing.meta = { ...existing.meta, ...metadata, inputXmlTangentSnapApplied: true };
    return;
  }
  nodes.set(nodeId, {
    ...structuredClone(template),
    id: nodeId,
    x: coordinates[0],
    y: coordinates[1],
    z: coordinates[2],
    restraint: 'FREE',
    meta: {
      caesarNodeNumber: nodeId,
      generatedBy: 'M027_BEND_EXPANSION',
      ...metadata,
    },
  });
}

function derivedSegment(parent, id, startNodeId, endNodeId, role, metadata, nodes) {
  const length = distance(point(nodes.get(startNodeId)), point(nodes.get(endNodeId)));
  if (!(length > LENGTH_TOLERANCE)) throw new Error(`BM2 derived segment ${id} has zero length.`);
  return {
    ...structuredClone(parent),
    id,
    startNodeId,
    endNodeId,
    type: 'PIPE',
    sourceComponentUid: `${parent.sourceComponentUid}:${role}`,
    length,
    meta: {
      ...structuredClone(parent.meta),
      expandedFromSegmentId: parent.id,
      expandedRole: role,
      ...metadata,
    },
  };
}

function stationIndex(record, sweepAngle, elementCount) {
  if (!(record.angle1Degrees > 0)) throw new Error(`BM2 bend station ${record.node1} lacks ANGLE1.`);
  const raw = (record.angle1Degrees * Math.PI / 180 / sweepAngle) * elementCount;
  const index = Math.round(raw);
  if (!(index > 0 && index < elementCount) || Math.abs(raw - index) > 1e-8) {
    throw new Error(`BM2 bend station ${record.node1} misses subdivision at ${raw}.`);
  }
  return index;
}

function detectCollapsedSpans(geometry, descriptors, physical) {
  const collapsed = [];
  const aliases = new Map();
  for (const segment of geometry.segments) {
    if (descriptors.has(segment.id) || segment.meta?.b31jFictitiousRigid) continue;
    const length = distance(
      physical.coordinates.get(segment.startNodeId),
      physical.coordinates.get(segment.endNodeId),
    );
    if (length > INPUTXML_TANGENT_ROUNDING_TOLERANCE) continue;
    aliases.set(segment.endNodeId, segment.startNodeId);
    collapsed.push(Object.freeze({
      sourceSegmentId: segment.id,
      sourceIndex: segment.meta?.sourceIndex ?? null,
      fromNode: segment.startNodeId,
      toNode: segment.endNodeId,
      physicalLength: length,
      reportPair: `${segment.startNodeId}-${segment.endNodeId}`,
      participation: Object.freeze({
        stiffness: false,
        gravity: false,
        thermal: false,
        mass: false,
        recoverReportActions: true,
      }),
      authority: BM2_BEND_EXPANSION_PROFILE.collapsedSpanRule,
    }));
  }
  return Object.freeze({ collapsed: Object.freeze(collapsed), aliases });
}

function selectTransferPredecessor(collapsed, geometry, sourceElementGroups) {
  const predecessors = (predecessorsByNode(geometry).get(collapsed.fromNode) ?? [])
    .filter((segment) => segment.id !== collapsed.sourceSegmentId)
    .sort((left, right) => (
      (right.meta?.sourceIndex ?? -1) - (left.meta?.sourceIndex ?? -1)
    ));
  for (const predecessor of predecessors) {
    const group = sourceElementGroups.get(predecessor.id);
    if (group?.length) {
      return Object.freeze({
        sourceSegmentId: predecessor.id,
        elementId: group.at(-1),
        end: 'J',
      });
    }
  }
  throw new Error(`BM2 collapsed span ${collapsed.sourceSegmentId} has no action-transfer predecessor.`);
}

function expand(authorities, descriptors, physical) {
  const sourceGeometry = authorities.geometry;
  const collapse = detectCollapsedSpans(sourceGeometry, descriptors, physical);
  const nodes = new Map();
  for (const sourceNode of sourceGeometry.nodes) {
    if (collapse.aliases.has(sourceNode.id)) continue;
    const coordinate = physical.coordinates.get(sourceNode.id);
    nodes.set(sourceNode.id, {
      ...structuredClone(sourceNode),
      x: coordinate[0],
      y: coordinate[1],
      z: coordinate[2],
      meta: {
        ...structuredClone(sourceNode.meta),
        inputXmlConstructionCoordinate: point(sourceNode),
        terminatingBendOffset: physical.terminatingOffsets.get(sourceNode.id) ?? [0, 0, 0],
      },
    });
  }

  const bendGeometries = new Map();
  for (const descriptor of descriptors.values()) {
    const bend = bendGeometry(descriptor, physical.coordinates);
    bendGeometries.set(descriptor.segment.id, bend);
    if (distance(bend.physicalStart, bend.nearPoint) <= INPUTXML_TANGENT_ROUNDING_TOLERANCE) {
      const physicalNodeId = resolveAlias(descriptor.segment.startNodeId, collapse.aliases);
      const node = nodes.get(physicalNodeId);
      node.x = bend.nearPoint[0];
      node.y = bend.nearPoint[1];
      node.z = bend.nearPoint[2];
      node.meta = {
        ...node.meta,
        inputXmlTangentSnapApplied: true,
        inputXmlTangentSnapResidual: distance(bend.physicalStart, bend.nearPoint),
      };
    }
  }

  const baseEntryBySegment = new Map(authorities.entries.map((entry) => [entry.sourceSegment.id, entry]));
  const segments = [];
  const pairGroups = new Map();
  const sourceElementGroups = new Map();
  const bendAuthorities = [];
  const pendingCollapsed = [];

  function registerPair(fromNode, toNode, elementIds, role, sourceSegmentId, metadata = {}) {
    const key = `${fromNode}-${toNode}`;
    if (pairGroups.has(key)) throw new Error(`BM2 CAESAR pair ${key} is duplicated.`);
    if (elementIds.length === 0 && role !== 'TANGENT_CONSUMED_REPORT_TRANSFER') {
      throw new Error(`BM2 CAESAR pair ${key} has no analysis elements.`);
    }
    pairGroups.set(key, Object.freeze({
      key,
      fromNode,
      toNode,
      elementIds: Object.freeze([...elementIds]),
      role,
      sourceSegmentId,
      ...metadata,
    }));
  }

  const collapsedById = new Map(collapse.collapsed.map((row) => [row.sourceSegmentId, row]));
  const orderedSourceSegments = [...sourceGeometry.segments].sort((left, right) => {
    const leftIndex = left.meta?.sourceIndex;
    const rightIndex = right.meta?.sourceIndex;
    if (leftIndex != null && rightIndex != null && leftIndex !== rightIndex) return leftIndex - rightIndex;
    if (leftIndex != null) return -1;
    if (rightIndex != null) return 1;
    return left.id.localeCompare(right.id);
  });

  for (const sourceSegment of orderedSourceSegments) {
    const collapsed = collapsedById.get(sourceSegment.id);
    if (collapsed) {
      sourceElementGroups.set(sourceSegment.id, Object.freeze([]));
      pendingCollapsed.push(collapsed);
      continue;
    }

    const descriptor = descriptors.get(sourceSegment.id);
    if (!descriptor) {
      const physicalStartNodeId = resolveAlias(sourceSegment.startNodeId, collapse.aliases);
      const physicalEndNodeId = resolveAlias(sourceSegment.endNodeId, collapse.aliases);
      const copy = {
        ...structuredClone(sourceSegment),
        id: sourceSegment.id,
        startNodeId: physicalStartNodeId,
        endNodeId: physicalEndNodeId,
        type: 'PIPE',
        length: distance(point(nodes.get(physicalStartNodeId)), point(nodes.get(physicalEndNodeId))),
        meta: {
          ...structuredClone(sourceSegment.meta),
          expandedFromSegmentId: sourceSegment.id,
          expandedRole: sourceSegment.meta?.b31jFictitiousRigid
            ? 'B31J_FICTITIOUS_RIGID'
            : 'SOURCE_SPAN',
          reportFromNodeId: sourceSegment.startNodeId,
          reportToNodeId: sourceSegment.endNodeId,
          referenceVector: [0, 0, 1],
        },
      };
      if (!(copy.length > LENGTH_TOLERANCE)) throw new Error(`BM2 source span ${copy.id} has zero length after aliasing.`);
      segments.push(copy);
      registerPair(
        sourceSegment.startNodeId,
        sourceSegment.endNodeId,
        [copy.id],
        copy.meta.expandedRole,
        sourceSegment.id,
        physicalStartNodeId === sourceSegment.startNodeId
          ? {}
          : { physicalFromNodeId: physicalStartNodeId },
      );
      sourceElementGroups.set(sourceSegment.id, Object.freeze([copy.id]));
      continue;
    }

    const bend = bendGeometries.get(sourceSegment.id);
    const physicalStartNodeId = resolveAlias(sourceSegment.startNodeId, collapse.aliases);
    const physicalEndNodeId = resolveAlias(sourceSegment.endNodeId, collapse.aliases);
    const parentEntry = baseEntryBySegment.get(sourceSegment.id);
    if (!parentEntry) throw new Error(`BM2 bend ${sourceSegment.id} lacks source entry authority.`);
    const authority = compileBendAuthority(authorities, bend, parentEntry);
    const component = authority.component;
    const elementCount = component.subdivision.elementCount;
    const subdivision = discretiseBend(
      asPoint(bend.nearPoint),
      asPoint(bend.farPoint),
      asPoint(bend.centre),
      elementCount,
    );
    const points = subdivision.points.map(asVector);
    const nodeIds = new Array(elementCount + 1);
    const nearCoincidesWithStart = distance(point(nodes.get(physicalStartNodeId)), bend.nearPoint)
      <= INPUTXML_TANGENT_ROUNDING_TOLERANCE;
    const nearNodeId = bend.record.node2
      ?? (nearCoincidesWithStart ? physicalStartNodeId : `${sourceSegment.id}.NEAR`);
    nodeIds[0] = nearNodeId;
    nodeIds[elementCount] = physicalEndNodeId;
    const midIndex = stationIndex(bend.record, bend.sweepAngle, elementCount);
    if (!bend.record.node1) throw new Error(`BM2 bend ${sourceSegment.id} has no NODE1.`);
    nodeIds[midIndex] = bend.record.node1;

    const template = nodes.get(physicalStartNodeId);
    for (let index = 0; index <= elementCount; index += 1) {
      if (!nodeIds[index]) nodeIds[index] = `${sourceSegment.id}.ARC.N${String(index).padStart(2, '0')}`;
      addNode(nodes, template, nodeIds[index], points[index], {
        bendParentSegmentId: sourceSegment.id,
        bendArcFraction: index / elementCount,
        sourceStation: nodeIds[index] === bend.record.node1
          ? 'NODE1'
          : nodeIds[index] === bend.record.node2 ? 'NODE2' : null,
      });
    }

    const group = [];
    let straightId = null;
    if (!nearCoincidesWithStart) {
      straightId = `${sourceSegment.id}.STRAIGHT`;
      const straight = derivedSegment(
        sourceSegment,
        straightId,
        physicalStartNodeId,
        nearNodeId,
        'STRAIGHT_PREFIX',
        { referenceVector: [0, 0, 1] },
        nodes,
      );
      segments.push(straight);
      group.push(straight.id);
    }

    const arcIds = [];
    for (let index = 0; index < elementCount; index += 1) {
      const arcId = `${sourceSegment.id}.ARC.E${String(index + 1).padStart(2, '0')}`;
      const arc = derivedSegment(
        sourceSegment,
        arcId,
        nodeIds[index],
        nodeIds[index + 1],
        'BEND_ARC',
        {
          referenceVector: bend.planeNormal,
          bendComponentId: component.componentId,
          bendComponentSemanticHash: component.semanticHash,
          bendFactorSetSemanticHash: authority.factors.componentFactorSet.semanticHash,
          bendFlexibilityFactor: authority.factors.componentFactorSet.flexibilityFactor.value,
          bendArcIndex: index,
          bendArcElementCount: elementCount,
        },
        nodes,
      );
      segments.push(arc);
      arcIds.push(arc.id);
      group.push(arc.id);
    }

    if (bend.record.node2) {
      if (!straightId) throw new Error(`BM2 bend ${sourceSegment.id} declares NODE2 without straight prefix.`);
      registerPair(
        sourceSegment.startNodeId,
        bend.record.node2,
        [straightId],
        'BEND_FROM_TO_NODE2',
        sourceSegment.id,
      );
      registerPair(
        bend.record.node2,
        bend.record.node1,
        arcIds.slice(0, midIndex),
        'BEND_NODE2_TO_NODE1',
        sourceSegment.id,
      );
    } else {
      registerPair(
        sourceSegment.startNodeId,
        bend.record.node1,
        [...(straightId ? [straightId] : []), ...arcIds.slice(0, midIndex)],
        'BEND_FROM_TO_NODE1',
        sourceSegment.id,
      );
    }
    registerPair(
      bend.record.node1,
      sourceSegment.endNodeId,
      arcIds.slice(midIndex),
      'BEND_NODE1_TO_FAR',
      sourceSegment.id,
      physicalEndNodeId === sourceSegment.endNodeId
        ? {}
        : { physicalToNodeId: physicalEndNodeId },
    );
    sourceElementGroups.set(sourceSegment.id, Object.freeze(group));
    bendAuthorities.push(Object.freeze({
      sourceSegmentId: sourceSegment.id,
      sourceIndex: sourceSegment.meta.sourceIndex,
      sourceFromNode: sourceSegment.startNodeId,
      sourceConstructionToNode: sourceSegment.endNodeId,
      physicalFromNode: physicalStartNodeId,
      physicalFarNode: physicalEndNodeId,
      nearNodeId,
      node1: bend.record.node1,
      node2: bend.record.node2,
      radius: bend.record.radius,
      sweepAngle: bend.sweepAngle,
      tangentDistance: bend.tangentDistance,
      intersection: bend.intersection,
      nearPoint: bend.nearPoint,
      farPoint: bend.farPoint,
      centre: bend.centre,
      planeNormal: bend.planeNormal,
      stationIndex: midIndex,
      subdivisionElementCount: elementCount,
      flexibilityFactor: authority.factors.componentFactorSet.flexibilityFactor.value,
      factorSetSemanticHash: authority.factors.componentFactorSet.semanticHash,
      componentSemanticHash: component.semanticHash,
      doubleCountGuard: component.flexibility.doubleCountGuard,
      convergence: component.convergence,
    }));
  }

  for (const collapsed of pendingCollapsed) {
    const transfer = selectTransferPredecessor(collapsed, sourceGeometry, sourceElementGroups);
    registerPair(
      collapsed.fromNode,
      collapsed.toNode,
      [],
      'TANGENT_CONSUMED_REPORT_TRANSFER',
      collapsed.sourceSegmentId,
      {
        reportNodeAlias: Object.freeze({
          sourceNodeId: collapsed.toNode,
          physicalNodeId: resolveAlias(collapsed.toNode, collapse.aliases),
        }),
        transferAction: transfer,
        physicalLength: collapsed.physicalLength,
        participation: collapsed.participation,
        authority: collapsed.authority,
      },
    );
  }

  const geometry = {
    ...structuredClone(sourceGeometry),
    nodes: [...nodes.values()].sort((left, right) => String(left.id).localeCompare(String(right.id))),
    segments,
    diagnostics: [...sourceGeometry.diagnostics],
    summary: {
      ...sourceGeometry.summary,
      nodeCount: nodes.size,
      segmentCount: segments.length,
      bendExpansionProfile: BM2_BEND_EXPANSION_PROFILE.schema,
      physicalBendCount: bendAuthorities.length,
      bendDeclaredStationCount: bendAuthorities.reduce((sum, bend) => sum + (bend.node2 ? 2 : 1), 0),
      collapsedTangentSpanCount: collapse.collapsed.length,
      reportNodeAliasCount: collapse.aliases.size,
      caesarReportPairCount: pairGroups.size,
    },
  };
  const validation = validateCanonicalGeometry(geometry, {
    tolerance: 1e-9,
    requireKnownUnit: false,
  });
  geometry.valid = validation.ok;
  geometry.diagnostics = [...geometry.diagnostics, ...validation.diagnostics];
  geometry.summary = { ...geometry.summary, ...validation.summary };
  if (!validation.ok) {
    throw new Error(`BM2 expanded bend geometry failed validation: ${JSON.stringify(
      validation.diagnostics.filter((row) => row.severity === 'error'),
    )}`);
  }
  if (pairGroups.size !== 61) {
    throw new Error(`BM2 expanded geometry must prepare 61 CAESAR pairs; found ${pairGroups.size}.`);
  }

  const conditioned = conditionGeometry(geometry, [], {
    spanSeedingLimit: {
      value: 1000,
      source: 'M027 B3.29 preserves explicitly expanded analysis spans',
    },
    bendSeedingSegments: {
      value: 2,
      source: 'B-3.2 owns bend subdivision before conditioning',
    },
    bendLengthErrorLimit: {
      value: 0.01,
      source: 'M027 inherited InputXML bend disclosure',
    },
  });

  return Object.freeze({
    geometry: Object.freeze(geometry),
    conditioned,
    pairGroups,
    sourceElementGroups,
    bendAuthorities: Object.freeze(bendAuthorities),
    collapsedTangentSpans: collapse.collapsed,
    reportNodeAliases: Object.freeze(Object.fromEntries(collapse.aliases)),
  });
}

export function buildBm2BendExpandedAuthorities() {
  const authorities = buildBm2JunctionSurfaceNodeAuthorities();
  const records = bendRecords(authorities.content, authorities.parsed.unit);
  if (records.length !== 11) throw new Error(`BM2 must contain 11 physical bends; found ${records.length}.`);
  const descriptors = buildBendDescriptors(authorities, records);
  const physical = physicalSourceCoordinates(authorities.geometry, descriptors);
  const expanded = expand(authorities, descriptors, physical);
  return Object.freeze({
    ...authorities,
    expansionProfile: BM2_BEND_EXPANSION_PROFILE,
    bendRecords: records,
    bendDescriptors: descriptors,
    physicalSourceCoordinates: physical.coordinates,
    terminatingBendOffsets: physical.terminatingOffsets,
    ...expanded,
  });
}
