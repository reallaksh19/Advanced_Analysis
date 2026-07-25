import {
  MODEL_SCHEMA as SHELL_MODEL_SCHEMA,
  createCanonicalLocalShellModel,
  validateCanonicalLocalShellModel,
} from '../local-shell/index.js';
import {
  ASSESSMENT_CLASSIFICATIONS, MANDATORY_LIMITATIONS, MODEL_SCHEMA,
  RESULT_REQUESTS, SOURCE_SCHEMA, WORKFLOW_VERSION,
} from './constants.js';
import { shellModelError, sourceError } from './errors.js';
import { canonicalCycle, canonicalFootprint } from './footprint.js';
import { qualifyGeometry } from './geometry.js';
import { canonicalStringify, codeUnitCompare, deepFreeze, semanticHash, strictClone } from './json.js';
import { canonicalQualificationProfile } from './profile.js';
import { validateAttachmentEvidence } from './source-evidence.js';
import {
  booleanValue, exactKeys, finiteNumber, member, positiveNumber,
  stringArray, stringValue, unique, vector3,
} from './validation.js';

const SOURCE_KEYS = [
  'schema', 'workflowIdentity', 'workflowVersion', 'sourceAncestry', 'attachmentEvidence',
  'shellTemplate', 'pipeGeometry', 'trunnionGeometry', 'footprint', 'loadCaseMappings',
  'assessmentRegions', 'qualificationProfile', 'resultRequests', 'limitations',
];
const MODEL_KEYS = [
  'schema', 'workflowIdentity', 'workflowVersion', 'sourceAncestry',
  'acceptedAttachmentEvidenceHash', 'canonicalShellTemplateHash', 'pipeGeometry',
  'trunnionGeometry', 'canonicalFootprint', 'canonicalLoadCaseMappings',
  'canonicalAssessmentRegions', 'unitCompatibilityEvidence', 'qualificationProfile', 'limitations', 'semanticHash',
];

export function createCanonicalTrunnionFootprintSource(input) {
  const source = canonicalSource(strictClone(input));
  return deepFreeze(source);
}
export function validateCanonicalTrunnionFootprintSource(input) {
  return createCanonicalTrunnionFootprintSource(input);
}
export function createCanonicalTrunnionFootprintModel(input) {
  const source = createCanonicalTrunnionFootprintSource(input);
  const attachment = validateAttachmentEvidence(source.attachmentEvidence, source.sourceAncestry);
  const shellTemplateHash = canonicalShellTemplateSemanticHash(source.shellTemplate);
  if (source.sourceAncestry.shellTemplateSemanticHash !== shellTemplateHash) throw sourceError('SOURCE_ANCESTRY_SHELL_TEMPLATE_MISMATCH', 'sourceAncestry.shellTemplateSemanticHash', 'Declared shell template ancestry is stale.');
  const profile = canonicalQualificationProfile(source.qualificationProfile);
  const footprint = canonicalFootprint(source.footprint, source.shellTemplate, profile);
  const geometry = qualifyGeometry(source.shellTemplate, source.pipeGeometry, source.trunnionGeometry, footprint.orderedNodeIds, profile);
  const body = {
    schema: MODEL_SCHEMA,
    workflowIdentity: source.workflowIdentity,
    workflowVersion: source.workflowVersion,
    sourceAncestry: source.sourceAncestry,
    acceptedAttachmentEvidenceHash: attachment.attachmentEvidenceHash,
    canonicalShellTemplateHash: shellTemplateHash,
    pipeGeometry: {
      ...source.pipeGeometry,
      qualificationEvidence: {
        pipeAxis: geometry.pipeAxis,
        nodeEvidence: geometry.nodeEvidence.map((row) => ({ ...row })).sort((a, b) => codeUnitCompare(a.nodeId, b.nodeId)),
      },
    },
    trunnionGeometry: { ...source.trunnionGeometry, qualificationEvidence: { trunnionAxis: geometry.trunnionAxis, axisNonParallel: geometry.axisNonParallel } },
    canonicalFootprint: { ...footprint, nodeGeometryEvidence: geometry.nodeEvidence.filter((row) => row.footprintNode).sort((a, b) => codeUnitCompare(a.nodeId, b.nodeId)) },
    canonicalLoadCaseMappings: source.loadCaseMappings,
    canonicalAssessmentRegions: source.assessmentRegions,
    unitCompatibilityEvidence: unitCompatibilityEvidence(attachment.unitEvidence, source.shellTemplate.units),
    qualificationProfile: profile,
    limitations: source.limitations,
  };
  return deepFreeze({ ...body, semanticHash: semanticHash(body) });
}
export function validateCanonicalTrunnionFootprintModel(input) {
  const model = strictClone(input);
  exactKeys(model, MODEL_KEYS, 'canonical workflow model');
  const { semanticHash: retained, ...body } = model;
  if (retained !== semanticHash(body)) throw sourceError('WORKFLOW_MODEL_HASH_MISMATCH', 'semanticHash', 'Canonical workflow model semantic hash does not reconstruct.');
  assertCanonicalModelOrdering(body);
  return deepFreeze(model);
}

function canonicalSource(source) {
  exactKeys(source, SOURCE_KEYS, 'source');
  if (source.schema !== SOURCE_SCHEMA) throw sourceError('SOURCE_SCHEMA_MISMATCH', 'schema', `schema must be ${SOURCE_SCHEMA}.`);
  if (source.workflowVersion !== WORKFLOW_VERSION) throw sourceError('WORKFLOW_VERSION_MISMATCH', 'workflowVersion', `workflowVersion must be ${WORKFLOW_VERSION}.`);
  const shellTemplate = canonicalShellTemplate(source.shellTemplate);
  const mappings = canonicalMappings(source.loadCaseMappings);
  const regions = canonicalRegions(source.assessmentRegions, shellTemplate);
  const limitations = canonicalLimitations(source.limitations);
  return {
    schema: SOURCE_SCHEMA,
    workflowIdentity: stringValue(source.workflowIdentity, 'workflowIdentity'),
    workflowVersion: source.workflowVersion,
    sourceAncestry: canonicalAncestry(source.sourceAncestry),
    attachmentEvidence: canonicalAttachmentEvidence(source.attachmentEvidence),
    shellTemplate,
    pipeGeometry: canonicalPipe(source.pipeGeometry),
    trunnionGeometry: canonicalTrunnion(source.trunnionGeometry),
    footprint: canonicalFootprintSource(source.footprint),
    loadCaseMappings: mappings,
    assessmentRegions: regions,
    qualificationProfile: canonicalQualificationProfile(source.qualificationProfile),
    resultRequests: canonicalResultRequests(source.resultRequests),
    limitations,
  };
}
function canonicalAncestry(source) {
  exactKeys(source, ['attachmentCanonicalModelSemanticHash', 'attachmentResultPayloadSemanticHash', 'shellTemplateSemanticHash', 'sourceReference'], 'sourceAncestry');
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, stringValue(value, `sourceAncestry.${key}`)]));
}
function canonicalAttachmentEvidence(source) {
  exactKeys(source, ['model', 'result'], 'attachmentEvidence');
  return { model: source.model, result: source.result };
}
function canonicalShellTemplate(source) {
  const keys = ['modelIdentity', 'modelVersion', 'sourceAncestry', 'units', 'formulation', 'materials', 'nodes', 'elements', 'constraints', 'qualificationProfile', 'resultRequests', 'limitations'];
  exactKeys(source, keys, 'shellTemplate');
  const validationSource = {
    schema: SHELL_MODEL_SCHEMA,
    ...source,
    loadCases: [{ loadCaseId: 'LAFEA5-TEMPLATE-VALIDATION', nodalLoads: [], pressureLoads: [], sourceReference: 'LAFEA5-TEMPLATE-VALIDATION' }],
  };
  let model;
  try { model = validateCanonicalLocalShellModel(createCanonicalLocalShellModel(validationSource)); }
  catch (error) { throw shellModelError('SHELL_TEMPLATE_INVALID', 'shellTemplate', error instanceof Error ? error.message : 'Shell template is invalid.'); }
  const { schema, loadCases, semanticHash: retainedHash, ...template } = model;
  void schema; void loadCases; void retainedHash;
  return template;
}
export function canonicalShellTemplateSemanticHash(source) { return semanticHash(canonicalShellTemplate(source)); }
function unitCompatibilityEvidence(attachment, shell) {
  const rows = [
    { dimension: 'length', attachmentUnit: attachment.length, shellUnit: shell.length, canonicalMeaning: 'mm', accepted: attachment.length === 'mm' && shell.length === 'mm' },
    { dimension: 'force', attachmentUnit: attachment.force, shellUnit: shell.force, canonicalMeaning: 'N', accepted: attachment.force === 'N' && shell.force === 'N' },
    { dimension: 'moment', attachmentUnit: attachment.moment, shellUnit: shell.moment, canonicalMeaning: 'N·mm', accepted: attachment.moment === 'N·mm' && shell.moment === 'N*mm' },
  ];
  if (rows.some((row) => !row.accepted)) throw sourceError('ATTACHMENT_SHELL_UNIT_MISMATCH', 'shellTemplate.units', 'Attachment and shell canonical units are incompatible.', rows);
  return { rows, accepted: true };
}
function canonicalPipe(source) {
  exactKeys(source, ['axisPoint', 'axisDirection', 'midsurfaceRadius', 'radialTolerance', 'sourceReference'], 'pipeGeometry');
  return { axisPoint: vector3(source.axisPoint, 'pipeGeometry.axisPoint'), axisDirection: vector3(source.axisDirection, 'pipeGeometry.axisDirection'), midsurfaceRadius: positiveNumber(source.midsurfaceRadius, 'pipeGeometry.midsurfaceRadius'), radialTolerance: positiveNumber(source.radialTolerance, 'pipeGeometry.radialTolerance'), sourceReference: stringValue(source.sourceReference, 'pipeGeometry.sourceReference') };
}
function canonicalTrunnion(source) {
  exactKeys(source, ['axisPoint', 'axisDirection', 'outerRadius', 'intersectionTolerance', 'sourceReference'], 'trunnionGeometry');
  return { axisPoint: vector3(source.axisPoint, 'trunnionGeometry.axisPoint'), axisDirection: vector3(source.axisDirection, 'trunnionGeometry.axisDirection'), outerRadius: positiveNumber(source.outerRadius, 'trunnionGeometry.outerRadius'), intersectionTolerance: positiveNumber(source.intersectionTolerance, 'trunnionGeometry.intersectionTolerance'), sourceReference: stringValue(source.sourceReference, 'trunnionGeometry.sourceReference') };
}
function canonicalFootprintSource(source) {
  exactKeys(source, ['footprintIdentity', 'orderedNodeIds', 'referencePoint', 'sourceReference'], 'footprint');
  return { footprintIdentity: stringValue(source.footprintIdentity, 'footprint.footprintIdentity'), orderedNodeIds: canonicalCycle(unique(stringArray(source.orderedNodeIds, 'footprint.orderedNodeIds', 3), 'footprint.orderedNodeIds')), referencePoint: vector3(source.referencePoint, 'footprint.referencePoint'), sourceReference: stringValue(source.sourceReference, 'footprint.sourceReference') };
}
function canonicalMappings(source) {
  if (!Array.isArray(source)) throw sourceError('LOAD_CASE_MAPPING_ARRAY_REQUIRED', 'loadCaseMappings', 'loadCaseMappings must be an array.');
  const result = source.map((row, index) => {
    exactKeys(row, ['workflowLoadCaseId', 'attachmentLoadCaseId', 'shellLoadCaseId', 'mechanicalScaleFactor', 'sourceReference'], `loadCaseMappings[${index}]`);
    return { workflowLoadCaseId: stringValue(row.workflowLoadCaseId, `loadCaseMappings[${index}].workflowLoadCaseId`), attachmentLoadCaseId: stringValue(row.attachmentLoadCaseId, `loadCaseMappings[${index}].attachmentLoadCaseId`), shellLoadCaseId: stringValue(row.shellLoadCaseId, `loadCaseMappings[${index}].shellLoadCaseId`), mechanicalScaleFactor: finiteNumber(row.mechanicalScaleFactor, `loadCaseMappings[${index}].mechanicalScaleFactor`), sourceReference: stringValue(row.sourceReference, `loadCaseMappings[${index}].sourceReference`) };
  }).sort((a, b) => codeUnitCompare(a.workflowLoadCaseId, b.workflowLoadCaseId));
  unique(result.map((row) => row.workflowLoadCaseId), 'loadCaseMappings.workflowLoadCaseId');
  unique(result.map((row) => row.shellLoadCaseId), 'loadCaseMappings.shellLoadCaseId');
  return result;
}
function canonicalRegions(source, shellTemplate) {
  if (!Array.isArray(source) || source.length === 0) throw sourceError('ASSESSMENT_REGION_REQUIRED', 'assessmentRegions', 'At least one assessment region is required.');
  const elementIds = new Set(shellTemplate.elements.map((element) => element.elementId));
  const result = source.map((row, index) => {
    exactKeys(row, ['regionId', 'elementIds', 'classification', 'sourceReference'], `assessmentRegions[${index}]`);
    const ids = unique(stringArray(row.elementIds, `assessmentRegions[${index}].elementIds`, 1), `assessmentRegions[${index}].elementIds`).sort(codeUnitCompare);
    for (const id of ids) if (!elementIds.has(id)) throw sourceError('ASSESSMENT_ELEMENT_MISSING', `assessmentRegions[${index}].elementIds`, `Assessment element ${id} is missing.`);
    return { regionId: stringValue(row.regionId, `assessmentRegions[${index}].regionId`), elementIds: ids, classification: member(row.classification, ASSESSMENT_CLASSIFICATIONS, `assessmentRegions[${index}].classification`), sourceReference: stringValue(row.sourceReference, `assessmentRegions[${index}].sourceReference`) };
  }).sort((a, b) => codeUnitCompare(a.regionId, b.regionId));
  unique(result.map((row) => row.regionId), 'assessmentRegions.regionId');
  return result;
}
function canonicalResultRequests(source) {
  exactKeys(source, Object.keys(RESULT_REQUESTS), 'resultRequests');
  booleanValue(source.retainGeneratedShellModel, 'resultRequests.retainGeneratedShellModel');
  booleanValue(source.retainRawShellResult, 'resultRequests.retainRawShellResult');
  if (source.retainGeneratedShellModel !== true || source.retainRawShellResult !== true || source.governingMetric !== RESULT_REQUESTS.governingMetric) throw sourceError('UNSUPPORTED_RESULT_REQUEST', 'resultRequests', 'LAFEA.5 requires raw shell evidence and the fixed combined von Mises governing metric.');
  return { ...RESULT_REQUESTS };
}
function canonicalLimitations(source) {
  const values = unique(stringArray(source, 'limitations'), 'limitations').sort(codeUnitCompare);
  for (const limitation of MANDATORY_LIMITATIONS) if (!values.includes(limitation)) throw sourceError('MANDATORY_LIMITATION_MISSING', 'limitations', `Missing mandatory limitation ${limitation}.`);
  return values;
}


function assertCanonicalModelOrdering(model) {
  assertSorted(model.canonicalLoadCaseMappings, 'workflowLoadCaseId', 'canonicalLoadCaseMappings');
  assertSorted(model.canonicalAssessmentRegions, 'regionId', 'canonicalAssessmentRegions');
  for (const region of model.canonicalAssessmentRegions) assertSortedStrings(region.elementIds, `canonicalAssessmentRegions.${region.regionId}.elementIds`);
  assertSortedStrings(model.limitations, 'limitations');
  if (canonicalStringify(model.canonicalFootprint.orderedNodeIds) !== canonicalStringify(canonicalCycle(model.canonicalFootprint.orderedNodeIds))) {
    throw sourceError('WORKFLOW_MODEL_NOT_CANONICAL', 'canonicalFootprint.orderedNodeIds', 'Canonical footprint cycle ordering is invalid.');
  }
  assertSorted(model.canonicalFootprint.nodeGeometryEvidence, 'nodeId', 'canonicalFootprint.nodeGeometryEvidence');
  assertSorted(model.pipeGeometry.qualificationEvidence.nodeEvidence, 'nodeId', 'pipeGeometry.qualificationEvidence.nodeEvidence');
}
function assertSorted(rows, field, path) {
  const values = rows.map((row) => row[field]);
  assertSortedStrings(values, path);
}
function assertSortedStrings(values, path) {
  const expected = [...values].sort(codeUnitCompare);
  if (new Set(values).size !== values.length || canonicalStringify(values) !== canonicalStringify(expected)) {
    throw sourceError('WORKFLOW_MODEL_NOT_CANONICAL', path, `${path} ordering is invalid.`);
  }
}