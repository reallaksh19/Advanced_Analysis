import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V8_SCHEMA,
  requireAuthorizedEmpiricalLoadExecutionV8,
} from './authorized-empirical-load-execution-v8.js';
import {
  requirePreproductionSupportContactAuthority,
} from './preproduction-support-contact-authority.js';
import {
  requirePreproductionThermalLiftoffContactBridge,
} from './preproduction-support-contact-tl-bridge.js';
import {
  requirePreproductionThermalLiftoffPrerequisiteAuthority,
  requirePreproductionThermalLiftoffPrerequisiteBridge,
} from './preproduction-thermal-liftoff-prerequisite-authority.js';
import {
  calculatePreproductionThermalLiftoffLocalScreenCandidate,
  requirePreproductionThermalLiftoffLocalScreenCandidate,
} from './preproduction-thermal-liftoff-local-screen.js';

export const PREPRODUCTION_TL_LOCAL_SCREEN_EXECUTION_REQUEST_SCHEMA =
  'engineering-preproduction-thermal-liftoff-local-screen-execution-request/v1';
export const PREPRODUCTION_TL_LOCAL_SCREEN_EXECUTION_SCHEMA =
  'engineering-preproduction-thermal-liftoff-local-screen-execution/v1';
export const PREPRODUCTION_TL_LOCAL_SCREEN_CURRENTNESS_SCHEMA =
  'engineering-preproduction-thermal-liftoff-local-screen-currentness/v1';
export const PREPRODUCTION_TL_LOCAL_SCREEN_METHOD = 'THERMAL_LIFTOFF_ACTIVE_SET_V1';

const COLD_METHODS = Object.freeze([
  'CHAINAGE_TRIBUTARY_SPAN_V2',
  'CHAINAGE_TRIBUTARY_SPAN_V3_COG',
]);

const REQUEST_KEYS = Object.freeze([
  'schema',
  'executionId',
  'executedAt',
  'coldGravityExecution',
  'contactAuthority',
  'contactBridge',
  'prerequisiteAuthority',
  'prerequisiteBridge',
]);

const RESULT_KEYS = Object.freeze([
  'schema',
  'method',
  'runtimeStatus',
  'executionId',
  'executedAt',
  'stage',
  'finality',
  'datasetId',
  'loadCaseId',
  'coldGravityMethod',
  'reactionToleranceN',
  'upstreamBindings',
  'status',
  'rows',
  'summary',
  'policy',
  'semanticHash',
]);

const ROW_KEYS = Object.freeze([
  'supportKey',
  'supportSiteId',
  'routeChainageMm',
  'classification',
  'coldGravityReactionN',
  'usedUpwardRelativeDisplacementM',
  'qualifiedEffectiveVerticalStiffnessNPerM',
  'localUpliftDemandN',
  'localTrialContactReserveN',
  'coldGapM',
  'screenKinematicOpeningM',
  'contactRowSemanticHash',
  'displacementAuthoritySemanticHash',
  'stiffnessAuthoritySemanticHash',
  'applicabilityAuthoritySemanticHash',
  'reactionToleranceAuthoritySemanticHash',
  'coldGravitySupportResultSemanticHash',
  'candidateSemanticHash',
  'semanticHash',
]);

const UPSTREAM_KEYS = Object.freeze([
  'coldGravityExecutionSemanticHash',
  'contactAuthoritySemanticHash',
  'contactBridgeSemanticHash',
  'prerequisiteAuthoritySemanticHash',
  'prerequisiteBridgeSemanticHash',
]);

const POLICY_KEYS = Object.freeze([
  'productionCalculationConsumptionEnabled',
  'gravityMutationPermitted',
  'coldGravityReadOnly',
  'localScreenExecutionPerformed',
  'activeSetRedistributionPerformed',
  'recontactPerformed',
  'springMechanicsExecuted',
  'frictionMechanicsExecuted',
  'finalHotReactionPublicationPermitted',
  'sealOrExportEligible',
  'productionMethodRegistrationPermitted',
  'defaultUiExposurePermitted',
  'negativeTrialReserveClampingPermitted',
  'historicalRuntimeImported',
]);

export function calculatePreproductionThermalLiftoffLocalScreenExecution(value) {
  const context = requireExecutionContext(value);
  const rows = context.prerequisiteAuthority.rows
    .map((row) => calculateExecutionRow(row, context))
    .sort((left, right) => ascii(left.supportKey, right.supportKey));
  const summary = summarize(rows);
  const material = {
    schema: PREPRODUCTION_TL_LOCAL_SCREEN_EXECUTION_SCHEMA,
    method: PREPRODUCTION_TL_LOCAL_SCREEN_METHOD,
    runtimeStatus: 'PREPRODUCTION_UNREGISTERED',
    executionId: context.executionId,
    executedAt: context.executedAt,
    stage: 'TL03_LOCAL_SCREEN_ONLY',
    finality: 'NON_FINAL_NO_REDISTRIBUTION',
    datasetId: context.contactAuthority.datasetId,
    loadCaseId: context.prerequisiteAuthority.loadCaseId,
    coldGravityMethod: context.coldGravityExecution.executedMethod,
    reactionToleranceN: context.prerequisiteBridge.reactionToleranceAuthority.reactionToleranceN,
    upstreamBindings: context.upstreamBindings,
    status: 'SCREEN_COMPLETE',
    rows,
    summary,
    policy: localScreenPolicy(),
  };
  return requirePreproductionThermalLiftoffLocalScreenExecution({
    ...material,
    semanticHash: semanticHash(material),
  });
}

export function requirePreproductionThermalLiftoffLocalScreenExecution(value) {
  exactKeys(value, RESULT_KEYS, 'preproduction TL-03 local-screen execution');
  if (value.schema !== PREPRODUCTION_TL_LOCAL_SCREEN_EXECUTION_SCHEMA
      || value.method !== PREPRODUCTION_TL_LOCAL_SCREEN_METHOD
      || value.runtimeStatus !== 'PREPRODUCTION_UNREGISTERED'
      || value.stage !== 'TL03_LOCAL_SCREEN_ONLY'
      || value.finality !== 'NON_FINAL_NO_REDISTRIBUTION'
      || value.status !== 'SCREEN_COMPLETE') {
    throw coded('PREPRODUCTION_TL03_EXECUTION_IDENTITY_INVALID');
  }
  text(value.executionId, 'executionId');
  timestamp(value.executedAt, 'executedAt');
  text(value.datasetId, 'datasetId');
  text(value.loadCaseId, 'loadCaseId');
  if (!COLD_METHODS.includes(value.coldGravityMethod)) {
    throw coded('PREPRODUCTION_TL03_COLD_GRAVITY_METHOD_INVALID');
  }
  const reactionToleranceN = nonnegative(value.reactionToleranceN, 'reactionToleranceN');
  requireUpstreamBindings(value.upstreamBindings);
  requirePolicy(value.policy);
  if (!Array.isArray(value.rows) || value.rows.length === 0) {
    throw coded('PREPRODUCTION_TL03_EXECUTION_ROWS_MISSING');
  }
  const rows = value.rows.map((row) => requireExecutionRow(row, reactionToleranceN));
  const supportKeys = rows.map((row) => row.supportKey);
  if (!strictlySortedUnique(supportKeys)) {
    throw coded('PREPRODUCTION_TL03_EXECUTION_ROW_ORDER_INVALID');
  }
  const expectedSummary = summarize(rows);
  if (semanticHash(value.summary) !== semanticHash(expectedSummary)) {
    throw coded('PREPRODUCTION_TL03_EXECUTION_SUMMARY_MISMATCH');
  }
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) {
    throw coded('PREPRODUCTION_TL03_EXECUTION_HASH_MISMATCH');
  }
  return deepFreeze(structuredClone(value));
}

export function evaluatePreproductionThermalLiftoffLocalScreenCurrentness(input) {
  exactKeys(input, [
    'execution',
    'coldGravityExecution',
    'contactAuthority',
    'contactBridge',
    'prerequisiteAuthority',
    'prerequisiteBridge',
  ], 'preproduction TL-03 currentness input');
  const execution = requirePreproductionThermalLiftoffLocalScreenExecution(input.execution);
  const current = requireExecutionContext({
    schema: PREPRODUCTION_TL_LOCAL_SCREEN_EXECUTION_REQUEST_SCHEMA,
    executionId: execution.executionId,
    executedAt: execution.executedAt,
    coldGravityExecution: input.coldGravityExecution,
    contactAuthority: input.contactAuthority,
    contactBridge: input.contactBridge,
    prerequisiteAuthority: input.prerequisiteAuthority,
    prerequisiteBridge: input.prerequisiteBridge,
  });
  const differences = UPSTREAM_KEYS.flatMap((field) => (
    execution.upstreamBindings[field] === current.upstreamBindings[field]
      ? []
      : [field]
  ));
  if (execution.datasetId !== current.contactAuthority.datasetId) {
    differences.push('datasetId');
  }
  if (execution.loadCaseId !== current.prerequisiteAuthority.loadCaseId) {
    differences.push('loadCaseId');
  }
  if (execution.coldGravityMethod !== current.coldGravityExecution.executedMethod) {
    differences.push('coldGravityMethod');
  }
  const material = {
    schema: PREPRODUCTION_TL_LOCAL_SCREEN_CURRENTNESS_SCHEMA,
    executionSemanticHash: execution.semanticHash,
    observedUpstreamBindings: current.upstreamBindings,
    status: differences.length ? 'STALE_REBUILD_REQUIRED' : 'CURRENT',
    differences: [...new Set(differences)].sort(ascii),
    productionCalculationConsumptionEnabled: false,
  };
  return deepFreeze({ ...material, semanticHash: semanticHash(material) });
}

function requireExecutionContext(value) {
  exactKeys(value, REQUEST_KEYS, 'preproduction TL-03 execution request');
  if (value.schema !== PREPRODUCTION_TL_LOCAL_SCREEN_EXECUTION_REQUEST_SCHEMA) {
    throw coded('PREPRODUCTION_TL03_EXECUTION_REQUEST_SCHEMA_INVALID');
  }
  const coldGravityExecution = requireAuthorizedEmpiricalLoadExecutionV8(
    value.coldGravityExecution,
  );
  const contactAuthority = requirePreproductionSupportContactAuthority(
    value.contactAuthority,
  );
  const contactBridge = requirePreproductionThermalLiftoffContactBridge(
    value.contactBridge,
  );
  const prerequisiteAuthority = requirePreproductionThermalLiftoffPrerequisiteAuthority(
    value.prerequisiteAuthority,
  );
  const prerequisiteBridge = requirePreproductionThermalLiftoffPrerequisiteBridge(
    value.prerequisiteBridge,
  );

  if (coldGravityExecution.schema !== AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V8_SCHEMA
      || coldGravityExecution.status !== 'CALCULATED'
      || !COLD_METHODS.includes(coldGravityExecution.executedMethod)
      || coldGravityExecution.requestedMethod !== coldGravityExecution.executedMethod) {
    throw coded('PREPRODUCTION_TL03_COLD_GRAVITY_EXECUTION_INVALID');
  }
  if (coldGravityExecution.distribution?.status !== 'CALCULATED'
      || coldGravityExecution.distribution?.freshness?.status !== 'CURRENT'
      || coldGravityExecution.distribution?.sourceAxisBasis !== 'Z_UP'
      || coldGravityExecution.distribution?.verticalForceConvention
        !== 'positive reaction opposes source-axis gravity') {
    throw coded('PREPRODUCTION_TL03_COLD_GRAVITY_AUTHORITY_INVALID');
  }
  if (contactAuthority.status !== 'READY_FOR_PREPRODUCTION_CONTACT_AUTHORITY'
      || contactBridge.status !== 'READY_FOR_TL03_CONTACT_INTAKE') {
    throw coded('PREPRODUCTION_TL03_CONTACT_AUTHORITY_NOT_READY');
  }
  if (prerequisiteAuthority.status !== 'READY_FOR_TL03_PREREQUISITE_BRIDGE'
      || prerequisiteBridge.status !== 'READY_FOR_TL03_INPUT_RECONCILIATION') {
    throw coded('PREPRODUCTION_TL03_PREREQUISITE_AUTHORITY_NOT_READY');
  }
  if (contactBridge.sourceAuthoritySemanticHash !== contactAuthority.semanticHash
      || prerequisiteAuthority.contactAuthoritySemanticHash !== contactAuthority.semanticHash
      || prerequisiteBridge.sourcePrerequisiteAuthoritySemanticHash
        !== prerequisiteAuthority.semanticHash) {
    throw coded('PREPRODUCTION_TL03_UPSTREAM_BINDING_MISMATCH');
  }
  if (coldGravityExecution.datasetId !== contactAuthority.datasetId
      || prerequisiteAuthority.datasetId !== contactAuthority.datasetId) {
    throw coded('PREPRODUCTION_TL03_DATASET_MISMATCH');
  }
  if (!prerequisiteAuthority.loadCaseId) {
    throw coded('PREPRODUCTION_TL03_LOAD_CASE_UNRESOLVED');
  }
  if (!prerequisiteBridge.reactionToleranceAuthority
      || !Number.isFinite(prerequisiteBridge.reactionToleranceAuthority.reactionToleranceN)
      || prerequisiteBridge.reactionToleranceAuthority.reactionToleranceN < 0) {
    throw coded('PREPRODUCTION_TL03_REACTION_TOLERANCE_INVALID');
  }
  if (prerequisiteAuthority.policy?.tl03InputBridgePermitted !== true
      || prerequisiteAuthority.policy?.localScreenExecutionPermitted !== false
      || prerequisiteBridge.policy?.localScreenExecutionPerformed !== false
      || prerequisiteBridge.policy?.activeSetRedistributionPerformed !== false
      || contactBridge.policy?.localScreenExecutionPerformed !== false
      || contactBridge.policy?.activeSetRedistributionPerformed !== false) {
    throw coded('PREPRODUCTION_TL03_UPSTREAM_POLICY_INVALID');
  }

  const loadCases = coldGravityExecution.distribution.loadCases || [];
  const matchingCases = loadCases.filter((row) => (
    row.loadCaseId === prerequisiteAuthority.loadCaseId
  ));
  if (matchingCases.length !== 1) {
    throw coded('PREPRODUCTION_TL03_COLD_GRAVITY_LOAD_CASE_MISMATCH');
  }
  const loadCase = matchingCases[0];
  if (loadCase.status !== 'CALCULATED'
      || loadCase.equilibrium?.passed !== true
      || !Array.isArray(loadCase.supportResults)) {
    throw coded('PREPRODUCTION_TL03_COLD_GRAVITY_LOAD_CASE_INVALID');
  }

  const contactBySite = uniqueIndex(
    contactBridge.qualifiedContacts,
    (row) => row.supportSiteId,
    'TL-03 contact bridge rows',
  );
  const sourceContactBySite = uniqueIndex(
    contactAuthority.rows,
    (row) => row.supportSiteId,
    'preproduction contact-authority rows',
  );
  const displacementBySite = uniqueIndex(
    prerequisiteBridge.usedDisplacements,
    (row) => row.supportSiteId,
    'TL-03 displacement bridge rows',
  );
  const stiffnessBySite = uniqueIndex(
    prerequisiteBridge.stiffnessRegistry?.entries || [],
    (row) => row.supportSiteId,
    'TL-03 stiffness bridge rows',
  );
  const coldSupportBySite = uniqueIndex(
    loadCase.supportResults,
    (row) => row.supportSiteId,
    'cold-gravity support results',
  );

  const expectedSites = prerequisiteAuthority.rows.map((row) => row.supportSiteId).sort(ascii);
  for (const [label, index] of [
    ['contact', contactBySite],
    ['displacement', displacementBySite],
    ['stiffness', stiffnessBySite],
  ]) {
    const actualSites = [...index.keys()].sort(ascii);
    if (JSON.stringify(actualSites) !== JSON.stringify(expectedSites)) {
      throw coded(`PREPRODUCTION_TL03_${label.toUpperCase()}_COVERAGE_MISMATCH`);
    }
  }
  expectedSites.forEach((site) => {
    if (!sourceContactBySite.has(site) || !coldSupportBySite.has(site)) {
      throw coded('PREPRODUCTION_TL03_SUPPORT_COVERAGE_MISMATCH');
    }
  });

  return deepFreeze({
    executionId: text(value.executionId, 'executionId'),
    executedAt: timestamp(value.executedAt, 'executedAt'),
    coldGravityExecution,
    contactAuthority,
    contactBridge,
    prerequisiteAuthority,
    prerequisiteBridge,
    loadCase,
    contactBySite,
    sourceContactBySite,
    displacementBySite,
    stiffnessBySite,
    coldSupportBySite,
    upstreamBindings: deepFreeze({
      coldGravityExecutionSemanticHash: coldGravityExecution.semanticHash,
      contactAuthoritySemanticHash: contactAuthority.semanticHash,
      contactBridgeSemanticHash: contactBridge.semanticHash,
      prerequisiteAuthoritySemanticHash: prerequisiteAuthority.semanticHash,
      prerequisiteBridgeSemanticHash: prerequisiteBridge.semanticHash,
    }),
  });
}

function calculateExecutionRow(prerequisiteRow, context) {
  if (prerequisiteRow.status !== 'QUALIFIED') {
    throw coded('PREPRODUCTION_TL03_PREREQUISITE_ROW_UNRESOLVED');
  }
  const site = prerequisiteRow.supportSiteId;
  const contact = only(context.contactBySite.get(site));
  const sourceContact = only(context.sourceContactBySite.get(site));
  const displacement = only(context.displacementBySite.get(site));
  const stiffness = only(context.stiffnessBySite.get(site));
  const coldSupport = only(context.coldSupportBySite.get(site));
  if (!contact || !sourceContact || !displacement || !stiffness || !coldSupport) {
    throw coded('PREPRODUCTION_TL03_SUPPORT_INPUT_MISSING');
  }
  if (sourceContact.semanticHash !== prerequisiteRow.contactRowSemanticHash
      || contact.source?.sourceSemanticHash !== sourceContact.semanticHash
      || contact.routeChainageMm !== sourceContact.routeChainageMm
      || contact.coldGapM !== sourceContact.coldGapM) {
    throw coded('PREPRODUCTION_TL03_CONTACT_ROW_BINDING_MISMATCH');
  }
  if (displacement.usedUpwardRelativeDisplacementM
      !== prerequisiteRow.usedUpwardRelativeDisplacementM) {
    throw coded('PREPRODUCTION_TL03_DISPLACEMENT_VALUE_MISMATCH');
  }
  if (stiffness.representation !== 'LOCAL_EFFECTIVE_VERTICAL_STIFFNESS'
      || stiffness.data?.effectiveVerticalStiffnessNPerM
        !== prerequisiteRow.effectiveVerticalStiffnessNPerM) {
    throw coded('PREPRODUCTION_TL03_STIFFNESS_VALUE_MISMATCH');
  }
  const reactionToleranceN = context.prerequisiteBridge
    .reactionToleranceAuthority.reactionToleranceN;
  if (reactionToleranceN !== prerequisiteRow.reactionToleranceN) {
    throw coded('PREPRODUCTION_TL03_REACTION_TOLERANCE_BINDING_MISMATCH');
  }
  if (coldSupport.status !== 'CALCULATED'
      || !Number.isFinite(coldSupport.verticalForceN)
      || coldSupport.verticalForceN < 0) {
    throw coded('PREPRODUCTION_TL03_COLD_GRAVITY_SUPPORT_INVALID');
  }

  const candidate = calculatePreproductionThermalLiftoffLocalScreenCandidate({
    supportSiteId: site,
    coldGravityReactionN: coldSupport.verticalForceN,
    usedUpwardRelativeDisplacementM: prerequisiteRow.usedUpwardRelativeDisplacementM,
    effectiveVerticalStiffnessNPerM: prerequisiteRow.effectiveVerticalStiffnessNPerM,
    reactionToleranceN,
    coldGapM: contact.coldGapM,
  });
  const material = {
    supportKey: sourceContact.supportKey,
    supportSiteId: site,
    routeChainageMm: contact.routeChainageMm,
    classification: candidate.classification,
    coldGravityReactionN: candidate.coldGravityReactionN,
    usedUpwardRelativeDisplacementM: candidate.usedUpwardRelativeDisplacementM,
    qualifiedEffectiveVerticalStiffnessNPerM:
      candidate.qualifiedEffectiveVerticalStiffnessNPerM,
    localUpliftDemandN: candidate.localUpliftDemandN,
    localTrialContactReserveN: candidate.localTrialContactReserveN,
    coldGapM: candidate.coldGapM,
    screenKinematicOpeningM: candidate.screenKinematicOpeningM,
    contactRowSemanticHash: prerequisiteRow.contactRowSemanticHash,
    displacementAuthoritySemanticHash: prerequisiteRow.displacementSemanticHash,
    stiffnessAuthoritySemanticHash: prerequisiteRow.stiffnessSemanticHash,
    applicabilityAuthoritySemanticHash: prerequisiteRow.applicabilitySemanticHash,
    reactionToleranceAuthoritySemanticHash: prerequisiteRow.reactionToleranceSemanticHash,
    coldGravitySupportResultSemanticHash: semanticHash(coldSupport),
    candidateSemanticHash: candidate.semanticHash,
  };
  return deepFreeze({ ...material, semanticHash: semanticHash(material) });
}

function requireExecutionRow(value, reactionToleranceN) {
  exactKeys(value, ROW_KEYS, 'preproduction TL-03 execution row');
  text(value.supportKey, 'supportKey');
  text(value.supportSiteId, 'supportSiteId');
  finite(value.routeChainageMm, 'routeChainageMm');
  const candidate = requirePreproductionThermalLiftoffLocalScreenCandidate({
    schema: 'engineering-preproduction-thermal-liftoff-local-screen-candidate/v1',
    supportSiteId: value.supportSiteId,
    classification: value.classification,
    coldGravityReactionN: value.coldGravityReactionN,
    usedUpwardRelativeDisplacementM: value.usedUpwardRelativeDisplacementM,
    qualifiedEffectiveVerticalStiffnessNPerM:
      value.qualifiedEffectiveVerticalStiffnessNPerM,
    localUpliftDemandN: value.localUpliftDemandN,
    localTrialContactReserveN: value.localTrialContactReserveN,
    coldGapM: value.coldGapM,
    screenKinematicOpeningM: value.screenKinematicOpeningM,
    finality: 'NON_FINAL_NO_REDISTRIBUTION',
    semanticHash: value.candidateSemanticHash,
  }, reactionToleranceN);
  if (candidate.semanticHash !== value.candidateSemanticHash) {
    throw coded('PREPRODUCTION_TL03_CANDIDATE_BINDING_MISMATCH');
  }
  for (const field of [
    'contactRowSemanticHash',
    'displacementAuthoritySemanticHash',
    'stiffnessAuthoritySemanticHash',
    'applicabilityAuthoritySemanticHash',
    'reactionToleranceAuthoritySemanticHash',
    'coldGravitySupportResultSemanticHash',
    'candidateSemanticHash',
  ]) {
    hash(value[field], field);
  }
  const { semanticHash: actual, ...material } = value;
  if (actual !== semanticHash(material)) {
    throw coded('PREPRODUCTION_TL03_EXECUTION_ROW_HASH_MISMATCH');
  }
  return value;
}

function requireUpstreamBindings(value) {
  exactKeys(value, UPSTREAM_KEYS, 'TL-03 upstream bindings');
  UPSTREAM_KEYS.forEach((field) => hash(value[field], field));
}

function localScreenPolicy() {
  return deepFreeze({
    productionCalculationConsumptionEnabled: false,
    gravityMutationPermitted: false,
    coldGravityReadOnly: true,
    localScreenExecutionPerformed: true,
    activeSetRedistributionPerformed: false,
    recontactPerformed: false,
    springMechanicsExecuted: false,
    frictionMechanicsExecuted: false,
    finalHotReactionPublicationPermitted: false,
    sealOrExportEligible: false,
    productionMethodRegistrationPermitted: false,
    defaultUiExposurePermitted: false,
    negativeTrialReserveClampingPermitted: false,
    historicalRuntimeImported: false,
  });
}

function requirePolicy(value) {
  exactKeys(value, POLICY_KEYS, 'TL-03 execution policy');
  const expected = localScreenPolicy();
  if (semanticHash(value) !== semanticHash(expected)) {
    throw coded('PREPRODUCTION_TL03_EXECUTION_POLICY_INVALID');
  }
}

function summarize(rows) {
  return {
    supportScreenCount: rows.length,
    contactRetainedCandidateCount: rows.filter((row) => (
      row.classification === 'CONTACT_RETAINED_CANDIDATE'
    )).length,
    liftoffCandidateCount: rows.filter((row) => (
      row.classification === 'LIFTOFF_CANDIDATE'
    )).length,
  };
}

function uniqueIndex(rows, keyFn, label) {
  if (!Array.isArray(rows)) throw new TypeError(`${label} must be an array.`);
  const map = new Map();
  rows.forEach((row) => {
    const key = text(keyFn(row), `${label} key`);
    const current = map.get(key) || [];
    current.push(row);
    map.set(key, current);
  });
  for (const [key, values] of map) {
    if (values.length !== 1) throw new TypeError(`${label} must be unique for ${key}.`);
  }
  return map;
}

function only(value) {
  return Array.isArray(value) && value.length === 1 ? value[0] : null;
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort(ascii);
  const expected = [...keys].sort(ascii);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function text(value, label) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${label} must be non-empty.`);
  return normalized;
}

function timestamp(value, label) {
  const result = text(value, label);
  if (new Date(result).toISOString() !== result) {
    throw new TypeError(`${label} must be canonical ISO-8601.`);
  }
  return result;
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}

function nonnegative(value, label) {
  const result = finite(value, label);
  if (result < 0) throw new TypeError(`${label} must be non-negative.`);
  return result;
}

function hash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    throw new TypeError(`${label} must be an FNV-1a semantic hash.`);
  }
  return value;
}

function strictlySortedUnique(values) {
  return values.every((value, index) => index === 0 || ascii(values[index - 1], value) < 0);
}

function ascii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}
