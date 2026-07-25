import { deepFreeze } from '../shared-piping-model/index.js';
import { projectionToleranceCanonical } from './attachment-profile.js';
import { projectPointToTarget } from './attachment-geometry.js';
import { assessAttachmentIdentity } from './attachment-identity.js';
import {
  bestTargetsByComponent,
  byKey,
  candidateOrder,
  componentMatches,
  createAttachmentRecord,
  diagnostic,
  diagnosticOrder,
  evidenceValues,
  explicitMultiAttachment,
  handled,
  identityDiagnostic,
  nearlyEqual,
  portMatches,
  portTargets,
  sourceRelatedComponents,
  unhandled,
  uniqueTargets,
} from './attachment-resolution-helpers.js';
import { buildTargetSpatialIndex } from './target-spatial-index.js';
import { ATTACHMENT_EVIDENCE, ATTACHMENT_STATUS } from './constants.js';

export function resolveSupportAttachments(context) {
  const state = resolutionState(context);
  state.projection.supports.forEach((support) => resolveSupport(support, state));
  return deepFreeze({
    attachments: state.attachments.sort(byKey('attachmentId')),
    supportStates: state.supportStates.sort(byKey('supportKey')),
    rejectedCandidates: state.rejectedCandidates.sort(diagnosticOrder),
    identityConflicts: state.identityConflicts.sort(diagnosticOrder),
    diagnostics: state.diagnostics.sort(diagnosticOrder),
  });
}

function resolutionState(context) {
  const geometricTargets = context.targets.targets.filter((target) => (
    target.targetType !== 'COMPONENT_REFERENCE'
  ));
  const tolerance = projectionToleranceCanonical(context.profile);
  return {
    ...context,
    tolerance,
    spatialIndex: tolerance ? buildTargetSpatialIndex(geometricTargets, tolerance) : null,
    attachments: [],
    supportStates: [],
    rejectedCandidates: [],
    identityConflicts: [],
    diagnostics: [],
  };
}

function resolveSupport(support, state) {
  const stages = [
    resolveExplicitPort,
    resolveExplicitComponent,
    resolveSourceRelation,
    resolveGeometric,
  ];
  for (const stage of stages) {
    const resolution = stage(support, state);
    if (resolution.handled) {
      commitResolution(support, resolution, state);
      return;
    }
  }
}

function resolveExplicitPort(support, state) {
  const refs = evidenceValues(support.attachmentEvidence.portReferences);
  if (!refs.length) return unhandled();
  const ports = state.graph.ports.filter((port) => refs.some((ref) => portMatches(port, ref)));
  return explicitResolution(
    support,
    portTargets(ports, state.targets.targets),
    ATTACHMENT_EVIDENCE.EXPLICIT_PORT,
    state,
  );
}

function resolveExplicitComponent(support, state) {
  const refs = [
    ...evidenceValues(support.attachmentEvidence.componentReferences),
    ...evidenceValues(support.attachmentEvidence.supportedEntityReferences),
  ];
  if (!refs.length) return unhandled();
  const targets = state.targets.targets.filter((target) => (
    target.targetType === 'COMPONENT_REFERENCE'
    && refs.some((ref) => componentMatches(target, ref))
  ));
  return explicitResolution(support, targets, ATTACHMENT_EVIDENCE.EXPLICIT_COMPONENT, state);
}

function explicitResolution(support, targets, evidenceType, state) {
  const unique = uniqueTargets(targets);
  if (!unique.length) return handled(ATTACHMENT_STATUS.UNATTACHED, [], [], [
    diagnostic(
      'EXPLICIT_ATTACHMENT_REFERENCE_UNRESOLVED',
      support.supportKey,
      'Explicit support attachment reference did not resolve.',
    ),
  ]);
  if (unique.length > 1 && !explicitMultiAttachment(support)) {
    return handled(
      ATTACHMENT_STATUS.AMBIGUOUS,
      [],
      unique.map((target) => target.targetId),
      [diagnostic(
        'EXPLICIT_ATTACHMENT_AMBIGUOUS',
        support.supportKey,
        'Multiple explicit targets require multi-attachment evidence.',
      )],
    );
  }
  const records = unique.map((target) => createAttachmentRecord(
    support,
    target,
    evidenceType,
    state.tolerance,
    unique,
  ));
  return handled(ATTACHMENT_STATUS.ATTACHED, records);
}

function resolveSourceRelation(support, state) {
  const related = sourceRelatedComponents(support, state.sharedModel, state.targets.targets);
  if (!related.length) return unhandled();
  const compatible = related.filter((target) => isCompatible(support, target, state));
  if (compatible.length === 1) {
    return handled(ATTACHMENT_STATUS.ATTACHED, [
      createAttachmentRecord(
        support,
        compatible[0],
        ATTACHMENT_EVIDENCE.SOURCE_RELATION,
        state.tolerance,
      ),
    ]);
  }
  if (compatible.length > 1) return handled(
    ATTACHMENT_STATUS.AMBIGUOUS,
    [],
    compatible.map((target) => target.targetId),
    [diagnostic(
      'SOURCE_RELATION_AMBIGUOUS',
      support.supportKey,
      'Source parent/path relation identifies multiple components.',
    )],
  );
  return handled(
    ATTACHMENT_STATUS.IDENTITY_CONFLICT,
    [],
    related.map((target) => target.targetId),
  );
}

function resolveGeometric(support, state) {
  if (!state.profile.allowGeometricProjection) return terminalWithoutProjection(support);
  if (state.tolerance === null) return handled(ATTACHMENT_STATUS.UNIT_BLOCKED, [], [], [
    diagnostic(
      'SUPPORT_PROJECTION_UNIT_BLOCKED',
      support.supportKey,
      'Unknown length units block geometric projection.',
    ),
  ]);
  if (!support.positionCanonical) return handled(
    ATTACHMENT_STATUS.INVALID_SUPPORT_POSITION,
    [],
    [],
    [diagnostic(
      'SUPPORT_POSITION_INVALID',
      support.supportKey,
      'Support position is unavailable for geometric projection.',
    )],
  );
  return geometricResolution(support, state);
}

function geometricResolution(support, state) {
  const conflictStart = state.identityConflicts.length;
  const candidates = state.spatialIndex.query(support.positionCanonical).flatMap((target) => {
    const projection = projectPointToTarget(support.positionCanonical, target);
    if (!projection || projection.distanceCanonical > state.tolerance) return [];
    const identity = assessAttachmentIdentity(support.identity, target.identity, false);
    if (identity.blocked) {
      state.identityConflicts.push(identityDiagnostic(support, target, identity));
      return [];
    }
    return [{ target, projection, identity }];
  }).sort(candidateOrder);
  if (!candidates.length && state.identityConflicts.length > conflictStart) {
    return handled(ATTACHMENT_STATUS.IDENTITY_CONFLICT);
  }
  if (!candidates.length) return handled(ATTACHMENT_STATUS.UNATTACHED);
  return selectGeometricCandidate(support, candidates, state);
}

function selectGeometricCandidate(support, candidates, state) {
  const bestByComponent = bestTargetsByComponent(candidates);
  const minimum = bestByComponent[0].projection.distanceCanonical;
  const best = bestByComponent.filter((row) => (
    nearlyEqual(row.projection.distanceCanonical, minimum)
  ));
  if (best.length > 1) return handled(
    ATTACHMENT_STATUS.AMBIGUOUS,
    [],
    bestByComponent.map((row) => row.target.targetId),
    [diagnostic(
      'GEOMETRIC_ATTACHMENT_AMBIGUOUS',
      support.supportKey,
      'Multiple geometric targets are equally qualified.',
    )],
  );
  return handled(ATTACHMENT_STATUS.ATTACHED, [
    createAttachmentRecord(
      support,
      best[0].target,
      ATTACHMENT_EVIDENCE.GEOMETRIC,
      state.tolerance,
      bestByComponent.map((row) => row.target),
    ),
  ]);
}

function isCompatible(support, target, state) {
  const identity = assessAttachmentIdentity(support.identity, target.identity, false);
  if (!identity.blocked) return true;
  state.identityConflicts.push(identityDiagnostic(support, target, identity));
  return false;
}

function terminalWithoutProjection(support) {
  if (!support.position) return handled(
    ATTACHMENT_STATUS.INVALID_SUPPORT_POSITION,
    [],
    [],
    [diagnostic('SUPPORT_POSITION_INVALID', support.supportKey, 'Support position is missing.')],
  );
  return handled(ATTACHMENT_STATUS.UNATTACHED);
}

function commitResolution(support, resolution, state) {
  state.attachments.push(...resolution.attachments);
  state.supportStates.push(deepFreeze({
    supportKey: support.supportKey,
    status: resolution.status,
    attachmentIds: resolution.attachments.map((item) => item.attachmentId).sort(),
    alternativeTargetIds: [...resolution.alternatives].sort(),
    diagnostics: resolution.diagnostics,
  }));
  state.diagnostics.push(...resolution.diagnostics);
}
