import { EMPIRICAL_FORMULA_IDS, deepFreeze } from './contracts.js';

export function evaluatePlanarEquilibrium(assembled, solution, origin = { xM: 0, yM: 0 }) {
  let forceX_N = 0;
  let forceY_N = 0;
  let momentNm = 0;
  assembled.nodes.forEach((node, index) => {
    const base = 3 * index;
    const fx = assembled.load[base];
    const fy = assembled.load[base + 1];
    const mz = assembled.load[base + 2];
    forceX_N += fx;
    forceY_N += fy;
    momentNm += mz + ((node.xM - origin.xM) * fy) - ((node.yM - origin.yM) * fx);
  });
  for (const constraint of assembled.constraints) {
    const reaction = solution.reactionByConstraint[constraint.id];
    const node = assembled.nodes.find(candidate => candidate.id === constraint.nodeId);
    if (constraint.dof === 'UX') {
      forceX_N += reaction;
      momentNm -= (node.yM - origin.yM) * reaction;
    } else if (constraint.dof === 'UY') {
      forceY_N += reaction;
      momentNm += (node.xM - origin.xM) * reaction;
    } else if (constraint.dof === 'RZ') {
      momentNm += reaction;
    }
  }
  return deepFreeze({
    origin,
    forceResidualN: { x: forceX_N, y: forceY_N },
    momentResidualNm: momentNm,
    formulaTrace: [EMPIRICAL_FORMULA_IDS.forceClosure, EMPIRICAL_FORMULA_IDS.momentClosure],
  });
}
