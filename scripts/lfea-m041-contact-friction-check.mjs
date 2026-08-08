#!/usr/bin/env node
import assert from 'node:assert/strict';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  CONTACT_FRICTION_CLASSIFICATION,
  CONTACT_FRICTION_STATE,
  compileContactFrictionExecution,
} from '../src/core/linear-fea-contact-friction-solver/index.js';
import { BM4_M040_FRICTION_STIFFNESS } from './lfea-m040-bm4-friction-authority.mjs';

const POLICY = Object.freeze({
  forceTolerance: 1e-6,
  penetrationTolerance: 1e-9,
  directionCosineTolerance: 1e-8,
  maximumIterations: 16,
  maximumLineSearchSteps: 12,
});

function contact(id = 'C1', nodeId = 'N1', overrides = {}) {
  return {
    declarationId: id,
    nodeId,
    normalDof: 'UY',
    normalSense: 1,
    tangentDofs: ['UX', 'UZ'],
    gap: 0,
    frictionCoefficient: 0.3,
    frictionStiffness: 1000,
    initialState: 'STICK',
    ...overrides,
  };
}

function executionRecord({ tag, reactions, displacement }) {
  return Object.freeze({
    semanticHash: semanticHash({ tag, reactions, displacement }),
    reactions: Object.freeze(reactions),
    displacement: Object.freeze(displacement),
  });
}

function stateOf(request, declarationId) {
  return request.state.find((row) => row.declarationId === declarationId)?.state;
}

function springOf(request, declarationId, dof) {
  return request.stickSprings.find((row) => row.contactDeclarationId === declarationId && row.dof === dof)?.stiffness ?? 0;
}

function slipOf(request, declarationId, dof) {
  return request.slipForces.find((row) => row.declarationId === declarationId)?.components
    .find((row) => row.dof === dof)?.value ?? 0;
}

function singleBuilder({ normalReaction = 1000, openUy = 0.01, loadX = 0, loadZ = 0, structuralStiffness = 1000 } = {}) {
  return (request) => {
    const state = stateOf(request, 'C1');
    const active = state !== CONTACT_FRICTION_STATE.OPEN;
    const kx = structuralStiffness + springOf(request, 'C1', 'UX');
    const kz = structuralStiffness + springOf(request, 'C1', 'UZ');
    const ux = (loadX + slipOf(request, 'C1', 'UX')) / kx;
    const uz = (loadZ + slipOf(request, 'C1', 'UZ')) / kz;
    const uy = active ? 0 : openUy;
    const reactions = active ? [{ nodeId: 'N1', dof: 'UY', value: normalReaction }] : [];
    const displacement = [
      { nodeId: 'N1', dof: 'UX', value: ux },
      { nodeId: 'N1', dof: 'UY', value: uy },
      { nodeId: 'N1', dof: 'UZ', value: uz },
    ];
    return executionRecord({ tag: { state, kx, kz, ux, uy, uz, request }, reactions, displacement });
  };
}

function solve2x2(a, b, c, d, p, q) {
  const det = a * d - b * c;
  return [(d * p - b * q) / det, (-c * p + a * q) / det];
}

function coupledBuilder(request) {
  const ids = ['C1', 'C2'];
  const states = ids.map((id) => stateOf(request, id));
  const k1 = 1000 + springOf(request, 'C1', 'UX');
  const k2 = 1000 + springOf(request, 'C2', 'UX');
  const rhs1 = 900 + slipOf(request, 'C1', 'UX');
  const rhs2 = 800 + slipOf(request, 'C2', 'UX');
  const [u1, u2] = solve2x2(k1, -200, -200, k2, rhs1, rhs2);
  const z1 = slipOf(request, 'C1', 'UZ') / (1000 + springOf(request, 'C1', 'UZ'));
  const z2 = slipOf(request, 'C2', 'UZ') / (1000 + springOf(request, 'C2', 'UZ'));
  const displacement = [
    { nodeId: 'N1', dof: 'UX', value: u1 }, { nodeId: 'N1', dof: 'UY', value: 0 }, { nodeId: 'N1', dof: 'UZ', value: z1 },
    { nodeId: 'N2', dof: 'UX', value: u2 }, { nodeId: 'N2', dof: 'UY', value: 0 }, { nodeId: 'N2', dof: 'UZ', value: z2 },
  ];
  const reactions = [
    { nodeId: 'N1', dof: 'UY', value: 1000 },
    { nodeId: 'N2', dof: 'UY', value: 800 },
  ];
  return executionRecord({ tag: { states, request, u1, u2, z1, z2 }, reactions, displacement });
}

function selected(result, id = 'C1') {
  return result.selectedState.find((row) => row.declarationId === id);
}

function expectCode(fn, code) {
  assert.throws(fn, (error) => error?.code === code, `expected ${code}`);
}

assert.ok(Math.abs(BM4_M040_FRICTION_STIFFNESS - 175126835.24647635) < 1e-6);

const open = compileContactFrictionExecution({
  contacts: [contact('C1', 'N1', { initialState: 'OPEN' })],
  buildAndSolve: singleBuilder({ openUy: 0.01 }),
  policy: POLICY,
});
assert.equal(selected(open).state, 'OPEN');
assert.equal(selected(open).tangentialMagnitude, 0);
assert.equal(open.classification, CONTACT_FRICTION_CLASSIFICATION.PHYSICAL_FRICTION);

const penetration = compileContactFrictionExecution({
  contacts: [contact('C1', 'N1', { initialState: 'OPEN' })],
  buildAndSolve: singleBuilder({ openUy: -0.01 }),
  policy: POLICY,
});
assert.equal(selected(penetration).state, 'STICK');
assert.equal(penetration.history[0].nextState[0].state, 'STICK');

const liftOff = compileContactFrictionExecution({
  contacts: [contact()],
  buildAndSolve: singleBuilder({ normalReaction: -100, openUy: 0.02 }),
  policy: POLICY,
});
assert.equal(selected(liftOff).state, 'OPEN');
assert.equal(liftOff.history[0].nextState[0].state, 'OPEN');

const stick = compileContactFrictionExecution({
  contacts: [contact()],
  buildAndSolve: singleBuilder({ loadX: 300 }),
  policy: POLICY,
});
assert.equal(selected(stick).state, 'STICK');
assert.ok(Math.abs(selected(stick).tangentialMagnitude - 150) < 1e-9);
assert.ok(Math.abs(selected(stick).coulombLimit - 300) < 1e-9);
assert.equal(stick.constitutiveResidualInfinityNorm, 0);

const slip = compileContactFrictionExecution({
  contacts: [contact()],
  buildAndSolve: singleBuilder({ loadX: 900 }),
  policy: POLICY,
});
assert.equal(selected(slip).state, 'SLIP');
assert.ok(Math.abs(selected(slip).tangentialMagnitude - 300) < 1e-6);
assert.ok(selected(slip).oppositionCosine <= -1 + 1e-10);
assert.ok(slip.constitutiveResidualInfinityNorm <= POLICY.forceTolerance);
assert.equal(slip.history[0].nextState[0].state, 'SLIP');

const frictionlessRequests = [];
const frictionless = compileContactFrictionExecution({
  contacts: [contact('C1', 'N1', { frictionCoefficient: 0, frictionStiffness: 0 })],
  buildAndSolve: (request) => {
    frictionlessRequests.push(request);
    return singleBuilder({ loadX: 900 })(request);
  },
  policy: POLICY,
});
assert.equal(selected(frictionless).state, 'STICK');
assert.equal(selected(frictionless).tangentialMagnitude, 0);
assert.ok(frictionlessRequests.every((request) => request.stickSprings.length === 0 && request.slipForces.length === 0));
assert.equal(frictionless.classification, CONTACT_FRICTION_CLASSIFICATION.PHYSICAL_CONTACT);

const coupledContacts = [contact('C1', 'N1'), contact('C2', 'N2')];
const coupled = compileContactFrictionExecution({ contacts: coupledContacts, buildAndSolve: coupledBuilder, policy: POLICY });
assert.deepEqual(coupled.selectedState.map((row) => row.state), ['SLIP', 'SLIP']);
assert.ok(Math.abs(selected(coupled, 'C1').tangentialMagnitude - 300) < 1e-6);
assert.ok(Math.abs(selected(coupled, 'C2').tangentialMagnitude - 240) < 1e-6);
assert.deepEqual(coupled.history[0].nextState.map((row) => row.state), ['SLIP', 'SLIP']);
const coupledReordered = compileContactFrictionExecution({ contacts: [...coupledContacts].reverse(), buildAndSolve: coupledBuilder, policy: POLICY });
assert.equal(coupled.semanticHash, coupledReordered.semanticHash, 'input contact ordering must not change the sealed result');

expectCode(() => compileContactFrictionExecution({
  contacts: [contact()],
  buildAndSolve: singleBuilder({ loadX: 600 }),
  policy: POLICY,
}), 'CONTACT_FRICTION_NON_UNIQUE_STATE');

expectCode(() => compileContactFrictionExecution({
  contacts: [contact()],
  buildAndSolve: (request) => {
    const active = stateOf(request, 'C1') !== 'OPEN';
    return singleBuilder({ normalReaction: active ? -100 : 1000, openUy: active ? 0 : -0.01 })(request);
  },
  policy: POLICY,
}), 'CONTACT_FRICTION_CYCLE');

expectCode(() => compileContactFrictionExecution({
  contacts: [contact()],
  classification: CONTACT_FRICTION_CLASSIFICATION.PHYSICAL_CONTACT,
  buildAndSolve: singleBuilder(),
  policy: POLICY,
}), 'CONTACT_FRICTION_CLASSIFICATION_MISMATCH');

const derived = Object.freeze({
  classification: CONTACT_FRICTION_CLASSIFICATION.DERIVED,
  rule: 'L21=L20-L19',
  operating: Object.freeze([10, -4, 7]),
  sustained: Object.freeze([3, -1, 2]),
});
const expansion = derived.operating.map((value, index) => value - derived.sustained[index]);
assert.deepEqual(expansion, [7, -3, 5]);
assert.equal(derived.classification, 'LINEAR_DERIVED_FROM_NONLINEAR_BASES');

console.log(JSON.stringify({
  schema: 'm041-contact-friction-qualification/v1',
  status: 'PASS',
  fixtures: {
    open: selected(open),
    penetration: selected(penetration),
    liftOff: selected(liftOff),
    stick: selected(stick),
    slip: selected(slip),
    frictionless: selected(frictionless),
    coupled: coupled.selectedState,
    permutationInvariantHash: coupled.semanticHash,
    nonUniqueState: 'FAIL_CLOSED_PASS',
    cycle: 'FAIL_CLOSED_PASS',
    derivedExpansion: expansion,
  },
}, null, 2));
