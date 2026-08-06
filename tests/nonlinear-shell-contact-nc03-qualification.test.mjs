import test from 'node:test';import assert from 'node:assert/strict';
import { DEFAULT_ELASTIC_DENTING_PROCEDURE,REQUIRED_ELASTIC_DENTING_BENCHMARKS } from '../src/core/nonlinear-shell-contact/elastic-denting-procedure-contract.js';
import { evaluateElasticDentingQualification } from '../src/core/nonlinear-shell-contact/elastic-denting-qualification-evaluator.js';
import { FIXTURE_HEAD,createQualifiedDentEvidenceSet,createQualifiedNc02BindingFixture } from '../src/core/nonlinear-shell-contact/nc03-fixtures.js';
import { runNc03NegativeControls } from '../src/core/nonlinear-shell-contact/nc03-negative-controls.js';
test('NC03 contract retains eight domains and authority ceiling',()=>{assert.equal(REQUIRED_ELASTIC_DENTING_BENCHMARKS.length,8);assert.equal(DEFAULT_ELASTIC_DENTING_PROCEDURE.plasticityAuthorized,false);assert.equal(DEFAULT_ELASTIC_DENTING_PROCEDURE.productionExecutionAuthorized,false);});
test('NC03 evaluator derives qualification',()=>{const r=evaluateElasticDentingQualification({contract:DEFAULT_ELASTIC_DENTING_PROCEDURE,upstreamBinding:createQualifiedNc02BindingFixture(),candidateExactHeadSha:FIXTURE_HEAD,benchmarkEvidence:createQualifiedDentEvidenceSet()});assert.equal(r.status,'NC03_QUALIFIED');assert.equal(r.authority.elasticDentingProcedureQualified,true);assert.equal(r.authority.nc04Authorized,true);assert.equal(r.authority.productionExecutionAuthorized,false);});
test('NC03 negative controls fail closed',()=>{const c=runNc03NegativeControls();assert.ok(c.length>=12);assert.ok(c.every(x=>x.passed),JSON.stringify(c.filter(x=>!x.passed),null,2));});
