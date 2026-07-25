#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
  RESTRAINT_BASIS,
  RESTRAINT_QUALIFICATIONS,
  RESTRAINT_STATES,
  validateRestraintCapabilityAudit,
  validateRestraintCapabilityModel,
} from '../src/core/support-restraints/index.js';
import {
  exactTopology,
  pipeComponent,
  point,
  sharedFixture,
  supportEvidence,
  supportRecord,
} from './w10.3-support-restraint-fixtures.mjs';

console.log('\n--- W10.3 Restraint Capability Contract Checks ---');
checkTypeClassification();
checkExplicitPrecedenceAndConflict();
checkGapStiffnessFrictionEvidence();
checkBlockedAndUnresolvedStates();
console.log('✅ W10.3 restraint capability contracts passed.');

function checkTypeClassification() {
  const pipe = pipeComponent('PIPE-C', point(0), point(100));
  const supports = [
    typedSupport('ANCHOR', 'ANCHOR'),
    typedSupport('REST', 'REST'),
    typedSupport('HANGER', 'HANGER'),
    typedSupport('GUIDE', 'GUIDE'),
    typedSupport('STOP', 'LINE_STOP'),
    typedSupport('LIMIT', 'LIMIT'),
    typedSupport('SPRING', 'SPRING'),
    typedSupport('UNKNOWN', 'UNMAPPED'),
  ];
  const model = restraintModel(pipe, supports);
  assert.equal(restraintFor(model, 'ANCHOR').rotational.state, RESTRAINT_STATES.RESTRAINED);
  assert.equal(restraintFor(model, 'REST').vertical.state, RESTRAINT_STATES.RESTRAINED);
  assert.equal(restraintFor(model, 'HANGER').vertical.state, RESTRAINT_STATES.RESTRAINED);
  assert.equal(restraintFor(model, 'GUIDE').lateral.state, RESTRAINT_STATES.RESTRAINED);
  assert.equal(restraintFor(model, 'GUIDE').lateral.basis, RESTRAINT_BASIS.TYPE);
  assert.equal(restraintFor(model, 'STOP').longitudinal.state, RESTRAINT_STATES.RESTRAINED);
  assert.equal(restraintFor(model, 'LIMIT').longitudinal.state, RESTRAINT_STATES.RESTRAINED);
  assert.equal(restraintFor(model, 'SPRING').vertical.state, RESTRAINT_STATES.SPRING);
  assert.ok(restraintFor(model, 'SPRING').diagnostics.some((row) => (
    row.code === 'SPRING_STIFFNESS_UNRESOLVED'
  )));
  assert.equal(restraintFor(model, 'UNKNOWN').vertical.state, RESTRAINT_STATES.UNKNOWN);
  assert.equal(validateRestraintCapabilityAudit(model.restraintAudit).ok, true);
  assert.equal(validateRestraintCapabilityModel(model).ok, true);
  assert.ok(Object.isFrozen(model));
}

function checkExplicitPrecedenceAndConflict() {
  const pipe = pipeComponent('PIPE-E', point(0), point(100));
  const supports = [
    supportRecord('EXPLICIT', point(50), {
      supportEvidence: supportEvidence({
        componentReferences: 'PIPE-E',
        supportTypes: 'GUIDE',
        vertical: 'FREE',
        lateral: 'RESTRAINED',
        longitudinal: 'GAP',
      }),
    }),
    supportRecord('CONFLICT', point(50), {
      supportEvidence: supportEvidence({
        componentReferences: 'PIPE-E',
        vertical: ['RESTRAINED', 'FREE'],
      }),
    }),
  ];
  const model = restraintModel(pipe, supports);
  const explicit = restraintFor(model, 'EXPLICIT');
  assert.equal(explicit.vertical.state, RESTRAINT_STATES.FREE);
  assert.equal(explicit.vertical.basis, RESTRAINT_BASIS.EXPLICIT);
  assert.equal(explicit.lateral.state, RESTRAINT_STATES.RESTRAINED);
  assert.equal(explicit.longitudinal.state, RESTRAINT_STATES.GAP);
  assert.equal(explicit.qualification, RESTRAINT_QUALIFICATIONS.PARTIAL);
  const conflict = restraintFor(model, 'CONFLICT');
  assert.equal(conflict.vertical.state, RESTRAINT_STATES.CONFLICT);
  assert.equal(conflict.qualification, RESTRAINT_QUALIFICATIONS.CONFLICTED);
}

function checkGapStiffnessFrictionEvidence() {
  const pipe = pipeComponent('PIPE-P', point(0), point(100));
  const supports = [
    supportRecord('PARAM', point(50), {
      supportEvidence: supportEvidence({
        componentReferences: 'PIPE-P',
        supportTypes: 'SPRING',
        verticalGaps: 2,
        lateralGaps: 3,
        longitudinalGaps: 4,
        stiffness: 25,
        springRate: 10,
        friction: 0.3,
      }),
    }),
    supportRecord('MISSING', point(50), {
      supportEvidence: supportEvidence({ componentReferences: 'PIPE-P' }),
    }),
  ];
  const model = restraintModel(pipe, supports);
  const param = restraintFor(model, 'PARAM');
  assert.equal(param.gapEvidence.vertical[0].value, 2);
  assert.equal(param.stiffnessEvidence[0].value, 25);
  assert.equal(param.springRateEvidence[0].value, 10);
  assert.equal(param.frictionEvidence[0].value, 0.3);
  const missing = restraintFor(model, 'MISSING');
  assert.equal(missing.gapEvidence.vertical.length, 0);
  assert.equal(missing.stiffnessEvidence.length, 0);
  assert.equal(missing.springRateEvidence.length, 0);
  assert.equal(missing.frictionEvidence.length, 0);
}

function checkBlockedAndUnresolvedStates() {
  const pipe = pipeComponent('PIPE-B', point(0), point(100));
  const support = supportRecord('BLOCKED', point(50), {
    supportEvidence: supportEvidence({ supportTypes: 'GUIDE' }),
    sourcePath: '/supports/BLOCKED',
  });
  const shared = sharedFixture({ components: [pipe], supports: [support] });
  const attachment = buildSupportAttachmentModel(shared, exactTopology(shared));
  const model = buildRestraintCapabilityModel(attachment);
  const blocked = restraintFor(model, 'BLOCKED');
  assert.equal(blocked.qualification, RESTRAINT_QUALIFICATIONS.BLOCKED);
  assert.equal(blocked.solverEligible, false);
  assert.equal(blocked.lateral.state, RESTRAINT_STATES.RESTRAINED);
  assert.equal(model.semanticHash, buildRestraintCapabilityModel(attachment).semanticHash);
}

function typedSupport(key, type) {
  return supportRecord(key, point(50), {
    supportEvidence: supportEvidence({
      componentReferences: 'PIPE-C',
      supportTypes: type,
    }),
  });
}

function restraintModel(pipe, supports) {
  const shared = sharedFixture({ components: [pipe], supports });
  return buildRestraintCapabilityModel(
    buildSupportAttachmentModel(shared, exactTopology(shared)),
  );
}

function restraintFor(model, supportKey) {
  return model.restraints.find((row) => row.supportKey === supportKey);
}
