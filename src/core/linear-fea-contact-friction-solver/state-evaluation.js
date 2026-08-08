import { deepFreeze } from '../shared-piping-model/immutable.js';
import { CONTACT_FRICTION_STATE, failContactFriction } from './contact-friction-contract.js';

function magnitude(vector) {
  return Math.hypot(...vector);
}

function slipForceMap(rows) {
  return new Map(rows.map((row) => [row.declarationId, row]));
}

function forceComponents(contact, slipRow) {
  if (!slipRow) return [0, 0];
  return contact.tangentDofs.map((dof) => (
    slipRow.components.find((component) => component.dof === dof)?.value ?? 0
  ));
}

function cosine(left, right) {
  const denominator = magnitude(left) * magnitude(right);
  return denominator > 0
    ? (left[0] * right[0] + left[1] * right[1]) / denominator
    : null;
}

function evaluateOpen(contact, row, policy) {
  const normalizedDisplacement = contact.normalSense * row.normalDisplacement;
  const penetrationLimit = -contact.gap - policy.penetrationTolerance;
  const penetrated = normalizedDisplacement < penetrationLimit;
  return deepFreeze({
    declarationId: contact.declarationId,
    nodeId: contact.nodeId,
    state: CONTACT_FRICTION_STATE.OPEN,
    nextState: penetrated ? CONTACT_FRICTION_STATE.STICK : CONTACT_FRICTION_STATE.OPEN,
    transitionReason: penetrated ? 'NORMAL_PENETRATION' : 'NORMAL_SEPARATED_OR_WITHIN_TOLERANCE',
    normalReaction: 0,
    normalMagnitude: 0,
    normalDisplacement: row.normalDisplacement,
    normalizedNormalDisplacement: normalizedDisplacement,
    penetrationLimit,
    tangentDisplacement: row.tangentDisplacement,
    tangentialForce: Object.freeze([0, 0]),
    tangentialMagnitude: 0,
    elasticTrialMagnitude: 0,
    coulombLimit: 0,
    mobilization: 0,
    oppositionCosine: null,
    admissible: !penetrated,
  });
}

function evaluateActive(contact, state, row, slipRow, policy) {
  const normalizedReaction = contact.normalSense * row.normalReaction;
  const normalMagnitude = Math.max(0, normalizedReaction);
  const tangentDisplacement = row.tangentDisplacement;
  const elasticTrialForce = contact.frictionCoefficient > 0
    ? tangentDisplacement.map((value) => -contact.frictionStiffness * value)
    : [0, 0];
  const elasticTrialMagnitude = magnitude(elasticTrialForce);
  const coulombLimit = contact.frictionCoefficient * normalMagnitude;

  if (normalizedReaction < -policy.forceTolerance) {
    return deepFreeze({
      declarationId: contact.declarationId,
      nodeId: contact.nodeId,
      state,
      nextState: CONTACT_FRICTION_STATE.OPEN,
      transitionReason: 'NORMAL_REACTION_DISALLOWED',
      normalReaction: row.normalReaction,
      normalizedNormalReaction: normalizedReaction,
      normalMagnitude,
      normalDisplacement: row.normalDisplacement,
      tangentDisplacement,
      tangentialForce: Object.freeze([0, 0]),
      tangentialMagnitude: 0,
      elasticTrialMagnitude,
      coulombLimit,
      mobilization: 0,
      oppositionCosine: null,
      admissible: false,
    });
  }

  if (contact.frictionCoefficient === 0) {
    return deepFreeze({
      declarationId: contact.declarationId,
      nodeId: contact.nodeId,
      state,
      nextState: CONTACT_FRICTION_STATE.STICK,
      transitionReason: 'FRICTIONLESS_CONTACT_ADMISSIBLE',
      normalReaction: row.normalReaction,
      normalizedNormalReaction: normalizedReaction,
      normalMagnitude,
      normalDisplacement: row.normalDisplacement,
      tangentDisplacement,
      tangentialForce: Object.freeze([0, 0]),
      tangentialMagnitude: 0,
      elasticTrialMagnitude: 0,
      coulombLimit: 0,
      mobilization: 0,
      oppositionCosine: null,
      admissible: state === CONTACT_FRICTION_STATE.STICK,
    });
  }

  if (state === CONTACT_FRICTION_STATE.STICK) {
    const atYieldBoundary = coulombLimit > policy.forceTolerance
      && Math.abs(elasticTrialMagnitude - coulombLimit) <= policy.forceTolerance;
    if (atYieldBoundary) {
      failContactFriction(
        `Contact ${contact.declarationId} lies on the STICK/SLIP admissibility boundary.`,
        'CONTACT_FRICTION_NON_UNIQUE_STATE',
        { declarationId: contact.declarationId, elasticTrialMagnitude, coulombLimit },
      );
    }
    const admissible = elasticTrialMagnitude < coulombLimit - policy.forceTolerance
      || elasticTrialMagnitude <= policy.forceTolerance;
    return deepFreeze({
      declarationId: contact.declarationId,
      nodeId: contact.nodeId,
      state,
      nextState: admissible ? CONTACT_FRICTION_STATE.STICK : CONTACT_FRICTION_STATE.SLIP,
      transitionReason: admissible ? 'STICK_WITHIN_COULOMB_BOUND' : 'STICK_BREAKAWAY',
      normalReaction: row.normalReaction,
      normalizedNormalReaction: normalizedReaction,
      normalMagnitude,
      normalDisplacement: row.normalDisplacement,
      tangentDisplacement,
      tangentialForce: Object.freeze(elasticTrialForce),
      tangentialMagnitude: elasticTrialMagnitude,
      elasticTrialMagnitude,
      coulombLimit,
      mobilization: coulombLimit > 0 ? elasticTrialMagnitude / coulombLimit : 0,
      oppositionCosine: cosine(elasticTrialForce, tangentDisplacement),
      admissible,
    });
  }

  const tangentialForce = forceComponents(contact, slipRow);
  const tangentialMagnitude = magnitude(tangentialForce);
  const displacementMagnitude = magnitude(tangentDisplacement);
  const oppositionCosine = cosine(tangentialForce, tangentDisplacement);
  const onSurface = Math.abs(tangentialMagnitude - coulombLimit) <= policy.forceTolerance;
  const beyondBreakaway = elasticTrialMagnitude + policy.forceTolerance >= coulombLimit;
  const opposing = coulombLimit <= policy.forceTolerance
    ? displacementMagnitude > policy.penetrationTolerance
    : oppositionCosine !== null && oppositionCosine <= -1 + policy.directionCosineTolerance;
  const shouldRestick = elasticTrialMagnitude + policy.forceTolerance < coulombLimit
    || displacementMagnitude <= policy.penetrationTolerance;
  const admissible = onSurface && beyondBreakaway && opposing && !shouldRestick;
  return deepFreeze({
    declarationId: contact.declarationId,
    nodeId: contact.nodeId,
    state,
    nextState: shouldRestick ? CONTACT_FRICTION_STATE.STICK : CONTACT_FRICTION_STATE.SLIP,
    transitionReason: shouldRestick ? 'SLIP_BELOW_BREAKAWAY_OR_ZERO_MOTION' : admissible ? 'SLIP_COULOMB_ADMISSIBLE' : 'SLIP_CONSTITUTIVE_INADMISSIBLE',
    normalReaction: row.normalReaction,
    normalizedNormalReaction: normalizedReaction,
    normalMagnitude,
    normalDisplacement: row.normalDisplacement,
    tangentDisplacement,
    tangentialForce: Object.freeze(tangentialForce),
    tangentialMagnitude,
    elasticTrialMagnitude,
    coulombLimit,
    mobilization: coulombLimit > 0 ? tangentialMagnitude / coulombLimit : 0,
    oppositionCosine,
    onSurface,
    beyondBreakaway,
    opposing,
    admissible,
  });
}

export function evaluateContactFrictionState({ contacts, states, snapshot, slipForces, policy }) {
  const slips = slipForceMap(slipForces);
  const evaluations = contacts.map((contact) => {
    const state = states.get(contact.declarationId);
    const row = snapshot[contact.declarationId];
    if (state === CONTACT_FRICTION_STATE.OPEN) return evaluateOpen(contact, row, policy);
    return evaluateActive(contact, state, row, slips.get(contact.declarationId), policy);
  });
  const nextStates = new Map(evaluations.map((row) => [row.declarationId, row.nextState]));
  return deepFreeze({
    evaluations: deepFreeze(evaluations),
    nextStateRows: deepFreeze(evaluations.map((row) => ({
      declarationId: row.declarationId,
      nodeId: row.nodeId,
      state: row.nextState,
    }))),
    converged: evaluations.every((row) => row.nextState === row.state && row.admissible),
    nextStates,
  });
}
