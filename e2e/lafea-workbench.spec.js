import { expect, test } from '@playwright/test';

const HOST_URL = '/e2e/fixtures/lafea-guided-workbench.html';
const CONTROLLER_URL = '/src/workspace/lafea-workbench-controller.js';
const MOCK_URL = '/src/workspace/advanced-mock-data.js';

const destroyWorkbench = async (page) => page.evaluate(() => {
  globalThis.__LAFEA_GUIDED_BROWSER__?.controller?.destroy?.();
  delete globalThis.__LAFEA_GUIDED_BROWSER__;
}).catch(() => {});

test.afterEach(async ({ page }) => destroyWorkbench(page));

test('guided standalone LAFEA workbench mounts with the complete canonical flow', async ({ page }) => {
  const context = await mountWorkbench(page, 'LAFEA.1', true);
  expect(context).toMatchObject({ stageId: 'LAFEA.1', status: 'READY' });
  const workbench = page.locator('[data-role="lafea-workbench"]');
  await expect(workbench).toHaveCount(1);
  await expect(workbench.locator('.lafea-workbench__stages [data-stage-id]')).toHaveCount(6);
  await expect(workbench.locator('[data-role="lafea-guided-workflow"] li')).toHaveCount(11);
  await expect(workbench).toContainText('Release: NOT QUALIFIED');
  await expect(workbench).toContainText('Authorization: BLOCKED');
  await expect(workbench).toContainText('Discretization');
});

test('analytical mesh bypass does not bypass canonical preparation and authorization', async ({ page }) => {
  await mountWorkbench(page, 'LAFEA.1', true);
  const workbench = page.locator('[data-role="lafea-workbench"]');
  await expect(workbench.locator('[data-role="lafea-discretization-state"]')).toHaveText('NOT_APPLICABLE');
  await expect(workbench.locator('[data-role="lafea-run"]')).toBeDisabled();
  await expect(workbench).toContainText('CANONICAL_MODEL_NOT_CURRENT');
  const state = await page.evaluate(() => {
    const current = globalThis.__LAFEA_GUIDED_BROWSER__.controller.getState();
    const stage = current.stages['LAFEA.1'];
    return {
      discretization: stage.orchestration.sections.DISCRETIZATION.state,
      authorization: stage.orchestration.sections.AUTHORIZATION.state,
      execution: stage.execution,
    };
  });
  expect(state).toEqual({
    discretization: 'COMPLETE',
    authorization: 'BLOCKED',
    execution: null,
  });
});

test('LAFEA.3 discretization is fail-closed without current retained mesh evidence', async ({ page }) => {
  await mountWorkbench(page, 'LAFEA.3', true);
  const workbench = page.locator('[data-role="lafea-workbench"]');
  await expect(workbench.locator('[data-role="lafea-discretization"]')).toBeVisible();
  await expect(workbench.locator('[data-role="lafea-discretization-state"]')).toHaveText('ABSENT');
  await expect(workbench).toContainText('QUALIFIED_MESH_PRODUCER_NOT_AVAILABLE');
  await expect(workbench).toContainText('NO_ENGINEERING_EFFECT');
  await expect(workbench.locator('[data-role="lafea-run"]')).toBeDisabled();
  await expect(workbench.locator('[data-role="lafea-discretization-advance"]')).toBeDisabled();
});

test('LAFEA.6 remains a visible fail-closed non-calculating placeholder', async ({ page }) => {
  await mountWorkbench(page, 'LAFEA.1', false);
  const workbench = page.locator('[data-role="lafea-workbench"]');
  await workbench.getByRole('button', { name: /LAFEA\.6 Weld profile/u }).click();
  const run = workbench.locator('[data-role="lafea-run"]');
  await expect(run).toBeDisabled();
  await expect(run).toHaveText('Calculation not implemented');
  await expect(workbench).toContainText('UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED');
  await expect(workbench).toContainText(
    'No qualified weld schema, calculator, result validator or benchmark manifest',
  );
  await expect(workbench.locator('[data-role="lafea-result"]')).toHaveCount(0);
});

test('malformed standalone source fails closed without execution or result', async ({ page }) => {
  await mountWorkbench(page, 'LAFEA.1', false);
  const failure = await page.evaluate(() => {
    const controller = globalThis.__LAFEA_GUIDED_BROWSER__.controller;
    const state = controller.importDocument({ schema: 'forged' }, 'LAFEA.1');
    return {
      status: state.status,
      diagnosticCodes: state.diagnostics.map((row) => row.code),
      execution: state.stages['LAFEA.1'].execution,
    };
  });
  expect(failure.status).toBe('FAILED');
  expect(failure.diagnosticCodes.length).toBeGreaterThan(0);
  expect(failure.execution).toBeNull();
  const workbench = page.locator('[data-role="lafea-workbench"]');
  await expect(workbench.locator('.lafea-workbench__status')).toHaveText('FAILED');
  await expect(workbench.locator('[data-role="lafea-result"]')).toHaveCount(0);
});

test('retained mesh overlay focuses an exact canonical element ID', async ({ page }) => {
  await page.goto(HOST_URL);
  const result = await page.evaluate(async () => {
    const { renderLafeaRetainedMeshOverlay, focusLafeaRetainedMeshElement } = await import(
      '/src/workspace/lafea-canvas/retained-mesh-overlay.js'
    );
    const host = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.append(svg);
    document.body.replaceChildren(host);
    renderLafeaRetainedMeshOverlay({
      target: host,
      evidence: {
        mesh: {
          nodes: [
            { nodeId: 'N1', x: 0, y: 0 },
            { nodeId: 'N2', x: 10, y: 0 },
            { nodeId: 'N3', x: 0, y: 10 },
          ],
          elements: [{ elementId: 'E7', nodeIds: ['N1', 'N2', 'N3'] }],
        },
        quality: { warningElementIds: ['E7'], blockingElementIds: [] },
      },
      viewport: {
        cssWidth: 400,
        cssHeight: 300,
        worldBounds: { minimum: { x: 0, y: 0 }, maximum: { x: 10, y: 10 } },
      },
      custodyState: 'CURRENT_WARNING',
    });
    const found = focusLafeaRetainedMeshElement(host, 'E7');
    const focused = host.querySelector('[data-mesh-element-id="E7"]');
    return {
      found,
      id: focused?.dataset.meshElementId ?? null,
      warning: focused?.classList.contains('lafea-retained-mesh__element--warning') ?? false,
      focused: focused?.classList.contains('lafea-retained-mesh__element--focused') ?? false,
    };
  });
  expect(result).toEqual({ found: true, id: 'E7', warning: true, focused: true });
});

async function mountWorkbench(page, stageId, importMock) {
  await page.goto(HOST_URL);
  return page.evaluate(async ({ controllerUrl, mockUrl, selectedStageId, shouldImport }) => {
    const [{ LafeaWorkbenchController }, { createLafeaMockDocument }] = await Promise.all([
      import(controllerUrl),
      import(mockUrl),
    ]);
    const root = document.querySelector('#lafea-guided-browser-host');
    const controller = new LafeaWorkbenchController(root);
    controller.init();
    controller.store.selectStage(selectedStageId);
    if (shouldImport) {
      controller.importDocument(createLafeaMockDocument(selectedStageId), selectedStageId);
    }
    globalThis.__LAFEA_GUIDED_BROWSER__ = { controller };
    const state = controller.getState();
    return { stageId: state.activeStageId, status: state.status };
  }, {
    controllerUrl: CONTROLLER_URL,
    mockUrl: MOCK_URL,
    selectedStageId: stageId,
    shouldImport: importMock,
  });
}
