import { attributeValue, findAnyElements, firstElement } from './inputxml-tag-scanner.js';
import { checkDeclaredRadius, resolveBendArcCentre } from './inputxml-bend-arc.js';
import { resolveRestraintTypeMutation } from './inputxml-restraint-type-mutation.js';
import { INPUTXML_FEATURE_TAGS, INPUTXML_KNOWN_SIF_TYPES, INPUTXML_SENTINELS } from './inputxml-feature-registry.js';
import {
  addDiagnostic,
  caesarNumberOrNull,
  cleanNodeId,
  distance,
  rawFiniteNumber,
} from './inputxml-canonical-geometry-values.js';

const CAESAR_SENTINEL_VALUE = INPUTXML_SENTINELS.UNSET;
const CAESAR_DOUBLE_SENTINEL_VALUE = INPUTXML_SENTINELS.DOUBLE_UNSET;
const CAESAR_SENTINEL_TOLERANCE = INPUTXML_SENTINELS.TOLERANCE;
const BEND_ANGLE_TOLERANCE = 1e-9;
const BEND_TAGS = INPUTXML_FEATURE_TAGS.BEND;
const RIGID_TAGS = INPUTXML_FEATURE_TAGS.RIGID;
const SIF_TAGS = INPUTXML_FEATURE_TAGS.SIF;
const REDUCER_TAGS = INPUTXML_FEATURE_TAGS.REDUCER;
const RESTRAINT_TAGS = INPUTXML_FEATURE_TAGS.RESTRAINT;
const SIF_TYPE_WELDING_TEE = Number(Object.keys(INPUTXML_KNOWN_SIF_TYPES).find((code) => INPUTXML_KNOWN_SIF_TYPES[code] === 'WELDING_TEE'));
const SIF_TYPE_WELDOLET = Number(Object.keys(INPUTXML_KNOWN_SIF_TYPES).find((code) => INPUTXML_KNOWN_SIF_TYPES[code] === 'WELDOLET'));

export function bendToleranceOf(options) {
  return options.bendRadiusTolerance ?? 1e-3;
}

export function attachBendGeometry(segment, edge, _tolerance, diagnostics) {
  const bendTag = firstElement(edge.tag.inner, BEND_TAGS);
  const attrs = bendTag?.attributes || {};
  const declaredRadius = caesarNumberOrNull(attributeValue(attrs, 'RADIUS'));
  const rawAngle1 = rawFiniteNumber(attributeValue(attrs, 'ANGLE1'));
  const rawAngle2 = rawFiniteNumber(attributeValue(attrs, 'ANGLE2'));
  const angle1 = physicalBendAngle(rawAngle1);
  const angle2 = physicalBendAngle(rawAngle2);
  const numMiter = caesarNumberOrNull(attributeValue(attrs, 'NUM_MITER'));
  const node1 = cleanNodeId(attributeValue(attrs, 'NODE1')) || null;
  const node2 = cleanNodeId(attributeValue(attrs, 'NODE2')) || null;
  const internalStationNodes = [node1, node2].filter(
    (nodeId) => nodeId && nodeId !== segment.startNodeId && nodeId !== segment.endNodeId,
  );
  segment.meta.bendDeclaredRadius = declaredRadius ?? undefined;
  segment.meta.bendAngle1 = angle1 ?? undefined;
  segment.meta.bendAngle2 = angle2 ?? undefined;
  segment.meta.numMiter = numMiter ?? undefined;
  segment.meta.bendStationNode1 = node1 ?? undefined;
  segment.meta.bendStationNode2 = node2 ?? undefined;
  if (isDoubleSentinel(rawAngle1)) {
    segment.meta.bendAngle1Automatic = true;
    addDiagnostic(
      diagnostics, 'info', 'BEND_ANGLE_AUTOMATIC_SENTINEL_NORMALIZED',
      `Bend segment ${segment.id} carries ANGLE1=-2.0202 (twice the CAESAR unset sentinel); it is treated as an automatic/unset angle, not a physical -2.0202-degree bend.`,
      { segmentId: segment.id, rawAngle1 },
    );
  }
  const isCompound = angle2 != null || (numMiter != null && numMiter > 1);
  segment.meta.bendCompoundMiter = isCompound || undefined;
  segment.meta.bendInternalStations = internalStationNodes.length > 0 || undefined;
  if (declaredRadius == null) {
    addDiagnostic(diagnostics, 'warn', 'BEND_ARC_GEOMETRY_NOT_DECLARED', `Bend segment ${segment.id} has no declared RADIUS.`, { segmentId: segment.id });
  } else if (isCompound) {
    addDiagnostic(diagnostics, 'warn', 'BEND_COMPOUND_MITER_NOT_SUPPORTED', `Bend segment ${segment.id} is a compound multi-cut miter; one circle cannot represent it.`, { segmentId: segment.id });
  } else if (internalStationNodes.length > 0) {
    addDiagnostic(
      diagnostics, 'warn', 'BEND_INTERNAL_STATION_GEOMETRY_NOT_SUPPORTED',
      `Bend segment ${segment.id} declares internal CAESAR bend station node(s) ${internalStationNodes.join(', ')}. The FROM/TO span is not treated as a tangent-to-tangent arc, so no incorrect centre is fitted.`,
      { segmentId: segment.id, internalStationNodes },
    );
  }
}

function physicalBendAngle(value) {
  if (value == null || Math.abs(value) <= BEND_ANGLE_TOLERANCE || isDoubleSentinel(value)) return null;
  if (Math.abs(value - CAESAR_SENTINEL_VALUE) < CAESAR_SENTINEL_TOLERANCE) return null;
  return value;
}

function isDoubleSentinel(value) {
  return value != null && Math.abs(value - CAESAR_DOUBLE_SENTINEL_VALUE) < CAESAR_SENTINEL_TOLERANCE;
}

export function resolveBendFromPredecessor(segment, segmentsEndingAt, nodeCoords, tolerance, diagnostics) {
  const declaredRadius = segment.meta.bendDeclaredRadius;
  if (declaredRadius == null || segment.meta.bendCompoundMiter || segment.meta.bendInternalStations) return;
  const predecessors = (segmentsEndingAt.get(segment.startNodeId) || []).filter((candidate) => candidate.id !== segment.id);
  if (predecessors.length !== 1) {
    addDiagnostic(
      diagnostics, 'warn', 'BEND_ARC_GEOMETRY_NOT_DECLARED',
      `Bend segment ${segment.id} does not have exactly one predecessor sharing node ${segment.startNodeId}; cannot resolve an unambiguous incoming direction.`,
      { segmentId: segment.id, predecessorCount: predecessors.length },
    );
    return;
  }
  const predecessor = predecessors[0];
  const predecessorStart = nodeCoords.get(predecessor.startNodeId);
  const tangentStart = nodeCoords.get(segment.startNodeId);
  const tangentEnd = nodeCoords.get(segment.endNodeId);
  if (!predecessorStart || !tangentStart || !tangentEnd) return;
  const incomingLength = distance(predecessorStart, tangentStart);
  if (!(incomingLength > 0)) return;
  const incomingDirection = {
    x: (tangentStart.x - predecessorStart.x) / incomingLength,
    y: (tangentStart.y - predecessorStart.y) / incomingLength,
    z: (tangentStart.z - predecessorStart.z) / incomingLength,
  };
  const resolved = resolveBendArcCentre(incomingDirection, tangentStart, tangentEnd);
  if (!resolved) {
    addDiagnostic(diagnostics, 'warn', 'BEND_ARC_GEOMETRY_NOT_DECLARED', `Bend segment ${segment.id} geometry is degenerate; could not resolve an arc centre.`, { segmentId: segment.id });
    return;
  }
  const check = checkDeclaredRadius(resolved.computedRadius, declaredRadius, tolerance);
  if (!check.accepted) {
    addDiagnostic(
      diagnostics, 'warn', 'BEND_ARC_GEOMETRY_NOT_DECLARED',
      `Bend segment ${segment.id} computed radius ${resolved.computedRadius} disagrees with declared RADIUS ${declaredRadius} (relative deviation ${check.relativeDeviation}).`,
      { segmentId: segment.id, ...check },
    );
    return;
  }
  segment.meta.bendArcCentre = resolved.centre;
  segment.meta.bendComputedRadius = resolved.computedRadius;
  addDiagnostic(diagnostics, 'info', 'BEND_ARC_GEOMETRY_RESOLVED', `Bend segment ${segment.id} arc centre resolved from declared radius and incoming direction.`, { segmentId: segment.id });
}

export function applyRestraints(edge, nodesById, restraintTypeCodeMap, mutationConfig, diagnostics) {
  for (const restraint of findAnyElements(edge.tag.inner, RESTRAINT_TAGS)) {
    const nodeNumber = caesarNumberOrNull(attributeValue(restraint.attributes, 'NODE'));
    if (nodeNumber == null) continue;
    const nodeRef = cleanNodeId(String(nodeNumber));
    const target = nodeRef === edge.fromNode ? edge.fromNode : nodeRef === edge.toNode ? edge.toNode : null;
    if (!target) {
      addDiagnostic(
        diagnostics, 'warn', 'INPUTXML_RESTRAINT_NODE_UNRESOLVED',
        `Restraint on element ${edge.index + 1} references node ${nodeRef}, which is neither its FROM_NODE nor TO_NODE.`,
        { elementIndex: edge.index, nodeRef },
      );
      continue;
    }
    const rawType = attributeValue(restraint.attributes, 'TYPE');
    const mutation = resolveRestraintTypeMutation(rawType, mutationConfig);
    const { sourceTypeCode, typeCode } = mutation;
    if (mutation.mutationApplied) {
      addDiagnostic(
        diagnostics, 'info', 'INPUTXML_RESTRAINT_TYPE_MUTATED',
        `Restraint TYPE ${sourceTypeCode} at node ${target} was mutated to ${typeCode} before classification.`,
        {
          elementIndex: edge.index,
          nodeId: target,
          sourceTypeRaw: mutation.sourceTypeRaw,
          sourceTypeCode,
          typeCode,
          mutationLabel: mutation.mutationLabel,
          mutationFrom: mutation.mutationFrom,
          mutationTo: mutation.mutationTo,
        },
      );
    }
    const node = nodesById.get(target);
    const restraints = node.meta.restraints || (node.meta.restraints = []);
    restraints.push({
      sourceTypeRaw: mutation.sourceTypeRaw,
      sourceTypeCode,
      typeCode,
      sourceKind: mutation.sourceKind,
      mutationApplied: mutation.mutationApplied,
      mutationLabel: mutation.mutationLabel,
      mutationFrom: mutation.mutationFrom,
      mutationTo: mutation.mutationTo,
      xCosine: caesarNumberOrNull(attributeValue(restraint.attributes, 'XCOSINE')),
      yCosine: caesarNumberOrNull(attributeValue(restraint.attributes, 'YCOSINE')),
      zCosine: caesarNumberOrNull(attributeValue(restraint.attributes, 'ZCOSINE')),
      frictionCoefficient: caesarNumberOrNull(attributeValue(restraint.attributes, 'FRIC_COEF')),
    });
    const mapped = typeCode == null ? undefined : restraintTypeCodeMap[typeCode];
    if (mapped) node.restraint = mapped;
    else if (node.restraint === 'FREE') node.restraint = 'UNKNOWN';
  }
}

export function classifyElementType(inner) {
  const rigid = firstElement(inner, RIGID_TAGS);
  const rigidType = (attributeValue(rigid?.attributes || {}, 'TYPE', 'RIGID_TYPE') || '').toUpperCase();
  if (rigidType.includes('VALVE')) return 'VALVE';
  if (rigidType.includes('FLANGE') || rigidType.includes('BLIND') || rigidType.includes('GASK')) return 'FLANGE';
  if (firstElement(inner, REDUCER_TAGS)) return 'PIPE';
  for (const sif of findAnyElements(inner, SIF_TAGS)) {
    const typeCode = caesarNumberOrNull(attributeValue(sif.attributes, 'TYPE'));
    if (typeCode != null && Math.abs(typeCode - SIF_TYPE_WELDING_TEE) < 0.001) return 'TEE';
    if (typeCode != null && Math.abs(typeCode - SIF_TYPE_WELDOLET) < 0.001) return 'TEE';
  }
  if (firstElement(inner, BEND_TAGS)) return 'BEND';
  return 'PIPE';
}

export function finalizeNode(node, diagnostics) {
  if (node.x == null) {
    addDiagnostic(diagnostics, 'error', 'INPUTXML_NODE_COORDINATE_UNRESOLVED', `Node ${node.id} could not be solved to a coordinate.`, { nodeId: node.id });
  }
  return node;
}
