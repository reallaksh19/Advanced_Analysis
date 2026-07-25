import { expect, test } from '@playwright/test';

const NAVIGATION = ['Home','Workspace','Load Calc','PCF','Sketcher','3D Calc','Pipe Solver','Local FEA','Reports','QA','Settings','Debug'];
const DATASET = {
  schema:'rvm-selected-geometry-workspace-package/v1',
  packageHash:'QA-<img src=x onerror=globalThis.__qaUnsafe=1>',
  source:{ sourceFileName:'qa-runtime-evidence.json' },
  geometry:{
    objects:[{ id:'PIPE-QA-1',name:'QA Pipe',type:'PIPE',sourcePath:'/QA/PIPE-QA-1',nativeParams:{ startPoint:[0,0,0],endPoint:[1000,0,0] } }],
    supports:[], branches:[],
  },
};

async function openQa(page) {
  const navigation = page.getByRole('navigation', { name:'Application views' });
  const button = navigation.getByRole('button', { name:'QA', exact:true });
  await expect(button).toHaveAttribute('aria-disabled','false');
  await button.click();
  await expect(page.getByRole('heading', { name:'QA', exact:true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__qaUnsafe = 0;
    globalThis.__qaIntervals = 0;
    globalThis.__qaExportBlobs = [];
    globalThis.__qaCreatedUrls = [];
    globalThis.__qaRevokedUrls = [];
    const nativeInterval = globalThis.setInterval.bind(globalThis);
    globalThis.setInterval = (...args) => { globalThis.__qaIntervals += 1; return nativeInterval(...args); };
    const nativeCreate = URL.createObjectURL.bind(URL), nativeRevoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const url = nativeCreate(blob); globalThis.__qaExportBlobs.push(blob); globalThis.__qaCreatedUrls.push(url); return url; };
    URL.revokeObjectURL = (url) => { globalThis.__qaRevokedUrls.push(url); return nativeRevoke(url); };
  });
});

test('QA is lazy, dataset-independent, read-only and exports deterministic runtime evidence', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name:'Application views' });
  await expect(navigation.getByRole('button')).toHaveText(NAVIGATION);
  expect(await page.evaluate(() => AnalysisWorkspace.getQaEvidenceSource())).toBeNull();
  expect(await page.evaluate(() => AnalysisWorkspace.getQaReviewModel())).toBeNull();
  await page.evaluate(() => {
    globalThis.__qaChangedCount = 0;
    globalThis.__qaForbiddenEvents = 0;
    EventBus.subscribe('qaEvidence:changed', () => { globalThis.__qaChangedCount += 1; });
    ['analysis:requested','analysis:exportRequested','modelLoad:rebuildRequested','topology:rebuildExactRequested','supportLoadScreening:runRequested','verticalBeam:solveRequested','modelCalculation:createRequested'].forEach((topic) => EventBus.subscribe(topic, () => { globalThis.__qaForbiddenEvents += 1; }));
  });
  const intervalsBefore = await page.evaluate(() => globalThis.__qaIntervals);
  const ownersBefore = await ownerEvidence(page);
  await openQa(page);

  const evidence = await page.evaluate(() => ({ source:AnalysisWorkspace.getQaEvidenceSource(), review:AnalysisWorkspace.getQaReviewModel(), changed:globalThis.__qaChangedCount }));
  expect(evidence.changed).toBe(1);
  expect(evidence.source.schema).toBe('qa-evidence-source/v1');
  expect(evidence.review.schema).toBe('qa-review-model/v1');
  expect(evidence.review.qualityState).toBe('VALID_EMPTY');
  expect(evidence.source.consumerRows).toHaveLength(12);
  expect(evidence.source.consumerRows.some((row) => row.consumerId === 'LOCAL_FEA')).toBe(true);
  expect(evidence.source.contractRows.length).toBeGreaterThan(0);
  await expect(page.locator('[data-role="qa-consumer-table"] tbody tr')).toHaveCount(evidence.source.consumerRows.length);
  await expect(page.locator('[data-role="qa-contract-table"] tbody tr')).toHaveCount(evidence.source.contractRows.length);
  await expect(page.locator('[data-role="qa-quality"]')).toHaveText('VALID_EMPTY');
  await expect(page.locator('[data-role="qa-consumer-root"]')).toContainText('not engineering approval');
  await expect(page.locator('[data-role="qa-consumer-root"]')).toContainText('repository CI certification');
  expect(await page.evaluate(() => globalThis.__qaForbiddenEvents)).toBe(0);
  expect(await page.evaluate(() => AnalysisWorkspace.getActiveModelCalculationPackage())).toBeNull();
  expect(await page.evaluate(() => globalThis.__qaIntervals)).toBe(intervalsBefore);

  await page.getByRole('button', { name:'Refresh Evidence' }).click();
  const refreshed = await page.evaluate(() => ({ source:AnalysisWorkspace.getQaEvidenceSource(), review:AnalysisWorkspace.getQaReviewModel() }));
  expect(refreshed.source.semanticHash).toBe(evidence.source.semanticHash);
  expect(refreshed.review.semanticHash).toBe(evidence.review.semanticHash);
  expect(await ownerEvidence(page)).toEqual(ownersBefore);

  await page.getByRole('button', { name:'Export JSON' }).click();
  await page.getByRole('button', { name:'Export JSON' }).click();
  await page.getByRole('button', { name:'Export CSV' }).click();
  await page.getByRole('button', { name:'Export CSV' }).click();
  const exports = await page.evaluate(async () => ({
    content:await Promise.all(globalThis.__qaExportBlobs.map((blob) => blob.text())),
    created:[...globalThis.__qaCreatedUrls], revoked:[...globalThis.__qaRevokedUrls],
  }));
  expect(exports.content[0]).toBe(exports.content[1]);
  expect(exports.content[2]).toBe(exports.content[3]);
  expect(exports.content[0].endsWith('\n')).toBe(true);
  expect(exports.content[2].endsWith('\n')).toBe(true);
  expect(exports.content[2]).toContain('CONSUMERS,');
  expect(exports.content[2]).toContain('CONTRACTS,');
  expect(exports.created).toEqual(exports.revoked);
  expect(await page.evaluate(() => globalThis.__qaForbiddenEvents)).toBe(0);
  await expect(navigation.getByRole('button', { name:'Debug', exact:true })).toHaveAttribute('aria-disabled','true');
});

test('dataset evidence updates QA while selection and navigation preserve semantic identity and source owners', async ({ page }) => {
  await page.goto('/');
  await uploadJson(page, 'qa-runtime-evidence.json', DATASET);
  expect((await page.evaluate(() => AnalysisWorkspace.getSnapshot())).status).toBe('ready');
  await openQa(page);
  const before = await page.evaluate(() => ({
    source:AnalysisWorkspace.getQaEvidenceSource(), review:AnalysisWorkspace.getQaReviewModel(),
    snapshot:AnalysisWorkspace.getSnapshot(), settings:AnalysisWorkspace.getEngineeringSettingsProfile(),
    sketcher:AnalysisWorkspace.getSketcherDraftDocument(), ledger:AnalysisWorkspace.getAnalysisLedger(),
    session:AnalysisWorkspace.getAnalysisSession(), report:AnalysisWorkspace.getActiveModelCalculationReport(),
  }));
  expect(before.review.qualityState).toBe('VALID_PARTIAL');
  expect(before.source.contextReference.datasetId).toBe(before.snapshot.dataset.datasetId);
  expect(before.source.contractRows.find((row) => row.contractKey === 'sharedModel').availability).toBe('AVAILABLE');
  expect(before.source.consumerRows.find((row) => row.consumerId === 'REPORTS').missingRequiredContractKeys.length).toBeGreaterThan(0);
  expect(before.source.contractRows.find((row) => row.contractKey === 'supportLoadScreening').availability).toBe('UNAVAILABLE');
  await expect(page.locator('[data-role="qa-consumer-table"]')).toContainText('MISSING_REQUIRED_CONTRACT');
  await expect(page.locator('[data-role="qa-contract-table"]')).toContainText('NOT_PRESENT');
  await expect(page.locator('[data-role="qa-context-summary"]')).toContainText(before.snapshot.dataset.datasetId);
  expect(await page.locator('[data-role="qa-consumer-root"] img').count()).toBe(0);
  expect(await page.evaluate(() => globalThis.__qaUnsafe)).toBe(0);

  await page.evaluate(() => EventBus.publish('viewport:selectionRequested', { entityId:'PIPE-QA-1', source:'api' }));
  await page.waitForFunction(() => AnalysisWorkspace.getSnapshot().selectedEntityId === 'PIPE-QA-1');
  await page.waitForFunction((version) => AnalysisWorkspace.getQaEvidenceSource().contextReference.workspaceVersion > version, before.source.contextReference.workspaceVersion);
  const selected = await page.evaluate(() => ({ source:AnalysisWorkspace.getQaEvidenceSource(), review:AnalysisWorkspace.getQaReviewModel(), snapshot:AnalysisWorkspace.getSnapshot() }));
  expect(selected.snapshot.selectedEntityId).toBe('PIPE-QA-1');
  expect(selected.source.semanticHash).toBe(before.source.semanticHash);
  expect(selected.review.semanticHash).toBe(before.review.semanticHash);
  expect(selected.source.consumerRows.map((row) => row.consumerId)).toEqual(before.source.consumerRows.map((row) => row.consumerId));
  expect(selected.source.contractRows.map((row) => row.contractKey)).toEqual(before.source.contractRows.map((row) => row.contractKey));

  const navigation = page.getByRole('navigation', { name:'Application views' });
  await navigation.getByRole('button', { name:'Settings', exact:true }).click();
  await navigation.getByRole('button', { name:'QA', exact:true }).click();
  const after = await page.evaluate(() => ({
    snapshot:AnalysisWorkspace.getSnapshot(), settings:AnalysisWorkspace.getEngineeringSettingsProfile(),
    sketcher:AnalysisWorkspace.getSketcherDraftDocument(), ledger:AnalysisWorkspace.getAnalysisLedger(),
    session:AnalysisWorkspace.getAnalysisSession(), report:AnalysisWorkspace.getActiveModelCalculationReport(),
  }));
  expect(after.snapshot.dataset.datasetId).toBe(before.snapshot.dataset.datasetId);
  expect(after.snapshot.selectedEntityId).toBe('PIPE-QA-1');
  expect(after.settings).toEqual(before.settings);
  expect(after.sketcher).toEqual(before.sketcher);
  expect(after.ledger).toEqual(before.ledger);
  expect(after.session).toEqual(before.session);
  expect(after.report).toEqual(before.report);
});

test('QA teardown removes listeners and leaves no polling runtime', async ({ page }) => {
  await page.goto('/');
  await openQa(page);
  const before = await page.evaluate(() => ({
    refresh:EventBus.listenerCount('qaEvidence:refreshRequested'),
    export:EventBus.listenerCount('qaEvidence:exportRequested'),
    intervals:globalThis.__qaIntervals,
  }));
  expect(before.refresh).toBe(1);
  expect(before.export).toBe(1);
  await page.evaluate(() => AnalysisWorkspace.destroy());
  await expect(page.locator('#root')).toBeEmpty();
  const after = await page.evaluate(() => ({
    refresh:EventBus.listenerCount('qaEvidence:refreshRequested'),
    export:EventBus.listenerCount('qaEvidence:exportRequested'),
    intervals:globalThis.__qaIntervals,
  }));
  expect(after.refresh).toBe(0);
  expect(after.export).toBe(0);
  expect(after.intervals).toBe(before.intervals);
});

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({ name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload)) });
}
async function ownerEvidence(page) {
  return page.evaluate(() => ({
    snapshot:AnalysisWorkspace.getSnapshot(), settings:AnalysisWorkspace.getEngineeringSettingsProfile(),
    sketcher:AnalysisWorkspace.getSketcherDraftDocument(), ledger:AnalysisWorkspace.getAnalysisLedger(),
    session:AnalysisWorkspace.getAnalysisSession(), package:AnalysisWorkspace.getActiveModelCalculationPackage(),
    report:AnalysisWorkspace.getActiveModelCalculationReport(),
  }));
}
