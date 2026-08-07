/** DOM view for the independent guided LAFEA workbench.
 * Compatibility audit: content mounts mountLafeaLiveWorkbenchViewport through
 * renderLafeaWorkbenchContent; the retained source path remains
 * mountLafeaSourceWorkbenchViewport. No geometry or mesh has been synthesized.
 * Governed source edits still enter through the content onSetScalar handler.
 * Run availability is projected only from canonical orchestrator authorization.
 */
import {
  LAFEA_STAGE_REGISTRY,
  lafeaRegisteredExecutionSupported,
  requireLafeaStageRegistryEntry,
} from './lafea-stage-registry.js';
import {
  actionButton,
  captureFocusedControl,
  element,
  restoreFocusedControl,
} from './lafea-workbench-dom.js';
import { renderLafeaWorkbenchContent } from './lafea-workbench-content.js';

const VIEW_RENDER_DEPENDENCIES = new WeakMap();

export class LafeaWorkbenchView {
  constructor(rootElement, options = {}) {
    this.rootElement = rootElement;
    VIEW_RENDER_DEPENDENCIES.set(this, Object.freeze({
      getRenderPacket: typeof options.getRenderPacket === 'function'
        ? options.getRenderPacket
        : () => null,
      THREE: options.THREE ?? null,
    }));
    this.handlers = null;
    this.benchmarkHost = null;
    this.section = null;
    this.slots = null;
    this.activeViewport = null;
    this.sceneDocuments = new Map();
    this.sceneLifecycles = new Map();
    this.sceneLifecycleBindings = new Map();
    this.sceneRevisions = new Map();
    this.sceneSelections = new Map();
    this.sceneMeshFocus = new Map();
  }

  setBenchmarkHost(hostElement) { this.benchmarkHost = hostElement; }
  init(handlers) { this.handlers = handlers; }

  render(state) {
    if (!this.rootElement || !this.handlers) return;
    const focused = captureFocusedControl(this.rootElement);
    const stage = state.stages[state.activeStageId];
    const registryEntry = requireLafeaStageRegistryEntry(state.activeStageId);
    const dependencies = VIEW_RENDER_DEPENDENCIES.get(this);
    this.ensureShell();
    this.activeViewport?.destroy();
    this.activeViewport = null;
    this.slots.header.replaceChildren(this.header(state, stage, registryEntry));
    this.slots.navigation.replaceChildren(this.stageNavigation(state));
    this.slots.toolbar.replaceChildren(this.toolbar(state.activeStageId, stage));
    const content = renderLafeaWorkbenchContent(this.rootElement, state, stage, {
      handlers: this.handlers,
      registryEntry,
      renderPacket: dependencies.getRenderPacket(state.activeStageId),
      THREE: dependencies.THREE,
      sceneRevision: this.nextSceneRevision(
        state.activeStageId,
        stage.document,
        stage.lifecycle,
        stage.lifecycleBinding,
      ),
      selection: this.sceneSelections.get(state.activeStageId),
      focusedMeshElementId: this.sceneMeshFocus.get(state.activeStageId) ?? null,
      onSelectionChange: (selection) => {
        this.sceneSelections.set(state.activeStageId, selection);
      },
      onMeshFocusChange: (elementId) => {
        this.sceneMeshFocus.set(state.activeStageId, elementId);
      },
      onNavigateTarget: (target) => this.focusToolbarTarget(target),
      benchmarkHost: this.benchmarkHost,
    });
    this.activeViewport = content.viewport;
    this.slots.content.replaceChildren(content.element);
    restoreFocusedControl(this.rootElement, focused);
  }

  ensureShell() {
    if (this.section) return;
    this.section = element(this.rootElement, 'section', 'lafea-workbench');
    this.section.dataset.role = 'lafea-workbench';
    this.slots = Object.fromEntries(
      ['header', 'navigation', 'toolbar', 'content'].map((name) => {
        const slot = element(this.rootElement, 'div');
        slot.dataset.lafeaSlot = name;
        this.section.append(slot);
        return [name, slot];
      }),
    );
    this.rootElement.append(this.section);
  }

  destroy() {
    this.activeViewport?.destroy();
    this.activeViewport = null;
    this.sceneDocuments.clear();
    this.sceneLifecycles.clear();
    this.sceneLifecycleBindings.clear();
    this.sceneRevisions.clear();
    this.sceneSelections.clear();
    this.sceneMeshFocus.clear();
    VIEW_RENDER_DEPENDENCIES.delete(this);
    this.rootElement?.replaceChildren();
    this.section = null;
    this.slots = null;
    this.handlers = null;
  }

  header(state, stage, definition) {
    const header = element(this.rootElement, 'header', 'lafea-workbench__header');
    const block = element(this.rootElement, 'div');
    block.append(
      element(
        this.rootElement,
        'span',
        'panel-eyebrow',
        `LAFEA standalone analysis • active stage ${definition.stageId}`,
      ),
      element(this.rootElement, 'h1', null, `${definition.stageId} — ${definition.label}`),
      element(this.rootElement, 'p', null, definition.purpose),
      this.headerCustody(stage),
    );
    const status = element(this.rootElement, 'output', 'lafea-workbench__status', state.status);
    status.dataset.status = state.status;
    status.setAttribute('aria-live', 'polite');
    header.append(block, status);
    return header;
  }

  headerCustody(stage) {
    const row = element(this.rootElement, 'div', 'lafea-workbench__custody');
    const sections = stage.orchestration?.sections ?? {};
    const values = [
      `Source binding: ${stage.lifecycleBinding?.status ?? 'UNINITIALIZED'}`,
      `Profile: ${stage.lifecycle?.profileId ?? 'UNINITIALIZED'}`,
      `Preparation: ${sections.PREPARATION?.state ?? 'UNAVAILABLE'}`,
      `Mesh: ${stage.analysisMeshCustodyProjection?.state ?? 'UNAVAILABLE'}`,
      `Authorization: ${sections.AUTHORIZATION?.state ?? 'UNAVAILABLE'}`,
      `Release: ${sections.RELEASE?.state === 'COMPLETE' ? 'QUALIFIED' : 'NOT QUALIFIED'}`,
    ];
    values.forEach((value) => row.append(element(this.rootElement, 'span', null, value)));
    return row;
  }

  stageNavigation(state) {
    const navigation = element(this.rootElement, 'nav', 'lafea-workbench__stages');
    navigation.setAttribute('aria-label', 'LAFEA stages');
    for (const definition of LAFEA_STAGE_REGISTRY) {
      const button = actionButton(
        this.rootElement,
        `${definition.stageId} ${definition.label}`,
        () => this.handlers.onStage(definition.stageId),
      );
      button.dataset.stageId = definition.stageId;
      button.setAttribute('aria-current', definition.stageId === state.activeStageId ? 'step' : 'false');
      navigation.append(button);
    }
    return navigation;
  }

  toolbar(stageId, stage) {
    const toolbar = element(this.rootElement, 'div', 'lafea-workbench__toolbar');
    const mock = actionButton(
      this.rootElement,
      `[SIMULATED] Load ${stageId} demonstration source`,
      () => this.handlers.onMock(stageId),
    );
    mock.dataset.role = 'lafea-mock';
    mock.dataset.mockData = 'true';

    const file = element(this.rootElement, 'input');
    const fileLabel = element(this.rootElement, 'label', null, 'Import stage JSON');
    const fileId = `lafea-import-${stageId.replace('.', '-')}`;
    file.id = fileId;
    fileLabel.htmlFor = fileId;
    file.type = 'file';
    file.accept = '.json,application/json';
    file.dataset.role = 'lafea-import';
    file.addEventListener('change', () => this.handlers.onFile(file.files?.[0] ?? null));

    const executionSupported = lafeaRegisteredExecutionSupported(stageId);
    const authorization = stage.orchestration?.sections?.AUTHORIZATION ?? null;
    const runAuthorized = authorization?.state === 'READY';
    const run = actionButton(
      this.rootElement,
      executionSupported ? 'Validate and calculate' : 'Calculation not implemented',
      this.handlers.onRun,
    );
    run.dataset.role = 'lafea-run';
    run.disabled = !stage.document || !executionSupported || !runAuthorized;
    run.title = runTitle(stage, executionSupported, authorization);

    const benchmark = actionButton(
      this.rootElement,
      'Run available verification suite',
      this.handlers.onBenchmark,
    );
    benchmark.dataset.role = 'lafea-benchmark';
    benchmark.disabled = !executionSupported;

    const exportButton = actionButton(this.rootElement, 'Export source document', this.handlers.onExport);
    exportButton.disabled = !stage.document;
    const undo = actionButton(this.rootElement, 'Undo', this.handlers.onUndo);
    undo.disabled = !stage.past.length;
    const redo = actionButton(this.rootElement, 'Redo', this.handlers.onRedo);
    redo.disabled = !stage.future.length;
    toolbar.append(mock, fileLabel, file, run, benchmark, exportButton, undo, redo);
    return toolbar;
  }

  nextSceneRevision(stageId, document, lifecycle, lifecycleBinding) {
    const changed = !this.sceneDocuments.has(stageId)
      || this.sceneDocuments.get(stageId) !== document
      || this.sceneLifecycles.get(stageId) !== lifecycle
      || this.sceneLifecycleBindings.get(stageId) !== lifecycleBinding;
    if (changed) {
      this.sceneDocuments.set(stageId, document);
      this.sceneLifecycles.set(stageId, lifecycle);
      this.sceneLifecycleBindings.set(stageId, lifecycleBinding);
      this.sceneRevisions.set(stageId, (this.sceneRevisions.get(stageId) ?? 0) + 1);
      this.sceneSelections.delete(stageId);
      this.sceneMeshFocus.delete(stageId);
    }
    return this.sceneRevisions.get(stageId) ?? 0;
  }

  focusToolbarTarget(target) {
    if (target !== 'run') return;
    this.slots?.toolbar?.querySelector?.('[data-role="lafea-run"]')?.focus?.();
  }
}

function runTitle(stage, executionSupported, authorization) {
  if (!executionSupported) return 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED';
  if (!stage.document) return 'A validated source document is required.';
  if (authorization?.state !== 'READY') {
    const reasons = authorization?.reasons?.join(', ') || 'CANONICAL_AUTHORIZATION_NOT_READY';
    return `Canonical authorization ${authorization?.state ?? 'UNAVAILABLE'} does not authorize run: ${reasons}`;
  }
  return 'Canonical workbench authorization is READY. Retained calculation output does not imply release authority.';
}
