import { FirstCutWorkbenchController } from '../../src/workspace/enrichment/first-cut-workbench-controller.js';
import { FirstCutWorkbenchLauncherController } from '../../src/workspace/enrichment/first-cut-workbench-launcher.js';
import { renderWorkspaceLayout } from '../../src/workspace/workspace-layout.js';
import { WorkspaceShellController } from '../../src/workspace/workspace-shell-controller.js';

export const FIRST_CUT_LAUNCHER_BROWSER_FIXTURE_SCHEMA =
  'first-cut-workbench-launcher-browser-fixture/v1';

export function mountFirstCutLauncherFixture(rootElement) {
  if (!rootElement?.ownerDocument) {
    throw new TypeError('FIRST_CUT_LAUNCHER_BROWSER_ROOT_REQUIRED');
  }
  rootElement.ownerDocument.defaultView?.localStorage?.removeItem(
    'workspace-layout-prefs',
  );
  renderWorkspaceLayout(rootElement);
  const eventBus = createEventBus();
  const workspaceState = createIdleWorkspaceState();
  const shellController = new WorkspaceShellController(rootElement);
  const host = requireUnique(
    rootElement,
    '[data-role="first-cut-workbench-root"]',
  );
  host.dataset.fixtureIdentity = 'FIRST-CUT-WORKBENCH-HOST-1';
  const browserWindow = rootElement.ownerDocument.defaultView;
  const workbenchController = new FirstCutWorkbenchController(
    host,
    eventBus,
    workspaceState,
    rootElement.ownerDocument,
    browserWindow?.navigator?.clipboard,
    browserWindow?.URL,
  );
  const launcherController = new FirstCutWorkbenchLauncherController(rootElement);

  shellController.init();
  workbenchController.init();
  launcherController.init();

  const fixture = Object.freeze({
    schema: FIRST_CUT_LAUNCHER_BROWSER_FIXTURE_SCHEMA,
    controller: Object.freeze({
      shellController,
      workbenchController,
      launcherController,
      destroy() {
        launcherController.destroy();
        workbenchController.destroy();
        shellController.destroy();
      },
    }),
    context: Object.freeze({
      hostIdentity: host.dataset.fixtureIdentity,
      workbenchCount: rootElement.querySelectorAll(
        '[data-role="first-cut-workbench"]',
      ).length,
      launcherCount: rootElement.querySelectorAll(
        '[data-role="first-cut-workbench-launcher"]',
      ).length,
      launcherState: launcherController.getState(),
    }),
  });
  globalThis.__FIRST_CUT_LAUNCHER_BROWSER__ = fixture;
  return fixture;
}

export function getFirstCutLauncherBrowserState(rootElement) {
  const fixture = globalThis.__FIRST_CUT_LAUNCHER_BROWSER__;
  const host = requireUnique(
    rootElement,
    '[data-role="first-cut-workbench-root"]',
  );
  const section = requireUnique(rootElement, '[data-section-id="first-cut"]');
  return Object.freeze({
    hostIdentity: host.dataset.fixtureIdentity,
    hostConnected: host.isConnected,
    workbenchCount: rootElement.querySelectorAll(
      '[data-role="first-cut-workbench"]',
    ).length,
    launcherCount: rootElement.querySelectorAll(
      '[data-role="first-cut-workbench-launcher"]',
    ).length,
    sectionCollapsed: section.classList.contains('accordion-collapsed'),
    propertiesCollapsed: rootElement.querySelector('.properties-panel')
      ?.classList.contains('workspace-panel--collapsed') ?? null,
    poppedOut: section.classList.contains('is-popped-out'),
    popupVisible: rootElement.querySelector('[data-role="panel-popup-overlay"]')
      ?.style.display === 'flex',
    launcherState: fixture.controller.launcherController.getState(),
  });
}

function createEventBus() {
  const listeners = new Map();
  return Object.freeze({
    subscribe(topic, listener) {
      const rows = listeners.get(topic) ?? new Set();
      rows.add(listener);
      listeners.set(topic, rows);
      return () => rows.delete(listener);
    },
    publish(topic, payload) {
      for (const listener of [...(listeners.get(topic) ?? [])]) listener(payload);
    },
  });
}

function createIdleWorkspaceState() {
  const snapshot = Object.freeze({
    status: 'idle',
    dataset: null,
    selectedEntityId: null,
    version: 0,
  });
  return Object.freeze({ getSnapshot: () => snapshot });
}

function requireUnique(root, selector) {
  const matches = root.querySelectorAll(selector);
  if (matches.length !== 1) {
    throw new TypeError(`Expected one ${selector}; found ${matches.length}.`);
  }
  return matches[0];
}
