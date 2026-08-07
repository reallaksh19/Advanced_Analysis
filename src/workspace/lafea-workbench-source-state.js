/**
 * Source-authority state owned by the canonical workbench orchestrator.
 *
 * This module owns only source authority/event memory and typed source-transition
 * derivation. It has no listeners and publishes nothing.
 */
import { lafeaDocumentDigest } from './lafea-edit-command.js';
import {
  createLafeaSourceAuthorityEvent,
  issueLafeaSourceAuthority,
} from './lafea-source-authority.js';
import { lafeaStageInputDescriptors } from './lafea-stage-input-descriptors.js';

const SOURCE_CHANGE_CLASSES = new Set([
  'MATERIAL_PROPERTY', 'GEOMETRY', 'LOAD_OR_BC', 'MODEL_METADATA',
]);

export function createLafeaWorkbenchSourceState(stageIds, hostValue) {
  const host = requireHost(hostValue);
  const sourceByStage = Object.fromEntries(stageIds.map((stageId) => [stageId, null]));
  const eventByStage = Object.fromEntries(stageIds.map((stageId) => [stageId, null]));
  const transitionClasses = Object.fromEntries(
    stageIds.map((stageId) => [stageId, new Map()]),
  );

  function fields(stageId) {
    requireStage(stageId);
    return freeze({
      sourceAuthority: sourceByStage[stageId],
      lastSourceAuthorityEvent: eventByStage[stageId],
    });
  }

  function clear(stageId) {
    requireStage(stageId);
    sourceByStage[stageId] = null;
    eventByStage[stageId] = null;
  }

  function afterLifecycleEvent(event, succeeded = true) {
    if (!succeeded || !SOURCE_CHANGE_CLASSES.has(event?.changeClass)) return;
    clear(host.getActiveStageId());
  }

  function reconcileDocumentMutation(beforeState, originRef, explicitClass = null) {
    const afterState = host.getRetainedState();
    for (const stageId of stageIds) {
      const previousDocument = beforeState.stages[stageId]?.document ?? null;
      const currentDocument = afterState.stages[stageId]?.document ?? null;
      const previousDigest = digest(previousDocument);
      const currentDigest = digest(currentDocument);
      if (previousDigest === currentDigest || !currentDocument) continue;
      if (!previousDocument) {
        clear(stageId);
        continue;
      }

      let previousAuthority = sourceByStage[stageId];
      const currentLifecycle = afterState.stages[stageId].lifecycle;
      if (!previousAuthority || !currentLifecycle) {
        previousAuthority = issueLafeaSourceAuthority(
          stageId, previousDocument, `${originRef}/PREVIOUS_SOURCE`,
        );
        host.invokeRetained('initializeLifecycle', [
          previousAuthority.sourceHash,
          `${originRef}/PREVIOUS_SOURCE`,
        ]);
      }

      const currentAuthority = issueLafeaSourceAuthority(
        stageId, currentDocument, originRef,
      );
      if (currentAuthority.sourceHash === previousAuthority.sourceHash) {
        sourceByStage[stageId] = currentAuthority;
        continue;
      }

      const changeClass = resolveChangeClass(
        stageId,
        previousDigest,
        currentDigest,
        host.getRetainedState().stages[stageId],
        explicitClass,
      );
      rememberTransition(stageId, previousDigest, currentDigest, changeClass);
      const event = createLafeaSourceAuthorityEvent(
        previousAuthority, currentAuthority, changeClass, originRef,
      );
      host.invokeRetained('applyLifecycleEvent', [event.lifecycleEvent]);
      sourceByStage[stageId] = currentAuthority;
      eventByStage[stageId] = event;
    }
  }

  function ensureRunAuthority(stageId, originRef) {
    requireStage(stageId);
    const stage = host.getRetainedState().stages[stageId];
    let authority = sourceByStage[stageId];
    if (authority && stage.lifecycle) return authority;
    authority = issueLafeaSourceAuthority(stageId, stage.document, originRef);
    host.invokeRetained('initializeLifecycle', [authority.sourceHash, originRef]);
    sourceByStage[stageId] = authority;
    return authority;
  }

  function resolveChangeClass(stageId, beforeDigest, afterDigest, stage, explicitClass) {
    if (SOURCE_CHANGE_CLASSES.has(explicitClass)) return explicitClass;
    const descriptorClass = changeClassFromDescriptorDigest(
      stageId,
      stage.lastEditResult?.audit?.descriptorDigest,
    );
    if (SOURCE_CHANGE_CLASSES.has(descriptorClass)) return descriptorClass;
    const remembered = transitionClasses[stageId].get(
      `${beforeDigest}->${afterDigest}`,
    );
    return SOURCE_CHANGE_CLASSES.has(remembered) ? remembered : 'GEOMETRY';
  }

  function changeClassFromDescriptorDigest(stageId, descriptorDigest) {
    if (typeof descriptorDigest !== 'string') return null;
    const descriptor = lafeaStageInputDescriptors(stageId).find(
      (candidate) => lafeaDocumentDigest(candidate) === descriptorDigest,
    );
    return descriptor?.invalidation?.invalidationClass ?? null;
  }

  function rememberTransition(stageId, beforeDigest, afterDigest, changeClass) {
    if (!beforeDigest || !afterDigest) return;
    transitionClasses[stageId].set(`${beforeDigest}->${afterDigest}`, changeClass);
    transitionClasses[stageId].set(`${afterDigest}->${beforeDigest}`, changeClass);
  }

  function requireStage(stageId) {
    if (!Object.hasOwn(sourceByStage, stageId)) {
      throw sourceError('LAFEA_WORKBENCH_SOURCE_STAGE_NOT_FOUND');
    }
  }

  return Object.freeze({
    fields,
    clear,
    afterLifecycleEvent,
    reconcileDocumentMutation,
    ensureRunAuthority,
  });
}

function digest(document) {
  return document ? lafeaDocumentDigest(document) : null;
}

function requireHost(value) {
  if (!value || typeof value !== 'object'
    || typeof value.getRetainedState !== 'function'
    || typeof value.getActiveStageId !== 'function'
    || typeof value.invokeRetained !== 'function') {
    throw sourceError('LAFEA_WORKBENCH_SOURCE_HOST_INVALID');
  }
  return value;
}

function sourceError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
