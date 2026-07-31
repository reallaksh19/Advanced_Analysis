import { expect, test } from '@playwright/test';

const FIXTURE_URL = '/e2e/fixtures/lafea-hybrid-workbench-fixture.js';

test.describe('LAFEA hybrid workbench Phase 6 browser validation', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      globalThis.__LAFEA_HC_BROWSER__?.controller?.destroy?.();
      delete globalThis.__LAFEA_HC_BROWSER__;
    }).catch(() => {});
  });

  test('HC-UI-01: simulated source-authoring scene uses SVG and clears WebGL', async ({ page }) => {
    const context = await mountScenario(page, 'mountHcSourceAuthoring');
    expect(context).toMatchObject({
      stageId: 'LAFEA.3',
      mode: 'SOURCE_AUTHORING',
      status: 'BLOCKED',
    });

    const liveRoot = page.locator('[data-live-viewport-mode="SOURCE_AUTHORING"]');
    await expect(liveRoot).toHaveCount(1);
    await expect(liveRoot.locator('.lafea-viewport[data-renderer="SVG"]')).toHaveCount(1);
    await expect(liveRoot.locator('svg[data-layer="engineering-overlay"]')).toHaveCount(1);
    await expect(liveRoot.locator('[data-node-id]')).toHaveCount(3);
    await expect(liveRoot.locator('[data-element-id="E1"]')).toHaveCount(1);
    await expect(liveRoot.locator('[data-role="lafea-live-result-blocked-status"]')).toContainText(
      'LAFEA_RENDER_PACKET_NOT_SUPPLIED',
    );

    const canvasReady = await liveRoot.locator('canvas[data-layer="webgl"]').evaluate(
      (canvas) => canvas.dataset.ready ?? null,
    );
    expect(canvasReady).not.toBe('true');
    await expect(liveRoot.locator('[data-result-field-id]')).toHaveCount(0);
  });

  test('HC-UI-02: simulated qualified dense mesh uses WebGL with SVG overlay retained', async ({ page }) => {
    const context = await mountScenario(page, 'mountHcQualifiedResult');
    expect(context).toMatchObject({
      stageId: 'LAFEA.3',
      mode: 'QUALIFIED_RESULT',
      status: 'READY',
    });

    const liveRoot = page.locator('[data-live-viewport-mode="QUALIFIED_RESULT"]');
    await expect(liveRoot).toHaveCount(1);
    const resultRoot = liveRoot.locator(
      '.lafea-viewport[data-result-status="READY"][data-result-renderer="THREE_WEBGL"]',
    );
    await expect(resultRoot).toHaveCount(1);
    await expect(resultRoot).toHaveAttribute('data-renderer', 'THREE_WEBGL');
    await expect(resultRoot).toHaveAttribute('data-result-field-id', 'HC-UI-FIELD');
    await expect(resultRoot.locator('canvas[data-layer="webgl"]')).toHaveAttribute(
      'data-ready',
      'true',
    );
    await expect(resultRoot.locator('svg[data-layer="engineering-overlay"]')).toHaveCount(1);
    await expect(resultRoot.locator('[data-node-id]')).toHaveCount(3);
    await expect(resultRoot.locator('[data-element-id="E1"]')).toHaveCount(1);
    await expect(resultRoot.locator('[data-role="lafea-result-display-status"]')).toContainText(
      'Result display READY: HC-UI-FIELD',
    );
  });

  test('HC-UI-06: simulated WebGL loss enters explicit blocked SVG state', async ({ page }) => {
    await mountScenario(page, 'mountHcQualifiedResult');
    const liveRoot = page.locator('[data-live-viewport-mode="QUALIFIED_RESULT"]');
    const resultRoot = liveRoot.locator('.lafea-viewport');
    await expect(resultRoot).toHaveAttribute('data-result-status', 'READY');

    await page.evaluate(async (fixtureUrl) => {
      const fixture = await import(fixtureUrl);
      fixture.triggerHcWebglLoss(globalThis.__LAFEA_HC_BROWSER__.controller);
    }, FIXTURE_URL);

    await expect(resultRoot).toHaveAttribute('data-result-status', 'BLOCKED');
    await expect(resultRoot).toHaveAttribute('data-result-renderer', 'SVG');
    await expect(resultRoot).toHaveAttribute(
      'data-result-blocking-reasons',
      /LAFEA_HYBRID_RESULT_WEBGL_CONTEXT_LOST/u,
    );
    await expect(resultRoot.locator('canvas[data-layer="webgl"]')).toHaveAttribute(
      'data-ready',
      'false',
    );
    await expect(resultRoot.locator('svg[data-layer="engineering-overlay"]')).toHaveCount(1);
    await expect(resultRoot.locator('[data-node-id]')).toHaveCount(3);
    await expect(resultRoot.locator('[data-role="lafea-result-display-status"]')).toContainText(
      'Result display BLOCKED',
    );
  });
});

async function mountScenario(page, exportName) {
  await page.goto('/');
  return page.evaluate(async ({ fixtureUrl, exportName: selectedExport }) => {
    const fixture = await import(fixtureUrl);
    const root = document.createElement('main');
    root.id = 'lafea-hybrid-browser-root';
    document.body.replaceChildren(root);
    const mounted = fixture[selectedExport](root);
    return mounted.context;
  }, { fixtureUrl: FIXTURE_URL, exportName });
}
