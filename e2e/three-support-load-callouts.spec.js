import { expect, test } from '@playwright/test';

const SIMULATED_PACKAGE = {
  schema: 'rvm-selected-geometry-workspace-package/v1',
  packageHash: 'P7-SIMULATED-AUTHORIZED-WEBGL',
  geometry: {
    objects: [
      pipe('PIPE-A', 'ZONE-A', 'L-A', [0, 0, 0], [1000, 0, 0]),
      pipe('PIPE-B', 'ZONE-B', 'L-B', [0, 1000, 0], [1000, 1000, 0]),
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
    const base = '/Advanced_Analysis/src/';
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
        AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
      },
      { engineeringSupportLoadStore },
      { SupportLoadPresenter },
      { EventBus },
      { ENGINEERING_MODEL_EVENTS },
    ] = await Promise.all([
      import(`${base}core/shared-piping-model/canonical-json.js`),
      import(`${base}workspace/workspace-state.js`),
      import(`${base}workspace/engineering-model-store.js`),
      import(`${base}workspace/project-data/project-data-store.js`),
      import(`${base}workspace/project-data/project-data-contract.js`),
      import(`${base}workspace/master-data-controller.js`),
      import(`${base}workspace/engineering-loads/authorized-empirical-load-input.js`),
      import(`${base}workspace/engineering-loads/authorized-empirical-load-execution.js`),
      import(`${base}workspace/engineering-loads/engineering-support-load-store.js`),
      import(`${base}workspace/sequential-sketcher/support-load-presenter.js`),
      import(`${base}workspace/event-bus.js`),
      import(`${base}workspace/engineering-model-controller.js`),
    ]);

    const hashes = {
      lineList: '2'.repeat(64),
      pipingClass: '3'.repeat(64),
      componentWeight: '4'.repeat(64),
    };
    for (const [key, hash, name] of [
      ['lineList', hashes.lineList, '[SIMULATED] line list'],
      ['pipingClass', hashes.pipingClass, '[SIMULATED] piping class'],
      ['weight', hashes.componentWeight, '[SIMULATED] component weights'],
    ]) {
      masterDataController.setRawRows(key, [], name, 'Sheet1', {
        sourceHash: hash,
        byteLength: 0,
      });
    }

    const evidence = (value, source) => createEvidenceValue(value, { source }, true);
    const sourceEvidence = (value, sourceKey, sourceHash) => createEvidenceValue(
      value,
      { source: 'P7_SIMULATED_BROWSER_FIXTURE', sourceKey, sourceHash },
      true,
    );
    const initialSupportSiteModel = engineeringModelStore.getSupportSiteModel();
    const supportTypes = [...new Set(initialSupportSiteModel.sites.flatMap((site) => (
      site.assemblies.flatMap((assembly) => assembly.members.map((member) => member.sourceType))
    )))].sort();
    if (supportTypes.length === 0) throw new Error('P7 fixture has no canonical support source types.');

    const profile = structuredClone(projectDataStore.getProfile());
    Object.assign(profile, {
      projectId: 'PROJECT-P7-SIMULATED',
      revision: profile.revision + 1,
      updatedAt: '2026-08-04T16:40:00.000Z',
    });
    profile.sourcesAndUnits.lineListSource = sourceEvidence(
      { sha256: hashes.lineList }, 'lineList', hashes.lineList,
    );
    profile.sourcesAndUnits.pipingClassSource = sourceEvidence(
      { sha256: hashes.pipingClass }, 'pipingClass', hashes.pipingClass,
    );
    profile.sourcesAndUnits.componentWeightSource = sourceEvidence(
      { sha256: hashes.componentWeight }, 'componentWeight', hashes.componentWeight,
    );
    profile.topology.supportTypeCapabilities = evidence(
      Object.fromEntries(supportTypes.map((type) => [type, { vertical: true }])),
      'P7_SIMULATED_SUPPORT_POLICY',
    );
    profile.loadCalculation.gravityMPerS2 = evidence(9.81, 'P7_SIMULATED_LOAD_POLICY');
    profile.loadCalculation.loadFactor = evidence(1, 'P7_SIMULATED_LOAD_POLICY');
    profile.loadCalculation.equilibriumTolerances = evidence(
      { forceN: 1e-8, momentNmm: 1e-5 },
      'P7_SIMULATED_LOAD_POLICY',
    );
    profile.loadCalculation.activeLoadCases = evidence(['OPE'], 'P7_SIMULATED_LOAD_POLICY');
    projectDataStore.importProfile(profile, '[SIMULATED] P7 browser profile');

    const dataset = WorkspaceState.getSnapshot().dataset;
    const supportSiteModel = engineeringModelStore.getSupportSiteModel();
    const sourceRouteModel = engineeringModelStore.getRoutePartitionModel();
    const activeProfile = projectDataStore.getProfile();
    const masterData = masterDataController.getMasterData();
    if (!dataset?.sourceSha256 || !dataset.sharedModel) {
      throw new Error('P7 browser fixture did not materialize governed dataset hashes.');
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
    pipes.forEach((entity, index) => {
      sections[entity.lineKey] = {
        outsideDiameterMm: 100,
        wallThicknessMm: 5,
        materialCode: 'MAT-P7',
        insulationCode: 'INS-P7',
        insulationThicknessMm: 10,
      };
      operating[entity.lineKey] = 800;
      hydro[entity.lineKey] = 1000;
      lineBindings.push({
        targetId: `line:${String(index + 1).padStart(2, '0')}`,
        sourceRecordId: entity.sourceEntityId,
        lineKey: entity.lineKey,
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

    const edgeById = new Map(sourceRouteModel.edges.map((edge) => [edge.entityId, edge]));
    const routes = [];
    const edges = [];
    for (const entity of pipes) {
      const edge = edgeById.get(entity.entityId);
      const routeSites = supportSiteModel.sites.filter((site) => (
        site.assemblies.some((assembly) => assembly.lineKey === entity.lineKey)
      ));
      if (!edge || routeSites.length !== 2) {
        throw new Error(`P7 exact route fixture unresolved for ${entity.entityId}: edge=${Boolean(edge)}, sites=${routeSites.length}.`);
      }
      const lengthMm = edge.lengthMm;
      edges.push(edge);
      routes.push({
        routeId: `P7-QUALIFIED:${entity.entityId}`,
        status: 'READY',
        blockers: [],
        physicalEdgeIds: [entity.entityId],
        entityChainages: [{
          entityId: entity.entityId,
          startMm: 0,
          endMm: lengthMm,
          pointMm: lengthMm / 2,
          sourceStartChainageMm: 0,
          sourceEndChainageMm: lengthMm,
        }],
      });
    }
    const qualifiedRouteModel = {
      schema: 'route-partition-model/v1',
      status: 'READY',
      routes,
      edges,
    };
    const execution = engineeringSupportLoadStore.calculateAuthorized({
      schema: AUTHORIZED_EMPIRICAL_LOAD_EXECUTION_REQUEST_SCHEMA,
      executionId: 'EXECUTION-P7-SIMULATED',
      executedAt: '2026-08-04T16:43:00.000Z',
      authorizedInput,
      dataset,
      profile: activeProfile,
      supportSiteModel,
      routePartitionModel: qualifiedRouteModel,
      masterData,
    });
    if (execution.status !== 'CALCULATED') {
      throw new Error(`P7 authorized execution blocked: ${JSON.stringify(execution.distribution)}`);
    }
    EventBus.publish(ENGINEERING_MODEL_EVENTS.CHANGED, { reason: 'P7_AUTHORIZED_EXECUTION' });

    const exactSite = supportSiteModel.sites.find((site) => site.primaryEntityId === 'SUP-A1');
    const exactEntity = dataset.entities.find((entity) => entity.entityId === exactSite.primaryEntityId);
    const callout = new SupportLoadPresenter().getResultCallouts(exactEntity)[0];
    return {
      executionStatus: execution.status,
      executionSemanticHash: execution.semanticHash,
      siteId: exactSite.siteId,
      primaryEntityId: exactSite.primaryEntityId,
      label: callout.label,
      resultKind: callout.resultKind,
      allSiteCount: supportSiteModel.sites.length,
      sourceTypes: supportTypes,
    };
  });

  expect(qualified.executionStatus).toBe('CALCULATED');
  expect(qualified.executionSemanticHash).toMatch(/^fnv1a64:/);
  expect(qualified.resultKind).toBe('EMPIRICAL_SUPPORT_REACTION');
  expect(qualified.allSiteCount).toBe(4);
  expect(qualified.sourceTypes.length).toBeGreaterThan(0);
  const exactCallout = host.locator(`[data-support-load-object-id="${qualified.primaryEntityId}"]`);
  await expect(exactCallout).toHaveCount(1);
  await expect(exactCallout).toHaveText(qualified.label);
  await expect(exactCallout).toBeVisible();
  await expect(host).toHaveAttribute('data-support-load-callout-count', '4');
  expect(await exactCallout.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe('none');
  const renderableBefore = await host.getAttribute('data-renderable-count');
  const screenBefore = await exactCallout.evaluate((element) => ({
    hidden: element.hidden,
    left: element.style.left,
    top: element.style.top,
  }));

  await page.locator('[data-viewport-action="view-right"]').click();
  await expect(host).toHaveAttribute('data-view-command', 'right');
  const screenAfterRight = await exactCallout.evaluate((element) => ({
    hidden: element.hidden,
    left: element.style.left,
    top: element.style.top,
  }));
  expect(
    screenAfterRight.hidden
      || screenAfterRight.left !== screenBefore.left
      || screenAfterRight.top !== screenBefore.top,
  ).toBe(true);
  await expect(canvas).toHaveCount(1);
  await expect(host).toHaveAttribute('data-renderable-count', renderableBefore);

  await page.locator('[data-viewport-action="view-iso"]').click();
  await expect(host).toHaveAttribute('data-view-command', 'iso');
  await expect(exactCallout).toBeVisible();
  await page.locator('[data-viewport-action="toggle-projection"]').click();
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect(exactCallout).toBeVisible();
  await expect(canvas).toHaveCount(1);

  await page.locator('[data-role="model-zone-selector"]').selectOption('ZONE-A');
  await expect(host).toHaveAttribute('data-support-load-callout-count', '2');
  await expect(exactCallout).toHaveCount(1);
  await expect(host.locator('[data-support-load-object-id="SUP-B1"]')).toHaveCount(0);

  await page.evaluate(async () => {
    const base = '/Advanced_Analysis/src/workspace/';
    const [
      { engineeringSupportLoadStore },
      { EventBus },
      { ENGINEERING_MODEL_EVENTS },
    ] = await Promise.all([
      import(`${base}engineering-loads/engineering-support-load-store.js`),
      import(`${base}event-bus.js`),
      import(`${base}engineering-model-controller.js`),
    ]);
    engineeringSupportLoadStore.markStale('P7_SIMULATED_STALE_TRIGGER', null);
    EventBus.publish(ENGINEERING_MODEL_EVENTS.CHANGED, { reason: 'P7_STALE' });
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

function pipe(id, zoneId, lineId, startPoint, endPoint) {
  return {
    id,
    name: id,
    type: 'PIPE',
    sourcePath: `/${zoneId}/${lineId}/${id}`,
    sourceAttributes: {
      ZONE: zoneId,
      LINE_ID: lineId,
      BRANCH_ID: `B-${lineId}`,
    },
    nativeParams: { startPoint, endPoint },
  };
}

function support(id, zoneId, lineId, center) {
  return {
    id,
    name: id,
    type: 'REST',
    sourcePath: `/${zoneId}/${lineId}/${id}`,
    sourceAttributes: {
      CENTER: center,
      SUPPORT_TYPE: 'REST',
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
