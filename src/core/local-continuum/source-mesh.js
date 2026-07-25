import { modelError } from './errors.js';
import { positiveNumber, strictNumber, tolerance } from './numeric.js';
import { convert } from './units.js';
import {
  arrayValue, codeUnitCompare, exactRecord, nonEmptyString, uniqueIdentities,
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
    ['elementId', 'nodeIds', 'materialId', 'thickness', 'sourceReference'],
    path,
  );
  const nodeIds = arrayValue(row.nodeIds, `${path}.nodeIds`).map((id, nodeIndex) => (
    nonEmptyString(id, `${path}.nodeIds[${nodeIndex}]`)
  ));
  if (nodeIds.length !== 3) {
    throw modelError(
      'THREE_NODE_ELEMENT_REQUIRED',
      `${path}.nodeIds`,
      'CST elements require exactly three node IDs.',
    );
  }
  if (new Set(nodeIds).size !== 3) {
    throw modelError(
      'REPEATED_ELEMENT_NODE',
      `${path}.nodeIds`,
      'Element node IDs must be distinct.',
    );
  }
  nodeIds.forEach((id) => assertNodeReference(id, nodeMap, path));
  return {
    elementId: nonEmptyString(row.elementId, `${path}.elementId`),
    nodeIds: canonicalTriangleIds(nodeIds, nodeMap),
    materialId: nonEmptyString(row.materialId, `${path}.materialId`),
    thickness: positiveNumber(row.thickness, `${path}.thickness`),
    sourceReference: nonEmptyString(row.sourceReference, `${path}.sourceReference`),
  };
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
      throw modelError('DUPLICATE_TRIANGLE', 'elements', `Duplicate triangle ${key}.`);
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
  const coordinates = row.nodeIds.map((id) => nodeMap.get(id));
  const area = Math.abs(signedDoubleArea(row.nodeIds, nodeMap)) / 2;
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
