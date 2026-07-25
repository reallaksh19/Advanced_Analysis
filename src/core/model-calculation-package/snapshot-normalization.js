import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';

const ORDERED_STRING_ARRAYS = new Set([
  'orderedComponentKeys', 'orderedConnectionIds', 'flexuralPropertyPrecedence',
  'primitiveTypes', 'localEndForceVector', 'vector', 'matrix',
  'componentIntervals', 'nodes', 'elements', 'dofMap', 'constraints',
  'loadVectorRecords', 'nodeResults', 'elementEndForces', 'elementExtrema',
  'spans', 'flexuralPropertyReferences',
]);
const IDENTITY_FIELDS = [
  'pathId', 'loadCaseId', 'supportKey', 'componentKey', 'primitiveId',
  'contributionId', 'resultId', 'recordId', 'nodeId', 'elementId',
  'constraintId', 'loadRecordId', 'dofId', 'formulaId', 'code', 'scope',
];

export function normalizeScreeningSnapshot(snapshot) {
  const sourceSemanticHashes = screeningSourceHashes(snapshot);
  const profile = clone(snapshot.profile);
  const pathModel = normalizeHashed(snapshot.pathModel);
  const screening = normalizeHashed({
    ...clone(snapshot.screening),
    pathModelSemanticHash: pathModel.semanticHash,
    profile,
  });
  const audit = normalizeHashed({
    ...clone(snapshot.audit),
    screeningSemanticHash: screening.semanticHash,
  });
  return deepFreeze({ sourceSemanticHashes, profile, pathModel, screening, audit });
}

export function normalizeVerticalBeamSnapshot(snapshot, pathModelSemanticHash = null) {
  const sourceSemanticHashes = beamSourceHashes(snapshot);
  const profile = clone(snapshot.profile);
  const projection = normalizeHashed({
    ...clone(snapshot.flexuralProjection),
    profileSemanticHash: profile.semanticHash,
    pathModelSemanticHash: pathModelSemanticHash || snapshot.flexuralProjection.pathModelSemanticHash,
  });
  const beamModel = normalizeHashed({
    ...clone(snapshot.beamModel),
    profile,
    pathModelSemanticHash: pathModelSemanticHash || snapshot.beamModel.pathModelSemanticHash,
    flexuralProjectionSemanticHash: projection.semanticHash,
  });
  const solution = normalizeHashed({
    ...clone(snapshot.solution),
    profile,
    beamModelSemanticHash: beamModel.semanticHash,
  });
  const audit = normalizeHashed({
    ...clone(snapshot.audit),
    solutionSemanticHash: solution.semanticHash,
  });
  return deepFreeze({ sourceSemanticHashes, profile, flexuralProjection: projection, beamModel, solution, audit });
}

export function normalizeModelReference(reference) {
  return deepFreeze(Object.fromEntries(Object.keys(reference || {}).sort().map((key) => [key, reference[key] ?? null])));
}

export function normalizeHashed(value) {
  const normalized = normalizeValue(withoutHash(clone(value)), 'root');
  return deepFreeze({ ...normalized, semanticHash: semanticHash(normalized) });
}

export function normalizeValue(value, key = '') {
  if (Array.isArray(value)) return normalizeArray(value, key);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  Object.keys(value).sort().forEach((childKey) => {
    if (childKey !== 'semanticHash') result[childKey] = normalizeValue(value[childKey], childKey);
  });
  if (value.semanticHash) result.semanticHash = semanticHash(result);
  return result;
}

function screeningSourceHashes(snapshot) {
  return deepFreeze({
    profileSemanticHash: snapshot.profile.semanticHash,
    pathModelSemanticHash: snapshot.pathModel.semanticHash,
    resultSemanticHash: snapshot.screening.semanticHash,
    auditSemanticHash: snapshot.audit.semanticHash,
  });
}
function beamSourceHashes(snapshot) {
  return deepFreeze({
    profileSemanticHash: snapshot.profile.semanticHash,
    flexuralProjectionSemanticHash: snapshot.flexuralProjection.semanticHash,
    beamModelSemanticHash: snapshot.beamModel.semanticHash,
    solutionSemanticHash: snapshot.solution.semanticHash,
    auditSemanticHash: snapshot.audit.semanticHash,
    pathModelSemanticHash: snapshot.flexuralProjection.pathModelSemanticHash,
  });
}
function normalizeArray(values, key) {
  const rows = values.map((row) => normalizeValue(row, key));
  if (isOrderedArray(values, key)) return rows;
  return rows.sort((left, right) => stableKey(left).localeCompare(stableKey(right)));
}
function isOrderedArray(values, key) {
  if (ORDERED_STRING_ARRAYS.has(key)) return true;
  if (values.every((row) => typeof row === 'number')) return true;
  if (key === 'formulaTrace' || key === 'loadFormulaTraces') return true;
  return false;
}
function stableKey(value) {
  if (value === null) return 'null';
  if (['string', 'number', 'boolean'].includes(typeof value)) return String(value);
  const identity = IDENTITY_FIELDS.map((field) => value?.[field]).filter((item) => item !== undefined && item !== null).join('|');
  return identity || JSON.stringify(value);
}
function clone(value) { return structuredClone(value); }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
