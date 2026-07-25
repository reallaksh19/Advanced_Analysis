import { deepFreeze } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { CONTINUUM_RESULT_SCHEMA, ELEMENT_TYPES } from './constants.js';
import { Q4_GAUSS_POINTS, Q4_NATURAL_CORNERS } from './integration-points.js';
import { elementPhysicalArea } from './mesh-metrics.js';
import { q4ShapeFunctions } from './q4-geometry.js';
import { Q4_EXTRAPOLATION_MATRIX_ID, REVIEW_PROJECTION_STATUS, STRESS_PROJECTION_SCHEMA } from './interpretation-constants.js';

const COMPONENTS = Object.freeze(['SX','SY','TXY','SIGMA_Z']);
export const Q4_GAUSS_TO_CORNER_MATRIX = deepFreeze(extrapolationMatrix());

export function createStressProjection(input) {
  const source = requiredRecord(input, 'stress projection input');
  exactRecordKeys(source, ['projectionIdentity','projectionVersion','sourceSemanticHash','model','result','components','declaredDiscontinuities','semanticHash'], 'stress projection input');
  assertProjectionSources(source.model, source.result);
  if (source.sourceSemanticHash !== source.model.sourceSemanticHash) throw new TypeError('Stress projection source ancestry is stale or mixed.');
  const components = projectionComponents(source.components);
  const declaredDiscontinuities = normalizeDeclaredDiscontinuities(source.declaredDiscontinuities || [], source.model);
  const cornerRows = projectElementCorners(source.model, source.result, components);
  const nodalRows = projectNodalValues(source.model, cornerRows, components, declaredDiscontinuities);
  const base = {
    schema: STRESS_PROJECTION_SCHEMA,
    projectionIdentity: requiredText(source.projectionIdentity, 'projectionIdentity'),
    projectionVersion: requiredText(source.projectionVersion, 'projectionVersion'),
    sourceSemanticHash: requiredText(source.sourceSemanticHash, 'sourceSemanticHash'),
    status: REVIEW_PROJECTION_STATUS,
    authority: REVIEW_PROJECTION_STATUS,
    sourceModelIdentity: source.model.modelIdentity,
    sourceModelSemanticHash: source.model.semanticHash,
    sourceResultSemanticHash: source.result.semanticHash,
    components,
    declaredDiscontinuities,
    extrapolationEvidence: extrapolationEvidence(),
    elementCornerValues: cornerRows,
    nodalValues: nodalRows,
    consumerRestrictions: prohibitedUses(),
    limitations: ['Projected stress is non-authoritative review evidence; raw element or integration-point stress remains authoritative.'],
  };
  const hash = semanticHash(base);
  if (source.semanticHash !== undefined && source.semanticHash !== hash) throw new TypeError('Stress projection semantic hash mismatch.');
  return deepFreeze({ ...base, semanticHash: hash });
}

export function validateStressProjection(value) {
  const errors = [];
  if (value?.schema !== STRESS_PROJECTION_SCHEMA) errors.push('Invalid fea-stress-projection/v1 schema.');
  if (value?.status !== REVIEW_PROJECTION_STATUS || value?.authority !== REVIEW_PROJECTION_STATUS) errors.push('Stress projection authority label is invalid.');
  if (!Array.isArray(value?.elementCornerValues) || !Array.isArray(value?.nodalValues)) errors.push('Stress projection value arrays are invalid.');
  if (value?.consumerRestrictions?.convergence !== 'PROHIBITED') errors.push('Projected stress must be prohibited for convergence use.');
  try { if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('Stress projection semantic hash mismatch.'); } catch (error) { errors.push(error.message); }
  return deepFreeze({ ok: errors.length === 0, errors });
}


function normalizeDeclaredDiscontinuities(value, model) {
  if (!Array.isArray(value)) throw new TypeError('declaredDiscontinuities must be an array.');
  const elementIds = new Set(model.elements.map((row) => row.elementId));
  const rows = value.map((row) => {
    exactRecordKeys(row, ['discontinuityId','sides'], 'declared discontinuity');
    const sides = (row.sides || []).map((side) => {
      exactRecordKeys(side, ['sideId','elementIds'], 'declared discontinuity side');
      const ids = uniqueText(side.elementIds, 'discontinuity elementIds');
      if (!ids.length || ids.some((id) => !elementIds.has(id))) throw new TypeError('Declared discontinuity references a missing element.');
      return { sideId: requiredText(side.sideId, 'sideId'), elementIds: ids };
    }).sort((a,b)=>compare(a.sideId,b.sideId));
    if (sides.length < 2 || new Set(sides.map((side)=>side.sideId)).size !== sides.length) throw new TypeError('Declared discontinuity requires at least two unique sides.');
    const assigned=sides.flatMap((side)=>side.elementIds);if(new Set(assigned).size!==assigned.length)throw new TypeError('An element cannot occupy multiple sides of one discontinuity.');
    return { discontinuityId: requiredText(row.discontinuityId, 'discontinuityId'), sides };
  }).sort((a,b)=>compare(a.discontinuityId,b.discontinuityId));
  if (new Set(rows.map((row)=>row.discontinuityId)).size !== rows.length) throw new TypeError('Duplicate discontinuity identity.');
  return rows;
}
function exactRecordKeys(value, allowed, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be a record.`); const extras=Object.keys(value).filter((key)=>!allowed.includes(key)); if(extras.length)throw new TypeError(`${name} contains unsupported fields: ${extras.sort(compare).join(', ')}.`); }
function uniqueText(value, name) { if(!Array.isArray(value)||value.some((row)=>typeof row!=='string'||!row.trim()))throw new TypeError(`${name} must contain text.`);const rows=value.map((row)=>row.trim()).sort(compare);if(new Set(rows).size!==rows.length)throw new TypeError(`${name} contains duplicates.`);return rows; }
function projectElementCorners(model, result, components) {
  const nodeMap = new Map(model.nodes.map((row) => [row.nodeId, row]));
  return model.elements.flatMap((element) => {
    const area = elementPhysicalArea(element, nodeMap);
    return element.type === ELEMENT_TYPES.Q4 ? q4CornerRows(element, result, components, area) : t3CornerRows(element, result, components, area);
  }).sort(cornerCompare);
}

function q4CornerRows(element, result, components, area) {
  const points = Q4_GAUSS_POINTS.map((point) => requiredRawPoint(result, element.elementId, point.integrationPointId));
  return Q4_NATURAL_CORNERS.map((corner, cornerIndex) => ({
    elementId: element.elementId,
    elementType: element.type,
    cornerId: corner.pointId,
    nodeId: element.nodeIds[cornerIndex],
    area,
    naturalCoordinates: { xi: corner.xi, eta: corner.eta },
    components: components.map((component) => projectedComponent(component, points, Q4_GAUSS_TO_CORNER_MATRIX[cornerIndex])),
  }));
}

function t3CornerRows(element, result, components, area) {
  const point = requiredT3RawPoint(result, element.elementId);
  return element.nodeIds.map((nodeId, index) => ({
    elementId: element.elementId,
    elementType: element.type,
    cornerId: `C${index + 1}`,
    nodeId,
    area,
    components: components.map((component) => ({ stressComponent: component, value: componentValue(point, component), sourceIntegrationPointIds: [`${element.elementId}:${point.integrationPointId}`], coefficients: [1] })),
  }));
}

function projectNodalValues(model, corners, components, discontinuities) {
  const elementMap = new Map(model.elements.map((row) => [row.elementId, row]));
  const rows = [];
  model.nodes.forEach((node) => {
    const contributions = corners.filter((row) => row.nodeId === node.nodeId);
    const groups = projectionGroups(contributions, elementMap, model, discontinuities);
    groups.forEach((group, index) => components.forEach((component) => rows.push(nodalComponent(node.nodeId, group, component, index))));
  });
  return rows.sort((a, b) => compare(a.nodeId, b.nodeId) || compare(a.projectionPatchId, b.projectionPatchId) || compare(a.stressComponent, b.stressComponent));
}

function projectionGroups(contributions, elementMap, model, discontinuities) {
  const keyed = new Map();
  contributions.forEach((row) => {
    const element = elementMap.get(row.elementId); const key = compatibilityKey(element, model, discontinuities);
    keyed.set(key, [...(keyed.get(key) || []), row]);
  });
  return [...keyed.entries()].flatMap(([key, rows]) => connectedCornerGroups(rows, elementMap).map((group) => ({ key, rows: group })));
}

function connectedCornerGroups(rows, elementMap) {
  const remaining = new Set(rows.map((row) => row.elementId)); const output = [];
  while (remaining.size) {
    const start = [...remaining].sort(compare)[0]; const stack = [start]; const ids = new Set();
    while (stack.length) { const id = stack.pop(); if (!remaining.delete(id)) continue; ids.add(id); [...remaining].forEach((other) => { if (shareEdge(elementMap.get(id), elementMap.get(other))) stack.push(other); }); }
    output.push(rows.filter((row) => ids.has(row.elementId)));
  }
  return output;
}

function nodalComponent(nodeId, group, component, index) {
  const contributors = group.rows.map((row) => ({ row, component: row.components.find((item) => item.stressComponent === component) }));
  const totalWeight = contributors.reduce((sum, item) => sum + item.row.area, 0);
  const weightedValue = contributors.reduce((sum, item) => sum + item.row.area * item.component.value, 0) / totalWeight;
  const values = contributors.map((item) => item.component.value);
  return {
    nodeId,
    projectionPatchId: `${group.key}:CC${index + 1}`,
    stressComponent: component,
    contributingElementIds: contributors.map((item) => item.row.elementId).sort(compare),
    contributingCornerIds: contributors.map((item) => `${item.row.elementId}:${item.row.cornerId}`).sort(compare),
    sourceIntegrationPointIds: [...new Set(contributors.flatMap((item) => item.component.sourceIntegrationPointIds))].sort(compare),
    weights: contributors.map((item) => ({ elementId: item.row.elementId, area: item.row.area, normalizedWeight: item.row.area / totalWeight })).sort((a, b) => compare(a.elementId, b.elementId)),
    weightedValue,
    minimumContributorValue: Math.min(...values),
    maximumContributorValue: Math.max(...values),
    contributorSpread: Math.max(...values) - Math.min(...values),
  };
}

function compatibilityKey(element, model, discontinuities) {
  const material = model.materials.find((row) => row.materialId === element.materialId);
  const formulation = model.solverProfile.formulation;
  const scale = formulation === 'PLANE_STRESS' ? `T:${element.thickness}` : `S:${model.solverProfile.outOfPlaneScale}`;
  const discontinuity = discontinuitySide(element.elementId, discontinuities);
  return [material.materialId, material.E, material.nu, formulation, scale, element.sourceSemanticHash, discontinuity].join('|');
}
function discontinuitySide(elementId, rows) {
  const matches = rows.flatMap((row) => (row.sides || []).filter((side) => (side.elementIds || []).includes(elementId)).map((side) => `${row.discontinuityId}:${side.sideId}`));
  return matches.sort(compare).join(',') || 'CONTINUOUS';
}
function projectedComponent(component, points, coefficients) {
  const value = points.reduce((sum, point, index) => sum + coefficients[index] * componentValue(point, component), 0);
  return { stressComponent: component, value, sourceIntegrationPointIds: points.map((point) => `${point.elementId}:${point.integrationPointId}`), coefficients: [...coefficients] };
}
function componentValue(point, component) { const values = { SX: point.stress[0], SY: point.stress[1], TXY: point.stress[2], SIGMA_Z: point.sigmaZ }; const value = values[component]; if (!Number.isFinite(value)) throw new TypeError(`Raw stress component ${component} is unavailable.`); return value; }
function requiredRawPoint(result, elementId, pointId) { const row = result.integrationPointResults?.find((item) => item.elementId === elementId && item.integrationPointId === pointId); if (!row) throw new TypeError(`Missing raw Q4 integration point ${elementId}:${pointId}.`); return row; }
function requiredT3RawPoint(result, elementId) {
  if (result.schema === CONTINUUM_RESULT_SCHEMA) { const stress = result.elementStresses?.find((row) => row.elementId === elementId); if (!stress) throw new TypeError(`Missing raw T3 stress for ${elementId}.`); return { elementId, integrationPointId: 'T3_CONSTANT', stress: stress.values, sigmaZ: stress.sigmaZ }; }
  const row = result.integrationPointResults?.find((item) => item.elementId === elementId && item.integrationPointId === 'T3_CONSTANT'); if (!row) throw new TypeError(`Missing raw T3 integration point for ${elementId}.`); return row;
}
function extrapolationMatrix() { const g = 1 / Math.sqrt(3); return Q4_NATURAL_CORNERS.map((corner) => q4ShapeFunctions(corner.xi / g, corner.eta / g)); }
function extrapolationEvidence() { return { matrixIdentity: Q4_EXTRAPOLATION_MATRIX_ID, sourceOrder: Q4_GAUSS_POINTS.map((row) => row.integrationPointId), targetOrder: Q4_NATURAL_CORNERS.map((row) => row.pointId), matrix: Q4_GAUSS_TO_CORNER_MATRIX }; }
function shareEdge(left, right) { let shared = 0; left.nodeIds.forEach((id) => { if (right.nodeIds.includes(id)) shared += 1; }); return shared >= 2; }
function projectionComponents(value) { const rows = value; if (!Array.isArray(rows) || !rows.length || rows.some((row) => !COMPONENTS.includes(row))) throw new TypeError('Projection components are invalid.'); return [...new Set(rows)].sort(compare); }
function assertProjectionSources(model, result) { if (!model || !result || result.status !== 'QUALIFIED' || result.qualifiedResults !== 'complete') throw new TypeError('Stress projection requires a qualified complete model/result pair.'); if (result.modelSemanticHash !== model.semanticHash || result.modelEvidence?.semanticHash !== model.semanticHash) throw new TypeError('Stress projection model/result semantic hashes are stale or mismatched.'); }
function prohibitedUses() { return { convergence: 'PROHIBITED', singularityClassification: 'PROHIBITED', acceptanceChecks: 'PROHIBITED', designCodeChecks: 'PROHIBITED', governingMaximum: 'PROHIBITED', reactionOrEquilibrium: 'PROHIBITED', rawStressReplacement: 'PROHIBITED' }; }
function requiredRecord(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be a record.`); return value; }
function requiredText(value, name) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required.`); return value.trim(); }
function withoutHash(value) { const { semanticHash: _hash, ...base } = value || {}; return base; }
function cornerCompare(a, b) { return compare(a.elementId, b.elementId) || compare(a.cornerId, b.cornerId); }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
