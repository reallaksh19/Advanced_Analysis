import { ELEMENT_TYPES, ELEMENT_TYPE_CORNER_COUNTS, ELEMENT_TYPE_NODE_COUNTS } from './constants.js';
import { modelError } from './errors.js';
import { positiveNumber, strictNumber, tolerance } from './numeric.js';
import { convert } from './units.js';
import {
  arrayValue, codeUnitCompare, enumValue, exactRecord, nonEmptyString, uniqueIdentities,
} from './validation.js';

export function normalizeMaterials(values) {
  const rows = arrayValue(values, 'materials').map((value, index) => {
    const path = `materials[${index}]`;
    const row = exactRecord(
      value,
      ['materialId', 'elasticModulus', 'poissonRatio', 'sourceReference'],
      path,
    );
    const poissonRatio = strictNumber(row.poissonRatio, `${path}.poissonRatio`);
    if (!(poissonRatio > -1 && poissonRatio < 0.5)) {
      throw modelError(
        'POISSON_RATIO_OUT_OF_RANGE',
        `${path}.poissonRatio`,
        'Poisson ratio must satisfy -1 < nu < 0.5.',
      );
    }
    return {
      materialId: nonEmptyString(row.materialId, `${path}.materialId`),
      elasticModulus: positiveNumber(row.elasticModulus, `${path}.elasticModulus`),
      poissonRatio,
      sourceReference: nonEmptyString(row.sourceReference, `${path}.sourceReference`),
    };
  });
  uniqueIdentities(rows, 'materialId', 'materials');
  return rows.sort((left, right) => codeUnitCompare(left.materialId, right.materialId));
}

export function normalizeNodes(values) {
  const rows = arrayValue(values, 'nodes').map((value, index) => {
    const path = `nodes[${index}]`;
    const row = exactRecord(value, ['nodeId', 'x', 'y', 'sourceReference'], path);
    return {
      nodeId: nonEmptyString(row.nodeId, `${path}.nodeId`),
      x: strictNumber(row.x, `${path}.x`),
      y: strictNumber(row.y, `${path}.y`),
      sourceReference: nonEmptyString(row.sourceReference, `${path}.sourceReference`),
    };
  });
  uniqueIdentities(rows, 'nodeId', 'nodes');
  return rows.sort((left, right) => codeUnitCompare(left.nodeId, right.nodeId));
}

export function normalizeElements(values, nodes) {
  const nodeMap = new Map(nodes.map((row) => [row.nodeId, row]));
  const rows = arrayValue(values, 'elements').map((value, index) => (
    normalizeElement(value, index, nodeMap)
  ));
  uniqueIdentities(rows, 'elementId', 'elements');
  rejectDuplicateTriangles(rows);
  return rows.sort((left, right) => codeUnitCompare(left.elementId, right.elementId));
}

function normalizeElement(value, index, nodeMap) {
  const path = `elements[${index}]`;
  const row = exactRecord(
    value,
    ['elementId', 'elementType', 'nodeIds', 'materialId', 'thickness', 'sourceReference'],
    path,
  );
  const elementType = enumValue(row.elementType, ELEMENT_TYPES, `${path}.elementType`);
  const nodeIds = arrayValue(row.nodeIds, `${path}.nodeIds`).map((id, nodeIndex) => (
    nonEmptyString(id, `${path}.nodeIds[${nodeIndex}]`)
  ));
  const expectedCount = ELEMENT_TYPE_NODE_COUNTS[elementType];
  if (nodeIds.length !== expectedCount) {
    throw modelError(
      'ELEMENT_NODE_COUNT_MISMATCH',
      `${path}.nodeIds`,
      `${elementType} elements require exactly ${expectedCount} node IDs.`,
    );
  }
  if (new Set(nodeIds).size !== nodeIds.length) {
    throw modelError(
      'REPEATED_ELEMENT_NODE',
      `${path}.nodeIds`,
      'Element node IDs must be distinct.',
    );
  }
  nodeIds.forEach((id) => assertNodeReference(id, nodeMap, path));
  return {
    elementId: nonEmptyString(row.elementId, `${path}.elementId`),
    elementType,
    // T3's declared node order is not semantically meaningful (any rotation/
    // reflection is the same triangle) and is canonicalized for determinism.
    // T6/Q8 node order IS meaningful (corner/midside position) and is
    // preserved exactly as declared, with a required-CCW check that rejects
    // rather than silently repairs a clockwise declaration.
    nodeIds: elementType === ELEMENT_TYPES.T3
      ? canonicalTriangleIds(nodeIds, nodeMap)
      : requireCounterClockwiseCorners(nodeIds, elementType, nodeMap, path),
    materialId: nonEmptyString(row.materialId, `${path}.materialId`),
    thickness: positiveNumber(row.thickness, `${path}.thickness`),
    sourceReference: nonEmptyString(row.sourceReference, `${path}.sourceReference`),
  };
}

function requireCounterClockwiseCorners(nodeIds, elementType, nodeMap, path) {
  const cornerCount = ELEMENT_TYPE_CORNER_COUNTS[elementType];
  const corners = nodeIds.slice(0, cornerCount);
  if (!(polygonSignedArea(corners, nodeMap) > 0)) {
    throw modelError(
      'ELEMENT_NOT_COUNTERCLOCKWISE',
      `${path}.nodeIds`,
      `${elementType} corner nodes (first ${cornerCount} of nodeIds) must be declared counter-clockwise.`,
    );
  }
  return nodeIds;
}

function polygonSignedArea(cornerIds, nodeMap) {
  const points = cornerIds.map((id) => nodeMap.get(id));
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]; const b = points[(index + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function assertNodeReference(nodeId, nodeMap, path) {
  if (!nodeMap.has(nodeId)) {
    throw modelError(
      'UNRESOLVED_NODE_REFERENCE',
      `${path}.nodeIds`,
      `Unknown node ${nodeId}.`,
    );
  }
}

function rejectDuplicateTriangles(rows) {
  const sets = new Set();
  rows.forEach((row) => {
    const key = [...row.nodeIds].sort(codeUnitCompare).join('\0');
    if (sets.has(key)) {
      throw modelError('DUPLICATE_ELEMENT_NODE_SET', 'elements', `Duplicate element node set ${key}.`);
    }
    sets.add(key);
  });
}

function canonicalTriangleIds(nodeIds, nodeMap) {
  let ordered = [...nodeIds];
  if (signedDoubleArea(ordered, nodeMap) < 0) {
    ordered = [ordered[0], ordered[2], ordered[1]];
  }
  const rotations = [
    ordered,
    [ordered[1], ordered[2], ordered[0]],
    [ordered[2], ordered[0], ordered[1]],
  ];
  return rotations.sort((left, right) => (
    codeUnitCompare(left.join('\0'), right.join('\0'))
  ))[0];
}

function signedDoubleArea(nodeIds, nodeMap) {
  const [a, b, c] = nodeIds.map((id) => nodeMap.get(id));
  return (b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y);
}

export function canonicalMaterial(row, units) {
  return {
    ...row,
    elasticModulus: convert(
      row.elasticModulus,
      'modulus',
      units,
      `materials.${row.materialId}.elasticModulus`,
    ),
    sourceUnit: units.declared.modulus,
    canonicalUnit: units.canonical.modulus,
  };
}

export function canonicalNode(row, units) {
  return {
    ...row,
    x: convert(row.x, 'length', units, `nodes.${row.nodeId}.x`),
    y: convert(row.y, 'length', units, `nodes.${row.nodeId}.y`),
    sourceUnit: units.declared.length,
    canonicalUnit: units.canonical.length,
  };
}

export function canonicalElements(rows, nodes, units, profile) {
  const nodeMap = new Map(nodes.map((row) => [row.nodeId, row]));
  return rows.map((row) => canonicalElement(row, nodeMap, units, profile));
}

function canonicalElement(row, nodeMap, units, profile) {
  const thickness = convert(
    row.thickness,
    'length',
    units,
    `elements.${row.elementId}.thickness`,
  );
  // Area is computed from the element's corner nodes (all of them for T3;
  // the first `cornerCount` of nodeIds for T6/Q8) — a straight-edge polygon
  // approximation of the true (possibly curved-boundary) area, sufficient
  // for this degeneracy sanity check without claiming exact curved area.
  const cornerCount = ELEMENT_TYPE_CORNER_COUNTS[row.elementType];
  const cornerIds = row.nodeIds.slice(0, cornerCount);
  const coordinates = cornerIds.map((id) => nodeMap.get(id));
  const area = Math.abs(polygonSignedArea(cornerIds, nodeMap));
  const scale = geometryScale(coordinates);
  const limit = tolerance(profile, 'minimumElementArea', scale ** 2);
  if (!(area > limit)) {
    throw modelError(
      'DEGENERATE_ELEMENT',
      `elements.${row.elementId}`,
      `Element area ${area} does not exceed ${limit}.`,
    );
  }
  return {
    ...row,
    thickness,
    sourceUnit: units.declared.length,
    canonicalUnit: units.canonical.length,
    signedAreaBeforeNormalization: area,
    canonicalArea: area,
    orientation: 'COUNTER_CLOCKWISE',
    areaQualification: {
      geometryScale: scale,
      area,
      tolerance: limit,
      accepted: true,
    },
  };
}

function geometryScale(nodes) {
  let scale = 0;
  for (let left = 0; left < nodes.length; left += 1) {
    for (let right = left + 1; right < nodes.length; right += 1) {
      scale = Math.max(
        scale,
        Math.hypot(nodes[left].x - nodes[right].x, nodes[left].y - nodes[right].y),
      );
    }
  }
  return scale;
}
