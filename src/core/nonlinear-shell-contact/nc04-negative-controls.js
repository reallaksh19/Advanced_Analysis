import { clonePlain } from './contracts.js';
export const nc04NegativeControls = Object.freeze([
  ['caller-pass', (input) => ({ ...input, status: 'PASS' })],
  ['stale-head', (input) => ({ ...input, candidateExactHeadSha: 'f'.repeat(40) })],
  ['bad-implementation', (input) => ({ ...input, implementationHash: `sha256:${'0'.repeat(64)}` })],
  ['missing-upstream', (input) => ({ ...input, upstreamReceipt: null })],
  ['unqualified-upstream', (input) => ({ ...input, upstreamReceipt: { ...input.upstreamReceipt, nc04Authorized: false } })],
  ['solver-substitution', (input) => ({ ...input, solverCustody: { ...input.solverCustody, binaryHash: `sha256:${'0'.repeat(64)}` } })],
  ['container-substitution', (input) => ({ ...input, solverCustody: { ...input.solverCustody, containerDigest: `sha256:${'0'.repeat(64)}` } })],
  ['missing-evidence', (input) => ({ ...input, evidence: input.evidence.slice(1) })],
  ['duplicate-evidence', (input) => ({ ...input, evidence: [...input.evidence, input.evidence[0]] })],
  ['unknown-evidence', (input) => ({ ...input, evidence: [...input.evidence, { ...input.evidence[0], id: 'UNKNOWN' }] })],
  ['mutated-evidence', (input) => { const value = clonePlain(input); value.evidence[0].metrics.elasticRelativeError = 1; return value; }],
  ['stale-evidence-head', (input) => { const value = clonePlain(input); value.evidence[0].exactHeadSha = 'e'.repeat(40); return value; }],
  ['evidence-source-substitution', (input) => { const value = clonePlain(input); value.evidence[0].implementationHash = `sha256:${'9'.repeat(64)}`; return value; }],
  ['plastic-denting-claim', (input) => ({ ...input, contract: { ...input.contract, plasticDentingAuthorized: true } })],
]);
