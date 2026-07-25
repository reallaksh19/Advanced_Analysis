#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  ATTACHMENT_EVIDENCE,
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
  createGeometricAttachmentProfile,
  RESTRAINT_QUALIFICATIONS,
  RESTRAINT_STATES,
} from '../src/core/support-restraints/index.js';
import {
  exactTopology,
  pipeComponent,
  point,
  sharedFixture,
  supportEvidence,
  supportRecord,
} from './w10.3-support-restraint-fixtures.mjs';

const SEED = 1032026;
console.log(`\n--- W10.3 Fixed-Seed Properties · seed ${SEED} ---`);
checkTranslationInvariance();
checkOrderInvariance();
checkUnitConversionInvariance();
checkReferenceIntegrity();
checkEvidenceOnlyAndIdentityBlocking();
checkClosedTaxonomies();
console.log(`✅ W10.3 fixed-seed properties passed · seed ${SEED}`);

function checkTranslationInvariance() {
  const random = generator(SEED);
  for (let caseIndex = 0; caseIndex < 40; caseIndex += 1) {
    const x = Math.round(random() * 10000);
    const offset = Math.round(random() * 100) / 100;
    const base = geometricFixture(x, offset, 0);
    const translated = geometricFixture(x, offset, 1e6);
    const left = buildProjected(base, 2);
    const right = buildProjected(translated, 2);
    assert.deepEqual(attachmentSignatures(left), attachmentSignatures(right), `seed ${SEED} case ${caseIndex}`);
  }
}

function checkOrderInvariance() {
  const components = [
    pipeComponent('P1', point(0), point(100)),
    pipeComponent('P2', point(100), point(200)),
  ];
  const supports = [
    supportRecord('S1', point(50), {
      supportEvidence: supportEvidence({ componentReferences: 'P1' }),
    }),
    supportRecord('S2', point(150), {
      supportEvidence: supportEvidence({ componentReferences: 'P2' }),
    }),
  ];
  const first = sharedFixture({ components, supports });
  const second = sharedFixture({
    components: [...components].reverse(),
    supports: [...supports].reverse(),
  });
  const left = buildSupportAttachmentModel(first, exactTopology(first));
  const right = buildSupportAttachmentModel(second, exactTopology(second));
  assert.equal(left.semanticHash, right.semanticHash);
  assert.deepEqual(attachmentSignatures(left), attachmentSignatures(right));
}

function checkUnitConversionInvariance() {
  const mm = sharedFixture({
    unit: 'mm',
    components: [pipeComponent('PIPE-U', point(0), point(1000))],
    supports: [supportRecord('SUP-U', point(500, 0.5))],
  });
  const metre = sharedFixture({
    unit: 'm',
    components: [pipeComponent('PIPE-U', point(0), point(1))],
    supports: [supportRecord('SUP-U', point(0.5, 0.0005))],
  });
  const left = buildProjected(mm, 1);
  const right = buildSupportAttachmentModel(
    metre,
    exactTopology(metre),
    createGeometricAttachmentProfile('m', 0.001),
  );
  assert.deepEqual(attachmentSignatures(left), attachmentSignatures(right));
}

function checkReferenceIntegrity() {
  const random = generator(SEED + 1);
  const components = [];
  const supports = [];
  for (let index = 0; index < 25; index += 1) {
    const start = index * 100;
    const key = `PIPE-${index}`;
    components.push(pipeComponent(key, point(start), point(start + 80)));
    supports.push(supportRecord(`SUP-${index}`, point(start + random() * 80), {
      supportEvidence: supportEvidence({ componentReferences: key }),
    }));
  }
  const shared = sharedFixture({ components, supports });
  const model = buildSupportAttachmentModel(shared, exactTopology(shared));
  const attachmentIds = model.attachments.map((row) => row.attachmentId);
  assert.equal(new Set(attachmentIds).size, attachmentIds.length);
  const supportKeys = new Set(model.supportProjection.supports.map((row) => row.supportKey));
  const componentKeys = new Set(model.targets.map((row) => row.componentKey));
  const portKeys = new Set(model.targets.map((row) => row.portKey).filter(Boolean));
  model.attachments.forEach((row) => {
    assert.ok(supportKeys.has(row.supportKey));
    assert.ok(componentKeys.has(row.attachedComponentKey));
    if (row.attachedPortKey) assert.ok(portKeys.has(row.attachedPortKey));
    assert.notEqual(row.supportKey, row.attachedComponentKey);
  });
}

function checkEvidenceOnlyAndIdentityBlocking() {
  const geometryOnly = sharedFixture({
    components: [pipeComponent('PIPE-E', point(0), point(100))],
    supports: [supportRecord('SUP-E', point(50))],
  });
  const evidenceOnly = buildSupportAttachmentModel(geometryOnly, exactTopology(geometryOnly));
  assert.ok(evidenceOnly.attachments.every((row) => (
    row.evidenceType !== ATTACHMENT_EVIDENCE.GEOMETRIC
  )));

  const conflict = sharedFixture({
    components: [pipeComponent('PIPE-C', point(0), point(100), {
      identity: { systemId: 'A' },
    })],
    supports: [supportRecord('SUP-C', point(50), {
      identity: { systemId: 'B' },
    })],
  });
  const blocked = buildProjected(conflict, 1);
  assert.equal(blocked.attachments.length, 0);
  assert.ok(blocked.attachmentAudit.identityConflicts.length > 0);
}

function checkClosedTaxonomies() {
  const shared = sharedFixture({
    components: [pipeComponent('PIPE-T', point(0), point(100))],
    supports: [
      supportRecord('SUP-T', point(50), {
        supportEvidence: supportEvidence({
          componentReferences: 'PIPE-T',
          supportTypes: 'ANCHOR',
        }),
      }),
    ],
  });
  const restraint = buildRestraintCapabilityModel(
    buildSupportAttachmentModel(shared, exactTopology(shared)),
  );
  const states = new Set(Object.values(RESTRAINT_STATES));
  const qualifications = new Set(Object.values(RESTRAINT_QUALIFICATIONS));
  restraint.restraints.forEach((row) => {
    ['vertical', 'lateral', 'longitudinal', 'rotational'].forEach((field) => {
      assert.ok(states.has(row[field].state));
    });
    assert.ok(qualifications.has(row.qualification));
  });
}

function geometricFixture(x, offset, translation) {
  return sharedFixture({
    components: [
      pipeComponent('PIPE-G', point(translation, 0), point(translation + 100, 0)),
    ],
    supports: [
      supportRecord('SUP-G', point(translation + (x % 100), offset)),
    ],
  });
}

function buildProjected(shared, tolerance) {
  return buildSupportAttachmentModel(
    shared,
    exactTopology(shared),
    createGeometricAttachmentProfile(shared.units.length, tolerance),
  );
}

function attachmentSignatures(model) {
  return model.attachments.map((row) => ({
    attachmentId: row.attachmentId,
    supportKey: row.supportKey,
    componentKey: row.attachedComponentKey,
    targetId: row.targetId,
    evidenceType: row.evidenceType,
    distanceCanonical: rounded(row.distanceCanonical),
    segmentParameter: rounded(row.segmentParameter),
  }));
}

function rounded(value) {
  return value === null ? null : Math.round(value * 1e9) / 1e9;
}

function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
