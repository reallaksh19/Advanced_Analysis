import { createAccessibleInspector } from './lafea-canvas/accessible-inspector.js';
import { contractError, deepFreeze } from './lafea-canvas/contracts.js';
import { createHybridViewport } from './lafea-canvas/hybrid-viewport.js';
import { renderLafeaSourceOverlay } from './lafea-canvas/source-overlay-adapter.js';
import {
  emptyHybridResultSelection,
  uniqueHybridResultReasons,
  validateHybridResultSelection,
} from './lafea-hybrid-result-viewport-contracts.js';

export function mountHybridResultViewportRuntime(options) {
  return new HybridResultViewportRuntime(options).mount();
}

class HybridResultViewportRuntime {
  constructor(options) {
    Object.assign(this, options);
    this.status = this.model.status;
    this.renderer = 'NONE';
    this.blockingReasons = [...this.model.blockingReasons];
    this.runtimeBlock = null;
    this.selection = this.model.selection;
    this.renderResult = null;
    this.destroyed = false;
    this.controller = null;
    this.threeAdapter = null;
    this.canvasRef = null;
    this.contextListenersBound = false;
    this.baseInspector = createAccessibleInspector();
  }

  mount() {
    this.root.style.minHeight = `${this.model.viewport.cssHeight}px`;
    this.root.style.height = `${this.model.viewport.cssHeight}px`;
    this.controller = createHybridViewport(this.root, this.createAdapters());
    this.renderCurrent(false);
    return this.publicFacade();
  }

  createAdapters() {
    return {
      svg: this.createSvgAdapter(),
      webgl: this.createWebglAdapter(),
      inspector: {
        render: (args) => {
          this.baseInspector.render(args);
          this.appendResultInspector(args.target);
        },
      },
    };
  }

  createSvgAdapter() {
    return {
      render: ({ target, scene, viewport, selection }) => renderLafeaSourceOverlay({
        target,
        scene,
        viewport,
        registryEntry: this.registryEntry,
        selection,
        editable: false,
        onSelectSource: (sourceEntityId) => this.selectSource(sourceEntityId),
      }),
      dispose() {},
    };
  }

  createWebglAdapter() {
    return {
      isAvailable: (canvas) => this.webglAvailable(canvas),
      render: ({ target }) => this.renderWebgl(target),
      setVisible: (visible) => this.setWebglVisible(visible),
      clearCurrentScene: () => this.clearWebglScene(),
      dispose: () => this.disposeWebgl(),
    };
  }

  webglAvailable(canvas) {
    this.canvasRef = canvas;
    if (this.status !== 'READY' || this.runtimeBlock !== null) return false;
    if (!this.threeAdapter) {
      this.threeAdapter = this.createRenderer(this.input.THREE, canvas);
      this.bindContextEvents(canvas);
    }
    return this.threeAdapter.isAvailable();
  }

  renderWebgl(target) {
    if (!this.threeAdapter || target !== this.canvasRef
      || this.model.resultRequest === null) {
      throw contractError('LAFEA_HYBRID_RESULT_RENDER_ADAPTER_NOT_READY');
    }
    this.renderResult = this.threeAdapter.render(this.model.resultRequest);
    return this.renderResult;
  }

  setWebglVisible(visible) {
    if (this.threeAdapter) this.threeAdapter.setVisible(visible);
    else if (this.canvasRef) this.canvasRef.hidden = !visible;
  }

  clearWebglScene() {
    this.threeAdapter?.clearCurrentScene();
    if (this.canvasRef && !this.threeAdapter) {
      this.canvasRef.dataset.ready = 'false';
    }
    this.renderResult = null;
  }

  disposeWebgl() {
    this.threeAdapter?.dispose();
    this.threeAdapter = null;
  }

  bindContextEvents(canvas) {
    if (this.contextListenersBound) return;
    this.contextListenersBound = true;
    canvas.addEventListener('webglcontextlost', () => {
      if (this.destroyed) return;
      this.runtimeBlock = this.codes.contextLost;
      this.renderBlocked();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      if (this.destroyed) return;
      this.runtimeBlock = this.codes.rerenderRequired;
      this.renderBlocked();
    });
  }

  renderCurrent(retryRuntime) {
    this.requireActive();
    if (retryRuntime) this.runtimeBlock = null;
    if (this.model.status === 'BLOCKED' || this.runtimeBlock !== null) {
      return this.renderBlocked();
    }
    this.status = 'READY';
    this.blockingReasons = [];
    try {
      this.renderer = this.controller.render(this.readyHybridInput());
      if (this.renderer !== 'THREE_WEBGL') {
        throw contractError('LAFEA_HYBRID_RESULT_WEBGL_RENDERER_REQUIRED');
      }
      this.updateRootState();
      return this.snapshot();
    } catch (error) {
      return this.handleRenderError(error);
    }
  }

  handleRenderError(error) {
    if (error?.code === 'LAFEA_WEBGL_REQUIRED_FOR_DISPLAY_SIZE') {
      this.runtimeBlock = this.codes.webglUnavailable;
      return this.renderBlocked();
    }
    if (typeof error?.code === 'string' && error.code.startsWith('LAFEA_V2_')) {
      this.runtimeBlock = error.code;
      return this.renderBlocked();
    }
    throw error;
  }

  renderBlocked() {
    this.status = 'BLOCKED';
    this.blockingReasons = uniqueHybridResultReasons([
      ...this.model.blockingReasons,
      ...(this.runtimeBlock ? [this.runtimeBlock] : []),
    ]);
    this.renderer = this.controller.render(this.blockedHybridInput());
    if (this.renderer !== 'SVG') {
      throw contractError('LAFEA_HYBRID_RESULT_BLOCKED_RENDERER_INVALID');
    }
    this.updateRootState();
    return this.snapshot();
  }

  selectSource(sourceEntityId) {
    this.selection = validateHybridResultSelection({
      sceneRevision: this.model.sceneRevision,
      sourceEntityId,
      meshEntityId: null,
      entityRole: 'SOURCE',
    }, this.model.sourceScene);
    const result = this.renderCurrent(false);
    this.input.onSelectionChange?.(this.selection);
    return result;
  }

  clearSelection() {
    this.selection = emptyHybridResultSelection(this.model.sceneRevision);
    const result = this.renderCurrent(false);
    this.input.onSelectionChange?.(this.selection);
    return result;
  }

  appendResultInspector(target) {
    const summary = target.ownerDocument.createElement('p');
    summary.dataset.role = 'lafea-result-display-status';
    summary.textContent = this.status === 'READY'
      ? `Result display READY: ${this.model.resultRequest?.renderPacket.field.fieldId ?? 'UNKNOWN_FIELD'}`
      : 'Result display BLOCKED';
    target.append(summary);
    if (!this.blockingReasons.length) return;
    const list = target.ownerDocument.createElement('ul');
    list.dataset.role = 'lafea-result-blocking-reasons';
    this.blockingReasons.forEach((reason) => {
      const item = target.ownerDocument.createElement('li');
      item.textContent = reason;
      list.append(item);
    });
    target.append(list);
  }

  updateRootState() {
    this.root.dataset.resultStatus = this.status;
    this.root.dataset.resultRenderer = this.renderer;
    this.root.dataset.resultBlockingReasonCount = String(this.blockingReasons.length);
    if (this.status === 'READY') {
      this.root.dataset.resultFieldId = this.model.resultRequest.renderPacket.field.fieldId;
      delete this.root.dataset.resultBlockingReasons;
    } else {
      delete this.root.dataset.resultFieldId;
      this.root.dataset.resultBlockingReasons = this.blockingReasons.join(',');
    }
  }

  snapshot() {
    return deepFreeze({
      schema: this.schema,
      stageId: this.model.stageId,
      sceneRevision: this.model.sceneRevision,
      status: this.status,
      renderer: this.renderer,
      blockingReasons: [...this.blockingReasons],
      selection: this.selection,
      renderResult: this.renderResult,
    });
  }

  publicFacade() {
    return Object.freeze({
      schema: this.schema,
      model: this.model,
      getState: () => this.snapshot(),
      getSelection: () => this.selection,
      selectSource: (sourceEntityId) => this.selectSource(sourceEntityId),
      clearSelection: () => this.clearSelection(),
      refresh: () => this.renderCurrent(true),
      destroy: () => this.destroy(),
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.controller.destroy();
    this.root.dataset.resultStatus = 'DESTROYED';
    for (const field of [
      'resultRenderer', 'resultFieldId', 'resultBlockingReasonCount',
      'resultBlockingReasons',
    ]) delete this.root.dataset[field];
  }

  readyHybridInput() {
    return {
      scene: this.model.sourceScene,
      viewport: this.model.resultRequest.viewport,
      mode: this.modes.result,
      displayedPrimitiveCount: this.model.resultRequest.displayedPrimitiveCount,
      policy: this.renderPolicy,
      renderPacket: this.model.resultRequest.renderPacket,
      selection: this.selection,
    };
  }

  blockedHybridInput() {
    return {
      scene: this.model.sourceScene,
      viewport: this.model.viewport,
      mode: this.modes.source,
      displayedPrimitiveCount: this.model.sourceScene.sourcePrimitives.length,
      policy: this.renderPolicy,
      renderPacket: null,
      selection: this.selection,
    };
  }

  requireActive() {
    if (this.destroyed) {
      throw contractError('LAFEA_HYBRID_RESULT_VIEWPORT_DESTROYED');
    }
  }
}
