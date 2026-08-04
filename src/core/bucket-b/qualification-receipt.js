import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { SHARED_GATE_RECEIPT_SCHEMA } from './registry.js';
export const INDEPENDENT_CHECKER_SCHEMA = 'bucket-b-independent-checker-evidence/v1';
export function createIndependentCheckerEvidence({ exactHeadSha, sourceArtifactHashes, rawEvidenceHashes, semanticEvidenceHashes, ancestry, checks } = {}) {
  requireGitSha(exactHeadSha); requireHashArray(sourceArtifactHashes, 'sourceArtifactHashes'); requireHashArray(rawEvidenceHashes, 'rawEvidenceHashes'); requireHashArray(semanticEvidenceHashes, 'semanticEvidenceHashes');
  if (!ancestry || !isHash(ancestry.baseRecordHash) || !isHash(ancestry.parentSpecificationHash)) throw new TypeError('Independent checker ancestry hashes are required.');
  if (!Array.isArray(checks) || checks.length === 0) throw new TypeError('Independent checker checks are required.');
  checks.forEach((row, index) => { if (typeof row?.checkId !== 'string' || !['PASS', 'FAIL'].includes(row.status)) throw new TypeError(`Invalid independent checker check ${index}.`); });
  const payload = { schema: INDEPENDENT_CHECKER_SCHEMA, exactHeadSha, sourceArtifactHashes: [...sourceArtifactHashes], rawEvidenceHashes: [...rawEvidenceHashes], semanticEvidenceHashes: [...semanticEvidenceHashes], ancestry: { ...ancestry }, checks: checks.map((row) => ({ checkId: row.checkId, status: row.status, evidenceHash: row.evidenceHash ?? null })), status: checks.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL' };
  return seal(payload);
}
export function validateIndependentCheckerEvidence(evidence) {
  if (!evidence || evidence.schema !== INDEPENDENT_CHECKER_SCHEMA) throw new TypeError('Independent checker evidence schema mismatch.');
  verifyHash(evidence); requireGitSha(evidence.exactHeadSha); requireHashArray(evidence.sourceArtifactHashes, 'sourceArtifactHashes'); requireHashArray(evidence.rawEvidenceHashes, 'rawEvidenceHashes'); requireHashArray(evidence.semanticEvidenceHashes, 'semanticEvidenceHashes');
  if (evidence.status !== 'PASS' || evidence.checks.some((row) => row.status !== 'PASS')) throw new TypeError('Independent checker evidence did not pass.');
  return true;
}
export function createSharedGateQualificationReceipt({ exactHeadSha, baseSha, sourceArtifactHashes, rawEvidenceHashes, semanticEvidenceHashes, changedPaths, checkResults, independentCheckerEvidence } = {}) {
  requireGitSha(exactHeadSha); requireGitSha(baseSha); validateIndependentCheckerEvidence(independentCheckerEvidence); if (independentCheckerEvidence.exactHeadSha !== exactHeadSha) throw new TypeError('Independent checker exact head mismatch.');
  requireHashArray(sourceArtifactHashes, 'sourceArtifactHashes'); requireHashArray(rawEvidenceHashes, 'rawEvidenceHashes'); requireHashArray(semanticEvidenceHashes, 'semanticEvidenceHashes');
  if (!Array.isArray(changedPaths) || changedPaths.length === 0 || !changedPaths.every((value) => typeof value === 'string' && value.length > 0)) throw new TypeError('Changed-path evidence is required.');
  if (!Array.isArray(checkResults) || checkResults.length === 0) throw new TypeError('Shared-gate check results are required.');
  const passed = checkResults.every((row) => row.status === 'PASS');
  const payload = { schema: SHARED_GATE_RECEIPT_SCHEMA, exactHeadSha, baseSha, sourceArtifactHashes: [...sourceArtifactHashes], rawEvidenceHashes: [...rawEvidenceHashes], semanticEvidenceHashes: [...semanticEvidenceHashes], changedPaths: [...changedPaths].sort(), checkResults: checkResults.map((row) => ({ checkId: row.checkId, status: row.status, evidenceHash: row.evidenceHash ?? null })), independentCheckerEvidence, status: passed ? 'SHARED_Q8_GATES_QUALIFIED' : 'SHARED_Q8_GATES_BLOCKED', bb06Authorized: passed, applicationModulePromoted: false, axisymmetricAuthorized: false, productionSwitchAuthorized: false };
  return seal(payload);
}
export function validateSharedGateQualificationReceipt(receipt) {
  if (!receipt || receipt.schema !== SHARED_GATE_RECEIPT_SCHEMA) throw new TypeError('Shared-gate receipt schema mismatch.');
  verifyHash(receipt); validateIndependentCheckerEvidence(receipt.independentCheckerEvidence);
  if (receipt.status !== 'SHARED_Q8_GATES_QUALIFIED' || receipt.bb06Authorized !== true || receipt.applicationModulePromoted !== false || receipt.axisymmetricAuthorized !== false || receipt.productionSwitchAuthorized !== false) throw new TypeError('Shared-gate receipt authority flags are invalid.');
  if (receipt.independentCheckerEvidence.exactHeadSha !== receipt.exactHeadSha) throw new TypeError('Receipt ancestry exact head mismatch.');
  return true;
}
function seal(payload) { const clean = JSON.parse(JSON.stringify(payload)); return deepFreeze({ ...clean, semanticHash: semanticHash(clean) }); }
function verifyHash(value) { const copy = JSON.parse(JSON.stringify(value)); const hash = copy.semanticHash; delete copy.semanticHash; if (semanticHash(copy) !== hash) throw new TypeError('Receipt semantic hash mismatch.'); }
function requireGitSha(value) { if (typeof value !== 'string' || !/^[0-9a-f]{40}$/i.test(value)) throw new TypeError('A 40-character Git SHA is required.'); }
function requireHashArray(value, name) { if (!Array.isArray(value) || value.length === 0 || !value.every(isHash)) throw new TypeError(`${name} must be a nonempty governed-hash array.`); }
function isHash(value) { return typeof value === 'string' && /^(?:sha256:[0-9a-f]{64}|fnv1a64:[0-9a-f]{16})$/i.test(value); }
