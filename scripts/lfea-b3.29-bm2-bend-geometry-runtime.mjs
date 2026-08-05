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
const ANGLE_TOLERANCE = 1e-9;

export const BM2_BEND_EDITION_PROFILE_ID = 'B31_3_2024_B31J_2023';
export const BM2_BEND_EXPANSION_PROFILE = Object.freeze({
  schema: 'lfea-bm2-bend-expansion-profile/v3',
  prerequisite: 'lfea-bm2-junction-surface-node-profile/v1',
  sourceCoordinateRule: 'INPUTXML_THEORETICAL_CORNER_WITH_PROPAGATED_FAR_POINT_V1',
  sourceElementRule: 'STRAIGHT_PREFIX_PLUS_B3_2_CURVED_COMPONENT_V1',
  stationRule: 'INPUTXML_NODE2_NEAR_NODE1_ANGLE_TO_NODE_FAR_V1',
  internalSubdivisionRule: 'B3_2_DECLARED_BEND_SUBDIVISION_V1',
  flexibilityRule: 'B31_CALCULATOR_TO_B3_2_SINGLE_APPLICATION_V1',
  reportPairRule: 'CAESAR_FROM_TO_PAIR_GROUPS_V1',
});

function optionalNumber(value) {
  const numeric = Number(String(value ?? '').trim());
  if (!Number.isFinite(numeric)) return null;
  if (Math.abs(numeric - SENTINEL) < SENTINEL_TOLERANCE) return null;
  return numeric;
}

function cleanNodeId(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return text;
  if (Math.abs(numeric - SENTINEL) < SENTINEL_TOLERANCE) return null;
  return String(numeric);
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
  const rows = [];
  for (const [sourceIndex, element] of findElements(xmlText, 'PIPINGELEMENT').entries()) {
    const bend = firstElement(element.inner, ['BEND', 'BENDS', 'ELBOW', 'ELBOWS']);
    if (!bend) continue;
    const radiusRaw = optionalNumber(attributeValue(bend.attributes, 'RADIUS'));
    if (!(radiusRaw > 0)) {
      throw new Error(`BM2 bend PIPINGELEMENT[${sourceIndex}] has no positive radius.`);
    }
    rows.push(Object.freeze({
      sourceIndex,
      radius: convertInputXmlLengthToMetres(radiusRaw, lengthUnit),
      angle1Degrees: optionalNumber(attributeValue(bend.attributes, 'ANGLE1')),
      angle2Degrees: optionalNumber(attributeValue(bend.attributes, 'ANGLE2')),
      node1: cleanNodeId(attributeValue(bend.attributes, 'NODE1')),
      node2: cleanNodeId(attributeValue(bend.attributes, 'NODE2')),
    }));
  }
  return Object.freeze(rows);
}

function segmentBySourceIndex(geometry) {
  const result = new Map();
  for (const segment of geometry.segments) {
    if (segment.meta?.b31jFictitiousRigid) continue;
    const sourceIndex = segment.meta?.sourceIndex;
    if (sourceIndex == null) continue;
    if (result.has(sourceIndex)) {
      throw new Error(`BM2 source index ${sourceIndex} is duplicated after junction transformation.`);
    }
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

function sourceDelta(segment, nodes) {
  return subtract(point(nodes.get(segment.endNodeId)), point(nodes.get(segment.startNodeId)));
}

function buildDescriptors(authorities, records) {
  const geometry = authorities.geometry;
  const nodes = new Map(geometry.nodes.map((node) => [node.id, node]));
  const byIndex = segmentBySourceIndex(geometry);
  const successors = successorsByNode(geometry);
  const descriptors = new Map();

  for (const record of records) {
    const segment = byIndex.get(record.sourceIndex);
    if (!segment) throw new Error(`BM2 BEND source index ${record.sourceIndex} is missing.`);
    const candidates = (successors.get(segment.endNodeId) ?? []).filter(
      (candidate) => candidate.id !== segment.id && !candidate.meta?.b31jFictitiousRigid,
    );
    if (candidates.length !== 1) {
      throw new Error(
        `BM2 bend ${segment.id} requires one physical successor; found ${candidates.length}.`,
      );
    }
    const successor = candidates[0];
    const delta = sourceDelta(segment, nodes);
    const successorDelta = sourceDelta(successor, nodes);
    const incoming = unit(delta, `BM2 bend ${segment.id} incoming direction`);
    const outgoing = unit(successorDelta, `BM2 bend ${segment.id} outgoing direction`);
    const sweepAngle = Math.acos(clamp(dot(incoming, outgoing), -1, 1));
    if (!(sweepAngle > ANGLE_TOLERANCE && sweepAngle < Math.PI - ANGLE_TOLERANCE)) {
      throw new Error(`BM2 bend ${segment.id} sweep ${sweepAngle} is degenerate.`);
    }
    const tangentDistance = record.radius * Math.tan(sweepAngle / 2);
    if (norm(delta) + LENGTH_TOLERANCE < tangentDistance) {
      throw new Error(
        `BM2 bend ${segment.id} source length ${norm(delta)} is shorter than tangent distance ${tangentDistance}.`,
      );
    }
    descriptors.set(segment.id, Object.freeze({
      record,
      segment,
      successor,
      sourceDelta: Object.freeze(delta),
      incoming: Object.freeze(incoming),
      outgoing: Object.freeze(outgoing),
      sweepAngle,
      tangentDistance,
      planeNormal: Object.freeze(unit(cross(incoming, outgoing), `BM2 bend ${segment.id} plane`)),
    }));
  }
  return descriptors;
}

function physicalDelta(segment, nodes, descriptors) {
  const delta = sourceDelta(segment, nodes);
  const descriptor = descriptors.get(segment.id);
  return descriptor
    ? add(delta, scale(descriptor.outgoing, descriptor.tangentDistance))
    : delta;
}

function setCoordinate(coordinates, nodeId, candidate, source) {
  const existing = coordinates.get(nodeId);
  if (!existing) {
    coordinates.set(nodeId, Object.freeze([...candidate]));
    return true;
  }
  const residual = distance(existing, candidate);
  if (residual > POSITION_TOLERANCE) {
    throw new Error(
      `BM2 bend physical-coordinate closure failed at node ${nodeId}: ${residual} m from ${source}.`,
    );
  }
  return false;
}

function solvePhysicalCoordinates(geometry, descriptors) {
  const sourceNodes = new Map(geometry.nodes.map((node) => [node.id, node]));
  const coordinates = new Map();
  const root = geometry.segments[0]?.startNodeId;
  if (!root) throw new Error('BM2 bend geometry has no root node.');
  setCoordinate(coordinates, root, point(sourceNodes.get(root)), 'root');

  for (let pass = 0; pass <= geometry.segments.length * 2; pass += 1) {
    let changed = false;
    for (const segment of geometry.segments) {
      const delta = physicalDelta(segment, sourceNodes, descriptors);
      const start = coordinates.get(segment.startNodeId);
      const end = coordinates.get(segment.endNodeId);
      if (start) {
        changed = setCoordinate(
          coordinates,
          segment.endNodeId,
          add(start, delta),
          `${segment.id}:forward`,
        ) || changed;
      }
      if (end) {
        changed = setCoordinate(
          coordinates,
          segment.startNodeId,
          subtract(end, delta),
          `${segment.id}:reverse`,
        ) || changed;
      }
    }
    if (!changed) break;
  }

  const missing = geometry.nodes.map((node) => node.id).filter((nodeId) => !coordinates.has(nodeId));
  if (missing.length > 0) {
    throw new Error(`BM2 bend physical-coordinate solve missed nodes: ${missing.join(', ')}.`);
  }
  return coordinates;
}

function geometryAtPhysicalStart(descriptor, physicalStart) {
  const intersection = add(physicalStart, descriptor.sourceDelta);
  const nearPoint = subtract(intersection, scale(descriptor.incoming, descriptor.tangentDistance));
  const farPoint = add(intersection, scale(descriptor.outgoing, descriptor.tangentDistance));
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
    physicalStart: Object.freeze([...physicalStart]),
    intersection: Object.freeze(intersection),
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
  if (!factors.componentFactorSet) {
    throw new Error(`BM2 bend ${bend.segment.id} produced no component factor set.`);
  }
  const pressureRule = factors.componentFactorSet.pressureCorrectionApplied
    ? 'BEND_PRESSURE_STIFFENING_DECLARED_FACTOR_V1'
    : 'BEND_PRESSURE_STIFFENING_EXCLUDED_V1';
  const component = compilePipingComponent({
    componentId: `M027-BM2-BEND-${bend.segment.id}`,
    componentType: 'BEND',
    profile: componentProfile({ bendPressureStiffeningRule: pressureRule }),
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

function addNode(nodes, template, nodeId, coordinates, metadata = {}) {
  const existing = nodes.get(nodeId);
  if (existing) {
    const residual = distance(point(existing), coordinates);
    if (residual > POSITION_TOLERANCE) {
      throw new Error(`BM2 expanded bend node ${nodeId} conflicts by ${residual} m.`);
    }
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
  if (!(record.angle1Degrees > 0)) {
    throw new Error(`BM2 bend station ${record.node1} has no positive ANGLE1.`);
  }
  const raw = (record.angle1Degrees * Math.PI / 180 / sweepAngle) * elementCount;
  const rounded = Math.round(raw);
  if (!(rounded > 0 && rounded < elementCount) || Math.abs(raw - rounded) > 1e-8) {
    throw new Error(`BM2 bend station ${record.node1} does not land on subdivision: ${raw}.`);
  }
  return rounded;
}

function expand(authorities, records, descriptors, coordinates) {
  const sourceGeometry = authorities.geometry;
  const sourceNodes = new Map(sourceGeometry.nodes.map((node) => [node.id, node]));
  const nodes = new Map(sourceGeometry.nodes.map((node) => {
    const physical = coordinates.get(node.id);
    return [node.id, {
      ...structuredClone(node),
      x: physical[0],
      y: physical[1],
      z: physical[2],
      meta: {
        ...structuredClone(node.meta),
        inputXmlConstructionCoordinate: point(node),
        bendFarPointCoordinateApplied: distance(point(node), physical) > POSITION_TOLERANCE,
      },
    }];
  }));
  const baseEntries = new Map(authorities.entries.map((entry) => [entry.sourceSegment.id, entry]));
  const expandedSegments = [];
  const pairGroups = new Map();
  const sourceElementGroups = new Map();
  const bendAuthorities = [];

  function registerPair(fromNode, toNode, elementIds, role, sourceSegmentId) {
    const key = `${fromNode}-${toNode}`;
    if (pairGroups.has(key)) throw new Error(`BM2 report pair ${key} is duplicated.`);
    pairGroups.set(key, Object.freeze({
      key,
      fromNode,
      toNode,
      elementIds: Object.freeze([...elementIds]),
      role,
      sourceSegmentId,
    }));
  }

  for (const sourceSegment of sourceGeometry.segments) {
    const descriptor = descriptors.get(sourceSegment.id);
    if (!descriptor) {
      const copy = {
        ...structuredClone(sourceSegment),
        type: 'PIPE',
        length: distance(
          point(nodes.get(sourceSegment.startNodeId)),
          point(nodes.get(sourceSegment.endNodeId)),
        ),
        meta: {
          ...structuredClone(sourceSegment.meta),
          expandedFromSegmentId: sourceSegment.id,
          expandedRole: sourceSegment.meta?.b31jFictitiousRigid
            ? 'B31J_FICTITIOUS_RIGID'
            : 'SOURCE_SPAN',
          referenceVector: [0, 0, 1],
        },
      };
      if (!(copy.length > LENGTH_TOLERANCE)) throw new Error(`BM2 source span ${copy.id} has zero length.`);
      expandedSegments.push(copy);
      registerPair(
        copy.startNodeId,
        copy.endNodeId,
        [copy.id],
        copy.meta.expandedRole,
        sourceSegment.id,
      );
      sourceElementGroups.set(sourceSegment.id, Object.freeze([copy.id]));
      continue;
    }

    const bend = geometryAtPhysicalStart(descriptor, coordinates.get(sourceSegment.startNodeId));
    const expectedFar = coordinates.get(sourceSegment.endNodeId);
    if (distance(bend.farPoint, expectedFar) > POSITION_TOLERANCE) {
      throw new Error(`BM2 bend ${sourceSegment.id} far-point propagation is inconsistent.`);
    }
    const parentEntry = baseEntries.get(sourceSegment.id);
    if (!parentEntry) throw new Error(`BM2 bend ${sourceSegment.id} has no source entry authority.`);
    const authority = compileBendAuthority(authorities, bend, parentEntry);
    const component = authority.component;
    const count = component.subdivision.elementCount;
    const subdivision = discretiseBend(
      asPoint(bend.nearPoint),
      asPoint(bend.farPoint),
      asPoint(bend.centre),
      count,
    );
    const points = subdivision.points.map(asVector);
    const nodeIds = new Array(count + 1);
    const sourceStart = point(nodes.get(sourceSegment.startNodeId));
    const nearCoincidesWithStart = distance(sourceStart, bend.nearPoint) <= POSITION_TOLERANCE;
    const nearNodeId = bend.record.node2
      ?? (nearCoincidesWithStart ? sourceSegment.startNodeId : `${sourceSegment.id}.NEAR`);
    nodeIds[0] = nearNodeId;
    nodeIds[count] = sourceSegment.endNodeId;
    const midIndex = stationIndex(bend.record, bend.sweepAngle, count);
    if (!bend.record.node1) throw new Error(`BM2 bend ${sourceSegment.id} has no NODE1.`);
    nodeIds[midIndex] = bend.record.node1;

    const template = nodes.get(sourceSegment.startNodeId);
    for (let index = 0; index <= count; index += 1) {
      if (!nodeIds[index]) {
        nodeIds[index] = `${sourceSegment.id}.ARC.N${String(index).padStart(2, '0')}`;
      }
      addNode(nodes, template, nodeIds[index], points[index], {
        bendParentSegmentId: sourceSegment.id,
        bendArcFraction: index / count,
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
        sourceSegment.startNodeId,
        nearNodeId,
        'STRAIGHT_PREFIX',
        { referenceVector: [0, 0, 1] },
        nodes,
      );
      expandedSegments.push(straight);
      group.push(straight.id);
    }

    const arcs = [];
    for (let index = 0; index < count; index += 1) {
      const id = `${sourceSegment.id}.ARC.E${String(index + 1).padStart(2, '0')}`;
      const arc = derivedSegment(
        sourceSegment,
        id,
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
          bendArcElementCount: count,
        },
        nodes,
      );
      expandedSegments.push(arc);
      arcs.push(arc.id);
      group.push(arc.id);
    }

    if (bend.record.node2) {
      if (!straightId) {
        throw new Error(`BM2 bend ${sourceSegment.id} declares NODE2 without a straight prefix.`);
      }
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
        arcs.slice(0, midIndex),
        'BEND_NODE2_TO_NODE1',
        sourceSegment.id,
      );
    } else {
      registerPair(
        sourceSegment.startNodeId,
        bend.record.node1,
        [...(straightId ? [straightId] : []), ...arcs.slice(0, midIndex)],
        'BEND_FROM_TO_NODE1',
        sourceSegment.id,
      );
    }
    registerPair(
      bend.record.node1,
      sourceSegment.endNodeId,
      arcs.slice(midIndex),
      'BEND_NODE1_TO_FAR',
      sourceSegment.id,
    );
    sourceElementGroups.set(sourceSegment.id, Object.freeze(group));
    bendAuthorities.push(Object.freeze({
      sourceSegmentId: sourceSegment.id,
      sourceIndex: sourceSegment.meta.sourceIndex,
      sourceFromNode: sourceSegment.startNodeId,
      sourceConstructionToNode: sourceSegment.endNodeId,
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
      subdivisionElementCount: count,
      flexibilityFactor: authority.factors.componentFactorSet.flexibilityFactor.value,
      factorSetSemanticHash: authority.factors.componentFactorSet.semanticHash,
      componentSemanticHash: component.semanticHash,
      doubleCountGuard: component.flexibility.doubleCountGuard,
      convergence: component.convergence,
    }));
  }

  const geometry = {
    ...structuredClone(sourceGeometry),
    nodes: [...nodes.values()].sort((left, right) => String(left.id).localeCompare(String(right.id))),
    segments: expandedSegments,
    diagnostics: [...sourceGeometry.diagnostics],
    summary: {
      ...sourceGeometry.summary,
      nodeCount: nodes.size,
      segmentCount: expandedSegments.length,
      bendExpansionProfile: BM2_BEND_EXPANSION_PROFILE.schema,
      physicalBendCount: bendAuthorities.length,
      bendDeclaredStationCount: bendAuthorities.reduce(
        (sum, bend) => sum + (bend.node2 ? 2 : 1),
        0,
      ),
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
    throw new Error(
      `BM2 expanded bend geometry failed validation: ${JSON.stringify(
        validation.diagnostics.filter((row) => row.severity === 'error'),
      )}`,
    );
  }
  if (pairGroups.size !== 61) {
    throw new Error(`BM2 expanded geometry must prepare 61 CAESAR pairs; found ${pairGroups.size}.`);
  }

  const conditioned = conditionGeometry(geometry, [], {
    spanSeedingLimit: {
      value: 1000,
      source: 'M027 B3.29 preserves every explicitly expanded analysis span',
    },
    bendSeedingSegments: {
      value: 2,
      source: 'B3.29 marks pre-expanded bend spans as PIPE; B-3.2 owns subdivision',
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
  });
}

export function buildBm2BendExpandedAuthorities() {
  const authorities = buildBm2JunctionSurfaceNodeAuthorities();
  const records = bendRecords(authorities.content, authorities.parsed.unit);
  if (records.length !== 11) {
    throw new Error(`BM2 must contain 11 physical bends; found ${records.length}.`);
  }
  const descriptors = buildDescriptors(authorities, records);
  const coordinates = solvePhysicalCoordinates(authorities.geometry, descriptors);
  const expanded = expand(authorities, records, descriptors, coordinates);
  return Object.freeze({
    ...authorities,
    expansionProfile: BM2_BEND_EXPANSION_PROFILE,
    bendRecords: records,
    bendDescriptors: descriptors,
    physicalSourceCoordinates: coordinates,
    ...expanded,
  });
}
