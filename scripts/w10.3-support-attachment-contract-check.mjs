#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  ATTACHMENT_EVIDENCE,
  ATTACHMENT_STATUS,
  buildSupportAttachmentModel,
  createEvidenceOnlyAttachmentProfile,
  createGeometricAttachmentProfile,
  validateEngineeringSupportProjection,
  validateSupportAttachmentAudit,
  validateSupportAttachmentModel,
  validateSupportAttachmentProfile,
} from '../src/core/support-restraints/index.js';
import {
  exactTopology,
  multiPortComponent,
  pipeComponent,
  point,
  sharedFixture,
  sourceNode,
  supportEvidence,
  supportRecord,
} from './w10.3-support-restraint-fixtures.mjs';

console.log('\n--- W10.3 Support Attachment Contract Checks ---');
checkEmptyAndContracts();
checkExplicitAttachments();
checkSourceRelations();
checkGeometricProjection();
checkAmbiguityAndUnits();
checkTargetGeometryAndIdentity();
checkEvidencePreservationAndDeterminism();
console.log('✅ W10.3 support attachment contracts passed.');

function checkEmptyAndContracts() {
  const shared = sharedFixture();
  const profile = createEvidenceOnlyAttachmentProfile('mm');
  const model = buildSupportAttachmentModel(shared, exactTopology(shared), profile);
  assert.equal(model.summary.supportCount, 0);
  assert.equal(validateSupportAttachmentProfile(profile).ok, true);
  assert.equal(validateEngineeringSupportProjection(model.supportProjection).ok, true);
  assert.equal(validateSupportAttachmentAudit(model.attachmentAudit).ok, true);
  assert.equal(validateSupportAttachmentModel(model).ok, true);
  assert.ok(Object.isFrozen(model));
}

function checkExplicitAttachments() {
  const pipe = pipeComponent('PIPE-E', point(0), point(100));
  const supports = [
    supportRecord('SUP-PORT', point(110), {
      supportEvidence: supportEvidence({ portReferences: 'PIPE-E:port:end' }),
    }),
    supportRecord('SUP-COMP', point(50), {
      supportEvidence: supportEvidence({ componentReferences: 'PIPE-E' }),
    }),
  ];
  const shared = sharedFixture({ components: [pipe], supports });
  const model = buildSupportAttachmentModel(shared, exactTopology(shared));
  assert.equal(model.summary.attachedCount, 2);
  const portAttachment = attachmentFor(model, 'SUP-PORT');
  assert.equal(portAttachment.evidenceType, ATTACHMENT_EVIDENCE.EXPLICIT_PORT);
  assert.equal(portAttachment.attachedPortKey, 'PIPE-E:port:end');
  assert.equal(portAttachment.distanceCanonical, 10);
  assert.ok(portAttachment.diagnostics.some((row) => row.code === 'EXPLICIT_ATTACHMENT_COORDINATE_OFFSET'));
  assert.equal(attachmentFor(model, 'SUP-COMP').attachedPortKey, null);
}

function checkSourceRelations() {
  const component = pipeComponent('PIPE-R', point(0), point(100), {
    sourceNodeKey: 'node:pipe-r', sourcePath: '/group/PIPE-R',
  });
  const support = supportRecord('SUP-R', point(50), {
    sourceNodeKey: 'node:sup-r', sourcePath: '/group/SUP-R',
  });
  const nodes = [
    sourceNode('parent'),
    sourceNode('node:pipe-r', 'parent', '/group/PIPE-R'),
    sourceNode('node:sup-r', 'parent', '/group/SUP-R'),
  ];
  const shared = sharedFixture({ components: [component], supports: [support], nodes });
  const model = buildSupportAttachmentModel(shared, exactTopology(shared));
  assert.equal(attachmentFor(model, 'SUP-R').evidenceType, ATTACHMENT_EVIDENCE.SOURCE_RELATION);

  const second = pipeComponent('PIPE-R2', point(100), point(200), {
    sourceNodeKey: 'node:pipe-r2', sourcePath: '/group/PIPE-R2',
  });
  const ambiguous = sharedFixture({
    components: [component, second],
    supports: [support],
    nodes: [...nodes, sourceNode('node:pipe-r2', 'parent', '/group/PIPE-R2')],
  });
  assert.equal(
    stateFor(buildSupportAttachmentModel(ambiguous, exactTopology(ambiguous)), 'SUP-R').status,
    ATTACHMENT_STATUS.AMBIGUOUS,
  );

  const identityOnly = sharedFixture({
    components: [pipeComponent('PIPE-I', point(0), point(100), {
      identity: { lineId: 'L-I', systemId: 'SYS-I' }, sourcePath: '/pipes/PIPE-I',
    })],
    supports: [supportRecord('SUP-I', point(50), {
      identity: { lineId: 'L-I', systemId: 'SYS-I' }, sourcePath: '/supports/SUP-I',
    })],
  });
  assert.equal(buildSupportAttachmentModel(identityOnly, exactTopology(identityOnly)).attachments.length, 0);
}

function checkGeometricProjection() {
  const shared = sharedFixture({
    components: [pipeComponent('PIPE-G', point(0), point(100))],
    supports: [
      supportRecord('SUP-END', point(0)),
      supportRecord('SUP-MID', point(50, 0.5)),
      supportRecord('SUP-EQUAL', point(75, 1)),
      supportRecord('SUP-ABOVE', point(25, 1.01)),
    ],
  });
  const exact = buildSupportAttachmentModel(shared, exactTopology(shared));
  assert.equal(exact.attachments.length, 0);
  const projected = buildSupportAttachmentModel(
    shared,
    exactTopology(shared),
    createGeometricAttachmentProfile('mm', 1),
  );
  assert.equal(projected.summary.attachedCount, 3);
  assert.equal(attachmentFor(projected, 'SUP-MID').segmentParameter, 0.5);
  assert.equal(attachmentFor(projected, 'SUP-EQUAL').distanceCanonical, 1);
  assert.equal(stateFor(projected, 'SUP-ABOVE').status, ATTACHMENT_STATUS.UNATTACHED);
}

function checkAmbiguityAndUnits() {
  const shared = sharedFixture({
    components: [
      pipeComponent('P-A', point(0, -1), point(100, -1)),
      pipeComponent('P-B', point(0, 1), point(100, 1)),
    ],
    supports: [supportRecord('SUP-P', point(50, 0))],
  });
  const projected = buildSupportAttachmentModel(
    shared,
    exactTopology(shared),
    createGeometricAttachmentProfile('mm', 1),
  );
  assert.equal(stateFor(projected, 'SUP-P').status, ATTACHMENT_STATUS.AMBIGUOUS);

  const unknown = sharedFixture({
    unit: 'unknown',
    components: [pipeComponent('P-U', point(0), point(100))],
    supports: [supportRecord('SUP-U', point(50))],
  });
  const blocked = buildSupportAttachmentModel(
    unknown,
    exactTopology(unknown),
    createGeometricAttachmentProfile('unknown', 1),
  );
  assert.equal(stateFor(blocked, 'SUP-U').status, ATTACHMENT_STATUS.UNIT_BLOCKED);

  const missing = sharedFixture({
    components: [pipeComponent('P-M', point(0), point(100))],
    supports: [supportRecord('SUP-M', null)],
  });
  assert.equal(
    stateFor(buildSupportAttachmentModel(missing, exactTopology(missing)), 'SUP-M').status,
    ATTACHMENT_STATUS.INVALID_SUPPORT_POSITION,
  );
}

function checkTargetGeometryAndIdentity() {
  const teeNoCenter = multiPortComponent('TEE-N', [point(-10), point(10), point(0, 10)]);
  const teeCenter = multiPortComponent('TEE-C', [point(90), point(110), point(100, 10)], {
    center: point(100),
  });
  const cross = multiPortComponent('CROSS-C', [
    point(190), point(210), point(200, 10), point(200, -10),
  ], { center: point(200), type: 'CROSS' });
  const shared = sharedFixture({ components: [teeNoCenter, teeCenter, cross] });
  const model = buildSupportAttachmentModel(shared, exactTopology(shared));
  assert.equal(model.targets.filter((row) => row.componentKey === 'TEE-N' && row.targetType.includes('LEG')).length, 0);
  assert.equal(model.targets.filter((row) => row.componentKey === 'TEE-C' && row.targetType.includes('LEG')).length, 3);
  assert.equal(model.targets.filter((row) => row.componentKey === 'CROSS-C' && row.targetType.includes('LEG')).length, 4);

  const conflict = sharedFixture({
    components: [pipeComponent('P-CF', point(0), point(100), {
      identity: { lineId: 'L1', systemId: 'SYS-A' },
    })],
    supports: [supportRecord('SUP-CF', point(50), {
      identity: { lineId: 'L1', systemId: 'SYS-B' },
    })],
  });
  const conflictModel = buildSupportAttachmentModel(
    conflict,
    exactTopology(conflict),
    createGeometricAttachmentProfile('mm', 1),
  );
  assert.equal(stateFor(conflictModel, 'SUP-CF').status, ATTACHMENT_STATUS.IDENTITY_CONFLICT);
  assert.ok(conflictModel.attachmentAudit.summary.identityConflictCount > 0);
}

function checkEvidencePreservationAndDeterminism() {
  const supports = [
    supportRecord('S-D1', point(-5), {
      sourceEntityId: 'DUPLICATE',
      supportEvidence: supportEvidence({ componentReferences: 'P-D', verticalGaps: 2 }),
    }),
    supportRecord('S-D2', point(5), {
      sourceEntityId: 'DUPLICATE',
      supportEvidence: supportEvidence({ componentReferences: 'P-D' }),
    }),
  ];
  const shared = sharedFixture({
    components: [pipeComponent('P-D', point(-1e9), point(1e9))],
    supports,
  });
  const before = JSON.stringify(shared);
  const first = buildSupportAttachmentModel(shared, exactTopology(shared));
  const second = buildSupportAttachmentModel(shared, exactTopology(shared));
  assert.equal(first.semanticHash, second.semanticHash);
  assert.equal(new Set(first.supportStates.map((row) => row.supportKey)).size, 2);
  assert.equal(JSON.stringify(shared), before);
  assert.equal(first.supportProjection.supports[0].gapEvidence.vertical[0].value, 2);
}

function attachmentFor(model, supportKey) {
  return model.attachments.find((row) => row.supportKey === supportKey);
}

function stateFor(model, supportKey) {
  return model.supportStates.find((row) => row.supportKey === supportKey);
}
