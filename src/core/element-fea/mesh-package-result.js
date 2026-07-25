import { deepFreeze } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { createContinuumModel } from './model.js';
import { compareIdentity } from './mesh-package-contract.js';
import { MESH_ADAPTER_RESULT_SCHEMA, MESH_ADAPTER_STATUS, PACKAGE_LIMITATIONS } from './mesh-package-constants.js';

export function createAcceptedMeshAdapterResult(input) {
  const base=commonBase(input,MESH_ADAPTER_STATUS.ACCEPTED);
  const result={...base,qualifiedModel:input.qualifiedModel,qualifiedModelSemanticHash:input.qualifiedModel.semanticHash,topologyEvidence:input.topologyEvidence,entityEvidence:input.entityEvidence,assignmentEvidence:input.assignmentEvidence,mappingLedger:[...input.mappingLedger].sort(mappingCompare),diagnostics:sortDiagnostics(input.diagnostics||[]),limitations:[...PACKAGE_LIMITATIONS]};
  return freezeWithHash(result);
}
export function createRejectedMeshAdapterResult(input) {
  const base=commonBase(input,MESH_ADAPTER_STATUS.REJECTED);
  return freezeWithHash({...base,qualifiedModel:null,qualifiedModelSemanticHash:null,topologyEvidence:input.topologyEvidence||null,entityEvidence:null,assignmentEvidence:null,mappingLedger:[],diagnostics:sortDiagnostics(input.diagnostics||[]),limitations:[...PACKAGE_LIMITATIONS]});
}
export function validateMeshAdapterResult(value) {
  const errors=[];
  try{assertResult(value);}catch(error){errors.push(error.message);}
  return deepFreeze({ok:errors.length===0,errors:errors.sort(compareIdentity)});
}
function commonBase(input,status){return{schema:MESH_ADAPTER_RESULT_SCHEMA,status,sourcePackageIdentity:textOrNull(input.sourcePackageIdentity),sourcePackageVersion:textOrNull(input.sourcePackageVersion),sourcePackageSemanticHash:textOrNull(input.sourcePackageSemanticHash),adapterProfileIdentity:textOrNull(input.adapterProfileIdentity)};}
function freezeWithHash(base){return deepFreeze({...base,semanticHash:semanticHash(base)});}
function assertResult(value){if(!value||typeof value!=='object'||Array.isArray(value))throw new TypeError('Adapter result must be a record.');if(value.schema!==MESH_ADAPTER_RESULT_SCHEMA)throw new TypeError('Invalid lfea-mesh-adapter-result/v1 schema.');if(!Object.values(MESH_ADAPTER_STATUS).includes(value.status))throw new TypeError('Adapter result status is invalid.');const{semanticHash:declared,...base}=value;if(declared!==semanticHash(base))throw new TypeError('Adapter result semantic hash mismatch.');if(value.status===MESH_ADAPTER_STATUS.ACCEPTED)assertAccepted(value);else assertRejected(value);}
function assertAccepted(value){if(!value.qualifiedModel||value.qualifiedModelSemanticHash!==value.qualifiedModel.semanticHash)throw new TypeError('Accepted adapter result model identity is invalid.');const model=createContinuumModel(value.qualifiedModel);if(model.semanticHash!==value.qualifiedModelSemanticHash)throw new TypeError('Accepted adapter result model is not qualified.');if(model.sourceSemanticHash!==value.sourcePackageSemanticHash)throw new TypeError('Accepted adapter result source/model ancestry mismatch.');if(!value.topologyEvidence||!value.entityEvidence||!value.assignmentEvidence||!Array.isArray(value.mappingLedger))throw new TypeError('Accepted adapter result evidence is incomplete.');}
function assertRejected(value){if(value.qualifiedModel!==null||value.qualifiedModelSemanticHash!==null)throw new TypeError('Rejected adapter result exposes a qualified model.');if(value.entityEvidence!==null||value.assignmentEvidence!==null||!Array.isArray(value.mappingLedger)||value.mappingLedger.length)throw new TypeError('Rejected adapter result exposes solver-ready mapping evidence.');if(!Array.isArray(value.diagnostics)||!value.diagnostics.length)throw new TypeError('Rejected adapter result requires diagnostics.');}
function sortDiagnostics(rows){return[...rows].map((row)=>deepFreeze(row)).sort((a,b)=>compareIdentity(a.code,b.code)||compareIdentity(a.message,b.message));}
function mappingCompare(a,b){return compareIdentity(a.mappingIdentity,b.mappingIdentity);}
function textOrNull(value){return typeof value==='string'&&value.trim()?value.trim():null;}
