import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { validateLoadCaseSet, validateModelLoadPrimitiveSet, validateModelLoadReadinessAudit } from '../model-loads/index.js';
import { PRIMITIVE_TYPES, QUALIFICATION, TRIBUTARY_SCREENING_SCHEMA, AUDIT_CODES } from './constants.js';
import { uniqueSorted } from './diagnostics.js';
import { equilibriumCheck, simpleSpanPointContributions, simpleSpanUniformContributions } from './formulas.js';
import { projectPrimitivesToPath } from './primitive-projection.js';
import { validateVerticalLoadPathModel } from './path-model.js';
import { validateVerticalLoadPathProfile } from './profile.js';

export function buildTributarySupportLoadScreening(pathModel, loadCaseSet, primitiveSet, readinessAudit, profile) {
  assertInputs(pathModel, loadCaseSet, primitiveSet, readinessAudit, profile);
  const cases = [];
  const integrity = primitivePathIntegrity(pathModel, primitiveSet);
  pathModel.paths.forEach((path) => loadCaseSet.loadCases.forEach((loadCase) => {
    cases.push(screenPathCase(path, loadCase, primitiveSet, readinessAudit, profile, integrity));
  }));
  const ordered = cases.sort(caseOrder);
  const contributions = ordered.flatMap((row) => row.contributions).sort((a, b) => a.contributionId.localeCompare(b.contributionId));
  const supportResults = ordered.flatMap((row) => row.supportResults).sort((a, b) => a.resultId.localeCompare(b.resultId));
  const base = {
    schema: TRIBUTARY_SCREENING_SCHEMA,
    datasetId: pathModel.datasetId,
    pathModelSemanticHash: pathModel.semanticHash,
    loadCaseSetSemanticHash: loadCaseSet.semanticHash,
    primitiveSetSemanticHash: primitiveSet.semanticHash,
    readinessAuditSemanticHash: readinessAudit.semanticHash,
    profile,
    pathCases: ordered.map(stripRows),
    contributions,
    supportResults,
    diagnostics: integrity.diagnostics,
    summary: {
      pathCaseCount: ordered.length,
      readyPathCaseCount: ordered.filter((row) => row.qualification === QUALIFICATION.READY).length,
      blockedPathCaseCount: ordered.filter((row) => row.qualification !== QUALIFICATION.READY).length,
      contributionCount: contributions.length,
      supportResultCount: supportResults.length,
      screenedVerticalForceN: supportResults.reduce((sum, row) => sum + row.screenedVerticalForceN, 0),
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateTributarySupportLoadScreening(model) {
  const errors = [];
  if (model?.schema !== TRIBUTARY_SCREENING_SCHEMA) errors.push('Invalid tributary support-load screening schema.');
  validateUniqueRows(model?.contributions, 'contributionId', 'contributions', errors);
  validateUniqueRows(model?.supportResults, 'resultId', 'support results', errors);
  validatePathCases(model?.pathCases, errors);
  validateReferences(model, errors);
  if (model?.semanticHash !== semanticHash(withoutHash(model))) errors.push('Screening semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function validatePathCases(rows, errors) {
  if (!Array.isArray(rows)) return errors.push('Screening path cases must be an array.');
  const keys = rows.map((row) => `${row.pathId}|${row.loadCaseId}`);
  if (new Set(keys).size !== keys.length) errors.push('Screening path/load-case records must be unique.');
  rows.forEach((row) => {
    if (![QUALIFICATION.READY, QUALIFICATION.BLOCKED].includes(row.qualification)) errors.push(`Screening path case ${row.pathId || ''} has invalid qualification.`);
    if (!Array.isArray(row.spans) || !Array.isArray(row.blockers)) errors.push(`Screening path case ${row.pathId || ''} is incomplete.`);
  });
}

function validateReferences(model, errors) {
  const contributionIds = new Set((model?.contributions || []).map((row) => row.contributionId));
  const resultKeys = new Set((model?.supportResults || []).map((row) => `${row.pathId}|${row.loadCaseId}|${row.supportKey}`));
  (model?.contributions || []).forEach((row) => {
    if (!resultKeys.has(`${row.pathId}|${row.loadCaseId}|${row.supportKey}`)) errors.push(`Contribution ${row.contributionId} has no support result.`);
    if (!(row.screenedVerticalForceN >= 0)) errors.push(`Contribution ${row.contributionId} has invalid screened force.`);
  });
  (model?.supportResults || []).forEach((row) => {
    (row.contributionIds || []).forEach((id) => { if (!contributionIds.has(id)) errors.push(`Support result ${row.resultId} references missing contribution ${id}.`); });
  });
}

function validateUniqueRows(rows, key, label, errors) {
  if (!Array.isArray(rows)) return errors.push(`Screening ${label} must be an array.`);
  const ids = rows.map((row) => row?.[key]);
  if (ids.some((id) => !id)) errors.push(`Screening ${label} contains a missing ${key}.`);
  if (new Set(ids).size !== ids.length) errors.push(`Screening ${label} IDs must be unique.`);
}

function screenPathCase(path, loadCase, primitiveSet, readinessAudit, profile, integrity) {
  const integrityRows = integrity.byCase.get(loadCase.loadCaseId) || [];
  const blocked = initialBlockers(path, readinessAudit, loadCase.loadCaseId, integrityRows);
  if (blocked.length) return blockedCase(
    path, loadCase.loadCaseId, blocked, blockedPathProjection(path, primitiveSet, loadCase.loadCaseId, integrityRows),
  );
  const supports = path.supportStations.filter((row) => row.qualification === QUALIFICATION.READY).sort(stationOrder);
  const projection = projectPrimitivesToPath(path, primitiveSet, loadCase.loadCaseId, profile);
  const envelope = [supports[0].pathStationM, supports.at(-1).pathStationM];
  const overhang = projection.eligible.filter((row) => outsideEnvelope(row, envelope, profile.geometryTolerancePolicy));
  const blockers = uniqueSorted([
    ...projection.blocked.flatMap((row) => row.diagnostics.map((item) => item.code)),
    ...(overhang.length ? [AUDIT_CODES.OVERHANG_LOAD_UNSUPPORTED] : []),
  ]);
  if (blockers.length) return blockedCase(path, loadCase.loadCaseId, blockers, projection);
  const spans = buildSpans(path.pathId, supports);
  const contributions = projection.eligible.flatMap((primitive) => contributionsForPrimitive(path, loadCase.loadCaseId, primitive, spans));
  const supportResults = aggregateSupportResults(path, loadCase.loadCaseId, supports, contributions);
  const appliedForceN = projection.eligible.reduce(appliedForce, 0);
  const supportForceN = supportResults.reduce((sum, row) => sum + row.screenedVerticalForceN, 0);
  const equilibrium = equilibriumCheck(appliedForceN, supportForceN, profile.equilibriumTolerancePolicy);
  const qualification = equilibrium.pass ? QUALIFICATION.READY : QUALIFICATION.BLOCKED;
  const finalBlockers = equilibrium.pass ? [] : [AUDIT_CODES.FORCE_EQUILIBRIUM_MISMATCH];
  return {
    pathId: path.pathId,
    loadCaseId: loadCase.loadCaseId,
    qualification,
    qualifiedSupportIds: supports.map((row) => row.supportKey),
    blockedSupportIds: path.blockedSupportKeys,
    eligiblePrimitiveIds: projection.eligible.map((row) => row.primitiveId).sort(),
    blockedPrimitiveIds: projection.blocked.map((row) => row.primitiveId).sort(),
    spans,
    contributions,
    supportResults,
    equilibrium,
    blockers: finalBlockers,
    diagnostics: [],
  };
}

function contributionsForPrimitive(path, loadCaseId, primitive, spans) {
  if (primitive.primitiveType === PRIMITIVE_TYPES.POINT) {
    const span = spanForPoint(spans, primitive.pathStationM);
    return simpleSpanPointContributions({ ...spanInput(path, loadCaseId, primitive, span), loadStationM: primitive.pathStationM, forceN: primitive.forceN });
  }
  return spans.flatMap((span, index) => {
    const start = Math.max(span.spanStartM, primitive.intervalStartM);
    const end = Math.min(span.spanEndM, primitive.intervalEndM);
    if (!(end > start)) return [];
    return simpleSpanUniformContributions({
      ...spanInput(path, loadCaseId, primitive, span),
      intervalStartM: start,
      intervalEndM: end,
      forcePerLengthNM: primitive.forcePerLengthNM,
      segmentIndex: index,
    });
  });
}

function buildSpans(pathId, supports) {
  return supports.slice(0, -1).map((left, index) => {
    const right = supports[index + 1];
    return {
      spanId: `screening-span:${pathId}:${left.supportKey}:${right.supportKey}`,
      spanStartM: left.pathStationM,
      spanEndM: right.pathStationM,
      spanLengthM: right.pathStationM - left.pathStationM,
      leftSupport: left,
      rightSupport: right,
    };
  });
}

function aggregateSupportResults(path, caseId, supports, contributions) {
  return supports.map((support) => {
    const rows = contributions.filter((row) => row.supportKey === support.supportKey);
    const base = {
      resultId: `screened-support-force:${caseId}:${path.pathId}:${support.supportKey}`,
      loadCaseId: caseId,
      pathId: path.pathId,
      supportKey: support.supportKey,
      pathStationM: support.pathStationM,
      screenedVerticalForceN: rows.reduce((sum, row) => sum + row.screenedVerticalForceN, 0),
      contributionIds: rows.map((row) => row.contributionId).sort(),
      qualification: QUALIFICATION.READY,
      sourceEvidence: support.sourceEvidence,
      diagnostics: [],
    };
    return deepFreeze(base);
  });
}

function blockedCase(path, loadCaseId, blockers, projection = { eligible: [], blocked: [] }) {
  return {
    pathId: path.pathId,
    loadCaseId,
    qualification: QUALIFICATION.BLOCKED,
    qualifiedSupportIds: path.qualifiedSupportKeys,
    blockedSupportIds: path.blockedSupportKeys,
    eligiblePrimitiveIds: projection.eligible.map((row) => row.primitiveId).sort(),
    blockedPrimitiveIds: projection.blocked.map((row) => row.primitiveId).sort(),
    spans: [], contributions: [], supportResults: [], equilibrium: null,
    blockers: uniqueSorted(blockers),
    diagnostics: uniqueSorted(blockers).map((code) => ({ code, severity: 'WARNING', scope: `${path.pathId}:${loadCaseId}`, loadCaseId, message: `Screening is blocked: ${code}.` })),
  };
}

function blockedPathProjection(path, primitiveSet, loadCaseId, integrityRows = []) {
  const components = new Set(path.orderedComponentKeys);
  const rows = primitiveSet.primitives.filter((row) => (
    row.loadCaseId === loadCaseId && components.has(row.componentKey) && row.primitiveType !== PRIMITIVE_TYPES.MOMENT
  ));
  const ids = uniqueSorted([...rows.map((row) => row.primitiveId), ...integrityRows.map((row) => row.primitiveId)]);
  return { eligible: [], blocked: ids.map((primitiveId) => ({ primitiveId })) };
}
function initialBlockers(path, readiness, caseId, integrityRows) {
  const caseAudit = readiness.cases.find((row) => row.loadCaseId === caseId);
  const blockedComponents = new Set(caseAudit?.blockedComponentIds || []);
  const pathCaseBlocked = !caseAudit || path.orderedComponentKeys.some((key) => blockedComponents.has(key));
  return uniqueSorted([
    ...(path.qualification === QUALIFICATION.READY ? [] : path.blockers),
    ...(pathCaseBlocked ? [AUDIT_CODES.LOAD_CASE_BLOCKED] : []),
    ...(integrityRows.length ? [AUDIT_CODES.LOAD_PRIMITIVE_PATH_MISMATCH] : []),
  ]);
}
function primitivePathIntegrity(pathModel, primitiveSet) {
  const memberships = new Map();
  pathModel.paths.forEach((path) => path.orderedComponentKeys.forEach((key) => {
    const values = memberships.get(key) || []; values.push(path.pathId); memberships.set(key, values);
  }));
  const rows = primitiveSet.primitives.filter((row) => row.primitiveType !== PRIMITIVE_TYPES.MOMENT)
    .filter((row) => (memberships.get(row.componentKey) || []).length !== 1)
    .map((row) => ({ primitiveId: row.primitiveId, loadCaseId: row.loadCaseId, componentKey: row.componentKey }));
  const byCase = new Map();
  rows.forEach((row) => { const values = byCase.get(row.loadCaseId) || []; values.push(row); byCase.set(row.loadCaseId, values); });
  const diagnostics = rows.map((row) => ({
    code: AUDIT_CODES.LOAD_PRIMITIVE_PATH_MISMATCH, severity: 'WARNING', scope: row.primitiveId,
    loadCaseId: row.loadCaseId, primitiveId: row.primitiveId, componentKey: row.componentKey,
    message: 'Primitive component does not belong to exactly one topology-local path.',
  }));
  return { byCase, diagnostics };
}
function outsideEnvelope(row, envelope, policy) {
  const start = row.primitiveType === PRIMITIVE_TYPES.POINT ? row.pathStationM : row.intervalStartM;
  const end = row.primitiveType === PRIMITIVE_TYPES.POINT ? row.pathStationM : row.intervalEndM;
  const scale = Math.max(1, Math.abs(envelope[0]), Math.abs(envelope[1]), Math.abs(start), Math.abs(end));
  const tolerance = policy.absoluteToleranceM + policy.relativeTolerance * scale;
  return start < envelope[0] - tolerance || end > envelope[1] + tolerance;
}
function spanForPoint(spans, station) {
  const exactStart = spans.find((span) => Math.abs(span.spanStartM - station) <= 1e-12);
  if (exactStart) return exactStart;
  return spans.find((span) => station >= span.spanStartM - 1e-12 && station <= span.spanEndM + 1e-12) || spans.at(-1);
}
function spanInput(path, loadCaseId, primitive, span) { return { pathId: path.pathId, loadCaseId, primitiveId: primitive.primitiveId, sourceEvidence: primitive.sourceEvidence, ...span }; }
function appliedForce(sum, row) { return sum + (row.primitiveType === PRIMITIVE_TYPES.POINT ? row.forceN : row.forcePerLengthNM * (row.intervalEndM - row.intervalStartM)); }
function stripRows(row) {
  const { contributions, supportResults, ...rest } = row;
  return { ...rest, contributionCount: contributions.length, supportResultCount: supportResults.length };
}
function assertInputs(pathModel, loadCaseSet, primitiveSet, readinessAudit, profile) {
  const validations = [
    validateVerticalLoadPathModel(pathModel),
    validateLoadCaseSet(loadCaseSet),
    validateModelLoadPrimitiveSet(primitiveSet),
    validateModelLoadReadinessAudit(readinessAudit),
    validateVerticalLoadPathProfile(profile),
  ];
  const errors = validations.flatMap((row) => row.errors || []);
  if (errors.length) throw new TypeError(`Invalid screening inputs: ${errors.join(' ')}`);
  if (primitiveSet.loadCaseSetSemanticHash && primitiveSet.loadCaseSetSemanticHash !== loadCaseSet.semanticHash) throw new TypeError('Primitive set does not match load cases.');
  if (readinessAudit.primitiveSetSemanticHash && readinessAudit.primitiveSetSemanticHash !== primitiveSet.semanticHash) throw new TypeError('Readiness audit does not match primitive set.');
}
function stationOrder(a, b) { return a.pathStationM - b.pathStationM || a.supportKey.localeCompare(b.supportKey); }
function caseOrder(a, b) { return `${a.pathId}|${a.loadCaseId}`.localeCompare(`${b.pathId}|${b.loadCaseId}`); }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
