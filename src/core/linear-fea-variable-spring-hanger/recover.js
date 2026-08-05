import { deepFreeze } from '../shared-piping-model/immutable.js';
import { variableSpringSupportForce } from './design.js';

function entryValue(entries, nodeId, dof, field) {
  const entry = entries.find((row) => row.nodeId === nodeId && row.dof === dof);
  if (!entry) throw new Error(`Programmed hanger recovery requires ${field} at ${nodeId}:${dof}.`);
  return entry.value;
}

/**
 * Recover the complete variable-spring hardware action on the pipe.
 *
 * The solver reaction at a grounded LINEAR_SPRING DOF contains only the
 * elastic action `-k u`. A programmed variable spring also carries its
 * theoretical cold-load preload as a support action. Normal load-case result
 * recovery must therefore report `H_c - k u`, while the global right-hand
 * side continues to carry `H_c` as the preload primitive.
 */
export function recoverProgrammedVariableSpringHangerAction({ authority, execution }) {
  if (authority?.schema !== 'fea-linear-programmed-variable-spring-authority/v1') {
    throw new Error('A compiled programmed-variable-spring authority is required.');
  }
  if (!execution || !Array.isArray(execution.displacement) || !Array.isArray(execution.reactions)) {
    throw new Error('A solver execution with displacement and reaction entries is required.');
  }
  const nodeId = authority.kernelNodeId;
  const displacement = entryValue(execution.displacement, nodeId, 'UY', 'displacement');
  const elasticSupportAction = entryValue(execution.reactions, nodeId, 'UY', 'grounded spring reaction');
  const expectedElasticAction = -authority.selected.springRate * displacement;
  const scale = Math.max(Math.abs(expectedElasticAction), Math.abs(elasticSupportAction), 1);
  if (Math.abs(elasticSupportAction - expectedElasticAction) > 1e-10 * scale) {
    throw new Error(`Grounded spring reaction at ${nodeId}:UY is inconsistent with -k*u.`);
  }
  const totalSupportAction = variableSpringSupportForce({
    theoreticalColdLoad: authority.selected.theoreticalColdLoad,
    springRate: authority.selected.springRate,
    displacement,
  });
  return deepFreeze({
    schema: 'fea-linear-programmed-variable-spring-action/v1',
    hangerId: authority.hangerId,
    nodeId: authority.nodeId,
    kernelNodeId: nodeId,
    dof: 'UY',
    displacement,
    theoreticalColdLoad: authority.selected.theoreticalColdLoad,
    elasticSupportAction,
    totalSupportAction,
    signConvention: 'SUPPORT_ACTION_ON_STRUCTURE_POSITIVE_GLOBAL_Y',
  });
}
