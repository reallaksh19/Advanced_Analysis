/**
 * LFEA mesh-package editing and qualified solve/review/export pipeline.
 *
 * This module is intentionally independent of Workspace. It accepts only an
 * explicit lfea-mesh-package/v1 and routes it through retained element-FEA APIs.
 */
import { validateMeshPackage } from '../core/element-fea/index.js';
import { semanticHash } from '../core/shared-piping-model/canonical-json.js';
import { FIELD_IDS, REDUCTIONS, selectElementField, selectProjectedField } from './lfea-field-adapter.js';
import {
  GEOMETRY_STATES, createGeometryOnlyDescriptor, createPlotDescriptor,
} from './lfea-plot-descriptor.js';

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
 * Geometry state is now an EXPLICIT, orthogonal option. It is never implied by
 * the result mode: a stress plot is drawn on undeformed source coordinates
 * unless the caller asks for deformation and supplies a scale.
 *
 * Field values are SELECTED from kernel evidence through lfea-field-adapter.
 * No physical quantity is computed in this module.
 *
 * @param {unknown} packageInput Current mesh package.
 * @param {unknown} execution Workbench execution or null.
 * @param {string} mode Result display mode.
 * @param {{deformation?:{enabled:boolean,scale:number}, ipReduction?:string, fieldId?:string}} options Explicit display options.
 * @returns {Readonly<Record<string, unknown>>} SVG-ready geometry and plot descriptor.
 */
export function lfeaDisplayGeometry(packageInput, execution, mode, options = {}) {
  if (!LFEA_RESULT_MODES.includes(mode)) throw new TypeError(`Unsupported LFEA result mode: ${mode}.`);
  const packageValue = isRecord(packageInput) ? packageInput : {};
  const nodes = Array.isArray(packageValue.nodes) ? packageValue.nodes : [];
  const elements = Array.isArray(packageValue.elements) ? packageValue.elements : [];

  const deformation = resolveDeformation(mode, options.deformation);
  const displacement = deformation.enabled ? displacementMap(execution?.result) : new Map();
  const displayNodes = nodes.map((node) => {
    if (!deformation.enabled) {
      return { nodeId: node.nodeId, sourceX: node.x, sourceY: node.y, x: node.x, y: node.y };
    }
    const row = displacement.get(node.nodeId) ?? { UX: 0, UY: 0 };
    return {
      nodeId: node.nodeId, sourceX: node.x, sourceY: node.y,
      x: node.x + deformation.scale * row.UX,
      y: node.y + deformation.scale * row.UY,
    };
  });

  const field = resolveField(packageValue, execution, mode, options);
  const descriptor = field
    ? createPlotDescriptor({
      field,
      geometryState: deformation.enabled ? GEOMETRY_STATES.DEFORMED : GEOMETRY_STATES.UNDEFORMED,
      deformationScale: deformation.enabled ? deformation.scale : 0,
      authority: field.authority,
      unitsIdentity: packageValue.unitsIdentity ?? null,
    })
    : createGeometryOnlyDescriptor({ unitsIdentity: packageValue.unitsIdentity ?? null });

  return freeze({
    mode,
    nodes: displayNodes,
    elements: elements.map((row) => ({
      elementId: row.elementId, nodeIds: [...row.nodeIds], elementType: row.elementType,
    })),
    values: field ? { ...field.byElement } : {},
    field: field ?? null,
    plot: descriptor,
    geometryState: descriptor.geometryState,
    deformationScale: descriptor.deformationScale,
    caption: descriptor.caption,
    authority: displayAuthority(execution, mode, field),
  });
}

/**
 * Deformation is opt-in. DEFORMED mode implies it; every other mode requires
 * an explicit request. There is no implicit default scale anywhere.
 *
 * @param {string} mode Result display mode.
 * @param {{enabled?:boolean,scale?:number}|undefined} requested Caller request.
 * @returns {{enabled:boolean,scale:number}} Resolved deformation state.
 */
function resolveDeformation(mode, requested) {
  const wants = mode === 'DEFORMED' || Boolean(requested?.enabled);
  if (!wants) return { enabled: false, scale: 0 };
  const scale = requested?.scale;
  if (!(Number.isFinite(scale) && scale > 0)) {
    throw new TypeError('Deformed display requires an explicit positive deformation scale.');
  }
  return { enabled: true, scale };
}

function resolveField(packageValue, execution, mode, options) {
  const result = execution?.result;
  if (!result || result.status !== 'QUALIFIED') return null;
  const unit = packageValue?.analysisDefinition?.solverProfile?.units?.stress;
  if (typeof unit !== 'string' || !unit.trim()) {
    throw new TypeError('The solver profile must declare a stress unit before a field can be displayed.');
  }
  const reduction = options.ipReduction ?? REDUCTIONS.Q4_MAX_OVER_IP;
  if (mode === 'RAW_STRESS') {
    return selectElementField(result, options.fieldId ?? FIELD_IDS.VON_MISES, unit, reduction);
  }
  if (mode === 'PROJECTED_STRESS') {
    if (!execution.stressProjection) return null;
    return selectProjectedField(
      execution.stressProjection,
      packageValue.elements ?? [],
      options.fieldId ?? FIELD_IDS.PROJECTED_SX,
      unit,
    );
  }
  return null;
}

function displayAuthority(execution, mode, field) {
  if (mode === 'RAW_STRESS') return field?.authority ?? 'NO_QUALIFIED_RESULT';
  if (mode === 'PROJECTED_STRESS') return field?.authority ?? 'NOT_GENERATED';
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
