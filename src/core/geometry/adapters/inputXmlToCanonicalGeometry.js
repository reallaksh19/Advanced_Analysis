import { CANONICAL_GEOMETRY_SCHEMA_VERSION } from '../geometryTypes.js';
import { validateCanonicalGeometry } from '../validateCanonicalGeometry.js';
import {
  attributeValue,
  findAnyElements,
  findElements,
  firstElement,
} from './inputxml-tag-scanner.js';
import { checkDeclaredRadius, resolveBendArcCentre } from './inputxml-bend-arc.js';

/**
 * CAESAR II InputXML (`<CAESARII><PIPINGMODEL><PIPINGELEMENT>...`) to
 * canonical geometry (`nodes` + `segments`, `schemaVersion: 'canonical-geometry-v1'`).
 *
 * Replaces `pcfToCanonicalGeometry.js` as LFEA's geometry ingestion path.
 * InputXML gives two things PCF never did, both load-bearing for
 * `centerline-beam-fea`: real deflection-based coordinate solving (CAESAR
 * stores relative deltas between nodes, not absolute points, so a route has
 * to be solved, not just read), and a genuine bend radius, which this module
 * turns into an arc centre via `resolveBendArcCentre` — closing the
 * `BEND_ARC_GEOMETRY_NOT_DECLARED` gap LFEA B-1 had to degrade around for
 * every PCF-imported elbow.
 *
 * Ported from the InputXML engine in `reallaksh19/3D_Converters`
 * (`uxml/UxmlInputXmlSchemaMapper.js`), not copied — reimplemented against
 * this repository's `no hidden values, fail closed` rules, which the source
 * engine does not follow in three specific places. Each is a deliberate
 * behavioural change, not an oversight:
 *
 * 1. A disconnected node group is REJECTED (`INPUTXML_DISCONNECTED_NODE_SET`)
 *    instead of silently reseeded at `(0,0,0)` — reseeding an unrelated
 *    routing group at the origin makes it overlap the first group in space.
 *    A caller who genuinely has more than one physical group in one file
 *    supplies `options.componentOrigins` explicitly.
 * 2. Diameter/wall-thickness/material inheritance from the previous element
 *    (a real, common InputXML export convention — CAESAR omits a value that
 *    has not changed) is preserved, but every inheritance is now a
 *    diagnostic (`*_INHERITED_FROM_PRIOR_ELEMENT`), not a silent carry.
 * 3. A restraint's CAESAR `TYPE` numeric code is never guessed into
 *    `ANCHOR`/`GUIDE` — the code table is not standardised enough across
 *    CAESAR II versions to bake in. It classifies as `UNKNOWN` unless the
 *    caller supplies a declared `options.restraintTypeCodeMap`.
 *
 * **Bend arc-centre resolution — verified, and honestly scoped.** The maths
 * in `resolveBendArcCentre` is exact and hand-verified (see its own doc), and
 * `checkDeclaredRadius` refuses to declare a centre the geometry does not
 * support. Run against a real CAESAR II InputXML export (`3D_Converters`
 * benchmark `INLET-SEPARATOR-SKID-C2_INPUT.XML`), most `BEND` elements turned
 * out to be compound, multi-cut miters (two declared angles across one
 * element's FROM/TO span) — correctly refused as `BEND_COMPOUND_MITER_NOT_SUPPORTED`,
 * since a single circle cannot represent two arcs. The one genuinely simple
 * (single-angle) bend in that file still did not pass the radius check,
 * meaning CAESAR's FROM_NODE/TO_NODE convention for an isolated simple bend
 * needs more reverse-engineering than this module attempts — resolving it
 * with more confidence is a scoped-out follow-up, not done here. The
 * load-bearing property is the refusal, not the resolution rate: every
 * bend this module cannot verify stays exactly where PCF left it
 * (`BEND_ARC_GEOMETRY_NOT_DECLARED`, span-seeded only by LFEA B-1), never a
 * silently wrong centre.
 *
 * @param {string} xmlText Raw InputXML text.
 * @param {{unit:string, source?:string, componentOrigins?:Record<string,{x:number,y:number,z:number}>,
 *          restraintTypeCodeMap?:Record<string,'ANCHOR'|'GUIDE'>, bendRadiusTolerance?:number,
 *          fileName?:string}} options
 *        `unit` is required — InputXML does not self-declare length units reliably; guessing
 *        one would be exactly the hidden default this module exists to avoid.
 * @returns {import('../geometryTypes.js').CanonicalGeometry}
 */
export function inputXmlToCanonicalGeometry(xmlText, options = {}) {
  if (!options.unit) {
    throw new TypeError('inputXmlToCanonicalGeometry requires options.unit; InputXML does not declare it reliably.');
  }
  const bendRadiusTolerance = options.bendRadiusTolerance ?? 1e-3;
  const diagnostics = [];
  const source = options.source || 'inputxml';

  const pipingModelAttrs = firstElement(xmlText, ['PIPINGMODEL'])?.attributes || {};
  const jobName = attributeValue(pipingModelAttrs, 'JOBNAME');

  const elementTags = findElements(xmlText, 'PIPINGELEMENT');
  if (elementTags.length === 0) {
    addDiagnostic(diagnostics, 'warn', 'INPUTXML_NO_PIPINGELEMENT', 'No PIPINGELEMENT tags found; nothing to convert.');
  }

  const edges = buildEdges(elementTags, diagnostics);
  const solved = solveNodeCoordinates(edges, options.componentOrigins || {}, diagnostics);
  const { nodes, segments } = buildNodesAndSegments(edges, solved.nodeCoords, options, diagnostics);

  const geometry = {
    schemaVersion: CANONICAL_GEOMETRY_SCHEMA_VERSION,
    nodes,
    segments,
    source,
    unit: options.unit,
    diagnostics: [],
    summary: {
      componentCount: elementTags.length,
      nodeCount: nodes.length,
      segmentCount: segments.length,
      jobName,
    },
  };

  const validation = validateCanonicalGeometry(geometry, { tolerance: options.tolerance, requireKnownUnit: false });
  geometry.diagnostics = [...diagnostics, ...validation.diagnostics];
  geometry.summary = { ...geometry.summary, ...validation.summary, jobName };
  geometry.valid = validation.ok && solved.disconnectedGroups.length === 0;

  return geometry;
}

const CAESAR_SENTINEL_VALUE = -1.0101;
const CAESAR_SENTINEL_TOLERANCE = 0.001;

const BEND_TAGS = ['BEND', 'BENDS', 'ELBOW', 'ELBOWS'];
const RIGID_TAGS = ['RIGID', 'RIGIDS'];
const SIF_TAGS = ['SIF', 'SIFS'];
const REDUCER_TAGS = ['REDUCER', 'REDUCERS', 'REDU', 'REDC', 'REDE'];
const RESTRAINT_TAGS = ['RESTRAINT', 'RESTRAINTS'];

/** Established CAESAR II SIF type codes for branch fittings. */
const SIF_TYPE_WELDING_TEE = 3;
const SIF_TYPE_WELDOLET = 5;

function buildEdges(elementTags, diagnostics) {
  return elementTags.map((tag, index) => {
    const attrs = tag.attributes;
    const fromNode = cleanNodeId(attributeValue(attrs, 'FROM_NODE', 'FROMNODE', 'FROM'));
    const toNode = cleanNodeId(attributeValue(attrs, 'TO_NODE', 'TONODE', 'TO'));
    if (!fromNode || !toNode) {
      addDiagnostic(diagnostics, 'error', 'INPUTXML_ELEMENT_NODE_MISSING', `PIPINGELEMENT #${index + 1} is missing FROM_NODE or TO_NODE.`, { index });
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

/**
 * Solve absolute node coordinates from CAESAR's relative deltas.
 *
 * CAESAR stores `TO = FROM + delta`. Every reachable node is solved by
 * propagating from a seed until no further node can be resolved. Unlike the
 * source engine, an unreachable (disconnected) group is never silently
 * reseeded at the origin — it is reported and left unsolved unless
 * `componentOrigins` declares a seed for it.
 */
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
  // The first element's FROM_NODE anchors the coordinate system at the
  // origin — standard for a relative-coordinate format, and not a hidden
  // default since there is no other candidate origin absent a caller-declared
  // one. `setNode` is a no-op if `componentOrigins` already placed this node,
  // so this never overrides an explicit origin. Every OTHER disconnected
  // group still requires an explicit entry in `componentOrigins`.
  if (edges.length > 0) setNode(edges[0].fromNode, { x: 0, y: 0, z: 0 });
  while (propagate()) { /* until fixed point */ }

  const unsolved = edges.filter((edge) => !nodeCoords.has(edge.fromNode) || !nodeCoords.has(edge.toNode));
  const disconnectedGroups = groupUnsolvedEdges(unsolved);
  disconnectedGroups.forEach((group, groupIndex) => {
    addDiagnostic(diagnostics, 'error', 'INPUTXML_DISCONNECTED_NODE_SET',
      `Node group ${groupIndex + 1} (nodes ${group.join(', ')}) is not connected to the solved route; supply options.componentOrigins to place it.`,
      { nodeIds: group });
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

  let inheritedDiameter = null;
  let inheritedThickness = null;
  let inheritedMaterial = null;
  const segments = [];
  const segmentsByFromNode = new Map();

  edges.forEach((edge) => {
    ensureNode(edge.fromNode);
    ensureNode(edge.toNode);
    applyRestraints(edge, nodesById, options.restraintTypeCodeMap || {}, diagnostics);

    const diameterResult = resolveInheritedField(edge, ['DIAMETER', 'BORE', 'NOMINAL_DIAMETER'], inheritedDiameter, 'DIAMETER', diagnostics);
    inheritedDiameter = diameterResult.carryForward;
    const thicknessResult = resolveInheritedField(edge, ['WALL_THICK', 'THICKNESS'], inheritedThickness, 'WALL_THICK', diagnostics);
    inheritedThickness = thicknessResult.carryForward;
    const materialResult = resolveInheritedStringField(edge, ['MATERIAL_NAME'], inheritedMaterial, 'MATERIAL_NAME', diagnostics);
    inheritedMaterial = materialResult.carryForward;

    const type = classifyElementType(edge.tag.inner);
    const segment = {
      id: `IX-S${edge.index + 1}`,
      startNodeId: edge.fromNode,
      endNodeId: edge.toNode,
      type,
      sourceComponentUid: `PIPINGELEMENT[${edge.index}]`,
      length: null,
      diameter: diameterResult.value ?? undefined,
      thickness: thicknessResult.value ?? undefined,
      material: materialResult.value ?? undefined,
      meta: {
        materialNumber: caesarNumberOrNull(attributeValue(edge.attrs, 'MATERIAL_NUM')),
        sourceType: type,
        sourceIndex: edge.index,
      },
    };
    if (type === 'BEND') attachBendGeometry(segment, edge, segmentsByFromNode, nodeCoords, bendToleranceOf(options), diagnostics);

    segments.push(segment);
    if (!segmentsByFromNode.has(edge.fromNode)) segmentsByFromNode.set(edge.fromNode, []);
    segmentsByFromNode.get(edge.fromNode).push(segment);
  });

  const segmentsEndingAt = new Map();
  segments.forEach((segment) => {
    if (!segmentsEndingAt.has(segment.endNodeId)) segmentsEndingAt.set(segment.endNodeId, []);
    segmentsEndingAt.get(segment.endNodeId).push(segment);
  });
  segments.filter((segment) => segment.type === 'BEND' && !segment.meta.bendArcCentre).forEach((segment) => {
    resolveBendFromPredecessor(segment, segmentsEndingAt, nodeCoords, bendToleranceOf(options), diagnostics);
  });

  const nodes = [...nodesById.values()].map((node) => finalizeNode(node, diagnostics));
  segments.forEach((segment) => {
    const start = nodesById.get(segment.startNodeId);
    const end = nodesById.get(segment.endNodeId);
    if (start.x != null && end.x != null) {
      segment.length = distance(start, end);
    }
  });

  return { nodes, segments };
}

function bendToleranceOf(options) {
  return options.bendRadiusTolerance ?? 1e-3;
}

/**
 * Resolve a bend's arc centre using its declared RADIUS and the direction
 * arriving from the node's predecessor segment(s), when unambiguous. Left
 * undeclared (with a diagnostic) when the geometry cannot be resolved
 * confidently rather than guessed at — LFEA B-1's node-seeding already
 * degrades gracefully to span-only seeding for a bend with no declared arc.
 */
function attachBendGeometry(segment, edge, segmentsByFromNode, nodeCoords, tolerance, diagnostics) {
  const bendTag = firstElement(edge.tag.inner, BEND_TAGS);
  const declaredRadius = caesarNumberOrNull(attributeValue(bendTag?.attributes || {}, 'RADIUS'));
  const angle2 = caesarNumberOrNull(attributeValue(bendTag?.attributes || {}, 'ANGLE2'));
  const numMiter = caesarNumberOrNull(attributeValue(bendTag?.attributes || {}, 'NUM_MITER'));
  segment.meta.bendDeclaredRadius = declaredRadius ?? undefined;
  segment.meta.bendAngle1 = caesarNumberOrNull(attributeValue(bendTag?.attributes || {}, 'ANGLE1')) ?? undefined;
  segment.meta.bendAngle2 = angle2 ?? undefined;
  segment.meta.numMiter = numMiter ?? undefined;
  // A second declared angle (or NUM_MITER > 1) means this element is a
  // compound, multi-cut miter bend: its FROM_NODE/TO_NODE span more than one
  // arc, each needing its own incoming direction and radius, which
  // `resolveBendArcCentre`'s single-circle model cannot represent. Resolving
  // one circle across a compound span would silently produce a wrong centre
  // rather than a missing one — say so plainly instead.
  const isCompound = (angle2 != null) || (numMiter != null && numMiter > 1);
  segment.meta.bendCompoundMiter = isCompound || undefined;
  if (declaredRadius == null) {
    addDiagnostic(diagnostics, 'warn', 'BEND_ARC_GEOMETRY_NOT_DECLARED', `Bend segment ${segment.id} has no declared RADIUS.`, { segmentId: segment.id });
  } else if (isCompound) {
    addDiagnostic(diagnostics, 'warn', 'BEND_COMPOUND_MITER_NOT_SUPPORTED', `Bend segment ${segment.id} is a compound multi-cut miter (more than one declared angle); arc-centre resolution only supports a single simple bend.`, { segmentId: segment.id });
  }
}

function resolveBendFromPredecessor(segment, segmentsEndingAt, nodeCoords, tolerance, diagnostics) {
  const declaredRadius = segment.meta.bendDeclaredRadius;
  if (declaredRadius == null || segment.meta.bendCompoundMiter) return;
  const predecessors = (segmentsEndingAt.get(segment.startNodeId) || []).filter((candidate) => candidate.id !== segment.id);
  if (predecessors.length !== 1) {
    addDiagnostic(diagnostics, 'warn', 'BEND_ARC_GEOMETRY_NOT_DECLARED',
      `Bend segment ${segment.id} does not have exactly one predecessor sharing node ${segment.startNodeId}; cannot resolve an unambiguous incoming direction.`,
      { segmentId: segment.id, predecessorCount: predecessors.length });
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
    addDiagnostic(diagnostics, 'warn', 'BEND_ARC_GEOMETRY_NOT_DECLARED',
      `Bend segment ${segment.id} computed radius ${resolved.computedRadius} disagrees with declared RADIUS ${declaredRadius} (relative deviation ${check.relativeDeviation}).`,
      { segmentId: segment.id, ...check });
    return;
  }
  segment.meta.bendArcCentre = resolved.centre;
  segment.meta.bendComputedRadius = resolved.computedRadius;
  addDiagnostic(diagnostics, 'info', 'BEND_ARC_GEOMETRY_RESOLVED', `Bend segment ${segment.id} arc centre resolved from declared radius and incoming direction.`, { segmentId: segment.id });
}

function applyRestraints(edge, nodesById, restraintTypeCodeMap, diagnostics) {
  for (const restraint of findAnyElements(edge.tag.inner, RESTRAINT_TAGS)) {
    // An unused restraint slot carries the sentinel in NODE, not an empty
    // string (see the module doc on CAESAR's padding convention) — this is
    // not a reference to a real node and must not be flagged as one.
    const nodeNumber = caesarNumberOrNull(attributeValue(restraint.attributes, 'NODE'));
    if (nodeNumber == null) continue;
    const nodeRef = cleanNodeId(String(nodeNumber));
    const target = nodeRef === edge.fromNode ? edge.fromNode : nodeRef === edge.toNode ? edge.toNode : null;
    if (!target) {
      addDiagnostic(diagnostics, 'warn', 'INPUTXML_RESTRAINT_NODE_UNRESOLVED', `Restraint on element ${edge.index + 1} references node ${nodeRef}, which is neither its FROM_NODE nor TO_NODE.`, { elementIndex: edge.index, nodeRef });
      continue;
    }
    const typeCodeNumber = caesarNumberOrNull(attributeValue(restraint.attributes, 'TYPE'));
    const typeCode = typeCodeNumber == null ? null : String(typeCodeNumber);
    const node = nodesById.get(target);
    const restraints = node.meta.restraints || (node.meta.restraints = []);
    restraints.push({
      typeCode,
      xCosine: caesarNumberOrNull(attributeValue(restraint.attributes, 'XCOSINE')),
      yCosine: caesarNumberOrNull(attributeValue(restraint.attributes, 'YCOSINE')),
      zCosine: caesarNumberOrNull(attributeValue(restraint.attributes, 'ZCOSINE')),
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
  if (rigidType.includes('FLANGE') || rigidType.includes('BLIND')) return 'FLANGE';
  if (rigidType.includes('GASK')) return 'FLANGE';

  const reducer = firstElement(inner, REDUCER_TAGS);
  if (reducer) return 'PIPE';

  for (const sif of findAnyElements(inner, SIF_TAGS)) {
    const typeCode = caesarNumberOrNull(attributeValue(sif.attributes, 'TYPE'));
    if (typeCode != null && Math.abs(typeCode - SIF_TYPE_WELDING_TEE) < 0.001) return 'TEE';
    if (typeCode != null && Math.abs(typeCode - SIF_TYPE_WELDOLET) < 0.001) return 'TEE';
  }

  if (firstElement(inner, BEND_TAGS)) return 'BEND';
  return 'PIPE';
}

function resolveInheritedField(edge, attributeNames, previousValue, label, diagnostics) {
  const own = caesarNumberOrNull(attributeValue(edge.attrs, ...attributeNames));
  if (own != null) return { value: own, carryForward: own };
  if (previousValue != null) {
    addDiagnostic(diagnostics, 'info', `${label}_INHERITED_FROM_PRIOR_ELEMENT`, `Element ${edge.index + 1} has no ${label}; inherited ${previousValue} from the prior element.`, { elementIndex: edge.index, value: previousValue });
    return { value: previousValue, carryForward: previousValue };
  }
  return { value: null, carryForward: null };
}

function resolveInheritedStringField(edge, attributeNames, previousValue, label, diagnostics) {
  const own = attributeValue(edge.attrs, ...attributeNames) || null;
  if (own) return { value: own, carryForward: own };
  if (previousValue) {
    addDiagnostic(diagnostics, 'info', `${label}_INHERITED_FROM_PRIOR_ELEMENT`, `Element ${edge.index + 1} has no ${label}; inherited "${previousValue}" from the prior element.`, { elementIndex: edge.index, value: previousValue });
    return { value: previousValue, carryForward: previousValue };
  }
  return { value: null, carryForward: null };
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

function caesarNumberOrNull(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const numeric = Number(text);
  if (!Number.isFinite(numeric)) return null;
  if (Math.abs(numeric - CAESAR_SENTINEL_VALUE) < CAESAR_SENTINEL_TOLERANCE) return null;
  return numeric;
}

function caesarNumberOrZero(value) {
  return caesarNumberOrNull(value) ?? 0;
}

function addDiagnostic(diagnostics, severity, code, message, data = {}) {
  diagnostics.push({ severity, code, message, data });
}
