import { deepFreeze } from './contracts.js';
import { assemblePlanarSystem, solveAssembledPlanarSystem } from './assembly.js';
import { solveUnilateralActiveSet } from './contact.js';
import { EMPIRICAL_FAILURE_CODES, empiricalFailure } from './failure-codes.js';

export function solvePlanarRestContact(input, numericalOptions = {}) {
  const rests = [...(input.unilateralRests ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  for (const rest of rests) {
    if (rest.dof !== 'UY' || (rest.normalSign ?? 1) !== 1) {
      throw empiricalFailure(
        EMPIRICAL_FAILURE_CODES.OUTSIDE_QUALIFIED_SCOPE,
        'Initial contact implementation qualifies frictionless planar Y+ rests only.',
        { rest },
      );
    }
    if ((rest.initialGapM ?? 0) !== 0) {
      throw empiricalFailure(
        EMPIRICAL_FAILURE_CODES.CONTACT_RECONTACT_RULE_UNQUALIFIED,
        'Finite-gap re-contact is not qualified in EMPIRICAL_BEAM_CONTACT_V1.',
        { rest },
      );
    }
  }
  const restById = new Map(rests.map(rest => [rest.id, rest]));
  return solveUnilateralActiveSet({
    candidateRestIds: rests.map(rest => rest.id),
    absoluteReactionToleranceN: input.absoluteReactionToleranceN,
    relativeReactionTolerance: input.relativeReactionTolerance,
    gapToleranceM: input.gapToleranceM,
    solveActiveSet(activeRestIds) {
      const activeSet = new Set(activeRestIds);
      const constraints = [
        ...(input.bilateralConstraints ?? []),
        ...activeRestIds.map(restId => {
          const rest = restById.get(restId);
          return {
            id: `REST:${rest.id}`,
            nodeId: rest.nodeId,
            dof: 'UY',
            prescribedValue: 0,
            capability: 'UNILATERAL_Y_PLUS',
          };
        }),
      ];
      const assembled = assemblePlanarSystem({
        nodes: input.nodes,
        members: input.members,
        nodalLoads: input.nodalLoads,
        constraints,
      });
      const result = solveAssembledPlanarSystem(assembled, numericalOptions);
      const reactionsByRestId = {};
      const gapsByRestId = {};
      for (const rest of rests) {
        reactionsByRestId[rest.id] = activeSet.has(rest.id)
          ? result.reactionByConstraint[`REST:${rest.id}`]
          : 0;
        gapsByRestId[rest.id] = result.displacementByNode[rest.nodeId].uyM;
      }
      return deepFreeze({ result, assembled, reactionsByRestId, gapsByRestId });
    },
  });
}
