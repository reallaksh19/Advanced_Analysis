/** Governed checker suggestion, candidate ghost, and certified acceptance boundary. */
import { deepFreeze, semanticHash } from '../../core/shared-piping-model/index.js';
import { checkCanonicalTopology, planSafeAutofix } from './topology-edit-checker.js';
import { createTopologyEditCommandRequest } from './topology-edit-command-contract.js';
import { certifyTopologyEditCommand } from './topology-edit-certification-service.js';
import { acceptTopologyEditCommand } from './topology-edit-journal-service.js';
import { buildTopologyEditGhostPacket } from './topology-edit-render-packet.js';
export const TOPOLOGY_EDIT_FIX_SUGGESTION_SCHEMA = 'TopologyEditFixSuggestion.v1';
export const TOPOLOGY_EDIT_AUTOFIX_PREVIEW_SCHEMA = 'TopologyEditAutofixPreview.v1';
function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function positive(value) {
  const number = finite(value);
  return number !== null && number > 0 ? number : null;
}
function upperText(value) {
  const text = String(value ?? '').trim().toUpperCase();
  return text || null;
}
function exactPoint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const point = { x: finite(value.x), y: finite(value.y), z: finite(value.z) };
  return Object.values(point).every((row) => row !== null) ? point : null;
}

function interpolatePoint(from, to, fraction) {
  return { x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
    z: from.z + (to.z - from.z) * fraction };
}
function legacyTrimPosition(canonical, plan) {
  const fraction = finite(plan?.fraction);
  if (!(fraction > 0 && fraction < 1)) return null;
  const edge = (canonical?.edges ?? []).find((row) => row.id === plan.edgeId);
  const from = (canonical?.nodes ?? []).find((row) => row.id === edge?.fromNodeId)?.position;
  const to = (canonical?.nodes ?? []).find((row) => row.id === edge?.toNodeId)?.position;
  const fromPoint = exactPoint(from); const toPoint = exactPoint(to);
  if (!edge || !fromPoint || !toPoint) return null;
  const endpoint = upperText(plan.endpoint);
  return endpoint === 'FROM'
    ? interpolatePoint(fromPoint, toPoint, fraction)
    : endpoint === 'TO' ? interpolatePoint(toPoint, fromPoint, fraction) : null;
}
export function adaptTopologyEditAutofixPolicy(canonical, policy = {}) {
  const adapted = {
    ...policy,
    bendRadiusAuthorityByNodeId: { ...(policy.bendRadiusAuthorityByNodeId ?? {}) },
    junctionKindByNodeId: { ...(policy.junctionKindByNodeId ?? {}) },
    junctionInferenceAuthorityByNodeId:
      { ...(policy.junctionInferenceAuthorityByNodeId ?? {}) },
    trimPlanByIssueId: { ...(policy.trimPlanByIssueId ?? {}) },
  };
  for (const nodeId of Object.keys(policy.bendRadiusByNodeId ?? {})) {
    adapted.bendRadiusAuthorityByNodeId[nodeId] ??= 'WORKSPACE_SOURCE_RADIUS_EVIDENCE';
  }
  for (const [nodeId, value] of Object.entries(policy.junctionTypeByNodeId ?? {})) {
    adapted.junctionKindByNodeId[nodeId] ??= value;
    adapted.junctionInferenceAuthorityByNodeId[nodeId] ??= 'WORKSPACE_SOURCE_JUNCTION_CLASSIFICATION';
  }
  for (const [issueId, plan] of Object.entries(adapted.trimPlanByIssueId)) {
    if (exactPoint(plan?.position)) continue;
    const position = legacyTrimPosition(canonical, plan);
    if (position) adapted.trimPlanByIssueId[issueId] = {
      edgeId: plan.edgeId, endpoint: plan.endpoint, position,
      compatibilityAdapter: 'SOURCE_FRACTION_TO_EXACT_POSITION_V1',
    };
  }
  return deepFreeze(adapted);
}

function suggestion(issue, commandType, payload, evidence) {
  const material = {
    schema: TOPOLOGY_EDIT_FIX_SUGGESTION_SCHEMA,
    issueId: issue.id,
    issueKind: issue.kind,
    commandType,
    payload,
    confidence: 'EXPLICIT_EVIDENCE',
    risk: 'CANDIDATE_CERTIFICATION_REQUIRED',
    evidence,
  };
  return deepFreeze({ ...material, suggestionHash: semanticHash(material) });
}
function bendSuggestion(issue, policy) {
  const nodeId = issue.nodeIds?.[0];
  const radiusMm = positive(policy.bendRadiusByNodeId?.[nodeId]);
  const angleDeg = finite(policy.bendAngleByNodeId?.[nodeId] ?? issue.angleDeg);
  const radiusAuthority = String(policy.bendRadiusAuthorityByNodeId?.[nodeId] ?? '').trim();
  if (!nodeId || issue.edgeIds?.length !== 2 || radiusMm === null
      || !(angleDeg > 0 && angleDeg < 180) || !radiusAuthority) return null;
  return suggestion(issue, 'ADD_BEND_DEFINITION', {
    nodeId,
    edgeIds: [...issue.edgeIds],
    radiusMm,
    angleDeg,
    radiusAuthority,
  }, {
    radiusSource: 'POLICY_BY_NODE',
    angleSource: policy.bendAngleByNodeId?.[nodeId] === undefined
      ? 'CHECKER_ENGINEERING_ANGLE' : 'POLICY_BY_NODE',
    authoritySource: 'POLICY_BY_NODE',
    nodeId,
  });
}
function junctionSuggestion(issue, policy) {
  const nodeId = issue.nodeIds?.[0];
  const kind = upperText(policy.junctionKindByNodeId?.[nodeId]);
  const inferenceAuthority = String(
    policy.junctionInferenceAuthorityByNodeId?.[nodeId] ?? '',
  ).trim();
  if (!nodeId || issue.edgeIds?.length !== 3
      || !['TEE', 'OLET'].includes(kind) || !inferenceAuthority) return null;
  return suggestion(issue, 'ADD_JUNCTION_DEFINITION', {
    nodeId,
    edgeIds: [...issue.edgeIds],
    kind,
    inferenceAuthority,
  }, {
    kindSource: 'POLICY_BY_NODE',
    authoritySource: 'POLICY_BY_NODE',
    nodeId,
  });
}
function trimSuggestion(issue, policy) {
  const plan = policy.trimPlanByIssueId?.[issue.id];
  if (!plan) return null;
  const endpoint = upperText(plan.endpoint);
  const position = exactPoint(plan.position);
  if (!issue.edgeIds?.includes(plan.edgeId)
      || !['FROM', 'TO'].includes(endpoint) || !position) return null;
  return suggestion(issue, 'TRIM_EDGE', {
    edgeId: plan.edgeId,
    endpoint,
    position,
  }, {
    trimPlanSource: 'POLICY_BY_ISSUE',
    issueId: issue.id,
  });
}
function mergeSuggestion(issue) {
  if (issue.nodeIds?.length !== 2) return null;
  return suggestion(issue, 'MERGE_NODES', {
    sourceNodeId: issue.nodeIds[1],
    targetNodeId: issue.nodeIds[0],
  }, { source: 'SNAP_GAP_EXACT_ENDPOINT_PAIR' });
}
function suggestionFor(issue, policy) {
  if (issue.kind === 'SNAP_GAP') return mergeSuggestion(issue);
  if (['RIGHT_ANGLE_WITHOUT_BEND', 'UNDEFINED_KINK'].includes(issue.kind)) {
    return bendSuggestion(issue, policy);
  }
  if (issue.kind === 'MULTIWAY_WITHOUT_JUNCTION') {
    return junctionSuggestion(issue, policy);
  }
  if (['OVERLAPPING_ELEMENTS', 'PIPE_BACKTRACK'].includes(issue.kind)) {
    return trimSuggestion(issue, policy);
  }
  return null;
}
function commandIdentity(session, row) {
  const digest = semanticHash({
    baseCanonicalHash: session.journal.basis.baseCanonicalHash,
    activeLedgerHash: session.journal.activeLedgerHash,
    sequence: session.journal.history.length,
    issueId: row.issueId,
    commandType: row.commandType,
    payload: row.payload,
  }).split(':').at(-1);
  return `autofix:${session.journal.history.length}:${digest}`;
}
function assertSuggestion(value) {
  if (value?.schema !== TOPOLOGY_EDIT_FIX_SUGGESTION_SCHEMA) {
    throw new TypeError('TopologyEditAutofixController: invalid fix suggestion.');
  }
  const material = { ...value };
  delete material.suggestionHash;
  if (value.suggestionHash !== semanticHash(material)) {
    throw new Error('TopologyEditAutofixController: suggestion hash mismatch.');
  }
  return value;
}
function assertPreview(value) {
  if (value?.schema !== TOPOLOGY_EDIT_AUTOFIX_PREVIEW_SCHEMA) {
    throw new TypeError('TopologyEditAutofixController: invalid autofix preview.');
  }
  const material = { ...value };
  delete material.previewHash;
  delete material.request;
  delete material.certification;
  delete material.ghost;
  if (value.previewHash !== semanticHash(material)) {
    throw new Error('TopologyEditAutofixController: preview hash mismatch.');
  }
  return value;
}
function previewMaterial(session, row, request, certification, ghost, disposition, reasons) {
  return {
    schema: TOPOLOGY_EDIT_AUTOFIX_PREVIEW_SCHEMA,
    issueId: row.issueId,
    suggestionHash: row.suggestionHash,
    requestHash: request.requestHash,
    certificationHash: certification.certificationHash,
    candidateDraftHash: certification.candidate?.candidateDraftHash ?? null,
    ghostHash: ghost?.ghostHash ?? null,
    disposition,
    guardReasons: Object.freeze(reasons),
    sessionVersion: session.journal.sessionVersion,
    priorDraftHash: session.currentTopology().canonicalTopologyHash,
  };
}

export class TopologyEditAutofixController {
  static check(canonical, options) {
    return checkCanonicalTopology(canonical, options);
  }

  static suggestions(canonical, issues = checkCanonicalTopology(canonical), policy = {}) {
    const adaptedPolicy = adaptTopologyEditAutofixPolicy(canonical, policy);
    return Object.freeze(issues.map((issue) => suggestionFor(issue, adaptedPolicy))
      .filter(Boolean).sort((left, right) => left.issueId.localeCompare(right.issueId)));
  }

  static preview(session, suggestionInput) {
    const row = assertSuggestion(suggestionInput);
    session.assertUsable();
    const request = createTopologyEditCommandRequest({
      commandId: commandIdentity(session, row),
      commandType: row.commandType,
      payload: row.payload,
      basis: session.commandBasis(),
    });
    const certification = certifyTopologyEditCommand({
      request,
      canonicalTopology: session.currentTopology(),
      baseCanonicalTopology: session.baseCanonicalTopology,
      authority: request.basis,
      checkerPolicy: session.checkerPolicy ?? undefined,
    });
    const resolved = certification.candidate?.checkerDelta?.resolvedIssues
      ?.some((issue) => issue.id === row.issueId) === true;
    const introduced = certification.candidate?.checkerDelta?.introducedIssues ?? [];
    const guardPass = certification.disposition === 'ACCEPTED'
      && resolved && introduced.length === 0;
    const disposition = certification.disposition === 'ACCEPTED' && !guardPass
      ? 'REJECTED_AUTOFIX_GUARD' : certification.disposition;
    const reasons = certification.disposition === 'ACCEPTED' && !resolved
      ? ['TARGET_ISSUE_NOT_RESOLVED']
      : introduced.map((issue) => `INTRODUCED_${issue.kind}`);
    const ghost = guardPass ? buildTopologyEditGhostPacket(
      session.currentTopology(),
      certification.candidate.canonicalTopology,
      certification.candidate.candidateDraftHash,
    ) : null;
    const material = previewMaterial(
      session, row, request, certification, ghost, disposition, reasons,
    );
    return deepFreeze({
      ...material,
      previewHash: semanticHash(material),
      request,
      certification,
      ghost,
    });
  }

  static accept(session, previewInput) {
    const preview = assertPreview(previewInput);
    session.assertUsable();
    if (preview.disposition !== 'ACCEPTED') {
      throw new Error('TopologyEditAutofixController: rejected preview cannot be accepted.');
    }
    if (preview.sessionVersion !== session.journal.sessionVersion
        || preview.priorDraftHash !== session.currentTopology().canonicalTopologyHash) {
      throw new Error('TopologyEditAutofixController: preview is stale.');
    }
    const transition = acceptTopologyEditCommand({
      journal: session.journal,
      baseCanonicalTopology: session.baseCanonicalTopology,
      request: preview.request,
      checkerPolicy: session.checkerPolicy ?? undefined,
    });
    if (transition.disposition !== 'ACCEPTED') return transition;
    if (transition.certification.certificationHash !== preview.certificationHash
        || transition.certification.candidate.candidateDraftHash !== preview.candidateDraftHash) {
      throw new Error('TopologyEditAutofixController: accepted candidate differs from preview.');
    }
    session.applyTransition(transition);
    return transition;
  }

  static applyAutofix(canonical, issues, options) {
    if (!canonical || !Array.isArray(issues)) {
      throw new TypeError('TopologyEditAutofixController: Invalid canonical topology or issue list.');
    }
    return planSafeAutofix(canonical, issues, options);
  }
}
