/**
 * DOM view for the independent LAFEA workbench.
 *
 * The view contains no engineering calculation, no hidden fallback and no
 * direct mutation of frozen stage documents. All edits pass through controller
 * commands. Geometry is rendered only from explicit source entities.
 */
import {
  LAFEA_STAGE_DEFINITIONS,
  lafeaPreviewGeometry,
  lafeaStageExecutionSupported,
} from './lafea-workbench-model.js';
import {
  actionButton,
  captureFocusedControl,
  card,
  element,
  restoreFocusedControl,
} from './lafea-workbench-dom.js';
import { renderLafeaEvidence } from './lafea-results-view.js';
import { renderLafeaWorkbenchSvg } from './lafea-workbench-svg.js';
import { renderMeshQualityPanel } from './lafea-mesh-quality-panel.js';
import { renderDocumentTableEditor } from './lafea-document-table.js';

const STAGE_TRUTH = Object.freeze({
  'LAFEA.1': Object.freeze({
    engine: 'src/core/local-stress',
    authority: 'LOAD_TRANSFER_AND_PRESSURE_BASELINE_ONLY',
    limitations: Object.freeze([
      'No finite-element analysis or local attachment stress.',
      'No shell bending, weld stress, contact or code assessment.',
    ]),
  }),
  'LAFEA.2': Object.freeze({
    engine: 'src/core/local-attachment-screening',
    authority: 'NOMINAL_PIPE_SECTION_SCREENING_ONLY',
    limitations: Object.freeze([
      'No local discontinuity or attachment stress.',
      'No transverse-shear recovery, shell analysis, weld analysis or code assessment.',
    ]),
  }),
  'LAFEA.3': Object.freeze({
    engine: 'src/core/local-continuum',
    authority: 'T3_T6_Q8_LINEAR_CONTINUUM',
    limitations: Object.freeze([
      'Integration-point stress is authoritative for T6/Q8; nodal projection is display-only.',
      'Production geometry-to-mesh-to-convergence orchestration is not complete.',
    ]),
  }),
  'LAFEA.4': Object.freeze({
    engine: 'src/core/local-shell',
    authority: 'CST_DKT_TRI3_THIN_SHELL_V1',
    limitations: Object.freeze([
      'Current production dispatch is the legacy five-DOF triangular thin-shell path.',
      'No production MITC4/MITC3 claim, drilling DOF, thick-shell claim, weld stress or code assessment.',
    ]),
  }),
  'LAFEA.5': Object.freeze({
    engine: 'src/core/local-trunnion-footprint',
    authority: 'CALLER_AUTHORED_HOST_SHELL_FOOTPRINT_ONLY',
    limitations: Object.freeze([
      'No generated trunnion stiffness, weld, contact or pressure superposition.',
      'No code assessment; footprint-adjacent peaks remain load-introduction-sensitive.',
    ]),
  }),
  'LAFEA.6': Object.freeze({
    engine: 'NONE',
    authority: 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED',
    limitations: Object.freeze([
      'Calculation is disabled.',
      'No qualified weld schema, calculator, result validator or benchmark manifest is registered.',
    ]),
  }),
});

export class LafeaWorkbenchView {
  /**
   * @param {Element|null} rootElement Workbench host.
   */
  constructor(rootElement) {
    this.rootElement = rootElement;
    this.handlers = null;
    this.benchmarkHost = null;
    this.section = null;
    this.slots = null;
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
    this.rootElement?.replaceChildren();
    this.section = null;
    this.slots = null;
    this.handlers = null;
  }

  header(state) {
    const definition = stageDefinition(state.activeStageId);
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
    for (const definition of LAFEA_STAGE_DEFINITIONS) {
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

    const executionSupported = lafeaStageExecutionSupported(stageId);
    const run = actionButton(
      this.rootElement,
      executionSupported ? 'Validate and calculate' : 'Calculation not implemented',
      this.handlers.onRun,
    );
    run.dataset.role = 'lafea-run';
    run.disabled = !stage.document || !executionSupported;
    if (!executionSupported) {
      run.title = 'UNSUPPORTED_STAGE_ENGINE_NOT_IMPLEMENTED';
    }

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
    const grid = element(this.rootElement, 'div', 'lafea-workbench__grid');

    const sourceCard = card(
      this.rootElement,
      `Validated source document — ${state.activeStageId}`,
    );
    sourceCard.body.append(renderDocumentTableEditor(
      sourceCard.body,
      stage.document,
      (json) => this.handlers.onApplyJson(json),
    ));

    const previewCard = card(
      this.rootElement,
      `Source-derived geometry preview — ${state.activeStageId}`,
    );
    const geometry = lafeaPreviewGeometry(state.activeStageId, stage.document);
    const preview = element(this.rootElement, 'div', 'lafea-workbench__svg');
    if (geometry.nodes.length || geometry.elements.length) {
      const editableGeometry = ['LAFEA.3', 'LAFEA.4', 'LAFEA.5'].includes(state.activeStageId);
      renderLafeaWorkbenchSvg(
        preview,
        geometry,
        editableGeometry ? { onMoveNode: this.handlers.onMoveNode } : {},
      );
    } else {
      preview.append(element(
        this.rootElement,
        'p',
        'lafea-workbench-svg__empty',
        'No explicit source geometry is available for this stage. No geometry or mesh has been synthesized.',
      ));
    }
    previewCard.body.append(preview, this.truthPanel(state.activeStageId));

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

    grid.append(
      sourceCard.section,
      previewCard.section,
      evidenceCard.section,
      meshCard.section,
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

  truthPanel(stageId) {
    const truth = STAGE_TRUTH[stageId];
    const section = element(this.rootElement, 'section', 'lafea-workbench__truth');
    const title = element(this.rootElement, 'h3', null, 'Current authority and limitations');
    const engine = element(this.rootElement, 'p', null, `Declared engine: ${truth.engine}`);
    const authority = element(this.rootElement, 'p', null, `Authority: ${truth.authority}`);
    const limitations = element(this.rootElement, 'ul');
    truth.limitations.forEach((value) => limitations.append(element(this.rootElement, 'li', null, value)));
    section.append(title, engine, authority, limitations);
    return section;
  }
}

function stageDefinition(stageId) {
  const definition = LAFEA_STAGE_DEFINITIONS.find((row) => row.stageId === stageId);
  if (!definition) throw new TypeError(`Unknown LAFEA stage: ${stageId}.`);
  return definition;
}
