import { sha256Bytes } from './contracts.js';
import { DEFAULT_CONTACT_PROCEDURE, REQUIRED_CONTACT_BENCHMARKS } from './contact-procedure-contract.js';
import { PASSING_SOLVER_CUSTODY } from './nc01-fixtures.js';

const hash = (value) => sha256Bytes(Buffer.from(value));

export const PASSING_SHELL_RECEIPT = Object.freeze({
  shellFormulationQualified: true,
  receiptHash: hash('qualified-shell-receipt'),
});

export function createPassingContactEvidence() {
  return REQUIRED_CONTACT_BENCHMARKS.map((id) => ({
    id,
    referenceHash: hash(`contact-reference:${id}`),
    rawEvidenceHash: hash(`contact-raw:${id}`),
    referenceUncertainty: 0.001,
    acceptanceTolerance: 0.02,
    penetrationRatio: id === 'OPEN_CONTACT_ZERO_TRACTION' ? 0 : 0.002,
    contactWorkImbalance: 0.003,
    globalEquilibriumResidual: 0.004,
    penaltySweep: DEFAULT_CONTACT_PROCEDURE.penaltySensitivityScales.map((scale) => ({ scale, resultant: 1 + 0.001 / scale })),
    incrementSweep: DEFAULT_CONTACT_PROCEDURE.incrementSensitivityScales.map((scale) => ({ scale, resultant: 1 + 0.001 * scale })),
    reversalDifference: id === 'MASTER_SLAVE_REVERSAL' ? 0.003 : 0,
    passed: true,
  }));
}

export { PASSING_SOLVER_CUSTODY };
export const NC02_CONTRACT_FIXTURES = Object.freeze([
  { id: 'DEFAULT_CONTACT_CONTRACT', contract: DEFAULT_CONTACT_PROCEDURE },
  { id: 'PASSING_CONTACT_EVIDENCE_SHAPE', contract: DEFAULT_CONTACT_PROCEDURE, evidence: createPassingContactEvidence() },
]);
