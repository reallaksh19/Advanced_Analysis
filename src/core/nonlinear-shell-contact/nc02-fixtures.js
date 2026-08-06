import { clonePlain, sealWithHash } from './contracts.js';
import { REQUIRED_CONTACT_BENCHMARKS } from './contact-procedure-contract.js';
import { createNc01QualificationBinding } from './contact-qualification-evaluator.js';

export const FIXTURE_HEAD = '1111111111111111111111111111111111111111';
const H = 'sha256:' + '1'.repeat(64);

export function createQualifiedNc01BindingFixture() {
  return createNc01QualificationBinding({
    exactHeadSha: '2222222222222222222222222222222222222222',
    mergeCommitSha: '3333333333333333333333333333333333333333',
    workflowRunId: '1', artifactId: '2', artifactDigest: H,
    reportSemanticHash: H, runSemanticHash: H, rawArtifactHash: H,
    validatorIdentity: 'NC01_FIXTURE_VALIDATOR',
    validatorRevision: '2222222222222222222222222222222222222222',
    shellFormulationQualified: true, nc02Authorized: true,
  });
}

export function createQualifiedContactEvidenceFixture(id, head = FIXTURE_HEAD) {
  const opening = id === REQUIRED_CONTACT_BENCHMARKS[1];
  const recontact = id === REQUIRED_CONTACT_BENCHMARKS[6];
  const penalty = id === REQUIRED_CONTACT_BENCHMARKS[8];
  const mesh = id === REQUIRED_CONTACT_BENCHMARKS[9];
  const payload = {
    schema: 'nonlinear-shell-contact-contact-benchmark-evidence/v2',
    id, exactHeadSha: head, solverHash: H, implementationHash: H,
    source: 'EXTERNAL_SOLVER_EXECUTION', rawEvidenceHash: H, referenceHash: H, oracleHash: H,
    referenceUncertainty: 1e-8, acceptanceTolerance: opening ? 1e-8 : penalty ? 0.01 : mesh ? 0.001 : 0.0005,
    observedError: penalty ? 0.005 : mesh ? 0.0005 : 0,
    signedGapRange: opening ? [0.02,0.02] : [-0.01,-0.001],
    contactNormal: [0,0,1], pressureRange: opening ? [0,0] : [0,1000],
    activeSetCount: opening ? 0 : 4, penetrationRatio: opening ? 0 : 0.009,
    contactResultant: opening ? [0,0,0] : [0,0,100], contactEnergy: 0,
    tangentialTractionMax: 0, contactWorkImbalance: 0, globalEquilibriumResidual: 1e-8,
    closestPointIdentity: 'INDEPENDENT_ANALYTICAL_MASTER_FACET', surfaceParameterCoordinates: [0,0],
    orientationEvidence: 'MASTER_NORMAL_TO_ADMISSIBLE_SLAVE_REGION',
    penaltySweep: [
      { scale:0.5, pressureLawError:0, normalizedResultant:0.0100, penetrationRatio:0.010 },
      { scale:1, pressureLawError:0, normalizedResultant:0.00995, penetrationRatio:0.0095 },
      { scale:2, pressureLawError:0, normalizedResultant:0.0099, penetrationRatio:0.009 },
    ],
    incrementSweep: [
      { scale:1, resultant:100, penetrationRatio:0.009 },
      { scale:0.5, resultant:100, penetrationRatio:0.009 },
      { scale:0.25, resultant:100, penetrationRatio:0.009 },
    ],
    meshLevels: [
      { globalH:0.5, probeLocalH:0.25, normalizedResultant:0.0099, pressureLawError:0 },
      { globalH:0.25, probeLocalH:0.125, normalizedResultant:0.00995, pressureLawError:0 },
      { globalH:0.125, probeLocalH:0.0625, normalizedResultant:0.009975, pressureLawError:0 },
      { globalH:0.0625, probeLocalH:0.03125, normalizedResultant:0.009987, pressureLawError:0 },
    ],
    stateSequence: recontact ? [
      { active:true, resultant:100 }, { active:false, resultant:0 }, { active:true, resultant:100 },
    ] : [],
    mutation: { id:'GOVERNED_MUTATION', baselineError:0, mutatedError:1 },
  };
  return sealWithHash(payload, 'semanticHash');
}

export function createQualifiedContactEvidenceSet(head = FIXTURE_HEAD) {
  return REQUIRED_CONTACT_BENCHMARKS.map((id) => createQualifiedContactEvidenceFixture(id, head));
}

export function resealContactEvidence(value) {
  const payload = clonePlain(value); delete payload.semanticHash; return sealWithHash(payload, 'semanticHash');
}
