import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  APPLICATION_NAVIGATION_ORDER_V10, CONSUMER_IDS,
  createApplicationViewStateV10, createWorkspaceConsumerContext,
  createWorkspaceConsumerReadinessRegistry, createWorkspaceConsumerRegistryV10,
  transitionApplicationViewStateV10, validateApplicationViewStateV10,
} from '../src/core/workspace-consumers/index.js';

const registry=createWorkspaceConsumerRegistryV10();
const context=createWorkspaceConsumerContext({datasetId:null,workspaceVersion:0,selectedEntityId:null,contracts:{}});
const readiness=createWorkspaceConsumerReadinessRegistry(registry,context,{workspaceBooted:true,settingsAuthorityInitialized:true,settingsDefinitionsAvailable:true,settingsProfileValid:true});
const state=createApplicationViewStateV10(readiness);
assert(validateApplicationViewStateV10(state).ok);
assert.equal(state.activeViewId,CONSUMER_IDS.HOME);
assert(state.availableViewIds.includes(CONSUMER_IDS.LOCAL_FEA));
assert(state.availableViewIds.includes(CONSUMER_IDS.QA));
assert.deepEqual(APPLICATION_NAVIGATION_ORDER_V10,['HOME','WORKSPACE','LOAD_CALC','PCF','SKETCHER','THREE_D_CALC','PIPE_SOLVER','LOCAL_FEA','REPORTS','QA','SETTINGS','DEBUG']);
const activated=transitionApplicationViewStateV10(state,CONSUMER_IDS.LOCAL_FEA,readiness);
assert.equal(activated.activated,true);
assert.equal(activated.state.activeViewId,CONSUMER_IDS.LOCAL_FEA);
assert.throws(()=>transitionApplicationViewStateV10(state,'UNKNOWN',readiness),/Unknown application view/);
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
assert.equal(pkg.scripts['check:lfea.007:static'],'node scripts/lfea-007-check.mjs');
assert.equal(pkg.scripts['check:lfea.007:browser'],'playwright test e2e/lfea-007-local-fea-consumer.spec.js');
assert(pkg.scripts['check:workspace-browser'].includes('e2e/lfea-007-local-fea-consumer.spec.js'));
assert(pkg.scripts['check:w10.12']);
for(const retired of ['check:w10.r3','check:w10.r4','check:u0','ci:u0'])assert.equal(pkg.scripts[retired],undefined,`Retired gate remains registered: ${retired}`);
for(const retired of ['.github/workflows/w10-r2-certification.yml','.github/workflows/w10-r3-certification.yml','.github/workflows/w10-r4-certification.yml','.github/workflows/u0-certification.yml','scripts/w10.r3-registration-check.mjs','scripts/w10.r4-registration-check.mjs'])assert.equal(fs.existsSync(retired),false,`Retired gate file remains: ${retired}`);
assert(!pkg.scripts['check:workspace-browser'].includes('w10.r3-settings-authority.spec.js'));
assert(!pkg.scripts['check:workspace-browser'].includes('w10.r4-sketcher-recovery.spec.js'));
const qa=fs.readFileSync('scripts/qa-check.mjs','utf8');
assert.equal((qa.match(/LFEA-007 Read-Only Local FEA Consumer Static Check/g)||[]).length,1);
const layout=fs.readFileSync('src/workspace/workspace-layout.js','utf8');
assert.equal((layout.match(/data-application-view="LOCAL_FEA"/g)||[]).length,1);
assert.equal((layout.match(/data-webgl-host/g)||[]).length,1);
assert(!/data-application-view="LOCAL_FEA"[^]*?<canvas/i.test(layout));
console.log('LFEA-007 registration qualification passed with retired W10.R2-R4 and Phase U0 gates absent.');
