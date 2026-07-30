/**
 * LFEA SVG Workbench Composition
 * Lifecycle composition for LFEA SVG workspace.
 */
import { createLfeaEngineeringSvgAdapter } from './lfea-engineering-svg-adapter.js';
import { createLfeaSvgDraftModel } from './lfea-svg-draft-model.js';
import { createLfeaSvgHistoryManager } from './lfea-svg-history.js';
import { buildLfeaSvgScene } from './lfea-svg-scene-builder.js';
import { createLfeaSvgViewportManager } from './lfea-svg-viewport.js';
import { selectPoint, selectWindow, selectCrossing } from './lfea-svg-selection.js';
import { createLfeaSvgPropertyProvider } from './lfea-svg-properties.js';
import { createEndpointSnapProvider, createMidpointSnapProvider } from './lfea-svg-snap-providers.js';
import { createLfeaSvgOverlayManager } from './lfea-svg-overlay.js';

export function createLfeaSvgWorkbench({
  initialModel = null,
  onExecuteCommand = null,
} = {}) {
  let model = initialModel || { nodes: [], elements: [], components: [], supports: [], loads: [] };
  let revisionCount = 1;
  let revision = `rev-001`;

  const viewportManager = createLfeaSvgViewportManager('ISO');
  const draftModel = createLfeaSvgDraftModel(revision);
  const historyManager = createLfeaSvgHistoryManager();
  
  const propertyProvider = createLfeaSvgPropertyProvider({ model });
  const snapProviders = [
    createEndpointSnapProvider(model.nodes),
    createMidpointSnapProvider(model.elements, model.nodes)
  ];
  const overlayManager = createLfeaSvgOverlayManager();
  const selectionService = { selectPoint, selectWindow, selectCrossing };

  const subscribers = new Set();

  function getScene() {
    return buildLfeaSvgScene({
      nodes: model.nodes,
      elements: model.elements,
      components: model.components,
      supports: model.supports,
      loads: model.loads,
      projection: viewportManager.getState().projection,
    });
  }

  function subscribeScene(listener) {
    subscribers.add(listener);
    return () => subscribers.delete(listener);
  }

  function notifySubscribers() {
    const scene = getScene();
    subscribers.forEach((fn) => fn({ type: 'sceneChanged', scene }));
  }

  async function executeCommand(intent) {
    if (onExecuteCommand) {
      const result = await onExecuteCommand(intent);
      if (result.status === 'applied') {
        historyManager.pushCommand(intent);
        revisionCount++;
        revision = `rev-${String(revisionCount).padStart(3, '0')}`;
        notifySubscribers();
      }
      return result;
    }
    revisionCount++;
    return {
      schema: 'EngineeringCommandResult.v1',
      operationId: intent.operationId,
      status: 'applied',
      newRevision: `rev-${String(revisionCount).padStart(3, '0')}`,
    };
  }

  const adapter = createLfeaEngineeringSvgAdapter({
    getScene,
    subscribeScene,
    getRevision: () => revision,
    executeCommand,
    propertyProvider,
    snapProviders,
  });

  return Object.freeze({
    adapter,
    viewportManager,
    draftModel,
    historyManager,
    overlayManager,
    selectionService,
    getScene,
    getRevision: () => revision,
  });
}
