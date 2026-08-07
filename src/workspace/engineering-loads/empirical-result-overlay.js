import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../core/shared-piping-model/index.js';

export const EMPIRICAL_RESULT_OVERLAY_SCHEMA = 'empirical-result-overlay/v1';
export const EMPIRICAL_RESULT_OVERLAY_RENDER_STYLE = 'EMPIRICAL_RESULT_FORCE_ARROWS_V1';
export const EMPIRICAL_RESULT_FORCE_ARROW_ROLE = 'EMPIRICAL_RESULT_FORCE_ARROW';

const DEFAULT_DISPLAY_POLICY = Object.freeze({
  minimumArrowLengthMm: 35,
  maximumArrowLengthMm: 220,
  referenceForceN: 10000,
  magnitudeExponent: 0.5,
  zeroForceToleranceN: 1e-9,
});

export function createEmpiricalResultOverlay(input) {
  requireRecord(input, 'empirical result overlay input');
  const snapshot = requireSnapshot(input.snapshot);
  if (snapshot.state !== 'EXECUTED_CURRENT') {
    throw new TypeError('Empirical result overlays require EXECUTED_CURRENT scenario state.');
  }
  const proposal = requireRecord(input.proposal, 'empirical result overlay proposal');
  const execution = requireRecord(input.execution, 'empirical result overlay execution');
  if (snapshot.executionSemanticHash !== execution.semanticHash) {
    throw new TypeError('Empirical result overlay execution binding is stale.');
  }
  if (snapshot.proposalSemanticHash !== proposal.semanticHash) {
    throw new TypeError('Empirical result overlay proposal binding is stale.');
  }
  const policy = requireDisplayPolicy(input.displayPolicy || DEFAULT_DISPLAY_POLICY);
  const occurrences = new Map((proposal.adaptedRequest?.restraintOccurrences || []).map((row) => [
    row.restraintId,
    row,
  ]));
  const loadCases = execution.coreResult?.loadCases || [];
  const calculatedCases = loadCases.filter((row) => row.status === 'CALCULATED');
  const arrows = calculatedCases.flatMap((loadCase) => (
    (loadCase.supportResults || []).flatMap((result) => {
      const occurrence = occurrences.get(result.restraintId);
      if (!occurrence) {
        throw new TypeError(`Result restraint ${result.restraintId} has no proposal occurrence.`);
      }
      return createResultArrow({ loadCase, result, occurrence, policy });
    })
  )).sort(arrowOrder);
  const base = {
    schema: EMPIRICAL_RESULT_OVERLAY_SCHEMA,
    renderStyle: EMPIRICAL_RESULT_OVERLAY_RENDER_STYLE,
    method: execution.method,
    datasetId: proposal.adaptedRequest.datasetId,
    scenarioId: proposal.scenarioId,
    executionId: execution.executionId,
    executedAt: execution.executedAt,
    forceConvention: proposal.adaptedRequest.coordinateFrame.forceOutputConvention,
    momentConvention: proposal.adaptedRequest.coordinateFrame.momentOutputConvention,
    displayPolicy: policy,
    resultClassPolicy: 'SEPARATE_EMPIRICAL_RESULT_FAMILIES',
    geometryMutation: false,
    sourceRestraintProjectionMutation: false,
    arrows,
    summary: {
      loadCaseCount: calculatedCases.length,
      arrowCount: arrows.length,
      activeCount: arrows.filter((row) => row.contactState === 'ACTIVE').length,
      liftedCount: arrows.filter((row) => row.contactState === 'LIFTED').length,
      bilateralCount: arrows.filter((row) => row.contactState === 'BILATERAL').length,
      zeroForceCount: arrows.filter((row) => row.forceMagnitudeN <= policy.zeroForceToleranceN).length,
    },
    sourceBindings: {
      proposalSemanticHash: proposal.semanticHash,
      authorizationSemanticHash: snapshot.authorizationSemanticHash,
      executionSemanticHash: execution.semanticHash,
      adaptedRequestSemanticHash: proposal.adaptedRequest.semanticHash,
      runtimeProfileSemanticHash: proposal.runtimeProfile.semanticHash,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function requireEmpiricalResultOverlay(value) {
  requireRecord(value, 'empirical result overlay');
  if (value.schema !== EMPIRICAL_RESULT_OVERLAY_SCHEMA) {
    throw new TypeError('Unsupported empirical result overlay schema.');
  }
  if (value.renderStyle !== EMPIRICAL_RESULT_OVERLAY_RENDER_STYLE) {
    throw new TypeError('Unsupported empirical result overlay render style.');
  }
  if (value.geometryMutation !== false || value.sourceRestraintProjectionMutation !== false) {
    throw new TypeError('Empirical result overlay must not mutate geometry or source restraints.');
  }
  const { semanticHash: actual, ...payload } = value;
  if (actual !== semanticHash(payload)) {
    throw new TypeError('Empirical result overlay semantic hash mismatch.');
  }
  return deepFreeze(structuredClone(value));
}

function createResultArrow({ loadCase, result, occurrence, policy }) {
  const start = requirePointMm(occurrence.attachmentPointMm, result.restraintId);
  const force = requireForce(result.globalReaction?.forceN, result.restraintId);
  const magnitudeN = Math.hypot(force.x, force.y, force.z);
  const lengthMm = displayLength(magnitudeN, policy);
  const direction = magnitudeN > policy.zeroForceToleranceN
    ? { x: force.x / magnitudeN, y: force.y / magnitudeN, z: force.z / magnitudeN }
    : { x: 0, y: 0, z: 0 };
  const end = {
    x: start.x + direction.x * lengthMm,
    y: start.y + direction.y * lengthMm,
    z: start.z + direction.z * lengthMm,
  };
  const identityBase = {
    loadCaseId: loadCase.loadCaseId,
    supportSiteId: result.supportSiteId,
    restraintId: result.restraintId,
    executionId: result.occurrenceIdentity || result.restraintId,
  };
  const overlayId = `empirical-result:${semanticHash(identityBase).split(':')[1]}`;
  return deepFreeze({
    id: overlayId,
    overlayId,
    entityId: result.sourceEntityIds?.[0] || result.hostEntityId || result.restraintId,
    objectKind: 'result',
    renderRole: EMPIRICAL_RESULT_FORCE_ARROW_ROLE,
    resultType: 'FORCE_REACTION',
    method: 'EMPIRICAL_BEAM_CONTACT_V1',
    loadCaseId: loadCase.loadCaseId,
    resultClass: loadCase.resultClass,
    supportSiteId: result.supportSiteId,
    restraintId: result.restraintId,
    sourceSupportIds: [...(result.sourceSupportIds || [])],
    sourceEntityIds: [...(result.sourceEntityIds || [])],
    hostEntityId: result.hostEntityId,
    nodeId: result.nodeId,
    start,
    end,
    direction,
    displayLengthMm: lengthMm,
    forceN: force,
    forceMagnitudeN: magnitudeN,
    momentNm: requireMoment(result.globalReaction?.momentNm),
    contactState: requiredString(result.contactState, 'contactState'),
    activeFace: result.contactState === 'ACTIVE' ? 'Y_PLUS' : null,
    trialTensileReactionN: finiteOrNull(result.trialTensileReactionN),
    anchorDecomposition: result.anchorDecomposition || null,
    overrideId: result.overrideId || null,
    geometryChanged: false,
    sourceRestraintArrowChanged: false,
    pickTarget: {
      modelRole: 'result',
      objectKind: 'result',
      objectId: overlayId,
      nodeId: '',
      supportId: result.supportSiteId,
      restraintId: result.restraintId,
      workspaceEntityIds: [...(result.sourceEntityIds || [])],
    },
    pickIdentity: {
      objectKind: 'result',
      objectId: overlayId,
      entityId: result.sourceEntityIds?.[0] || result.hostEntityId || result.restraintId,
      supportSiteId: result.supportSiteId,
      restraintId: result.restraintId,
      loadCaseId: loadCase.loadCaseId,
    },
  });
}

function displayLength(magnitudeN, policy) {
  if (magnitudeN <= policy.zeroForceToleranceN) return 0;
  const normalized = Math.pow(
    Math.min(1, magnitudeN / policy.referenceForceN),
    policy.magnitudeExponent,
  );
  return policy.minimumArrowLengthMm
    + normalized * (policy.maximumArrowLengthMm - policy.minimumArrowLengthMm);
}

function requireDisplayPolicy(value) {
  requireRecord(value, 'empirical result display policy');
  const policy = {
    minimumArrowLengthMm: positive(value.minimumArrowLengthMm, 'minimumArrowLengthMm'),
    maximumArrowLengthMm: positive(value.maximumArrowLengthMm, 'maximumArrowLengthMm'),
    referenceForceN: positive(value.referenceForceN, 'referenceForceN'),
    magnitudeExponent: positive(value.magnitudeExponent, 'magnitudeExponent'),
    zeroForceToleranceN: nonnegative(value.zeroForceToleranceN, 'zeroForceToleranceN'),
  };
  if (policy.maximumArrowLengthMm < policy.minimumArrowLengthMm) {
    throw new TypeError('maximumArrowLengthMm must not be below minimumArrowLengthMm.');
  }
  return deepFreeze(policy);
}

function requireSnapshot(value) {
  requireRecord(value, 'empirical result overlay snapshot');
  return value;
}

function requirePointMm(value, restraintId) {
  if (!isPlainRecord(value) || ![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new TypeError(`Restraint ${restraintId} has no finite attachment point.`);
  }
  return deepFreeze({ x: value.x, y: value.y, z: value.z });
}

function requireForce(value, restraintId) {
  if (!isPlainRecord(value) || ![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new TypeError(`Result ${restraintId} has no finite global force.`);
  }
  return deepFreeze({ x: value.x, y: value.y, z: value.z });
}

function requireMoment(value) {
  if (!isPlainRecord(value) || ![value.x, value.y, value.z].every(Number.isFinite)) {
    return deepFreeze({ x: 0, y: 0, z: 0 });
  }
  return deepFreeze({ x: value.x, y: value.y, z: value.z });
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

function positive(value, field) {
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${field} must be positive.`);
  return value;
}

function nonnegative(value, field) {
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${field} must be non-negative.`);
  return value;
}

function requiredString(value, field) {
  const normalized = stringValue(value);
  if (!normalized) throw new TypeError(`${field} must be a non-empty string.`);
  return normalized;
}

function requireRecord(value, label) {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain object.`);
  return value;
}

function arrowOrder(left, right) {
  return `${left.loadCaseId}|${left.supportSiteId}|${left.restraintId}`
    .localeCompare(`${right.loadCaseId}|${right.supportSiteId}|${right.restraintId}`);
}
