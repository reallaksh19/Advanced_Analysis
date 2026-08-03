import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import {
  deriveAllSupportRestraintGeometry,
  normalizeGapMm,
} from '../src/workspace/topology-edit/support-restraint-family.js';
import {
  exactTopology,
  pipeComponent,
  point,
  sharedFixture,
  supportEvidence,
  supportRecord,
} from '../scripts/w10.3-support-restraint-fixtures.mjs';

function canonical(restraint) {
  return {
    canonicalTopologyHash: 'canonical:m003-capability',
    nodes: [
      { id: 'node:0', position: { x: 0, y: 0, z: 0 } },
      { id: 'node:1', position: { x: 1000, y: 0, z: 0 } },
    ],
    edges: [{
      id: 'edge:pipe', componentKey: 'pipe:1', fromNodeId: 'node:0',
      toNodeId: 'node:1', outsideDiameterMm: 100,
    }],
    junctions: [],
    supports: [{
      id: 'support:1', nodeId: 'node:0', hostEntityId: 'pipe:1', restraint,
    }],
  };
}

function capabilityRecord(supportType, gapRows = [], qualification = 'EXPLICIT') {
  return {
    restraintId: `restraint:${supportType.toLowerCase()}`,
    supportKey: 'support-source-1',
    supportType,
    supportTypeEvidence: [{ value: supportType, sourcePath: '/support/type' }],
    vertical: { state: 'FREE', basis: 'EXPLICIT', evidence: [] },
    lateral: {
      state: 'GAP', basis: 'EXPLICIT',
      evidence: [{ value: 'GAP', sourcePath: '/support/lateral-capability' }],
    },
    longitudinal: { state: 'FREE', basis: 'EXPLICIT', evidence: [] },
    rotational: { state: 'FREE', basis: 'EXPLICIT', evidence: [] },
    gapEvidence: { vertical: [], lateral: gapRows, longitudinal: [] },
    qualification,
  };
}

test('M003 consumes the repository restraint-capability production record', () => {
  const pipe = pipeComponent('PIPE-G', point(0), point(100));
  const support = supportRecord('GUIDE-G', point(50), {
    supportEvidence: supportEvidence({
      componentReferences: 'PIPE-G',
      supportTypes: 'GUIDE',
      lateralGaps: 4,
    }),
  });
  const shared = sharedFixture({ components: [pipe], supports: [support] });
  const capability = buildRestraintCapabilityModel(
    buildSupportAttachmentModel(shared, exactTopology(shared)),
  ).restraints[0];
  const [overlay] = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonical(capability),
    verticalAxis: 'Z',
  });
  assert.equal(overlay.restraints[0].restraintId, capability.restraintId);
  assert.equal(overlay.restraints[0].family, 'GUIDE');
  assert.equal(overlay.restraints[0].status, 'RESOLVED');
  assert.deepEqual(overlay.restraints[0].positiveContactPoint, { x: 0, y: 54, z: 0 });
});

test('M003 rejects unitless capability gaps instead of assuming millimetres', () => {
  const [overlay] = deriveAllSupportRestraintGeometry({
    canonicalTopology: canonical(capabilityRecord('GUIDE', [{
      value: 4, unit: '', sourcePath: '/support/gap-unitless',
    }])),
  });
  const restraint = overlay.restraints[0];
  assert.equal(restraint.status, 'PARTIAL');
  assert.equal(restraint.positiveGapMm, null);
  assert.ok(restraint.diagnostics.some((row) => row.code === 'RESTRAINT_GAP_UNIT_UNSUPPORTED'));
  assert.ok(restraint.diagnostics.some((row) => row.code === 'RESTRAINT_GAP_MISSING'));
});

test('M003 does not coerce absent scalar gaps to zero', () => {
  assert.equal(normalizeGapMm(null), null);
  assert.equal(normalizeGapMm(undefined), null);
  assert.equal(normalizeGapMm(''), null);
});

test('M003 uses governed vertical orientation for CAN and SPRING capability records', () => {
  for (const supportType of ['CAN', 'SPRING']) {
    const [overlay] = deriveAllSupportRestraintGeometry({
      canonicalTopology: canonical(capabilityRecord(supportType)),
      verticalAxis: 'Z',
    });
    assert.deepEqual(overlay.restraints[0].direction, { x: 0, y: 0, z: 1 });
    assert.equal(overlay.restraints[0].status, 'RESOLVED');
  }
});

test('M003 rejects traversal-order restraint identities', () => {
  const record = capabilityRecord('GUIDE', [{ value: 4, unit: 'mm' }]);
  delete record.restraintId;
  assert.throws(
    () => deriveAllSupportRestraintGeometry({ canonicalTopology: canonical(record) }),
    (error) => error.code === 'TOPOLOGY_EDIT_RESTRAINT_IDENTITY_MISSING',
  );
});
