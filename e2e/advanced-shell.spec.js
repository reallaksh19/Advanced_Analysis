import { expect, test } from '@playwright/test';

const STAGED_PACKAGE = {
  schema: 'inputxml-managed-stage/v1',
  packageHash: 'ADVANCED-SHELL-BROWSER',
  unit: 'mm',
  objects: [
    {
      id: 'PIPES',
      name: 'Pipes',
      type: 'BRANCH',
      children: [
        pipe('PIPE-A', [0, 0, 0], [1000, 0, 0]),
        pipe('PIPE-B', [1000, 0, 0], [2000, 0, 0]),
      ],
    },
    {
      id: 'SUPPORTS',
      name: 'Supports',
      type: 'GROUP',
      children: [
        support('SUP-START', [0, 0, 0], 'PIPE-A:port:start'),
        support('SUP-END', [2000, 0, 0], 'PIPE-B:port:end'),
      ],
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'canvas2d';
  });
});

test('workspace qualification: exact four-tab shell imports, selects and rejects invalid replacements', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  for (const label of ['Workspace', 'Load Calc', 'LAFEA', 'LFEA']) {
    await expect(navigation.getByRole('button', { name: label, exact: true })).toHaveCount(1);
  }
  await expect(navigation.getByRole('button', { name: 'Workspace', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('[data-application-view]')).toHaveCount(4);
  await expect(page.locator('[data-role="tab-benchmark-status"]')).toHaveCount(4);
  await expect(page.locator('[data-benchmark-tab="WORKSPACE"] [data-role="tab-benchmark-evidence"]')).toHaveAttribute(
    'href',
    /qualification\/advanced-tab-benchmarks\.md$/,
  );

  await uploadJson(page, 'advanced-shell.json', STAGED_PACKAGE);
  await expect.poll(() => page.evaluate(() => AnalysisWorkspace.getSnapshot().status)).toBe('ready');
  const first = await page.evaluate(() => ({
    datasetId: AnalysisWorkspace.getSnapshot().dataset.datasetId,
    pipes: AnalysisWorkspace.getSnapshot().dataset.summary.pipes,
    supports: AnalysisWorkspace.getSnapshot().dataset.summary.supports,
    sharedModelHash: AnalysisWorkspace.getSharedModel().semanticHash,
    topologyHash: AnalysisWorkspace.getTopologyGraph().semanticHash,
  }));
  expect(first).toMatchObject({
    datasetId: 'ADVANCED-SHELL-BROWSER',
    pipes: 2,
    supports: 2,
  });

  await page.locator('[data-entity-id="PIPE-A"]').click();
  expect(await page.evaluate(() => AnalysisWorkspace.getSnapshot().selectedEntityId)).toBe('PIPE-A');
  const beforeRejected = await page.evaluate(() => AnalysisWorkspace.getSnapshot());
  await uploadJson(page, 'unsupported.json', { schema: 'unsupported/v1' });
  await expect(page.locator('[data-role="tree-error"]')).toBeVisible();
  const afterRejected = await page.evaluate(() => AnalysisWorkspace.getSnapshot());
  expect(afterRejected).toEqual(beforeRejected);

  await uploadJson(page, 'advanced-shell.json', STAGED_PACKAGE);
  await expect.poll(() => page.evaluate(() => AnalysisWorkspace.getSnapshot().selectedEntityId)).toBeFalsy();
  const reimported = await page.evaluate(() => ({
    sharedModelHash: AnalysisWorkspace.getSharedModel().semanticHash,
    topologyHash: AnalysisWorkspace.getTopologyGraph().semanticHash,
  }));
  expect(reimported).toEqual({
    sharedModelHash: first.sharedModelHash,
    topologyHash: first.topologyHash,
  });
});

test('load calc qualification: Workspace contracts unlock and refresh Load Calc', async ({ page }) => {
  await page.goto('/');
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  const workspace = navigation.getByRole('button', { name: 'Workspace', exact: true });
  const loadCalc = navigation.getByRole('button', { name: 'Load Calc', exact: true });
  await expect(loadCalc).toHaveAttribute('aria-disabled', 'true');

  await uploadJson(page, 'advanced-load-calc.json', STAGED_PACKAGE);
  await expect(loadCalc).toHaveAttribute('aria-disabled', 'false');
  const linked = await page.evaluate(() => {
    const context = AnalysisWorkspace.getWorkspaceConsumerContext();
    return {
      contextHash: context.semanticHash,
      sharedModelHash: context.contracts.sharedModel.semanticHash,
      loadCaseHash: context.contracts.loadCaseSet.semanticHash,
      primitiveHash: context.contracts.loadPrimitiveSet.semanticHash,
      readinessHash: context.contracts.modelLoadReadinessAudit.semanticHash,
    };
  });
  Object.values(linked).forEach((value) => expect(value).toMatch(/^fnv1a64:/));

  await loadCalc.click();
  await expect(page.locator('[data-role="load-calc-consumer"]')).toContainText('EMPTY');
  await expect(page.locator('[data-role="load-calc-consumer"]')).toContainText('OPE');
  await expect(page.locator('[data-role="load-calc-consumer"]')).toContainText('HYD');
  expect(await page.evaluate(() => AnalysisWorkspace.getLoadCalculationReviewModel().contextSemanticHash)).toBe(linked.contextHash);

  await page.getByRole('button', { name: 'Rebuild Vertical Load Paths' }).click();
  await page.getByRole('button', { name: 'Run Tributary Screening' }).click();
  await expect.poll(() => page.evaluate(
    () => AnalysisWorkspace.getLoadCalculationReviewModel()?.summary.screeningIncluded,
  )).toBe(true);
  await expect(page.locator('[data-role="load-calc-screening"]')).toContainText('screenedVerticalForceN');

  await workspace.click();
  const updatedPackage = structuredClone(STAGED_PACKAGE);
  updatedPackage.objects[0].children[1].sourceAttributes.UNIT_PIPE_WEIGHT_KG_PER_M = 11;
  await uploadJson(page, 'advanced-load-calc.json', updatedPackage);
  await expect.poll(() => page.evaluate(
    () => AnalysisWorkspace.getWorkspaceConsumerContext().semanticHash,
  )).not.toBe(linked.contextHash);
  await loadCalc.click();
  expect(await page.evaluate(() => AnalysisWorkspace.getLoadCalculationReviewModel().contextSemanticHash)).not.toBe(linked.contextHash);
});

async function uploadJson(page, name, payload) {
  const input = page.locator('[data-role="dataset-file"]');
  await input.setInputFiles([]);
  await input.setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
  await expect(input).toHaveValue('');
}

function pipe(id, startPoint, endPoint) {
  return {
    id,
    name: id,
    type: 'PIPE',
    sourcePath: `/MODEL/PIPES/${id}`,
    sourceAttributes: {
      LINE_ID: 'LINE-ADVANCED',
      SYSTEM_ID: 'SYS-ADVANCED',
      EI_N_M2: 2000000,
      UNIT_PIPE_WEIGHT_KG_PER_M: 10,
      INSULATION_THICKNESS_MM: 0,
      FLUID_WT_OPE_KG_M: 2,
      FLUID_WT_HYD_KG_M: 3,
    },
    nativeParams: { startPoint, endPoint },
  };
}

function support(id, position, attachedPortId) {
  return {
    id,
    name: id,
    type: 'SUPPORT',
    sourcePath: `/MODEL/SUPPORTS/${id}`,
    sourceAttributes: {
      LINE_ID: 'LINE-ADVANCED',
      SYSTEM_ID: 'SYS-ADVANCED',
      POS: { x: position[0], y: position[1], z: position[2] },
      ATTACHED_PORT_ID: attachedPortId,
      SUPPORT_TYPE: 'ANCHOR',
      VERTICAL_CAPABILITY: 'RESTRAINED',
    },
  };
}
