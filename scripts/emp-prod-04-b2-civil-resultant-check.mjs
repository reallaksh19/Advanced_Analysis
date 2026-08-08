import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_SCHEMA,
  computeAuthorizedEmpiricalLoadExecutionV2SemanticHash,
} from '../src/workspace/engineering-loads/authorized-empirical-load-execution-v2.js';
import {
  createEmpiricalSupportAssemblyAuthority,
} from '../src/workspace/engineering-loads/empirical-support-assembly-authority.js';
import {
  EMPIRICAL_SUPPORT_CIVIL_RESULTANT_TRANSFER_SCHEMA,
  calculateEmpiricalSupportCivilResultantTransfer,
  requireEmpiricalSupportCivilResultantTransfer,
} from '../src/workspace/engineering-loads/empirical-support-civil-resultant-transfer.js';

const supportSiteModel = fixtureSupportSiteModel();
const exactAuthority = authority(supportSiteModel, 'EXACT_STATICS');
const v2Execution = authorizedExecution(supportSiteModel, {
  method: 'CHAINAGE_TRIBUTARY_SPAN_V2',
  reactions: [
    ['EMPTY', 1000],
    ['OPE', 1200],
  ],
});
const sourceExecutionBefore = JSON.stringify(v2Execution);
const sourceAuthorityBefore = JSON.stringify(exactAuthority);
const sourceSiteBefore = JSON.stringify(supportSiteModel);

const first = calculateEmpiricalSupportCivilResultantTransfer({
  authorizedExecution: v2Execution,
  supportSiteModel,
  supportAssemblyAuthority: exactAuthority,
});
const second = calculateEmpiricalSupportCivilResultantTransfer({
  authorizedExecution: v2Execution,
  supportSiteModel,
  supportAssemblyAuthority: exactAuthority,
});

assert.deepEqual(second, first, 'B2 transfer must be deterministic');
assert.equal(first.schema, EMPIRICAL_SUPPORT_CIVIL_RESULTANT_TRANSFER_SCHEMA);
assert.equal(first.status, 'CALCULATED');
assert.equal(first.loadCases.length, 2);
assert.deepEqual(first.loadCases.map((row) => row.loadCaseId), ['EMPTY', 'OPE']);
assert.equal(first.summary.civilResultantCount, 2);
assert.equal(first.upstreamPipingReactionModified, false);
assert.equal(first.multiAssemblyLoadSharingPerformed, false);
assert.equal(first.stiffnessDistributionPerformed, false);
assert.equal(first.structuralMemberForcesCalculated, false);
assert.equal(first.componentMomentDemandDistributed, false);

const empty = first.loadCases[0];
const emptyResult = empty.civilResultants[0];
assert.equal(empty.status, 'CALCULATED');
assert.equal(empty.transferBalance.passed, true);
assert.equal(empty.transferBalance.sourceVerticalReactionOnPipeN, 1000);
assert.equal(empty.transferBalance.structureVerticalActionN, -1000);
assert.equal(empty.transferBalance.actionReactionResidualN, 0);
assert.deepEqual(emptyResult.sourceReactionOnPipeN, { x: 0, y: 0, z: 1000 });
assert.deepEqual(emptyResult.structureActionAtPipeAttachmentN, { x: 0, y: 0, z: -1000 });
assert.deepEqual(emptyResult.offsetCivilToPipeMm, { x: 1000, y: 500, z: 2000 });
assert.deepEqual(emptyResult.civilReferenceResultant.forceN, { x: 0, y: 0, z: -1000 });
assert.deepEqual(emptyResult.civilReferenceResultant.momentNm, { x: -500, y: 1000, z: 0 });
assert.equal(emptyResult.distributionBasis.kind, 'EXACT_STATICS');
assert.equal(emptyResult.loadSharingPerformed, false);
assert.equal(emptyResult.structuralMemberForcesCalculated, false);

const v3Execution = authorizedExecution(supportSiteModel, {
  method: 'CHAINAGE_TRIBUTARY_SPAN_V3_COG',
  reactions: [['OPE', 875]],
});
const v3 = calculateEmpiricalSupportCivilResultantTransfer({
  authorizedExecution: v3Execution,
  supportSiteModel,
  supportAssemblyAuthority: exactAuthority,
});
assert.equal(v3.status, 'CALCULATED');
assert.equal(v3.sourceExecutionMethod, 'CHAINAGE_TRIBUTARY_SPAN_V3_COG');
assert.equal(v3.loadCases[0].civilResultants[0].civilReferenceResultant.forceN.z, -875);

const zeroExecution = authorizedExecution(supportSiteModel, {
  reactions: [['EMPTY', 0]],
});
const zero = calculateEmpiricalSupportCivilResultantTransfer({
  authorizedExecution: zeroExecution,
  supportSiteModel,
  supportAssemblyAuthority: exactAuthority,
});
assert.equal(zero.status, 'CALCULATED');
assert.equal(zero.summary.civilResultantCount, 0);
assert.equal(zero.summary.zeroReactionCount, 1);
assert.equal(zero.loadCases[0].siteAudits[0].status, 'NO_LOAD');
assert.equal(zero.loadCases[0].transferBalance.passed, true);

const multiSiteModel = fixtureSupportSiteModel({ multiAssembly: true });
const multiAuthority = authority(multiSiteModel, 'EXACT_STATICS');
const multiExecution = authorizedExecution(multiSiteModel, {
  reactions: [['EMPTY', 1000]],
});
const multi = calculateEmpiricalSupportCivilResultantTransfer({
  authorizedExecution: multiExecution,
  supportSiteModel: multiSiteModel,
  supportAssemblyAuthority: multiAuthority,
});
assert.equal(multi.status, 'BLOCKED');
assert.equal(multi.loadCases[0].civilResultants.length, 0);
assert.equal(
  hasBlocker(multi, 'EMPIRICAL_CIVIL_TRANSFER_MULTI_ASSEMBLY_LOAD_SHARE_UNRESOLVED'),
  true,
);

const stiffnessAuthority = authority(supportSiteModel, 'AUTHORIZED_STIFFNESS');
const stiffness = calculateEmpiricalSupportCivilResultantTransfer({
  authorizedExecution: v2Execution,
  supportSiteModel,
  supportAssemblyAuthority: stiffnessAuthority,
});
assert.equal(stiffness.status, 'BLOCKED');
assert.equal(stiffness.loadCases[0].civilResultants.length, 0);
assert.equal(
  hasBlocker(stiffness, 'EMPIRICAL_CIVIL_TRANSFER_STIFFNESS_DISTRIBUTION_UNQUALIFIED'),
  true,
);

const staleExecution = authorizedExecution(supportSiteModel, {
  reactions: [['EMPTY', 1000]],
  freshness: 'STALE',
});
const stale = calculateEmpiricalSupportCivilResultantTransfer({
  authorizedExecution: staleExecution,
  supportSiteModel,
  supportAssemblyAuthority: exactAuthority,
});
assert.equal(stale.status, 'BLOCKED');
assert.equal(hasBlocker(stale, 'EMPIRICAL_CIVIL_TRANSFER_SOURCE_EXECUTION_STALE'), true);

const nullReactionExecution = authorizedExecution(supportSiteModel, {
  reactions: [['EMPTY', null]],
});
const nullReaction = calculateEmpiricalSupportCivilResultantTransfer({
  authorizedExecution: nullReactionExecution,
  supportSiteModel,
  supportAssemblyAuthority: exactAuthority,
});
assert.equal(nullReaction.status, 'BLOCKED');
assert.equal(nullReaction.loadCases[0].civilResultants.length, 0);
assert.equal(hasBlocker(nullReaction, 'EMPIRICAL_CIVIL_TRANSFER_REACTION_INVALID'), true);

const wrongSiteModel = fixtureSupportSiteModel({ datasetId: 'OTHER-DATASET' });
const wrongSite = calculateEmpiricalSupportCivilResultantTransfer({
  authorizedExecution: v2Execution,
  supportSiteModel: wrongSiteModel,
  supportAssemblyAuthority: authority(wrongSiteModel, 'EXACT_STATICS'),
});
assert.equal(wrongSite.status, 'BLOCKED');
assert.equal(hasBlocker(wrongSite, 'EMPIRICAL_CIVIL_TRANSFER_DATASET_MISMATCH'), true);
assert.equal(hasBlocker(wrongSite, 'EMPIRICAL_CIVIL_TRANSFER_SUPPORT_MODEL_MISMATCH'), true);

const tamperedMoment = structuredClone(first);
tamperedMoment.loadCases[0].civilResultants[0].civilReferenceResultant.momentNm.x = -499;
assert.throws(
  () => requireEmpiricalSupportCivilResultantTransfer(tamperedMoment),
  (error) => error.code === 'EMPIRICAL_CIVIL_TRANSFER_MOMENT_INVALID',
);

const tamperedBoundary = structuredClone(first);
tamperedBoundary.structuralMemberForcesCalculated = true;
assert.throws(
  () => requireEmpiricalSupportCivilResultantTransfer(tamperedBoundary),
  (error) => error.code === 'EMPIRICAL_CIVIL_TRANSFER_BOUNDARY_INVALID',
);

const tamperedSummary = structuredClone(first);
tamperedSummary.summary.civilResultantCount = 99;
assert.throws(
  () => requireEmpiricalSupportCivilResultantTransfer(tamperedSummary),
  (error) => error.code === 'EMPIRICAL_CIVIL_TRANSFER_SUMMARY_INVALID',
);

assert.equal(JSON.stringify(v2Execution), sourceExecutionBefore, 'B2 mutated upstream execution');
assert.equal(JSON.stringify(exactAuthority), sourceAuthorityBefore, 'B2 mutated B1 authority');
assert.equal(JSON.stringify(supportSiteModel), sourceSiteBefore, 'B2 mutated support-site model');

const source = await readFile(
  new URL('../src/workspace/engineering-loads/empirical-support-civil-resultant-transfer.js', import.meta.url),
  'utf8',
);
assert.doesNotMatch(
  source,
  /from ['"][^'"]*(linear-fea|lafea|lfea|solver|support-load-distribution-v3|empirical-component-moment-demand)[^'"]*['"]/iu,
  'B2 must not import solvers, upstream gravity mechanics, FEA, or the separate moment-demand ledger.',
);
assert.doesNotMatch(
  source,
  /calculateSupportLoadDistribution|calculateSupportLoadDistributionWithComponentCog|captureEmpiricalComponentMomentDemand/iu,
  'B2 must consume sealed upstream results, not rerun or reinterpret their mechanics.',
);

console.log(JSON.stringify({
  check: 'emp-prod-04-b2-civil-resultant',
  status: 'PASS',
  schema: first.schema,
  qualifiedMethods: [
    first.sourceExecutionMethod,
    v3.sourceExecutionMethod,
  ],
  loadCases: first.loadCases.map((row) => row.loadCaseId),
  emptyCivilForceN: emptyResult.civilReferenceResultant.forceN,
  emptyCivilMomentNm: emptyResult.civilReferenceResultant.momentNm,
  exactStaticsOnly: first.policy.exactStaticsOnly,
  multiAssemblyFailsClosed: true,
  stiffnessDistributionFailsClosed: true,
  staleExecutionFailsClosed: true,
  nullReactionFailsClosed: true,
  sourceImmutable: true,
  semanticHash: first.semanticHash,
}, null, 2));

function authorizedExecution(
  supportModel,
  {
    method = 'CHAINAGE_TRIBUTARY_SPAN_V2',
    reactions = [['EMPTY', 1000]],
    freshness = 'CURRENT',
  } = {},
) {
  const loadCases = reactions.map(([loadCaseId, verticalForceN]) => ({
    loadCaseId,
    status: 'CALCULATED',
    supportResults: [{
      supportSiteId: supportModel.sites[0].siteId,
      tags: supportModel.sites[0].tags,
      sourceAxisBasis: 'Z_UP',
      status: 'CALCULATED',
      verticalForceN,
      qualifiedReactionCandidateN: verticalForceN,
      contributorIds: [],
    }],
    contributionLedger: [],
    excludedInputs: [],
    blockers: [],
  }));
  const distribution = {
    schema: method === 'CHAINAGE_TRIBUTARY_SPAN_V2'
      ? 'support-load-distribution/v3'
      : 'support-load-distribution/v4',
    method,
    datasetId: supportModel.datasetId,
    datasetVersion: 1,
    hashes: {
      dataset: 'a'.repeat(64),
      masters: {},
      projectDataProfile: hash('profile'),
      supportSiteModel: semanticHash(supportModel),
      routePartitionModel: hash('route'),
    },
    sourceAxisBasis: 'Z_UP',
    verticalForceConvention: 'positive reaction opposes source-axis gravity',
    status: 'CALCULATED',
    loadCases,
    freshness: {
      status: freshness,
      datasetId: supportModel.datasetId,
      datasetVersion: 1,
    },
  };
  const summary = {
    loadCaseCount: loadCases.length,
    calculatedCaseCount: loadCases.length,
    blockedCaseCount: 0,
    contributionCount: 0,
    excludedInputCount: 0,
  };
  const draft = {
    schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_V2_SCHEMA,
    executionId: `EXEC:B2:${method}`,
    executedAt: '2026-08-08T05:15:00.000Z',
    requestedMethod: method,
    executedMethod: method,
    projectId: 'EMP-PROD-04-PROJECT',
    datasetId: supportModel.datasetId,
    datasetVersion: 1,
    authorizedInputSemanticHash: hash('authorized-input'),
    overlaySemanticHash: hash('overlay'),
    baselineSemanticHash: hash('baseline'),
    handoffSemanticHash: hash('handoff'),
    projectionPayloadSemanticHash: hash('projection'),
    ephemeralProfileSemanticHash: hash('ephemeral-profile'),
    distributionSemanticHash: semanticHash(distribution),
    status: 'CALCULATED',
    summary,
    distribution,
    semanticHash: 'fnv1a64:0000000000000000',
  };
  return Object.freeze({
    ...draft,
    semanticHash: computeAuthorizedEmpiricalLoadExecutionV2SemanticHash(draft),
  });
}

function authority(supportModel, kind) {
  const assembly = supportModel.assemblies[0];
  const site = supportModel.sites[0];
  return createEmpiricalSupportAssemblyAuthority({
    supportSiteModel: supportModel,
    authorities: [{
      authorityId: 'STRUCTURAL-ASSEMBLY-AUTHORITY:SUP-A',
      supportSiteId: site.siteId,
      assemblyId: assembly.assemblyId,
      structuralAssemblyId: 'STRUCTURAL-SUP-A',
      sourceEvidence: {
        sourceId: 'STRUCTURAL-DRAWING-SUP-A',
        revision: '3',
        semanticHash: hash('structural-drawing'),
      },
      geometry: {
        coordinateBasis: 'GLOBAL_XYZ_Z_UP',
        pipeAttachmentPointMm: assembly.positionMm,
        civilReferencePointMm: { x: 0, y: 0, z: 0 },
        nodes: [
          {
            nodeId: 'CIVIL-REF',
            role: 'CIVIL_REFERENCE',
            positionMm: { x: 0, y: 0, z: 0 },
          },
          {
            nodeId: 'PIPE-ATTACH',
            role: 'PIPE_ATTACHMENT',
            positionMm: assembly.positionMm,
          },
        ],
        members: [{
          memberId: 'MEMBER-1',
          startNodeId: 'CIVIL-REF',
          endNodeId: 'PIPE-ATTACH',
        }],
        evidence: {
          sourceId: 'STRUCTURAL-DRAWING-SUP-A-GEOMETRY',
          revision: '3',
          semanticHash: hash('geometry'),
        },
      },
      distributionBasis: {
        kind,
        basisId: kind === 'EXACT_STATICS' ? 'BASIS:EXACT-STATICS' : 'BASIS:AUTHORIZED-STIFFNESS',
        revision: '1',
        evidenceSemanticHash: hash(`basis:${kind}`),
        genericOrAssumedStiffness: false,
      },
    }],
  });
}

function fixtureSupportSiteModel({
  multiAssembly = false,
  datasetId = 'EMP-PROD-04-DATASET',
} = {}) {
  const positionMm = { x: 1000, y: 500, z: 2000 };
  const first = {
    assemblyId: 'support-assembly:A:SUP-A:1000|500|2000',
    tag: 'SUP-A',
    branchId: 'A',
    lineKey: 'L1',
    positionMm,
    memberEntityIds: ['SUP-A-1'],
    members: [],
  };
  const second = {
    assemblyId: 'support-assembly:B:SUP-B:1000|500|2000',
    tag: 'SUP-B',
    branchId: 'B',
    lineKey: 'L1',
    positionMm,
    memberEntityIds: ['SUP-B-1'],
    members: [],
  };
  const assemblies = multiAssembly ? [first, second] : [first];
  return Object.freeze({
    schema: 'support-site-model/v1',
    datasetId,
    sourceAxisBasis: 'Z_UP',
    groupingToleranceMm: 0,
    status: 'READY',
    blockers: [],
    members: [],
    assemblies,
    sites: [{
      siteId: 'support-site:1000|500|2000',
      positionMm,
      tags: assemblies.map((row) => row.tag),
      assemblyIds: assemblies.map((row) => row.assemblyId),
      memberEntityIds: assemblies.flatMap((row) => row.memberEntityIds),
      primaryEntityId: 'SUP-A-1',
      branchIds: assemblies.map((row) => row.branchId),
      assemblies,
    }],
    summary: {
      sourceSupportRecordCount: assemblies.length,
      supportAssemblyCount: assemblies.length,
      physicalLocationCount: 1,
    },
  });
}

function hasBlocker(result, code) {
  return result.blockers.some((row) => row.code === code)
    || result.loadCases.some((loadCase) => loadCase.blockers.some((row) => row.code === code));
}

function hash(label) {
  return semanticHash({ label });
}
