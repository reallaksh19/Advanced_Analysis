import {
  canonicalPrettyStringify, deepFreeze, semanticHash, stringValue,
} from '../shared-piping-model/index.js';
import {
  MODEL_CALCULATION_PACKAGE_SCHEMA, PACKAGE_LIMITATIONS, PACKAGE_MODES,
} from './constants.js';
import { createPackageDiagnostic, normalizeDiagnostics, uniqueSorted } from './diagnostics.js';
import { buildMethodEvidence } from './method-evidence.js';
import { normalizeModelReference } from './snapshot-normalization.js';
import { buildQualificationSummary } from './qualification-summary.js';
import { validateAndNormalizeSnapshots, validatePackagedSnapshots } from './snapshot-validation.js';

const VALIDATION_CACHE = new WeakMap();
const REFERENCE_FIELDS = Object.freeze([
  'sharedModelSemanticHash', 'topologySemanticHash', 'supportAttachmentSemanticHash',
  'restraintCapabilitySemanticHash', 'loadCaseSetSemanticHash',
  'loadPrimitiveSetSemanticHash', 'modelLoadReadinessSemanticHash',
  'verticalLoadPathModelSemanticHash',
]);

export function createModelCalculationPackage(input) {
  const mode = input?.packageMode;
  const snapshots = validateAndNormalizeSnapshots(mode, input?.screeningSnapshot, input?.verticalBeamSnapshot);
  const datasetId = resolveDatasetId(snapshots);
  const modelReference = validateModelReference(input?.modelReference, snapshots, datasetId);
  const methodEvidence = buildMethodEvidence(snapshots.screening, snapshots.beam);
  const qualificationSummary = buildQualificationSummary(snapshots.screening, snapshots.beam);
  const diagnostics = packageDiagnostics(modelReference, input?.diagnostics);
  const assumptions = uniqueSorted(methodEvidence.flatMap((row) => row.assumptions));
  const limitations = uniqueSorted([...PACKAGE_LIMITATIONS, ...methodEvidence.flatMap((row) => row.limitations)]);
  const identityPayload = {
    schema: MODEL_CALCULATION_PACKAGE_SCHEMA, packageMode: mode, datasetId,
    modelReference, methodEvidence,
    screeningSnapshot: snapshots.screening,
    verticalBeamSnapshot: snapshots.beam,
    qualificationSummary, assumptions, limitations, diagnostics,
  };
  const packageId = `model-calculation-package:${semanticHash(identityPayload).split(':')[1]}`;
  const base = { ...identityPayload, packageId };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateModelCalculationPackage(value) {
  const cached = value && typeof value === 'object' && Object.isFrozen(value) ? VALIDATION_CACHE.get(value) : null;
  if (cached) return cached;
  const errors = [];
  validateSurface(value, errors);
  try {
    const snapshots = validatePackagedSnapshots(value?.packageMode, value?.screeningSnapshot, value?.verticalBeamSnapshot);
    validateModelReference(value?.modelReference, snapshots, value?.datasetId);
    validateDerivedRows(value, snapshots, errors);
  } catch (error) { errors.push(messageOf(error)); }
  if (value?.packageId !== packageIdFor(value)) errors.push('Model calculation package ID mismatch.');
  if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('Model calculation package semantic hash mismatch.');
  const result = deepFreeze({ ok: errors.length === 0, errors });
  if (value && typeof value === 'object' && Object.isFrozen(value)) VALIDATION_CACHE.set(value, result);
  return result;
}

export function canonicalModelCalculationPackage(packageValue) {
  const validation = validateModelCalculationPackage(packageValue);
  if (!validation.ok) throw new TypeError(`Invalid model calculation package: ${validation.errors.join(' ')}`);
  return canonicalPrettyStringify(packageValue);
}

function validateSurface(value, errors) {
  if (value?.schema !== MODEL_CALCULATION_PACKAGE_SCHEMA) errors.push('Invalid model calculation package schema.');
  if (!Object.values(PACKAGE_MODES).includes(value?.packageMode)) errors.push('Invalid model calculation package mode.');
  if (!stringValue(value?.datasetId)) errors.push('Model calculation package datasetId is required.');
  if (!value?.screeningSnapshot && !value?.verticalBeamSnapshot) errors.push('At least one completed calculation snapshot is required.');
  if (value?.packageMode === PACKAGE_MODES.SCREENING && value?.verticalBeamSnapshot !== null) errors.push('Screening-only package must omit the vertical-beam snapshot.');
  if (value?.packageMode === PACKAGE_MODES.BEAM && value?.screeningSnapshot !== null) errors.push('Beam-only package must omit the screening snapshot.');
  if (value?.packageMode === PACKAGE_MODES.COMBINED && (!value?.screeningSnapshot || !value?.verticalBeamSnapshot)) errors.push('Combined package requires both completed snapshots.');
}
function validateDerivedRows(value, snapshots, errors) {
  const methods = buildMethodEvidence(snapshots.screening, snapshots.beam);
  const summary = buildQualificationSummary(snapshots.screening, snapshots.beam);
  if (semanticHash(value?.methodEvidence) !== semanticHash(methods)) errors.push('Model calculation method evidence mismatch.');
  if (semanticHash(value?.qualificationSummary) !== semanticHash(summary)) errors.push('Model calculation qualification summary mismatch.');
  const assumptions = uniqueSorted(methods.flatMap((row) => row.assumptions));
  const limitations = uniqueSorted([...PACKAGE_LIMITATIONS, ...methods.flatMap((row) => row.limitations)]);
  if (semanticHash(value?.assumptions) !== semanticHash(assumptions)) errors.push('Model calculation assumptions mismatch.');
  if (semanticHash(value?.limitations) !== semanticHash(limitations)) errors.push('Model calculation limitations mismatch.');
  if (!Array.isArray(value?.diagnostics)) errors.push('Model calculation diagnostics must be an array.');
}
function resolveDatasetId(snapshots) {
  const ids = [snapshots.screening?.pathModel.datasetId, snapshots.beam?.beamModel.datasetId].filter(Boolean);
  if (!ids.length || new Set(ids).size !== 1) throw new TypeError('Calculation snapshot dataset ID is unavailable or inconsistent.');
  return ids[0];
}
function validateModelReference(reference, snapshots, datasetId) {
  const supplied = normalizeModelReference(Object.fromEntries(REFERENCE_FIELDS.map((field) => [field, reference?.[field] ?? null])));
  const expected = expectedReferences(snapshots);
  Object.entries(expected).forEach(([field, value]) => {
    if (value && supplied[field] && supplied[field] !== value) throw new TypeError(`Model provenance mismatch for ${field}.`);
  });
  if (reference?.datasetId && reference.datasetId !== datasetId) throw new TypeError('Model provenance dataset ID mismatch.');
  return normalizeModelReference(Object.fromEntries(REFERENCE_FIELDS.map((field) => [field, expected[field] || null])));
}
function expectedReferences({ screening, beam }) {
  const path = screening?.pathModel, result = screening?.screening, model = beam?.beamModel;
  const screeningSource = screening?.sourceSemanticHashes;
  const beamSource = beam?.sourceSemanticHashes;
  return {
    sharedModelSemanticHash: path?.sharedModelSemanticHash || beam?.flexuralProjection?.sharedModelSemanticHash || null,
    topologySemanticHash: path?.topologySemanticHash || null,
    supportAttachmentSemanticHash: path?.attachmentModelSemanticHash || null,
    restraintCapabilitySemanticHash: path?.restraintModelSemanticHash || null,
    loadCaseSetSemanticHash: result?.loadCaseSetSemanticHash || model?.loadCaseSetSemanticHash || null,
    loadPrimitiveSetSemanticHash: result?.primitiveSetSemanticHash || model?.primitiveSetSemanticHash || null,
    modelLoadReadinessSemanticHash: result?.readinessAuditSemanticHash || model?.readinessAuditSemanticHash || null,
    verticalLoadPathModelSemanticHash: screeningSource?.pathModelSemanticHash || beamSource?.pathModelSemanticHash || null,
  };
}
function packageDiagnostics(reference, sourceRows = []) {
  const missing = REFERENCE_FIELDS.filter((field) => !reference[field]).map((field) => createPackageDiagnostic(
    'MODEL_PROVENANCE_LINK_UNAVAILABLE', `Model provenance link ${field} is unavailable.`, { field },
  ));
  return normalizeDiagnostics([...sourceRows, ...missing]);
}
function packageIdFor(value) {
  const { packageId: _packageId, semanticHash: _semanticHash, ...identityPayload } = value || {};
  return `model-calculation-package:${semanticHash(identityPayload).split(':')[1]}`;
}
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
function messageOf(error) { return error instanceof Error ? error.message : String(error); }
