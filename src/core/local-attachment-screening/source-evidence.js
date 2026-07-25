import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import {
  ENGINEERING_LEVEL as FOUNDATION_ENGINEERING_LEVEL,
  QUALIFICATION_STATES as FOUNDATION_STATES,
  RESULT_SCHEMA as FOUNDATION_RESULT_CONTRACT,
  calculateLocalAttachmentFoundation,
  reconstructResultHashes,
  validateCanonicalLocalAttachmentFoundationModel,
} from '../local-stress/index.js';
import {
  FOUNDATION_LEVEL, FOUNDATION_LIMITATIONS, FOUNDATION_MODEL_SCHEMA,
  FOUNDATION_RESULT_SCHEMA, QUALIFICATION_STATES, SOURCE_SCHEMA,
} from './constants.js';
import { sourceError } from './errors.js';
import { deepClone, exactRecord } from './validation.js';

export function validateFoundationSourceEvidence(input) {
  try { return validateSource(input); }
  catch(error){if(error?.state===QUALIFICATION_STATES.REJECTED_SOURCE_EVIDENCE)throw error;throw sourceError('INVALID_FOUNDATION_EVIDENCE','sourceEvidence',error instanceof Error?error.message:'Invalid source evidence.');}
}
function validateSource(input) {
  exactRecord(input,['schema','foundationModel','foundationResult'],'sourceEvidence');
  if(input.schema!==SOURCE_SCHEMA)throw sourceError('SOURCE_SCHEMA_MISMATCH','sourceEvidence.schema',`schema must be ${SOURCE_SCHEMA}.`);
  const model=validateCanonicalLocalAttachmentFoundationModel(deepClone(input.foundationModel,'sourceEvidence.foundationModel'));
  const result=deepClone(input.foundationResult,'sourceEvidence.foundationResult');
  assertFoundationContracts(model,result);
  assertHashes(model,result);
  assertExpectedResult(model,result);
  assertLimitations(result.limitations);
  return deepFreeze({schema:SOURCE_SCHEMA,foundationModel:model,foundationResult:result});
}
function assertFoundationContracts(model,result) {
  if(model.schema!==FOUNDATION_MODEL_SCHEMA)throw sourceError('FOUNDATION_MODEL_SCHEMA','sourceEvidence.foundationModel.schema','Unsupported foundation model schema.');
  if(result?.schema!==FOUNDATION_RESULT_SCHEMA||result.schema!==FOUNDATION_RESULT_CONTRACT)throw sourceError('FOUNDATION_RESULT_SCHEMA','sourceEvidence.foundationResult.schema','Unsupported foundation result schema.');
  if(result.qualification?.state!==FOUNDATION_STATES.ACCEPTED)throw sourceError('FOUNDATION_RESULT_REJECTED','sourceEvidence.foundationResult.qualification.state','Foundation result must be accepted.');
  if(result.qualification?.engineeringLevel!==FOUNDATION_LEVEL||FOUNDATION_ENGINEERING_LEVEL!==FOUNDATION_LEVEL)throw sourceError('FOUNDATION_ENGINEERING_LEVEL','sourceEvidence.foundationResult.qualification.engineeringLevel','Foundation engineering level mismatch.');
  if(result.modelIdentity!==model.modelIdentity||result.modelVersion!==model.modelVersion)throw sourceError('FOUNDATION_MODEL_IDENTITY_MISMATCH','sourceEvidence','Foundation model/result identity mismatch.');
  assertUnique(result.transformedLoadCases,'identity','sourceEvidence.foundationResult.transformedLoadCases');
  assertUnique(result.pressureStressResults,'pressureDefinitionIdentity','sourceEvidence.foundationResult.pressureStressResults');
}
function assertUnique(rows,key,path){if(!Array.isArray(rows))throw sourceError('FOUNDATION_ARRAY_REQUIRED',path,`${path} must be an array.`);const seen=new Set();rows.forEach((row)=>{if(seen.has(row?.[key]))throw sourceError('FOUNDATION_DUPLICATE_EVIDENCE',path,`Duplicate ${key} ${row?.[key]}.`);seen.add(row?.[key]);});}
function assertHashes(model,result) {
  if(result.sourceAncestry?.canonicalModelSemanticHash!==model.semanticHash)throw sourceError('FOUNDATION_MODEL_HASH_MISMATCH','sourceEvidence.foundationResult.sourceAncestry','Canonical model hash mismatch.');
  if(semanticHash(result.sourceAncestry)!==semanticHash(model.sourceAncestry))throw sourceError('FOUNDATION_ANCESTRY_MISMATCH','sourceEvidence','Foundation ancestry mismatch.');
  const reconstructed=reconstructResultHashes(result);
  if(semanticHash(reconstructed)!==semanticHash(result.semanticHashes))throw sourceError('FOUNDATION_RESULT_HASH_MISMATCH','sourceEvidence.foundationResult.semanticHashes','Foundation result hashes do not reconstruct.');
}
function assertExpectedResult(model,result) {
  const expected=calculateLocalAttachmentFoundation(model);
  if(expected.qualification.state!==FOUNDATION_STATES.ACCEPTED||semanticHash(expected)!==semanticHash(result))throw sourceError('FOUNDATION_RESULT_FORGED','sourceEvidence.foundationResult','Foundation result does not reconstruct from the retained model.');
}
function assertLimitations(values) {
  if(!Array.isArray(values))throw sourceError('FOUNDATION_LIMITATIONS_REQUIRED','sourceEvidence.foundationResult.limitations','Foundation limitations are required.');
  FOUNDATION_LIMITATIONS.forEach((value)=>{if(!values.includes(value))throw sourceError('FOUNDATION_LIMITATION_MISSING','sourceEvidence.foundationResult.limitations',`Missing ${value}.`);});
}
