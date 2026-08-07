/** Guided content composition for the standalone LAFEA workbench. */
import { card, element } from './lafea-workbench-dom.js';
import { renderLafeaEvidence } from './lafea-results-view.js';
import { renderDocumentTableEditor } from './lafea-document-table.js';
import { renderLafeaLifecyclePanel } from './lafea-lifecycle-panel.js';
import { mountLafeaLiveWorkbenchViewport } from './lafea-live-workbench-viewport.js';
import { buildLafeaDiscretizationViewModel } from './lafea-discretization-view-model.js';
import { renderLafeaDiscretizationPanel } from './lafea-discretization-panel.js';
import { buildLafeaGuidedWorkflow } from './lafea-guided-workflow.js';
import { renderLafeaGuidedWorkflow } from './lafea-guided-workflow-view.js';
import { focusLafeaRetainedMeshElement } from './lafea-canvas/retained-mesh-overlay.js';

export function renderLafeaWorkbenchContent(root, state, stage, options) {
  const workflow = buildLafeaGuidedWorkflow(state);
  const discretization = buildLafeaDiscretizationViewModel(stage);
  const shell = element(root, 'div', 'lafea-guided-shell');
  const navHost = element(root, 'aside', 'lafea-guided-shell__nav');
  const main = element(root, 'div', 'lafea-guided-shell__main');
  shell.append(navHost, main);

  let activeViewport = null;
  renderLafeaGuidedWorkflow(navHost, workflow, (step) => {
    const target = shell.querySelector(`[data-guided-target="${step.focusTarget}"]`);
    if (target) {
      target.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      target.querySelector?.('button,input,select,textarea,[tabindex]')?.focus?.({ preventScroll: true });
      return;
    }
    options.onNavigateTarget?.(step.focusTarget);
  });

  const sourceCard = card(root, `Source and stage inputs — ${state.activeStageId}`);
  sourceCard.section.dataset.guidedTarget = 'source';
  sourceCard.body.append(renderDocumentTableEditor(
    sourceCard.body,
    state.activeStageId,
    stage.document,
    {
      onSetScalar: options.handlers.onSetScalar,
      onApplyJson: options.handlers.onApplyJson,
    },
  ));

  const viewportCard = card(root, `Governed engineering viewport — ${state.activeStageId}`);
  viewportCard.section.dataset.guidedTarget = 'viewport';
  const preview = element(root, 'div', 'lafea-workbench__svg');
  activeViewport = mountLafeaLiveWorkbenchViewport(preview, {
    stageId: state.activeStageId,
    document: stage.document,
    lifecycle: stage.lifecycle,
    lifecycleBinding: stage.lifecycleBinding,
    sceneRevision: options.sceneRevision,
    renderPacket: options.renderPacket,
    selection: options.selection,
    THREE: options.THREE,
    cssWidth: 760,
    cssHeight: 440,
    devicePixelRatio: 1,
    onMoveNode: options.registryEntry.previewSource.editable
      ? options.handlers.onMoveNode
      : undefined,
    onSelectionChange: options.onSelectionChange,
    retainedMeshEvidence: stage.analysisMeshCustodyProjection?.canView
      ? stage.retainedAnalysisMeshEvidence
      : null,
    analysisMeshCustodyState: stage.analysisMeshCustodyProjection?.state ?? null,
    focusedMeshElementId: options.focusedMeshElementId,
    onFocusMeshElement: options.onMeshFocusChange,
  });
  viewportCard.body.append(preview);
  if (!activeViewport.scene.sourcePrimitives.length) {
    viewportCard.body.append(element(
      root,
      'p',
      'lafea-workbench-svg__empty',
      'No explicit source geometry is available for this stage. No geometry or mesh has been synthesized.',
    ));
  }
  viewportCard.body.append(truthPanel(root, options.registryEntry));

  const discretizationCard = card(root, `Discretization — ${state.activeStageId}`);
  discretizationCard.section.dataset.guidedTarget = 'discretization';
  const discretizationHost = element(root, 'div');
  renderLafeaDiscretizationPanel(discretizationHost, discretization, {
    onImportEvidence: options.handlers.onImportMeshEvidence,
    onValidateEvidence: options.handlers.onValidateMeshEvidence,
    onExportEvidence: options.handlers.onExportMeshEvidence,
    onFocusElement: (elementId) => {
      options.onMeshFocusChange?.(elementId, true);
      focusLafeaRetainedMeshElement(preview, elementId);
    },
    onAdvance: () => navigateTo(shell, 'findings'),
  });
  discretizationCard.body.append(discretizationHost);

  const preflightCard = card(root, `Pre-FEA and authorization — ${state.activeStageId}`);
  preflightCard.section.dataset.guidedTarget = 'findings';
  preflightCard.body.append(workflowSummary(root, workflow, [
    'MODEL_DIAGNOSTICS', 'NUMERICAL_PREFLIGHT', 'AUTHORIZATION', 'RUN',
  ]));
  if (Array.isArray(state.diagnostics) && state.diagnostics.length) {
    preflightCard.body.append(diagnosticList(root, state.diagnostics));
  }

  const evidenceCard = card(root, `Results and evidence — ${state.activeStageId}`);
  evidenceCard.section.dataset.guidedTarget = 'results';
  evidenceCard.body.append(renderLafeaEvidence(
    root,
    state.activeStageId,
    stage.document,
    state,
    stage.execution,
  ));

  const lifecycleCard = card(root, `Lifecycle and lineage — ${state.activeStageId}`);
  lifecycleCard.section.dataset.guidedTarget = 'lineage';
  lifecycleCard.body.append(renderLafeaLifecyclePanel(
    lifecycleCard.body,
    state.activeStageId,
    stage,
  ));

  main.append(
    sourceCard.section,
    viewportCard.section,
    discretizationCard.section,
    preflightCard.section,
    evidenceCard.section,
    lifecycleCard.section,
  );

  if (options.benchmarkHost) {
    const benchmarkCard = card(root, 'Verification output');
    benchmarkCard.section.dataset.guidedTarget = 'verification';
    benchmarkCard.body.append(
      element(
        root,
        'p',
        null,
        'A rendered verification report or demonstration run is not release qualification. Exact-head benchmark manifests and independent expected values remain required.',
      ),
      options.benchmarkHost,
    );
    main.append(benchmarkCard.section);
  }

  return Object.freeze({
    element: shell,
    viewport: activeViewport,
    workflow,
    discretization,
  });
}

function workflowSummary(root, workflow, ids) {
  const section = element(root, 'div', 'lafea-guided-summary');
  for (const id of ids) {
    const step = workflow.steps.find((candidate) => candidate.stepId === id);
    if (!step) continue;
    const row = element(root, 'div', 'lafea-guided-summary__row');
    row.dataset.stepId = id;
    row.dataset.status = step.status;
    row.append(
      element(root, 'strong', null, `${step.label}: ${step.status}`),
      element(root, 'span', null, step.reasons.length ? ` — ${step.reasons.join(' • ')}` : ''),
    );
    section.append(row);
  }
  return section;
}

function diagnosticList(root, diagnostics) {
  const section = element(root, 'section');
  section.dataset.role = 'lafea-diagnostics';
  section.dataset.guidedRole = 'findings';
  section.append(element(root, 'h3', null, 'Current findings'));
  const list = element(root, 'ul');
  diagnostics.forEach((item) => {
    list.append(element(
      root,
      'li',
      null,
      `${item.severity ?? 'INFO'} ${item.code ?? 'UNKNOWN'} — ${item.message ?? ''}`,
    ));
  });
  section.append(list);
  return section;
}

function truthPanel(root, registryEntry) {
  const section = element(root, 'section', 'lafea-workbench__truth');
  section.append(
    element(root, 'h3', null, 'Current authority and limitations'),
    element(
      root,
      'p',
      null,
      `Declared engine: ${registryEntry.enginePackage ? `src/core/${registryEntry.enginePackage}` : 'NONE'}`,
    ),
    element(root, 'p', null, `Authority: ${registryEntry.authority}`),
  );
  const limitations = element(root, 'ul');
  registryEntry.limitations.forEach((value) => limitations.append(element(root, 'li', null, value)));
  section.append(limitations);
  return section;
}

function navigateTo(shell, targetName) {
  const target = shell.querySelector(`[data-guided-target="${targetName}"]`);
  target?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}
