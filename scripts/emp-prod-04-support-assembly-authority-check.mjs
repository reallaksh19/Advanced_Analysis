import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  EMPIRICAL_SUPPORT_ASSEMBLY_AUTHORITY_SCHEMA,
  EMPIRICAL_SUPPORT_ASSEMBLY_DISTRIBUTION_BASIS,
  createEmpiricalSupportAssemblyAuthority,
  requireEmpiricalSupportAssemblyAuthority,
} from '../src/workspace/engineering-loads/empirical-support-assembly-authority.js';

const supportSiteModel = fixtureSupportSiteModel();
const sourceBefore = JSON.stringify(supportSiteModel);
const authorities = [
  authority({
    authorityId: 'AUTH:SUP-B',
    supportSiteId: 'support-site:1000|0|0',
    assemblyId: 'support-assembly:B:SUP-B:1000|0|0',
    structuralAssemblyId: 'CIVIL-SA-B',
    pipePoint: { x: 1000, y: 0, z: 0 },
    civilPoint: { x: 1000, y: 0, z: -800 },
    distributionKind: EMPIRICAL_SUPPORT_ASSEMBLY_DISTRIBUTION_BASIS.AUTHORIZED_STIFFNESS,
    distributionBasisId: 'STIFFNESS:SA-B',
  }),
  authority({
    authorityId: 'AUTH:SUP-A',
    supportSiteId: 'support-site:0|0|0',
    assemblyId: 'support-assembly:A:SUP-A:0|0|0',
    structuralAssemblyId: 'CIVIL-SA-A',
    pipePoint: { x: 0, y: 0, z: 0 },
    civilPoint: { x: 0, y: 0, z: -1000 },
    distributionKind: EMPIRICAL_SUPPORT_ASSEMBLY_DISTRIBUTION_BASIS.EXACT_STATICS,
    distributionBasisId: 'STATICS:SA-A',
  }),
];

const ready = createEmpiricalSupportAssemblyAuthority({
  supportSiteModel,
  authorities,
});
assert.equal(ready.schema, EMPIRICAL_SUPPORT_ASSEMBLY_AUTHORITY_SCHEMA);
assert.equal(ready.status, 'READY_FOR_DISTRIBUTION_MODEL');
assert.equal(ready.records.length, 2);
assert.deepEqual(ready.records.map((row) => row.authorityId), ['AUTH:SUP-A', 'AUTH:SUP-B']);
assert.equal(ready.summary.readyCount, 2);
assert.equal(ready.summary.blockedCount, 0);
assert.equal(ready.summary.exactStaticsBasisCount, 1);
assert.equal(ready.summary.authorizedStiffnessBasisCount, 1);
assert.equal(ready.policy.supportIdentityAuthority, 'support-site-model/v1');
assert.equal(ready.policy.geometryMutationPermitted, false);
assert.equal(ready.policy.guessedStiffnessPermitted, false);
assert.equal(ready.policy.distributionCalculationPermitted, false);
assert.equal(ready.policy.structuralMemberForceApproximationPermitted, false);
assert.equal(ready.pipingReactionModified, false);
assert.equal(ready.civilReactionDistributionPerformed, false);
assert.equal(ready.structuralMemberForcesCalculated, false);
assert.equal(Object.isFrozen(ready), true);
assert.equal(JSON.stringify(supportSiteModel), sourceBefore, 'authority creation mutated support-site model');

const reordered = createEmpiricalSupportAssemblyAuthority({
  supportSiteModel,
  authorities: authorities.slice().reverse().map((row) => ({
    ...structuredClone(row),
    geometry: {
      ...structuredClone(row.geometry),
      nodes: structuredClone(row.geometry.nodes).reverse(),
      members: structuredClone(row.geometry.members).reverse(),
    },
  })),
});
assert.equal(reordered.semanticHash, ready.semanticHash, 'authority must be order deterministic');
assert.deepEqual(reordered, ready);

const unknownAssembly = createEmpiricalSupportAssemblyAuthority({
  supportSiteModel,
  authorities: [{
    ...structuredClone(authorities[0]),
    assemblyId: 'support-assembly:UNKNOWN',
  }],
});
assert.equal(unknownAssembly.status, 'BLOCKED');
assert(unknownAssembly.blockers.some((row) => row.code === 'EMPIRICAL_SUPPORT_ASSEMBLY_ID_UNKNOWN'));

const wrongSite = createEmpiricalSupportAssemblyAuthority({
  supportSiteModel,
  authorities: [{
    ...structuredClone(authorities[0]),
    supportSiteId: 'support-site:0|0|0',
  }],
});
assert.equal(wrongSite.status, 'BLOCKED');
assert(wrongSite.blockers.some((row) => row.code === 'EMPIRICAL_SUPPORT_ASSEMBLY_SITE_MISMATCH'));

const geometryDrift = createEmpiricalSupportAssemblyAuthority({
  supportSiteModel,
  authorities: [{
    ...structuredClone(authorities[0]),
    geometry: {
      ...structuredClone(authorities[0].geometry),
      pipeAttachmentPointMm: { x: 1001, y: 0, z: 0 },
    },
  }],
});
assert.equal(geometryDrift.status, 'BLOCKED');
assert(geometryDrift.blockers.some((row) => row.code === 'EMPIRICAL_SUPPORT_ASSEMBLY_PIPE_POINT_MISMATCH'));

const guessedStiffness = createEmpiricalSupportAssemblyAuthority({
  supportSiteModel,
  authorities: [{
    ...structuredClone(authorities[0]),
    distributionBasis: {
      ...structuredClone(authorities[0].distributionBasis),
      genericOrAssumedStiffness: true,
    },
  }],
});
assert.equal(guessedStiffness.status, 'BLOCKED');
assert(guessedStiffness.blockers.some((row) => row.code === 'EMPIRICAL_SUPPORT_ASSEMBLY_GUESSED_STIFFNESS_PROHIBITED'));

const duplicate = createEmpiricalSupportAssemblyAuthority({
  supportSiteModel,
  authorities: [authorities[0], {
    ...structuredClone(authorities[0]),
    authorityId: 'AUTH:SUP-B-DUPLICATE',
    structuralAssemblyId: 'CIVIL-SA-B-DUPLICATE',
  }],
});
assert.equal(duplicate.status, 'BLOCKED');
assert(duplicate.blockers.some((row) => row.code === 'EMPIRICAL_SUPPORT_ASSEMBLY_BINDING_DUPLICATE'));

const tamperedRecord = structuredClone(ready);
tamperedRecord.records[0].structuralAssemblyId = 'TAMPERED';
assert.throws(
  () => requireEmpiricalSupportAssemblyAuthority(tamperedRecord),
  (error) => error.code === 'EMPIRICAL_SUPPORT_ASSEMBLY_RECORD_HASH_MISMATCH',
);

const tamperedBoundary = structuredClone(ready);
tamperedBoundary.policy.distributionCalculationPermitted = true;
tamperedBoundary.semanticHash = semanticHash(withoutHash(tamperedBoundary));
assert.throws(
  () => requireEmpiricalSupportAssemblyAuthority(tamperedBoundary),
  (error) => error.code === 'EMPIRICAL_SUPPORT_ASSEMBLY_AUTHORITY_BOUNDARY_INVALID',
);

const source = await readFile(
  new URL('../src/workspace/engineering-loads/empirical-support-assembly-authority.js', import.meta.url),
  'utf8',
);
assert.doesNotMatch(
  source,
  /support-load-distribution|linear-fea|solver|calculateEmpirical|captureEmpiricalComponentMomentDemand/iu,
  'EMP-PROD-04 B1 authority contract must not import or execute reaction/solver mechanics.',
);
assert.doesNotMatch(
  source,
  /verticalForceN\s*=|civilReaction|memberForce/iu,
  'EMP-PROD-04 B1 authority contract must not calculate force results.',
);

console.log(JSON.stringify({
  check: 'emp-prod-04-support-assembly-authority',
  status: 'PASS',
  schema: ready.schema,
  authorityCount: ready.summary.authorityCount,
  exactIdentityBinding: true,
  geometryEvidenceBound: true,
  guessedStiffnessRejected: true,
  distributionCalculationPerformed: ready.civilReactionDistributionPerformed,
  pipingReactionModified: ready.pipingReactionModified,
  semanticHash: ready.semanticHash,
}, null, 2));

function fixtureSupportSiteModel() {
  const assemblies = [
    {
      assemblyId: 'support-assembly:A:SUP-A:0|0|0',
      tag: 'SUP-A',
      branchId: 'A',
      lineKey: 'L1',
      positionMm: { x: 0, y: 0, z: 0 },
      memberEntityIds: ['SUP-A-1'],
      members: [],
    },
    {
      assemblyId: 'support-assembly:B:SUP-B:1000|0|0',
      tag: 'SUP-B',
      branchId: 'B',
      lineKey: 'L1',
      positionMm: { x: 1000, y: 0, z: 0 },
      memberEntityIds: ['SUP-B-1'],
      members: [],
    },
  ];
  return Object.freeze({
    schema: 'support-site-model/v1',
    datasetId: 'EMP-PROD-04-FIXTURE',
    sourceAxisBasis: 'Z_UP',
    groupingToleranceMm: 0,
    status: 'READY',
    blockers: [],
    members: [],
    assemblies,
    sites: [
      {
        siteId: 'support-site:0|0|0',
        positionMm: { x: 0, y: 0, z: 0 },
        assemblyIds: [assemblies[0].assemblyId],
        memberEntityIds: ['SUP-A-1'],
        assemblies: [assemblies[0]],
      },
      {
        siteId: 'support-site:1000|0|0',
        positionMm: { x: 1000, y: 0, z: 0 },
        assemblyIds: [assemblies[1].assemblyId],
        memberEntityIds: ['SUP-B-1'],
        assemblies: [assemblies[1]],
      },
    ],
    summary: {
      sourceSupportRecordCount: 2,
      supportAssemblyCount: 2,
      physicalLocationCount: 2,
    },
  });
}

function authority({
  authorityId,
  supportSiteId,
  assemblyId,
  structuralAssemblyId,
  pipePoint,
  civilPoint,
  distributionKind,
  distributionBasisId,
}) {
  return {
    authorityId,
    supportSiteId,
    assemblyId,
    structuralAssemblyId,
    sourceEvidence: {
      sourceId: `STRUCTURAL-SCHEDULE:${structuralAssemblyId}`,
      revision: '1',
      semanticHash: semanticHash({ structuralAssemblyId, revision: 1 }),
    },
    geometry: {
      coordinateBasis: 'GLOBAL_XYZ_Z_UP',
      pipeAttachmentPointMm: pipePoint,
      civilReferencePointMm: civilPoint,
      nodes: [
        { nodeId: 'N-PIPE', role: 'PIPE_ATTACHMENT', positionMm: pipePoint },
        { nodeId: 'N-CIVIL', role: 'CIVIL_REFERENCE', positionMm: civilPoint },
      ],
      members: [
        { memberId: 'M-1', startNodeId: 'N-PIPE', endNodeId: 'N-CIVIL' },
      ],
      evidence: {
        sourceId: `STRUCTURAL-GEOMETRY:${structuralAssemblyId}`,
        revision: '1',
        semanticHash: semanticHash({ structuralAssemblyId, geometry: [pipePoint, civilPoint] }),
      },
    },
    distributionBasis: {
      kind: distributionKind,
      basisId: distributionBasisId,
      revision: '1',
      evidenceSemanticHash: semanticHash({ structuralAssemblyId, distributionKind, revision: 1 }),
      genericOrAssumedStiffness: false,
    },
  };
}

function withoutHash(value) {
  const copy = structuredClone(value);
  delete copy.semanticHash;
  return copy;
}
