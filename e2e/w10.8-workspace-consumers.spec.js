import fs from 'node:fs';
import { expect, test } from '@playwright/test';

const STAGED_PACKAGE={schema:'inputxml-managed-stage/v1',packageHash:'W10.8-BROWSER',unit:'mm',objects:[
  {id:'PIPES',name:'Pipes',type:'BRANCH',children:[pipe('PIPE-A',[0,0,0],[1000,0,0]),pipe('PIPE-B',[1000,0,0],[2000,0,0])]},
  {id:'SUPPORTS',name:'Supports',type:'GROUP',children:[support('SUP-START',[0,0,0],'PIPE-A:port:start'),support('SUP-END',[2000,0,0],'PIPE-B:port:end')]},
]};
const NAVIGATION=['Home','Workspace','Load Calc','PCF','Sketcher','3D Calc','Pipe Solver','Local FEA','Reports','QA','Settings','Debug'];
const UNAVAILABLE=['Load Calc','3D Calc','Pipe Solver','Reports','Debug'];

test.beforeEach(async({page})=>{await page.addInitScript(()=>{
  globalThis.__WORKSPACE_VIEWPORT_BACKEND__='canvas2d';globalThis.__w108UrlAudit={created:0,revoked:0};
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=(blob)=>{globalThis.__w108UrlAudit.created+=1;return create(blob);};
  URL.revokeObjectURL=(url)=>{globalThis.__w108UrlAudit.revoked+=1;return revoke(url);};
});});

test('adopts archived W10.7 evidence with accessible deterministic navigation',async({page})=>{
  let downloadCount=0;page.on('download',()=>{downloadCount+=1;});
  await page.goto('/');await installEventAudit(page);
  const nav=page.locator('[data-role="application-navigation"]');
  await expect(nav.getByRole('button')).toHaveText(NAVIGATION);
  const home=nav.getByRole('button',{name:'Home',exact:true});
  const workspace=nav.getByRole('button',{name:'Workspace',exact:true});
  const reportsButton=nav.getByRole('button',{name:'Reports',exact:true});
  await expect(home).toHaveAttribute('aria-current','page');
  await home.focus();await page.keyboard.press('ArrowRight');await expect(workspace).toBeFocused();
  await workspace.click();await expect(workspace).toHaveAttribute('aria-current','page');
  for(const label of UNAVAILABLE){
    const button=nav.getByRole('button',{name:label,exact:true});
    expect(await button.evaluate((element)=>element.disabled)).toBe(false);
    await expect(button).toHaveAttribute('aria-disabled','true');
    const describedBy=await button.getAttribute('aria-describedby');
    await expect(page.locator(`#${describedBy}`)).not.toHaveText('');
  }
  for(const label of ['PCF','Sketcher','Local FEA','QA','Settings'])await expect(nav.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-disabled','false');
  const initialState=await page.evaluate(()=>AnalysisWorkspace.getApplicationViewState());
  await reportsButton.focus();await page.keyboard.press('Space');
  expect(await page.evaluate(()=>AnalysisWorkspace.getApplicationViewState())).toEqual(initialState);
  await page.keyboard.press('End');await expect(nav.getByRole('button',{name:'Debug',exact:true})).toBeFocused();
  await page.keyboard.press('Home');await expect(home).toBeFocused();
  await page.keyboard.press('ArrowLeft');await expect(nav.getByRole('button',{name:'Debug',exact:true})).toBeFocused();
  await nav.getByRole('button',{name:'Load Calc',exact:true}).focus();await page.keyboard.press('Enter');
  expect((await eventCounts(page)).viewFailures).toBe(2);
  expect(await page.evaluate(()=>AnalysisWorkspace.getApplicationViewState())).toEqual(initialState);
  await page.evaluate(()=>AnalysisWorkspace.activateApplicationView('PIPE_SOLVER'));
  expect((await eventCounts(page)).viewFailures).toBe(3);
  expect(await page.evaluate(()=>AnalysisWorkspace.getApplicationViewState())).toEqual(initialState);
  expect(downloadCount).toBe(0);

  await uploadJson(page,'w10.8-browser.json',STAGED_PACKAGE);
  await page.locator('[data-entity-id="PIPE-A"]').click();
  await prepareCalculations(page);await createPackage(page,'VERTICAL_BEAM_ONLY');
  const beamEntry=await page.evaluate(()=>AnalysisWorkspace.getModelCalculationLedger().activeEntryId);
  await createPackage(page,'SCREENING_AND_VERTICAL_BEAM');
  await expect(reportsButton).toHaveAttribute('aria-disabled','false');
  expect(await page.evaluate(()=>AnalysisWorkspace.getWorkspaceConsumerReadiness('REPORTS').readinessState)).toBe('AVAILABLE');
  const before=await preservedState(page),calculationBaseline=await calculationCounts(page);

  await reportsButton.click();
  await expect(page.locator('[data-application-view="REPORTS"]')).toBeVisible();
  await expect(page.locator('[data-panel="tree"]')).toBeAttached();
  const reports=page.locator('[data-role="reports-consumer"]');
  for(const text of ['SCREENING_AND_VERTICAL_BEAM','BENCHMARKED_SCREENING','LINEAR_ELASTIC_VERTICAL_BEAM','screenedVerticalForceN','signedSupportForceN','upwardSupportForceN','Max displacement m','Force residual N','not a full pipe-stress or code-compliance report'])await expect(reports).toContainText(text);

  const downloads=[];
  for(const name of ['Export Package JSON','Export Report CSV','Export Report Markdown']){
    const[download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name}).click()]);
    downloads.push({name:download.suggestedFilename(),content:fs.readFileSync(await download.path(),'utf8')});
  }
  expect(downloads.every((row)=>row.content.endsWith('\n'))).toBe(true);
  expect(JSON.parse(downloads[0].content).package.schema).toBe('model-calculation-package/v1');
  expect(downloads[1].content).toContain('screening force');
  expect(downloads[2].content).toContain('not a full pipe-stress or code-compliance report');
  expect(await page.evaluate(()=>globalThis.__w108UrlAudit)).toEqual({created:3,revoked:3});

  await page.locator('[data-reports-control="entry"]').selectOption(beamEntry);
  await page.getByRole('button',{name:'Select Archived Package'}).click();
  await expect.poll(()=>page.evaluate(()=>AnalysisWorkspace.getModelCalculationLedger().activeEntryId)).toBe(beamEntry);
  await expect(reports).toContainText('VERTICAL_BEAM_ONLY');
  await workspace.click();
  expect(await preservedState(page)).toEqual({...before,activeEntryId:beamEntry});
  await reportsButton.click();await expect(reports).toContainText('VERTICAL_BEAM_ONLY');
  await workspace.click();
  expect(await calculationCounts(page)).toEqual(calculationBaseline);
  expect(downloadCount).toBe(3);
  expect(await page.evaluate(()=>AnalysisWorkspace.getWorkspaceConsumerContext().contracts.sharedModel===AnalysisWorkspace.getSharedModel())).toBe(true);
});

test('duplicate upstream events preserve one consistent consumer state',async({page})=>{
  await page.goto('/');await uploadJson(page,'w10.8-duplicates.json',STAGED_PACKAGE);
  await prepareCalculations(page);await createPackage(page,'SCREENING_AND_VERTICAL_BEAM');
  const before=await page.evaluate(()=>({contextHash:AnalysisWorkspace.getWorkspaceConsumerContext().semanticHash,view:AnalysisWorkspace.getApplicationViewState(),packageHash:AnalysisWorkspace.getActiveModelCalculationPackage().semanticHash}));
  await page.evaluate(()=>{
    const payload={ledger:AnalysisWorkspace.getModelCalculationLedger(),activeReport:AnalysisWorkspace.getActiveModelCalculationReport(),availability:{screeningAvailable:true,beamAvailable:true,packageable:true},packageMode:'SCREENING_AND_VERTICAL_BEAM',reason:'duplicate-evidence'};
    EventBus.publish('modelCalculation:changed',payload);EventBus.publish('modelCalculation:changed',payload);
  });
  const after=await page.evaluate(()=>({contextHash:AnalysisWorkspace.getWorkspaceConsumerContext().semanticHash,view:AnalysisWorkspace.getApplicationViewState(),packageHash:AnalysisWorkspace.getActiveModelCalculationPackage().semanticHash}));
  expect(after).toEqual(before);
});

test('same-ID replacement, clear and teardown remove stale consumer state',async({page})=>{
  let downloadCount=0;page.on('download',()=>{downloadCount+=1;});
  await page.goto('/');await installEventAudit(page);
  await uploadJson(page,'w10.8-first.json',STAGED_PACKAGE);await prepareCalculations(page);await createPackage(page,'SCREENING_AND_VERTICAL_BEAM');
  await page.getByRole('button',{name:'Reports',exact:true}).click();
  const initialDatasetId=await page.evaluate(()=>AnalysisWorkspace.getSnapshot().dataset.datasetId);
  await uploadJson(page,'w10.8-replacement.json',STAGED_PACKAGE);
  await expect(page.getByRole('button',{name:'Reports',exact:true})).toHaveAttribute('aria-disabled','true');
  expect(await page.evaluate(()=>AnalysisWorkspace.getSnapshot().dataset.datasetId)).toBe(initialDatasetId);
  expect(await page.evaluate(()=>AnalysisWorkspace.getApplicationViewState().activeViewId)).toBe('WORKSPACE');
  expect(await page.evaluate(()=>AnalysisWorkspace.getModelCalculationLedger().entries.length)).toBe(0);
  expect(await page.evaluate(()=>AnalysisWorkspace.getActiveModelCalculationReport())).toBeNull();
  expect(downloadCount).toBe(0);
  await prepareCalculations(page);await createPackage(page,'SCREENING_AND_VERTICAL_BEAM');
  await page.getByRole('button',{name:'Reports',exact:true}).click();await page.getByRole('button',{name:'Workspace',exact:true}).click();
  await page.getByRole('button',{name:'Clear',exact:true}).click();
  expect(await page.evaluate(()=>AnalysisWorkspace.getSnapshot().status)).toBe('empty');
  expect(await page.evaluate(()=>AnalysisWorkspace.getWorkspaceConsumerContext().datasetId)).toBeNull();
  const beforeDestroy=await eventCounts(page);
  await page.evaluate(()=>AnalysisWorkspace.destroy());await expect(page.locator('#root')).toBeEmpty();
  expect(await page.evaluate(()=>AnalysisWorkspace.getWorkspaceConsumerContext())).toBeNull();
  expect(await page.evaluate(()=>AnalysisWorkspace.getApplicationViewState())).toBeNull();
  await page.evaluate(()=>EventBus.publish('applicationView:changeRequested',{viewId:'REPORTS',source:'api'}));
  await page.waitForTimeout(50);expect(await eventCounts(page)).toEqual(beforeDestroy);
  expect(downloadCount).toBe(0);expect(await page.evaluate(()=>globalThis.__w108UrlAudit)).toEqual({created:0,revoked:0});
});

async function prepareCalculations(page){await page.getByRole('button',{name:'Run Tributary Screening'}).click();await expect(page.locator('[data-role="support-load-screening-status"]')).toContainText('completed');await page.getByRole('button',{name:'Solve Vertical Stiffness'}).click();await expect(page.locator('[data-role="vertical-beam-status"]')).toContainText('completed');}
async function createPackage(page,mode){await page.locator('[data-model-calculation-control="mode"]').selectOption(mode);await page.getByRole('button',{name:'Create Calculation Package'}).click();await expect(page.locator('[data-role="model-calculation-status"]')).toContainText('Archived');}
async function installEventAudit(page){await page.evaluate(()=>{globalThis.__w108Events={analysis:0,screeningRuns:0,beamSolves:0,viewFailures:0,viewChanges:0,contexts:0};EventBus.subscribe('analysis:started',()=>{globalThis.__w108Events.analysis+=1;});EventBus.subscribe('supportLoadScreening:runRequested',()=>{globalThis.__w108Events.screeningRuns+=1;});EventBus.subscribe('verticalBeam:solveRequested',()=>{globalThis.__w108Events.beamSolves+=1;});EventBus.subscribe('applicationView:changeFailed',()=>{globalThis.__w108Events.viewFailures+=1;});EventBus.subscribe('applicationView:changed',()=>{globalThis.__w108Events.viewChanges+=1;});EventBus.subscribe('workspaceConsumerContext:changed',()=>{globalThis.__w108Events.contexts+=1;});});}
async function uploadJson(page,name,payload){await page.locator('[data-role="dataset-file"]').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});}
async function eventCounts(page){return page.evaluate(()=>globalThis.__w108Events);}
async function calculationCounts(page){const rows=await eventCounts(page);return{analysis:rows.analysis,screeningRuns:rows.screeningRuns,beamSolves:rows.beamSolves};}
async function preservedState(page){return page.evaluate(()=>({datasetId:AnalysisWorkspace.getSnapshot().dataset.datasetId,selectedEntityId:AnalysisWorkspace.getSnapshot().selectedEntityId,screeningHash:AnalysisWorkspace.getSupportLoadScreening()?.semanticHash||null,beamHash:AnalysisWorkspace.getVerticalBeamSolution()?.semanticHash||null,packageHashes:AnalysisWorkspace.getModelCalculationLedger().entries.map((row)=>row.packageSemanticHash),entryCount:AnalysisWorkspace.getModelCalculationLedger().entries.length,activeEntryId:AnalysisWorkspace.getModelCalculationLedger().activeEntryId}));}
function pipe(id,startPoint,endPoint){return{id,name:id,type:'PIPE',sourcePath:`/MODEL/PIPES/${id}`,sourceAttributes:{LINE_ID:'LINE-W10.8',SYSTEM_ID:'SYS-W10.8',EI_N_M2:2000000,UNIT_PIPE_WEIGHT_KG_PER_M:10,INSULATION_THICKNESS_MM:0,FLUID_WT_OPE_KG_M:2,FLUID_WT_HYD_KG_M:3},nativeParams:{startPoint,endPoint}};}
function support(id,position,attachedPortId){return{id,name:id,type:'SUPPORT',sourcePath:`/MODEL/SUPPORTS/${id}`,sourceAttributes:{LINE_ID:'LINE-W10.8',SYSTEM_ID:'SYS-W10.8',POS:{x:position[0],y:position[1],z:position[2]},ATTACHED_PORT_ID:attachedPortId,SUPPORT_TYPE:'ANCHOR',VERTICAL_CAPABILITY:'RESTRAINED'}};}
