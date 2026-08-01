import fs from 'node:fs';
import { expect, test } from '@playwright/test';

// Historical closed compatibility remains covered for application-view-state/v3.
const STAGED_PACKAGE={schema:'inputxml-managed-stage/v1',packageHash:'W10.10-BROWSER',unit:'mm',objects:[
  {id:'PIPES',name:'Pipes',type:'BRANCH',children:[pipe('PIPE-A',[0,0,0],[1000,0,0]),pipe('PIPE-B',[1000,0,0],[2000,0,0])]},
  {id:'SUPPORTS',name:'Supports',type:'GROUP',children:[support('SUP-START',[0,0,0],'PIPE-A:port:start'),support('SUP-END',[2000,0,0],'PIPE-B:port:end')]},
]};
const NAVIGATION=['Home','Workspace','Edit, Topo fix and Load Calc','PCF','Sketcher','3D Calc','Pipe Solver','Local FEA','Reports','QA','Settings','Debug'];
const REQUEST_TOPICS=['sharedModel:exportRequested','topology:rebuildExactRequested','topology:exportRequested','supportRestraint:rebuildEvidenceRequested','supportRestraint:exportRequested','verticalBeam:rebuildRequested','verticalBeam:solveRequested','verticalBeam:exportRequested','applicationView:changeRequested'];

test.beforeEach(async({page})=>{await page.addInitScript(()=>{
  globalThis.__WORKSPACE_VIEWPORT_BACKEND__='canvas2d';globalThis.__w1010UrlAudit={created:0,revoked:0};
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=(blob)=>{globalThis.__w1010UrlAudit.created+=1;return create(blob);};
  URL.revokeObjectURL=(url)=>{globalThis.__w1010UrlAudit.revoked+=1;return revoke(url);};
});});

test('adopts exact model/topology/support evidence and delegates guarded actions',async({page})=>{
  await page.goto('/');await installEventAudit(page);
  const nav=applicationNavigation(page);
  await expect(nav.getByRole('button')).toHaveText(NAVIGATION);
  const home=navButton(nav,'Home'),workspace=navButton(nav,'Workspace'),threeD=navButton(nav,'3D Calc');
  await expect(home).toHaveAttribute('aria-current','page');
  await home.focus();await page.keyboard.press('ArrowRight');await expect(workspace).toBeFocused();
  await workspace.click();
  await expect(threeD).toHaveAttribute('aria-disabled','true');
  await expect(page.locator('[data-role="three-d-calc-consumer-root"]')).toBeEmpty();
  expect(await threeD.evaluate((element)=>element.disabled)).toBe(false);
  const reasonId=await threeD.getAttribute('aria-describedby');
  await expect(page.locator(`#${reasonId}`)).toContainText('Required contract');
  await threeD.focus();await page.keyboard.press('Space');expect((await eventCounts(page)).viewFailures).toBe(1);
  await page.keyboard.press('End');await expect(navButton(nav,'Debug')).toBeFocused();
  await page.keyboard.press('Home');await expect(home).toBeFocused();
  await page.keyboard.press('ArrowLeft');await expect(navButton(nav,'Debug')).toBeFocused();

  await uploadJson(page,'w10.10-browser.json',STAGED_PACKAGE);
  await page.locator('[data-entity-id="PIPE-A"]').click();
  await expect(threeD).toHaveAttribute('aria-disabled','false');
  const before=await eventCounts(page);
  await threeD.focus();await page.keyboard.press('Enter');
  await expect(page.locator('[data-application-view="THREE_D_CALC"]')).toBeVisible();
  await expect(threeD).toHaveAttribute('aria-current','page');
  const review=page.locator('[data-role="three-d-calc-consumer"]');
  for(const text of ['3D Calc','Read-only evidence review','Component geometry and identity','Port evidence','Connection evidence','Support attachment evidence','Restraint capability evidence','Model-load evidence','Not a second 3D viewport','No thermal or pressure stress'])await expect(review).toContainText(text);
  for(const role of ['three-d-calc-components','three-d-calc-ports','three-d-calc-connections','three-d-calc-attachments','three-d-calc-restraints'])await expect(page.locator(`[data-role="${role}"] th`).first()).toBeVisible();
  expect(await page.evaluate(()=>AnalysisWorkspace.getThreeDCalculationReviewModel().schema)).toBe('three-d-calculation-review-model/v1');
  expect(await page.evaluate(()=>AnalysisWorkspace.listWorkspaceConsumers().find((row)=>row.consumerId==='THREE_D_CALC').implementationStatus)).toBe('IMPLEMENTED');
  expect(await page.evaluate(()=>AnalysisWorkspace.getWorkspaceConsumerReadiness('THREE_D_CALC').readinessState)).toBe('AVAILABLE');
  expect(await page.evaluate(()=>AnalysisWorkspace.getApplicationViewState().schema)).toBe('application-view-state/v10');
  expect(await page.locator('[data-webgl-host]').count()).toBe(1);
  expect(await page.locator('[data-application-view="THREE_D_CALC"] canvas').count()).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  expect(await eventCounts(page)).toEqual({...before,viewChanges:before.viewChanges+1});

  await downloadFor(page,'Export Shared Model');
  await page.getByRole('button',{name:'Rebuild Exact Topology'}).click();
  await expect(page.locator('[data-role="three-d-calc-status"]')).toContainText(/topology evidence updated/i);
  await downloadFor(page,'Export Topology');
  await page.getByRole('button',{name:'Rebuild Support Evidence'}).click();
  await expect(page.locator('[data-role="three-d-calc-status"]')).toContainText('Support/restraint evidence updated');
  await downloadFor(page,'Export Support / Restraint');
  await page.getByRole('button',{name:'Rebuild Vertical Beam Model'}).click();
  await page.getByRole('button',{name:'Solve Vertical Beam'}).click();
  await expect.poll(()=>page.evaluate(()=>AnalysisWorkspace.getVerticalBeamSolution()?.semanticHash||null)).not.toBeNull();
  await expect.poll(()=>page.evaluate(()=>AnalysisWorkspace.getThreeDCalculationReviewModel()?.summary.optionalVerticalBeamIncluded)).toBe(true);
  await expect(page.locator('[data-role="three-d-calc-beam"]')).toContainText('signedSupportForceN');
  await expect(page.locator('[data-role="three-d-calc-beam"]')).toContainText('Node displacement rows');
  await downloadFor(page,'Export Vertical Beam');
  const after=await eventCounts(page);
  expect(after.sharedExports).toBe(1);expect(after.topologyRebuilds).toBe(1);expect(after.topologyExports).toBe(1);
  expect(after.supportRebuilds).toBe(1);expect(after.supportExports).toBe(1);expect(after.beamRebuilds).toBe(1);expect(after.beamSolves).toBe(1);expect(after.beamExports).toBe(1);
  expect(await page.evaluate(()=>globalThis.__w1010UrlAudit)).toEqual({created:4,revoked:4});
});

test('preserves Workspace, Load Calc, Reports and W10.4-W10.9 state',async({page})=>{
  await page.goto('/');await installEventAudit(page);await uploadJson(page,'w10.10-preserve.json',STAGED_PACKAGE);
  const nav=applicationNavigation(page);
  await page.locator('[data-entity-id="PIPE-A"]').click();
  await page.getByRole('button',{name:'Run Tributary Screening'}).click();
  await expect.poll(()=>page.evaluate(()=>AnalysisWorkspace.getSupportLoadScreening()?.semanticHash||null)).not.toBeNull();
  await navButton(nav,'3D Calc').click();
  await page.getByRole('button',{name:'Solve Vertical Beam'}).click();
  await expect.poll(()=>page.evaluate(()=>AnalysisWorkspace.getVerticalBeamSolution()?.semanticHash||null)).not.toBeNull();
  await navButton(nav,'Workspace').click();
  await expect(page.locator('[data-role="three-d-calc-consumer-root"]')).toBeEmpty();
  await page.locator('[data-model-calculation-control="mode"]').selectOption('SCREENING_AND_VERTICAL_BEAM');
  await page.getByRole('button',{name:'Create Calculation Package'}).click();
  await expect.poll(()=>page.evaluate(()=>AnalysisWorkspace.getActiveModelCalculationPackage()?.semanticHash||null)).not.toBeNull();
  const before=await preservedState(page),actions=await eventCounts(page);
  await navButton(nav,'Edit, Topo fix and Load Calc').click();await expect(page.locator('[data-role="load-calc-consumer"]')).toBeVisible();
  await navButton(nav,'Reports').click();await expect(page.locator('[data-role="reports-consumer"]')).toContainText('SCREENING_AND_VERTICAL_BEAM');
  await navButton(nav,'3D Calc').click();await expect(page.locator('[data-role="three-d-calc-beam"]')).toContainText('signedSupportForceN');
  await navButton(nav,'Workspace').click();
  expect(await preservedState(page)).toEqual(before);
  const after=await eventCounts(page);
  for(const key of ['sharedExports','topologyRebuilds','topologyExports','supportRebuilds','supportExports','beamRebuilds','beamSolves','beamExports'])expect(after[key]).toBe(actions[key]);
});

test('same-ID replacement, clear and teardown remove stale 3D Calc state',async({page})=>{
  let downloads=0;page.on('download',()=>{downloads+=1;});
  await page.goto('/');await uploadJson(page,'w10.10-first.json',STAGED_PACKAGE);
  const nav=applicationNavigation(page),threeD=navButton(nav,'3D Calc');
  const datasetId=await page.evaluate(()=>AnalysisWorkspace.getSnapshot().dataset.datasetId);
  await threeD.click();
  await uploadJson(page,'w10.10-replacement.json',STAGED_PACKAGE);
  await expect.poll(()=>page.evaluate(()=>AnalysisWorkspace.getApplicationViewState().activeViewId)).toBe('WORKSPACE');
  expect(await page.evaluate(()=>AnalysisWorkspace.getSnapshot().dataset.datasetId)).toBe(datasetId);
  await expect(threeD).toHaveAttribute('aria-disabled','false');
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  expect(await page.evaluate(()=>AnalysisWorkspace.getThreeDCalculationReviewModel())).toBeNull();
  await expect(threeD).toHaveAttribute('aria-disabled','true');
  const before=await listenerCounts(page);
  await page.evaluate(()=>AnalysisWorkspace.destroy());await expect(page.locator('#root')).toBeEmpty();
  const after=await listenerCounts(page);Object.keys(before).forEach((topic)=>expect(after[topic]).toBeLessThan(before[topic]));
  await page.evaluate(()=>{
    EventBus.publish('sharedModel:exportRequested',{});EventBus.publish('topology:rebuildExactRequested',{});
    EventBus.publish('supportRestraint:rebuildEvidenceRequested',{});EventBus.publish('verticalBeam:solveRequested',{});
    EventBus.publish('applicationView:changeRequested',{viewId:'THREE_D_CALC',source:'api'});
  });
  await page.waitForTimeout(50);expect(downloads).toBe(0);expect(await page.evaluate(()=>globalThis.__w1010UrlAudit)).toEqual({created:0,revoked:0});
});

function applicationNavigation(page){return page.getByRole('navigation',{name:'Application views'});}
function navButton(nav,name){return nav.getByRole('button',{name,exact:true});}
async function installEventAudit(page){await page.evaluate(()=>{
  globalThis.__w1010Events={viewFailures:0,viewChanges:0,sharedExports:0,topologyRebuilds:0,topologyExports:0,supportRebuilds:0,supportExports:0,beamRebuilds:0,beamSolves:0,beamExports:0};
  const count=(key)=>()=>{globalThis.__w1010Events[key]+=1;};
  EventBus.subscribe('applicationView:changeFailed',count('viewFailures'));EventBus.subscribe('applicationView:changed',count('viewChanges'));
  EventBus.subscribe('sharedModel:exportRequested',count('sharedExports'));EventBus.subscribe('topology:rebuildExactRequested',count('topologyRebuilds'));EventBus.subscribe('topology:exportRequested',count('topologyExports'));
  EventBus.subscribe('supportRestraint:rebuildEvidenceRequested',count('supportRebuilds'));EventBus.subscribe('supportRestraint:exportRequested',count('supportExports'));
  EventBus.subscribe('verticalBeam:rebuildRequested',count('beamRebuilds'));EventBus.subscribe('verticalBeam:solveRequested',count('beamSolves'));EventBus.subscribe('verticalBeam:exportRequested',count('beamExports'));
});}
async function uploadJson(page,name,payload){await page.locator('[data-role="dataset-file"]').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});}
async function downloadFor(page,name){const[download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name}).click()]);return{name:download.suggestedFilename(),content:fs.readFileSync(await download.path(),'utf8')};}
async function eventCounts(page){return page.evaluate(()=>globalThis.__w1010Events);}
async function listenerCounts(page){return page.evaluate((topics)=>Object.fromEntries(topics.map((topic)=>[topic,EventBus.listenerCount(topic)])),REQUEST_TOPICS);}
async function preservedState(page){return page.evaluate(()=>({datasetId:AnalysisWorkspace.getSnapshot().dataset.datasetId,selectedEntityId:AnalysisWorkspace.getSnapshot().selectedEntityId,sharedHash:AnalysisWorkspace.getSharedModel()?.semanticHash||null,topologyHash:AnalysisWorkspace.getTopologyGraph()?.semanticHash||null,attachmentHash:AnalysisWorkspace.getSupportAttachmentModel()?.semanticHash||null,restraintHash:AnalysisWorkspace.getRestraintCapabilityModel()?.semanticHash||null,loadHash:AnalysisWorkspace.getLoadPrimitiveSet()?.semanticHash||null,screeningHash:AnalysisWorkspace.getSupportLoadScreening()?.semanticHash||null,beamHash:AnalysisWorkspace.getVerticalBeamSolution()?.semanticHash||null,ledgerHash:AnalysisWorkspace.getModelCalculationLedger()?.semanticHash||null,packageHash:AnalysisWorkspace.getActiveModelCalculationPackage()?.semanticHash||null,loadReviewHash:AnalysisWorkspace.getLoadCalculationReviewModel()?.semanticHash||null,threeDReviewHash:AnalysisWorkspace.getThreeDCalculationReviewModel()?.semanticHash||null}));}
function pipe(id,startPoint,endPoint){return{id,name:id,type:'PIPE',sourcePath:`/MODEL/PIPES/${id}`,sourceAttributes:{LINE_ID:'LINE-W10.10',SYSTEM_ID:'SYS-W10.10',EI_N_M2:2000000,UNIT_PIPE_WEIGHT_KG_PER_M:10,INSULATION_THICKNESS_MM:0,FLUID_WT_OPE_KG_M:2,FLUID_WT_HYD_KG_M:3},nativeParams:{startPoint,endPoint}};}
function support(id,position,attachedPortId){return{id,name:id,type:'SUPPORT',sourcePath:`/MODEL/SUPPORTS/${id}`,sourceAttributes:{LINE_ID:'LINE-W10.10',SYSTEM_ID:'SYS-W10.10',POS:{x:position[0],y:position[1],z:position[2]},ATTACHED_PORT_ID:attachedPortId,SUPPORT_TYPE:'ANCHOR',VERTICAL_CAPABILITY:'RESTRAINED'}};}
