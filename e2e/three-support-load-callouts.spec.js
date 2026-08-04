import { expect, test } from '@playwright/test';

const SIMULATED_PACKAGE = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'P7-SIMULATED-AUTHORIZED-WEBGL',
  geometry: {
    objects: [
      {
        id: 'PIPE-A',
        name: 'Simulated pipe A',
        type: 'PIPE',
        sourcePath: '/ZONE-A/LINE-A/PIPE-A',
        sourceAttributes: { ZONE: 'ZONE-A', LINE_ID: 'L-A', BRANCH_ID: 'B-A' },
        nativeParams: { startPoint: [0, 0, 0], endPoint: [1000, 0, 0] },
      },
      {
        id: 'PIPE-B',
        name: 'Simulated pipe B',
        type: 'PIPE',
        sourcePath: '/ZONE-B/LINE-B/PIPE-B',
        sourceAttributes: { ZONE: 'ZONE-B', LINE_ID: 'L-B', BRANCH_ID: 'B-B' },
        nativeParams: { startPoint: [0, 1000, 0], endPoint: [1000, 1000, 0] },
      },
    ],
    supports: [
      support('SUP-A0', 'ZONE-A', 'L-A', '0 0 0'),
      support('SUP-A1', 'ZONE-A', 'L-A', '1000 0 0'),
      support('SUP-B0', 'ZONE-B', 'L-B', '0 1000 0'),
      support('SUP-B1', 'ZONE-B', 'L-B', '1000 1000 0'),
    ],
    branches: [],
  },
};

test('[SIMULATED] authorized empirical reactions project through exact support identities', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    globalThis.__WORKSPACE_VIEWPORT_BACKEND__ = 'webgl';
  });
  await page.goto('/');
  await uploadJson(page, 'p7-simulated-authorized-webgl.json', SIMULATED_PACKAGE);

  const host = page.locator('[data-role="viewport-render-host"]');
  const canvas = host.locator('canvas[data-viewport-backend="webgl"]');
  await expect(host).toHaveAttribute('data-viewport-backend', 'webgl');
  await expect(canvas).toHaveCount(1);
  await expect(host).toHaveAttribute('data-renderable-count', '6');

  const qualified = await page.evaluate(async () => {
    const [
      { semanticHash },
      { WorkspaceState },
      { engineeringModelStore },
      { projectDataStore },
      { createEvidenceValue },
      { masterDataController },
      {
        computeAuthorizedEmpiricalLoadInputSemanticHash,
        requireAuthorizedEmpiricalLoadInput,
      },
      {
        AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA,
        sealAuthorizedEmpiricalRuntimePackage,
      },
      { SupportLoadPresenter },
    ] = await Promise.all([
      import('/src/core/shared-piping-model/canonical-json.js'),
      import('/src/workspace/workspace-state.js'),
      import('/src/workspace/engineering-model-store.js'),
      import('/src/workspace/project-data/project-data-store.js'),
      import('/src/workspace/project-data/project-data-contract.js'),
      import('/src/workspace/master-data-controller.js'),
      import('/src/workspace/engineering-loads/authorized-empirical-load-input.js'),
      import('/src/workspace/engineering-loads/authorized-empirical-runtime-package.js'),
      import('/src/workspace/sequential-sketcher/support-load-presenter.js'),
    ]);

    const hashes = {
      lineList: '2'.repeat(64),
      pipingClass: '3'.repeat(64),
      componentWeight: '4'.repeat(64),
    };
    masterDataController.setRawRows('lineList', [], '[SIMULATED] line list', 'Sheet1', {
      sourceHash: hashes.lineList,
      byteLength: 0,
    });
    masterDataController.setRawRows('pipingClass', [], '[SIMULATED] piping class', 'Sheet1', {
      sourceHash: hashes.pipingClass,
      byteLength: 0,
    });
    masterDataController.setRawRows('weight', [], '[SIMULATED] component weights', 'Sheet1', {
      sourceHash: hashes.componentWeight,
      byteLength: 0,
    });

    const source = (value, sourceKey, sourceHash) => createEvidenceValue(
      value,
      { source: 'P7_SIMULATED_BROWSER_FIXTURE', sourceKey, sourceHash },
      true,
    );
    const approved = (value, sourceName) => createEvidenceValue(
      value,
      { source: sourceName },
      true,
    );
    const profile = structuredClone(projectDataStore.getProfile());
    profile.projectId = 'PROJECT-P7-SIMULATED';
    profile.revision += 1;
    profile.updatedAt = '2026-08-04T16:40:00.000Z';
    profile.sourcesAndUnits.lineListSource = source(
      { sha256: hashes.lineList }, 'lineList', hashes.lineList,
    );
    profile.sourcesAndUnits.pipingClassSource = source(
      { sha256: hashes.pipingClass }, 'pipingClass', hashes.pipingClass,
    );
    profile.sourcesAndUnits.componentWeightSource = source(
      { sha256: hashes.componentWeight }, 'componentWeight', hashes.componentWeight,
    );
    profile.topology.supportTypeCapabilities = approved(
      { REST: { vertical: true } },
      'P7_SIMULATED_SUPPORT_POLICY',
    );
    projectDataStore.importProfile(profile, '[SIMULATED] P7 browser profile');

    const dataset = WorkspaceState.getSnapshot().dataset;
    const supportSiteModel = engineeringModelStore.getSupportSiteModel();
    const routePartitionModel = engineeringModelStore.getRoutePartitionModel();
    const activeProfile = projectDataStore.getProfile();
    const masterData = masterDataController.getMasterData();
    if (!dataset?.sourceSha256 || !dataset.sharedModel) {
      throw new Error('P7 browser fixture did not materialize governed dataset hashes.');
    }
    if (routePartitionModel?.status !== 'READY') {
      throw new Error(`P7 route partition is ${routePartitionModel?.status}: ${JSON.stringify(routePartitionModel?.blockers || [])}`);
    }
    if (supportSiteModel?.sites?.length !== 4) {
      throw new Error(`P7 expected four canonical support sites, observed ${supportSiteModel?.sites?.length}.`);
    }

    const pipes = dataset.entities
      .filter((entity) => entity.category === 'pipe')
      .sort((left, right) => left.lineKey < right.lineKey ? -1 : left.lineKey > right.lineKey ? 1 : 0);
    const sections = {};
    const operating = {};
    const hydro = {};
    const lineBindings = [];
    pipes.forEach((pipe, index) => {
      sections[pipe.lineKey] = {
        outsideDiameterMm: 100,
        wallThicknessMm: 5,
        materialCode: 'MAT-P7',
        insulationCode: 'INS-P7',
        insulationThicknessMm: 10,
      };
      operating[pipe.lineKey] = 800;
      hydro[pipe.lineKey] = 1000;
      lineBindings.push({
        targetId: `line:${String(index + 1).padStart(2, '0')}`,
        sourceRecordId: pipe.sourceEntityId,
        lineKey: pipe.lineKey,
        projectionRecordSemanticHash: `fnv1a64:${String(index + 7).repeat(16).slice(0, 16)}`,
      });
    });
    const firstSupport = dataset.entities.find((entity) => entity.category === 'support');
    const loadCalculationOverlay = {
      pipeSectionProperties: sections,
      materialDensitiesKgPerM3: { 'MAT-P7': 7850 },
      operatingFluidDensitiesKgPerM3: operating,
      hydroFluidDensitiesKgPerM3: hydro,
      insulationDensitiesKgPerM3: { 'INS-P7': 120 },
      componentWeightsKg: { 'UNUSED-P7': 1 },
    };
    const inputDraft = {
      schema: 'authorized-empirical-load-input/v1',
      intakeId: 'INTAKE-P7-SIMULATED',
      projectId: activeProfile.projectId,
      baselineId: 'BASELINE-P7-SIMULATED',
      baselineRevision: 1,
      baselineSemanticHash: 'fnv1a64:1111111111111111',
      readinessEvaluationSemanticHash: 'fnv1a64:2222222222222222',
      readinessSemanticHash: 'fnv1a64:3333333333333333',
      handoffSemanticHash: 'fnv1a64:4444444444444444',
      projectionPayloadSemanticHash: 'fnv1a64:5555555555555555',
      adapterVersion: 'empirical-adapter/1.0.0',
      configurationHash: 'fnv1a64:6666666666666666',
      createdAt: '2026-08-04T16:41:00.000Z',
      lineBindings,
      componentBindings: [{
        targetId: 'component:unused-p7',
        sourceRecordId: firstSupport.sourceEntityId,
        lineKey: pipes[0].lineKey,
        catalogKey: 'UNUSED-P7',
        projectionRecordSemanticHash: 'fnv1a64:9999999999999999',
      }],
      loadCalculationOverlay,
      overlaySemanticHash: semanticHash(loadCalculationOverlay),
      summary: {
        lineCount: lineBindings.length,
        componentCount: 1,
        materialCodeCount: 1,
        insulationCodeCount: 1,
        componentCatalogCount: 1,
      },
      semanticHash: 'fnv1a64:0000000000000000',
    };
    const authorizedInput = requireAuthorizedEmpiricalLoadInput({
      ...inputDraft,
      semanticHash: computeAuthorizedEmpiricalLoadInputSemanticHash(inputDraft),
    });
    const bindings = {
      projectId: activeProfile.projectId,
      datasetId: dataset.datasetId,
      datasetVersion: dataset.version ?? null,
      sourceDatasetHash: dataset.sourceSha256,
      sharedModelSemanticHash: semanticHash(dataset.sharedModel),
      supportSiteModelSemanticHash: semanticHash(supportSiteModel),
      routePartitionModelSemanticHash: semanticHash(routePartitionModel),
      projectDataProfileSemanticHash: semanticHash(activeProfile),
      masterSourceHashes: {
        dataset: dataset.sourceSha256,
        lineList: hashes.lineList,
        pipingClass: hashes.pipingClass,
        componentWeight: hashes.componentWeight,
      },
    };
    const runtimePackage = sealAuthorizedEmpiricalRuntimePackage({
      schema: AUTHORIZED_EMPIRICAL_RUNTIME_PACKAGE_SCHEMA,
      packageId: 'PACKAGE-P7-SIMULATED',
      configuredAt: '2026-08-04T16:42:00.000Z',
      executionId: 'EXECUTION-P7-SIMULATED',
      executedAt: '2026-08-04T16:43:00.000Z',
      authorizedInput,
      bindings,
    });
    const execution = globalThis.AnalysisWorkspace.executeAuthorizedEmpiricalLoads({
      schema: 'authorized-empirical-consumer-request/v2',
      runtimePackage,
    });
    if (execution.status !== 'CALCULATED') {
      throw new Error(`P7 authorized execution did not calculate: ${JSON.stringify(execution.summary)}`);
    }

    const exactSite = supportSiteModel.sites.find((site) => site.primaryEntityId === 'SUP-A1');
    const exactEntity = dataset.entities.find((entity) => entity.entityId === exactSite.primaryEntityId);
    const callout = new SupportLoadPresenter().getResultCallouts(exactEntity)[0];
    return {
      executionStatus: execution.status,
      siteId: exactSite.siteId,
      primaryEntityId: exactSite.primaryEntityId,
      label: callout.label,
      resultKind: callout.resultKind,
      allSiteCount: supportSiteModel.sites.length,
    };
  });

  expect(qualified.executionStatus).toBe('CALCULATED');
  expect(qualified.resultKind).toBe('EMPIRICAL_SUPPORT_REACTION');
  expect(qualified.allSiteCount).toBe(4);
  const exactCallout = host.locator(`[data-support-load-object-id="${qualified.primaryEntityId}"]`);
  await expect(exactCallout).toHaveCount(1);
  await expect(exactCallout).toHaveText(qualified.label);
  await expect(exactCallout).toBeVisible();
  await expect(host).toHaveAttribute('data-support-load-callout-count', '4');
  expect(await exactCallout.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
  const renderableBefore = await host.getAttribute('data-renderable-count');
  const positionBefore = await exactCallout.boundingBox();

  await page.locator('[data-viewport-action="view-right"]').click();
  await expect(host).toHaveAttribute('data-view-command', 'right');
  await expect(exactCallout).toBeVisible();
  const positionAfter = await exactCallout.boundingBox();
  expect(positionAfter.x).not.toBe(positionBefore.x);
  await expect(canvas).toHaveCount(1);
  await expect(host).toHaveAttribute('data-renderable-count', renderableBefore);

  await page.locator('[data-viewport-action="toggle-projection"]').click();
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect(exactCallout).toBeVisible();
  await expect(canvas).toHaveCount(1);

  await page.locator('[data-role="model-zone-selector"]').selectOption('ZONE-A');
  await expect(host).toHaveAttribute('data-support-load-callout-count', '2');
  await expect(exactCallout).toHaveCount(1);
  await expect(host.locator('[data-support-load-object-id="SUP-B1"]')).toHaveCount(0);

  await page.evaluate(async () => {
    const [{ projectDataStore }, { createEvidenceValue }] = await Promise.all([
      import('/src/workspace/project-data/project-data-store.js'),
      import('/src/workspace/project-data/project-data-contract.js'),
    ]);
    projectDataStore.update(
      'loadCalculation.gravityMPerS2',
      9.82,
      createEvidenceValue(9.82, { source: 'P7_SIMULATED_STALE_TRIGGER' }, true).evidence,
      true,
    );
  });
  await expect(host).toHaveAttribute('data-support-load-callout-count', '0');
  await expect(host.locator('[data-support-load-callout]')).toHaveCount(0);

  await page.locator('[data-action="clear-dataset"]').click();
  await expect(host.locator('[data-support-load-callout]')).toHaveCount(0);
  await expect(canvas).toHaveCount(1);
  await page.evaluate(() => globalThis.AnalysisWorkspace.destroy());
  await expect(page.locator('[data-support-load-callout-layer]')).toHaveCount(0);
  await expect(page.locator('.viewport-canvas')).toHaveCount(0);
  expect(pageErrors).toEqual([]);
});

function support(id, zoneId, lineId, center) {
  return {
    id,
    name: id,
    type: 'REST',
    sourcePath: `/${zoneId}/${lineId}/${id}`,
    sourceAttributes: {
      CENTER: center,
      ZONE: zoneId,
      LINE_ID: lineId,
      BRANCH_ID: `B-${lineId}`,
    },
  };
}

async function uploadJson(page, name, payload) {
  await page.locator('[data-role="dataset-file"]').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}
