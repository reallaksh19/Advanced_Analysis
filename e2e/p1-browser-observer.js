export async function installP1Observer(page, config) {
  await page.evaluate(async ({ executionId, exactHeadSha, fixtureRole }) => {
    const [datasetModule, engineeringStoreModule, viewportPanelModule,
      viewportRendererModule, backendModule] = await Promise.all([
      import('/src/workspace/dataset-controller.js'),
      import('/src/workspace/engineering-model-store.js'),
      import('/src/workspace/viewport-panel.js'),
      import('/src/workspace/viewport-renderer.js'),
      import('/src/workspace/three-viewport-backend.js'),
    ]);
    const actionIds = [
      'INITIAL_IMPORT', 'SELECTION_ONLY', 'ORBIT_PAN', 'MODEL_ZONE_CHANGE',
      'CALCULATED_EVENT', 'MASTER_DATA_CHANGED', 'PROJECT_DATA_CHANGED',
      'CLEAR_RELOAD', 'CONTEXT_RESTORATION',
    ];
    const invocationIds = [
      'NORMALIZATION_REQUEST', 'ENGINEERING_MODEL_REBUILD', 'VIEWPORT_PIPELINE',
      'RENDER_MODEL_INSTALL_REQUEST', 'THREE_SCENE_INSTALL', 'RENDER_FRAME',
    ];
    const requiredObservability = {
      SUPPORT_SITE_CONSTRUCTION: 'workspace:p1:support-sites',
      ROUTE_CONSTRUCTION: 'workspace:p1:route-partition',
      MODEL_ZONE_PROJECTION: 'workspace:p1:model-zone-projection',
      RESOLVED_GEOMETRY_CONSTRUCTION: 'workspace:p1:resolved-geometry',
      RENDER_MODEL_CONSTRUCTION: 'workspace:p1:render-model',
      THREE_MATERIALIZATION: 'workspace:p1:three-materialization',
      SCENE_INSTALLATION: 'workspace:p1:scene-installation',
      FIT: 'workspace:p1:fit',
    };
    const renderOwners = new Set(
      document.querySelectorAll('canvas[data-viewport-backend="webgl"]'),
    );
    const restorers = [];
    const observer = createObserver({
      executionId, exactHeadSha, fixtureRole, actionIds, invocationIds,
      requiredObservability, renderOwners, restorers,
    });
    globalThis.__P1_Q0_OBSERVER__ = observer;

    patch(datasetModule.DatasetController.prototype, 'load', 'NORMALIZATION_REQUEST');
    patch(engineeringStoreModule.engineeringModelStore, 'rebuild', 'ENGINEERING_MODEL_REBUILD');
    patch(viewportPanelModule.ViewportPanel.prototype, 'renderDataset', 'VIEWPORT_PIPELINE');
    patch(viewportRendererModule.ViewportRenderer.prototype,
      'renderModel', 'RENDER_MODEL_INSTALL_REQUEST');
    patch(backendModule.ThreeViewportBackend.prototype, 'renderModel', 'THREE_SCENE_INSTALL');
    patch(backendModule.ThreeViewportBackend.prototype,
      'handleContextRestored', 'THREE_SCENE_INSTALL');
    patch(backendModule.ThreeViewportBackend.prototype, 'renderOnce', 'RENDER_FRAME');
    patchRenderOwnership(backendModule.ThreeViewportBackend.prototype);
    document.addEventListener('change', triggerArmedAction, true);
    document.addEventListener('click', triggerArmedAction, true);
    document.addEventListener('pointerdown', triggerArmedAction, true);

    function createObserver(state) {
      return {
        schema: 'non-fea-p1-invalidation-evidence/v1',
        executionId: state.executionId,
        exactHeadSha: state.exactHeadSha,
        fixtureRole: state.fixtureRole,
        viewportRoute: 'WORKSPACE_STANDARD_VIEWPORT',
        actionIds: state.actionIds,
        invocationIds: state.invocationIds,
        runs: [],
        active: null,
        pending: null,
        sequence: 0,
        firstInvocationStart: {},
        arm(actionId, metadata = {}, trigger = null) {
          this.assertAction(actionId);
          if (this.active || this.pending) throw new Error('P1 observer already owns an action.');
          this.pending = { actionId, metadata, trigger };
        },
        begin(actionId, metadata = {}, startedAtMs = performance.now()) {
          this.assertAction(actionId);
          if (this.active) throw new Error(`P1 action still active: ${this.active.actionId}`);
          this.pending = null;
          this.active = {
            sequence: this.sequence += 1,
            actionId,
            startedAtMs,
            metadata,
            counts: Object.fromEntries(invocationIds.map((id) => [id, 0])),
            durations: Object.fromEntries(invocationIds.map((id) => [id, []])),
            sceneInstallEndMs: null,
            firstRenderEndMs: null,
          };
          return startedAtMs;
        },
        startArmed(trigger, startedAtMs = performance.now()) {
          if (!this.pending || this.pending.trigger !== trigger) return false;
          const { actionId, metadata } = this.pending;
          this.begin(actionId, metadata, startedAtMs);
          return true;
        },
        record(invocationId, startedAtMs, durationMs) {
          this.firstInvocationStart[invocationId] ??= startedAtMs;
          const active = this.active;
          if (!active) return;
          const rounded = Number(durationMs.toFixed(3));
          const completedAtMs = startedAtMs + durationMs;
          active.counts[invocationId] += 1;
          active.durations[invocationId].push(rounded);
          if (invocationId === 'THREE_SCENE_INSTALL') active.sceneInstallEndMs = completedAtMs;
          if (invocationId === 'RENDER_FRAME' && active.firstRenderEndMs === null) {
            const needsInstall = ['INITIAL_IMPORT', 'CLEAR_RELOAD', 'CONTEXT_RESTORATION']
              .includes(active.actionId);
            if (!needsInstall || (active.sceneInstallEndMs !== null
              && completedAtMs >= active.sceneInstallEndMs)) {
              active.firstRenderEndMs = completedAtMs;
            }
          }
        },
        hasMeasuredRender() { return this.active?.firstRenderEndMs !== null; },
        end(status = 'PASS', metadata = {}) {
          if (!this.active) throw new Error('No active P1 action.');
          const active = this.active;
          this.active = null;
          const measuredEnd = active.firstRenderEndMs ?? performance.now();
          const evidenceRow = {
            sequence: active.sequence,
            actionId: active.actionId,
            status,
            durationMs: Number((measuredEnd - active.startedAtMs).toFixed(3)),
            metadata: {
              ...active.metadata,
              ...metadata,
              timingBasis: active.firstRenderEndMs === null
                ? 'ACTION_TO_OBSERVER_END'
                : 'NATIVE_TRIGGER_TO_FIRST_COMMITTED_RENDER_END',
            },
            counts: { ...active.counts },
            durations: Object.fromEntries(Object.entries(active.durations)
              .map(([key, values]) => [key, [...values]])),
          };
          this.runs.push(evidenceRow);
          return { ...evidenceRow, startedAtMs: active.startedAtMs };
        },
        renderOwnerCount() { return state.renderOwners.size; },
        detailedStageMeasurements() {
          return Object.entries(state.requiredObservability)
            .map(([stageId, measureName]) => {
              const entry = performance.getEntriesByName(measureName, 'measure')[0];
              return {
                stageId,
                durationMs: entry ? Number(entry.duration.toFixed(3)) : null,
              };
            })
            .sort((left, right) => left.stageId < right.stageId ? -1 : 1);
        },
        observabilityGaps() {
          return this.detailedStageMeasurements()
            .filter((row) => row.durationMs === null)
            .map((row) => row.stageId);
        },
        snapshot() {
          if (this.active || this.pending) throw new Error('P1 observer action is unfinished.');
          return {
            schema: this.schema,
            executionId: this.executionId,
            exactHeadSha: this.exactHeadSha,
            fixtureRole: this.fixtureRole,
            viewportRoute: this.viewportRoute,
            actionIds: [...this.actionIds],
            invocationIds: [...this.invocationIds],
            runs: this.runs.map((row) => ({ ...row })),
          };
        },
        destroy() {
          document.removeEventListener('change', triggerArmedAction, true);
          document.removeEventListener('click', triggerArmedAction, true);
          document.removeEventListener('pointerdown', triggerArmedAction, true);
          state.restorers.reverse().forEach((restore) => restore());
          state.restorers.length = 0;
          if (globalThis.__P1_Q0_OBSERVER__ === this) delete globalThis.__P1_Q0_OBSERVER__;
        },
        assertAction(actionId) {
          if (!this.actionIds.includes(actionId)) throw new Error(`Unknown P1 action ${actionId}.`);
        },
      };
    }

    function patch(target, methodName, invocationId) {
      const original = target?.[methodName];
      if (typeof original !== 'function') throw new Error(`Cannot patch ${methodName}.`);
      target[methodName] = function p1ObservedMethod(...args) {
        const startedAtMs = performance.now();
        let result;
        try { result = original.apply(this, args); }
        catch (error) {
          observer.record(invocationId, startedAtMs, performance.now() - startedAtMs);
          throw error;
        }
        if (result && typeof result.then === 'function') {
          return result.finally(() => observer.record(
            invocationId, startedAtMs, performance.now() - startedAtMs,
          ));
        }
        observer.record(invocationId, startedAtMs, performance.now() - startedAtMs);
        return result;
      };
      restorers.push(() => { target[methodName] = original; });
    }
    function patchRenderOwnership(prototype) {
      const start = prototype.startAnimation;
      const stop = prototype.stopAnimation;
      const destroy = prototype.destroy;
      prototype.startAnimation = function p1StartAnimation(...args) {
        const result = start.apply(this, args);
        if (this.animationFrame && this.renderer?.domElement) renderOwners.add(this.renderer.domElement);
        return result;
      };
      prototype.stopAnimation = function p1StopAnimation(...args) {
        const canvas = this.renderer?.domElement;
        const result = stop.apply(this, args);
        if (canvas) renderOwners.delete(canvas);
        return result;
      };
      prototype.destroy = function p1Destroy(...args) {
        const canvas = this.renderer?.domElement;
        const result = destroy.apply(this, args);
        if (canvas) renderOwners.delete(canvas);
        return result;
      };
      restorers.push(() => {
        prototype.startAnimation = start;
        prototype.stopAnimation = stop;
        prototype.destroy = destroy;
      });
    }
    function triggerArmedAction(event) {
      const pending = observer.pending;
      if (!pending) return;
      if (pending.trigger === 'DATASET_FILE_CHANGE'
          && event.type === 'change'
          && event.target?.matches?.('[data-role="dataset-file"]')) {
        observer.startArmed('DATASET_FILE_CHANGE');
      } else if (pending.trigger === 'ENTITY_CLICK'
          && event.type === 'click'
          && event.target?.closest?.('[data-entity-id]')) {
        observer.startArmed('ENTITY_CLICK');
      } else if (pending.trigger === 'VIEWPORT_POINTER_DOWN'
          && event.type === 'pointerdown'
          && event.target?.matches?.('canvas[data-viewport-backend="webgl"]')) {
        observer.startArmed('VIEWPORT_POINTER_DOWN');
      }
    }
  }, config);
}
