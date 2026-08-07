import { deepFreeze } from '../shared-piping-model/immutable.js';
import { compareDeclarationId } from './unilateral-contract.js';

export const UNILATERAL_FREEZE_DIAGNOSTIC = 'UNILATERAL_SUPPORT_FROZEN_RELEASED';

function fail(message, code = 'UNILATERAL_STATUS_INVALID') {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function vectorValue(entries, nodeId, dof, field, required) {
  if (!Array.isArray(entries)) fail(`${field} must be an array.`);
  const entry = entries.find((candidate) => candidate.nodeId === nodeId && candidate.dof === dof);
  if (!entry) {
    if (!required) return null;
    fail(`${field} is missing ${nodeId}:${dof}.`, 'UNILATERAL_STATE_VALUE_MISSING');
  }
  if (!Number.isFinite(entry.value)) fail(`${field} ${nodeId}:${dof} must be finite.`);
  return entry.value;
}

export function reactionAt(execution, declaration, required = true) {
  return vectorValue(execution?.reactions, declaration.nodeId, declaration.dof, 'execution.reactions', required);
}

export function displacementAt(execution, declaration) {
  return vectorValue(execution?.displacement, declaration.nodeId, declaration.dof, 'execution.displacement', true);
}

export function evaluateSupportStatus({ execution, declaration, engaged, policy }) {
  if (engaged) {
    const reaction = reactionAt(execution, declaration, true);
    const normalizedReaction = declaration.sense * reaction;
    if (normalizedReaction < -policy.forceTolerance) {
      return deepFreeze({
        shouldFlip: true,
        nowEngaged: false,
        reason: 'REACTION_DISALLOWED',
        reaction,
        normalizedReaction,
        displacement: null,
      });
    }
    return deepFreeze({
      shouldFlip: false,
      nowEngaged: true,
      reason: 'REACTION_ADMISSIBLE',
      reaction,
      normalizedReaction,
      displacement: null,
    });
  }

  const displacement = displacementAt(execution, declaration);
  const normalizedDisplacement = declaration.sense * displacement;
  const penetrationLimit = -declaration.gap - policy.penetrationTolerance;
  if (normalizedDisplacement < penetrationLimit) {
    return deepFreeze({
      shouldFlip: true,
      nowEngaged: true,
      reason: 'PENETRATION',
      reaction: reactionAt(execution, declaration, false),
      normalizedReaction: null,
      displacement,
      normalizedDisplacement,
      penetrationLimit,
    });
  }
  return deepFreeze({
    shouldFlip: false,
    nowEngaged: false,
    reason: 'SEPARATED_OR_WITHIN_TOLERANCE',
    reaction: reactionAt(execution, declaration, false),
    normalizedReaction: null,
    displacement,
    normalizedDisplacement,
    penetrationLimit,
  });
}

export function checkSupportStatus({ execution, unilateral, engaged, flipCounts, frozen, policy }) {
  const flips = [];
  const frozenNow = [];
  const evaluations = [];
  const ordered = [...unilateral].sort(compareDeclarationId);

  for (const declaration of ordered) {
    const id = declaration.declarationId;
    const isEngaged = engaged.get(id) === true;
    const isFrozen = frozen.has(id);
    const evaluation = evaluateSupportStatus({ execution, declaration, engaged: isEngaged, policy });
    evaluations.push(deepFreeze({
      declarationId: id,
      nodeId: declaration.nodeId,
      dof: declaration.dof,
      engaged: isEngaged,
      frozenReleased: isFrozen,
      ...evaluation,
    }));

    if (isFrozen || !evaluation.shouldFlip) continue;
    const previousFlips = flipCounts.get(id) ?? 0;
    if (previousFlips >= policy.flipLimit) {
      frozenNow.push(deepFreeze({
        code: UNILATERAL_FREEZE_DIAGNOSTIC,
        declarationId: id,
        nodeId: declaration.nodeId,
        dof: declaration.dof,
        attemptedState: evaluation.nowEngaged ? 'ENGAGED' : 'RELEASED',
        priorFlipCount: previousFlips,
      }));
      if (isEngaged) {
        flips.push(deepFreeze({
          declarationId: id,
          nodeId: declaration.nodeId,
          dof: declaration.dof,
          nowEngaged: false,
          reason: 'FREEZE_RELEASED',
        }));
      }
      continue;
    }

    flips.push(deepFreeze({
      declarationId: id,
      nodeId: declaration.nodeId,
      dof: declaration.dof,
      nowEngaged: evaluation.nowEngaged,
      reason: evaluation.reason,
    }));
  }

  return deepFreeze({ flips, frozenNow, evaluations });
}
