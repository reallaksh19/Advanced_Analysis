import { expect, test } from '@playwright/test';

const CONTROLLER_KEY = '__TOPOLOGY_EDIT_COMPONENT_HUD_CONTROLLER__';

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('flange, valve, and reducer selections expose distinct governed HUD schemas', async ({ page }) => {
  const host = await openController(page);
  await openPanel(host, 'topology-edit-professional-operation');

  const flangeId = await canonicalEdgeForComponent(page, 'F-001');
  await selectBySearch(page, host, flangeId);
  await expect(host).toHaveAttribute('data-topology-edit-component-hud-type', 'FLANGE');
  await expect(host).toHaveAttribute('data-topology-edit-component-hud-status', 'AMBIGUOUS');
  await expect(host).toHaveAttribute('data-topology-edit-component-hud-candidate-count', '2');
  await expect(hud(page)).toHaveAttribute('data-component-type', 'FLANGE');
  await expect(hud(page).locator('[data-field-key="flangeClass"]')).toHaveCount(1);
  await expect(hud(page).locator('[data-field-key="flangeFacing"]')).toHaveCount(1);
  await expect(hud(page).locator('[data-field-key="valveType"]')).toHaveCount(0);
  await expect(nonEmptyCatalogueOptions(page)).toHaveCount(2);

  const valveId = await canonicalEdgeForComponent(page, 'V-001');
  await selectBySearch(page, host, valveId);
  await expect(host).toHaveAttribute('data-topology-edit-component-hud-type', 'VALVE');
  await expect(host).toHaveAttribute('data-topology-edit-component-hud-status', 'RESOLVED');
  await expect(host).toHaveAttribute('data-topology-edit-component-hud-candidate-count', '1');
  await expect(host).toHaveAttribute(
    'data-topology-edit-component-hud-recommended-record-id',
    'VALVE-DN100-GATE-600-A',
  );
  await expect(hud(page).locator('[data-field-key="valveType"]')).toContainText('GATE');
  await expect(hud(page).locator('[data-field-key="valveFaceToFaceMm"]')).toContainText('600 mm');
  await expect(hud(page).locator('[data-field-key="flangeClass"]')).toHaveCount(0);
  await expect(nonEmptyCatalogueOptions(page)).toHaveCount(1);
  await expect(page.locator('[data-role="professional-catalogue-record"]')).toHaveValue(
    'VALVE-DN100-GATE-600-A',
  );

  const reducerId = await canonicalEdgeForComponent(page, 'R-001');
  await selectBySearch(page, host, reducerId);
  await expect(host).toHaveAttribute('data-topology-edit-component-hud-type', 'REDUCER');
  await expect(host).toHaveAttribute('data-topology-edit-component-hud-status', 'RESOLVED');
  await expect(hud(page).locator('[data-field-key="secondaryNominalSizeMm"]')).toContainText('100 mm');
  await expect(hud(page).locator('[data-field-key="reducerType"]')).toContainText('CONCENTRIC');
  await expect(hud(page).locator('[data-field-key="reducerOrientation"]')).toContainText('CONCENTRIC');
  await expect(hud(page).locator('[data-field-key="valveType"]')).toHaveCount(0);
  await expect(hud(page).locator('[data-field-key="flangeFacing"]')).toHaveCount(0);
  await expect(nonEmptyCatalogueOptions(page)).toHaveCount(1);
});

async function openController(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(20);

  await page.evaluate(async (key) => {
    const moduleUrl = new URL(
      'src/workspace/topology-edit-3d-professional-controller.js',
      document.baseURI,
    ).href;
    const { TopologyEdit3DViewController } = await import(moduleUrl);
    const prototype = TopologyEdit3DViewController.prototype;
    if (prototype.__componentHudActivateWrapped) return;
    const activate = prototype.activate;
    prototype.activate = async function componentHudActivate(...args) {
      globalThis[key] = this;
      return activate.apply(this, args);
    };
    Object.defineProperty(prototype, '__componentHudActivateWrapped', {
      value: true,
      configurable: true,
    });
  }, CONTROLLER_KEY);

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect.poll(() => host.getAttribute('data-topology-edit-professional-catalogue-hash'))
    .not.toBe('');
  return host;
}

async function canonicalEdgeForComponent(page, componentKey) {
  return page.evaluate(({ key, component }) => {
    const edge = globalThis[key]?.session?.currentTopology?.()?.edges
      ?.find((row) => row.componentKey === component);
    if (!edge) throw new Error(`Canonical edge for ${component} is unavailable.`);
    return edge.id;
  }, { key: CONTROLLER_KEY, component: componentKey });
}

async function selectBySearch(page, host, canonicalId) {
  await openPanel(host, 'topology-edit-canonical-search');
  const input = page.locator('[data-role="topology-edit-search-input"]');
  await input.fill(canonicalId);
  const result = page.locator(`[data-search-canonical-id="${canonicalId}"]`);
  await expect(result).toHaveCount(1);
  await result.click();
}

async function openPanel(host, kind) {
  const panel = host.locator(`details[data-panel-kind="${kind}"]`);
  if (!(await panel.evaluate((element) => element.open))) {
    await panel.locator(':scope > summary').click();
  }
  return panel;
}

function hud(page) {
  return page.locator('[data-role="topology-edit-component-hud"]');
}

function nonEmptyCatalogueOptions(page) {
  return page.locator('[data-role="professional-catalogue-record"] option:not([value=""])');
}
