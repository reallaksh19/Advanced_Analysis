import {
  EMPIRICAL_FORMULA_IDS,
  EMPIRICAL_PIPING_SCHEMAS,
  deepFreeze,
  requireFiniteNumber,
} from './contracts.js';
import { multiplyMatrixVector, subtractVectors } from './matrix.js';
import { semanticHash } from './identity.js';

export function recoverMemberActions(assembled, solution) {
  const results = assembled.memberAssembly.map(record => {
    const member = assembled.members.find(candidate => candidate.id === record.memberId);
    const globalDisplacement = record.dofIndices.map(index => solution.fullDisplacement[index]);
    const localDisplacement = multiplyMatrixVector(
      member.axes.transformGlobalToLocal,
      globalDisplacement,
    );
    const localElasticAction = multiplyMatrixVector(member.localStiffness, localDisplacement);
    const localEndAction = subtractVectors(localElasticAction, member.localEquivalentLoad);
    const result = {
      schema: EMPIRICAL_PIPING_SCHEMAS.memberActions,
      memberId: member.id,
      nodeIId: member.nodeIId,
      nodeJId: member.nodeJId,
      localDisplacement,
      localEndAction: {
        axialIN: localEndAction[0],
        shearIY_N: localEndAction[1],
        momentI_Nm: localEndAction[2],
        axialJN: localEndAction[3],
        shearJY_N: localEndAction[4],
        momentJ_Nm: localEndAction[5],
      },
      localEndActionVector: localEndAction,
      uniformLocalLoadNM: member.uniformLocalLoadNM,
      formulaTrace: [EMPIRICAL_FORMULA_IDS.memberActionRecovery],
    };
    return deepFreeze({ ...result, semanticIdentity: semanticHash(result) });
  });
  return deepFreeze(results);
}

export function recoverUniformLoadInternalExtrema(member, memberAction, options = {}) {
  const q = requireFiniteNumber(
    member.uniformLocalLoadNM.y,
    'member.uniformLocalLoadNM.y',
  );
  const L = member.axes.lengthM;
  const force = memberAction.localEndAction;
  const shearAtI = force.shearIY_N;
  const momentAtI = -force.momentI_Nm;
  const evaluate = xM => deepFreeze({
    xM,
    shearN: shearAtI + (q * xM),
    momentNm: momentAtI + (shearAtI * xM) + ((q * (xM ** 2)) / 2),
  });
  const candidates = [evaluate(0), evaluate(L)];
  const qTolerance = options.qTolerance ?? 1e-14;
  if (Math.abs(q) > qTolerance) {
    const xExtM = -shearAtI / q;
    if (xExtM > 0 && xExtM < L) candidates.push(evaluate(xExtM));
  }
  const maximumAbsoluteMoment = candidates.reduce((best, candidate) => (
    Math.abs(candidate.momentNm) > Math.abs(best.momentNm) ? candidate : best
  ));
  return deepFreeze({
    memberId: member.id,
    candidates,
    maximumAbsoluteMoment,
    formulaTrace: [EMPIRICAL_FORMULA_IDS.internalMoment],
  });
}

export function verifyJointActionBalance({ assembled, memberActions, solution, toleranceN = 1e-6 }) {
  const jointResidual = Object.fromEntries(assembled.nodes.map(node => [node.id, {
    xN: 0,
    yN: 0,
    momentNm: 0,
  }]));
  for (const action of memberActions) {
    const member = assembled.members.find(candidate => candidate.id === action.memberId);
    const local = action.localEndActionVector;
    const c = member.axes.c;
    const s = member.axes.s;
    const addEnd = (nodeId, axial, shear, moment) => {
      jointResidual[nodeId].xN += (c * axial) - (s * shear);
      jointResidual[nodeId].yN += (s * axial) + (c * shear);
      jointResidual[nodeId].momentNm += moment;
    };
    addEnd(member.nodeIId, local[0], local[1], local[2]);
    addEnd(member.nodeJId, local[3], local[4], local[5]);
  }
  for (const nodalLoad of assembled.nodalLoads ?? []) {
    jointResidual[nodalLoad.nodeId].xN -= nodalLoad.xN ?? 0;
    jointResidual[nodalLoad.nodeId].yN -= nodalLoad.yN ?? 0;
    jointResidual[nodalLoad.nodeId].momentNm -= nodalLoad.momentNm ?? 0;
  }
  for (const constraint of assembled.constraints) {
    const reaction = solution.reactionByConstraint[constraint.id];
    if (constraint.dof === 'UX') jointResidual[constraint.nodeId].xN -= reaction;
    if (constraint.dof === 'UY') jointResidual[constraint.nodeId].yN -= reaction;
    if (constraint.dof === 'RZ') jointResidual[constraint.nodeId].momentNm -= reaction;
  }
  const maximum = Math.max(...Object.values(jointResidual).flatMap(row => [
    Math.abs(row.xN), Math.abs(row.yN), Math.abs(row.momentNm),
  ]));
  return deepFreeze({ ok: maximum <= toleranceN, maximumResidual: maximum, jointResidual });
}
