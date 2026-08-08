import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import {
  requireAuthorizedEmpiricalLoadExecutionV8,
} from './authorized-empirical-load-execution-v8.js';
import {
  requirePreproductionSupportContactAuthority,
} from './preproduction-support-contact-authority.js';
import {
  requirePreproductionThermalLiftoffPrerequisiteAuthority,
} from './preproduction-thermal-liftoff-prerequisite-authority.js';

export const PREPRODUCTION_TL03_LOCAL_SCREEN_INTAKE_SCHEMA =
  'engineering-preproduction-thermal-liftoff-local-screen-intake/v1';

const SUPPORTED_GRAVITY_METHODS = Object.freeze([
  'CHAINAGE_TRIBUTARY_SPAN_V2',
  'CHAINAGE_TRIBUTARY_SPAN_V3_COG',
]);

/**
 * Reconciles the current-head gravity/contact/prerequisite authorities into a
 * non-executing TL-03 intake. This function performs no lift-off arithmetic.
 */
export function buildPreproductionThermalLiftoffLocalScreenIntake(input) {
  exactKeys(input, [
    'coldGravityExecution',
    'contactAuthority',
    'prerequisiteAuthority',
  ], 'preproduction TL-03 local-screen intake input');

  const cold = requireAuthorizedEmpiricalLoadExecutionV8(input.coldGravityExecution);
  const contact = requirePreproductionSupportContactAuthority(input.contactAuthority);
  const prerequisite = requirePreproductionThermalLiftoffPrerequisiteAuthority(
    input.prerequisiteAuthority,
  );
  const blockers = [];

  if (cold.status !== 'CALCULATED'
      || cold.distribution?.status !== 'CALCULATED'
      || cold.distribution?.freshness?.status !== 'CURRENT') {
    blockers.push(issue(
      'PREPRODUCTION_TL03_COLD_GRAVITY_NOT_CURRENT',
      'authority',
      'TL-03 requires a current calculated Package 5F gravity execution.',
    ));
  }
  if (!SUPPORTED_GRAVITY_METHODS.includes(cold.executedMethod)
      || cold.distribution?.method !== cold.executedMethod) {
    blockers.push(issue(
      'PREPRODUCTION_TL03_COLD_GRAVITY_METHOD_UNSUPPORTED',
      'authority',
      'TL-03 admits only current V2 or V3_COG gravity reactions.',
    ));
  }
  if (cold.distribution?.sourceAxisBasis !== 'Z_UP'
      || cold.distribution?.verticalForceConvention
        !== 'positive reaction opposes source-axis gravity') {
    blockers.push(issue(
      'PREPRODUCTION_TL03_COLD_GRAVITY_SIGN_CONVENTION_MISMATCH',
      'authority',
      'Cold reaction sign/basis must remain the governed Z-up gravity convention.',
    ));
  }
  if (contact.status !== 'READY_FOR_PREPRODUCTION_CONTACT_AUTHORITY') {
    blockers.push(issue(
      'PREPRODUCTION_TL03_CONTACT_AUTHORITY_BLOCKED',
      'authority',
      'Current support/contact authority is not ready.',
    ));
  }
  if (prerequisite.status !== 'READY_FOR_TL03_PREREQUISITE_BRIDGE') {
    blockers.push(issue(
      'PREPRODUCTION_TL03_PREREQUISITE_AUTHORITY_BLOCKED',
      'authority',
      'TL-01/TL-02/reaction-tolerance prerequisite authority is not ready.',
    ));
  }
  if (cold.datasetId !== contact.datasetId || cold.datasetId !== prerequisite.datasetId) {
    blockers.push(issue(
      'PREPRODUCTION_TL03_DATASET_MISMATCH',
      'authority',
      'Gravity, contact and prerequisite authorities must belong to one dataset.',
    ));
  }
  if (prerequisite.contactAuthoritySemanticHash !== contact.semanticHash) {
    blockers.push(issue(
      'PREPRODUCTION_TL03_CONTACT_BINDING_STALE',
      'authority',
      'Prerequisite authority is not bound to the exact current contact authority.',
    ));
  }

  const readyContactRows = contact.rows
    .filter((row) => row.tl03Status === 'READY_FOR_TL03_CONTACT_INTAKE')
    .sort((left, right) => ascii(left.supportSiteId, right.supportSiteId));
  const expectedReadyIds = readyContactRows.map((row) => row.supportSiteId);
  const prerequisiteRows = [...prerequisite.rows]
    .sort((left, right) => ascii(left.supportSiteId, right.supportSiteId));
  const prerequisiteIds = prerequisiteRows.map((row) => row.supportSiteId);
  if (!sameList(expectedReadyIds, prerequisiteIds)) {
    blockers.push(issue(
      'PREPRODUCTION_TL03_PREREQUISITE_COVERAGE_MISMATCH',
      'authority',
      'Prerequisite rows must cover exactly every current TL-03-ready contact site.',
      { expectedReadyIds, prerequisiteIds },
    ));
  }
  if (!prerequisite.loadCaseId) {
    blockers.push(issue(
      'PREPRODUCTION_TL03_LOAD_CASE_AUTHORITY_MISSING',
      'authority',
      'TL-03 requires one exact governed displacement load-case identity.',
    ));
  }

  const matchingCases = prerequisite.loadCaseId
    ? cold.distribution.loadCases.filter((row) => row.loadCaseId === prerequisite.loadCaseId)
    : [];
  if (matchingCases.length !== 1) {
    blockers.push(issue(
      'PREPRODUCTION_TL03_COLD_GRAVITY_LOAD_CASE_MISMATCH',
      prerequisite.loadCaseId || 'authority',
      'The governed displacement load case must match exactly one current gravity load case.',
      { matchCount: matchingCases.length },
    ));
  }

  const targetCase = matchingCases.length === 1 ? matchingCases[0] : null;
  if (targetCase && targetCase.status !== 'CALCULATED') {
    blockers.push(issue(
      'PREPRODUCTION_TL03_COLD_GRAVITY_CASE_BLOCKED',
      prerequisite.loadCaseId,
      'The exact target gravity load case must be calculated.',
    ));
  }

  const contactBySite = uniqueIndex(contact.rows, 'supportSiteId', blockers,
    'PREPRODUCTION_TL03_CONTACT_SITE_AMBIGUOUS');
  const coldRows = targetCase && Array.isArray(targetCase.supportResults)
    ? targetCase.supportResults
    : [];
  const coldBySite = uniqueIndex(coldRows, 'supportSiteId', blockers,
    'PREPRODUCTION_TL03_COLD_SUPPORT_AMBIGUOUS');
  const coldSupportSiteIds = [...coldBySite.keys()].sort(ascii);

  for (const coldSiteId of coldSupportSiteIds) {
    if (!contactBySite.has(coldSiteId)) {
      blockers.push(issue(
        'PREPRODUCTION_TL03_COLD_SUPPORT_CONTACT_CUSTODY_MISSING',
        coldSiteId,
        'Every cold-gravity support must retain current contact-authority custody.',
      ));
    }
  }

  const candidateRows = prerequisiteRows.map((prerequisiteRow) => {
    const siteId = prerequisiteRow.supportSiteId;
    const rowBlockers = [];
    const contactRow = contactBySite.get(siteId) || null;
    const coldRow = coldBySite.get(siteId) || null;

    if (prerequisiteRow.status !== 'QUALIFIED') {
      rowBlockers.push(issue(
        'PREPRODUCTION_TL03_PREREQUISITE_ROW_UNQUALIFIED',
        siteId,
        'TL-03 cannot execute from an unresolved prerequisite row.',
      ));
    }
    if (!contactRow || contactRow.tl03Status !== 'READY_FOR_TL03_CONTACT_INTAKE') {
      rowBlockers.push(issue(
        'PREPRODUCTION_TL03_CONTACT_ROW_UNAVAILABLE',
        siteId,
        'Exact TL-03-ready contact authority is required.',
      ));
    }
    if (contactRow && prerequisiteRow.contactRowSemanticHash !== contactRow.semanticHash) {
      rowBlockers.push(issue(
        'PREPRODUCTION_TL03_CONTACT_ROW_BINDING_STALE',
        siteId,
        'Prerequisite row is not bound to the exact current contact row.',
      ));
    }
    if (contactRow && prerequisiteRow.routeChainageMm !== contactRow.routeChainageMm) {
      rowBlockers.push(issue(
        'PREPRODUCTION_TL03_ROUTE_CHAINAGE_MISMATCH',
        siteId,
        'Contact and prerequisite route-chainage authority disagree.',
      ));
    }
    if (contactRow && (contactRow.capability !== 'UNILATERAL_REST'
        || contactRow.verticalContactDirection !== 'GLOBAL_Z_PLUS'
        || contactRow.tensileReactionPermitted !== false
        || contactRow.initialState !== 'CONTACTING'
        || contactRow.gapConvention !== 'POSITIVE_OPEN_PIPE_TO_SUPPORT')) {
      rowBlockers.push(issue(
        'PREPRODUCTION_TL03_CONTACT_CONTRACT_MISMATCH',
        siteId,
        'TL-03 local screening admits only the qualified unilateral +Z contact subset.',
      ));
    }
    if (!coldRow || coldRow.status !== 'CALCULATED'
        || !Number.isFinite(coldRow.verticalForceN)) {
      rowBlockers.push(issue(
        'PREPRODUCTION_TL03_COLD_REACTION_MISSING',
        siteId,
        'A finite calculated cold-gravity reaction is required for the exact site.',
      ));
    }
    if (!Number.isFinite(prerequisiteRow.usedUpwardRelativeDisplacementM)) {
      rowBlockers.push(issue(
        'PREPRODUCTION_TL03_DISPLACEMENT_VALUE_MISSING',
        siteId,
        'Qualified upward relative displacement is required.',
      ));
    }
    if (!Number.isFinite(prerequisiteRow.effectiveVerticalStiffnessNPerM)
        || prerequisiteRow.effectiveVerticalStiffnessNPerM <= 0) {
      rowBlockers.push(issue(
        'PREPRODUCTION_TL03_STIFFNESS_VALUE_MISSING',
        siteId,
        'Positive qualified local effective vertical stiffness is required.',
      ));
    }
    if (!Number.isFinite(prerequisiteRow.reactionToleranceN)
        || prerequisiteRow.reactionToleranceN < 0) {
      rowBlockers.push(issue(
        'PREPRODUCTION_TL03_REACTION_TOLERANCE_MISSING',
        siteId,
        'Explicit non-negative reaction tolerance authority is required.',
      ));
    }
    if (!Number.isFinite(contactRow?.coldGapM) || contactRow.coldGapM < 0) {
      rowBlockers.push(issue(
        'PREPRODUCTION_TL03_COLD_GAP_INVALID',
        siteId,
        'A finite non-negative governed cold gap is required.',
      ));
    }

    blockers.push(...rowBlockers);
    if (rowBlockers.length) return null;
    return freezeHash({
      supportKey: prerequisiteRow.supportKey,
      supportSiteId: siteId,
      routeChainageMm: prerequisiteRow.routeChainageMm,
      coldGravityReactionN: coldRow.verticalForceN,
      usedUpwardRelativeDisplacementM: prerequisiteRow.usedUpwardRelativeDisplacementM,
      effectiveVerticalStiffnessNPerM: prerequisiteRow.effectiveVerticalStiffnessNPerM,
      reactionToleranceN: prerequisiteRow.reactionToleranceN,
      coldGapM: contactRow.coldGapM,
      contactRowSemanticHash: contactRow.semanticHash,
      prerequisiteRowSemanticHash: prerequisiteRow.semanticHash,
      displacementSemanticHash: prerequisiteRow.displacementSemanticHash,
      stiffnessSemanticHash: prerequisiteRow.stiffnessSemanticHash,
      applicabilitySemanticHash: prerequisiteRow.applicabilitySemanticHash,
      reactionToleranceSemanticHash: prerequisiteRow.reactionToleranceSemanticHash,
      coldSupportRowSemanticHash: semanticHash(coldRow),
    });
  }).filter(Boolean).sort((left, right) => ascii(left.supportSiteId, right.supportSiteId));

  const reactionTolerances = candidateRows.map((row) => row.reactionToleranceN);
  if (new Set(reactionTolerances).size > 1) {
    blockers.push(issue(
      'PREPRODUCTION_TL03_REACTION_TOLERANCE_CONFLICT',
      'authority',
      'All screened sites in one TL-03 execution must use one reaction-tolerance authority.',
    ));
  }

  const finalBlockers = uniqueIssues(blockers);
  const screenedIds = new Set(prerequisiteIds);
  const unscreenedColdSupportSiteIds = coldSupportSiteIds
    .filter((siteId) => !screenedIds.has(siteId));
  const ready = finalBlockers.length === 0
    && candidateRows.length > 0
    && candidateRows.length === prerequisiteRows.length;
  const rows = ready ? candidateRows : [];
  const sourceBindings = {
    coldGravityExecutionSemanticHash: cold.semanticHash,
    coldGravityDistributionSemanticHash: cold.distributionSemanticHash,
    contactAuthoritySemanticHash: contact.semanticHash,
    prerequisiteAuthoritySemanticHash: prerequisite.semanticHash,
  };
  const material = {
    schema: PREPRODUCTION_TL03_LOCAL_SCREEN_INTAKE_SCHEMA,
    datasetId: cold.datasetId,
    loadCaseId: prerequisite.loadCaseId,
    coldGravityMethod: cold.executedMethod,
    sourceBindings,
    status: ready ? 'READY_FOR_TL03_LOCAL_SCREEN' : 'BLOCKED',
    rows,
    coldSupportSiteIds,
    unscreenedColdSupportSiteIds,
    blockers: finalBlockers,
    summary: {
      coldSupportCount: coldSupportSiteIds.length,
      tl03CandidateSiteCount: prerequisiteRows.length,
      boundScreenRowCount: rows.length,
      unscreenedColdSupportCount: unscreenedColdSupportSiteIds.length,
      blockerCount: finalBlockers.length,
    },
    policy: {
      productionCalculationConsumptionEnabled: false,
      gravityMutationPermitted: false,
      inputGravityRecalculated: false,
      localScreenArithmeticPerformed: false,
      classificationPerformed: false,
      reactionReserveCalculated: false,
      negativeReactionClampingPermitted: false,
      activeSetRedistributionPermitted: false,
      recontactPermitted: false,
      finalHotReactionPublicationPermitted: false,
      productionMethodRegistrationPermitted: false,
    },
  };
  return requirePreproductionThermalLiftoffLocalScreenIntake(freezeHash(material));
}

export function requirePreproductionThermalLiftoffLocalScreenIntake(value) {
  exactKeys(value, [
    'schema', 'datasetId', 'loadCaseId', 'coldGravityMethod', 'sourceBindings',
    'status', 'rows', 'coldSupportSiteIds', 'unscreenedColdSupportSiteIds',
    'blockers', 'summary', 'policy', 'semanticHash',
  ], 'preproduction TL-03 local-screen intake');
  if (value.schema !== PREPRODUCTION_TL03_LOCAL_SCREEN_INTAKE_SCHEMA) {
    throw codedError('PREPRODUCTION_TL03_INTAKE_SCHEMA_INVALID');
  }
  text(value.datasetId, 'datasetId');
  if (value.loadCaseId !== null) text(value.loadCaseId, 'loadCaseId');
  if (!SUPPORTED_GRAVITY_METHODS.includes(value.coldGravityMethod)) {
    throw codedError('PREPRODUCTION_TL03_INTAKE_METHOD_INVALID');
  }
  if (!['READY_FOR_TL03_LOCAL_SCREEN', 'BLOCKED'].includes(value.status)) {
    throw codedError('PREPRODUCTION_TL03_INTAKE_STATUS_INVALID');
  }
  if (!Array.isArray(value.rows) || !Array.isArray(value.blockers)
      || !Array.isArray(value.coldSupportSiteIds)
      || !Array.isArray(value.unscreenedColdSupportSiteIds)) {
    throw new TypeError('TL-03 intake arrays are invalid.');
  }
  const rowIds = value.rows.map(requireIntakeRow);
  if (!strictlySortedUnique(rowIds)) {
    throw codedError('PREPRODUCTION_TL03_INTAKE_ROW_ORDER_INVALID');
  }
  if (value.status === 'BLOCKED' && value.rows.length !== 0) {
    throw codedError('PREPRODUCTION_TL03_BLOCKED_INTAKE_PARTIAL_INVALID');
  }
  if (value.status === 'READY_FOR_TL03_LOCAL_SCREEN' && value.blockers.length !== 0) {
    throw codedError('PREPRODUCTION_TL03_READY_INTAKE_BLOCKED');
  }
  const expectedSummary = {
    coldSupportCount: value.coldSupportSiteIds.length,
    tl03CandidateSiteCount: value.status === 'READY_FOR_TL03_LOCAL_SCREEN'
      ? value.rows.length
      : value.summary.tl03CandidateSiteCount,
    boundScreenRowCount: value.rows.length,
    unscreenedColdSupportCount: value.unscreenedColdSupportSiteIds.length,
    blockerCount: value.blockers.length,
  };
  if (value.status === 'READY_FOR_TL03_LOCAL_SCREEN'
      && semanticHash(value.summary) !== semanticHash(expectedSummary)) {
    throw codedError('PREPRODUCTION_TL03_INTAKE_SUMMARY_INVALID');
  }
  requireSourceBindings(value.sourceBindings);
  const policy = value.policy || {};
  if (policy.productionCalculationConsumptionEnabled !== false
      || policy.gravityMutationPermitted !== false
      || policy.inputGravityRecalculated !== false
      || policy.localScreenArithmeticPerformed !== false
      || policy.classificationPerformed !== false
      || policy.reactionReserveCalculated !== false
      || policy.negativeReactionClampingPermitted !== false
      || policy.activeSetRedistributionPermitted !== false
      || policy.recontactPermitted !== false
      || policy.finalHotReactionPublicationPermitted !== false
      || policy.productionMethodRegistrationPermitted !== false) {
    throw codedError('PREPRODUCTION_TL03_INTAKE_POLICY_INVALID');
  }
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) {
    throw codedError('PREPRODUCTION_TL03_INTAKE_HASH_MISMATCH');
  }
  return deepFreeze(structuredClone(value));
}

function requireIntakeRow(value) {
  exactKeys(value, [
    'supportKey', 'supportSiteId', 'routeChainageMm', 'coldGravityReactionN',
    'usedUpwardRelativeDisplacementM', 'effectiveVerticalStiffnessNPerM',
    'reactionToleranceN', 'coldGapM', 'contactRowSemanticHash',
    'prerequisiteRowSemanticHash', 'displacementSemanticHash',
    'stiffnessSemanticHash', 'applicabilitySemanticHash',
    'reactionToleranceSemanticHash', 'coldSupportRowSemanticHash', 'semanticHash',
  ], 'TL-03 intake row');
  text(value.supportKey, 'supportKey');
  const supportSiteId = text(value.supportSiteId, 'supportSiteId');
  finite(value.routeChainageMm, 'routeChainageMm');
  finite(value.coldGravityReactionN, 'coldGravityReactionN');
  finite(value.usedUpwardRelativeDisplacementM, 'usedUpwardRelativeDisplacementM');
  positive(value.effectiveVerticalStiffnessNPerM, 'effectiveVerticalStiffnessNPerM');
  nonnegative(value.reactionToleranceN, 'reactionToleranceN');
  nonnegative(value.coldGapM, 'coldGapM');
  for (const key of [
    'contactRowSemanticHash', 'prerequisiteRowSemanticHash',
    'displacementSemanticHash', 'stiffnessSemanticHash',
    'applicabilitySemanticHash', 'reactionToleranceSemanticHash',
    'coldSupportRowSemanticHash',
  ]) hash(value[key], key);
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) {
    throw codedError('PREPRODUCTION_TL03_INTAKE_ROW_HASH_MISMATCH');
  }
  return supportSiteId;
}

function requireSourceBindings(value) {
  exactKeys(value, [
    'coldGravityExecutionSemanticHash', 'coldGravityDistributionSemanticHash',
    'contactAuthoritySemanticHash', 'prerequisiteAuthoritySemanticHash',
  ], 'TL-03 intake source bindings');
  Object.entries(value).forEach(([key, item]) => hash(item, key));
}

function uniqueIndex(rows, key, blockers, code) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = row?.[key];
    if (typeof id !== 'string' || id.length === 0) continue;
    if (map.has(id)) {
      blockers.push(issue(code, id, `Duplicate authority rows exist for ${id}.`));
      continue;
    }
    map.set(id, row);
  }
  return map;
}

function issue(code, scope, message, details = null) {
  return deepFreeze({ code, severity: 'ERROR', scope, message, details });
}
function uniqueIssues(rows) {
  const map = new Map();
  for (const row of rows) map.set(`${row.code}|${row.scope}|${row.message}`, row);
  return [...map.values()].sort((a, b) => ascii(`${a.code}|${a.scope}`, `${b.code}|${b.scope}`));
}
function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)
      || JSON.stringify(Object.keys(value).sort(ascii)) !== JSON.stringify([...keys].sort(ascii))) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}
function freezeHash(material) { return deepFreeze({ ...material, semanticHash: semanticHash(material) }); }
function text(value, label) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty.`); return value; }
function finite(value, label) { if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`); return value; }
function positive(value, label) { const result = finite(value, label); if (result <= 0) throw new TypeError(`${label} must be positive.`); return result; }
function nonnegative(value, label) { const result = finite(value, label); if (result < 0) throw new TypeError(`${label} must be non-negative.`); return result; }
function hash(value, label) { if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) throw new TypeError(`${label} must be an FNV-1a hash.`); return value; }
function sameList(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function strictlySortedUnique(values) { return values.every((value, index) => index === 0 || ascii(values[index - 1], value) < 0); }
function ascii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function codedError(code) { const error = new Error(code); error.code = code; return error; }
