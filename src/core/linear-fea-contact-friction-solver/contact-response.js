import { deepFreeze } from '../shared-piping-model/immutable.js';
import { CONTACT_FRICTION_STATE, failContactFriction } from './contact-friction-contract.js';

const PROBE_FORCE = 1000;

function value(entries, nodeId, dof, field, required = true) {
  if (!Array.isArray(entries)) failContactFriction(`${field} must be an array.`, 'CONTACT_FRICTION_INNER_EXECUTION_INVALID');
  const row = entries.find((candidate) => candidate.nodeId === nodeId && candidate.dof === dof);
  if (!row) {
    if (!required) return 0;
    failContactFriction(`${field} is missing ${nodeId}:${dof}.`, 'CONTACT_FRICTION_STATE_VALUE_MISSING');
  }
  if (!Number.isFinite(row.value)) failContactFriction(`${field} ${nodeId}:${dof} must be finite.`, 'CONTACT_FRICTION_STATE_VALUE_INVALID');
  return row.value;
}

function requireExecution(execution) {
  if (!execution || typeof execution !== 'object' || typeof execution.semanticHash !== 'string') {
    failContactFriction('buildAndSolve must return an execution with semanticHash.', 'CONTACT_FRICTION_INNER_EXECUTION_INVALID');
  }
  if (!Array.isArray(execution.reactions) || !Array.isArray(execution.displacement)) {
    failContactFriction('Inner execution must expose reactions and displacement arrays.', 'CONTACT_FRICTION_INNER_EXECUTION_INVALID');
  }
  return execution;
}

export function stateSnapshot(contacts, states, execution) {
  return Object.freeze(Object.fromEntries(contacts.map((contact) => {
    const state = states.get(contact.declarationId);
    const active = state !== CONTACT_FRICTION_STATE.OPEN;
    return [contact.declarationId, Object.freeze({
      normalReaction: active ? value(execution.reactions, contact.nodeId, contact.normalDof, 'execution.reactions') : 0,
      normalDisplacement: value(execution.displacement, contact.nodeId, contact.normalDof, 'execution.displacement'),
      tangentDisplacement: Object.freeze(contact.tangentDofs.map((dof) => (
        value(execution.displacement, contact.nodeId, dof, 'execution.displacement')
      ))),
    })];
  })));
}

function stateRows(contacts, states) {
  return deepFreeze(contacts.map((contact) => ({
    declarationId: contact.declarationId,
    nodeId: contact.nodeId,
    state: states.get(contact.declarationId),
  })));
}

function stickSprings(contacts, states) {
  return deepFreeze(contacts.flatMap((contact) => {
    if (states.get(contact.declarationId) !== CONTACT_FRICTION_STATE.STICK || contact.frictionCoefficient === 0) return [];
    return contact.tangentDofs.map((dof) => deepFreeze({
      declarationId: `${contact.declarationId}-STICK-${dof}`,
      contactDeclarationId: contact.declarationId,
      nodeId: contact.nodeId,
      dof,
      stiffness: contact.frictionStiffness,
    }));
  }));
}

function activeContacts(contacts, states) {
  return deepFreeze(contacts.filter((contact) => states.get(contact.declarationId) !== CONTACT_FRICTION_STATE.OPEN));
}

function slipForceRows(slipContacts, x) {
  return deepFreeze(slipContacts.map((contact, index) => ({
    declarationId: contact.declarationId,
    nodeId: contact.nodeId,
    components: deepFreeze(contact.tangentDofs.map((dof, component) => ({
      dof,
      value: x[2 * index + component],
    }))),
  })));
}

function runSolve({ contacts, states, slipContacts, x, buildAndSolve }) {
  const request = deepFreeze({
    state: stateRows(contacts, states),
    activeContacts: activeContacts(contacts, states),
    stickSprings: stickSprings(contacts, states),
    slipForces: slipForceRows(slipContacts, x),
  });
  return requireExecution(buildAndSolve(request));
}

function interpolate(base, columns, contacts, x) {
  return Object.freeze(Object.fromEntries(contacts.map((contact) => {
    const baseRow = base[contact.declarationId];
    const row = {
      normalReaction: baseRow.normalReaction,
      normalDisplacement: baseRow.normalDisplacement,
      tangentDisplacement: [...baseRow.tangentDisplacement],
    };
    for (let column = 0; column < x.length; column += 1) {
      const derivative = columns[column][contact.declarationId];
      row.normalReaction += derivative.normalReaction * x[column];
      row.normalDisplacement += derivative.normalDisplacement * x[column];
      row.tangentDisplacement[0] += derivative.tangentDisplacement[0] * x[column];
      row.tangentDisplacement[1] += derivative.tangentDisplacement[1] * x[column];
    }
    row.tangentDisplacement = Object.freeze(row.tangentDisplacement);
    return [contact.declarationId, Object.freeze(row)];
  })));
}

function desiredSlipForce(contact, row) {
  const normalMagnitude = Math.max(0, contact.normalSense * row.normalReaction);
  const limit = contact.frictionCoefficient * normalMagnitude;
  const [u0, u1] = row.tangentDisplacement;
  const magnitude = Math.hypot(u0, u1);
  if (!(magnitude > 0) || !(limit > 0)) return [0, 0];
  return [-limit * u0 / magnitude, -limit * u1 / magnitude];
}

function residualFor({ contacts, slipContacts, x, snapshot }) {
  const residual = [];
  slipContacts.forEach((contact, index) => {
    const desired = desiredSlipForce(contact, snapshot[contact.declarationId]);
    residual.push(x[2 * index] - desired[0], x[2 * index + 1] - desired[1]);
  });
  return residual;
}

function squaredNorm(vector) {
  return vector.reduce((sum, value) => sum + value * value, 0);
}

function infinityNorm(vector) {
  return vector.reduce((worst, value) => Math.max(worst, Math.abs(value)), 0);
}

function finiteDifferenceJacobian(x, residual, evaluateResidual) {
  const jacobian = Array.from({ length: residual.length }, () => Array(x.length).fill(0));
  for (let column = 0; column < x.length; column += 1) {
    const step = Math.max(0.01, 1e-5 * Math.max(1, Math.abs(x[column])));
    const plus = [...x];
    const minus = [...x];
    plus[column] += step;
    minus[column] -= step;
    const rp = evaluateResidual(plus);
    const rm = evaluateResidual(minus);
    for (let row = 0; row < residual.length; row += 1) jacobian[row][column] = (rp[row] - rm[row]) / (2 * step);
  }
  return jacobian;
}

function solveDense(matrix, rhs) {
  const n = rhs.length;
  const augmented = matrix.map((row, index) => [...row, rhs[index]]);
  for (let pivot = 0; pivot < n; pivot += 1) {
    let best = pivot;
    for (let row = pivot + 1; row < n; row += 1) if (Math.abs(augmented[row][pivot]) > Math.abs(augmented[best][pivot])) best = row;
    if (Math.abs(augmented[best][pivot]) < 1e-14) return null;
    [augmented[pivot], augmented[best]] = [augmented[best], augmented[pivot]];
    const divisor = augmented[pivot][pivot];
    for (let col = pivot; col <= n; col += 1) augmented[pivot][col] /= divisor;
    for (let row = 0; row < n; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row][pivot];
      for (let col = pivot; col <= n; col += 1) augmented[row][col] -= factor * augmented[pivot][col];
    }
  }
  return augmented.map((row) => row[n]);
}

function leastSquaresStep(jacobian, residual) {
  const n = jacobian[0]?.length ?? 0;
  if (n === 0) return [];
  for (const damping of [0, 1e-12, 1e-10, 1e-8, 1e-6, 1e-4, 1e-2, 1, 100]) {
    const normal = Array.from({ length: n }, () => Array(n).fill(0));
    const rhs = Array(n).fill(0);
    for (let row = 0; row < jacobian.length; row += 1) {
      for (let i = 0; i < n; i += 1) {
        rhs[i] -= jacobian[row][i] * residual[row];
        for (let j = 0; j < n; j += 1) normal[i][j] += jacobian[row][i] * jacobian[row][j];
      }
    }
    for (let i = 0; i < n; i += 1) normal[i][i] += damping * Math.max(1, normal[i][i]);
    const solved = solveDense(normal, rhs);
    if (solved) return solved;
  }
  return null;
}

function limitStep(step, limit) {
  const magnitude = Math.sqrt(squaredNorm(step));
  if (!(magnitude > limit)) return step;
  return step.map((value) => value * limit / magnitude);
}

export function solveFixedContactState({ contacts, states, buildAndSolve, policy }) {
  const slipContacts = contacts.filter((contact) => states.get(contact.declarationId) === CONTACT_FRICTION_STATE.SLIP);
  if (slipContacts.length === 0) {
    const execution = runSolve({ contacts, states, slipContacts, x: [], buildAndSolve });
    return deepFreeze({ execution, slipForces: [], snapshot: stateSnapshot(contacts, states, execution), residualInfinityNorm: 0, history: [] });
  }

  const dimension = 2 * slipContacts.length;
  const baseExecution = runSolve({ contacts, states, slipContacts, x: Array(dimension).fill(0), buildAndSolve });
  const base = stateSnapshot(contacts, states, baseExecution);
  const columns = [];
  for (let column = 0; column < dimension; column += 1) {
    const probe = Array(dimension).fill(0);
    probe[column] = PROBE_FORCE;
    const execution = runSolve({ contacts, states, slipContacts, x: probe, buildAndSolve });
    const snapshot = stateSnapshot(contacts, states, execution);
    columns.push(Object.freeze(Object.fromEntries(contacts.map((contact) => {
      const b = base[contact.declarationId];
      const p = snapshot[contact.declarationId];
      return [contact.declarationId, Object.freeze({
        normalReaction: (p.normalReaction - b.normalReaction) / PROBE_FORCE,
        normalDisplacement: (p.normalDisplacement - b.normalDisplacement) / PROBE_FORCE,
        tangentDisplacement: Object.freeze([
          (p.tangentDisplacement[0] - b.tangentDisplacement[0]) / PROBE_FORCE,
          (p.tangentDisplacement[1] - b.tangentDisplacement[1]) / PROBE_FORCE,
        ]),
      })];
    }))));
  }

  const snapshotFor = (x) => interpolate(base, columns, contacts, x);
  const residualAt = (x) => residualFor({ contacts, slipContacts, x, snapshot: snapshotFor(x) });
  let x = slipContacts.flatMap((contact) => desiredSlipForce(contact, base[contact.declarationId]));
  let residual = residualAt(x);
  const history = [];

  for (let iteration = 0; iteration < policy.maximumIterations; iteration += 1) {
    const residualInfinityNorm = infinityNorm(residual);
    history.push(deepFreeze({ iteration, residualInfinityNorm }));
    if (residualInfinityNorm <= policy.forceTolerance) break;
    const jacobian = finiteDifferenceJacobian(x, residual, residualAt);
    const step = leastSquaresStep(jacobian, residual);
    if (!step) failContactFriction('Slip constitutive Jacobian is singular.', 'CONTACT_FRICTION_SLIP_JACOBIAN_SINGULAR', { history });
    const scale = Math.max(1, ...x.map(Math.abs));
    const limited = limitStep(step, 2 * scale);
    const objective = squaredNorm(residual);
    let accepted = null;
    for (let line = 0; line < policy.maximumLineSearchSteps; line += 1) {
      const alpha = 2 ** -line;
      const candidate = x.map((value, index) => value + alpha * limited[index]);
      const candidateResidual = residualAt(candidate);
      if (squaredNorm(candidateResidual) < objective) {
        accepted = { x: candidate, residual: candidateResidual };
        break;
      }
    }
    if (!accepted) failContactFriction('Slip constitutive line search failed.', 'CONTACT_FRICTION_SLIP_LINE_SEARCH_FAILED', { history });
    x = accepted.x;
    residual = accepted.residual;
  }

  const predictedResidual = infinityNorm(residual);
  if (predictedResidual > policy.forceTolerance) {
    failContactFriction('Slip constitutive solve did not converge.', 'CONTACT_FRICTION_SLIP_NON_CONVERGENCE', { history, predictedResidual });
  }
  const execution = runSolve({ contacts, states, slipContacts, x, buildAndSolve });
  const snapshot = stateSnapshot(contacts, states, execution);
  const exactResidual = residualFor({ contacts, slipContacts, x, snapshot });
  const residualInfinityNorm = infinityNorm(exactResidual);
  if (residualInfinityNorm > policy.forceTolerance) {
    failContactFriction('Final structural solve violates the converged slip constitutive residual.', 'CONTACT_FRICTION_AFFINE_RESPONSE_DRIFT', {
      predictedResidual,
      residualInfinityNorm,
    });
  }
  return deepFreeze({
    execution,
    slipForces: slipForceRows(slipContacts, x),
    snapshot,
    residualInfinityNorm,
    history: deepFreeze(history),
    responseEvidence: deepFreeze({ kind: 'FIXED_STATE_AFFINE_RESPONSE_V1', probeForce: PROBE_FORCE, variableCount: dimension }),
  });
}
