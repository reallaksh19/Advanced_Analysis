/**
 * LFEA mesh-package editing and qualified solve/review/export pipeline.
 *
 * This module is intentionally independent of Workspace. It accepts only an
 * explicit lfea-mesh-package/v1 and routes it through retained element-FEA APIs.
 */
import { validateMeshPackage } from '../core/element-fea/index.js';
import { semanticHash } from '../core/shared-piping-model/canonical-json.js';

export const LFEA_WORKBENCH_DOCUMENT_SCHEMA = 'lfea-workbench-document/v1';
export const LFEA_RESULT_MODES = Object.freeze(['MODEL', 'DEFORMED', 'RAW_STRESS', 'PROJECTED_STRESS']);
export const LFEA_COLLECTION_PATHS = Object.freeze([
  'nodes',
  'elements',
  'materials',
  'regions',
  'boundaries',
  'points',
  'analysisDefinition.materialAssignments',
  'analysisDefinition.thicknessAssignments',
  'analysisDefinition.loadCase.pointForces',
  'analysisDefinition.loadCase.boundaryTractions',
  'analysisDefinition.loadCase.boundaryPressures',
  'analysisDefinition.constraints',
]);

/**
 * Validate a supplied lfea-mesh-package/v1 without repairing its hash.
 *
 * @param {unknown} input Imported package.
 * @returns {Readonly<Record<string, unknown>>} Canonical package.
 */
export function normalizeLfeaMeshPackage(input) {
  const validation = validateMeshPackage(input);
  if (!validation.ok) throw diagnosticError(validation.diagnostics[0], 'LFEA_PACKAGE_REJECTED');
  return validation.package;
}

/**
 * Canonically reorder and reseal a locally edited package, then validate it.
 *
 * This operation is only for edits made inside the workbench. Imports use
 * normalizeLfeaMeshPackage so a forged or stale external hash is never repaired.
 *
 * @param {unknown} input Edited package.
 * @returns {Readonly<Record<string, unknown>>} Valid resealed package.
 */
export function resealLfeaMeshPackage(input) {
  if (!isRecord(input)) throw new TypeError('LFEA mesh package must be a JSON object.');
  const draft = structuredClone(input);
  delete draft.semanticHash;
  canonicalOrder(draft);
  const sealed = { ...draft, semanticHash: semanticHash(draft) };
  return normalizeLfeaMeshPackage(sealed);
}

/**
 * Derive display geometry for model, displacement, and stress modes.
 *
 * @param {unknown} packageInput Current mesh package.
 * @param {unknown} execution Workbench execution or null.
 * @param {string} mode Result display mode.
 * @returns {Readonly<Record<string, unknown>>} SVG-ready geometry and authority.
 */
export function lfeaDisplayGeometry(packageInput, execution, mode) {
  if (!LFEA_RESULT_MODES.includes(mode)) throw new TypeError(`Unsupported LFEA result mode: ${mode}.`);
  const packageValue = isRecord(packageInput) ? packageInput : {};
  const nodes = Array.isArray(packageValue.nodes) ? packageValue.nodes : [];
  const elements = Array.isArray(packageValue.elements) ? packageValue.elements : [];
  const displacement = displacementMap(execution?.result);
  const scale = execution?.review?.geometryReview?.deformationScale ?? 10;
  const displayNodes = nodes.map((node) => {
    const row = displacement.get(node.nodeId) ?? { UX: 0, UY: 0 };
    const deformed = mode === 'MODEL' ? { x: node.x, y: node.y } : {
      x: node.x + scale * row.UX,
      y: node.y + scale * row.UY,
    };
    return { nodeId: node.nodeId, sourceX: node.x, sourceY: node.y, ...deformed };
  });
  return freeze({
    mode,
    nodes: displayNodes,
    elements: elements.map((row) => ({ elementId: row.elementId, nodeIds: [...row.nodeIds], elementType: row.elementType })),
    values: stressValues(execution, mode, elements),
    authority: displayAuthority(execution, mode),
  });
}

function displayAuthority(execution, mode) {
  if (mode === 'RAW_STRESS') return execution?.authorityPolicy?.rawStress ?? 'NO_QUALIFIED_RESULT';
  if (mode === 'PROJECTED_STRESS') return execution?.authorityPolicy?.projectedStress ?? 'NOT_GENERATED';
  if (mode === 'DEFORMED') return 'SCALED_DEFORMATION_REVIEW_GEOMETRY';
  return 'SOURCE_MESH_GEOMETRY';
}

function displacementMap(result) {
  const map = new Map();
  for (const row of result?.nodalDisplacements ?? []) {
    const values = map.get(row.nodeId) ?? { UX: 0, UY: 0 };
    values[row.component] = row.value;
    map.set(row.nodeId, values);
  }
  return map;
}

function stressValues(execution, mode, elements) {
  if (mode === 'RAW_STRESS') return rawStressValues(execution?.result);
  if (mode !== 'PROJECTED_STRESS') return {};
  const rows = execution?.stressProjection?.nodalValues ?? [];
  const byNode = new Map(rows.filter((row) => row.stressComponent === 'SX').map((row) => [row.nodeId, row.weightedValue]));
  return Object.fromEntries(elements.map((element) => {
    const values = element.nodeIds.map((id) => byNode.get(id)).filter(Number.isFinite);
    return [element.elementId, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null];
  }));
}

function rawStressValues(result) {
  const values = {};
  for (const row of result?.elementStresses ?? []) values[row.elementId] = vonMises(row.values);
  for (const row of result?.integrationPointResults ?? []) {
    values[row.elementId] = Math.max(values[row.elementId] ?? -Infinity, row.vonMisesStress);
  }
  return values;
}

function vonMises(values) {
  const [sx, sy, txy] = values ?? [];
  return Number.isFinite(sx) && Number.isFinite(sy) && Number.isFinite(txy)
    ? Math.sqrt(sx ** 2 - sx * sy + sy ** 2 + 3 * txy ** 2)
    : null;
}

function canonicalOrder(value) {
  sortBy(value.nodes, 'nodeId');
  sortBy(value.elements, 'elementId');
  sortBy(value.materials, 'materialId');
  sortBy(value.regions, 'regionId');
  sortBy(value.boundaries, 'boundaryId');
  sortBy(value.points, 'pointId');
  sortBy(value.sourceReferences, 'sourceReferenceId');
  value.regions?.forEach((row) => row.elementIds?.sort(compare));
  value.boundaries?.forEach((row) => row.edgeReferences?.sort((left, right) => compare(left.elementId, right.elementId) || compare(left.localEdgeId, right.localEdgeId)));
  const analysis = value.analysisDefinition;
  sortBy(analysis?.materialAssignments, 'assignmentId');
  sortBy(analysis?.thicknessAssignments, 'assignmentId');
  sortBy(analysis?.constraints, 'constraintId');
  sortBy(analysis?.loadCase?.pointForces, 'loadId');
  sortBy(analysis?.loadCase?.boundaryTractions, 'loadId');
  sortBy(analysis?.loadCase?.boundaryPressures, 'loadId');
}

function sortBy(rows, key) {
  if (Array.isArray(rows)) rows.sort((left, right) => compare(left?.[key], right?.[key]));
}

function diagnosticError(row, fallbackCode) {
  const error = new TypeError(row?.message ?? 'Invalid LFEA mesh package.');
  error.code = row?.code ?? fallbackCode;
  return error;
}

function compare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
