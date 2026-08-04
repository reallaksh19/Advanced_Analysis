import { expect, test } from '@playwright/test';

const TOPIC = 'topologyEditSelection:changed';

test('trace live tree selection projection', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Application views' })
    .getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(20);

  await page.evaluate(async ({ topic }) => {
    const root = new URL('src/workspace/', document.baseURI);
    const [{ TreePanel }, { EventBus }, { TopologyEdit3DViewController }] = await Promise.all([
      import(new URL('tree-panel.js', root).href),
      import(new URL('event-bus.js', root).href),
      import(new URL('topology-edit-3d-professional-controller.js', root).href),
    ]);
    globalThis.__SELECTION_TRACE__ = [];
    globalThis.__SELECTION_EVENT_BUS__ = EventBus;

    const treePrototype = TreePanel.prototype;
    if (!treePrototype.__traceWrapped) {
      const apply = treePrototype.applyTopologyEditSelection;
      const mode = treePrototype.setTopologyEditSelectionActive;
      const destroy = treePrototype.destroy;
      treePrototype.applyTopologyEditSelection = function tracedApply(payload) {
        globalThis.__SELECTION_TRACE__.push({
          type: 'apply',
          ids: payload.workspaceEntityIds ?? [],
          primaryId: payload.primaryWorkspaceEntityId ?? null,
          rootConnected: this.rootElement?.isConnected ?? false,
          currentRoot: this.rootElement === document.querySelector('[data-panel="tree"]'),
          listenerCount: EventBus.listenerCount(topic),
        });
        return apply.call(this, payload);
      };
      treePrototype.setTopologyEditSelectionActive = function tracedMode(active) {
        globalThis.__SELECTION_TRACE__.push({
          type: 'mode',
          active,
          rootConnected: this.rootElement?.isConnected ?? false,
          currentRoot: this.rootElement === document.querySelector('[data-panel="tree"]'),
          listenerCount: EventBus.listenerCount(topic),
        });
        return mode.call(this, active);
      };
      treePrototype.destroy = function tracedDestroy() {
        globalThis.__SELECTION_TRACE__.push({
          type: 'destroy',
          rootConnected: this.rootElement?.isConnected ?? false,
          currentRoot: this.rootElement === document.querySelector('[data-panel="tree"]'),
          listenerCount: EventBus.listenerCount(topic),
        });
        return destroy.call(this);
      };
      Object.defineProperty(treePrototype, '__traceWrapped', { value: true });
    }

    const controllerPrototype = TopologyEdit3DViewController.prototype;
    if (!controllerPrototype.__traceWrapped) {
      const activate = controllerPrototype.activate;
      const changed = controllerPrototype.handleUnifiedSelectionChanged;
      controllerPrototype.activate = async function tracedActivate(...args) {
        globalThis.__SELECTION_CONTROLLER__ = this;
        globalThis.__SELECTION_TRACE__.push({
          type: 'controller-activate',
          sameBus: this.eventBus === EventBus,
          listenerCount: EventBus.listenerCount(topic),
        });
        return activate.apply(this, args);
      };
      controllerPrototype.handleUnifiedSelectionChanged = function tracedChanged(payload) {
        globalThis.__SELECTION_TRACE__.push({
          type: 'controller-changed',
          ids: payload.workspaceEntityIds ?? [],
          primaryId: payload.primaryWorkspaceEntityId ?? null,
          sameBus: this.eventBus === EventBus,
          listenerCount: EventBus.listenerCount(topic),
        });
        return changed.call(this, payload);
      };
      Object.defineProperty(controllerPrototype, '__traceWrapped', { value: true });
    }
  }, { topic: TOPIC });

  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await page.locator(
    '[data-role="tree-list"] [data-entity-id="P-001"][data-action="select-entity"]',
  ).click();
  await expect(host).toHaveAttribute('data-topology-edit-selection-ids', 'edge:P-001');
  await page.waitForTimeout(100);

  const state = await page.evaluate(({ topic }) => {
    const tree = document.querySelector('[data-panel="tree"]');
    const list = tree?.querySelector('[data-role="tree-list"]');
    const row = list?.querySelector('[data-entity-id="P-001"][data-action="select-entity"]');
    return {
      listenerCount: globalThis.__SELECTION_EVENT_BUS__?.listenerCount(topic) ?? null,
      controllerUsesGlobalBus:
        globalThis.__SELECTION_CONTROLLER__?.eventBus === globalThis.__SELECTION_EVENT_BUS__,
      treeRootCount: document.querySelectorAll('[data-panel="tree"]').length,
      treeWorkspaceIds: tree?.dataset.topologyEditSelectionWorkspaceIds ?? null,
      treePrimaryWorkspaceId: tree?.dataset.topologyEditSelectionPrimaryWorkspaceId ?? null,
      treeMultiselectable: list?.getAttribute('aria-multiselectable') ?? null,
      rowSelected: row?.getAttribute('aria-selected') ?? null,
      trace: globalThis.__SELECTION_TRACE__ ?? [],
    };
  }, { topic: TOPIC });

  throw new Error(`TOPOLOGY_EDIT_SELECTION_TRACE ${JSON.stringify(state)}`);
});
