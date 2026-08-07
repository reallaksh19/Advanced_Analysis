import { LfeaWorkbenchController } from '../../src/workspace/lfea-workbench-controller.js';
import { renderWorkspaceLayout } from '../../src/workspace/workspace-layout.js';

const root = document.getElementById('root');
if (!root) throw new Error('UI-1 embedded harness root #root was not found.');

renderWorkspaceLayout(root);
const lfeaView = requireUnique(root, '[data-application-view="LFEA"]');
const lfeaRoot = requireUnique(root, '[data-role="lfea-consumer-root"]');
const navigation = requireUnique(root, '[data-role="application-navigation"]');
const navButton = document.createElement('button');
navButton.type = 'button';
navButton.dataset.applicationNav = 'LFEA';
navButton.textContent = 'LFEA';
navButton.addEventListener('click', () => showLfea(root, lfeaView));
navigation.append(navButton);

const controller = new LfeaWorkbenchController(lfeaRoot, undefined).init();

globalThis.AnalysisWorkspace = Object.freeze({
  getLfeaWorkbenchState: () => controller.getState(),
  destroy: () => controller.destroy(),
});

if (import.meta.hot) {
  import.meta.hot.dispose(() => controller.destroy());
}

function showLfea(shellRoot, target) {
  shellRoot.querySelectorAll('[data-application-view]').forEach((view) => {
    const active = view === target;
    view.hidden = !active;
    view.setAttribute('aria-hidden', String(!active));
  });
}

function requireUnique(scope, selector) {
  const values = scope.querySelectorAll(selector);
  if (values.length !== 1) {
    throw new Error(`UI-1 embedded harness requires exactly one ${selector}; found ${values.length}.`);
  }
  return values[0];
}
