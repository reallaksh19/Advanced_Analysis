import { expect, test } from '@playwright/test';

const FIXTURE_URL =
  '/Advanced_Analysis/e2e/fixtures/first-cut-workbench-launcher-fixture.js';

test.describe('First-cut workbench Phase 5 launcher', () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      globalThis.__FIRST_CUT_LAUNCHER_BROWSER__?.controller?.destroy?.();
      delete globalThis.__FIRST_CUT_LAUNCHER_BROWSER__;
    }).catch(() => {});
  });

  test('focus and popout retain one existing governed workbench host', async ({ page }) => {
    await page.goto('/');
    const context = await page.evaluate(async (fixtureUrl) => {
      const fixture = await import(fixtureUrl);
      const root = document.createElement('main');
      root.id = 'first-cut-launcher-browser-root';
      document.body.replaceChildren(root);
      return fixture.mountFirstCutLauncherFixture(root).context;
    }, FIXTURE_URL);

    expect(context).toMatchObject({
      hostIdentity: 'FIRST-CUT-WORKBENCH-HOST-1',
      workbenchCount: 1,
      launcherCount: 1,
      launcherState: {
        status: 'READY',
        focusCount: 0,
        popoutCount: 0,
      },
    });

    const root = page.locator('#first-cut-launcher-browser-root');
    await expect(root.locator('[data-role="first-cut-workbench"]')).toHaveCount(1);
    await expect(root.locator('[data-role="first-cut-workbench-launcher"]')).toHaveCount(1);
    const originalHost = root.locator(
      '[data-role="first-cut-workbench-root"]'
        + '[data-fixture-identity="FIRST-CUT-WORKBENCH-HOST-1"]',
    );
    await expect(originalHost).toHaveCount(1);

    const propertiesPanel = root.locator('.properties-panel');
    await propertiesPanel.locator(
      '[data-action="toggle-properties-collapse"]',
    ).click();
    await expect(propertiesPanel).toHaveClass(/workspace-panel--collapsed/u);
    await root.locator('[data-role="first-cut-workbench-focus"]').click();

    let state = await browserState(page);
    expect(state).toMatchObject({
      hostIdentity: 'FIRST-CUT-WORKBENCH-HOST-1',
      hostConnected: true,
      workbenchCount: 1,
      launcherCount: 1,
      sectionCollapsed: false,
      propertiesCollapsed: false,
      poppedOut: false,
      launcherState: {
        status: 'READY',
        focusCount: 1,
        popoutCount: 0,
        lastMode: 'FOCUS',
      },
    });
    await expect(propertiesPanel).not.toHaveClass(/workspace-panel--collapsed/u);
    await expect(originalHost).toBeFocused();

    await root.locator('[data-role="first-cut-workbench-popout"]').click();
    state = await browserState(page);
    expect(state).toMatchObject({
      hostIdentity: 'FIRST-CUT-WORKBENCH-HOST-1',
      hostConnected: true,
      workbenchCount: 1,
      launcherCount: 1,
      poppedOut: true,
      popupVisible: true,
      launcherState: {
        status: 'READY',
        focusCount: 1,
        popoutCount: 1,
        lastMode: 'POPOUT',
        poppedOut: true,
      },
    });
    await expect(originalHost).toHaveCount(1);
    await expect(originalHost).toBeFocused();
    await expect(root.locator('[data-role="panel-popup-body"] [data-role="first-cut-workbench"]'))
      .toHaveCount(1);
    await expect(root.locator('[data-role="first-cut-workbench"]')).toContainText(
      'First-Cut Piping Load Estimation',
    );
    await expect(root.locator('[data-role="first-cut-workbench"]')).toContainText(
      'Thermal, guide, line-stop, anchor, nozzle, contact and code compliance require LFEA',
    );
  });
});

async function browserState(page) {
  return page.evaluate(async (fixtureUrl) => {
    const fixture = await import(fixtureUrl);
    return fixture.getFirstCutLauncherBrowserState(
      document.querySelector('#first-cut-launcher-browser-root'),
    );
  }, FIXTURE_URL);
}
