function fail(message, code = 'UNILATERAL_STATUS_INVALID') {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function valueAt(entries, nodeId, dof, field) {
  if (!Array.isArray(entries)) fail(`execution.${field} must be an array.`);
  const matches = entries.filter((entry) => entry.nodeId === nodeId && entry.dof === dof);
  if (matches.length !== 1) {
    fail(
      `Expected exactly one ${field} value for ${nodeId}:${dof}; found ${matches.length}.`,
      'UNILATERAL_EXECUTION_VALUE_MISSING',
    );
  }
  const value = matches[0].value;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(`execution.${field} value for ${nodeId}:${dof} must be finite.`);
  }
  return value;
}

function proposedTransition({ execution, support, isEngaged, policy }) {
  if (isEngaged) {
    const reaction = valueAt(execution.reactions, support.nodeId, support.dof, 'reactions');
    const signedReaction = support.sense * reaction;
    if (signedReaction < -policy.forceTolerance) {
      return {
        nowEngaged: false,
        reason: 'REACTION_DISALLOWED_SENSE',
        reaction,
        signedReaction,
        displacement: null,
        signedClearance: null,
      };
    }
    return null;
  }

  const displacement = valueAt(execution.displacement, support.nodeId, support.dof, 'displacement');
  const signedClearance = support.sense * displacement + support.gap;
  if (signedClearance < -policy.penetrationTolerance) {
    return {
      nowEngaged: true,
      reason: 'RELEASED_SUPPORT_PENETRATION',
      reaction: null,
      signedReaction: null,
      displacement,
      signedClearance,
    };
  }
  return null;
}

/**
 * Evaluate one immutable linear solve against the frictionless unilateral
 * complementarity boundary. For +Y, support.sense=+1, so an engaged negative
 * reaction releases and a released displacement below -gap re-engages.
 * No state is mutated until every support has been checked.
 */
export function checkSupportStatus({ execution, unilateral, engaged, flipCounts, frozenReleased, policy }) {
  if (!execution || typeof execution !== 'object') fail('execution must be a solver execution object.');
  if (!(engaged instanceof Map) || !(flipCounts instanceof Map) || !(frozenReleased instanceof Set)) {
    fail('engaged/flipCounts/frozenReleased must be Map/Map/Set state containers.');
  }

  const flips = [];
  const diagnostics = [];
  for (const support of unilateral) {
    const isEngaged = engaged.get(support.declarationId) === true;
    if (frozenReleased.has(support.declarationId)) {
      if (isEngaged) fail(`Frozen support ${support.declarationId} cannot be engaged.`);
      continue;
    }

    const proposal = proposedTransition({ execution, support, isEngaged, policy });
    if (!proposal) continue;

    const flipCount = (flipCounts.get(support.declarationId) ?? 0) + 1;
    if (flipCount > policy.flipLimit) {
      flips.push(Object.freeze({
        declarationId: support.declarationId,
        nodeId: support.nodeId,
        dof: support.dof,
        fromEngaged: isEngaged,
        nowEngaged: false,
        reason: 'CHATTER_FREEZE_RELEASED',
        attemptedReason: proposal.reason,
        flipCount,
        reaction: proposal.reaction,
        signedReaction: proposal.signedReaction,
        displacement: proposal.displacement,
        signedClearance: proposal.signedClearance,
        freezeReleased: true,
      }));
      diagnostics.push(Object.freeze({
        code: 'UNILATERAL_SUPPORT_FROZEN_RELEASED',
        declarationId: support.declarationId,
        nodeId: support.nodeId,
        dof: support.dof,
        flipCount,
        message: `Support exceeded ${policy.flipLimit} status flips and was deterministically frozen RELEASED.`,
      }));
      continue;
    }

    flips.push(Object.freeze({
      declarationId: support.declarationId,
      nodeId: support.nodeId,
      dof: support.dof,
      fromEngaged: isEngaged,
      nowEngaged: proposal.nowEngaged,
      reason: proposal.reason,
      attemptedReason: null,
      flipCount,
      reaction: proposal.reaction,
      signedReaction: proposal.signedReaction,
      displacement: proposal.displacement,
      signedClearance: proposal.signedClearance,
      freezeReleased: false,
    }));
  }

  return Object.freeze({ flips: Object.freeze(flips), diagnostics: Object.freeze(diagnostics) });
}
