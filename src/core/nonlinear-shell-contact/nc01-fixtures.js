import { sha256Bytes } from './contracts.js';
import { DEFAULT_SHELL_FORMULATION } from './shell-formulation-contract.js';
import { SHELL_BENCHMARK_CATALOG } from './shell-benchmark-catalog.js';

const hash = (value) => sha256Bytes(Buffer.from(value));

export function createPassingShellEvidence() {
  return SHELL_BENCHMARK_CATALOG.map((benchmark, index) => ({
    id: benchmark.id,
    referenceHash: hash(`reference:${benchmark.id}`),
    rawEvidenceHash: hash(`raw:${benchmark.id}`),
    referenceUncertainty: 0.002,
    acceptanceTolerance: 0.02,
    observedError: 0.005 + index * 0.0001,
    meshLevels: Array.from({ length: benchmark.minimumMeshLevels }, (_, level) => ({
      characteristicSize: 1 / (level + 1),
      quantity: 1 + 1 / ((level + 2) ** 2),
    })),
    passed: true,
  }));
}

export const PASSING_SOLVER_CUSTODY = Object.freeze({
  solverVersion: 'PINNED_TEST_PROFILE',
  solverSourceCommit: '0000000000000000000000000000000000000001',
  sourceArchiveHash: hash('source'),
  binaryHash: hash('binary'),
  containerDigest: hash('container'),
  compiler: 'PINNED_COMPILER',
  compilerFlags: '-O2',
  linkedLibrariesHash: hash('libraries'),
  platform: 'linux-x86_64',
  threadCount: 1,
});

export const NC01_CONTRACT_FIXTURES = Object.freeze([
  { id: 'DEFAULT_CONTRACT', contract: DEFAULT_SHELL_FORMULATION },
  { id: 'PASSING_EVIDENCE_SHAPE', contract: DEFAULT_SHELL_FORMULATION, solverCustody: PASSING_SOLVER_CUSTODY, benchmarkEvidence: createPassingShellEvidence() },
]);
