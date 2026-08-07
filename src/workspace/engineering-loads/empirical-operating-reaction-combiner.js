import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../core/shared-piping-model/index.js';
import {
  requireEmpiricalCoordinateFrame,
} from './contracts/empirical-sjson-contracts.js';
import {
  requireEmpiricalBeamContactExecutionResult,
} from './empirical-beam-contact-runtime.js';
import {
  requireEmpiricalRestraintNetworkExecutionResult,
} from './empirical-restraint-network-runtime.js';
import {
  requireEmpiricalCoupledRestraintNetworkExecutionResult,
} from './empirical-coupled-restraint-network-runtime.js';
import {
  EMPIRICAL_OPERATING_REACTION_RULE_ID,
  requireEmpiricalOperatingReactionProfile,
} from './empirical-operating-reaction-profile.js';

export const EMPIRICAL_OPERATING_REACTION_EXECUTION_REQUEST_SCHEMA =
  'empirical-operating-reaction-execution-request/v1';
export const EMPIRICAL_OPERATING_REACTION_EXECUTION_RESULT_SCHEMA =
  'empirical-operating-reaction-execution-result/v1';
export const EMPIRICAL_OPERATING_REACTION_METHOD_ID =
  'EMPIRICAL_OPERATING_REACTION_SUPERPOSITION_V1';

const REQUEST_KEYS = Object.freeze([
  'schema',
  'executionId',
  'executedAt',
  'coordinateFrame',
  'verticalExecutionResult',
  'lineStopExecutionResult',
  'combinationProfile',
]);
const RESULT_KEYS = Object.freeze([
  'schema',
  'method',
  'executionId',
  'executedAt',
  'datasetId',
  'verticalExecutionSemanticHash',
  'lineStopExecutionSemanticHash',
  'combinationProfileSemanticHash',
  'status',
  'summary',
  'loadCases',
  'evidence',
  'semanticHash',
]);
const COMMON_BINDING_KEYS = Object.freeze([
  'datasetHash',
  'sharedModelHash',
  'topologyHash',
  'attachmentHash',
  'restraintHash',
]);

export function executeEmpiricalOperatingReactionCombination(value) {
  exactKeys(value, REQUEST_KEYS, 'empirical operating-reaction execution request');
  if (value.schema !== EMPIRICAL_OPERATING_REACTION_EXECUTION_REQUEST_SCHEMA) {
    throw new TypeError('Unsupported empirical operating-reaction execution request schema.');
  }
  const coordinateFrame = requireEmpiricalCoordinateFrame(value.coordinateFrame);
  const profile = requireEmpiricalOperatingReactionProfile(value.combinationProfile);
  const verticalExecution = requireEmpiricalBeamContactExecutionResult(
    value.verticalExecutionResult,
  );
  const lineStopExecution = requireLineStopExecutionResult(value.lineStopExecutionResult);
  assertCompatibleAuthorities({
    coordinateFrame,
    verticalExecution,
    lineStopExecution,
    profile,
  });
  const verticalDirection = coordinateFrame.verticalUnitVector;
  const lineStopDirection = unitVector(
    lineStopExecution.analysisDirection,
    'lineStopExecution.analysisDirection',
  );
  const globalBlockers = profileBlockers(profile);
  const directionCosine = Math.abs(dot(verticalDirection, lineStopDirection));
  if (directionCosine > profile.tolerances.directionOrthogonalityCosine) {
    globalBlockers.push(blocker(
      'EMPIRICAL_OPERATING_DIRECTIONS_NOT_ORTHOGONAL',
      profile.profileId,
      'The qualified operating-reaction rule requires orthogonal vertical and line-stop directions.',
      {
        directionCosine,
        maximumCosine: profile.tolerances.directionOrthogonalityCosine,
      },
    ));
  }
  const verticalCase = findCase(
    verticalExecution,
    profile.ownership.verticalLoadCaseId,
    profile.ownership.verticalResultClass,
  );
  const lineStopCase = findCase(
    lineStopExecution,
    profile.ownership.lineStopLoadCaseId,
    profile.ownership.lineStopResultClass,
  );
  if (!verticalCase) {
    globalBlockers.push(blocker(
      'EMPIRICAL_OPERATING_VERTICAL_CASE_UNAVAILABLE',
      profile.ownership.verticalLoadCaseId,
      'The required calculated W-HOT vertical screening result is unavailable.',
    ));
  }
  if (!lineStopCase) {
    globalBlockers.push(blocker(
      'EMPIRICAL_OPERATING_LINE_STOP_CASE_UNAVAILABLE',
      profile.ownership.lineStopLoadCaseId,
      'The required calculated thermal line-stop screening result is unavailable.',
    ));
  }
  let loadCase;
  if (globalBlockers.length > 0 || !verticalCase || !lineStopCase) {
    loadCase = blockedLoadCase(profile, globalBlockers);
  } else {
    try {
      loadCase = combineLoadCases({
        profile,
        coordinateFrame,
        verticalDirection,
        lineStopDirection,
        verticalCase,
        lineStopCase,
      });
    } catch (error) {
      loadCase = blockedLoadCase(profile, [errorBlocker(error)]);
    }
  }
  const calculated = loadCase.status === 'CALCULATED';
  const draft = {
    schema: EMPIRICAL_OPERATING_REACTION_EXECUTION_RESULT_SCHEMA,
    method: EMPIRICAL_OPERATING_REACTION_METHOD_ID,
    executionId: requiredString(value.executionId, 'executionId'),
    executedAt: timestamp(value.executedAt, 'executedAt'),
    datasetId: verticalExecution.datasetId,
    verticalExecutionSemanticHash: verticalExecution.semanticHash,
    lineStopExecutionSemanticHash: lineStopExecution.semanticHash,
    combinationProfileSemanticHash: profile.semanticHash,
    status: calculated ? 'CALCULATED' : 'BLOCKED',
    summary: {
      loadCaseCount: 1,
      calculatedCaseCount: calculated ? 1 : 0,
      blockedCaseCount: calculated ? 0 : 1,
      supportResultCount: calculated ? loadCase.supportResults.length : 0,
      verticalOnlySiteCount: calculated
        ? loadCase.supportResults.filter((row) => row.componentBreakdown.siteClass === 'VERTICAL_ONLY').length
        : 0,
      lineStopOnlySiteCount: calculated
        ? loadCase.supportResults.filter((row) => row.componentBreakdown.siteClass === 'LINE_STOP_ONLY').length
        : 0,
      overlappingSiteCount: calculated
        ? loadCase.supportResults.filter((row) => row.componentBreakdown.siteClass === 'OVERLAPPING').length
        : 0,
    },
    loadCases: [loadCase],
    evidence: deepFreeze({
      ruleId: EMPIRICAL_OPERATING_REACTION_RULE_ID,
      profileQualification: profile.qualification,
      profileLocked: profile.locked,
      coordinateFrameSemanticHash: coordinateFrame.semanticHash,
      sourceBindings: selectBindings(verticalExecution.evidence.sourceBindings),
      verticalMethod: verticalExecution.method,
      lineStopMethod: lineStopExecution.method,
      verticalExecutionSemanticHash: verticalExecution.semanticHash,
      lineStopExecutionSemanticHash: lineStopExecution.semanticHash,
      combinationAuthority: 'QUALIFIED_COMPONENT_WISE_SUPERPOSITION',
      forceOwnership: {
        vertical: 'VERTICAL_AXIS_ONLY',
        lineStop: 'ONE_ORTHOGONAL_LINE_STOP_AXIS_ONLY',
      },
      momentOwnership: {
        vertical: 'ALL_VERTICAL_MODEL_MOMENTS',
        lineStop: 'NONE',
      },
      pressureCompatibilityIncluded: false,
      pressureStressIncluded: false,
      blindVectorAddition: false,
      inputRuntimeResultsRecalculated: false,
      geometryMutation: false,
    }),
  };
  return requireEmpiricalOperatingReactionExecutionResult({
    ...draft,
    semanticHash: semanticHash(draft),
  });
}

export function requireEmpiricalOperatingReactionExecutionResult(value) {
  exactKeys(value, RESULT_KEYS, 'empirical operating-reaction execution result');
  if (value.schema !== EMPIRICAL_OPERATING_REACTION_EXECUTION_RESULT_SCHEMA) {
    throw new TypeError('Unsupported empirical operating-reaction execution result schema.');
  }
  if (value.method !== EMPIRICAL_OPERATING_REACTION_METHOD_ID) {
    throw new TypeError('Empirical operating-reaction result method mismatch.');
  }
  const { semanticHash: actual, ...payload } = value;
  if (actual !== semanticHash(payload)) {
    throw new TypeError('Empirical operating-reaction execution result semantic hash mismatch.');
  }
  return deepFreeze(structuredClone(value));
}

function combineLoadCases(context) {
  const verticalBySite = indexResults(context.verticalCase.supportResults, 'vertical');
  const lineStopBySite = indexResults(context.lineStopCase.supportResults, 'line-stop');
  const siteIds = [...new Set([
    ...verticalBySite.keys(),
    ...lineStopBySite.keys(),
  ])].sort();
  const supportResults = siteIds.map((supportSiteId) => combineSupportResult({
    ...context,
    supportSiteId,
    verticalResult: verticalBySite.get(supportSiteId) || null,
    lineStopResult: lineStopBySite.get(supportSiteId) || null,
  }));
  const forceSum = supportResults.reduce((sum, row) => add(sum, recordVector(row.globalReaction.forceN)), [0, 0, 0]);
  const momentSum = supportResults.reduce((sum, row) => add(sum, recordVector(row.globalReaction.momentNm)), [0, 0, 0]);
  const ownershipSummary = {
    verticalForceSumN: vectorRecord(supportResults.reduce((sum, row) => (
      add(sum, recordVector(row.componentBreakdown.verticalWeight.forceN))
    ), [0, 0, 0])),
    lineStopForceSumN: vectorRecord(supportResults.reduce((sum, row) => (
      add(sum, recordVector(row.componentBreakdown.thermalLineStop.forceN))
    ), [0, 0, 0])),
    combinedForceSumN: vectorRecord(forceSum),
    combinedMomentSumNm: vectorRecord(momentSum),
    pressureCompatibilityIncluded: false,
    pressureStressIncluded: false,
  };
  const draft = {
    loadCaseId: context.profile.ownership.outputLoadCaseId,
    label: 'Combined operating screening reaction (W-HOT + thermal line-stop; pressure excluded)',
    resultClass: context.profile.ownership.outputResultClass,
    status: 'CALCULATED',
    blockers: [],
    sourceLoadCases: {
      vertical: context.verticalCase.loadCaseId,
      lineStop: context.lineStopCase.loadCaseId,
    },
    combinationPolicy: 'SUPERPOSITION_RULE_QUALIFIED',
    supportResults,
    ownershipSummary,
    formulaTrace: [
      'EMP-OPER-001-VERTICAL-PROJECTION',
      'EMP-OPER-002-LINE-STOP-PROJECTION',
      'EMP-OPER-003-ORTHOGONAL-SUPERPOSITION',
      'EMP-OPER-004-VERTICAL-MOMENT-CUSTODY',
    ],
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

function combineSupportResult(context) {
  const vertical = context.verticalResult;
  const lineStop = context.lineStopResult;
  if (!vertical && !context.profile.domain.allowLineStopOnlySites) {
    throw runtimeError(
      'EMPIRICAL_OPERATING_LINE_STOP_ONLY_SITE_UNQUALIFIED',
      `Support site ${context.supportSiteId} exists only in the line-stop result.`,
    );
  }
  if (!lineStop && !context.profile.domain.allowVerticalOnlySites) {
    throw runtimeError(
      'EMPIRICAL_OPERATING_VERTICAL_ONLY_SITE_UNQUALIFIED',
      `Support site ${context.supportSiteId} exists only in the vertical result.`,
    );
  }
  if (vertical && lineStop) assertSharedCustody(vertical, lineStop, context.supportSiteId);
  [vertical, lineStop].filter(Boolean).forEach((row) => {
    if (row.forceConvention !== context.coordinateFrame.forceOutputConvention) {
      throw runtimeError(
        'EMPIRICAL_OPERATING_FORCE_CONVENTION_MISMATCH',
        `Support site ${context.supportSiteId} has an incompatible force convention.`,
      );
    }
    if (row.momentConvention !== context.coordinateFrame.momentOutputConvention) {
      throw runtimeError(
        'EMPIRICAL_OPERATING_MOMENT_CONVENTION_MISMATCH',
        `Support site ${context.supportSiteId} has an incompatible moment convention.`,
      );
    }
  });
  const verticalInputForce = vertical
    ? recordVector(requireReaction(vertical, 'forceN', context.supportSiteId))
    : [0, 0, 0];
  const verticalScalarN = dot(verticalInputForce, context.verticalDirection);
  const verticalOwnedForce = scale(context.verticalDirection, verticalScalarN);
  const verticalUnownedForce = subtract(verticalInputForce, verticalOwnedForce);
  if (magnitude(verticalUnownedForce) > context.profile.tolerances.unownedForceN) {
    throw runtimeError(
      'EMPIRICAL_OPERATING_VERTICAL_FORCE_OWNERSHIP_VIOLATION',
      `Support site ${context.supportSiteId} has a non-vertical force in the vertical result.`,
      {
        unownedForceN: magnitude(verticalUnownedForce),
        toleranceN: context.profile.tolerances.unownedForceN,
      },
    );
  }
  const lineStopInputForce = lineStop
    ? recordVector(requireReaction(lineStop, 'forceN', context.supportSiteId))
    : [0, 0, 0];
  const lineStopScalarN = dot(lineStopInputForce, context.lineStopDirection);
  const lineStopOwnedForce = scale(context.lineStopDirection, lineStopScalarN);
  const lineStopUnownedForce = subtract(lineStopInputForce, lineStopOwnedForce);
  if (magnitude(lineStopUnownedForce) > context.profile.tolerances.unownedForceN) {
    throw runtimeError(
      'EMPIRICAL_OPERATING_LINE_STOP_FORCE_OWNERSHIP_VIOLATION',
      `Support site ${context.supportSiteId} has a force outside the line-stop axis.`,
      {
        unownedForceN: magnitude(lineStopUnownedForce),
        toleranceN: context.profile.tolerances.unownedForceN,
      },
    );
  }
  const verticalMoment = vertical
    ? recordVector(requireReaction(vertical, 'momentNm', context.supportSiteId))
    : [0, 0, 0];
  const lineStopMoment = lineStop
    ? recordVector(requireReaction(lineStop, 'momentNm', context.supportSiteId))
    : [0, 0, 0];
  if (magnitude(lineStopMoment) > context.profile.tolerances.unownedMomentNm) {
    throw runtimeError(
      'EMPIRICAL_OPERATING_LINE_STOP_MOMENT_OWNERSHIP_VIOLATION',
      `Support site ${context.supportSiteId} has a nonzero line-stop moment outside the qualified rule.`,
      {
        unownedMomentNm: magnitude(lineStopMoment),
        toleranceNm: context.profile.tolerances.unownedMomentNm,
      },
    );
  }
  const combinedForce = add(verticalOwnedForce, lineStopOwnedForce);
  const combinedMoment = verticalMoment;
  const basisSource = compatibleAnchorBasis(vertical, lineStop, context.supportSiteId);
  const sourceSupportIds = unionStrings(
    vertical?.sourceSupportIds,
    lineStop?.sourceSupportIds,
  );
  const sourceEntityIds = unionStrings(
    vertical?.sourceEntityIds,
    lineStop?.sourceEntityIds,
  );
  const restraintId = vertical?.restraintId || lineStop.restraintId;
  const hostEntityId = vertical?.hostEntityId || lineStop.hostEntityId;
  const siteClass = vertical && lineStop
    ? 'OVERLAPPING'
    : vertical ? 'VERTICAL_ONLY' : 'LINE_STOP_ONLY';
  return deepFreeze({
    supportSiteId: context.supportSiteId,
    restraintId,
    sourceRestraintIds: unionStrings(
      vertical ? [vertical.restraintId] : [],
      lineStop ? [lineStop.restraintId] : [],
    ),
    sourceSupportIds,
    sourceEntityIds,
    hostEntityId,
    nodeId: vertical?.nodeId || lineStop?.nodeId || null,
    contactState: vertical?.contactState || lineStop?.contactState || 'ACTIVE',
    activeFace: vertical?.activeFace || lineStop?.activeFace || null,
    trialTensileReactionN: finiteOrNull(vertical?.trialTensileReactionN),
    forceConvention: context.coordinateFrame.forceOutputConvention,
    momentConvention: context.coordinateFrame.momentOutputConvention,
    globalReaction: {
      forceN: vectorRecord(combinedForce),
      momentNm: vectorRecord(combinedMoment),
    },
    anchorDecomposition: basisSource
      ? decomposeAnchor(combinedForce, basisSource)
      : null,
    componentBreakdown: {
      siteClass,
      verticalWeight: {
        sourceLoadCaseId: context.verticalCase.loadCaseId,
        sourceRestraintId: vertical?.restraintId || null,
        scalarComponentN: verticalScalarN,
        direction: context.verticalDirection,
        forceN: vectorRecord(verticalOwnedForce),
        momentNm: vectorRecord(verticalMoment),
        excludedForceN: vectorRecord(verticalUnownedForce),
      },
      thermalLineStop: {
        sourceLoadCaseId: context.lineStopCase.loadCaseId,
        sourceRestraintId: lineStop?.restraintId || null,
        scalarComponentN: lineStopScalarN,
        direction: context.lineStopDirection,
        forceN: vectorRecord(lineStopOwnedForce),
        momentNm: { x: 0, y: 0, z: 0 },
        excludedForceN: vectorRecord(lineStopUnownedForce),
        excludedMomentNm: vectorRecord(lineStopMoment),
      },
      combined: {
        forceN: vectorRecord(combinedForce),
        momentNm: vectorRecord(combinedMoment),
      },
      pressureCompatibility: 'EXCLUDED',
      pressureStress: 'EXCLUDED',
    },
    overrideIds: unionStrings(
      vertical?.overrideId ? [vertical.overrideId] : [],
      lineStop?.overrideId ? [lineStop.overrideId] : [],
    ),
    geometryChanged: false,
    pressureEffectsIncluded: false,
    occurrenceIdentity: `COMBINED:${semanticHash({
      supportSiteId: context.supportSiteId,
      verticalRestraintId: vertical?.restraintId || null,
      lineStopRestraintId: lineStop?.restraintId || null,
    }).split(':')[1]}`,
  });
}

function assertCompatibleAuthorities(context) {
  if (context.verticalExecution.datasetId !== context.lineStopExecution.datasetId) {
    throw new TypeError('Operating-reaction inputs do not share one datasetId.');
  }
  if (context.profile.domain.requireSameCoordinateFrame
    && (context.verticalExecution.evidence.coordinateFrameSemanticHash
      !== context.coordinateFrame.semanticHash
      || context.lineStopExecution.evidence.coordinateFrameSemanticHash
        !== context.coordinateFrame.semanticHash)) {
    throw new TypeError('Operating-reaction input coordinate-frame binding is stale.');
  }
  const verticalBindings = selectBindings(context.verticalExecution.evidence.sourceBindings);
  const lineStopBindings = selectBindings(context.lineStopExecution.evidence.sourceBindings);
  if (context.profile.domain.requireSameSourceBindings
    && JSON.stringify(verticalBindings) !== JSON.stringify(lineStopBindings)) {
    throw new TypeError('Operating-reaction inputs do not share common source bindings.');
  }
}

function requireLineStopExecutionResult(value) {
  if (!isPlainRecord(value)) {
    throw new TypeError('lineStopExecutionResult must be an object.');
  }
  if (value.schema === 'empirical-restraint-network-execution-result/v1') {
    return requireEmpiricalRestraintNetworkExecutionResult(value);
  }
  if (value.schema === 'empirical-coupled-restraint-network-execution-result/v1') {
    return requireEmpiricalCoupledRestraintNetworkExecutionResult(value);
  }
  throw new TypeError('Unsupported empirical line-stop execution-result schema.');
}

function findCase(execution, loadCaseId, resultClass) {
  if (execution.status !== 'CALCULATED') return null;
  const row = execution.loadCases.find((candidate) => (
    candidate.loadCaseId === loadCaseId
      && candidate.resultClass === resultClass
      && candidate.status === 'CALCULATED'
  ));
  return row || null;
}

function profileBlockers(profile) {
  return profile.qualification === 'QUALIFIED' && profile.locked === true
    ? []
    : [blocker(
      'EMPIRICAL_OPERATING_PROFILE_UNQUALIFIED',
      profile.profileId,
      'A qualified locked operating-reaction profile is required.',
    )];
}

function blockedLoadCase(profile, blockers) {
  const normalized = uniqueBlockers(blockers);
  const draft = {
    loadCaseId: profile.ownership.outputLoadCaseId,
    label: 'Combined operating screening reaction',
    resultClass: profile.ownership.outputResultClass,
    status: 'BLOCKED',
    blockers: normalized,
    sourceLoadCases: {
      vertical: profile.ownership.verticalLoadCaseId,
      lineStop: profile.ownership.lineStopLoadCaseId,
    },
    combinationPolicy: 'SUPERPOSITION_RULE_QUALIFIED',
    supportResults: [],
    ownershipSummary: null,
    formulaTrace: [],
  };
  return deepFreeze({ ...draft, semanticHash: semanticHash(draft) });
}

function indexResults(rows, label) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const supportSiteId = requiredString(row.supportSiteId, `${label}.supportSiteId`);
    if (map.has(supportSiteId)) {
      throw runtimeError(
        'EMPIRICAL_OPERATING_DUPLICATE_SUPPORT_SITE',
        `The ${label} result contains duplicate support site ${supportSiteId}.`,
      );
    }
    map.set(supportSiteId, row);
  });
  return map;
}

function assertSharedCustody(vertical, lineStop, supportSiteId) {
  const checks = [
    ['hostEntityId', vertical.hostEntityId, lineStop.hostEntityId],
    ['sourceSupportIds', sortedStrings(vertical.sourceSupportIds), sortedStrings(lineStop.sourceSupportIds)],
    ['sourceEntityIds', sortedStrings(vertical.sourceEntityIds), sortedStrings(lineStop.sourceEntityIds)],
  ];
  checks.forEach(([field, left, right]) => {
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      throw runtimeError(
        'EMPIRICAL_OPERATING_SUPPORT_CUSTODY_MISMATCH',
        `Support site ${supportSiteId} has conflicting ${field} custody.`,
        { field, vertical: left, lineStop: right },
      );
    }
  });
}

function compatibleAnchorBasis(vertical, lineStop, supportSiteId) {
  const candidates = [vertical?.anchorDecomposition, lineStop?.anchorDecomposition]
    .filter((row) => row?.basis && Array.isArray(row.labels));
  if (candidates.length === 0) return null;
  const first = candidates[0];
  if (candidates.length > 1) {
    const firstHash = semanticHash({ labels: first.labels, basis: first.basis });
    const secondHash = semanticHash({ labels: candidates[1].labels, basis: candidates[1].basis });
    if (firstHash !== secondHash) {
      throw runtimeError(
        'EMPIRICAL_OPERATING_ANCHOR_BASIS_MISMATCH',
        `Support site ${supportSiteId} has conflicting anchor decomposition bases.`,
      );
    }
  }
  return first;
}

function decomposeAnchor(force, decomposition) {
  const basis = decomposition.basis;
  const vectors = [basis.lineStop, basis.transverse1, basis.transverse2]
    .map((row, index) => unitVector(row, `anchorBasis.${index}`));
  return deepFreeze({
    labels: [...decomposition.labels],
    componentsN: Object.fromEntries(decomposition.labels.map((label, index) => [
      label,
      dot(force, vectors[index]),
    ])),
    basis: structuredClone(basis),
  });
}

function requireReaction(result, field, supportSiteId) {
  const value = result.globalReaction?.[field];
  if (!isPlainRecord(value) || ![value.x, value.y, value.z].every(Number.isFinite)) {
    throw runtimeError(
      'EMPIRICAL_OPERATING_REACTION_INVALID',
      `Support site ${supportSiteId} has no finite ${field}.`,
    );
  }
  return value;
}

function selectBindings(value) {
  if (!isPlainRecord(value)) throw new TypeError('Execution source bindings are unavailable.');
  return Object.fromEntries(COMMON_BINDING_KEYS.map((key) => [
    key,
    requiredString(value[key], `sourceBindings.${key}`),
  ]));
}

function errorBlocker(error) {
  return blocker(
    error?.code || 'EMPIRICAL_OPERATING_OUTSIDE_QUALIFIED_SCOPE',
    error?.details?.scope || 'combination',
    error instanceof Error ? error.message : String(error),
    error?.details || null,
  );
}

function blocker(code, scope, message, details = null) {
  return deepFreeze({
    code,
    severity: 'ERROR',
    scope: String(scope || 'combination'),
    message,
    details,
  });
}

function uniqueBlockers(rows) {
  return [...new Map(rows.map((row) => [
    `${row.code}|${row.scope}|${row.message}`,
    row,
  ])).values()].sort((left, right) => (
    `${left.severity}|${left.code}|${left.scope}`
      .localeCompare(`${right.severity}|${right.code}|${right.scope}`)
  ));
}

function runtimeError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function exactKeys(value, keys, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains unexpected or missing keys.`);
  }
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}

function timestamp(value, field) {
  const normalized = requiredString(value, field);
  if (!Number.isFinite(Date.parse(normalized))) throw new TypeError(`${field} must be an ISO timestamp.`);
  return normalized;
}

function unitVector(value, field) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    throw new TypeError(`${field} must contain three finite numbers.`);
  }
  const length = magnitude(value);
  if (Math.abs(length - 1) > 1e-8) throw new TypeError(`${field} must be a unit vector.`);
  return deepFreeze(value.map((item) => Object.is(item, -0) ? 0 : item));
}

function recordVector(value) {
  return [value.x, value.y, value.z];
}

function vectorRecord(value) {
  return deepFreeze({ x: value[0], y: value[1], z: value[2] });
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function sortedStrings(value) {
  return [...new Set((value || []).map((row) => String(row)))].sort();
}

function unionStrings(...values) {
  return [...new Set(values.flatMap((value) => value || []).map((row) => String(row)))].sort();
}

function add(a, b) {
  return a.map((item, index) => item + b[index]);
}

function subtract(a, b) {
  return a.map((item, index) => item - b[index]);
}

function scale(vector, factor) {
  return vector.map((item) => item * factor);
}

function dot(a, b) {
  return a.reduce((sum, item, index) => sum + item * b[index], 0);
}

function magnitude(vector) {
  return Math.hypot(...vector);
}
