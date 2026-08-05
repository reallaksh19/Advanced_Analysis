import { CANONICAL_GEOMETRY_SCHEMA_VERSION } from '../geometryTypes.js';
import { validateCanonicalGeometry } from '../validateCanonicalGeometry.js';
import { attributeValue, findAnyElements, findElements, firstElement } from './inputxml-tag-scanner.js';
import { checkDeclaredRadius, resolveBendArcCentre } from './inputxml-bend-arc.js';
import {
  resolveRestraintTypeMutation,
  normalizeRestraintTypeMutationConfig,
} from './inputxml-restraint-type-mutation.js';
import {
  convertInputXmlLengthToMetres,
  convertInputXmlScalar,
  parseInputXmlUnitSystem,
} from './inputxml-unit-system.js';

/**
 * CAESAR II InputXML to canonical geometry plus traceable analysis-source
 * metadata. The file's own <UNITS> declaration is authoritative when present;
 * `options.unit` remains the fallback for minimal/older files.
 */
export function inputXmlToCanonicalGeometry(xmlText, options = {}) {
  const diagnostics = [];
  const unitSystem = parseInputXmlUnitSystem(xmlText, options.unit, diagnostics);
  if (!unitSystem.lengthUnit) {
    throw new TypeError(
      'inputXmlToCanonicalGeometry requires options.unit when InputXML has no supported <UNITS><LENGTH> declaration.',
    );
  }
  const source = options.source || 'inputxml';
  const pipingModelAttrs = firstElement(xmlText, ['PIPINGMODEL'])?.attributes || {};
  const jobName = attributeValue(pipingModelAttrs, 'JOBNAME');
  const elementTags = findElements(xmlText, 'PIPINGELEMENT');
  if (elementTags.length === 0) {
    addDiagnostic(diagnostics, 'warn', 'INPUTXML_NO_PIPINGELEMENT', 'No PIPINGELEMENT tags found; nothing to convert.');
  }
  const edges = buildEdges(elementTags, diagnostics);
  const solved = solveNodeCoordinates(edges, options.componentOrigins || {}, diagnostics);
  const { nodes, segments } = buildNodesAndSegments(
    edges,
    solved.nodeCoords,
    { ...options, unitSystem },
    diagnostics,
  );
  const geometry = {
    schemaVersion: CANONICAL_GEOMETRY_SCHEMA_VERSION,
    nodes,
    segments,
    source,
    unit: unitSystem.lengthUnit,
    diagnostics: [],
    summary: {
      componentCount: elementTags.length,
      nodeCount: nodes.length,
      segmentCount: segments.length,
      jobName,
      inputXmlUnitsDeclared: unitSystem.declared,
      inputXmlLengthUnit: unitSystem.lengthUnit,
    },
  };
  const validation = validateCanonicalGeometry(geometry, {
    tolerance: options.tolerance,
    requireKnownUnit: false,
  });
  geometry.diagnostics = [...diagnostics, ...validation.diagnostics];
  geometry.summary = { ...geometry.summary, ...validation.summary, jobName };
  geometry.valid = validation.ok
    && solved.disconnectedGroups.length === 0
    && !diagnostics.some((row) => String(row.severity).toLowerCase() === 'error');
  return geometry;
}

const CAESAR_SENTINEL_VALUE = -1.0101;
const CAESAR_DOUBLE_SENTINEL_VALUE = -2.0202;
const CAESAR_SENTINEL_TOLERANCE = 0.001;
const BEND_ANGLE_TOLERANCE = 1e-9;
const BEND_TAGS = ['BEND', 'BENDS', 'ELBOW', 'ELBOWS'];
const RIGID_TAGS = ['RIGID', 'RIGIDS'];
const SIF_TAGS = ['SIF', 'SIFS'];
const HANGER_TAGS = ['HANGER', 'HANGERS'];
const FORCES_MOMENTS_TAGS = ['FORCESMOMENTS'];
const ALLOWABLE_STRESS_TAGS = ['ALLOWABLESTRESS'];
const REDUCER_TAGS = ['REDUCER', 'REDUCERS', 'REDU', 'REDC', 'REDE'];
const RESTRAINT_TAGS = ['RESTRAINT', 'RESTRAINTS'];
const SIF_TYPE_WELDING_TEE = 3;
const SIF_TYPE_WELDOLET = 5;

function buildEdges(elementTags, diagnostics) {
  return elementTags.map((tag, index) => {
    const attrs = tag.attributes;
    const fromNode = cleanNodeId(attributeValue(attrs, 'FROM_NODE', 'FROMNODE', 'FROM'));
    const toNode = cleanNodeId(attributeValue(attrs, 'TO_NODE', 'TONODE', 'TO'));
    if (!fromNode || !toNode) {
      addDiagnostic(
        diagnostics,
        'error',
        'INPUTXML_ELEMENT_NODE_MISSING',
        `PIPINGELEMENT #${index + 1} is missing FROM_NODE or TO_NODE.`,
        { index },
      );
    }
    return {
      index,
      tag,
      attrs,
      fromNode,
      toNode,
      dx: caesarNumberOrZero(attributeValue(attrs, 'DELTA_X', 'DX')),
      dy: caesarNumberOrZero(attributeValue(attrs, 'DELTA_Y', 'DY')),
      dz: caesarNumberOrZero(attributeValue(attrs, 'DELTA_Z', 'DZ')),
    };
  }).filter((edge) => edge.fromNode && edge.toNode);
}

function solveNodeCoordinates(edges, componentOrigins, diagnostics) {
  const nodeCoords = new Map();
  const setNode = (id, point) => {
    if (!id || nodeCoords.has(id)) return false;
    nodeCoords.set(id, point);
    return true;
  };
  const propagate = () => {
    let changed = false;
    for (const edge of edges) {
      const from = nodeCoords.get(edge.fromNode);
      const to = nodeCoords.get(edge.toNode);
      if (from && !to) changed = setNode(edge.toNode, translate(from, edge.dx, edge.dy, edge.dz)) || changed;
      else if (!from && to) changed = setNode(edge.fromNode, translate(to, -edge.dx, -edge.dy, -edge.dz)) || changed;
    }
    return changed;
  };
  for (const [nodeId, point] of Object.entries(componentOrigins)) setNode(cleanNodeId(nodeId), point);
  if (edges.length > 0) setNode(edges[0].fromNode, { x: 0, y: 0, z: 0 });
  while (propagate()) { /* fixed point */ }
  const unsolved = edges.filter((edge) => !nodeCoords.has(edge.fromNode) || !nodeCoords.has(edge.toNode));
  const disconnectedGroups = groupUnsolvedEdges(unsolved);
  disconnectedGroups.forEach((group, groupIndex) => {
    addDiagnostic(
      diagnostics,
      'error',
      'INPUTXML_DISCONNECTED_NODE_SET',
      `Node group ${groupIndex + 1} (nodes ${group.join(', ')}) is not connected to the solved route; supply options.componentOrigins to place it.`,
      { nodeIds: group },
    );
  });
  return { nodeCoords, disconnectedGroups };
}

function groupUnsolvedEdges(unsolvedEdges) {
  const parent = new Map();
  const find = (id) => {
    let root = id;
    while (parent.get(root) !== root && parent.has(root)) root = parent.get(root);
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };
  for (const edge of unsolvedEdges) {
    if (!parent.has(edge.fromNode)) parent.set(edge.fromNode, edge.fromNode);
    if (!parent.has(edge.toNode)) parent.set(edge.toNode, edge.toNode);
    union(edge.fromNode, edge.toNode);
  }
  const groups = new Map();
  for (const id of parent.keys()) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(id);
  }
  return [...groups.values()].map((group) => group.sort());
}

function buildNodesAndSegments(edges, nodeCoords, options, diagnostics) {
  const nodesById = new Map();
  const ensureNode = (nodeId) => {
    if (!nodesById.has(nodeId)) {
      const point = nodeCoords.get(nodeId);
      nodesById.set(nodeId, {
        id: nodeId,
        x: point ? point.x : null,
        y: point ? point.y : null,
        z: point ? point.z : null,
        restraint: 'FREE',
        meta: { caesarNodeNumber: nodeId },
      });
    }
    return nodesById.get(nodeId);
  };
  const carry = Object.create(null);
  const segments = [];
  const segmentsByFromNode = new Map();
  const mutationConfig = normalizeRestraintTypeMutationConfig(options.restraintTypeMutation);
  edges.forEach((edge) => {
    ensureNode(edge.fromNode);
    ensureNode(edge.toNode);
    applyRestraints(edge, nodesById, options.restraintTypeCodeMap || {}, mutationConfig, diagnostics);
    const diameter = inheritedSourceField(edge, ['DIAMETER', 'BORE', 'NOMINAL_DIAMETER'], carry, 'diameter', 'DIAMETER', diagnostics);
    const thickness = inheritedSourceField(edge, ['WALL_THICK', 'THICKNESS'], carry, 'thickness', 'WALL_THICK', diagnostics);
    const material = inheritedStringField(edge, ['MATERIAL_NAME'], carry, 'material', 'MATERIAL_NAME', diagnostics);
    const analysis = analysisMetadata(edge, carry, options.unitSystem, diagnostics);
    const type = classifyElementType(edge.tag.inner);
    const segment = {
      id: `IX-S${edge.index + 1}`,
      startNodeId: edge.fromNode,
      endNodeId: edge.toNode,
      type,
      sourceComponentUid: `PIPINGELEMENT[${edge.index}]`,
      length: null,
      diameter: diameter ?? undefined,
      thickness: thickness ?? undefined,
      material: material ?? undefined,
      meta: {
        materialNumber: caesarNumberOrNull(attributeValue(edge.attrs, 'MATERIAL_NUM')),
        sourceType: type,
        sourceIndex: edge.index,
        analysis,
      },
    };
    attachChildEvidence(segment, edge, options.unitSystem, diagnostics);
    if (type === 'BEND') {
      attachBendGeometry(segment, edge, bendToleranceOf(options), diagnostics);
    }
    segments.push(segment);
    if (!segmentsByFromNode.has(edge.fromNode)) segmentsByFromNode.set(edge.fromNode, []);
    segmentsByFromNode.get(edge.fromNode).push(segment);
  });
  const segmentsEndingAt = new Map();
  segments.forEach((segment) => {
    if (!segmentsEndingAt.has(segment.endNodeId)) segmentsEndingAt.set(segment.endNodeId, []);
    segmentsEndingAt.get(segment.endNodeId).push(segment);
  });
  segments.filter((segment) => segment.type === 'BEND' && !segment.meta.bendArcCentre)
    .forEach((segment) => resolveBendFromPredecessor(
      segment, segmentsEndingAt, nodeCoords, bendToleranceOf(options), diagnostics,
    ));
  const nodes = [...nodesById.values()].map((node) => finalizeNode(node, diagnostics));
  segments.forEach((segment) => {
    const start = nodesById.get(segment.startNodeId);
    const end = nodesById.get(segment.endNodeId);
    if (start.x != null && end.x != null) segment.length = distance(start, end);
  });
  return { nodes, segments };
}

function inheritedSourceField(edge, names, carry, key, label, diagnostics) {
  const own = caesarNumberOrNull(attributeValue(edge.attrs, ...names));
  if (own != null) {
    carry[key] = own;
    return own;
  }
  if (carry[key] != null) {
    inheritedDiagnostic(edge, label, carry[key], diagnostics);
    return carry[key];
  }
  return null;
}

function inheritedStringField(edge, names, carry, key, label, diagnostics) {
  const own = attributeValue(edge.attrs, ...names) || null;
  if (own) {
    carry[key] = own;
    return own;
  }
  if (carry[key]) {
    inheritedDiagnostic(edge, label, carry[key], diagnostics);
    return carry[key];
  }
  return null;
}

function inheritedCanonicalField({ edge, names, carry, key, label, diagnostics, declaration, quantity, convert }) {
  const own = caesarNumberOrNull(attributeValue(edge.attrs, ...names));
  if (own != null) {
    let canonical;
    try {
      canonical = convert ? convert(own) : convertInputXmlScalar(own, declaration, quantity);
    } catch (error) {
      addDiagnostic(
        diagnostics,
        'error',
        'INPUTXML_UNIT_DECLARATION_REQUIRED',
        error instanceof Error ? error.message : String(error),
        { elementIndex: edge.index, field: label },
      );
      return null;
    }
    carry[key] = canonical;
    return canonical;
  }
  if (carry[key] != null) {
    inheritedDiagnostic(edge, label, carry[key], diagnostics);
    return carry[key];
  }
  return null;
}

function inheritedDiagnostic(edge, label, value, diagnostics) {
  addDiagnostic(
    diagnostics,
    'info',
    `${label}_INHERITED_FROM_PRIOR_ELEMENT`,
    `Element ${edge.index + 1} has no ${label}; inherited ${value} from the prior element.`,
    { elementIndex: edge.index, value },
  );
}

function analysisMetadata(edge, carry, units, diagnostics) {
  const length = (value) => convertInputXmlLengthToMetres(value, units.lengthUnit);
  return {
    elasticModulus: inheritedCanonicalField({ edge, names: ['MODULUS'], carry, key: 'elasticModulus', label: 'MODULUS', diagnostics, declaration: units.elasticModulus, quantity: 'EMOD' }),
    poissonRatio: inheritedCanonicalField({ edge, names: ['POISSONS'], carry, key: 'poissonRatio', label: 'POISSONS', diagnostics, convert: (value) => value }),
    operatingTemperature: inheritedCanonicalField({ edge, names: ['TEMP_EXP_C1'], carry, key: 'operatingTemperature', label: 'TEMP_EXP_C1', diagnostics, declaration: units.temperature, quantity: 'TEMP' }),
    operatingTemperature2: inheritedCanonicalField({ edge, names: ['TEMP_EXP_C2'], carry, key: 'operatingTemperature2', label: 'TEMP_EXP_C2', diagnostics, declaration: units.temperature, quantity: 'TEMP' }),
    pressure: inheritedCanonicalField({ edge, names: ['PRESSURE1'], carry, key: 'pressure', label: 'PRESSURE1', diagnostics, declaration: units.pressure, quantity: 'PRESSURE' }),
    hydroPressure: inheritedCanonicalField({ edge, names: ['HYDRO_PRESSURE'], carry, key: 'hydroPressure', label: 'HYDRO_PRESSURE', diagnostics, declaration: units.pressure, quantity: 'PRESSURE' }),
    fluidDensity: inheritedCanonicalField({ edge, names: ['FLUID_DENSITY', 'FDENSITY'], carry, key: 'fluidDensity', label: 'FLUID_DENSITY', diagnostics, declaration: units.fluidDensity, quantity: 'FDENS' }),
    pipeDensity: inheritedCanonicalField({ edge, names: ['PIPE_DENSITY', 'PDENSITY'], carry, key: 'pipeDensity', label: 'PIPE_DENSITY', diagnostics, declaration: units.pipeDensity, quantity: 'PDENS' }),
    insulationThickness: inheritedCanonicalField({ edge, names: ['INSUL_THICK'], carry, key: 'insulationThickness', label: 'INSUL_THICK', diagnostics, convert: length }),
    insulationDensity: inheritedCanonicalField({ edge, names: ['INSUL_DENSITY', 'IDENSITY'], carry, key: 'insulationDensity', label: 'INSUL_DENSITY', diagnostics, declaration: units.insulationDensity, quantity: 'IDENS' }),
    corrosionAllowance: inheritedCanonicalField({ edge, names: ['CORR_ALLOW'], carry, key: 'corrosionAllowance', label: 'CORR_ALLOW', diagnostics, convert: length }),
  };
}

function attachChildEvidence(segment, edge, units, diagnostics) {
  const rigid = firstElement(edge.tag.inner, RIGID_TAGS);
  if (rigid) {
    const rawWeight = caesarNumberOrNull(attributeValue(rigid.attributes, 'WEIGHT'));
    segment.meta.analysis.rigid = {
      type: attributeValue(rigid.attributes, 'TYPE', 'RIGID_TYPE') || null,
      weight: rawWeight == null ? null : safeConvert(rawWeight, units.force, 'FORCE', edge, diagnostics),
    };
  }
  const sifs = findAnyElements(edge.tag.inner, SIF_TAGS)
    .map((tag) => ({
      nodeId: cleanNodeId(attributeValue(tag.attributes, 'NODE')) || null,
      typeCode: caesarNumberOrNull(attributeValue(tag.attributes, 'TYPE')),
      inPlane: caesarNumberOrNull(attributeValue(tag.attributes, 'SIF_IN')),
      outOfPlane: caesarNumberOrNull(attributeValue(tag.attributes, 'SIF_OUT')),
    }))
    .filter((row) => row.nodeId !== null);
  if (sifs.length > 0) {
    segment.meta.analysis.sifs = sifs;
    addDiagnostic(
      diagnostics, 'warn', 'INPUTXML_SIF_PRESENT_NOT_COMPILED',
      `Element ${edge.index + 1} contains ${sifs.length} active SIF record(s); their evidence is retained but no SIF override is silently applied by geometry ingestion.`,
      { elementIndex: edge.index, sifs },
    );
  }
  const hangers = findAnyElements(edge.tag.inner, HANGER_TAGS)
    .map((tag) => ({
      nodeId: cleanNodeId(attributeValue(tag.attributes, 'NODE')) || null,
      hangerTable: caesarNumberOrNull(attributeValue(tag.attributes, 'HGR_TABLE')),
      loadVariation: caesarNumberOrNull(attributeValue(tag.attributes, 'LOAD_VAR')),
    }))
    .filter((row) => row.nodeId !== null);
  if (hangers.length > 0) {
    segment.meta.analysis.hangers = hangers;
    addDiagnostic(
      diagnostics, 'warn', 'INPUTXML_HANGER_PRESENT_NOT_COMPILED',
      `Element ${edge.index + 1} contains ${hangers.length} active HANGER record(s); they are retained and explicitly reported as unsupported rather than dropped.`,
      { elementIndex: edge.index, hangers },
    );
  }
  const forcesMoments = findAnyElements(edge.tag.inner, FORCES_MOMENTS_TAGS)
    .map((tag) => {
      const nodeNumber = caesarNumberOrNull(attributeValue(tag.attributes, 'NODE_NUM', 'NODE'));
      const nodeId = nodeNumber == null ? null : cleanNodeId(String(nodeNumber));
      const vectors = findElements(tag.inner, 'VECTOR')
        .map((vector) => ({
          number: caesarNumberOrNull(attributeValue(vector.attributes, 'NUMBER')),
          force: {
            fx: convertedOptional(vector, 'FX', units.force, 'FORCE', edge, diagnostics),
            fy: convertedOptional(vector, 'FY', units.force, 'FORCE', edge, diagnostics),
            fz: convertedOptional(vector, 'FZ', units.force, 'FORCE', edge, diagnostics),
          },
          moment: {
            mx: convertedOptionalMoment(vector, 'MX', units, edge, diagnostics),
            my: convertedOptionalMoment(vector, 'MY', units, edge, diagnostics),
            mz: convertedOptionalMoment(vector, 'MZ', units, edge, diagnostics),
          },
        }))
        .filter((row) => row.number !== null);
      return {
        forceMomentNumber: caesarNumberOrNull(attributeValue(tag.attributes, 'FORCMNT_NUM')),
        nodeId,
        vectors,
      };
    })
    .filter((row) => row.nodeId !== null);
  if (forcesMoments.length > 0) {
    segment.meta.analysis.forcesMoments = forcesMoments;
    addDiagnostic(
      diagnostics, 'warn', 'INPUTXML_FORCES_MOMENTS_PRESENT_NOT_COMPILED',
      `Element ${edge.index + 1} contains ${forcesMoments.length} active FORCESMOMENTS record(s); their vectors are retained but no external nodal load is applied by geometry ingestion.`,
      { elementIndex: edge.index, forcesMoments },
    );
  }
  const allowableCount = findAnyElements(edge.tag.inner, ALLOWABLE_STRESS_TAGS).length;
  if (allowableCount > 0) {
    segment.meta.analysis.allowableStressRecordCount = allowableCount;
    addDiagnostic(
      diagnostics, 'info', 'INPUTXML_ALLOWABLE_STRESS_RECORD_PRESENT',
      `Element ${edge.index + 1} contains ALLOWABLESTRESS data; geometry ingestion records its presence but B-4 authority remains separately declared.`,
      { elementIndex: edge.index, recordCount: allowableCount },
    );
  }
}

function convertedOptional(tag, attribute, declaration, quantity, edge, diagnostics) {
  const value = caesarNumberOrNull(attributeValue(tag.attributes, attribute));
  return value == null ? null : safeConvert(value, declaration, quantity, edge, diagnostics);
}

function convertedOptionalMoment(tag, attribute, units, edge, diagnostics) {
  const value = caesarNumberOrNull(attributeValue(tag.attributes, attribute));
  if (value == null) return null;
  if (!units.momentInput) {
    addDiagnostic(
      diagnostics, 'error', 'INPUTXML_UNIT_DECLARATION_REQUIRED',
      'InputXML <UNITS> must declare MOMENT-INPUT to convert moment inputs.',
      { elementIndex: edge.index, quantity: 'MOMENT' },
    );
    return null;
  }
  return safeConvert(value, units.momentInput, 'MOMENT-INPUT', edge, diagnostics);
}

function safeConvert(value, declaration, quantity, edge, diagnostics) {
  try {
    return convertInputXmlScalar(value, declaration, quantity);
  } catch (error) {
    addDiagnostic(
      diagnostics, 'error', 'INPUTXML_UNIT_DECLARATION_REQUIRED',
      error instanceof Error ? error.message : String(error),
      { elementIndex: edge.index, quantity },
    );
    return null;
  }
}

function bendToleranceOf(options) {
  return options.bendRadiusTolerance ?? 1e-3;
}

function attachBendGeometry(segment, edge, _tolerance, diagnostics) {
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

function resolveBendFromPredecessor(segment, segmentsEndingAt, nodeCoords, tolerance, diagnostics) {
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

function applyRestraints(edge, nodesById, restraintTypeCodeMap, mutationConfig, diagnostics) {
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

function classifyElementType(inner) {
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

function finalizeNode(node, diagnostics) {
  if (node.x == null) {
    addDiagnostic(diagnostics, 'error', 'INPUTXML_NODE_COORDINATE_UNRESOLVED', `Node ${node.id} could not be solved to a coordinate.`, { nodeId: node.id });
  }
  return node;
}

function translate(point, dx, dy, dz) {
  return { x: point.x + dx, y: point.y + dy, z: point.z + dz };
}
function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}
function cleanNodeId(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const numeric = Number(text);
  return Number.isFinite(numeric) ? String(numeric) : text;
}
function rawFiniteNumber(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric : null;
}
function caesarNumberOrNull(value) {
  const numeric = rawFiniteNumber(value);
  if (numeric == null) return null;
  if (Math.abs(numeric - CAESAR_SENTINEL_VALUE) < CAESAR_SENTINEL_TOLERANCE) return null;
  return numeric;
}
function caesarNumberOrZero(value) {
  return caesarNumberOrNull(value) ?? 0;
}
function addDiagnostic(diagnostics, severity, code, message, data = {}) {
  diagnostics.push({ severity, code, message, data });
}
