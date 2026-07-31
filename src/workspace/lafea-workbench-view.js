/**
 * DOM view for the independent LAFEA workbench.
 *
 * The view contains no engineering calculation, no hidden fallback and no
 * direct mutation of frozen stage documents. All edits pass through controller
 * commands. Geometry is rendered only from explicit source entities. Stage
 * labels, capability state, preview policy and limitations are read from the
 * governed stage registry. Lifecycle evidence is presented read-only.
 * U4G retains U4B through mountLafeaSourceWorkbenchViewportModel internally.
 */
import {
  LAFEA_STAGE_REGISTRY,
  lafeaRegisteredExecutionSupported,
  requireLafeaStageRegistryEntry,
} from './lafea-stage-registry.js';
import {
  actionButton,
  captureFocusedControl,
  card,
  element,
  restoreFocusedControl,
} from './lafea-workbench-dom.js';
import { renderLafeaEvidence } from './lafea-results-view.js';
import { renderMeshQualityPanel } from './lafea-mesh-quality-panel.js';
import { renderDocumentTableEditor } from './lafea-document-table.js';
import { renderLafeaLifecyclePanel } from './lafea-lifecycle-panel.js';
import { mountLafeaLiveWorkbenchViewport } from './lafea-live-workbench-viewport.js';

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
  }

  setBenchmarkHost(hostElement) {
    this.benchmarkHost = hostElement;
  }

  init(handlers) {
    this.handlers = handlers;
  }

  render(state) {
    if (!this.rootElement || !this.handlers) return;
    const focused = captureFocusedControl(this.rootElement);
    const stage = state.stages[state.activeStageId];
    this.ensureShell();
    this.activeViewport?.destroy();
    this.activeViewport = null;
    this.slots.header.replaceChildren(this.header(state));
    this.slots.navigation.replaceChildren(this.stageNavigation(state));
    this.slots.toolbar.replaceChildren(this.toolbar(state.activeStageId, stage));
    this.slots.content.replaceChildren(this.content(state, stage));
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
    VIEW_RENDER_DEPENDENCIES.delete(this);
    this.rootElement?.replaceChildren();
    this.section = null;
    this.slots = null;
    this.handlers = null;
  }

  header(state) {
    const definition = requireLafeaStageRegistryEntry(state.activeStageId);
    const header = element(this.rootElement, 'header', 'lafea-workbench__header');
    const block = element(this.rootElement, 'div');
    const eyebrow = element(
      this.rootElement,
      'span',
      'panel-eyebrow',
      `LAFEA local-analysis workbench • active stage ${definition.stageId}`,
    );
    const title = element(
      this.rootElement,
      'h1',
      null,
      `${definition.stageId} — ${definition.label}`,
    );
    const purpose = element(this.rootElement, 'p', null, definition.purpose);
    block.append(eyebrow, title, purpose);

    const status = element(this.rootElement, 'output', 'lafea-workbench__status', state.status);
    status.dataset.status = state.status;
    status.setAttribute('aria-live', 'polite');
    header.append(block, status);
    return header;
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
    mock.title = 'Loads an explicitly identified demonstration source through the normal importer.';

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
    const run = actionButton(
      this.rootElement,
      executionSupported ? 'Validate and calculate' : 'Calculation not implemented',
      this.handlers.onRun,
    );
    run.dataset.role = 'lafea-run';
    run.disabled = !stage.document || !executionSupported;
    run.title = executionSupported
      ? 'Retained calculation output is not promoted automatically into lifecycle evidence.'
      : 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED';

    const benchmark = actionButton(
      this.rootElement,
      'Run available verification suite',
      this.handlers.onBenchmark,
    );
    benchmark.dataset.role = 'lafea-benchmark';
    benchmark.disabled = !executionSupported;
    benchmark.title = 'Verification output does not by itself qualify a stage release.';

    const exportButton = actionButton(this.rootElement, 'Export source document', this.handlers.onExport);
    exportButton.disabled = !stage.document;

    const undo = actionButton(this.rootElement, 'Undo', this.handlers.onUndo);
    undo.disabled = !stage.past.length;
    const redo = actionButton(this.rootElement, 'Redo', this.handlers.onRedo);
    redo.disabled = !stage.future.length;

    toolbar.append(mock, fileLabel, file, run, benchmark, exportButton, undo, redo);
    return toolbar;
  }

  content(state, stage) {
    const registryEntry = requireLafeaStageRegistryEntry(state.activeStageId);
    const dependencies = VIEW_RENDER_DEPENDENCIES.get(this);
    const grid = element(this.rootElement, 'div', 'lafea-workbench__grid');

    const sourceCard = card(
      this.rootElement,
      `Validated source document — ${state.activeStageId}`,
    );
    sourceCard.body.append(renderDocumentTableEditor(
      sourceCard.body,
      state.activeStageId,
      stage.document,
      {
        onSetScalar: this.handlers.onSetScalar,
        onApplyJson: this.handlers.onApplyJson,
      },
    ));

    const previewCard = card(
      this.rootElement,
      `Governed engineering viewport — ${state.activeStageId}`,
    );
    const preview = element(this.rootElement, 'div', 'lafea-workbench__svg');
    const sceneRevision = this.nextSceneRevision(
      state.activeStageId,
      stage.document,
      stage.lifecycle,
      stage.lifecycleBinding,
    );
    this.activeViewport = mountLafeaLiveWorkbenchViewport(preview, {
      stageId: state.activeStageId,
      document: stage.document,
      lifecycle: stage.lifecycle,
      lifecycleBinding: stage.lifecycleBinding,
      sceneRevision,
      renderPacket: dependencies.getRenderPacket(state.activeStageId),
      selection: this.sceneSelections.get(state.activeStageId),
      THREE: dependencies.THREE,
      cssWidth: 760,
      cssHeight: 440,
      devicePixelRatio: 1,
      onMoveNode: registryEntry.previewSource.editable
        ? this.handlers.onMoveNode
        : undefined,
      onSelectionChange: (selection) => {
        this.sceneSelections.set(state.activeStageId, selection);
      },
    });
    previewCard.body.append(preview);
    if (!this.activeViewport.scene.sourcePrimitives.length) {
      previewCard.body.append(element(
        this.rootElement,
        'p',
        'lafea-workbench-svg__empty',
        'No explicit source geometry is available for this stage. No geometry or mesh has been synthesized.',
      ));
    }
    previewCard.body.append(this.truthPanel(registryEntry));

    const evidenceCard = card(
      this.rootElement,
      `Retained result evidence — ${state.activeStageId}`,
    );
    evidenceCard.body.append(renderLafeaEvidence(
      this.rootElement,
      state.activeStageId,
      stage.document,
      state,
      stage.execution,
    ));

    const meshCard = card(
      this.rootElement,
      `Mesh evidence — ${state.activeStageId}`,
    );
    const qualityPanelHost = element(this.rootElement, 'div', 'lafea-workbench__quality');
    renderMeshQualityPanel(qualityPanelHost, null, {
      stageId: state.activeStageId,
      documentValue: stage.document,
    });
    meshCard.body.append(qualityPanelHost);

    const lifecycleCard = card(
      this.rootElement,
      `Lifecycle and lineage evidence — ${state.activeStageId}`,
    );
    lifecycleCard.body.append(renderLafeaLifecyclePanel(
      lifecycleCard.body,
      state.activeStageId,
      stage,
    ));

    grid.append(
      sourceCard.section,
      previewCard.section,
      evidenceCard.section,
      meshCard.section,
      lifecycleCard.section,
    );

    if (this.benchmarkHost) {
      const benchmarkCard = card(this.rootElement, 'Verification output');
      const notice = element(
        this.rootElement,
        'p',
        null,
        'A rendered verification report or demonstration run is not release qualification. '
          + 'Exact-head benchmark manifests and independent expected values remain required.',
      );
      benchmarkCard.body.append(notice, this.benchmarkHost);
      grid.append(benchmarkCard.section);
    }

    return grid;
  }

  nextSceneRevision(stageId, document, lifecycle, lifecycleBinding) {
    const inputsChanged = !this.sceneDocuments.has(stageId)
      || this.sceneDocuments.get(stageId) !== document
      || this.sceneLifecycles.get(stageId) !== lifecycle
      || this.sceneLifecycleBindings.get(stageId) !== lifecycleBinding;
    if (inputsChanged) {
      this.sceneDocuments.set(stageId, document);
      this.sceneLifecycles.set(stageId, lifecycle);
      this.sceneLifecycleBindings.set(stageId, lifecycleBinding);
      this.sceneRevisions.set(stageId, (this.sceneRevisions.get(stageId) ?? 0) + 1);
      this.sceneSelections.delete(stageId);
    }
    return this.sceneRevisions.get(stageId) ?? 0;
  }

  truthPanel(registryEntry) {
    const section = element(this.rootElement, 'section', 'lafea-workbench__truth');
    const title = element(this.rootElement, 'h3', null, 'Current authority and limitations');
    const enginePath = registryEntry.enginePackage
      ? `src/core/${registryEntry.enginePackage}`
      : 'NONE';
    const engine = element(this.rootElement, 'p', null, `Declared engine: ${enginePath}`);
    const authority = element(this.rootElement, 'p', null, `Authority: ${registryEntry.authority}`);
    const limitations = element(this.rootElement, 'ul');
    registryEntry.limitations.forEach((value) => {
      limitations.append(element(this.rootElement, 'li', null, value));
    });
    section.append(title, engine, authority, limitations);
    return section;
  }
}
