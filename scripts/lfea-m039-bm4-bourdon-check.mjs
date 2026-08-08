import assert from 'node:assert/strict';
import { M039_BM4_BOURDON_AUTHORITY } from './lfea-m039-bm4-bourdon-authority.mjs';

const authority = M039_BM4_BOURDON_AUTHORITY;

const expectedInputControlHeader = [
  'JOBNAME',
  'ISSUE_NO',
  'UPDATE_TIME',
  'NUMELT',
  'NUMNOZ',
  'NOHGRS',
  'NUMBEND',
  'NUMRIGID',
  'NUMEXPJNT',
  'NUMREST',
  'NUMDISP',
  'NUMFORCMNT',
  'NUMUNFLOAD',
  'NUMWIND',
  'NUMELEOFF',
  'NUMALLOW',
  'NUMISECT',
  'NUMFLANGE',
  'VERSION',
  'VERT_I',
  'VERT_J',
  'VERT_K',
  'NORTH_X',
  'NORTH_Y',
  'NORTH_Z',
];

assert.equal(authority.schema, 'm039-bm4-bourdon-authority/v1');
assert.equal(authority.benchmark, 'BM4');
assert.equal(authority.caesarVersion, 'CAESAR II 14.00');

assert.equal(
  authority.sourceCustody.repositoryCommit,
  '3e5c5e20d9e8741faa08be4360cb7f79498f87b6',
  'M039 must stay pinned to the independently extracted BM4 ACCDB source commit',
);
assert.equal(authority.sourceCustody.extractionWorkflowRun, 31217616000);
assert.equal(authority.sourceCustody.extractionWorkflowJob, 92994717232);
assert.equal(authority.sourceCustody.extractionArtifactId, 9009121232);
assert.equal(authority.sourceCustody.table, 'INPUT_CONTROL');
assert.deepEqual(authority.sourceCustody.header, expectedInputControlHeader);
assert.equal(expectedInputControlHeader.length, 25);
assert.equal(
  authority.sourceCustody.header.some((column) => /bourdon/i.test(column)),
  false,
  'pinned INPUT_CONTROL export must not be represented as carrying a Bourdon field',
);
assert.equal(authority.sourceCustody.bourdonColumnPresent, false);
assert.equal(
  authority.sourceCustody.machineReadableBourdonOption,
  null,
  'do not infer a Bourdon option value that the pinned machine-readable export does not expose',
);

const straight = authority.experiments.straightSpanTranslation;
assert.equal(straight.implementationCommit, 'b6f62f32a58e1c6ed2653480e9dddfba76cc47f1');
assert.equal(straight.enabledByDefault, false);
assert.equal(straight.qualificationRunCommit, '663df802da094fbdd5012246f5d87efdd3489736');
assert.equal(straight.qualificationWorkflowRun, 31219329128);
assert.equal(straight.qualificationWorkflowJob, 93000117725);
assert.equal(straight.result, 'FAILED_LOCKED_GATE');
assert.deepEqual(straight.observedDrift, {
  metric: 'CASE 20 OPE displacement within5PctCount',
  expected: 113,
  actual: 129,
});
assert.notEqual(
  straight.observedDrift.actual,
  straight.observedDrift.expected,
  'the experimental activation must remain recorded as a locked-gate drift, not as qualified',
);

const bend = authority.experiments.bendArcTranslation;
assert.equal(bend.attemptedCommit, '775b98f80fed714a8dfe0f23993d41a2d800b604');
assert.equal(bend.rejectedCommit, '074fb3de8f036c9655ecc8b49efd0ac12dad86db');
assert.equal(bend.disposition, 'REJECTED_EXPERIMENT');
assert.notEqual(bend.attemptedCommit, bend.rejectedCommit);

const helper = authority.experiments.generalizedFreeDeformationHelper;
assert.equal(helper.implementationCommit, 'c32fced1f510639e4e33a0b52f61028702765603');
assert.equal(helper.exportCommit, 'ebc4280e3281d499277740488a4813c3a0455627');
assert.equal(helper.disposition, 'GENERIC_HELPER_ONLY');
assert.equal(helper.integratedRotationalBourdonModel, false);

assert.deepEqual(authority.disposition.blockers, [
  'BM4_BOURDON_SOURCE_AUTHORITY_UNRESOLVED',
  'BM4_BOURDON_STRAIGHT_TRANSLATION_EXPERIMENT_NOT_QUALIFIED',
  'BM4_BOURDON_ROTATIONAL_MECHANICS_NOT_QUALIFIED',
]);
assert.equal(authority.disposition.sourceAuthority, 'UNRESOLVED_FROM_PINNED_ACCDB');
assert.equal(authority.disposition.straightTranslation, 'NOT_QUALIFIED_FOR_BM4_TARGET_CASES');
assert.equal(authority.disposition.bendRotationalMechanics, 'NOT_IMPLEMENTED_OR_QUALIFIED');
assert.equal(
  authority.disposition.qualifiedBm4Activation,
  false,
  'M039 must fail closed: no Bourdon activation without independent source authority and qualified mechanics',
);
assert.equal(authority.disposition.mechanicsChangedByM039, false);

console.log('M039 BM4 Bourdon authority disposition: PASS');
console.log(JSON.stringify({
  schema: authority.schema,
  sourceAuthority: authority.disposition.sourceAuthority,
  bourdonColumnPresent: authority.sourceCustody.bourdonColumnPresent,
  machineReadableBourdonOption: authority.sourceCustody.machineReadableBourdonOption,
  straightTranslation: authority.disposition.straightTranslation,
  straightExperimentGateDrift: straight.observedDrift,
  bendRotationalMechanics: authority.disposition.bendRotationalMechanics,
  qualifiedBm4Activation: authority.disposition.qualifiedBm4Activation,
  blockers: authority.disposition.blockers,
}, null, 2));
