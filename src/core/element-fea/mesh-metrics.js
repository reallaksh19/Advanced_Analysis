import { deepFreeze } from '../shared-piping-model/immutable.js';
import { ELEMENT_TYPES } from './constants.js';
import { Q4_GAUSS_POINTS } from './integration-points.js';
import { createQ4PointGeometry } from './q4-geometry.js';
import { signedArea } from './t3-geometry.js';

export function elementPhysicalArea(element, nodeMap) {
  const nodes = element.nodeIds.map((id) => requiredNode(nodeMap, id));
  if (element.type === ELEMENT_TYPES.T3) return t3Area(nodes);
  if (element.type === ELEMENT_TYPES.Q4) return q4Area(nodes);
  throw new TypeError(`Unsupported element type for mesh metric: ${element.type}.`);
}

export function deriveRegionMeshMetrics(model, region) {
  const nodeMap = new Map(model.nodes.map((row) => [row.nodeId, row]));
  const elementMap = new Map(model.elements.map((row) => [row.elementId, row]));
  const elementIds = normalizedElementIds(region, elementMap);
  const rows = elementIds.map((elementId) => areaRow(elementMap.get(elementId), nodeMap));
  const sizes = rows.map((row) => Math.sqrt(row.area));
  const composition = countTypes(rows);
  return deepFreeze({
    regionId: requiredText(region.regionId, 'studyRegion.regionId'),
    characteristicSize: Math.max(...sizes),
    minimumElementSize: Math.min(...sizes),
    maximumElementSize: Math.max(...sizes),
    meanElementSize: sizes.reduce((sum, value) => sum + value, 0) / sizes.length,
    regionElementCount: rows.length,
    t3Count: composition.T3,
    q4Count: composition.Q4,
    elementAreas: rows,
  });
}

export function refinementRatios(levelMetrics) {
  return deepFreeze(levelMetrics.slice(0, -1).map((row, index) => {
    const fine = levelMetrics[index + 1];
    const ratio = row.characteristicSize / fine.characteristicSize;
    if (!(ratio > 1) || !Number.isFinite(ratio)) throw new TypeError('Characteristic mesh size must strictly decrease across declared levels.');
    return { coarseLevelId: row.levelId, fineLevelId: fine.levelId, ratio };
  }));
}

function q4Area(nodes) {
  const value = Q4_GAUSS_POINTS.reduce((sum, point) => {
    const determinant = createQ4PointGeometry(nodes, point).determinant;
    if (!(determinant > 0)) throw new TypeError('Q4 area requires positive Jacobian determinant at every integration point.');
    return sum + determinant * point.weight;
  }, 0);
  if (!(value > 0) || !Number.isFinite(value)) throw new TypeError('Q4 physical area must be positive and finite.');
  return value;
}

function t3Area(nodes) {
  const area = signedArea(nodes);
  if (!(area > 0) || !Number.isFinite(area)) throw new TypeError('T3 physical area must be positive and finite.');
  return area;
}

function areaRow(element, nodeMap) {
  const area = elementPhysicalArea(element, nodeMap);
  return { elementId: element.elementId, elementType: element.type, area, elementSize: Math.sqrt(area) };
}
function normalizedElementIds(region, elementMap) {
  if (!region || typeof region !== 'object' || !Array.isArray(region.elementIds) || !region.elementIds.length) throw new TypeError('studyRegion.elementIds must be nonempty.');
  const rows = region.elementIds.map((id) => requiredText(id, 'studyRegion.elementId')).sort(compare);
  if (new Set(rows).size !== rows.length) throw new TypeError('studyRegion contains duplicate element identities.');
  if (rows.some((id) => !elementMap.has(id))) throw new TypeError('studyRegion references a missing element.');
  return rows;
}
function countTypes(rows) { return rows.reduce((counts, row) => { counts[row.elementType] += 1; return counts; }, { T3: 0, Q4: 0 }); }
function requiredNode(nodeMap, id) { const node = nodeMap.get(id); if (!node) throw new TypeError(`Missing node ${id}.`); return node; }
function requiredText(value, name) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required.`); return value.trim(); }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
