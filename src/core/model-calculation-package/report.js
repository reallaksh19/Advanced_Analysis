import { deepFreeze, semanticHash, stringValue } from '../shared-piping-model/index.js';
import { MODEL_CALCULATION_REPORT_SCHEMA } from './constants.js';
import { normalizeDiagnostics, uniqueSorted } from './diagnostics.js';
import { validateModelCalculationLedgerEntry } from './ledger.js';
import { validateModelCalculationPackage } from './package.js';

export function createModelCalculationReport(entry) {
  assertEntry(entry);
  const packageValue = entry.package;
  const identity = {
    schema: MODEL_CALCULATION_REPORT_SCHEMA,
    entryId: entry.entryId,
    entrySemanticHash: entry.semanticHash,
    packageId: packageValue.packageId,
    packageSemanticHash: packageValue.semanticHash,
    datasetId: packageValue.datasetId,
    statement: 'This is not a full pipe-stress or code-compliance report.',
    sections: buildSections(packageValue, packageIdentity(entry)),
  };
  const reportId = `model-calculation-report:${semanticHash(identity).split(':')[1]}`;
  const base = { ...identity, reportId };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateModelCalculationReport(value, packageValue = null) {
  const errors = [];
  validateSurface(value, errors);
  validateSectionLinks(value, errors);
  if (packageValue) validatePackageProjection(value, packageValue, errors);
  if (value?.reportId !== reportIdFor(value)) errors.push('Model calculation report ID mismatch.');
  if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('Model calculation report semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function validateSurface(value, errors) {
  if (value?.schema !== MODEL_CALCULATION_REPORT_SCHEMA) errors.push('Invalid model calculation report schema.');
  if (!stringValue(value?.reportId) || !stringValue(value?.packageId)) errors.push('Model calculation report identity is required.');
  if (!stringValue(value?.entryId) || !stringValue(value?.entrySemanticHash)) errors.push('Model calculation report ledger entry identity is required.');
  if (value?.statement !== 'This is not a full pipe-stress or code-compliance report.') errors.push('Model calculation report disclaimer is required.');
  if (!value?.sections || !Array.isArray(value.sections.qualification)) errors.push('Model calculation report sections are incomplete.');
}
function validateSectionLinks(value, errors) {
  const identity = value?.sections?.packageIdentity;
  if (identity?.entryId !== value?.entryId || identity?.entrySemanticHash !== value?.entrySemanticHash) errors.push('Model calculation report ledger entry identity mismatch.');
  if (identity?.packageId !== value?.packageId || identity?.packageSemanticHash !== value?.packageSemanticHash || identity?.datasetId !== value?.datasetId) errors.push('Model calculation report package identity mismatch.');
  ['methods', 'assumptions', 'limitations', 'screeningSupportForces', 'verticalBeamSupportForces', 'residualEvidence', 'blockers', 'diagnostics'].forEach((field) => {
    if (!Array.isArray(value?.sections?.[field])) errors.push(`Model calculation report section ${field} is invalid.`);
  });
}
function validatePackageProjection(value, packageValue, errors) {
  const packageValidation = validateModelCalculationPackage(packageValue);
  if (!packageValidation.ok) { errors.push('Model calculation report package is invalid.'); return; }
  if (value?.packageSemanticHash !== packageValue.semanticHash || value?.packageId !== packageValue.packageId) {
    errors.push('Model calculation report does not match the supplied package.'); return;
  }
  const expected = buildSections(packageValue, value.sections.packageIdentity);
  if (semanticHash(value.sections) !== semanticHash(expected)) errors.push('Model calculation report projection does not match the supplied package.');
}
function buildSections(packageValue, identity) {
  return deepFreeze({
    packageIdentity: identity,
    modelProvenance: packageValue.modelReference,
    methods: packageValue.methodEvidence,
    assumptions: packageValue.assumptions,
    limitations: packageValue.limitations,
    qualification: packageValue.qualificationSummary,
    screeningSupportForces: screeningRows(packageValue.screeningSnapshot),
    verticalBeamSupportForces: beamRows(packageValue.verticalBeamSnapshot),
    residualEvidence: residualRows(packageValue.qualificationSummary),
    blockers: uniqueSorted(packageValue.qualificationSummary.flatMap((row) => row.blockers)),
    diagnostics: normalizeDiagnostics([
      ...packageValue.diagnostics,
      ...packageValue.qualificationSummary.flatMap((row) => row.diagnostics),
    ]),
  });
}
function packageIdentity(entry) {
  const packageValue = entry.package;
  return deepFreeze({
    entryId: entry.entryId, entrySemanticHash: entry.semanticHash,
    sequence: entry.sequence, archiveKey: entry.archiveKey,
    packageId: packageValue.packageId, packageMode: packageValue.packageMode,
    packageSemanticHash: packageValue.semanticHash, datasetId: packageValue.datasetId,
  });
}
function screeningRows(snapshot) {
  return deepFreeze((snapshot?.screening.supportResults || []).map((row) => deepFreeze({
    pathId: row.pathId, loadCaseId: row.loadCaseId, supportKey: row.supportKey,
    pathStationM: row.pathStationM, screenedVerticalForceN: row.screenedVerticalForceN,
    qualification: row.qualification, diagnostics: normalizeDiagnostics(row.diagnostics || []),
  })).sort(rowOrder));
}
function beamRows(snapshot) {
  return deepFreeze((snapshot?.solution.pathCases || []).flatMap((pathCase) => pathCase.supportForceResults.map((row) => deepFreeze({
    pathId: pathCase.pathId, loadCaseId: pathCase.loadCaseId,
    supportKey: row.supportKey, pathStationM: row.pathStationM,
    signedSupportForceN: row.signedSupportForceN,
    upwardSupportForceN: row.upwardSupportForceN,
    directionConvention: row.directionConvention,
    qualification: row.qualification, diagnostics: normalizeDiagnostics(row.diagnostics || []),
  }))).sort(rowOrder));
}
function residualRows(rows) {
  return deepFreeze(rows.map((row) => deepFreeze({
    pathId: row.pathId, loadCaseId: row.loadCaseId,
    forceResidualN: row.forceResidualN,
    momentResidualNm: row.momentResidualNm,
    matrixResidualN: row.matrixResidualN,
    maximumAbsoluteDisplacementM: row.maximumAbsoluteDisplacementM,
    maximumAbsoluteRotationRad: row.maximumAbsoluteRotationRad,
  })).sort(rowOrder));
}
function assertEntry(entry) {
  const validation = validateModelCalculationLedgerEntry(entry);
  if (!validation.ok) throw new TypeError(`Selected model calculation ledger entry is invalid: ${validation.errors.join(' ')}`);
}
function reportIdFor(value) { const { reportId: _reportId, semanticHash: _semanticHash, ...identity } = value || {}; return `model-calculation-report:${semanticHash(identity).split(':')[1]}`; }
function rowOrder(left, right) { return [left.pathId, left.loadCaseId, left.pathStationM ?? '', left.supportKey ?? ''].join('|').localeCompare([right.pathId, right.loadCaseId, right.pathStationM ?? '', right.supportKey ?? ''].join('|')); }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
