import { expect, test } from '@playwright/test';

const CONTROLLER_KEY = '__TOPOLOGY_EDIT_RAY_SCAN_CONTROLLER__';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('scan the full production canvas with the raycaster fallback', async ({ page }) => {
  await openProductionController(page);
  const scan = await page.evaluate((key) => {
    const backend = globalThis[key]?.viewportBackend;
    const canvas = backend?.renderer?.domElement;
    if (!backend || !canvas) throw new Error('Ray scan context is unavailable.');
    const rect = canvas.getBoundingClientRect();
    const identities = new Map();
    let exactPoint = null;
    let sampled = 0;
    for (let y = rect.top + 2; y < rect.bottom; y += 4) {
      for (let x = rect.left + 2; x < rect.right; x += 4) {
        sampled += 1;
        const context = backend.pickContext(x, y);
        const pick = context ? backend.pickWithRaycaster(context.pointer) : null;
        if (!pick?.objectId) continue;
        const keyValue = `${pick.objectKind}:${pick.objectId}:${pick.modelRole}`;
        identities.set(keyValue, (identities.get(keyValue) ?? 0) + 1);
        if (!exactPoint && pick.objectId === 'edge:P-001') exactPoint = { x, y, pick };
      }
    }
    const directPick = exactPoint ? backend.pickAt(exactPoint.x, exactPoint.y) : null;
    return {
      canvas: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      sampled,
      identityCount: identities.size,
      identities: [...identities.entries()].sort(([left], [right]) => left.localeCompare(right)),
      exactPoint,
      directPick,
      pickableGroupChildren: backend.pickableGroups().map((group) => ({
        name: group.name,
        visible: group.visible,
        children: group.children.length,
      })),
    };
  }, CONTROLLER_KEY);
  console.log(`TOPOLOGY_EDIT_RAY_SCAN ${JSON.stringify(scan)}`);
  expect(scan.identityCount, JSON.stringify(scan, null, 2)).toBeGreaterThan(0);
  expect(scan.exactPoint, JSON.stringify(scan, null, 2)).not.toBeNull();
  expect(scan.directPick?.objectId, JSON.stringify(scan, null, 2)).toBe('edge:P-001');
});

async function openProductionController(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Application views' })
    .getByRole('button', { name: 'Workspace', exact: true }).click();
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
    if (!prototype.__rayScanActivateWrapped) {
      const activate = prototype.activate;
      prototype.activate = async function rayScanActivate(...args) {
        globalThis[key] = this;
        return activate.apply(this, args);
      };
      Object.defineProperty(prototype, '__rayScanActivateWrapped', {
        value: true,
        configurable: true,
      });
    }
  }, CONTROLLER_KEY);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  await expect(page.locator('[data-role="topology-edit-render-host"]')).toBeVisible();
  await expect.poll(() => page.evaluate((key) => (
    globalThis[key]?.viewportBackend?.constructor?.name ?? ''
  ), CONTROLLER_KEY)).toContain('NavigationHud');
}
