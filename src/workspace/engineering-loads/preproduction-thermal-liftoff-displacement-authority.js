import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { deepFreeze, isPlainRecord, stringValue } from '../../core/shared-piping-model/immutable.js';

export const PREPRODUCTION_TL_DISPLACEMENT_AUTHORITY_SCHEMA = 'engineering-preproduction-thermal-liftoff-displacement-authority/v1';
const GENERIC_SITES = new Set(['*', 'DEFAULT', 'GLOBAL', 'ALL', 'TYPICAL']);
const Z = deepFreeze({ x: 0, y: 0, z: 1 });
export function createPreproductionThermalLiftoffDisplacementAuthority(input) {
  exact(input, ['displacementId','loadCaseId','supportSiteId','coordinateFrame','pipeDisplacementM','supportDisplacementM','provenance','source','mappingAuthority','horizontalComponentAuthority'], 'TL-01 displacement input');
  const site = siteId(input.supportSiteId);
  const frame = coordinateFrame(input.coordinateFrame);
  const pipe = vector(input.pipeDisplacementM, 'pipeDisplacementM');
  const support = vector(input.supportDisplacementM, 'supportDisplacementM');
  const relative = deepFreeze({ x: pipe.x-support.x, y: pipe.y-support.y, z: pipe.z-support.z });
  const horizontal = Math.hypot(relative.x, relative.y);
  const source = sourceIdentity(input.source, 'displacement source');
  const blockers = [];
  let mappingAuthority = null;
  let horizontalComponentAuthority = null;
  if (frame.basis !== 'GLOBAL_XYZ_Z_UP' || !same(frame.verticalUnitVector, Z)) blockers.push(issue('PREPRODUCTION_TL01_COORDINATE_FRAME_UNQUALIFIED', site));
  if (input.provenance === 'SOURCE_BACKED_SUPPORT_DISPLACEMENT') {
    if (!['GOVERNED_IMPORT','APPROVED_ENGINEERING_DATA'].includes(source.sourceKind)) blockers.push(issue('PREPRODUCTION_TL01_SOURCE_KIND_UNQUALIFIED', site));
    if (input.mappingAuthority !== null) blockers.push(issue('PREPRODUCTION_TL01_MAPPING_CONFLICT', site));
  } else if (input.provenance === 'QUALIFIED_FREE_EXPANSION_TO_SUPPORT_MAPPING') {
    mappingAuthority = mapping(input.mappingAuthority);
    if (!mappingAuthority || mappingAuthority.qualification !== 'QUALIFIED') blockers.push(issue('PREPRODUCTION_TL01_MAPPING_AUTHORITY_MISSING', site));
  } else blockers.push(issue('PREPRODUCTION_TL01_PROVENANCE_UNQUALIFIED', site));
  if (horizontal > 0) {
    horizontalComponentAuthority = horizontalAuthority(input.horizontalComponentAuthority);
    if (!horizontalComponentAuthority || horizontalComponentAuthority.status !== 'QUALIFIED_WITHIN_LIMIT') blockers.push(issue('PREPRODUCTION_TL01_HORIZONTAL_COMPONENT_UNQUALIFIED', site));
  } else if (input.horizontalComponentAuthority) horizontalComponentAuthority = horizontalAuthority(input.horizontalComponentAuthority);
  const material = {
    schema: PREPRODUCTION_TL_DISPLACEMENT_AUTHORITY_SCHEMA,
    displacementId: text(input.displacementId,'displacementId'), loadCaseId: text(input.loadCaseId,'loadCaseId'), supportSiteId: site,
    coordinateFrame: frame, pipeDisplacementM: pipe, supportDisplacementM: support, relativeDisplacementM: relative,
    usedUpwardRelativeDisplacementM: blockers.length ? null : relative.z, horizontalRelativeMagnitudeM: horizontal,
    provenance: text(input.provenance,'provenance'), source, mappingAuthority, horizontalComponentAuthority,
    qualification: blockers.length ? 'UNRESOLVED' : 'QUALIFIED', blockers: uniqueIssues(blockers),
    policy: { freeExpansionAlonePromotable:false, displacementCalculatedByThisContract:false, localScreenExecutionPermitted:false, productionConsumptionEnabled:false },
  };
  return freezeHash(material);
}

export function requirePreproductionThermalLiftoffDisplacementAuthority(value) {
  if (value?.schema !== PREPRODUCTION_TL_DISPLACEMENT_AUTHORITY_SCHEMA) throw coded('PREPRODUCTION_TL01_SCHEMA_INVALID');
  const normalized = createPreproductionThermalLiftoffDisplacementAuthority({
    displacementId:value.displacementId, loadCaseId:value.loadCaseId, supportSiteId:value.supportSiteId, coordinateFrame:value.coordinateFrame,
    pipeDisplacementM:value.pipeDisplacementM, supportDisplacementM:value.supportDisplacementM, provenance:value.provenance, source:value.source,
    mappingAuthority:value.mappingAuthority, horizontalComponentAuthority:value.horizontalComponentAuthority,
  });
  if (normalized.semanticHash !== value.semanticHash) throw coded('PREPRODUCTION_TL01_HASH_MISMATCH');
  return normalized;
}


function coordinateFrame(v){ exact(v,['basis','verticalUnitVector','semanticHash'],'coordinate frame'); const m={basis:text(v.basis,'basis'),verticalUnitVector:vector(v.verticalUnitVector,'verticalUnitVector')}; if(v.semanticHash!==semanticHash(m)) throw coded('PREPRODUCTION_TL_COORDINATE_FRAME_HASH_MISMATCH'); return deepFreeze({...m,semanticHash:v.semanticHash}); }
function mapping(v){ if(!v)return null; exact(v,['mappingId','mappingRevision','freeExpansionEvidenceSemanticHash','applicabilitySemanticHash','source','qualification','semanticHash'],'mapping authority'); const m={mappingId:text(v.mappingId,'mappingId'),mappingRevision:text(v.mappingRevision,'mappingRevision'),freeExpansionEvidenceSemanticHash:hash(v.freeExpansionEvidenceSemanticHash,'freeExpansionEvidenceSemanticHash'),applicabilitySemanticHash:hash(v.applicabilitySemanticHash,'applicabilitySemanticHash'),source:sourceIdentity(v.source,'mapping source'),qualification:v.qualification}; if(v.semanticHash!==semanticHash(m)) throw coded('PREPRODUCTION_TL01_MAPPING_HASH_MISMATCH'); return deepFreeze({...m,semanticHash:v.semanticHash}); }
function horizontalAuthority(v){ if(!v)return null; exact(v,['assessmentId','status','authoritySemanticHash'],'horizontal authority'); return deepFreeze({assessmentId:text(v.assessmentId,'assessmentId'),status:v.status,authoritySemanticHash:hash(v.authoritySemanticHash,'authoritySemanticHash')}); }
function sourceIdentity(v,label){ exact(v,['sourceId','sourceRevision','sourceSemanticHash','sourceKind'],label); return deepFreeze({sourceId:text(v.sourceId,'sourceId'),sourceRevision:text(v.sourceRevision,'sourceRevision'),sourceSemanticHash:hash(v.sourceSemanticHash,'sourceSemanticHash'),sourceKind:text(v.sourceKind,'sourceKind')}); }
function vector(v,label){ exact(v,['x','y','z'],label); return deepFreeze({x:finite(v.x,`${label}.x`),y:finite(v.y,`${label}.y`),z:finite(v.z,`${label}.z`)}); }
function siteId(v){ const s=text(v,'supportSiteId'); if(GENERIC_SITES.has(s.toUpperCase())) throw coded('PREPRODUCTION_TL02_GENERIC_SITE_PROHIBITED'); return s; }
function same(a,b){return a.x===b.x&&a.y===b.y&&a.z===b.z;} function freezeHash(m){return deepFreeze({...m,semanticHash:semanticHash(m)});} function issue(code,scope){return deepFreeze({code,severity:'ERROR',scope,message:code,details:null});}
function uniqueIssues(v){const m=new Map(); for(const x of v)m.set(`${x.code}|${x.scope}`,x); return [...m.values()].sort((a,b)=>ascii(`${a.code}|${a.scope}`,`${b.code}|${b.scope}`));}
function exact(v,keys,label){if(!isPlainRecord(v)||JSON.stringify(Object.keys(v).sort())!==JSON.stringify([...keys].sort()))throw new TypeError(`${label} contains unexpected or missing keys.`);} function text(v,l){const s=stringValue(v);if(!s)throw new TypeError(`${l} must be non-empty.`);return s;} function hash(v,l){if(typeof v!=='string'||!/^fnv1a64:[0-9a-f]{16}$/u.test(v))throw new TypeError(`${l} must be an FNV hash.`);return v;} function finite(v,l){if(!Number.isFinite(v))throw new TypeError(`${l} must be finite.`);return v;} function ascii(a,b){return String(a).localeCompare(String(b),'en',{numeric:false,sensitivity:'variant'});} function coded(code){const e=new Error(code);e.code=code;return e;}
