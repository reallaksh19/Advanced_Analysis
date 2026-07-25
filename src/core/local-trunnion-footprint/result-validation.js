import { QUALIFICATION_STATES, RESULT_SCHEMA } from './constants.js';
import { sourceError } from './errors.js';
import { canonicalStringify, deepFreeze, strictClone } from './json.js';
import { reconstructTrunnionFootprintResultHashes } from './result-hashes.js';
import { exactKeys } from './validation.js';

const COMMON = [
  'schema', 'workflowIdentity', 'workflowVersion', 'sourceAncestry', 'qualification',
  'canonicalWorkflowModelHash', 'attachmentEvidenceHash', 'formulaTrace', 'diagnostics',
  'limitations', 'semanticHashes',
];
const ACCEPTED = [
  ...COMMON, 'canonicalWorkflowModel', 'canonicalShellModelHash', 'shellResultHash', 'footprintGeometryEvidence',
  'loadDistributionEvidence', 'generatedShellModel', 'rawShellResult', 'loadCaseResults',
  'assessmentRegionResults',
];

export function validateLocalTrunnionFootprintResult(input) {
  const result = strictClone(input);
  if (result.schema !== RESULT_SCHEMA) throw sourceError('RESULT_SCHEMA_MISMATCH', 'schema', `schema must be ${RESULT_SCHEMA}.`);
  const accepted = result.qualification?.state === QUALIFICATION_STATES.ACCEPTED;
  exactKeys(result, accepted ? ACCEPTED : COMMON, 'result');
  if (accepted && result.qualification.accepted !== true) throw sourceError('RESULT_QUALIFICATION_MISMATCH', 'qualification', 'Accepted result must retain accepted=true.');
  if (!accepted && result.qualification?.accepted !== false) throw sourceError('RESULT_QUALIFICATION_MISMATCH', 'qualification', 'Rejected result must retain accepted=false.');
  const reconstructed = reconstructTrunnionFootprintResultHashes(result);
  if (canonicalStringify(reconstructed) !== canonicalStringify(result.semanticHashes)) throw sourceError('RESULT_HASH_MISMATCH', 'semanticHashes', 'Result semantic hashes do not reconstruct.');
  return deepFreeze(result);
}