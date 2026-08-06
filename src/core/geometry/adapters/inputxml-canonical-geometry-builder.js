import { CANONICAL_GEOMETRY_SCHEMA_VERSION } from '../geometryTypes.js';
import { validateCanonicalGeometry } from '../validateCanonicalGeometry.js';
import { attributeValue } from './inputxml-tag-scanner.js';
import { normalizeRestraintTypeMutationConfig } from './inputxml-restraint-type-mutation.js';
import { convertInputXmlLengthToMetres, convertInputXmlScalar } from './inputxml-unit-system.js';
import {
  addDiagnostic,
  applyRestraints,
  attachBendGeometry,
  attachChildEvidence,
  bendToleranceOf,
  caesarNumberOrNull,
  caesarNumberOrZero,
  classifyElementType,
  cleanNodeId,
  distance,
  finalizeNode,
  resolveBendFromPredecessor,
  translate,
} from './inputxml-canonical-geometry-features.js';

export function buildInputXmlCanonicalGeometry({
  elementTags,
  unitSystem,
  sourceLabel,
  jobName,
  options,
  diagnostics,
}) {
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
    source: sourceLabel,
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
  return { geometry, edges };
}

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
