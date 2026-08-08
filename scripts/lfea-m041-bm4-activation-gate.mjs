#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  contactFrictionCandidateStateCount,
  normalizeContactFrictionDeclarations,
  proveUniqueAdmissibleContactFrictionState,
  resolveContactFrictionPolicy,
} from '../src/core/linear-fea-contact-friction-solver/index.js';
import {
  BM4_M040_FRICTION_AUTHORITY,
  BM4_M040_FRICTION_NODE_IDS,
  BM4_M040_FRICTION_STIFFNESS,
  BM4_M040_FRICTIONLESS_PLUS_Y_NODE_IDS,
} from './lfea-m040-bm4-friction-authority.mjs';

const contacts = normalizeContactFrictionDeclarations(BM4_M040_FRICTION_NODE_IDS.map((nodeId) => ({
  declarationId: `BM4-FRIC-${nodeId}`,
  nodeId: `BM4M035.N${nodeId}`,
  normalDof: 'UY',
  normalSense: 1,
  tangentDofs: ['UX', 'UZ'],
  gap: 0,
  frictionCoefficient: BM4_M040_FRICTION_AUTHORITY.source.frictionCoefficient,
  frictionStiffness: BM4_M040_FRICTION_STIFFNESS,
  initialState: 'STICK',
})));
const policy = resolveContactFrictionPolicy({}, contacts.length);
const candidateStateCount = contactFrictionCandidateStateCount(contacts);
const expectedCandidateStateCount = 3 ** BM4_M040_FRICTION_NODE_IDS.length;

assert.equal(contacts.length, 26);
assert.equal(candidateStateCount, expectedCandidateStateCount);
assert.equal(candidateStateCount, 2541865828329);
assert.ok(candidateStateCount > policy.maximumExactStateCandidates);
assert.deepEqual(
  contacts.map((row) => row.nodeId.replace('BM4M035.N', '')),
  [...BM4_M040_FRICTION_NODE_IDS],
);
assert.ok(BM4_M040_FRICTIONLESS_PLUS_Y_NODE_IDS.every((nodeId) => (
  !contacts.some((row) => row.nodeId.endsWith(nodeId))
)));

let structuralSolveCalls = 0;
assert.throws(
  () => proveUniqueAdmissibleContactFrictionState({
    contacts,
    policy,
    buildAndSolve: () => {
      structuralSolveCalls += 1;
      throw new Error('BM4 uniqueness gate must fail before any structural solve.');
    },
  }),
  (error) => error?.code === 'CONTACT_FRICTION_UNIQUENESS_PROOF_LIMIT_EXCEEDED'
    && error?.candidateStateCount === candidateStateCount,
);
assert.equal(structuralSolveCalls, 0, 'BM4 activation gate must not execute an output-fitting structural trial.');

const report = Object.freeze({
  schema: 'm041-bm4-friction-activation-gate/v1',
  sourceAuthority: 'M040_BM4_FRICTION_SOURCE_AUTHORITY',
  frictionContactCount: contacts.length,
  frictionlessPlusYNodeIds: BM4_M040_FRICTIONLESS_PLUS_Y_NODE_IDS,
  discreteStateCardinalityPerFrictionContact: 3,
  exactCandidateStateCount: candidateStateCount,
  exactProofPolicyLimit: policy.maximumExactStateCandidates,
  structuralSolveCalls: 0,
  outputFitUsed: false,
  disposition: Object.freeze({
    code: 'BM4_FRICTION_GLOBAL_UNIQUENESS_NOT_PROVEN',
    genericConstitutiveMechanicsQualified: true,
    controlledExactUniquenessQualified: true,
    bm4GlobalStateUniquenessQualified: false,
    qualifiedBm4Activation: false,
    nextRequirement: 'SCALABLE_GLOBAL_UNIQUENESS_PROOF_OR_INDEPENDENT_STATE_HISTORY_AUTHORITY',
  }),
});

assert.equal(BM4_M040_FRICTION_AUTHORITY.disposition.qualifiedBm4Activation, false);
assert.equal(report.disposition.qualifiedBm4Activation, false);
console.log(JSON.stringify(report, null, 2));
console.log('M041 BM4 friction activation gate: FAIL-CLOSED PASS');
