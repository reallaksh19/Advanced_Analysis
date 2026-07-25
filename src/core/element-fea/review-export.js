import { deepFreeze } from '../shared-piping-model/immutable.js';
import { canonicalPrettyStringify, hashUtf8, semanticHash, utf8ByteLength } from '../shared-piping-model/canonical-json.js';
import { createReviewProfile, createReviewInput, EVIDENCE_EXPORT_SCHEMA, EXPORT_STATUS, REVIEW_STATUSES, compareIdentity, normalizeLimitations, sortDiagnostics } from './review-contract.js';
import { validateEngineeringReview } from './review-result.js';
import { createReviewCsvFiles } from './review-csv.js';
import { createReviewMarkdown } from './review-markdown.js';

const MANIFEST_POLICY = 'LFEA-006_NON_RECURSIVE_MANIFEST_IDENTITY_V1';

export function createEvidenceExport(review, inputValue, profileValue) {
  let profile;
  try {
    profile = createReviewProfile(profileValue);
    const input = createReviewInput(inputValue);
    qualifyExportInputs(review, input, profile);
    return acceptedExport(review, input, profile);
  } catch (error) {
    return rejectedExport(review, profile, error);
  }
}

export function validateEvidenceExport(value) {
  const errors=[];
  if(value?.schema!==EVIDENCE_EXPORT_SCHEMA)errors.push('Invalid lfea-evidence-export/v1 schema.');
  if(!Object.values(EXPORT_STATUS).includes(value?.status))errors.push('Evidence-export status is invalid.');
  try{if(value?.semanticHash!==semanticHash(withoutHash(value)))errors.push('Evidence-export semantic hash mismatch.');}catch(error){errors.push(error.message);}
  if(value?.status===EXPORT_STATUS.QUALIFIED)validateAccepted(value,errors);else validateRejected(value,errors);
  return deepFreeze({ok:errors.length===0,errors});
}

function acceptedExport(review,input,profile){
  const csvFiles=createReviewCsvFiles(review,profile);
  const rowCount=csvFiles.reduce((sum,row)=>sum+row.rowCount,0);
  if(rowCount>profile.maximumExportRows)throw capacity('EXPORT_ROW_CAPACITY',`Export row count ${rowCount} exceeds ${profile.maximumExportRows}.`);
  const plainFiles=[
    textFile('review.json','application/json',canonicalPrettyStringify(review),'QUALIFIED_ENGINEERING_REVIEW',[review.reviewIdentity]),
    textFile('summary.md','text/markdown',createReviewMarkdown(review,profile),'READ_ONLY_ENGINEERING_SUMMARY',[review.reviewIdentity]),
    ...csvFiles.map((row)=>textFile(row.path,'text/csv',row.content,'DETERMINISTIC_TABULAR_REVIEW',[review.reviewIdentity],row.rowCount)),
    ...sourceFiles(input,profile),
  ];
  assertUniquePaths(plainFiles);
  const manifestPayload=createManifestPayload(review,profile,plainFiles,input);
  const files=[manifestPayload,...plainFiles].sort((a,b)=>compareIdentity(a.path,b.path));
  const totalByteLength=files.reduce((sum,row)=>sum+row.byteLength,0);
  if(totalByteLength>profile.maximumExportBytes)throw capacity('EXPORT_BYTE_CAPACITY',`Export byte length ${totalByteLength} exceeds ${profile.maximumExportBytes}.`);
  const base={schema:EVIDENCE_EXPORT_SCHEMA,status:EXPORT_STATUS.QUALIFIED,exportIdentity:`${review.reviewIdentity}:EVIDENCE_EXPORT`,exportVersion:'1',reviewIdentity:review.reviewIdentity,reviewSemanticHash:review.semanticHash,profileIdentity:profile.profileIdentity,sourceArtifactIdentities:review.sourceArtifactIdentities,sourceArtifactHashes:review.sourceArtifactHashes,files,totalFileCount:files.length,totalByteLength,totalRowCount:rowCount,limitations:normalizeLimitations(review.limitations),diagnostics:[]};
  return deepFreeze({...base,semanticHash:semanticHash(base)});
}

function rejectedExport(review,profile,error){
  const base={schema:EVIDENCE_EXPORT_SCHEMA,status:EXPORT_STATUS.REJECTED,exportIdentity:`${review?.reviewIdentity||'REJECTED_REVIEW'}:EVIDENCE_EXPORT`,exportVersion:'1',reviewIdentity:review?.reviewIdentity||null,reviewSemanticHash:review?.semanticHash||null,profileIdentity:profile?.profileIdentity||null,sourceArtifactIdentities:review?.sourceArtifactIdentities||null,sourceArtifactHashes:review?.sourceArtifactHashes||null,files:[],totalFileCount:0,totalByteLength:0,totalRowCount:0,limitations:normalizeLimitations(review?.limitations||[]),diagnostics:sortDiagnostics([{severity:'ERROR',code:error.code||'EXPORT_REJECTED',sourceArtifactIdentity:review?.reviewIdentity||'LFEA-006',message:error.message}])};
  return deepFreeze({...base,semanticHash:semanticHash(base)});
}

function qualifyExportInputs(review,input,profile){
  const validation=validateEngineeringReview(review);if(!validation.ok)throw new TypeError(validation.errors[0]);
  if(review.status!==REVIEW_STATUSES.QUALIFIED)throw new TypeError('Evidence export requires a qualified engineering review.');
  if(review.profileIdentity!==profile.profileIdentity)throw new TypeError('Review and export profile identities do not match.');
  const hashes=review.sourceArtifactHashes;
  if(hashes.adapterResult!==input.adapterResult.semanticHash||hashes.model!==input.model.semanticHash||hashes.result!==input.result.semanticHash)throw new TypeError('Review/source artifact hashes do not match the export input.');
}

function createManifestPayload(review,profile,files,input){
  const optional=optionalFileEvidence(review,profile,input);
  const fileRows=files.map(manifestFileRow).sort((a,b)=>compareIdentity(a.path,b.path));
  let byteLength=0,content='';
  for(let index=0;index<20;index+=1){
    const self={path:'manifest.json',mediaType:'application/json',encoding:'UTF-8',contentHash:null,byteLength,authority:MANIFEST_POLICY,sourceArtifactIdentities:[review.reviewIdentity]};
    const rows=[self,...fileRows].sort((a,b)=>compareIdentity(a.path,b.path));
    const base={schema:EVIDENCE_EXPORT_SCHEMA,exportIdentity:`${review.reviewIdentity}:EVIDENCE_EXPORT`,exportVersion:'1',reviewIdentity:review.reviewIdentity,reviewSemanticHash:review.semanticHash,profileIdentity:profile.profileIdentity,sourceArtifactIdentities:review.sourceArtifactIdentities,sourceArtifactHashes:review.sourceArtifactHashes,files:rows,optionalFiles:optional,totalFileCount:rows.length,totalByteLength:files.reduce((sum,row)=>sum+row.byteLength,0)+byteLength,limitations:normalizeLimitations(review.limitations),identityPolicy:MANIFEST_POLICY,semanticHash:null};
    const identityHash=semanticHash(base);const next=canonicalPrettyStringify({...base,semanticHash:identityHash});const nextLength=utf8ByteLength(next);
    content=next;if(nextLength===byteLength)break;byteLength=nextLength;
  }
  return textFile('manifest.json','application/json',content,MANIFEST_POLICY,[review.reviewIdentity]);
}

function sourceFiles(input,profile){
  if(!profile.includeSourceArtifacts)return[];
  const rows=[
    ['source/adapter-result.json',input.adapterResult],['source/model.json',input.model],['source/result.json',input.result],
    ['source/convergence-study.json',input.convergenceStudy],['source/convergence-result.json',input.convergenceResult],['source/stress-projection.json',input.stressProjection],
  ];
  return rows.filter(([,value])=>value!==null).map(([path,value])=>textFile(path,'application/json',canonicalPrettyStringify(value),'SOURCE_ARTIFACT_FULL_PRECISION',[artifactIdentity(value)]));
}

function optionalFileEvidence(review,profile,input){
  const rows=[];
  rows.push(optional('tables/projected-stress.csv',review.projectedStressReview.status==='AVAILABLE_NON_AUTHORITATIVE'));
  rows.push(optional('tables/convergence.csv',review.convergenceReview.status==='AVAILABLE'));
  for(const [path,value] of [['source/adapter-result.json',input.adapterResult],['source/model.json',input.model],['source/result.json',input.result],['source/convergence-study.json',input.convergenceStudy],['source/convergence-result.json',input.convergenceResult],['source/stress-projection.json',input.stressProjection]])rows.push(optional(path,profile.includeSourceArtifacts&&value!==null));
  return rows.sort((a,b)=>compareIdentity(a.path,b.path));
}

function optional(path,present){return{path,status:present?'PRESENT':'ABSENT_NOT_REQUESTED_OR_NOT_SUPPLIED'};}
function textFile(path,mediaType,content,authority,identities,rowCount=null){
  if(typeof content!=='string')throw new TypeError(`Export content for ${path} must be UTF-8 text.`);
  const bytes=utf8ByteLength(content);
  return{path,mediaType,encoding:'UTF-8',content,contentHash:hashUtf8(content),byteLength:bytes,authority,sourceArtifactIdentities:[...identities].sort(compareIdentity),rowCount};
}
function manifestFileRow(row){const{content:_content,rowCount:_rowCount,...base}=row;return base;}
function artifactIdentity(value){return value.projectionIdentity||value.interpretationIdentity||value.studyIdentity||value.modelIdentity||value.sourcePackageIdentity||value.schema;}
function assertUniquePaths(files){if(new Set(files.map((row)=>row.path)).size!==files.length)throw new TypeError('Duplicate export path.');}
function validateAccepted(value,errors){
  if(!Array.isArray(value.files)||!value.files.length)errors.push('Qualified export has no files.');
  if(new Set((value.files||[]).map((row)=>row.path)).size!==(value.files||[]).length)errors.push('Qualified export contains duplicate paths.');
  let total=0;for(const file of value.files||[]){if(file.encoding!=='UTF-8'||typeof file.content!=='string')errors.push(`Export file ${file.path} is not UTF-8 text.`);if(file.contentHash!==hashUtf8(file.content))errors.push(`Export file ${file.path} content hash mismatch.`);if(file.byteLength!==utf8ByteLength(file.content))errors.push(`Export file ${file.path} byte length mismatch.`);total+=file.byteLength;}
  if(total!==value.totalByteLength||value.totalFileCount!==value.files.length)errors.push('Export aggregate counts are inconsistent.');
  const manifest=value.files?.find((row)=>row.path==='manifest.json');if(!manifest)errors.push('Qualified export is missing manifest.json.');else validateManifest(manifest,value,errors);
}
function validateManifest(file,exportValue,errors){
  let manifest;try{manifest=JSON.parse(file.content);}catch{errors.push('Manifest JSON is invalid.');return;}
  const declared=manifest.semanticHash;manifest.semanticHash=null;if(declared!==semanticHash(manifest))errors.push('Manifest semantic hash mismatch.');
  if(manifest.identityPolicy!==MANIFEST_POLICY)errors.push('Manifest identity policy is invalid.');
  if(manifest.reviewSemanticHash!==exportValue.reviewSemanticHash||manifest.totalFileCount!==exportValue.totalFileCount||manifest.totalByteLength!==exportValue.totalByteLength)errors.push('Manifest/export identity or aggregate counts mismatch.');
  const rows=new Map(manifest.files.map((row)=>[row.path,row]));for(const actual of exportValue.files){const row=rows.get(actual.path);if(!row){errors.push(`Manifest omits ${actual.path}.`);continue;}if(actual.path==='manifest.json'){if(row.contentHash!==null)errors.push('Manifest self content hash must be excluded.');}else if(row.contentHash!==actual.contentHash||row.byteLength!==actual.byteLength)errors.push(`Manifest file evidence mismatch for ${actual.path}.`);}
}
function validateRejected(value,errors){if(value.files?.length||value.totalFileCount!==0||value.totalByteLength!==0)errors.push('Rejected export exposes qualified files.');if(!value.diagnostics?.some((row)=>row.severity==='ERROR'))errors.push('Rejected export requires an error diagnostic.');}
function capacity(code,message){const error=new Error(message);error.code=code;return error;}
function withoutHash(value){const{semanticHash:_hash,...base}=value||{};return base;}
