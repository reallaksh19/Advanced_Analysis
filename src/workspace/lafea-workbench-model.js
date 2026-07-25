/**
 * LAFEA workbench stage contracts.
 *
 * Editable source documents are canonicalized immediately before a calculation.
 * This keeps derived semantic hashes out of form state and prevents stale evidence
 * from being presented as an accepted engineering result.
 */
import {
  calculateLocalAttachmentFoundation,
  createCanonicalLocalAttachmentFoundationModel,
  MODEL_SCHEMA as ATTACHMENT_MODEL_SCHEMA,
  validateCanonicalLocalAttachmentFoundationModel,
} from '../core/local-stress/index.js';
import {
  calculateLocalAttachmentScreening,
  createLocalAttachmentScreeningRequest,
  validateLocalAttachmentScreeningRequest,
} from '../core/local-attachment-screening/index.js';
import {
  calculateLocalContinuum,
  createCanonicalLocalContinuumModel,
  MODEL_SCHEMA as CONTINUUM_MODEL_SCHEMA,
  validateCanonicalLocalContinuumModel,
} from '../core/local-continuum/index.js';
import {
  calculateLocalShell,
  createCanonicalLocalShellModel,
  validateCanonicalLocalShellModel,
} from '../core/local-shell/index.js';
import {
  calculateLocalTrunnionFootprint,
  canonicalShellTemplateSemanticHash,
  createCanonicalTrunnionFootprintModel,
  createCanonicalTrunnionFootprintSource,
} from '../core/local-trunnion-footprint/index.js';
export const LAFEA_WORKBENCH_DOCUMENT_SCHEMA = 'lafea-workbench-document/v1';
export const LAFEA_STAGE_IDS = Object.freeze([
  'LAFEA.1',
  'LAFEA.2',
  'LAFEA.3',
  'LAFEA.4',
  'LAFEA.5',
]);

export const LAFEA_STAGE_DEFINITIONS = Object.freeze([
  stage('LAFEA.1', 'Attachment foundation', 'Load transfer and pressure baseline'),
  stage('LAFEA.2', 'Pipe-section screening', 'Nominal local pipe-section screening'),
  stage('LAFEA.3', '2D continuum', 'T3 plane-stress or plane-strain continuum'),
  stage('LAFEA.4', 'Thin shell', 'Five-DOF triangular thin-shell kernel'),
  stage('LAFEA.5', 'Trunnion footprint', 'Attachment-to-shell footprint workflow'),
]);
const COLLECTIONS = Object.freeze({
  'LAFEA.1': ['materials', 'pressureDefinitions', 'loadReferencePoints', 'loadCases'],
  'LAFEA.2': ['screeningCases', 'evaluationLocations'],
  'LAFEA.3': ['materials', 'nodes', 'elements', 'constraints', 'loadCases'],
  'LAFEA.4': ['materials', 'nodes', 'elements', 'constraints', 'loadCases'],
  'LAFEA.5': [
    'shellTemplate.materials',
    'shellTemplate.nodes',
    'shellTemplate.elements',
    'shellTemplate.constraints',
    'loadCaseMappings',
    'assessmentRegions',
  ],
});
/**
 * Validate and normalize an editable document for one exact LAFEA stage.
 *
 * @param {string} stageId Exact LAFEA stage identity.
 * @param {unknown} input Imported source or canonical model.
 * @returns {Readonly<Record<string, unknown>>} Editable canonical source.
 */
export function normalizeLafeaStageDocument(stageId, input) {
  assertStageId(stageId);
  const source = editableSource(stageId, cloneRecord(input));
  if (stageId === 'LAFEA.1') {
    const retained = createCanonicalLocalAttachmentFoundationModel(source).sourceEvidence;
    return freezeClone({ ...retained, schema: ATTACHMENT_MODEL_SCHEMA });
  }
  if (stageId === 'LAFEA.2') {
    return freezeClone(editableScreening(createLocalAttachmentScreeningRequest(source)));
  }
  if (stageId === 'LAFEA.3') {
    const retained = createCanonicalLocalContinuumModel(source).sourceEvidence;
    return freezeClone({ ...retained, schema: CONTINUUM_MODEL_SCHEMA });
  }
  if (stageId === 'LAFEA.4') {
    return freezeClone(withoutHash(createCanonicalLocalShellModel(source)));
  }
  const retained = createCanonicalTrunnionFootprintSource(source);
  createCanonicalTrunnionFootprintModel(retained);
  return freezeClone(retained);
}

/**
 * Reseal only derived ancestry produced by an explicit local form edit.
 *
 * @param {string} stageId Exact LAFEA stage identity.
 * @param {unknown} input Edited source document.
 * @returns {Readonly<Record<string, unknown>>} Validated editable source.
 */
export function normalizeLafeaStageEdit(stageId, input) {
  const source = cloneRecord(input);
  if (stageId === 'LAFEA.5' && isRecord(source.sourceAncestry) && isRecord(source.shellTemplate)) {
    source.sourceAncestry.shellTemplateSemanticHash = canonicalShellTemplateSemanticHash(source.shellTemplate);
  }
  return normalizeLafeaStageDocument(stageId, source);
}
/**
 * Execute the only qualified calculation API assigned to a LAFEA stage.
 *
 * @param {string} stageId Exact LAFEA stage identity.
 * @param {unknown} document Editable stage source.
 * @returns {Readonly<Record<string, unknown>>} Calculation outcome and evidence.
 */
export function executeLafeaStage(stageId, document) {
  assertStageId(stageId);
  try {
    const source = normalizeLafeaStageDocument(stageId, document);
    const canonicalInput = canonicalCalculationInput(stageId, source);
    const result = calculate(stageId, canonicalInput);
    const accepted = acceptedResult(stageId, result);
    const diagnostics = accepted ? [] : normalizedDiagnostics(result);
    return freezeClone({
      stageId,
      status: accepted ? 'QUALIFIED' : 'FAILED',
      source,
      canonicalInput,
      result,
      diagnostics,
    });
  } catch (error) {
    return freezeClone({
      stageId,
      status: 'FAILED',
      source: null,
      canonicalInput: null,
      result: null,
      diagnostics: [errorDiagnostic(error)],
    });
  }
}
/**
 * Return collection paths exposed by the stage record editor.
 *
 * @param {string} stageId Exact LAFEA stage identity.
 * @returns {ReadonlyArray<string>} Stable collection paths.
 */
export function lafeaCollectionPaths(stageId) {
  assertStageId(stageId);
  return COLLECTIONS[stageId];
}
/**
 * Derive two-dimensional preview geometry without changing the source.
 *
 * @param {string} stageId Exact LAFEA stage identity.
 * @param {unknown} input Editable stage source.
 * @returns {{nodes: Array<Record<string, unknown>>, elements: Array<Record<string, unknown>>, nodePath: string|null}}
 */
export function lafeaPreviewGeometry(stageId, input) {
  const document = isRecord(input) ? input : {};
  if (stageId === 'LAFEA.3') return xyGeometry(document.nodes, document.elements, 'nodes');
  if (stageId === 'LAFEA.4') return positionGeometry(document.nodes, document.elements, 'nodes');
  if (stageId === 'LAFEA.5') {
    return positionGeometry(document.shellTemplate?.nodes, document.shellTemplate?.elements, 'shellTemplate.nodes');
  }
  const points = Array.isArray(document.loadReferencePoints)
    ? document.loadReferencePoints.map((row) => ({
      nodeId: row.identity,
      x: row.point?.value?.[0],
      y: row.point?.value?.[1],
    }))
    : [];
  return { nodes: validNodes(points), elements: pointLink(points), nodePath: null };
}
function canonicalCalculationInput(stageId, source) {
  if (stageId === 'LAFEA.1') return createCanonicalLocalAttachmentFoundationModel(source);
  if (stageId === 'LAFEA.2') return createLocalAttachmentScreeningRequest(source);
  if (stageId === 'LAFEA.3') return createCanonicalLocalContinuumModel(source);
  if (stageId === 'LAFEA.4') return createCanonicalLocalShellModel(source);
  return createCanonicalTrunnionFootprintSource(source);
}
function calculate(stageId, input) {
  if (stageId === 'LAFEA.1') return calculateLocalAttachmentFoundation(input);
  if (stageId === 'LAFEA.2') return calculateLocalAttachmentScreening(input);
  if (stageId === 'LAFEA.3') return calculateLocalContinuum(input);
  if (stageId === 'LAFEA.4') return calculateLocalShell(input);
  return calculateLocalTrunnionFootprint(input);
}
function acceptedResult(stageId, result) {
  if (stageId === 'LAFEA.4' || stageId === 'LAFEA.5') {
    return result?.qualification?.accepted === true;
  }
  return result?.qualification?.state === 'ACCEPTED';
}
function normalizedDiagnostics(result) {
  const rows = Array.isArray(result?.diagnostics) ? result.diagnostics : [];
  return rows.length ? rows : [{ severity: 'ERROR', code: 'LAFEA_CALCULATION_REJECTED', message: result?.qualification?.summary || 'The qualified kernel rejected the document.' }];
}
function editableSource(stageId, input) {
  if (stageId === 'LAFEA.1' && isRecord(input.sourceEvidence)) {
    const source = validateCanonicalLocalAttachmentFoundationModel(input).sourceEvidence;
    return { ...source, schema: ATTACHMENT_MODEL_SCHEMA };
  }
  if (stageId === 'LAFEA.3' && isRecord(input.sourceEvidence)) {
    const source = validateCanonicalLocalContinuumModel(input).sourceEvidence;
    return { ...source, schema: CONTINUUM_MODEL_SCHEMA };
  }
  if (stageId === 'LAFEA.2' && typeof input.semanticHash === 'string') {
    return editableScreening(validateLocalAttachmentScreeningRequest(input));
  }
  if (stageId === 'LAFEA.4' && typeof input.semanticHash === 'string') {
    return withoutHash(validateCanonicalLocalShellModel(input));
  }
  if (stageId === 'LAFEA.2') return editableScreening(input);
  if (stageId === 'LAFEA.4') return withoutHash(input);
  return input;
}
function editableScreening(input) {
  const result = withoutHash(input);
  if (Array.isArray(result.evaluationLocations)) {
    result.evaluationLocations = result.evaluationLocations.map((row) => {
      const copy = cloneRecord(row);
      delete copy.radius;
      return copy;
    });
  }
  return result;
}
function xyGeometry(nodes, elements, nodePath) {
  const rows = Array.isArray(nodes)
    ? nodes.map((row) => ({ nodeId: row.nodeId, x: row.x, y: row.y }))
    : [];
  return { nodes: validNodes(rows), elements: validElements(elements), nodePath };
}

function positionGeometry(nodes, elements, nodePath) {
  const rows = Array.isArray(nodes)
    ? nodes.map((row) => ({ nodeId: row.nodeId, x: row.position?.[0], y: row.position?.[1] }))
    : [];
  return { nodes: validNodes(rows), elements: validElements(elements), nodePath };
}

function validNodes(rows) {
  return rows.filter((row) => typeof row.nodeId === 'string' && Number.isFinite(row.x) && Number.isFinite(row.y));
}

function validElements(rows) {
  return Array.isArray(rows)
    ? rows.filter((row) => typeof row.elementId === 'string' && Array.isArray(row.nodeIds))
      .map((row) => ({ elementId: row.elementId, nodeIds: [...row.nodeIds] }))
    : [];
}

function pointLink(points) {
  return points.length > 1 ? [{ elementId: 'LOAD-REFERENCE-LINK', nodeIds: points.map((row) => row.nodeId) }] : [];
}

function errorDiagnostic(error) {
  return {
    severity: 'ERROR',
    code: typeof error?.code === 'string' ? error.code : 'LAFEA_DOCUMENT_REJECTED',
    path: typeof error?.path === 'string' ? error.path : 'document',
    message: error instanceof Error ? error.message : 'Unknown LAFEA document failure.',
  };
}

function stage(stageId, label, purpose) {
  return Object.freeze({ stageId, label, purpose });
}

function assertStageId(stageId) {
  if (!LAFEA_STAGE_IDS.includes(stageId)) throw new TypeError(`Unsupported LAFEA stage: ${stageId}.`);
}

function withoutHash(value) {
  const result = cloneRecord(value);
  delete result.semanticHash;
  return result;
}

function cloneRecord(value) {
  if (!isRecord(value)) throw new TypeError('LAFEA document must be a JSON object.');
  return structuredClone(value);
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function freezeClone(value) {
  return deepFreeze(structuredClone(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
