import {
  EMPIRICAL_FORMULA_IDS,
  EMPIRICAL_PIPING_SCHEMAS,
  deepFreeze,
  requireFiniteNumber,
} from './contracts.js';
import { EMPIRICAL_FAILURE_CODES, empiricalFailure } from './failure-codes.js';
import { semanticHash } from './identity.js';

function reactionTolerance(reactions, absoluteToleranceN, relativeTolerance) {
  const scale = Math.max(1, ...Object.values(reactions).map(value => Math.abs(value)));
  return Math.max(absoluteToleranceN, relativeTolerance * scale);
}

export function solveUnilateralActiveSet(input) {
  if (typeof input.solveActiveSet !== 'function') {
    throw new TypeError('solveActiveSet callback is required.');
  }
  const candidateRestIds = [...new Set(input.candidateRestIds ?? [])].sort();
  let activeRestIds = [...candidateRestIds];
  const seen = new Set();
  const iterations = [];
  const absoluteReactionToleranceN = requireFiniteNumber(
    input.absoluteReactionToleranceN ?? 1e-6,
    'absoluteReactionToleranceN',
  );
  const relativeReactionTolerance = requireFiniteNumber(
    input.relativeReactionTolerance ?? 1e-10,
    'relativeReactionTolerance',
  );
  const gapToleranceM = requireFiniteNumber(input.gapToleranceM ?? 1e-9, 'gapToleranceM');
  const maxIterations = input.maxIterations ?? (candidateRestIds.length + 1);

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const activeSetIdentity = semanticHash(activeRestIds);
    if (seen.has(activeSetIdentity)) {
      throw empiricalFailure(
        EMPIRICAL_FAILURE_CODES.CONTACT_ACTIVE_SET_OSCILLATION,
        'Unilateral contact active set repeated before convergence.',
        { activeRestIds, iterations },
      );
    }
    seen.add(activeSetIdentity);
    const trial = input.solveActiveSet(deepFreeze([...activeRestIds]));
    const reactions = Object.fromEntries(candidateRestIds.map(restId => [
      restId,
      requireFiniteNumber(trial.reactionsByRestId?.[restId] ?? 0, `reaction ${restId}`),
    ]));
    const gaps = Object.fromEntries(candidateRestIds.map(restId => [
      restId,
      requireFiniteNumber(trial.gapsByRestId?.[restId] ?? 0, `gap ${restId}`),
    ]));
    const toleranceN = reactionTolerance(
      reactions,
      absoluteReactionToleranceN,
      relativeReactionTolerance,
    );
    const releaseRestIds = activeRestIds
      .filter(restId => reactions[restId] < -toleranceN)
      .sort();
    const record = {
      iteration,
      activeRestIds: [...activeRestIds],
      activeSetIdentity,
      reactionsByRestId: reactions,
      gapsByRestId: gaps,
      reactionToleranceN: toleranceN,
      releaseRestIds,
      solutionIdentity: trial.result?.semanticIdentity ?? trial.semanticIdentity ?? null,
    };
    iterations.push(deepFreeze(record));

    if (releaseRestIds.length === 0) {
      for (const restId of activeRestIds) {
        if (reactions[restId] < -toleranceN) {
          throw empiricalFailure(
            EMPIRICAL_FAILURE_CODES.CONTACT_NONCONVERGENT,
            `Active rest ${restId} remains tensile.`,
            record,
          );
        }
      }
      const inactiveRestIds = candidateRestIds.filter(restId => !activeRestIds.includes(restId));
      const penetrated = inactiveRestIds.filter(restId => gaps[restId] < -gapToleranceM);
      if (penetrated.length > 0) {
        throw empiricalFailure(
          input.allowRecontact
            ? EMPIRICAL_FAILURE_CODES.CONTACT_NONCONVERGENT
            : EMPIRICAL_FAILURE_CODES.CONTACT_RECONTACT_RULE_UNQUALIFIED,
          'Released rest penetration requires a separately qualified re-contact rule.',
          { penetrated, gaps, gapToleranceM },
        );
      }
      const result = {
        schema: EMPIRICAL_PIPING_SCHEMAS.contactHistory,
        activeRestIds,
        inactiveRestIds,
        reactionsByRestId: reactions,
        gapsByRestId: gaps,
        iterations,
        result: trial.result ?? null,
        formulaTrace: [EMPIRICAL_FORMULA_IDS.contactComplementarity],
      };
      return deepFreeze({ ...result, semanticIdentity: semanticHash(result) });
    }

    const releaseSet = new Set(releaseRestIds);
    activeRestIds = activeRestIds.filter(restId => !releaseSet.has(restId));
  }

  throw empiricalFailure(
    EMPIRICAL_FAILURE_CODES.CONTACT_NONCONVERGENT,
    'Unilateral contact did not converge within the deterministic iteration limit.',
    { candidateRestIds, iterations, maxIterations },
  );
}
