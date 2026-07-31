#!/usr/bin/env node

/**
 * [SIMULATED] Phase 3 governed interface and reaction-recovery qualification.
 * Analytical fixtures qualify implementation behaviour only; they are not a
 * substitute for the real-model and commercial gates in AUD-A7-001.
 */

import assert from 'node:assert/strict';
import {
  compileLinearPipingInterfaceSet,
  createLinearPipingInterfaceEnvelope,
  recoverLinearPipingInterfaceLoads,
  requireLinearPipingInterfaceSet,
  reverseInterfaceResultSign,
  sealInterfaceProfile,
} from '../src/core/linear-piping-interface/index.js';
import {
  deriveLinearPipingParentSet,
  runLinearPipingAnalysis,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import {
  cantileverCompilation,
  cantileverWithSettlementSlotCompilation,
  frameElements,
  solverProfile,
  tipLoadCase,
  tipLoadPrimitive,
} from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';
import {
  exactTopology,
  pipeComponent,
  point,
  sharedFixture,
  supportEvidence,
  supportRecord,
} from './w10.3-support-restraint-fixtures.mjs';

function test(id, name, body) {
  body();
  console.log(`${id} PASS ${name}`);
}

function expectCode(body, expectedCode) {
  assert.throws(body, (error) => {
    assert.equal(error?.code, expectedCode, `expected ${expectedCode}, received ${error?.code}`);
    return true;
  });
}

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

function interfaceProfile() {
  return sealInterfaceProfile({
    schema: 'linear-piping-interface-profile/v1',
    profileId: 'LINEAR-PIPING-INTERFACE-R1',
    basisTolerance: { value: 1e-12, source: 'PHASE-3-ANALYTICAL-PROFILE' },
    positionTolerance: { value: 1e-12, source: 'PHASE-3-ANALYTICAL-PROFILE' },
    offsetTolerance: { value: 1e-12, source: 'PHASE-3-ANALYTICAL-PROFILE' },
    semanticHash: '',
  });
}

function supportAuthorities(options = {}) {
  const evidence = supportEvidence({
    componentReferences: 'PIPINGELEMENT-14',
    supportTypes: 'ANCHOR',
    vertical: options.gap ? undefined : 'FIXED',
    lateral: 'FIXED',
    longitudinal: 'FIXED',
    rotational: 'FIXED',
    verticalGaps: options.gap ? 2 : undefined,
  });
  const shared = sharedFixture({
    components: [pipeComponent('PIPINGELEMENT-14', point(0), point(2400))],
    supports: [supportRecord('SUP-ANCHOR-01', point(0), {
      sourceType: 'ANCHOR',
      supportEvidence: evidence,
    })],
  });
  const attachmentModel = buildSupportAttachmentModel(shared, exactTopology(shared));
  const restraintModel = buildRestraintCapabilityModel(attachmentModel);
  return { attachmentModel, restraintModel };
}

function definition(compilation, authorities, overrides = {}) {
  const node = compilation.model.nodes.find((row) => row.nodeId === 'N-000120');
  const attachment = authorities.attachmentModel.attachments[0];
  const restraint = authorities.restraintModel.restraints[0];
  const dofMappings = compilation.model.constraints
    .filter((row) => row.nodeId === 'N-000120')
    .map((row) => ({
      dof: row.dof,
      behavior: row.behavior,
      constraintId: row.constraintId,
      stiffness: row.stiffness ?? null,
    }));
  return {
    interfaceId: 'IF-ANCHOR-01',
    interfaceKind: 'ANCHOR',
    nodeId: node.nodeId,
    sourceEntityId: 'PIPINGELEMENT-14',
    supportBinding: {
      supportKey: attachment.supportKey,
      attachmentId: attachment.attachmentId,
      restraintId: restraint.restraintId,
    },
    basis: {
      origin: node.position,
      e1: { x: 0, y: 1, z: 0 },
      e2: { x: -1, y: 0, z: 0 },
      e3: { x: 0, y: 0, z: 1 },
    },
    referencePointGlobal: { x: 0, y: 0.2, z: 0 },
    leverReferenceToNodeLocal: { x: -0.2, y: 0, z: 0 },
    dofMappings,
    reportingSignConvention: 'FORCE_ON_INTERFACE_FROM_PIPE',
    sourceEvidence: {
      sourceId: 'PROJECT-INTERFACE-REGISTER',
      sourceRevision: '01',
      sourceSemanticHash: 'fnv1a64:abababababababab',
    },
    allowableProfileHash: null,
    ...overrides,
  };
}

function interfaceSet(compilation, authorities = supportAuthorities(), overrides = {}) {
  return compileLinearPipingInterfaceSet({
    compilation,
    supportAttachmentModel: authorities.attachmentModel,
    restraintCapabilityModel: authorities.restraintModel,
    definitions: [definition(compilation, authorities)],
    profile: interfaceProfile(),
    ...overrides,
  });
}

function analysis(compilation, loadCase) {
  const parentInput = {
    compilation,
    loadCase,
    frameElements: frameElements(),
    pipingComponents: [],
    solverProfile: solverProfile(),
    recoveryProfile: recoveryProfile(),
  };
  return runLinearPipingAnalysis({
    schema: 'linear-piping-analysis-request/v1',
    analysisIdentity: `PIPE-INTERFACE-${loadCase.loadCaseId}`,
    analysisRevision: 1,
    ...parentInput,
    expectedParents: deriveLinearPipingParentSet(parentInput),
  }, { factorizationCache: null });
}

console.log('\n--- [SIMULATED] Linear piping interface authority check ---');

const compilation = cantileverCompilation();
const authorities = supportAuthorities();
const set = interfaceSet(compilation, authorities);
const loadCase1 = tipLoadCase(compilation);
const result1 = analysis(compilation, loadCase1);
const recovery1 = recoverLinearPipingInterfaceLoads({
  interfaceSet: set,
  analysisResult: result1,
  loadCase: loadCase1,
});

test('FEA-IF-01', 'Governed anchor binds support evidence and all six B-2.5 constraints', () => {
  assert.equal(set.interfaces.length, 1);
  assert.equal(set.interfaces[0].dofMappings.length, 6);
  assert.equal(set.interfaces[0].supportBinding.supportKey, 'SUP-ANCHOR-01');
  assert.equal(set.interfaces[0].basisQualification.accepted, true);
  assert.equal(set.mechanicalModelSemanticHash, compilation.mechanicalModelSemanticHash);
  assert.ok(Object.isFrozen(set));
});

test('FEA-IF-02', 'Left-handed frame is rejected rather than repaired', () => {
  const bad = definition(compilation, authorities, {
    basis: {
      origin: { x: 0, y: 0, z: 0 },
      e1: { x: 0, y: 1, z: 0 },
      e2: { x: 1, y: 0, z: 0 },
      e3: { x: 0, y: 0, z: 1 },
    },
  });
  expectCode(() => interfaceSet(compilation, authorities, { definitions: [bad] }), 'BASIS_NOT_ORTHONORMAL_RIGHT_HANDED');
});

test('FEA-IF-03', 'Inconsistent reference point and lever are blocked', () => {
  const bad = definition(compilation, authorities, {
    referencePointGlobal: { x: 0, y: 0.3, z: 0 },
  });
  expectCode(() => interfaceSet(compilation, authorities, { definitions: [bad] }), 'PIPING_INTERFACE_OFFSET_INCONSISTENT');
});

test('FEA-IF-04', 'Support or anchor without governed binding is blocked', () => {
  const bad = definition(compilation, authorities, { supportBinding: null });
  expectCode(() => interfaceSet(compilation, authorities, { definitions: [bad] }), 'PIPING_INTERFACE_SUPPORT_BINDING_REQUIRED');
});

test('FEA-IF-B01', 'Gap restraint remains outside the linear interface package', () => {
  const gapAuthorities = supportAuthorities({ gap: true });
  expectCode(
    () => interfaceSet(compilation, gapAuthorities),
    'PIPING_INTERFACE_NONLINEAR_RESTRAINT_BLOCKED',
  );
});

test('FEA-RXN-01', 'Reactions are grouped, sign-declared, rotated and transferred to the reference point', () => {
  const row = recovery1.results[0];
  assert.equal(recovery1.loadCaseId, 'LC-TIP-01');
  assert.deepEqual(recovery1.units, { force: 'N', moment: 'N*m', length: 'm' });
  close(row.forceGlobal.x, 0);
  close(row.forceGlobal.y, 1500);
  close(row.forceGlobal.z, -900);
  close(row.momentAtNodeGlobal.x, 340);
  close(row.momentAtNodeGlobal.y, 2160);
  close(row.momentAtNodeGlobal.z, 3600);
  close(row.forceLocal.x, 1500);
  close(row.forceLocal.y, 0);
  close(row.forceLocal.z, -900);
  close(row.momentAtNodeLocal.x, 2160);
  close(row.momentAtNodeLocal.y, -340);
  close(row.momentAtNodeLocal.z, 3600);
  close(row.momentAtReferenceLocal.x, 2160);
  close(row.momentAtReferenceLocal.y, -520);
  close(row.momentAtReferenceLocal.z, 3600);
  assert.ok(row.formulaIds.includes('M_REFERENCE_EQUALS_M_NODE_PLUS_R_REFERENCE_TO_NODE_CROSS_F'));
});

test('FEA-RXN-02', 'Opposite force sense is explicit and exactly reversible', () => {
  const original = recovery1.results[0];
  const reversed = reverseInterfaceResultSign(original);
  assert.equal(reversed.reportingSignConvention, 'FORCE_ON_PIPE_FROM_INTERFACE');
  close(reversed.forceGlobal.y, -original.forceGlobal.y);
  close(reversed.momentAtReferenceLocal.y, -original.momentAtReferenceLocal.y);
  assert.notEqual(reversed.semanticHash, original.semanticHash);
});

test('FEA-RXN-03', 'Interface set stale against a changed stiffness state is rejected', () => {
  const changedCompilation = cantileverWithSettlementSlotCompilation();
  const changedSet = interfaceSet(changedCompilation, authorities);
  expectCode(
    () => recoverLinearPipingInterfaceLoads({
      interfaceSet: changedSet,
      analysisResult: result1,
      loadCase: loadCase1,
    }),
    'PIPING_INTERFACE_RESULT_STALE',
  );
});

const loadCase2 = tipLoadCase(compilation, {
  loadCaseId: 'LC-TIP-02',
  primitives: [tipLoadPrimitive({
    primitiveId: 'LP-TIP-N122-DOUBLE',
    force: { fx: 0, fy: 3000, fz: -1800 },
    moment: { mx: 680, my: 0, mz: 0 },
  })],
});
const recovery2 = recoverLinearPipingInterfaceLoads({
  interfaceSet: set,
  analysisResult: analysis(compilation, loadCase2),
  loadCase: loadCase2,
});

test('FEA-ENV-01', 'Component envelopes retain deterministic governing case identity', () => {
  const first = createLinearPipingInterfaceEnvelope({
    envelopeId: 'ENV-ANCHOR-01',
    recoveries: [recovery2, recovery1],
  });
  const second = createLinearPipingInterfaceEnvelope({
    envelopeId: 'ENV-ANCHOR-01',
    recoveries: [recovery1, recovery2],
  });
  assert.equal(first.semanticHash, second.semanticHash);
  assert.equal(
    first.interfaces[0].components.forceLocal.x.loadCaseId,
    'LC-TIP-02',
  );
  close(first.interfaces[0].components.forceLocal.x.value, 3000);
  assert.equal(
    first.interfaces[0].components.momentAtReferenceLocal.y.loadCaseId,
    'LC-TIP-02',
  );
  close(first.interfaces[0].components.momentAtReferenceLocal.y.value, -1040);
});

test('FEA-IF-05', 'Two interfaces cannot own the same node/DOF reaction', () => {
  const duplicate = definition(compilation, authorities, {
    interfaceId: 'IF-ANCHOR-02',
  });
  expectCode(
    () => interfaceSet(compilation, authorities, {
      definitions: [definition(compilation, authorities), duplicate],
    }),
    'PIPING_INTERFACE_REACTION_OWNERSHIP_DUPLICATE',
  );
});

test('FEA-IF-06', 'Tampered interface identity is rejected by its semantic hash', () => {
  const tampered = structuredClone(set);
  tampered.interfaces[0].interfaceId = 'IF-TAMPERED';
  expectCode(() => requireLinearPipingInterfaceSet(tampered), 'PIPING_INTERFACE_HASH_MISMATCH');
});

test('FEA-IF-07', 'Interface compilation does not mutate caller declarations', () => {
  const source = definition(compilation, authorities);
  const before = JSON.stringify(source);
  interfaceSet(compilation, authorities, { definitions: [source] });
  assert.equal(JSON.stringify(source), before);
});

test('FEA-IF-08', 'Non-finite frame or reference coordinates fail at the public boundary', () => {
  const bad = definition(compilation, authorities, {
    referencePointGlobal: { x: Number.NaN, y: 0, z: 0 },
  });
  expectCode(() => interfaceSet(compilation, authorities, { definitions: [bad] }), 'PIPING_INTERFACE_POINT_INVALID');
});

console.log('\n[SIMULATED] Linear piping interface authority check PASS\n');
