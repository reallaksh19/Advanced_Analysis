import { deepFreeze, stringValue } from '../shared-piping-model/index.js';
import {
  validateSupportLoadScreeningAudit, validateTributarySupportLoadScreening,
  validateVerticalLoadPathModel, validateVerticalLoadPathProfile,
} from '../support-load-screening/index.js';
import {
  validateFlexuralPropertyProjection, validateVerticalBeamModel,
  validateVerticalBeamSolution, validateVerticalBeamSolverAudit,
  validateVerticalBeamSolverProfile,
} from '../vertical-beam-solver/index.js';
import { PACKAGE_MODES } from './constants.js';
import { normalizeScreeningSnapshot, normalizeVerticalBeamSnapshot } from './snapshot-normalization.js';

const SCREENING_CACHE = new WeakMap();
const BEAM_CACHE = new WeakMap();

export function validateAndNormalizeSnapshots(mode, screeningInput, beamInput) {
  assertRequiredSnapshots(mode, screeningInput, beamInput);
  const needsScreening = mode !== PACKAGE_MODES.BEAM;
  const needsBeam = mode !== PACKAGE_MODES.SCREENING;
  if (needsScreening && needsBeam) assertRawCombinedCompatibility(screeningInput, beamInput);
  const screening = needsScreening ? screeningSnapshot(screeningInput) : null;
  const targetPathHash = screening?.pathModel.semanticHash || null;
  const beam = needsBeam ? beamSnapshot(beamInput, targetPathHash) : null;
  if (screening && beam) assertCombinedCompatibility(screening, beam);
  return deepFreeze({ screening, beam });
}

export function validatePackagedSnapshots(mode, screening, beam) {
  assertRequiredSnapshots(mode, screening, beam);
  if (screening) assertPackagedScreening(screening);
  if (beam) assertPackagedBeam(beam);
  if (screening && beam) assertCombinedCompatibility(screening, beam);
  return deepFreeze({ screening, beam });
}

export function screeningSnapshot(input) {
  const cached = input && typeof input === 'object' ? SCREENING_CACHE.get(input) : null;
  if (cached) return cached;
  assertScreeningContracts(input);
  assertScreeningLinks(input);
  const normalized = normalizeScreeningSnapshot(input);
  assertPackagedScreening(normalized);
  if (input && typeof input === 'object') SCREENING_CACHE.set(input, normalized);
  return normalized;
}

export function beamSnapshot(input, targetPathHash = null) {
  const cacheKey = targetPathHash || '';
  const cached = input && typeof input === 'object' ? BEAM_CACHE.get(input)?.get(cacheKey) : null;
  if (cached) return cached;
  assertBeamContracts(input);
  assertBeamLinks(input);
  const normalized = normalizeVerticalBeamSnapshot(input, targetPathHash);
  assertPackagedBeam(normalized);
  cacheBeam(input, cacheKey, normalized);
  return normalized;
}

export function assertCombinedCompatibility(screening, beam) {
  if (screening.pathModel.datasetId !== beam.beamModel.datasetId) throw new TypeError('Combined calculation snapshots use different datasets.');
  if (beam.flexuralProjection.pathModelSemanticHash !== screening.pathModel.semanticHash) throw new TypeError('Combined calculation snapshots use different normalized vertical path models.');
  if (beam.sourceSemanticHashes.pathModelSemanticHash !== screening.sourceSemanticHashes.pathModelSemanticHash) throw new TypeError('Combined calculation snapshots use different source vertical path models.');
  assertEqualSets(caseKeys(screening.screening.pathCases), caseKeys(beam.solution.pathCases), 'path/load-case IDs');
  assertLoadContractLinks(screening.screening, beam.beamModel);
}

function assertPackagedScreening(snapshot) {
  assertScreeningContracts(snapshot);
  assertScreeningLinks(snapshot);
  assertSourceHashes(snapshot.sourceSemanticHashes, [
    'profileSemanticHash', 'pathModelSemanticHash', 'resultSemanticHash', 'auditSemanticHash',
  ], 'screening');
}
function assertPackagedBeam(snapshot) {
  assertBeamContracts(snapshot);
  assertBeamLinks(snapshot);
  assertSourceHashes(snapshot.sourceSemanticHashes, [
    'profileSemanticHash', 'flexuralProjectionSemanticHash', 'beamModelSemanticHash',
    'solutionSemanticHash', 'auditSemanticHash', 'pathModelSemanticHash',
  ], 'vertical-beam');
}
function assertScreeningContracts(snapshot) {
  const checks = [
    [validateVerticalLoadPathProfile, snapshot?.profile, 'screening profile'],
    [validateVerticalLoadPathModel, snapshot?.pathModel, 'vertical-load path model'],
    [validateTributarySupportLoadScreening, snapshot?.screening, 'tributary screening'],
    [validateSupportLoadScreeningAudit, snapshot?.audit, 'screening audit'],
  ];
  checks.forEach(([validate, value, label]) => assertValid(validate(value), label));
}
function assertScreeningLinks(snapshot) {
  const { profile, pathModel, screening, audit } = snapshot;
  assertDatasetIds([pathModel, screening, audit], 'screening');
  if (pathModel.profile?.semanticHash !== profile.semanticHash) throw new TypeError('Path model does not match the screening profile.');
  if (screening.profile?.semanticHash !== profile.semanticHash) throw new TypeError('Screening does not match the screening profile.');
  if (screening.pathModelSemanticHash !== pathModel.semanticHash) throw new TypeError('Screening does not match the path model.');
  if (audit.screeningSemanticHash !== screening.semanticHash) throw new TypeError('Screening audit does not match the screening result.');
  if (!Array.isArray(screening.pathCases)) throw new TypeError('Explicit screening result is required.');
}
function assertBeamContracts(snapshot) {
  const checks = [
    [validateVerticalBeamSolverProfile, snapshot?.profile, 'vertical-beam profile'],
    [validateFlexuralPropertyProjection, snapshot?.flexuralProjection, 'flexural projection'],
    [validateVerticalBeamModel, snapshot?.beamModel, 'vertical-beam model'],
    [validateVerticalBeamSolution, snapshot?.solution, 'vertical-beam solution'],
    [validateVerticalBeamSolverAudit, snapshot?.audit, 'vertical-beam audit'],
  ];
  checks.forEach(([validate, value, label]) => assertValid(validate(value), label));
}
function assertBeamLinks(snapshot) {
  const { profile, flexuralProjection, beamModel, solution, audit } = snapshot;
  assertDatasetIds([flexuralProjection, beamModel, solution, audit], 'vertical-beam');
  if (flexuralProjection.profileSemanticHash !== profile.semanticHash) throw new TypeError('Flexural projection does not match the beam profile.');
  if (beamModel.profile?.semanticHash !== profile.semanticHash) throw new TypeError('Beam model does not match the beam profile.');
  if (beamModel.flexuralProjectionSemanticHash !== flexuralProjection.semanticHash) throw new TypeError('Beam model does not match the flexural projection.');
  if (beamModel.pathModelSemanticHash !== flexuralProjection.pathModelSemanticHash) throw new TypeError('Beam model and flexural projection use different vertical path models.');
  if (solution.beamModelSemanticHash !== beamModel.semanticHash) throw new TypeError('Beam solution does not match the beam model.');
  if (audit.solutionSemanticHash !== solution.semanticHash) throw new TypeError('Beam audit does not match the beam solution.');
  if (!Array.isArray(solution.pathCases)) throw new TypeError('Completed explicit vertical-beam solve is required.');
}
function assertRawCombinedCompatibility(screening, beam) {
  const screeningId = screening?.pathModel?.datasetId;
  const beamId = beam?.beamModel?.datasetId;
  if (!screeningId || screeningId !== beamId) throw new TypeError('Combined calculation snapshots use different datasets.');
  const screeningHash = screening?.pathModel?.semanticHash;
  if (!screeningHash || beam?.flexuralProjection?.pathModelSemanticHash !== screeningHash
    || beam?.beamModel?.pathModelSemanticHash !== screeningHash) {
    throw new TypeError('Combined calculation snapshots use different vertical path models.');
  }
}
function assertLoadContractLinks(screening, beamModel) {
  ['loadCaseSetSemanticHash', 'primitiveSetSemanticHash', 'readinessAuditSemanticHash'].forEach((field) => {
    if (screening[field] !== beamModel[field]) throw new TypeError(`Combined calculation snapshots have incompatible ${field}.`);
  });
}
function assertRequiredSnapshots(mode, screening, beam) {
  assertMode(mode);
  if (mode !== PACKAGE_MODES.BEAM && !screening) throw new TypeError('Completed screening snapshot is required.');
  if (mode !== PACKAGE_MODES.SCREENING && !beam) throw new TypeError('Completed vertical-beam snapshot is required.');
}
function assertSourceHashes(value, fields, label) {
  if (!value || typeof value !== 'object') throw new TypeError(`${label} source semantic hashes are required.`);
  fields.forEach((field) => { if (!stringValue(value[field])) throw new TypeError(`${label} source semantic hash ${field} is required.`); });
}
function cacheBeam(input, key, value) {
  if (!input || typeof input !== 'object') return;
  const rows = BEAM_CACHE.get(input) || new Map(); rows.set(key, value); BEAM_CACHE.set(input, rows);
}
function assertDatasetIds(values, label) {
  const ids = new Set(values.map((row) => stringValue(row?.datasetId)).filter(Boolean));
  if (ids.size !== 1) throw new TypeError(`${label} snapshot dataset IDs do not agree.`);
}
function caseKeys(rows = []) { return rows.map((row) => `${row.pathId}|${row.loadCaseId}`).sort(); }
function assertEqualSets(left, right, label) { if (left.length !== right.length || left.some((value, index) => value !== right[index])) throw new TypeError(`Combined calculation snapshots have incompatible ${label}.`); }
function assertValid(validation, label) { if (!validation?.ok) throw new TypeError(`Invalid ${label}: ${(validation?.errors || []).join(' ')}`); }
function assertMode(mode) { if (!Object.values(PACKAGE_MODES).includes(mode)) throw new TypeError('Unsupported model calculation package mode.'); }
