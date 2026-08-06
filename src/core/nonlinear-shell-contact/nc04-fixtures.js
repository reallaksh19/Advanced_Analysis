import { sealWithHash } from './contracts.js';
import { DEFAULT_PLASTIC_MATERIAL, REQUIRED_NC04_BENCHMARKS } from './plastic-material-contract.js';

export const NC04_FIXTURE_HEAD = '0123456789abcdef0123456789abcdef01234567';
export const NC04_FIXTURE_IMPLEMENTATION = `sha256:${'1'.repeat(64)}`;
export const NC04_FIXTURE_SOLVER = Object.freeze({
  solverVersion: '2.22',
  solverSourceCommit: 'cff1bb12ec7d24ad9048a1f54ae243a18d1a0b54',
  binaryHash: 'sha256:9a33d293706a66bee86f2f0ecf996a66758f904c20d61ad8c83ddc0f92ae4b7e',
  containerDigest: 'sha256:e6a82117027ef72afbecd597b81ebd83e5b40bdcfc63a70422b799aeb79270fb',
});

export function qualifiedNc03Fixture() {
  return sealWithHash({
    schema: 'nonlinear-shell-contact-nc03-upstream-binding/v1',
    phase: 'NC-03',
    exactHeadSha: 'b'.repeat(40),
    mergeCommitSha: 'c'.repeat(40),
    workflowRunId: '1',
    artifactId: '2',
    artifactDigest: `sha256:${'2'.repeat(64)}`,
    reportSemanticHash: `sha256:${'3'.repeat(64)}`,
    runSemanticHash: `sha256:${'4'.repeat(64)}`,
    elasticDentingProcedureHash: `sha256:${'5'.repeat(64)}`,
    implementationHash: `sha256:${'6'.repeat(64)}`,
    shellFormulationQualified: true,
    contactProcedureQualified: true,
    elasticDentingProcedureQualified: true,
    nc04Authorized: true,
  }, 'semanticHash');
}

const metrics = Object.freeze([
  { elasticRelativeError: 0, poissonAbsoluteError: 0, maxPeeq: 0 },
  { yieldStressAbsoluteError: 0, maxPeeq: 0 },
  { maxStressAbsoluteError: 0, maxPlasticStrainAbsoluteError: 0 },
  { unloadedStressAbsolute: 0, residualStrainAbsoluteError: 0, unloadModulusRelativeError: 0 },
  { maxDeviatoricStress: 0, peeq: 0, bulkStressRelativeError: 0 },
  { j2ConsistencyRelativeError: 0, offModeStressRatio: 0 },
  { j2ConsistencyRelativeError: 0, offModeStressRatio: 0 },
  { stressSpreadRelative: 0, plasticStrainSpread: 0 },
  { tangentRelativeError: 0, reproducibilityAbsolute: 0 },
]);

export function qualifiedNc04Input() {
  return {
    contract: DEFAULT_PLASTIC_MATERIAL,
    candidateExactHeadSha: NC04_FIXTURE_HEAD,
    implementationHash: NC04_FIXTURE_IMPLEMENTATION,
    upstreamReceipt: qualifiedNc03Fixture(),
    solverCustody: NC04_FIXTURE_SOLVER,
    evidence: REQUIRED_NC04_BENCHMARKS.map((id, index) => sealWithHash({
      schema: 'lafea-nc04-material-evidence/v2',
      id,
      exactHeadSha: NC04_FIXTURE_HEAD,
      solverHash: NC04_FIXTURE_SOLVER.binaryHash,
      implementationHash: NC04_FIXTURE_IMPLEMENTATION,
      caseCount: 1,
      deckHashes: [`sha256:${String(index + 1).padStart(64, '0')}`],
      rawOutputHashes: [`sha256:${String(index + 11).padStart(64, '0')}`],
      metrics: metrics[index],
    }, 'evidenceHash')),
  };
}
