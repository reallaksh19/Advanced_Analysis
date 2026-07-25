import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { validateLoadCaseSet, validateModelLoadPrimitiveSet, validateModelLoadReadinessAudit } from '../model-loads/index.js';
import { validateVerticalLoadPathModel } from '../support-load-screening/index.js';
import {
  AUDIT_CODES, QUALIFICATION, VERTICAL_BEAM_MODEL_SCHEMA,
} from './constants.js';
import { diagnostic, diagnosticOrder, uniqueSorted } from './diagnostics.js';
import { validateFlexuralPropertyProjection } from './flexural-properties.js';
import { stationIndex } from './geometry.js';
import { projectBeamLoads, primitivePathIntegrity } from './load-projection.js';
import { nearlyEqual } from './numeric.js';
import { validateVerticalBeamSolverProfile } from './profile.js';

export function buildVerticalBeamModel(pathModel, flexuralProjection, loadCaseSet, primitiveSet, readinessAudit, profile) {
  assertInputs(pathModel, flexuralProjection, loadCaseSet, primitiveSet, readinessAudit, profile);
  const integrity = primitivePathIntegrity(pathModel, primitiveSet);
  const cases = pathModel.paths.flatMap((path) => loadCaseSet.loadCases.map((loadCase) => (
    buildPathCase(path, loadCase.loadCaseId, flexuralProjection, primitiveSet, readinessAudit, profile, integrity)
  ))).sort(caseOrder);
  const diagnostics = [...integrity.diagnostics, ...cases.flatMap((row) => row.diagnostics)].sort(diagnosticOrder);
  const base = {
    schema: VERTICAL_BEAM_MODEL_SCHEMA, datasetId: pathModel.datasetId,
    pathModelSemanticHash: pathModel.semanticHash,
    flexuralProjectionSemanticHash: flexuralProjection.semanticHash,
    loadCaseSetSemanticHash: loadCaseSet.semanticHash,
    primitiveSetSemanticHash: primitiveSet.semanticHash,
    readinessAuditSemanticHash: readinessAudit.semanticHash,
    profile, pathCases: cases, diagnostics,
    summary: {
      pathCaseCount: cases.length,
      readyPathCaseCount: cases.filter(isReady).length,
      blockedPathCaseCount: cases.filter((row) => !isReady(row)).length,
      nodeCount: cases.reduce((sum, row) => sum + row.nodes.length, 0),
      elementCount: cases.reduce((sum, row) => sum + row.elements.length, 0),
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateVerticalBeamModel(value) {
  const errors = [];
  if (value?.schema !== VERTICAL_BEAM_MODEL_SCHEMA) errors.push('Invalid vertical-beam model schema.');
  if (!Array.isArray(value?.pathCases)) errors.push('Vertical-beam path cases must be an array.');
  const keys = (value?.pathCases || []).map((row) => `${row.pathId}|${row.loadCaseId}`);
  if (new Set(keys).size !== keys.length) errors.push('Vertical-beam path/load-case records must be unique.');
  (value?.pathCases || []).forEach((row) => validatePathCase(row, errors));
  if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('Vertical-beam model semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function buildPathCase(path, caseId, projection, primitiveSet, readiness, profile, integrity) {
  const flexuralRows = projection.records.filter((row) => row.pathId === path.pathId);
  const projectionRows = projectBeamLoads(path, primitiveSet, caseId, profile);
  const blockers = initialBlockers(path, caseId, flexuralRows, readiness, integrity, projectionRows);
  if (blockers.length) return blockedCase(path, caseId, flexuralRows, projectionRows, blockers);
  const stations = meshStations(path, projectionRows.eligible, profile.geometryTolerancePolicy);
  const nodes = createNodes(path.pathId, caseId, stations);
  const elements = createElements(path, caseId, nodes, flexuralRows, profile.geometryTolerancePolicy);
  const constraints = createConstraints(path, nodes, profile.geometryTolerancePolicy);
  const loadVectorRecords = createLoadRecords(path, caseId, nodes, elements, projectionRows.eligible, profile.geometryTolerancePolicy);
  const elementBlockers = uniqueSorted(elements.flatMap((row) => row.diagnostics.map((item) => item.code)));
  const loadBlockers = uniqueSorted(loadVectorRecords.flatMap((row) => row.diagnostics.map((item) => item.code)));
  const finalBlockers = uniqueSorted([...elementBlockers, ...loadBlockers]);
  if (finalBlockers.length) return blockedCase(path, caseId, flexuralRows, projectionRows, finalBlockers);
  const base = {
    pathId: path.pathId, loadCaseId: caseId, qualification: QUALIFICATION.READY,
    nodes, elements, dofMap: createDofMap(nodes), constraints, loadVectorRecords,
    flexuralPropertyReferences: flexuralRows.map((row) => row.semanticHash),
    qualifiedSupportKeys: constraints.map((row) => row.supportKey),
    eligiblePrimitiveIds: projectionRows.eligible.map((row) => row.primitiveId),
    blockedPrimitiveIds: [], blockers: [], diagnostics: [],
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function initialBlockers(path, caseId, flexuralRows, readiness, integrity, loads) {
  const caseAudit = readiness.cases.find((row) => row.loadCaseId === caseId);
  const blockedComponents = new Set(caseAudit?.blockedComponentIds || []);
  const localCaseBlocked = !caseAudit || path.orderedComponentKeys.some((key) => blockedComponents.has(key));
  const integrityBlocked = integrity.rows.some((row) => row.loadCaseId === caseId && row.pathIds.includes(path.pathId));
  return uniqueSorted([
    ...(path.qualification === QUALIFICATION.READY ? [] : [AUDIT_CODES.PATH_NOT_QUALIFIED]),
    ...(path.qualifiedSupportKeys.length >= 2 ? [] : [AUDIT_CODES.INSUFFICIENT_VERTICAL_SUPPORTS]),
    ...(path.blockers?.includes('DUPLICATE_SUPPORT_STATION') ? [AUDIT_CODES.DUPLICATE_SUPPORT_STATION] : []),
    ...flexuralRows.filter((row) => !isReady(row)).flatMap((row) => row.diagnostics.map((item) => item.code)),
    ...(localCaseBlocked ? [AUDIT_CODES.LOAD_CASE_BLOCKED] : []),
    ...(integrityBlocked ? [AUDIT_CODES.LOAD_PRIMITIVE_PATH_MISMATCH] : []),
    ...loads.blockers,
  ]);
}

function meshStations(path, loads, policy) {
  const values = [path.stationStartM, path.stationEndM];
  path.componentIntervals.forEach((row) => values.push(row.startStationM, row.endStationM));
  path.supportStations.filter(isReady).forEach((row) => values.push(row.pathStationM));
  loads.forEach((row) => {
    if (row.pathStationM !== undefined) values.push(row.pathStationM);
    if (row.intervalStartM !== undefined) values.push(row.intervalStartM, row.intervalEndM);
  });
  return dedupeStations(values.sort((a, b) => a - b), policy);
}

function createNodes(pathId, caseId, stations) {
  return stations.map((station, index) => deepFreeze({
    nodeId: `vertical-beam-node:${pathId}:${caseId}:${index}`,
    nodeIndex: index, pathStationM: station,
    verticalDofId: `vertical-beam-dof:${pathId}:${caseId}:${index}:v`,
    rotationDofId: `vertical-beam-dof:${pathId}:${caseId}:${index}:theta`,
  }));
}

function createElements(path, caseId, nodes, flexuralRows, policy) {
  return nodes.slice(0, -1).map((left, index) => {
    const right = nodes[index + 1], midpoint = (left.pathStationM + right.pathStationM) / 2;
    const flexural = flexuralRows.find((row) => midpoint > row.intervalStartM - policy.absoluteTolerance
      && midpoint < row.intervalEndM + policy.absoluteTolerance && isReady(row));
    const diagnostics = flexural && right.pathStationM > left.pathStationM ? [] : [diagnostic(
      AUDIT_CODES.MISSING_FLEXURAL_PROPERTY, `${path.pathId}:${caseId}:${index}`, 'Beam element does not resolve to one positive-EI path interval.',
    )];
    return deepFreeze({
      elementId: `vertical-beam-element:${path.pathId}:${caseId}:${index}`,
      elementIndex: index, startNodeId: left.nodeId, endNodeId: right.nodeId,
      startStationM: left.pathStationM, endStationM: right.pathStationM,
      lengthM: right.pathStationM - left.pathStationM,
      componentKey: flexural?.componentKey || null,
      flexuralRecordSemanticHash: flexural?.semanticHash || null,
      flexuralRigidityNm2: flexural?.flexuralRigidityNm2 || null,
      diagnostics,
    });
  });
}

function createConstraints(path, nodes, policy) {
  return path.supportStations.filter(isReady).sort((a, b) => a.pathStationM - b.pathStationM || a.supportKey.localeCompare(b.supportKey)).map((support) => {
    const index = stationIndex(nodes.map((row) => row.pathStationM), support.pathStationM, policy);
    const node = nodes[index];
    return deepFreeze({
      constraintId: `vertical-beam-constraint:${path.pathId}:${support.supportKey}`,
      supportKey: support.supportKey, pathStationM: support.pathStationM,
      nodeId: node.nodeId, constrainedDofId: node.verticalDofId,
      prescribedVerticalDisplacementM: 0, rotationConstraint: null,
      sourceEvidence: support.sourceEvidence,
    });
  });
}

function createLoadRecords(path, caseId, nodes, elements, loads, policy) {
  return loads.flatMap((load) => load.pathStationM !== undefined
    ? [pointLoadRecord(path, caseId, nodes, load, policy)]
    : distributedLoadRecords(path, caseId, elements, load, policy));
}

function pointLoadRecord(path, caseId, nodes, load, policy) {
  const index = stationIndex(nodes.map((row) => row.pathStationM), load.pathStationM, policy);
  const node = nodes[index];
  const diagnostics = node ? [] : [diagnostic(AUDIT_CODES.POINT_LOAD_MAPPING_FAILED, load.primitiveId, 'Point load has no exact mesh node.')];
  return deepFreeze({
    loadRecordId: `vertical-beam-load:${caseId}:${path.pathId}:${load.primitiveId}:point`,
    primitiveId: load.primitiveId, primitiveType: load.primitiveType,
    nodeId: node?.nodeId || null, elementId: null, pathStationM: load.pathStationM,
    intervalStartM: null, intervalEndM: null, pointForceN: load.pointForceN,
    forcePerLengthNM: null, sourceEvidence: load.sourceEvidence, diagnostics,
  });
}

function distributedLoadRecords(path, caseId, elements, load, policy) {
  const selected = elements.filter((element) => element.startStationM >= load.intervalStartM - policy.absoluteTolerance
    && element.endStationM <= load.intervalEndM + policy.absoluteTolerance);
  if (!selected.length) return [deepFreeze({
    loadRecordId: `vertical-beam-load:${caseId}:${path.pathId}:${load.primitiveId}:blocked`,
    primitiveId: load.primitiveId, primitiveType: load.primitiveType,
    nodeId: null, elementId: null, pathStationM: null,
    intervalStartM: load.intervalStartM, intervalEndM: load.intervalEndM,
    pointForceN: null, forcePerLengthNM: load.forcePerLengthNM,
    sourceEvidence: load.sourceEvidence,
    diagnostics: [diagnostic(AUDIT_CODES.DISTRIBUTED_LOAD_MAPPING_FAILED, load.primitiveId, 'Distributed load has no matching beam elements.')],
  })];
  return selected.map((element, index) => deepFreeze({
    loadRecordId: `vertical-beam-load:${caseId}:${path.pathId}:${load.primitiveId}:segment:${index}`,
    primitiveId: load.primitiveId, primitiveType: load.primitiveType,
    nodeId: null, elementId: element.elementId, pathStationM: null,
    intervalStartM: element.startStationM, intervalEndM: element.endStationM,
    pointForceN: null, forcePerLengthNM: load.forcePerLengthNM,
    sourceEvidence: load.sourceEvidence, diagnostics: [],
  }));
}

function createDofMap(nodes) {
  return nodes.flatMap((node) => [
    deepFreeze({ dofId: node.verticalDofId, index: node.nodeIndex * 2, nodeId: node.nodeId, kind: 'VERTICAL_DISPLACEMENT' }),
    deepFreeze({ dofId: node.rotationDofId, index: node.nodeIndex * 2 + 1, nodeId: node.nodeId, kind: 'ROTATION' }),
  ]);
}

function blockedCase(path, caseId, flexuralRows, loads, blockers) {
  const base = {
    pathId: path.pathId, loadCaseId: caseId, qualification: QUALIFICATION.BLOCKED,
    nodes: [], elements: [], dofMap: [], constraints: [], loadVectorRecords: [],
    flexuralPropertyReferences: flexuralRows.map((row) => row.semanticHash),
    qualifiedSupportKeys: path.qualifiedSupportKeys || [],
    eligiblePrimitiveIds: loads.eligible.map((row) => row.primitiveId),
    blockedPrimitiveIds: loads.blocked.map((row) => row.primitiveId),
    blockers: uniqueSorted(blockers),
    diagnostics: uniqueSorted(blockers).map((code) => diagnostic(code, `${path.pathId}:${caseId}`, `Vertical beam model is blocked: ${code}.`, { pathId: path.pathId, loadCaseId: caseId }, 'WARNING')),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function dedupeStations(values, policy) {
  return values.reduce((rows, value) => {
    if (!Number.isFinite(value)) return rows;
    if (!rows.length || !nearlyEqual(rows.at(-1), value, policy)) rows.push(value);
    return rows;
  }, []);
}
function validatePathCase(row, errors) {
  if (!stringValue(row?.pathId) || !stringValue(row?.loadCaseId)) errors.push('Vertical-beam path/case identity is required.');
  const nodes = Array.isArray(row?.nodes) ? row.nodes : [], elements = Array.isArray(row?.elements) ? row.elements : [];
  const dofs = Array.isArray(row?.dofMap) ? row.dofMap : [], constraints = Array.isArray(row?.constraints) ? row.constraints : [];
  if (row?.qualification === QUALIFICATION.READY && (!nodes.length || !elements.length)) errors.push(`Vertical-beam case ${row?.pathId || ''} has no mesh.`);
  validateUnique(nodes, 'nodeId', `case ${row?.pathId || ''} nodes`, errors);
  validateUnique(elements, 'elementId', `case ${row?.pathId || ''} elements`, errors);
  validateUnique(dofs, 'dofId', `case ${row?.pathId || ''} DOFs`, errors);
  const nodeIds = new Set(nodes.map((item) => item.nodeId)), dofIds = new Set(dofs.map((item) => item.dofId));
  elements.forEach((item) => {
    if (!nodeIds.has(item.startNodeId) || !nodeIds.has(item.endNodeId)) errors.push(`Element ${item.elementId || ''} references a missing node.`);
    if (!(item.lengthM > 0) || !(item.flexuralRigidityNm2 > 0)) errors.push(`Element ${item.elementId || ''} has invalid length or EI.`);
  });
  constraints.forEach((item) => {
    if (!nodeIds.has(item.nodeId) || !dofIds.has(item.constrainedDofId)) errors.push(`Constraint ${item.constraintId || ''} has an invalid reference.`);
    if (item.rotationConstraint !== null || item.prescribedVerticalDisplacementM !== 0) errors.push(`Constraint ${item.constraintId || ''} violates the rigid vertical-only boundary policy.`);
  });
  if (row?.semanticHash !== semanticHash(withoutHash(row))) errors.push(`Vertical-beam case ${row?.pathId || ''} hash mismatch.`);
}
function validateUnique(rows, key, label, errors) {
  const ids = rows.map((item) => stringValue(item?.[key]));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) errors.push(`Vertical-beam ${label} must have unique ${key} values.`);
}
function assertInputs(pathModel, flexural, loadCases, primitives, readiness, profile) {
  const checks = [validateVerticalLoadPathModel(pathModel), validateFlexuralPropertyProjection(flexural), validateLoadCaseSet(loadCases), validateModelLoadPrimitiveSet(primitives), validateModelLoadReadinessAudit(readiness), validateVerticalBeamSolverProfile(profile)];
  if (checks.some((row) => !row.ok)) throw new TypeError('Invalid vertical-beam model input.');
  if (flexural.pathModelSemanticHash !== pathModel.semanticHash) throw new TypeError('Flexural projection does not match paths.');
  if (primitives.loadCaseSetSemanticHash !== loadCases.semanticHash) throw new TypeError('Primitive set does not match load cases.');
  if (readiness.primitiveSetSemanticHash !== primitives.semanticHash) throw new TypeError('Readiness audit does not match primitives.');
}
function isReady(row) { return row.qualification === QUALIFICATION.READY; }
function caseOrder(a, b) { return `${a.pathId}|${a.loadCaseId}`.localeCompare(`${b.pathId}|${b.loadCaseId}`); }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
