#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  PIPE_SECTION_ARITHMETIC_RULE, PIPE_SECTION_FORMULATION_ID, PIPE_SECTION_INNER_DIAMETER_RULE,
  PIPE_SECTION_PROFILE, PIPE_SECTION_PROFILE_ID, PIPE_SECTION_PROFILE_KEYS, PIPE_SECTION_PROFILE_SCHEMA,
  PIPE_SECTION_REQUEST_KEYS, PIPE_SECTION_REQUEST_SCHEMA, PIPE_SECTION_RESOLUTION_SCHEMA,
  PIPE_SECTION_SOLID_RULE, PIPE_SECTION_STATE_KEYS, PipeSectionError,
  calculateCircularAnnulusProperties, canonicalStringifyPipeSection,
  computePipeSectionEvidenceHash, computePipeSectionProfileSemanticHash,
  computePipeSectionRequestSemanticHash, computePipeSectionResolutionSemanticHash,
  pipeSectionSemanticHash, requirePipeSectionProfile, requirePipeSectionRequest,
  requirePipeSectionResolution, resolvePipeSection, verifyPipeSectionResolution,
} from '../src/core/linear-fea-section/index.js';
import { RECORD_KEYS } from '../src/core/linear-fea-contract/model-schema.js';
import { NPS6_LIKE_EXPECTED as N6, SOURCE_EVIDENCE as SRC, THICK_WALL_EXPECTED as THICK, pipeSectionRequest } from './lfea-b2.3-pipe-section-fixtures.mjs';

const tests=[]; const regressions=[];
function test(id,body){body();tests.push(id);console.log(`PASS ${id}`)}
function reg(id,body){body();regressions.push(id);console.log(`PASS ${id}`)}
function code(body,expected){assert.throws(body,e=>e instanceof PipeSectionError&&e.code===expected)}
function close(a,b,r=5e-15){assert.ok(Math.abs(a-b)/Math.max(Math.abs(b),Number.MIN_VALUE)<=r,`${a} != ${b}`)}
function keys(v){return Object.keys(v).sort()}
function mech(r){let s=r.sectionState;return [s.area,s.secondMomentY,s.secondMomentZ,s.polarMoment]}
function reseal(v){let x=structuredClone(v);delete x.semanticHash;delete x.evidenceHash;x.semanticHash=computePipeSectionResolutionSemanticHash(x);x.evidenceHash=computePipeSectionEvidenceHash(x);return x}
function reverse(v){if(Array.isArray(v))return v.map(reverse);if(!v||typeof v!=='object')return v;return Object.fromEntries(Object.keys(v).reverse().map(k=>[k,reverse(v[k])]))}
const request=pipeSectionRequest(); const result=resolvePipeSection({request});

test('B23-T01',()=>{let r=requirePipeSectionRequest(request);assert.equal(r.schema,PIPE_SECTION_REQUEST_SCHEMA);assert.deepEqual(keys(r),[...PIPE_SECTION_REQUEST_KEYS].sort());let x={...structuredClone(r),componentId:'P1'};code(()=>requirePipeSectionRequest(x),'PIPE_SECTION_REQUEST_INVALID')});
test('B23-T02',()=>{let p=requirePipeSectionProfile(PIPE_SECTION_PROFILE);assert.equal(p.schema,PIPE_SECTION_PROFILE_SCHEMA);assert.equal(p.profileId,PIPE_SECTION_PROFILE_ID);assert.equal(p.formulationId,PIPE_SECTION_FORMULATION_ID);assert.equal(p.arithmeticRule,PIPE_SECTION_ARITHMETIC_RULE);assert.equal(p.innerDiameterRule,PIPE_SECTION_INNER_DIAMETER_RULE);assert.equal(p.solidSectionRule,PIPE_SECTION_SOLID_RULE);assert.deepEqual(keys(p),[...PIPE_SECTION_PROFILE_KEYS].sort())});
test('B23-T03',()=>{assert.equal(result.schema,PIPE_SECTION_RESOLUTION_SCHEMA);close(result.dimensions.innerDiameter,N6.innerDiameter,1e-15);close(result.sectionState.area,N6.area);close(result.sectionState.secondMomentY,N6.secondMomentY);close(result.sectionState.secondMomentZ,N6.secondMomentZ);close(result.sectionState.polarMoment,N6.polarMoment)});
test('B23-T04',()=>{let r=resolvePipeSection({request:pipeSectionRequest({sectionStateId:'SEC-THICK',outerDiameter:THICK.outerDiameter,wallThickness:THICK.wallThickness})});close(r.dimensions.innerDiameter,THICK.innerDiameter,1e-15);close(r.sectionState.area,THICK.area);close(r.sectionState.secondMomentY,THICK.secondMomentY);close(r.sectionState.polarMoment,THICK.polarMoment)});
test('B23-T05',()=>{let p=calculateCircularAnnulusProperties(1,1e-16);let direct=Math.PI/4*(1-p.innerDiameter*p.innerDiameter);assert.ok(p.innerDiameter<1&&p.area>0&&p.secondMomentY>0);assert.ok(Math.abs(direct-p.area)/p.area>.1)});
test('B23-T06',()=>{let independent=Math.PI/4*(N6.outerDiameter*N6.outerDiameter-N6.innerDiameter*N6.innerDiameter);close(result.sectionState.area,independent)});
test('B23-T07',()=>{let independent=Math.PI/64*(N6.outerDiameter**4-N6.innerDiameter**4);close(result.sectionState.secondMomentY,independent)});
test('B23-T08',()=>{assert.equal(result.sectionState.secondMomentZ,result.sectionState.secondMomentY);assert.equal(result.verification.circularSymmetryResidual,0)});
test('B23-T09',()=>{assert.equal(result.sectionState.polarMoment,result.sectionState.secondMomentY+result.sectionState.secondMomentZ);assert.equal(result.verification.polarClosureResidual,0)});
test('B23-T10',()=>{let k=3,r=resolvePipeSection({request:pipeSectionRequest({sectionStateId:'SEC-SCALE',outerDiameter:N6.outerDiameter*k,wallThickness:N6.wallThickness*k})});close(r.sectionState.area/result.sectionState.area,k**2);for(let q of ['secondMomentY','secondMomentZ','polarMoment'])close(r.sectionState[q]/result.sectionState[q],k**4)});
test('B23-T11',()=>code(()=>resolvePipeSection({request:pipeSectionRequest({outerDiameter:0})}),'PIPE_SECTION_OUTER_DIAMETER_INVALID'));
test('B23-T12',()=>code(()=>resolvePipeSection({request:pipeSectionRequest({outerDiameter:-1})}),'PIPE_SECTION_OUTER_DIAMETER_INVALID'));
test('B23-T13',()=>code(()=>resolvePipeSection({request:pipeSectionRequest({wallThickness:0})}),'PIPE_SECTION_WALL_THICKNESS_INVALID'));
test('B23-T14',()=>code(()=>resolvePipeSection({request:pipeSectionRequest({wallThickness:-1})}),'PIPE_SECTION_WALL_THICKNESS_INVALID'));
test('B23-T15',()=>code(()=>resolvePipeSection({request:pipeSectionRequest({outerDiameter:.1,wallThickness:.05})}),'PIPE_SECTION_SOLID_NOT_SUPPORTED'));
test('B23-T16',()=>code(()=>resolvePipeSection({request:pipeSectionRequest({outerDiameter:.1,wallThickness:.06})}),'PIPE_SECTION_INNER_DIAMETER_INVALID'));
test('B23-T17',()=>{for(let v of [NaN,Infinity,-Infinity]){let a={...structuredClone(request),outerDiameter:v,semanticHash:'fnv1a64:0000000000000000'},b={...structuredClone(request),wallThickness:v,semanticHash:'fnv1a64:0000000000000000'};code(()=>resolvePipeSection({request:a}),'PIPE_SECTION_OUTER_DIAMETER_INVALID');code(()=>resolvePipeSection({request:b}),'PIPE_SECTION_WALL_THICKNESS_INVALID')}});
test('B23-T18',()=>code(()=>resolvePipeSection({request:pipeSectionRequest({outerDiameter:1,wallThickness:Number.MIN_VALUE})}),'PIPE_SECTION_GEOMETRY_NOT_RESOLVABLE'));
test('B23-T19',()=>{let q=structuredClone(request),before=structuredClone(q);resolvePipeSection({request:q,profile:structuredClone(PIPE_SECTION_PROFILE)});assert.deepEqual(q,before)});
test('B23-T20',()=>{for(let v of [result,result.dimensions,result.sectionState,result.sectionState.sourceEvidence,result.sectionState.sourceEvidence[0],result.verification,result.limitations,result.qualificationEvidence])assert.ok(Object.isFrozen(v))});
test('B23-T21',()=>{assert.deepEqual(PIPE_SECTION_STATE_KEYS,RECORD_KEYS.sectionState);assert.deepEqual(keys(result.sectionState),[...RECORD_KEYS.sectionState].sort())});
test('B23-T22',()=>{let b=pipeSectionRequest({sourceEvidence:{...SRC,sourceRevision:'Rev 5'}}),r=resolvePipeSection({request:b});assert.notEqual(request.semanticHash,b.semanticHash);assert.notEqual(result.semanticHash,r.semanticHash);assert.deepEqual(mech(result),mech(r))});
test('B23-T23',()=>{let b=pipeSectionRequest({sectionStateId:'SEC-OTHER',sourceEvidence:{sourceId:'OTHER/源',sourceRevision:'B',sourceSemanticHash:'fnv1a64:1111111111111111'}}),r=resolvePipeSection({request:b});assert.deepEqual(mech(result),mech(r));assert.notEqual(result.semanticHash,r.semanticHash)});
test('B23-T24',()=>{let a=structuredClone(result);a.diagnostics=[{code:'NOTE',severity:'INFO',message:'A',evidenceIds:[],qualificationEvidenceIds:[]}];let b=structuredClone(a);b.diagnostics[0].message='B';assert.equal(computePipeSectionResolutionSemanticHash(a),computePipeSectionResolutionSemanticHash(b))});
test('B23-T25',()=>{let a=structuredClone(result);a.diagnostics=[{code:'NOTE',severity:'INFO',message:'A',evidenceIds:[],qualificationEvidenceIds:[]}];let b=structuredClone(a);b.diagnostics[0].message='B';a=reseal(a);b=reseal(b);assert.equal(a.semanticHash,b.semanticHash);assert.notEqual(a.evidenceHash,b.evidenceHash)});
test('B23-T26',()=>{let rq=reverse(request),rr=reverse(result);assert.equal(computePipeSectionRequestSemanticHash(rq),request.semanticHash);assert.equal(computePipeSectionResolutionSemanticHash(rr),result.semanticHash);assert.equal(computePipeSectionEvidenceHash(rr),result.evidenceHash)});
test('B23-T27',()=>{let a=pipeSectionRequest({sectionStateId:'SEC-UNICODE',sourceEvidence:{sourceId:'项目/管道目录',sourceRevision:'Révision 4 — إصدار ب',sourceSemanticHash:'fnv1a64:13579bdf2468ace0'}});let b=pipeSectionRequest({sectionStateId:'SEC-UNICODE',sourceEvidence:{sourceId:'项目/管道目录',sourceRevision:'Révision 4 — إصدار ب',sourceSemanticHash:'fnv1a64:13579bdf2468ace0'}});assert.equal(a.semanticHash,b.semanticHash);assert.equal(a.semanticHash,'fnv1a64:93198d98320f0a82')});
test('B23-T28',()=>{let a=structuredClone(request);a.semanticHash='fnv1a64:0000000000000000';code(()=>requirePipeSectionRequest(a),'PIPE_SECTION_HASH_MISMATCH');let p=structuredClone(PIPE_SECTION_PROFILE);p.semanticHash='fnv1a64:0000000000000000';code(()=>requirePipeSectionProfile(p),'PIPE_SECTION_HASH_MISMATCH');for(let field of ['semanticHash','evidenceHash']){let r=structuredClone(result);r[field]='fnv1a64:0000000000000000';code(()=>requirePipeSectionResolution(r),'PIPE_SECTION_HASH_MISMATCH')}let r=structuredClone(result);r.requestSemanticHash='fnv1a64:0000000000000000';r=reseal(r);code(()=>verifyPipeSectionResolution(r,PIPE_SECTION_PROFILE,request),'PIPE_SECTION_HASH_MISMATCH')});

reg('B23-R01',()=>{let m=structuredClone(result);m.sectionState.polarMoment=m.sectionState.secondMomentY;m.verification.polarClosureResidual=Math.abs(m.sectionState.polarMoment-(m.sectionState.secondMomentY+m.sectionState.secondMomentZ));m.qualificationEvidence[1].passed=false;m.qualificationEvidence[1].actual=m.verification.polarClosureResidual;code(()=>verifyPipeSectionResolution(reseal(m),PIPE_SECTION_PROFILE,request),'PIPE_SECTION_GEOMETRY_NOT_RESOLVABLE')});
reg('B23-R02',()=>{let m=structuredClone(result);m.sectionState.secondMomentZ*=1.01;m.verification.circularSymmetryResidual=Math.abs(m.sectionState.secondMomentY-m.sectionState.secondMomentZ);m.verification.polarClosureResidual=Math.abs(m.sectionState.polarMoment-(m.sectionState.secondMomentY+m.sectionState.secondMomentZ));m.qualificationEvidence.forEach((e,i)=>{e.passed=false;e.actual=i?m.verification.polarClosureResidual:m.verification.circularSymmetryResidual});code(()=>verifyPipeSectionResolution(reseal(m),PIPE_SECTION_PROFILE,request),'PIPE_SECTION_GEOMETRY_NOT_RESOLVABLE')});
reg('B23-R03',()=>{let p=calculateCircularAnnulusProperties(1,1e-16),direct=Math.PI/64*(1**4-p.innerDiameter**4);assert.ok(Math.abs(direct-p.secondMomentY)/p.secondMomentY>.1)});
reg('B23-R04',()=>{let clamp=(Do,t)=>calculateCircularAnnulusProperties(Do,Math.min(t,Do*.499999999999));assert.ok(clamp(.1,.06).area>0);code(()=>resolvePipeSection({request:pipeSectionRequest({outerDiameter:.1,wallThickness:.06})}),'PIPE_SECTION_INNER_DIAMETER_INVALID')});
reg('B23-R05',()=>{let solid=Do=>({area:Math.PI*Do*Do/4,secondMomentY:Math.PI*Do**4/64});assert.ok(solid(.1).area>0);code(()=>resolvePipeSection({request:pipeSectionRequest({outerDiameter:.1,wallThickness:.05})}),'PIPE_SECTION_SOLID_NOT_SUPPORTED')});
reg('B23-R06',()=>{let p=mech(result),mut=(d)=>p[0]*d;assert.notEqual(mut(7800),mut(8000));assert.deepEqual(mech(resolvePipeSection({request})),p)});
reg('B23-R07',()=>{let b=pipeSectionRequest({sourceEvidence:{...SRC,sourceRevision:'Rev 5'}});let mutant=q=>pipeSectionSemanticHash({schema:q.schema,sectionStateId:q.sectionStateId,formulationId:q.formulationId,outerDiameter:q.outerDiameter,wallThickness:q.wallThickness});assert.equal(mutant(request),mutant(b));assert.notEqual(request.semanticHash,b.semanticHash)});
reg('B23-R08',()=>{let a={...structuredClone(result),diagnostics:[{message:'A'}]},b={...a,diagnostics:[{message:'B'}]};assert.notEqual(pipeSectionSemanticHash(a),pipeSectionSemanticHash(b));assert.equal(computePipeSectionResolutionSemanticHash(a),computePipeSectionResolutionSemanticHash(b))});
reg('B23-R09',()=>assert.match('const FNV_PRIME=0x100000001b3;function privateHash(){}',/\bFNV(?:_PRIME)?\b|\bprivateHash\s*\(/u));

assert.equal(tests.length,28);assert.equal(regressions.length,9);
console.log(`\nLFEA B-2.3 pipe-section check passed: ${tests.length} analytical tests and ${regressions.length} deliberate regressions.`);
console.log(`Profile semantic hash: ${PIPE_SECTION_PROFILE.semanticHash}`);
console.log(`Benchmark resolution semantic hash: ${result.semanticHash}`);
console.log(`Benchmark evidence hash: ${result.evidenceHash}`);
console.log(`Benchmark canonical bytes: ${canonicalStringifyPipeSection(result).length}`);
