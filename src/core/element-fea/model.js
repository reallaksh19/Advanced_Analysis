import { deepFreeze } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { CONTINUUM_MODEL_SCHEMA, DOF_ORDER, EDGE_LOAD_TYPES, ELEMENT_TYPES, FORMULATIONS } from './constants.js';
import { assertNoCoincidentNodes, assertNoHangingNodes, assertNoImproperEdgeIntersections, elementEdges, qualifyQ4Geometry } from './element-quality.js';
import { signedArea } from './t3-geometry.js';
import { createLfeaProfile } from './profile.js';

export function qualifyContinuumModel(input) {
  try { return deepFreeze({ ok: true, model: createContinuumModel(input), diagnostics: [] }); }
  catch (error) { return deepFreeze({ ok: false, model: null, diagnostics: [diagnostic('MODEL_REJECTED', error.message)] }); }
}

export function createContinuumModel(input) {
  const source = record(input, 'model');
  exactKeys(source, ['schema','modelIdentity','modelVersion','sourceSemanticHash','solverProfileIdentity','solverProfile','nodes','elements','materials','restraints','prescribedDisplacements','loadCases','sourceReferences','limitations','semanticHash'], 'model');
  if (source.schema !== CONTINUUM_MODEL_SCHEMA) throw new TypeError('Invalid fea-continuum-model/v1 schema.');
  const sourceHash = text(source.sourceSemanticHash, 'sourceSemanticHash'); const profile = createLfeaProfile(source.solverProfile);
  const profileIdentity = text(source.solverProfileIdentity, 'solverProfileIdentity');
  if (profileIdentity !== profile.profileIdentity) throw new TypeError('solverProfileIdentity does not match the embedded profile.');
  const nodes = normalizeNodes(source.nodes, sourceHash); assertNoCoincidentNodes(nodes);
  const materials = normalizeMaterials(source.materials, sourceHash, profile.formulation);
  const elements = normalizeElements(source.elements, sourceHash, nodes, materials, profile);
  assertNoHangingNodes(nodes, elements, profile.tolerances.geometryArea);
  assertNoImproperEdgeIntersections(nodes, elements, profile.tolerances.geometryArea);
  const restraints = normalizeRestraints(source.restraints, sourceHash, nodes);
  const prescribedDisplacements = normalizePrescribed(source.prescribedDisplacements, sourceHash, nodes, restraints);
  assertConstraintIdentity(restraints, prescribedDisplacements);
  const ownership = edgeOwnership(elements);
  const loadCases = normalizeLoadCases(source.loadCases, sourceHash, nodes, elements, ownership); assertGlobalLoadIdentity(loadCases);
  const sourceReferences = normalizeSourceReferences(source.sourceReferences, sourceHash); assertConnected(nodes, elements);
  const base = { schema: CONTINUUM_MODEL_SCHEMA, modelIdentity: text(source.modelIdentity, 'modelIdentity'), modelVersion: text(source.modelVersion, 'modelVersion'), sourceSemanticHash: sourceHash, solverProfileIdentity: profileIdentity, solverProfile: profile, nodes, elements, materials, restraints, prescribedDisplacements, loadCases, sourceReferences, limitations: textArray(source.limitations, 'limitations') };
  const computedHash = semanticHash(base); if (source.semanticHash !== undefined && source.semanticHash !== computedHash) throw new TypeError('Model semantic hash mismatch.');
  return deepFreeze({ ...base, semanticHash: computedHash });
}

function normalizeNodes(value, sourceHash) {
  const rows = array(value, 'nodes').map((value) => { const row = record(value, 'node'); exactKeys(row, ['nodeId','x','y','sourceSemanticHash'], 'node'); ancestry(row, sourceHash, 'node'); return { nodeId: text(row.nodeId, 'nodeId'), x: finite(row.x, 'node.x'), y: finite(row.y, 'node.y'), sourceSemanticHash: sourceHash }; });
  assertUnique(rows, 'nodeId', 'node'); if (!rows.length) throw new TypeError('At least one node is required.'); return sortById(rows, 'nodeId');
}

function normalizeMaterials(value, sourceHash, formulation) {
  const rows = array(value, 'materials').map((value) => { const row = record(value, 'material'); exactKeys(row, ['materialId','E','nu','sourceSemanticHash'], 'material'); ancestry(row, sourceHash, 'material'); const E = finite(row.E, 'material.E'); const nu = finite(row.nu, 'material.nu'); if (!(E > 0)) throw new TypeError('Material E must be positive.'); if (!(nu > -1 && nu < 0.5)) throw new TypeError(`Material nu is invalid for ${formulation}.`); return { materialId: text(row.materialId, 'materialId'), E, nu, sourceSemanticHash: sourceHash }; });
  assertUnique(rows, 'materialId', 'material'); if (!rows.length) throw new TypeError('At least one material is required.'); return sortById(rows, 'materialId');
}

function normalizeElements(value, sourceHash, nodes, materials, profile) {
  const nodeMap = new Map(nodes.map((row) => [row.nodeId, row])); const materialIds = new Set(materials.map((row) => row.materialId));
  const rows = array(value, 'elements').map((value) => elementRow(value, sourceHash, nodeMap, materialIds, profile));
  assertUnique(rows, 'elementId', 'element'); if (!rows.length) throw new TypeError('At least one element is required.'); return sortById(rows, 'elementId');
}

function elementRow(value, sourceHash, nodeMap, materialIds, profile) {
  const row = record(value, 'element'); exactKeys(row, ['elementId','type','nodeIds','materialId','thickness','sourceSemanticHash','signedArea','qualityEvidence'], 'element'); ancestry(row, sourceHash, 'element');
  if (!Object.values(ELEMENT_TYPES).includes(row.type)) throw new TypeError(`Unsupported element type: ${row.type}.`);
  const nodeIds = array(row.nodeIds, 'element.nodeIds').map((id) => text(id, 'element.nodeId')); const expected = row.type === ELEMENT_TYPES.Q4 ? 4 : 3;
  if (nodeIds.length !== expected || new Set(nodeIds).size !== expected) throw new TypeError(`${row.type} connectivity requires ${expected} distinct nodes.`);
  const coordinates = nodeIds.map((id) => nodeMap.get(id)); if (coordinates.some((coordinate) => !coordinate)) throw new TypeError('Element connectivity references a missing node.');
  const materialId = text(row.materialId, 'element.materialId'); if (!materialIds.has(materialId)) throw new TypeError('Element material assignment is missing.');
  const thickness = profile.formulation === FORMULATIONS.PLANE_STRESS ? positive(row.thickness, 'element.thickness') : absent(row.thickness, 'Plane-strain element thickness');
  return row.type === ELEMENT_TYPES.Q4 ? q4Row(row, nodeIds, materialId, thickness, coordinates, sourceHash, profile) : t3Row(row, nodeIds, materialId, thickness, coordinates, sourceHash, profile);
}

function t3Row(row, nodeIds, materialId, thickness, coordinates, sourceHash, profile) {
  if (row.qualityEvidence !== undefined) throw new TypeError('T3 elements do not accept Q4 qualityEvidence.');
  const area = signedArea(coordinates); if (!(area > profile.tolerances.geometryArea)) throw new TypeError('T3 element has zero, near-zero, or inverted signed area.');
  if (row.signedArea !== undefined && finite(row.signedArea, 'element.signedArea') !== area) throw new TypeError('Element signedArea does not match the coordinates.');
  return { elementId: text(row.elementId, 'elementId'), type: ELEMENT_TYPES.T3, nodeIds, materialId, thickness, signedArea: area, sourceSemanticHash: sourceHash };
}
function q4Row(row, nodeIds, materialId, thickness, coordinates, sourceHash, profile) {
  if (row.signedArea !== undefined) throw new TypeError('Q4 elements do not accept T3 signedArea evidence.');
  const qualityEvidence = qualifyQ4Geometry(coordinates, profile.tolerances.geometryArea);
  if (row.qualityEvidence !== undefined && semanticHash(row.qualityEvidence) !== semanticHash(qualityEvidence)) throw new TypeError('Q4 qualityEvidence does not match the coordinates.');
  return { elementId: text(row.elementId, 'elementId'), type: ELEMENT_TYPES.Q4, nodeIds, materialId, thickness, qualityEvidence, sourceSemanticHash: sourceHash };
}

function normalizeRestraints(value, sourceHash, nodes) {
  const nodeIds = new Set(nodes.map((row) => row.nodeId)); const rows = array(value, 'restraints').map((value) => constraintRow(value, 'restraint', sourceHash, nodeIds, 0)); assertUnique(rows, 'constraintId', 'restraint'); assertUniqueDofs(rows, 'restraint'); return sortDofs(rows);
}
function normalizePrescribed(value, sourceHash, nodes, restraints) {
  const nodeIds = new Set(nodes.map((row) => row.nodeId)); const rows = array(value, 'prescribedDisplacements').map((value) => { const source = record(value, 'prescribed displacement'); return constraintRow(source, 'prescribed displacement', sourceHash, nodeIds, finite(source.value, 'prescribed.value')); });
  assertUnique(rows, 'constraintId', 'prescribed displacement'); assertUniqueDofs(rows, 'prescribed displacement'); const fixed = new Set(restraints.map(dofKey)); if (rows.some((row) => fixed.has(dofKey(row)))) throw new TypeError('A DOF cannot be both fixed and prescribed.'); return sortDofs(rows);
}

function normalizeLoadCases(value, sourceHash, nodes, elements, ownership) {
  const nodeIds = new Set(nodes.map((row) => row.nodeId)); const elementMap = new Map(elements.map((row) => [row.elementId, row])); const rows = array(value, 'loadCases').map((value) => loadCaseRow(value, sourceHash, nodeIds, elementMap, ownership));
  assertUnique(rows, 'loadCaseId', 'load case'); if (!rows.length) throw new TypeError('At least one load case is required.'); return sortById(rows, 'loadCaseId');
}
function loadCaseRow(value, sourceHash, nodeIds, elementMap, ownership) {
  const row = record(value, 'loadCase'); exactKeys(row, ['loadCaseId','nodalForces','edgeLoads','sourceSemanticHash'], 'load case'); ancestry(row, sourceHash, 'load case');
  const nodalForces = array(row.nodalForces, 'nodalForces').map((value) => nodalForce(value, sourceHash, nodeIds)); const edgeLoads = array(row.edgeLoads, 'edgeLoads').map((value) => edgeLoad(value, sourceHash, elementMap, ownership));
  assertUnique([...nodalForces, ...edgeLoads], 'loadId', 'load'); if (hasAmbiguousDuplicateEdgeLoads(edgeLoads, elementMap)) throw new TypeError('Duplicate edge load application is prohibited.');
  return { loadCaseId: text(row.loadCaseId, 'loadCaseId'), sourceSemanticHash: sourceHash, nodalForces: sortById(nodalForces, 'loadId'), edgeLoads: sortById(edgeLoads, 'loadId') };
}
function nodalForce(value, sourceHash, nodeIds) {
  const row = record(value, 'nodalForce'); exactKeys(row, ['loadId','nodeId','fx','fy','sourceSemanticHash'], 'nodal force'); ancestry(row, sourceHash, 'nodal force'); const nodeId = text(row.nodeId, 'nodalForce.nodeId'); if (!nodeIds.has(nodeId)) throw new TypeError('Nodal force references a missing node.'); return { loadId: text(row.loadId, 'loadId'), nodeId, fx: finite(row.fx, 'nodalForce.fx'), fy: finite(row.fy, 'nodalForce.fy'), sourceSemanticHash: sourceHash };
}
function edgeLoad(value, sourceHash, elementMap, ownership) {
  const row = record(value, 'edgeLoad'); const allowed = row.type === EDGE_LOAD_TYPES.TRACTION ? ['loadId','elementId','edgeNodeIds','type','tx','ty','sourceSemanticHash'] : ['loadId','elementId','edgeNodeIds','type','pressure','sourceSemanticHash']; exactKeys(row, allowed, 'edge load'); ancestry(row, sourceHash, 'edge load');
  if (!Object.values(EDGE_LOAD_TYPES).includes(row.type)) throw new TypeError('Unsupported edge load type.'); const elementId = text(row.elementId, 'edgeLoad.elementId'); const element = elementMap.get(elementId); if (!element) throw new TypeError('Edge load references a missing element.');
  const edgeNodeIds = array(row.edgeNodeIds, 'edgeNodeIds').map((id) => text(id, 'edgeNodeId')); if (edgeNodeIds.length !== 2 || new Set(edgeNodeIds).size !== 2 || !adjacentEdge(element, edgeNodeIds)) throw new TypeError('Edge load must reference a complete element edge.');
  if ((ownership.get(canonicalEdge(edgeNodeIds)) || []).length !== 1) throw new TypeError('Loads on shared internal edges are prohibited.'); const load = { loadId: text(row.loadId, 'loadId'), elementId, edgeNodeIds: [...edgeNodeIds].sort(compare), type: row.type, sourceSemanticHash: sourceHash };
  return row.type === EDGE_LOAD_TYPES.TRACTION ? { ...load, tx: finite(row.tx, 'edgeLoad.tx'), ty: finite(row.ty, 'edgeLoad.ty') } : { ...load, pressure: finite(row.pressure, 'edgeLoad.pressure') };
}

function normalizeSourceReferences(value, sourceHash) {
  const rows = array(value, 'sourceReferences').map((value) => { const row = record(value, 'source reference'); exactKeys(row, ['sourceReferenceId','sourceType','sourceVersion','sourceSemanticHash'], 'source reference'); ancestry(row, sourceHash, 'source reference'); return { sourceReferenceId: text(row.sourceReferenceId, 'sourceReferenceId'), sourceType: text(row.sourceType, 'sourceType'), sourceVersion: text(row.sourceVersion, 'sourceVersion'), sourceSemanticHash: sourceHash }; });
  assertUnique(rows, 'sourceReferenceId', 'source reference'); if (!rows.length) throw new TypeError('At least one source reference is required.'); return sortById(rows, 'sourceReferenceId');
}
function assertConnected(nodes, elements) {
  const adjacency = new Map(nodes.map((row) => [row.nodeId, new Set()])); elements.forEach((element) => element.nodeIds.forEach((left) => element.nodeIds.forEach((right) => adjacency.get(left).add(right))));
  const visited = new Set(); const stack = [nodes[0].nodeId]; while (stack.length) { const id = stack.pop(); if (visited.has(id)) continue; visited.add(id); adjacency.get(id).forEach((next) => stack.push(next)); }
  if (visited.size !== nodes.length) throw new TypeError('Disconnected topology is not supported by LFEA.');
}
function constraintRow(value, label, sourceHash, nodeIds, valueNumber) {
  const row = record(value, label); const allowed = label === 'restraint' ? ['constraintId','nodeId','component','sourceSemanticHash','value'] : ['constraintId','nodeId','component','value','sourceSemanticHash']; exactKeys(row, allowed, label); ancestry(row, sourceHash, label);
  if (label === 'restraint' && row.value !== undefined && finite(row.value, 'restraint.value') !== 0) throw new TypeError('A fixed restraint value must be zero.'); const nodeId = text(row.nodeId, `${label}.nodeId`); if (!nodeIds.has(nodeId)) throw new TypeError(`${label} references a missing node.`); if (!DOF_ORDER.includes(row.component)) throw new TypeError(`${label} component is invalid.`); return { constraintId: text(row.constraintId, `${label}.constraintId`), nodeId, component: row.component, value: valueNumber, sourceSemanticHash: sourceHash };
}
function assertConstraintIdentity(left, right) { assertUnique([...left, ...right], 'constraintId', 'constraint'); }
function assertGlobalLoadIdentity(loadCases) { assertUnique(loadCases.flatMap((row) => [...row.nodalForces, ...row.edgeLoads]), 'loadId', 'load'); }
function ancestry(row, expected, label) { if (row.sourceSemanticHash !== expected) throw new TypeError(`${label} source ancestry does not match the model.`); }
function edgeOwnership(elements) { const ownership = new Map(); elements.forEach((element) => elementEdges(element).forEach((edge) => { const key = canonicalEdge(edge); ownership.set(key, [...(ownership.get(key) || []), element.elementId]); })); return ownership; }
function canonicalEdge(edge) { return [...edge].sort(compare).join('|'); }
function edgeLoadKey(load) { return canonicalEdge(load.edgeNodeIds); }
function hasAmbiguousDuplicateEdgeLoads(loads, elementMap) {
  const groups = new Map(); loads.forEach((load) => { const key = edgeLoadKey(load); groups.set(key, [...(groups.get(key) || []), load]); });
  return [...groups.values()].some((group) => group.length > 1 && !group.every((load) => isAdapterGeneratedEdgeLoad(load, elementMap.get(load.elementId))));
}
function isAdapterGeneratedEdgeLoad(load, element) {
  if (!element) return false; const localEdgeId = localEdgeIdentity(element, load.edgeNodeIds);
  return Boolean(localEdgeId && load.loadId.includes(':') && load.loadId.endsWith(`:${element.elementId}:${localEdgeId}`));
}
function localEdgeIdentity(element, edge) {
  const index = elementEdges(element).findIndex((pair) => pair.includes(edge[0]) && pair.includes(edge[1]));
  return index < 0 ? null : `${element.type}_E${index + 1}`;
}
function adjacentEdge(element, edge) { return elementEdges(element).some((pair) => pair.includes(edge[0]) && pair.includes(edge[1])); }
function assertUnique(rows, key, label) { if (new Set(rows.map((row) => row[key])).size !== rows.length) throw new TypeError(`Duplicate ${label} identity.`); }
function assertUniqueDofs(rows, label) { if (new Set(rows.map(dofKey)).size !== rows.length) throw new TypeError(`Contradictory or duplicate ${label} DOF.`); }
function dofKey(row) { return `${row.nodeId}:${row.component}`; }
function sortDofs(rows) { return [...rows].sort((a, b) => compare(a.nodeId, b.nodeId) || DOF_ORDER.indexOf(a.component) - DOF_ORDER.indexOf(b.component)); }
function sortById(rows, key) { return [...rows].sort((a, b) => compare(a[key], b[key])); }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function record(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be a record.`); return value; }
function array(value, name) { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array.`); return value; }
function text(value, name) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required.`); return value.trim(); }
function finite(value, name) { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite.`); return value; }
function positive(value, name) { const result = finite(value, name); if (!(result > 0)) throw new TypeError(`${name} must be positive.`); return result; }
function absent(value, name) { if (value !== undefined && value !== null) throw new TypeError(`${name} must be omitted; use solverProfile.outOfPlaneScale.`); return null; }
function textArray(value, name) { const rows = array(value, name).map((item) => text(item, name)); if (new Set(rows).size !== rows.length) throw new TypeError(`${name} contains duplicate text.`); return rows.sort(compare); }
function exactKeys(value, allowed, name) { const extras = Object.keys(value).filter((key) => !allowed.includes(key)); if (extras.length) throw new TypeError(`${name} contains unsupported fields: ${extras.sort(compare).join(', ')}.`); }
function diagnostic(code, message) { return { code, severity: 'ERROR', message }; }
