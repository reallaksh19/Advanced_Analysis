export {
  CONTACT_FRICTION_CLASSIFICATION,
  CONTACT_FRICTION_EXECUTION_SCHEMA,
  CONTACT_FRICTION_POLICY_SCHEMA,
  CONTACT_FRICTION_STATE,
  DEFAULT_CONTACT_FRICTION_POLICY,
  computeContactFrictionExecutionSemanticHash,
  contactFrictionExecutionSemanticProjection,
  normalizeContactFrictionDeclarations,
  requireContactFrictionDeclaration,
  resolveContactFrictionPolicy,
  sealContactFrictionExecution,
} from './contact-friction-contract.js';

export { solveFixedContactState, stateSnapshot } from './contact-response.js';
export { evaluateContactFrictionState } from './state-evaluation.js';
export {
  contactFrictionCandidateStateCount,
  proveUniqueAdmissibleContactFrictionState,
} from './uniqueness.js';
export { compileContactFrictionExecution, contactFrictionStateFromRows } from './iteration.js';
