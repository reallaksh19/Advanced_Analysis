import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';

export const PREPRODUCTION_TL_APPLICABILITY_SCHEMA = 'engineering-preproduction-thermal-liftoff-applicability-binding/v1';
export const PREPRODUCTION_TL_STIFFNESS_SCHEMA = 'engineering-preproduction-thermal-liftoff-stiffness-evidence/v1';
export const PREPRODUCTION_TL_REACTION_TOLERANCE_SCHEMA = 'engineering-preproduction-thermal-liftoff-reaction-tolerance-authority/v1';
const LOCAL='LOCAL_EFFECTIVE_VERTICAL_STIFFNESS';
const MATRIX=new Set(['REDUCED_VERTICAL_STIFFNESS_MATRIX_EVIDENCE','REDUCED_VERTICAL_FLEXIBILITY_MATRIX_EVIDENCE']);
const STIFFNESS_SOURCES=new Set(['BENCHMARKED_TEMPLATE','SOURCE_SOLVER','MEASURED_TEST','APPROVED_ENGINEERING_DATA']);
const TOLERANCE_SOURCES=new Set(['BENCHMARK_QUALIFIED','MEASURED_TEST','APPROVED_ENGINEERING_DATA']);
const GENERIC_SITES=new Set(['*','DEFAULT','GLOBAL','ALL','TYPICAL']);
export function createPreproductionThermalLiftoffApplicabilityBinding(input) {
  exact(input, ['applicabilityId','supportSiteId','classId','templateId','templateRevision','contactAuthoritySemanticHash','contactRowSemanticHash','geometrySemanticHash','supportCapabilitySemanticHash','linePropertySemanticHash','coordinateFrameSemanticHash','source'], 'TL-02 applicability input');
  const site = siteId(input.supportSiteId); const blockers = [];
  if (!['TL-A','TL-B','TL-C'].includes(input.classId)) throw new TypeError('classId must be TL-A, TL-B or TL-C.');
  if (input.classId === 'TL-C') blockers.push(issue('PREPRODUCTION_TL02_APPLICABILITY_CLASS_REQUIRES_DETAILED_ANALYSIS', site));
  return freezeHash({
    schema:PREPRODUCTION_TL_APPLICABILITY_SCHEMA, applicabilityId:text(input.applicabilityId,'applicabilityId'), supportSiteId:site,
    classId:input.classId, templateId:text(input.templateId,'templateId'), templateRevision:text(input.templateRevision,'templateRevision'),
    contactAuthoritySemanticHash:hash(input.contactAuthoritySemanticHash,'contactAuthoritySemanticHash'), contactRowSemanticHash:hash(input.contactRowSemanticHash,'contactRowSemanticHash'),
    geometrySemanticHash:hash(input.geometrySemanticHash,'geometrySemanticHash'), supportCapabilitySemanticHash:hash(input.supportCapabilitySemanticHash,'supportCapabilitySemanticHash'),
    linePropertySemanticHash:hash(input.linePropertySemanticHash,'linePropertySemanticHash'), coordinateFrameSemanticHash:hash(input.coordinateFrameSemanticHash,'coordinateFrameSemanticHash'),
    source:sourceIdentity(input.source,'applicability source'), qualification:blockers.length?'UNRESOLVED':'QUALIFIED', blockers:uniqueIssues(blockers),
  });
}

export function requirePreproductionThermalLiftoffApplicabilityBinding(value) {
  if (value?.schema !== PREPRODUCTION_TL_APPLICABILITY_SCHEMA) throw coded('PREPRODUCTION_TL02_APPLICABILITY_SCHEMA_INVALID');
  const normalized=createPreproductionThermalLiftoffApplicabilityBinding({
    applicabilityId:value.applicabilityId,supportSiteId:value.supportSiteId,classId:value.classId,templateId:value.templateId,templateRevision:value.templateRevision,
    contactAuthoritySemanticHash:value.contactAuthoritySemanticHash,contactRowSemanticHash:value.contactRowSemanticHash,geometrySemanticHash:value.geometrySemanticHash,
    supportCapabilitySemanticHash:value.supportCapabilitySemanticHash,linePropertySemanticHash:value.linePropertySemanticHash,coordinateFrameSemanticHash:value.coordinateFrameSemanticHash,source:value.source,
  });
  if(normalized.semanticHash!==value.semanticHash) throw coded('PREPRODUCTION_TL02_APPLICABILITY_HASH_MISMATCH'); return normalized;
}

export function createPreproductionThermalLiftoffStiffnessEvidence(input) {
  exact(input,['entryId','supportSiteId','representation','data','units','ordering','source','benchmarkReference','applicability','qualification'],'TL-02 stiffness input');
  const site=siteId(input.supportSiteId), source=sourceIdentity(input.source,'stiffness source'), applicability=requirePreproductionThermalLiftoffApplicabilityBinding(input.applicability), blockers=[];
  if(input.qualification!=='QUALIFIED') blockers.push(issue('PREPRODUCTION_TL02_STIFFNESS_UNQUALIFIED',site));
  if(!STIFFNESS_SOURCES.has(source.sourceKind)) blockers.push(issue('PREPRODUCTION_TL02_STIFFNESS_SOURCE_UNQUALIFIED',site));
  if(applicability.qualification!=='QUALIFIED') blockers.push(issue('PREPRODUCTION_TL02_APPLICABILITY_UNQUALIFIED',site));
  const ordering=order(input.ordering), representation=text(input.representation,'representation'); let data;
  if(representation===LOCAL){ if(input.units!=='N_PER_M'||ordering.length!==1||ordering[0]!==site) throw new TypeError('Local TL-02 stiffness must be N_PER_M ordered to one exact support site.'); data={kind:'SCALAR',effectiveVerticalStiffnessNPerM:positive(input.data?.effectiveVerticalStiffnessNPerM,'effectiveVerticalStiffnessNPerM')}; }
  else if(MATRIX.has(representation)){ const expected=representation.includes('FLEXIBILITY')?'M_PER_N':'N_PER_M'; if(input.units!==expected) throw new TypeError(`Matrix evidence must use ${expected}.`); data=matrix(input.data,ordering.length); }
  else throw new TypeError('Unsupported TL-02 stiffness representation.');
  return freezeHash({
    schema:PREPRODUCTION_TL_STIFFNESS_SCHEMA,entryId:text(input.entryId,'entryId'),supportSiteId:site,representation,data,units:input.units,ordering,
    source,benchmarkReference:benchmark(input.benchmarkReference),applicability,qualification:blockers.length?'UNRESOLVED':'QUALIFIED',blockers:uniqueIssues(blockers),
    tl03LocalStiffnessEligible:blockers.length===0&&representation===LOCAL,
    policy:{ genericRestraintStiffnessPromotable:false,matrixEvidenceAutomaticallyReducedToLocalStiffness:false,stiffnessCalculatedByThisContract:false,localScreenExecutionPermitted:false },
  });
}

export function requirePreproductionThermalLiftoffStiffnessEvidence(value){
  if(value?.schema!==PREPRODUCTION_TL_STIFFNESS_SCHEMA) throw coded('PREPRODUCTION_TL02_STIFFNESS_SCHEMA_INVALID');
  const normalized=createPreproductionThermalLiftoffStiffnessEvidence({entryId:value.entryId,supportSiteId:value.supportSiteId,representation:value.representation,data:value.data,units:value.units,ordering:value.ordering,source:value.source,benchmarkReference:value.benchmarkReference,applicability:value.applicability,qualification:value.qualification});
  if(normalized.semanticHash!==value.semanticHash) throw coded('PREPRODUCTION_TL02_STIFFNESS_HASH_MISMATCH'); return normalized;
}

export function createPreproductionThermalLiftoffReactionToleranceAuthority(input){
  exact(input,['toleranceId','reactionToleranceN','source','benchmarkReference','qualification'],'reaction tolerance input');
  const source=sourceIdentity(input.source,'reaction tolerance source'), blockers=[];
  if(input.qualification!=='QUALIFIED'||!TOLERANCE_SOURCES.has(source.sourceKind)) blockers.push(issue('PREPRODUCTION_TL_REACTION_TOLERANCE_SOURCE_UNQUALIFIED','reactionTolerance'));
  return freezeHash({schema:PREPRODUCTION_TL_REACTION_TOLERANCE_SCHEMA,toleranceId:text(input.toleranceId,'toleranceId'),reactionToleranceN:nonnegative(input.reactionToleranceN,'reactionToleranceN'),source,benchmarkReference:benchmark(input.benchmarkReference),qualification:blockers.length?'UNRESOLVED':'QUALIFIED',blockers:uniqueIssues(blockers),policy:{solverInternalToleranceAutomaticallyPromotable:false,defaultTolerancePermitted:false,localScreenExecutionPermitted:false}});
}
export function requirePreproductionThermalLiftoffReactionToleranceAuthority(value){ if(value?.schema!==PREPRODUCTION_TL_REACTION_TOLERANCE_SCHEMA) throw coded('PREPRODUCTION_TL_REACTION_TOLERANCE_SCHEMA_INVALID'); const n=createPreproductionThermalLiftoffReactionToleranceAuthority({toleranceId:value.toleranceId,reactionToleranceN:value.reactionToleranceN,source:value.source,benchmarkReference:value.benchmarkReference,qualification:value.qualification}); if(n.semanticHash!==value.semanticHash) throw coded('PREPRODUCTION_TL_REACTION_TOLERANCE_HASH_MISMATCH'); return n; }


function sourceIdentity(v,label){ exact(v,['sourceId','sourceRevision','sourceSemanticHash','sourceKind'],label); return deepFreeze({sourceId:text(v.sourceId,'sourceId'),sourceRevision:text(v.sourceRevision,'sourceRevision'),sourceSemanticHash:hash(v.sourceSemanticHash,'sourceSemanticHash'),sourceKind:text(v.sourceKind,'sourceKind')}); }
function benchmark(v){ exact(v,['benchmarkId','benchmarkRevision','benchmarkSemanticHash'],'benchmark'); return deepFreeze({benchmarkId:text(v.benchmarkId,'benchmarkId'),benchmarkRevision:text(v.benchmarkRevision,'benchmarkRevision'),benchmarkSemanticHash:hash(v.benchmarkSemanticHash,'benchmarkSemanticHash')}); }
function matrix(v,n){ exact(v,['kind','values'],'matrix'); if(v.kind!=='MATRIX'||!Array.isArray(v.values)||v.values.length!==n||v.values.some(r=>!Array.isArray(r)||r.length!==n)) throw new TypeError('Matrix evidence must be square and match ordering.'); return deepFreeze({kind:'MATRIX',values:v.values.map((r,i)=>r.map((x,j)=>finite(x,`matrix[${i}][${j}]`)))}); }
function order(v){ if(!Array.isArray(v)||!v.length) throw new TypeError('ordering must be non-empty.'); const a=v.map(siteId); if(new Set(a).size!==a.length) throw new TypeError('ordering must be unique.'); return deepFreeze(a); }
function siteId(v){ const s=text(v,'supportSiteId'); if(GENERIC_SITES.has(s.toUpperCase())) throw coded('PREPRODUCTION_TL02_GENERIC_SITE_PROHIBITED'); return s; }
function freezeHash(m){return deepFreeze({...m,semanticHash:semanticHash(m)});} function issue(code,scope){return deepFreeze({code,severity:'ERROR',scope,message:code,details:null});}
function uniqueIssues(v){const m=new Map(); for(const x of v)m.set(`${x.code}|${x.scope}`,x); return [...m.values()].sort((a,b)=>ascii(`${a.code}|${a.scope}`,`${b.code}|${b.scope}`));}
function exact(v,keys,label){if(!isPlainRecord(v)||JSON.stringify(Object.keys(v).sort())!==JSON.stringify([...keys].sort()))throw new TypeError(`${label} contains unexpected or missing keys.`);} function text(v,l){const s=stringValue(v);if(!s)throw new TypeError(`${l} must be non-empty.`);return s;} function hash(v,l){if(typeof v!=='string'||!/^fnv1a64:[0-9a-f]{16}$/u.test(v))throw new TypeError(`${l} must be an FNV hash.`);return v;} function finite(v,l){if(!Number.isFinite(v))throw new TypeError(`${l} must be finite.`);return v;} function positive(v,l){v=finite(v,l);if(v<=0)throw new TypeError(`${l} must be positive.`);return v;} function nonnegative(v,l){v=finite(v,l);if(v<0)throw new TypeError(`${l} must be non-negative.`);return v;} function ascii(a,b){return String(a).localeCompare(String(b),'en',{numeric:false,sensitivity:'variant'});} function coded(code){const e=new Error(code);e.code=code;return e;}
