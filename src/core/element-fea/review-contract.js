import { deepFreeze } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';

export const REVIEW_PROFILE_SCHEMA = 'lfea-review-profile/v1';
export const REVIEW_INPUT_SCHEMA = 'lfea-review-input/v1';
export const ENGINEERING_REVIEW_SCHEMA = 'lfea-engineering-review/v1';
export const EVIDENCE_EXPORT_SCHEMA = 'lfea-evidence-export/v1';
export const REVIEW_STATUSES = Object.freeze({
  QUALIFIED: 'QUALIFIED_FOR_REVIEW',
  INCONSISTENT: 'REJECTED_INCONSISTENT_EVIDENCE',
  UNQUALIFIED: 'REJECTED_UNQUALIFIED_RESULT',
  CAPACITY: 'REJECTED_CAPACITY',
});
export const RAW_STRESS_AUTHORITY = 'AUTHORITATIVE_RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS';
export const PROJECTED_STRESS_AUTHORITY = 'NON_AUTHORITATIVE_REVIEW_PROJECTION';
export const SCALED_GEOMETRY_AUTHORITY = 'SCALED_DEFORMATION_REVIEW_GEOMETRY';
export const EXPORT_STATUS = Object.freeze({ QUALIFIED: 'QUALIFIED_EXPORT', REJECTED: 'REJECTED_EXPORT' });
export const QUALIFICATION_ROW_STATUSES = Object.freeze(['PASS','FAIL','NOT_APPLICABLE','NOT_SUPPLIED']);
export const DIAGNOSTIC_SEVERITIES = Object.freeze(['ERROR','WARNING','INFORMATION']);

const PROFILE_KEYS = Object.freeze([
  'schema','profileIdentity','deformationScale','coordinateDisplayPrecision','displacementDisplayPrecision',
  'forceDisplayPrecision','stressDisplayPrecision','energyDisplayPrecision','includeProjectedStress',
  'includeConvergenceEvidence','includeSourceArtifacts','maximumExportRows','maximumExportBytes',
]);
const INPUT_KEYS = Object.freeze([
  'schema','reviewIdentity','reviewVersion','adapterResult','model','result','convergenceStudy',
  'convergenceResult','stressProjection','sourceReferences','semanticHash',
]);

export function createReviewProfile(value) {
  const row = record(value, 'review profile');
  exactKeys(row, PROFILE_KEYS, 'review profile');
  if (row.schema !== REVIEW_PROFILE_SCHEMA) throw new TypeError('Invalid lfea-review-profile/v1 schema.');
  const result = {
    schema: REVIEW_PROFILE_SCHEMA,
    profileIdentity: text(row.profileIdentity, 'profileIdentity'),
    deformationScale: nonnegative(row.deformationScale, 'deformationScale'),
    coordinateDisplayPrecision: precision(row.coordinateDisplayPrecision, 'coordinateDisplayPrecision'),
    displacementDisplayPrecision: precision(row.displacementDisplayPrecision, 'displacementDisplayPrecision'),
    forceDisplayPrecision: precision(row.forceDisplayPrecision, 'forceDisplayPrecision'),
    stressDisplayPrecision: precision(row.stressDisplayPrecision, 'stressDisplayPrecision'),
    energyDisplayPrecision: precision(row.energyDisplayPrecision, 'energyDisplayPrecision'),
    includeProjectedStress: boolean(row.includeProjectedStress, 'includeProjectedStress'),
    includeConvergenceEvidence: boolean(row.includeConvergenceEvidence, 'includeConvergenceEvidence'),
    includeSourceArtifacts: boolean(row.includeSourceArtifacts, 'includeSourceArtifacts'),
    maximumExportRows: positiveInteger(row.maximumExportRows, 'maximumExportRows'),
    maximumExportBytes: positiveInteger(row.maximumExportBytes, 'maximumExportBytes'),
  };
  return deepFreeze(result);
}

export function createReviewInput(value) {
  const row = record(value, 'review input');
  exactKeys(row, INPUT_KEYS, 'review input');
  if (row.schema !== REVIEW_INPUT_SCHEMA) throw new TypeError('Invalid lfea-review-input/v1 schema.');
  const declaredHash = semanticHashText(row.semanticHash, 'semanticHash');
  const base = {
    schema: REVIEW_INPUT_SCHEMA,
    reviewIdentity: text(row.reviewIdentity, 'reviewIdentity'),
    reviewVersion: text(row.reviewVersion, 'reviewVersion'),
    adapterResult: normalizeAdapterResult(requiredArtifact(row.adapterResult, 'adapterResult')),
    model: normalizeModel(requiredArtifact(row.model, 'model')),
    result: normalizeResult(requiredArtifact(row.result, 'result')),
    convergenceStudy: normalizeNullable(row.convergenceStudy, 'convergenceStudy', normalizeStudy),
    convergenceResult: normalizeNullable(row.convergenceResult, 'convergenceResult', normalizeConvergenceResult),
    stressProjection: normalizeNullable(row.stressProjection, 'stressProjection', normalizeProjection),
    sourceReferences: normalizeSourceReferences(row.sourceReferences),
  };
  const hash = semanticHash(base);
  if (declaredHash !== hash) throw new TypeError('Review input semantic hash mismatch.');
  return deepFreeze({ ...base, semanticHash: hash });
}

export function validateReviewProfile(value) {
  return validation(() => createReviewProfile(value));
}

export function validateReviewInput(value) {
  return validation(() => createReviewInput(value));
}

export function compareIdentity(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sortDiagnostics(rows) {
  const severityOrder = new Map(DIAGNOSTIC_SEVERITIES.map((value, index) => [value, index]));
  return [...rows].map(normalizeDiagnostic).sort((a, b) =>
    (severityOrder.get(a.severity) ?? 99) - (severityOrder.get(b.severity) ?? 99)
      || compareIdentity(a.code, b.code)
      || compareIdentity(a.sourceArtifactIdentity, b.sourceArtifactIdentity)
      || compareIdentity(a.message, b.message));
}

export function normalizeLimitations(rows) {
  if (!Array.isArray(rows)) throw new TypeError('limitations must be an array.');
  return [...new Set(rows.map((value) => text(value, 'limitation')))].sort(compareIdentity);
}

export function withoutHash(value) {
  const { semanticHash: _semanticHash, ...base } = value || {};
  return base;
}

function normalizeAdapterResult(value) {
  const row = structuredClone(value);
  if (row.qualifiedModel) row.qualifiedModel = normalizeModel(row.qualifiedModel);
  sortArray(row, 'mappingLedger', (a,b)=>compareIdentity(a.mappingIdentity,b.mappingIdentity));
  sortArray(row, 'diagnostics', diagnosticCompare);
  sortArray(row, 'limitations', compareIdentity);
  if (row.topologyEvidence?.edges) row.topologyEvidence.edges.sort((a,b)=>compareIdentity(a.edgeIdentity,b.edgeIdentity));
  for (const key of ['regions','boundaries','points']) if (Array.isArray(row.entityEvidence?.[key])) row.entityEvidence[key].sort(identityCompareFor(key));
  for (const key of ['materialAssignments','thicknessAssignments','loadAssignments','constraintAssignments']) if (Array.isArray(row.assignmentEvidence?.[key])) row.assignmentEvidence[key].sort(assignmentCompare);
  return row;
}
function normalizeModel(value) {
  const row=structuredClone(value);
  sortArray(row,'nodes',idCompare('nodeId'));sortArray(row,'elements',idCompare('elementId'));sortArray(row,'materials',idCompare('materialId'));
  sortArray(row,'restraints',constraintCompare);sortArray(row,'prescribedDisplacements',constraintCompare);sortArray(row,'sourceReferences',idCompare('sourceReferenceId'));sortArray(row,'limitations',compareIdentity);
  sortArray(row,'loadCases',idCompare('loadCaseId'));for(const loadCase of row.loadCases||[]){sortArray(loadCase,'nodalForces',idCompare('loadId'));sortArray(loadCase,'edgeLoads',idCompare('loadId'));}
  return row;
}
function normalizeResult(value) {
  const row=structuredClone(value);if(row.modelEvidence)row.modelEvidence=normalizeModel(row.modelEvidence);
  const byEquation=['dofMap','directNodalLoads','equivalentEdgeLoads','nodalDisplacements','reactions','constrainedDofImbalance'];for(const key of byEquation)sortArray(row,key,equationCompare);
  const byElement=['elementInternalForces','elementStrainEnergy','elementStrains','elementStresses','principalStresses','vonMisesStress','elementIntegrationEvidence','elementQualityEvidence'];for(const key of byElement)sortArray(row,key,idCompare('elementId'));
  sortArray(row,'directNodalLoadEvidence',idCompare('loadId'));sortArray(row,'edgeLoadEvidence',idCompare('loadId'));sortArray(row,'integrationPointResults',integrationCompare);sortArray(row,'diagnostics',diagnosticCompare);sortArray(row,'limitations',compareIdentity);
  if(row.constraintPartition){sortArray(row.constraintPartition,'freeEquations',equationCompare);sortArray(row.constraintPartition,'constrainedEquations',equationCompare);sortArray(row.constraintPartition,'freeDofIndices',(a,b)=>a-b);sortArray(row.constraintPartition,'constrainedDofIndices',(a,b)=>a-b);}
  if(row.iterativeSolverEvidence)sortArray(row.iterativeSolverEvidence,'residualNormHistory',(a,b)=>a.iteration-b.iteration);
  return row;
}
function normalizeStudy(value) {
  const row=structuredClone(value);sortArray(row,'probes',idCompare('probeId'));sortArray(row,'quantities',idCompare('quantityId'));sortArray(row,'levels',(a,b)=>a.declaredOrder-b.declaredOrder||compareIdentity(a.levelId,b.levelId));sortArray(row,'singularFeatures',idCompare('featureId'));sortArray(row,'refinementRatios',(a,b)=>compareIdentity(a.coarseLevelId||'',b.coarseLevelId||''));
  for(const level of row.levels||[]){level.model=normalizeModel(level.model);level.result=normalizeResult(level.result);sortArray(level.studyRegion,'elementIds',compareIdentity);for(const key of ['geometryMappings','materialMappings','loadMappings','restraintMappings']){sortArray(level,key,(a,b)=>compareIdentity(a.entityId,b.entityId));for(const mapping of level[key]||[])sortArray(mapping,'targetIds',compareIdentity);}sortArray(level,'probeMappings',idCompare('probeId'));sortArray(level,'quantityMappings',idCompare('quantityId'));}
  return row;
}
function normalizeConvergenceResult(value) {
  const row=structuredClone(value);if(row.studyEvidence)row.studyEvidence=normalizeStudy(row.studyEvidence);sortArray(row,'levelEvidence',(a,b)=>a.declaredOrder-b.declaredOrder||compareIdentity(a.levelId,b.levelId));for(const key of ['quantityResults','globalQuantityTrends','fixedProbeStressTrends','regionalMaximumStressTrends']){sortArray(row,key,idCompare('quantityId'));for(const quantity of row[key]||[])sortQuantityEvidence(quantity,row.levelEvidence||[]);}sortArray(row,'diagnostics',diagnosticCompare);return row;
}
function normalizeProjection(value) {
  const row=structuredClone(value);sortArray(row,'components',compareIdentity);sortArray(row,'declaredDiscontinuities',idCompare('discontinuityId'));sortArray(row,'elementCornerValues',(a,b)=>compareIdentity(a.elementId,b.elementId)||compareIdentity(a.cornerId,b.cornerId));sortArray(row,'nodalValues',(a,b)=>compareIdentity(a.nodeId,b.nodeId)||compareIdentity(a.projectionPatchId,b.projectionPatchId)||compareIdentity(a.stressComponent,b.stressComponent));sortArray(row,'limitations',compareIdentity);
  for(const corner of row.elementCornerValues||[]){sortArray(corner,'components',idCompare('stressComponent'));for(const component of corner.components||[])sortArray(component,'sourceIntegrationPointIds',compareIdentity);}
  for(const node of row.nodalValues||[]){for(const key of ['contributingElementIds','contributingCornerIds','sourceIntegrationPointIds'])sortArray(node,key,compareIdentity);sortArray(node,'weights',idCompare('elementId'));}
  return row;
}
function sortQuantityEvidence(row,levels){const order=new Map(levels.map((level,index)=>[level.levelId,index]));sortArray(row,'history',(a,b)=>(order.get(a.levelId)??99)-(order.get(b.levelId)??99));sortArray(row,'relativeChanges',(a,b)=>(order.get(a.coarseLevelId)??99)-(order.get(b.coarseLevelId)??99));if(row.observedOrder)sortArray(row.observedOrder,'valuesUsed',(a,b)=>(order.get(a.levelId)??99)-(order.get(b.levelId)??99));}
function normalizeNullable(value,name,callback){if(value===null)return null;return callback(requiredArtifact(value,name));}
function sortArray(row,key,compare){if(Array.isArray(row?.[key]))row[key].sort(compare);}
function equationCompare(a,b){return(a?.equation??0)-(b?.equation??0)||compareIdentity(a?.equationIdentity||'',b?.equationIdentity||'');}
function integrationCompare(a,b){return compareIdentity(a.elementId,b.elementId)||compareIdentity(a.integrationPointId,b.integrationPointId);}
function constraintCompare(a,b){return compareIdentity(a.nodeId,b.nodeId)||compareIdentity(a.component,b.component)||compareIdentity(a.constraintId,b.constraintId);}
function diagnosticCompare(a,b){return compareIdentity(a.severity||'',b.severity||'')||compareIdentity(a.code||'',b.code||'')||compareIdentity(a.message||'',b.message||'');}
function assignmentCompare(a,b){return compareIdentity(a.assignmentId||a.parentLoadId||a.parentConstraintId||'',b.assignmentId||b.parentLoadId||b.parentConstraintId||'');}
function identityCompareFor(key){const id={regions:'regionId',boundaries:'boundaryId',points:'pointId'}[key];return idCompare(id);}
function idCompare(key){return(a,b)=>compareIdentity(a?.[key]||'',b?.[key]||'');}

function normalizeSourceReferences(value) {
  if (!Array.isArray(value)) throw new TypeError('sourceReferences must be an array.');
  const rows = value.map((item) => {
    const row = record(item, 'source reference');
    exactKeys(row, ['sourceReferenceId','sourceType','sourceVersion','sourceSemanticHash'], 'source reference');
    return {
      sourceReferenceId: text(row.sourceReferenceId, 'sourceReferenceId'),
      sourceType: text(row.sourceType, 'sourceType'),
      sourceVersion: text(row.sourceVersion, 'sourceVersion'),
      sourceSemanticHash: text(row.sourceSemanticHash, 'sourceSemanticHash'),
    };
  }).sort((a, b) => compareIdentity(a.sourceReferenceId, b.sourceReferenceId));
  if (new Set(rows.map((row) => row.sourceReferenceId)).size !== rows.length) throw new TypeError('Duplicate review source-reference identity.');
  return rows;
}

function normalizeDiagnostic(value) {
  const row = record(value, 'diagnostic');
  const severity = text(row.severity, 'diagnostic.severity');
  if (!DIAGNOSTIC_SEVERITIES.includes(severity)) throw new TypeError('Diagnostic severity is invalid.');
  return {
    severity,
    code: text(row.code, 'diagnostic.code'),
    sourceArtifactIdentity: text(row.sourceArtifactIdentity || 'LFEA-006', 'diagnostic.sourceArtifactIdentity'),
    message: text(row.message, 'diagnostic.message'),
  };
}

function requiredArtifact(value, name) {
  return record(value, name);
}
function nullableArtifact(value, name) {
  if (value === null) return null;
  return record(value, name);
}
function precision(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 12) throw new TypeError(`${name} must be an integer from 0 through 12.`);
  return value;
}
function positiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive integer.`);
  return value;
}
function nonnegative(value, name) {
  const result = finite(value, name);
  if (result < 0) throw new TypeError(`${name} must be nonnegative.`);
  return result;
}
function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite.`);
  return Object.is(value, -0) ? 0 : value;
}
function boolean(value, name) {
  if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean.`);
  return value;
}
function text(value, name) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required.`);
  return value.trim();
}
function semanticHashText(value, name) {
  const result = text(value, name);
  if (!/^fnv1a64:[0-9a-f]{16}$/.test(result)) throw new TypeError(`${name} must be a canonical fnv1a64 semantic hash.`);
  return result;
}
function record(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be a record.`);
  return value;
}
function exactKeys(value, allowed, name) {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new TypeError(`${name} contains unsupported fields: ${extras.sort(compareIdentity).join(', ')}.`);
}
function validation(callback) {
  const errors = [];
  try { callback(); } catch (error) { errors.push(error.message); }
  return deepFreeze({ ok: errors.length === 0, errors });
}
