import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_SCHEMA,
  requireAuthorizedEmpiricalLoadExecution,
} from './authorized-empirical-load-execution.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_SCHEMA,
  requireAuthorizedEmpiricalLoadExecutionV2,
} from './authorized-empirical-load-execution-v2.js';
import {
  THERMAL_LIFTOFF_AUTHORITY,
  THERMAL_LIFTOFF_BLOCKER_CODES,
  THERMAL_LIFTOFF_CLASSIFICATIONS,
  THERMAL_LIFTOFF_METHOD_ID,
  requireThermalLiftoffReactionToleranceAuthority,
  requireThermalLiftoffSupportContactAuthority,
} from './empirical-thermal-liftoff-authority.js';
import {
  requireThermalLiftoffUsedDisplacement,
} from './empirical-thermal-liftoff-displacement-intake.js';
import {
  requireThermalLiftoffApplicabilityBinding,
  requireThermalLiftoffStiffnessRegistry,
  resolveThermalLiftoffLocalStiffness,
} from './empirical-thermal-liftoff-stiffness-registry.js';

export const THERMAL_LIFTOFF_LOCAL_SCREEN_REQUEST_SCHEMA =
  'empirical-thermal-liftoff-local-screen-request/v1';
export const THERMAL_LIFTOFF_LOCAL_SCREEN_RESULT_SCHEMA =
  'empirical-thermal-liftoff-local-screen-result/v1';

const REQUEST_KEYS = Object.freeze([
  'schema',
  'executionId',
  'executedAt',
  'coldGravityExecution',
  'supportContactAuthorities',
  'displacements',
  'stiffnessRegistry',
  'applicabilityBindings',
  'reactionToleranceAuthority',
]);
const RESULT_KEYS = Object.freeze([
  'schema',
  'method',
  'executionId',
  'executedAt',
  'stage',
  'finality',
  'authoritySemanticHash',
  'coldGravityMethod',
  'reactionToleranceN',
  'upstreamBindings',
  'screenStatus',
  'summary',
  'caseScreens',
  'semanticHash',
]);
const CASE_KEYS = Object.freeze([
  'loadCaseId', 'screenStatus', 'summary', 'supportScreens', 'semanticHash',
]);
const SUPPORT_KEYS = Object.freeze([
  'supportSiteId',
  'classification',
  'coldGravityReactionN',
  'usedUpwardRelativeDisplacementM',
  'qualifiedEffectiveVerticalStiffnessNPerM',
  'localUpliftDemandN',
  'localTrialContactReserveN',
  'coldGapM',
  'screenKinematicOpeningM',
  'applicabilityClass',
  'stiffnessEntrySemanticHash',
  'displacementSemanticHash',
  'displacementSourceSemanticHash',
  'supportContactAuthoritySemanticHash',
  'applicabilityBindingSemanticHash',
  'blockers',
  'semanticHash',
]);

export function calculateEmpiricalThermalLiftoffLocalScreen(value) {
  const context = requireLocalScreenRequest(value);
  const caseScreens = context.coldGravity.distribution.loadCases.map((loadCase) => (
    buildCaseScreen(loadCase, context)
  ));
  const unresolvedSupportCount = caseScreens.reduce((total, row) => (
    total + row.summary.unresolvedGateCount
  ), 0);
  const supportScreenCount = caseScreens.reduce((total, row) => (
    total + row.summary.supportScreenCount
  ), 0);
  const draft = {
    schema: THERMAL_LIFTOFF_LOCAL_SCREEN_RESULT_SCHEMA,
    method: THERMAL_LIFTOFF_METHOD_ID,
    executionId: context.executionId,
    executedAt: context.executedAt,
    stage: 'TL03_LOCAL_SCREEN_ONLY',
    finality: 'NON_FINAL_NO_REDISTRIBUTION',
    authoritySemanticHash: THERMAL_LIFTOFF_AUTHORITY.semanticHash,
    coldGravityMethod: context.coldGravity.method,
    reactionToleranceN: context.reactionToleranceAuthority?.reactionToleranceN ?? null,
    upstreamBindings: context.upstreamBindings,
    screenStatus: unresolvedSupportCount === 0 ? 'SCREEN_COMPLETE' : 'SCREEN_HAS_UNRESOLVED',
    summary: {
      loadCaseCount: caseScreens.length,
      supportScreenCount,
      contactRetainedCandidateCount: caseScreens.reduce((total, row) => (
        total + row.summary.contactRetainedCandidateCount
      ), 0),
      liftoffCandidateCount: caseScreens.reduce((total, row) => (
        total + row.summary.liftoffCandidateCount
      ), 0),
      unresolvedGateCount: unresolvedSupportCount,
    },
    caseScreens,
  };
  return requireEmpiricalThermalLiftoffLocalScreenResult({
    ...draft,
    semanticHash: semanticHash(draft),
  });
}

export function requireEmpiricalThermalLiftoffLocalScreenResult(value) {
  exactKeys(value, RESULT_KEYS, 'thermal lift-off local-screen result');
  if (value.schema !== THERMAL_LIFTOFF_LOCAL_SCREEN_RESULT_SCHEMA
    || value.method !== THERMAL_LIFTOFF_METHOD_ID
    || value.stage !== 'TL03_LOCAL_SCREEN_ONLY'
    || value.finality !== 'NON_FINAL_NO_REDISTRIBUTION') {
    throw codedError('Unexpected TL-03 local-screen result identity.', 'THERMAL_LIFTOFF_SCREEN_RESULT_INVALID');
  }
  if (value.authoritySemanticHash !== THERMAL_LIFTOFF_AUTHORITY.semanticHash) {
    throw codedError('TL-03 authority binding differs from the frozen TL-00 authority.', 'THERMAL_LIFTOFF_SCREEN_AUTHORITY_MISMATCH');
  }
  if (![null, 'CHAINAGE_TRIBUTARY_SPAN_V2', 'CHAINAGE_TRIBUTARY_SPAN_V3_COG'].includes(value.coldGravityMethod)) {
    throw codedError('TL-03 cold-gravity method is unsupported.', 'THERMAL_LIFTOFF_COLD_GRAVITY_METHOD_INVALID');
  }
  const reactionToleranceN = value.reactionToleranceN === null
    ? null
    : nonnegative(value.reactionToleranceN, 'reactionToleranceN');
  requireUpstreamBindings(value.upstreamBindings);
  if (!Array.isArray(value.caseScreens) || value.caseScreens.length === 0) {
    throw new TypeError('TL-03 caseScreens must be a non-empty array.');
  }
  const caseScreens = value.caseScreens.map((row) => requireCaseScreen(row, reactionToleranceN));
  const expectedSummary = summarizeCases(caseScreens);
  if (semanticHash(expectedSummary) !== semanticHash(value.summary)) {
    throw codedError('TL-03 result summary is stale.', 'THERMAL_LIFTOFF_SCREEN_SUMMARY_MISMATCH');
  }
  const expectedStatus = expectedSummary.unresolvedGateCount === 0
    ? 'SCREEN_COMPLETE'
    : 'SCREEN_HAS_UNRESOLVED';
  if (value.screenStatus !== expectedStatus) {
    throw codedError('TL-03 screen status differs from its support classifications.', 'THERMAL_LIFTOFF_SCREEN_STATUS_MISMATCH');
  }
  const { semanticHash: actual, ...payload } = value;
  if (actual !== semanticHash(payload)) {
    throw codedError('TL-03 local-screen semantic hash mismatch.', 'THERMAL_LIFTOFF_SCREEN_HASH_MISMATCH');
  }
  return deepFreeze(structuredClone(value));
}

export function assessEmpiricalThermalLiftoffScreenStaleness(result, currentRequest) {
  const screen = requireEmpiricalThermalLiftoffLocalScreenResult(result);
  const current = requireLocalScreenRequest(currentRequest);
  const changes = Object.keys(screen.upstreamBindings).flatMap((field) => (
    screen.upstreamBindings[field] === current.upstreamBindings[field]
      ? []
      : [{ field, expected: screen.upstreamBindings[field], actual: current.upstreamBindings[field] }]
  ));
  return deepFreeze({ stale: changes.length > 0, changes });
}

function requireLocalScreenRequest(value) {
  exactKeys(value, REQUEST_KEYS, 'thermal lift-off local-screen request');
  if (value.schema !== THERMAL_LIFTOFF_LOCAL_SCREEN_REQUEST_SCHEMA) {
    throw codedError('Unexpected TL-03 local-screen request schema.', 'THERMAL_LIFTOFF_SCREEN_REQUEST_SCHEMA_INVALID');
  }
  const coldGravity = requireCurrentAuthorizedColdGravityExecution(value.coldGravityExecution);
  const supportContactAuthorities = requireUniqueBy(
    value.supportContactAuthorities,
    requireThermalLiftoffSupportContactAuthority,
    (row) => row.supportSiteId,
    'support contact authority',
  );
  const displacements = requireUniqueBy(
    value.displacements,
    requireThermalLiftoffUsedDisplacement,
    (row) => `${row.loadCaseId}|${row.supportSiteId}`,
    'used displacement',
  );
  const stiffnessRegistry = requireThermalLiftoffStiffnessRegistry(value.stiffnessRegistry);
  const applicabilityBindings = requireApplicabilityRows(value.applicabilityBindings);
  const reactionToleranceAuthority = value.reactionToleranceAuthority === null
    ? null
    : requireThermalLiftoffReactionToleranceAuthority(value.reactionToleranceAuthority);
  const upstreamBindings = deepFreeze({
    coldGravityExecutionSemanticHash: requiredHash(
      coldGravity.execution.semanticHash,
      'coldGravityExecution.semanticHash',
    ),
    stiffnessRegistrySemanticHash: stiffnessRegistry.semanticHash,
    displacementSetSemanticHash: semanticHash([...displacements.values()].map((row) => row.semanticHash).sort()),
    supportContactAuthoritySetSemanticHash: semanticHash(
      [...supportContactAuthorities.values()].map((row) => row.semanticHash).sort(),
    ),
    applicabilityBindingSetSemanticHash: semanticHash(
      [...applicabilityBindings.values()].map((row) => row.semanticHash).sort(),
    ),
    reactionToleranceAuthoritySemanticHash: reactionToleranceAuthority?.semanticHash ?? null,
  });
  return deepFreeze({
    executionId: requiredString(value.executionId, 'executionId'),
    executedAt: timestamp(value.executedAt, 'executedAt'),
    coldGravity,
    supportContactAuthorities,
    displacements,
    stiffnessRegistry,
    applicabilityBindings,
    reactionToleranceAuthority,
    upstreamBindings,
  });
}

function buildCaseScreen(loadCase, context) {
  if (loadCase.status !== 'CALCULATED') {
    throw codedError('TL-03 cannot consume a blocked cold-gravity load case.', 'THERMAL_LIFTOFF_COLD_GRAVITY_CASE_BLOCKED');
  }
  const supportScreens = loadCase.supportResults.map((coldRow) => (
    buildSupportScreen(loadCase.loadCaseId, coldRow, context)
  )).sort((left, right) => left.supportSiteId.localeCompare(right.supportSiteId));
  const summary = summarizeSupports(supportScreens);
  const draft = {
    loadCaseId: requiredString(loadCase.loadCaseId, 'coldGravity.loadCaseId'),
    screenStatus: summary.unresolvedGateCount === 0 ? 'SCREEN_COMPLETE' : 'SCREEN_HAS_UNRESOLVED',
    summary,
    supportScreens,
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

function buildSupportScreen(loadCaseId, coldRow, context) {
  const supportSiteId = requiredString(coldRow.supportSiteId, 'cold supportSiteId');
  if (coldRow.status !== 'CALCULATED' || !Number.isFinite(coldRow.verticalForceN)) {
    throw codedError(
      `Cold-gravity support ${supportSiteId} is not a current calculated reaction.`,
      'THERMAL_LIFTOFF_COLD_GRAVITY_SUPPORT_INVALID',
    );
  }
  const blockers = [];
  const contact = context.supportContactAuthorities.get(supportSiteId) || null;
  if (!contact) {
    blockers.push(blocker(
      THERMAL_LIFTOFF_BLOCKER_CODES.SUPPORT_CONTACT_AUTHORITY_MISSING,
      supportSiteId,
      'No qualified support-contact authority exists for this support site.',
    ));
  } else if (contact.qualification !== 'QUALIFIED') {
    blockers.push(...contact.blockers);
  }

  const displacement = context.displacements.get(`${loadCaseId}|${supportSiteId}`) || null;
  if (!displacement) {
    blockers.push(blocker(
      THERMAL_LIFTOFF_BLOCKER_CODES.DISPLACEMENT_AUTHORITY_MISSING,
      supportSiteId,
      `No TL-03-eligible displacement exists for ${loadCaseId}.`,
    ));
  } else if (displacement.qualification !== 'QUALIFIED') {
    blockers.push(...displacement.blockers);
  }

  const applicability = context.applicabilityBindings.get(supportSiteId) || null;
  let stiffnessResolution = null;
  if (!applicability) {
    blockers.push(blocker(
      THERMAL_LIFTOFF_BLOCKER_CODES.STIFFNESS_APPLICABILITY_MISMATCH,
      supportSiteId,
      'No current applicability binding exists for TL-02 stiffness selection.',
    ));
  } else {
    stiffnessResolution = resolveThermalLiftoffLocalStiffness({
      registry: context.stiffnessRegistry,
      supportSiteId,
      applicability,
    });
    blockers.push(...stiffnessResolution.blockers);
  }

  if (!context.reactionToleranceAuthority) {
    blockers.push(blocker(
      THERMAL_LIFTOFF_BLOCKER_CODES.REACTION_TOLERANCE_AUTHORITY_MISSING,
      supportSiteId,
      'TL-03 classification requires an explicitly qualified reaction tolerance; no default is permitted.',
    ));
  }

  const unresolved = blockers.length > 0;
  const stiffnessEntry = stiffnessResolution?.status === 'QUALIFIED'
    ? stiffnessResolution.entry
    : null;
  const coldGravityReactionN = coldRow.verticalForceN;
  const usedUpwardRelativeDisplacementM = unresolved
    ? null
    : displacement.usedUpwardRelativeDisplacementM;
  const qualifiedEffectiveVerticalStiffnessNPerM = unresolved
    ? null
    : stiffnessEntry.data.effectiveVerticalStiffnessNPerM;
  const localUpliftDemandN = unresolved
    ? null
    : qualifiedEffectiveVerticalStiffnessNPerM * usedUpwardRelativeDisplacementM;
  const localTrialContactReserveN = unresolved
    ? null
    : coldGravityReactionN - localUpliftDemandN;
  const coldGapM = contact?.coldGapM ?? null;
  const screenKinematicOpeningM = unresolved
    ? null
    : coldGapM + usedUpwardRelativeDisplacementM;
  const classification = unresolved
    ? 'UNRESOLVED_GATE'
    : localTrialContactReserveN > context.reactionToleranceAuthority.reactionToleranceN
      ? 'CONTACT_RETAINED_CANDIDATE'
      : 'LIFTOFF_CANDIDATE';
  const draft = {
    supportSiteId,
    classification,
    coldGravityReactionN,
    usedUpwardRelativeDisplacementM,
    qualifiedEffectiveVerticalStiffnessNPerM,
    localUpliftDemandN,
    localTrialContactReserveN,
    coldGapM,
    screenKinematicOpeningM,
    applicabilityClass: applicability?.classId ?? null,
    stiffnessEntrySemanticHash: stiffnessEntry?.semanticHash ?? null,
    displacementSemanticHash: displacement?.semanticHash ?? null,
    displacementSourceSemanticHash: displacement?.source?.sourceSemanticHash ?? null,
    supportContactAuthoritySemanticHash: contact?.semanticHash ?? null,
    applicabilityBindingSemanticHash: applicability?.semanticHash ?? null,
    blockers: uniqueBlockers(blockers),
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

function requireCaseScreen(value, reactionToleranceN) {
  exactKeys(value, CASE_KEYS, 'TL-03 case screen');
  if (!Array.isArray(value.supportScreens) || value.supportScreens.length === 0) {
    throw new TypeError('TL-03 supportScreens must be a non-empty array.');
  }
  const supportScreens = value.supportScreens.map((row) => requireSupportScreen(row, reactionToleranceN));
  const expectedSummary = summarizeSupports(supportScreens);
  if (semanticHash(expectedSummary) !== semanticHash(value.summary)) {
    throw codedError('TL-03 case summary is stale.', 'THERMAL_LIFTOFF_SCREEN_CASE_SUMMARY_MISMATCH');
  }
  const expectedStatus = expectedSummary.unresolvedGateCount === 0
    ? 'SCREEN_COMPLETE'
    : 'SCREEN_HAS_UNRESOLVED';
  if (value.screenStatus !== expectedStatus) {
    throw codedError('TL-03 case screen status mismatch.', 'THERMAL_LIFTOFF_SCREEN_CASE_STATUS_MISMATCH');
  }
  const { semanticHash: actual, ...payload } = value;
  if (actual !== semanticHash(payload)) {
    throw codedError('TL-03 case semantic hash mismatch.', 'THERMAL_LIFTOFF_SCREEN_CASE_HASH_MISMATCH');
  }
  return value;
}

function requireSupportScreen(value, reactionToleranceN) {
  exactKeys(value, SUPPORT_KEYS, 'TL-03 support screen');
  if (!THERMAL_LIFTOFF_CLASSIFICATIONS.includes(value.classification)) {
    throw codedError('Unknown TL-03 support classification.', 'THERMAL_LIFTOFF_SCREEN_CLASSIFICATION_INVALID');
  }
  finite(value.coldGravityReactionN, 'coldGravityReactionN');
  if (!Array.isArray(value.blockers)) throw new TypeError('TL-03 support blockers must be an array.');

  if (value.classification === 'UNRESOLVED_GATE') {
    if (value.blockers.length === 0) {
      throw codedError('UNRESOLVED_GATE requires at least one blocker.', 'THERMAL_LIFTOFF_SCREEN_UNRESOLVED_WITHOUT_BLOCKER');
    }
    for (const field of [
      'usedUpwardRelativeDisplacementM',
      'qualifiedEffectiveVerticalStiffnessNPerM',
      'localUpliftDemandN',
      'localTrialContactReserveN',
      'screenKinematicOpeningM',
    ]) {
      if (value[field] !== null) {
        throw codedError(
          `UNRESOLVED_GATE must not publish partial numerical field ${field}.`,
          'THERMAL_LIFTOFF_SCREEN_UNRESOLVED_PARTIAL_VALUE',
        );
      }
    }
  } else {
    if (reactionToleranceN === null) {
      throw codedError(
        'Candidate classification cannot exist without qualified reaction tolerance.',
        THERMAL_LIFTOFF_BLOCKER_CODES.REACTION_TOLERANCE_AUTHORITY_MISSING,
      );
    }
    if (value.blockers.length !== 0) {
      throw codedError('Candidate classification must not retain ERROR blockers.', 'THERMAL_LIFTOFF_SCREEN_CANDIDATE_BLOCKED');
    }
    const delta = finite(value.usedUpwardRelativeDisplacementM, 'usedUpwardRelativeDisplacementM');
    const stiffness = positive(
      value.qualifiedEffectiveVerticalStiffnessNPerM,
      'qualifiedEffectiveVerticalStiffnessNPerM',
    );
    const expectedUplift = stiffness * delta;
    const expectedTrial = value.coldGravityReactionN - expectedUplift;
    if (value.localUpliftDemandN !== expectedUplift
      || value.localTrialContactReserveN !== expectedTrial
      || value.screenKinematicOpeningM !== value.coldGapM + delta) {
      throw codedError(
        'TL-03 local-screen arithmetic differs from Rtrial = Rcold - k*delta.',
        THERMAL_LIFTOFF_BLOCKER_CODES.ARITHMETIC_MISMATCH,
      );
    }
    const expectedClassification = expectedTrial > reactionToleranceN
      ? 'CONTACT_RETAINED_CANDIDATE'
      : 'LIFTOFF_CANDIDATE';
    if (value.classification !== expectedClassification) {
      throw codedError(
        'TL-03 classification does not match the validated local-screen evidence.',
        THERMAL_LIFTOFF_BLOCKER_CODES.CLASSIFICATION_MISMATCH,
      );
    }
  }
  const { semanticHash: actual, ...payload } = value;
  if (actual !== semanticHash(payload)) {
    throw codedError('TL-03 support semantic hash mismatch.', 'THERMAL_LIFTOFF_SCREEN_SUPPORT_HASH_MISMATCH');
  }
  return value;
}

function requireCurrentAuthorizedColdGravityExecution(value) {
  if (!isPlainRecord(value)) throw new TypeError('coldGravityExecution must be an object.');
  let execution;
  let method;
  if (value.schema === AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_SCHEMA) {
    execution = requireAuthorizedEmpiricalLoadExecution(value);
    method = execution.distribution?.method;
  } else if (value.schema === AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_SCHEMA) {
    execution = requireAuthorizedEmpiricalLoadExecutionV2(value);
    method = execution.executedMethod;
    if (execution.requestedMethod !== execution.executedMethod
      || execution.distribution?.method !== execution.executedMethod) {
      throw codedError('Authorized V2/V3 cold execution method identity mismatch.', 'THERMAL_LIFTOFF_COLD_GRAVITY_METHOD_MISMATCH');
    }
  } else {
    throw codedError('TL-03 requires an authorized empirical gravity execution.', 'THERMAL_LIFTOFF_COLD_GRAVITY_SCHEMA_INVALID');
  }
  if (!['CHAINAGE_TRIBUTARY_SPAN_V2', 'CHAINAGE_TRIBUTARY_SPAN_V3_COG'].includes(method)) {
    throw codedError('TL-03 cold-gravity method is not V2 or V3_COG.', 'THERMAL_LIFTOFF_COLD_GRAVITY_METHOD_INVALID');
  }
  if (execution.status !== 'CALCULATED'
    || execution.distribution?.status !== 'CALCULATED'
    || execution.distribution?.freshness?.status !== 'CURRENT') {
    throw codedError('TL-03 requires a current CALCULATED cold-gravity execution.', 'THERMAL_LIFTOFF_COLD_GRAVITY_NOT_CURRENT');
  }
  if (!Array.isArray(execution.distribution.loadCases)
    || execution.distribution.loadCases.length === 0) {
    throw codedError('TL-03 cold-gravity execution has no load cases.', 'THERMAL_LIFTOFF_COLD_GRAVITY_EMPTY');
  }
  return deepFreeze({ execution, method, distribution: execution.distribution });
}

function requireApplicabilityRows(rows) {
  if (!Array.isArray(rows)) throw new TypeError('applicabilityBindings must be an array.');
  const map = new Map();
  rows.forEach((row) => {
    exactKeys(row, ['supportSiteId', 'applicability'], 'TL-03 applicability row');
    const supportSiteId = requiredString(row.supportSiteId, 'applicability.supportSiteId');
    if (map.has(supportSiteId)) throw new TypeError(`Duplicate applicability binding for ${supportSiteId}.`);
    map.set(supportSiteId, requireThermalLiftoffApplicabilityBinding(row.applicability));
  });
  return map;
}

function requireUniqueBy(rows, validator, keyFn, label) {
  if (!Array.isArray(rows)) throw new TypeError(`${label} rows must be an array.`);
  const map = new Map();
  rows.forEach((row) => {
    const normalized = validator(row);
    const key = keyFn(normalized);
    if (map.has(key)) throw new TypeError(`Duplicate ${label} for ${key}.`);
    map.set(key, normalized);
  });
  return map;
}

function requireUpstreamBindings(value) {
  exactKeys(value, [
    'coldGravityExecutionSemanticHash',
    'stiffnessRegistrySemanticHash',
    'displacementSetSemanticHash',
    'supportContactAuthoritySetSemanticHash',
    'applicabilityBindingSetSemanticHash',
    'reactionToleranceAuthoritySemanticHash',
  ], 'TL-03 upstream bindings');
  requiredHash(value.coldGravityExecutionSemanticHash, 'coldGravityExecutionSemanticHash');
  requiredHash(value.stiffnessRegistrySemanticHash, 'stiffnessRegistrySemanticHash');
  requiredHash(value.displacementSetSemanticHash, 'displacementSetSemanticHash');
  requiredHash(value.supportContactAuthoritySetSemanticHash, 'supportContactAuthoritySetSemanticHash');
  requiredHash(value.applicabilityBindingSetSemanticHash, 'applicabilityBindingSetSemanticHash');
  if (value.reactionToleranceAuthoritySemanticHash !== null) {
    requiredHash(value.reactionToleranceAuthoritySemanticHash, 'reactionToleranceAuthoritySemanticHash');
  }
}

function summarizeSupports(rows) {
  return {
    supportScreenCount: rows.length,
    contactRetainedCandidateCount: rows.filter((row) => row.classification === 'CONTACT_RETAINED_CANDIDATE').length,
    liftoffCandidateCount: rows.filter((row) => row.classification === 'LIFTOFF_CANDIDATE').length,
    unresolvedGateCount: rows.filter((row) => row.classification === 'UNRESOLVED_GATE').length,
  };
}

function summarizeCases(rows) {
  return {
    loadCaseCount: rows.length,
    supportScreenCount: rows.reduce((total, row) => total + row.summary.supportScreenCount, 0),
    contactRetainedCandidateCount: rows.reduce((total, row) => total + row.summary.contactRetainedCandidateCount, 0),
    liftoffCandidateCount: rows.reduce((total, row) => total + row.summary.liftoffCandidateCount, 0),
    unresolvedGateCount: rows.reduce((total, row) => total + row.summary.unresolvedGateCount, 0),
  };
}

function uniqueBlockers(rows) {
  return [...new Map(rows.map((row) => [
    `${row.code}|${row.scope}|${row.message}`,
    row,
  ])).values()].sort((left, right) => (
    `${left.code}|${left.scope}`.localeCompare(`${right.code}|${right.scope}`)
  ));
}

function blocker(code, scope, message) {
  return deepFreeze({ code, severity: 'ERROR', scope, message });
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function requiredString(value, label) {
  const result = stringValue(value);
  if (!result) throw new TypeError(`${label} must be a non-empty string.`);
  return result;
}

function timestamp(value, label) {
  const result = requiredString(value, label);
  if (new Date(result).toISOString() !== result) throw new TypeError(`${label} must be canonical ISO-8601.`);
  return result;
}

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite.`);
  return value;
}

function positive(value, label) {
  const result = finite(value, label);
  if (result <= 0) throw new TypeError(`${label} must be positive.`);
  return result;
}

function nonnegative(value, label) {
  const result = finite(value, label);
  if (result < 0) throw new TypeError(`${label} must be non-negative.`);
  return result;
}

function requiredHash(value, label) {
  if (typeof value !== 'string' || !/^fnv1a64:[0-9a-f]{16}$/u.test(value)) {
    throw new TypeError(`${label} must be an FNV-1a semantic hash.`);
  }
  return value;
}

function codedError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
