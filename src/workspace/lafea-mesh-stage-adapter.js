/** Pure request/readiness facade over the canonical LAFEA stage analysis adapter. */
import { requireLafeaStageAnalysisAdapter } from './lafea-stage-analysis-adapter.js';

export const LAFEA_MESH_STAGE_ADAPTER_SCHEMA = 'lafea-mesh-stage-adapter/v1';
export const LAFEA_MESH_REQUEST_READINESS_SCHEMA = 'lafea-mesh-request-readiness/v1';

const SOURCE_SURFACES = Object.freeze({
  'LAFEA.3': 'CONTINUUM_2D',
  'LAFEA.4': 'THIN_SHELL',
  'LAFEA.5': 'HOST_SHELL',
});

export function lafeaMeshStageAdapter(stageId) {
  let canonical;
  try {
    canonical = requireLafeaStageAnalysisAdapter(stageId);
  } catch {
    throw meshStageAdapterError('LAFEA_MESH_STAGE_ADAPTER_NOT_AVAILABLE');
  }
  const discretization = canonical.discretization;
  if (discretization?.applicable !== true
    || !Array.isArray(discretization.allowedElementFamilies)
    || discretization.allowedElementFamilies.length === 0
    || !nonempty(discretization.sourceNodePath)
    || !nonempty(discretization.sourceElementPath)) {
    throw meshStageAdapterError('LAFEA_MESH_STAGE_ADAPTER_NOT_AVAILABLE');
  }
  return freeze({
    schema: LAFEA_MESH_STAGE_ADAPTER_SCHEMA,
    stageId,
    canonicalStageAdapterId: canonical.adapterId,
    sourceSurface: SOURCE_SURFACES[stageId] ?? 'MESH_APPLICABLE_STAGE',
    nodeCollectionPath: discretization.sourceNodePath.split('.'),
    elementCollectionPath: discretization.sourceElementPath.split('.'),
    allowedElementFamilies: [...discretization.allowedElementFamilies],
    refinementEntityKinds: ['NODE', 'ELEMENT'],
    generationExecutionAuthorized: discretization.generationAuthorized === true,
    refinementExecutionAuthorized: discretization.refinementAuthorized === true,
  });
}

export function projectLafeaMeshRequestReadiness(stageValue) {
  const stage = requireStage(stageValue);
  let adapter;
  try {
    adapter = lafeaMeshStageAdapter(stage.stageId);
  } catch (error) {
    return readiness(stage.stageId, null, [], [error.code ?? 'LAFEA_MESH_STAGE_ADAPTER_NOT_AVAILABLE']);
  }

  const reasons = [];
  const lifecycle = isRecord(stage.lifecycle) ? stage.lifecycle : null;
  const binding = isRecord(stage.lifecycleBinding) ? stage.lifecycleBinding : null;
  const source = isRecord(lifecycle?.source) ? lifecycle.source : null;
  const artifacts = isRecord(lifecycle?.artifacts) ? lifecycle.artifacts : null;
  const canonicalModel = isRecord(artifacts?.CANONICAL_MODEL) ? artifacts.CANONICAL_MODEL : null;
  const analysisGeometry = isRecord(artifacts?.ANALYSIS_GEOMETRY) ? artifacts.ANALYSIS_GEOMETRY : null;

  if (binding?.status !== 'CURRENT') reasons.push('LAFEA_MESH_REQUEST_LIFECYCLE_BINDING_NOT_CURRENT');
  if (source?.status !== 'CURRENT' || !isSha256(source?.sourceHash)) {
    reasons.push('LAFEA_MESH_REQUEST_SOURCE_NOT_CURRENT');
  }
  if (!currentPass(canonicalModel)) reasons.push('LAFEA_MESH_REQUEST_CANONICAL_MODEL_NOT_CURRENT');
  if (!currentPass(analysisGeometry)) reasons.push('LAFEA_MESH_REQUEST_ANALYSIS_GEOMETRY_NOT_CURRENT');

  const sourceHash = isSha256(source?.sourceHash) ? source.sourceHash : null;
  const canonicalModelHash = isSha256(canonicalModel?.artifactHash)
    ? canonicalModel.artifactHash : null;
  const analysisGeometryHash = isSha256(analysisGeometry?.artifactHash)
    ? analysisGeometry.artifactHash : null;
  const meshProfileHash = nonempty(stage.analysisMeshProfileHash)
    ? stage.analysisMeshProfileHash : null;

  if (!canonicalModelHash) reasons.push('LAFEA_MESH_REQUEST_CANONICAL_MODEL_HASH_INVALID');
  if (!analysisGeometryHash) reasons.push('LAFEA_MESH_REQUEST_ANALYSIS_GEOMETRY_HASH_INVALID');
  if (!meshProfileHash) reasons.push('LAFEA_MESH_REQUEST_PROFILE_BINDING_REQUIRED');

  if (sourceHash && canonicalModel
    && canonicalModel.parentHashes?.sourceHash !== sourceHash) {
    reasons.push('LAFEA_MESH_REQUEST_CANONICAL_MODEL_PARENT_MISMATCH');
  }
  if (sourceHash && canonicalModelHash && analysisGeometry
    && (analysisGeometry.parentHashes?.sourceHash !== sourceHash
      || analysisGeometry.parentHashes?.canonicalModelHash !== canonicalModelHash)) {
    reasons.push('LAFEA_MESH_REQUEST_ANALYSIS_GEOMETRY_PARENT_MISMATCH');
  }

  let entityIds = [];
  try {
    entityIds = collectRefinementEntityIds(stage.document, adapter);
  } catch (error) {
    reasons.push(error.code ?? 'LAFEA_MESH_REQUEST_SOURCE_SURFACE_INVALID');
  }

  return readiness(stage.stageId, adapter, entityIds, reasons, {
    sourceHash,
    canonicalModelHash,
    analysisGeometryHash,
    meshProfileHash,
  });
}

export function requireReadyLafeaMeshRequestStage(stageValue) {
  const stage = requireStage(stageValue);
  const projection = projectLafeaMeshRequestReadiness(stage);
  if (!projection.ready) {
    throw meshStageAdapterError('LAFEA_MESH_STAGE_REQUEST_NOT_READY', {
      reasons: projection.reasons,
    });
  }
  return projection;
}

export function requireKnownLafeaMeshRefinementIds(value, available, options = {}) {
  const allowEmpty = options.allowEmpty === true;
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw meshStageAdapterError('LAFEA_MESH_REQUEST_REFINEMENT_IDS_INVALID');
  }
  const ids = value.map((id) => {
    if (!nonempty(id)) throw meshStageAdapterError('LAFEA_MESH_REQUEST_REFINEMENT_ID_INVALID');
    return id;
  });
  if (new Set(ids).size !== ids.length) {
    throw meshStageAdapterError('LAFEA_MESH_REQUEST_REFINEMENT_IDS_DUPLICATE');
  }
  const allowed = new Set(available);
  if (ids.some((id) => !allowed.has(id))) {
    throw meshStageAdapterError('LAFEA_MESH_REQUEST_REFINEMENT_ID_UNKNOWN');
  }
  return Object.freeze([...ids].sort(compareCodeUnits));
}

export function requireLafeaMeshRequestElementFamily(projection, elementFamily) {
  if (!projection.allowedElementFamilies.includes(elementFamily)) {
    throw meshStageAdapterError('LAFEA_MESH_REQUEST_ELEMENT_FAMILY_NOT_AUTHORIZED');
  }
  return elementFamily;
}

function readiness(stageId, adapter, entityIds, reasons, hashes = {}) {
  const uniqueReasons = unique(reasons);
  return freeze({
    schema: LAFEA_MESH_REQUEST_READINESS_SCHEMA,
    stageId,
    canonicalStageAdapterId: adapter?.canonicalStageAdapterId ?? null,
    adapterAvailable: Boolean(adapter),
    ready: Boolean(adapter) && uniqueReasons.length === 0,
    sourceSurface: adapter?.sourceSurface ?? null,
    allowedElementFamilies: adapter ? [...adapter.allowedElementFamilies] : [],
    availableRefinementEntityIds: [...entityIds],
    sourceHash: hashes.sourceHash ?? null,
    canonicalModelHash: hashes.canonicalModelHash ?? null,
    analysisGeometryHash: hashes.analysisGeometryHash ?? null,
    meshProfileHash: hashes.meshProfileHash ?? null,
    reasons: uniqueReasons,
    executionAuthorized: false,
  });
}

function collectRefinementEntityIds(documentValue, adapter) {
  if (!isRecord(documentValue)) throw meshStageAdapterError('LAFEA_MESH_REQUEST_DOCUMENT_REQUIRED');
  const nodes = collectionAt(documentValue, adapter.nodeCollectionPath);
  const elements = collectionAt(documentValue, adapter.elementCollectionPath);
  return unique([
    ...identityValues(nodes, 'nodeId'),
    ...identityValues(elements, 'elementId'),
  ]).sort(compareCodeUnits);
}

function collectionAt(value, path) {
  let current = value;
  for (const key of path) current = isRecord(current) ? current[key] : undefined;
  if (!Array.isArray(current)) {
    throw meshStageAdapterError('LAFEA_MESH_REQUEST_SOURCE_COLLECTION_INVALID');
  }
  return current;
}

function identityValues(rows, key) {
  return rows.map((row) => {
    if (!isRecord(row) || !nonempty(row[key])) {
      throw meshStageAdapterError('LAFEA_MESH_REQUEST_SOURCE_IDENTITY_INVALID');
    }
    return row[key];
  });
}

function requireStage(value) {
  if (!isRecord(value) || !nonempty(value.stageId)) {
    throw meshStageAdapterError('LAFEA_MESH_STAGE_STATE_REQUIRED');
  }
  return value;
}
function currentPass(record) {
  return record?.status === 'CURRENT' && record?.qualification === 'PASS';
}
function isSha256(value) {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value);
}
function nonempty(value) { return typeof value === 'string' && value.length > 0; }
function isRecord(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function compareCodeUnits(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function meshStageAdapterError(code, data = {}) {
  const error = new TypeError(code);
  error.code = code;
  error.data = freeze({ ...data });
  return error;
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
