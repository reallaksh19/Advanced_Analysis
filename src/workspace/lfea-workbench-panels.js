/**
 * Toolbar, node-draft, and result panels for the LFEA workbench.
 *
 * Panels consume immutable state and retained evidence. They do not mutate the
 * package or calculate any engineering quantity.
 */
import {
  workbenchButton,
  workbenchElement,
  workbenchJsonBlock,
} from './workbench-dom.js';
import { lfeaResultTable } from './lfea-workbench-tables.js';
import { qualityEvidenceRows } from './lfea-quality-adapter.js';

export function renderLfeaToolbar(root, state, modes, handlers) {
  const toolbar = workbenchElement(root, 'div', 'lfea-workbench__toolbar');
  const mock = workbenchButton(root, '[SIMULATED] Load Mock Data', handlers.onMock);
  mock.dataset.role = 'lfea-mock';
  mock.dataset.mockData = 'true';
  const fileLabel = workbenchElement(root, 'label', null, 'Import mesh package ');
  const file = workbenchElement(root, 'input');
  file.type = 'file';
  file.accept = '.json,application/json';
  file.dataset.role = 'lfea-import';
  file.addEventListener('change', () => handlers.onFile(file.files?.[0] ?? null));
  fileLabel.append(file);
  const run = workbenchButton(root, 'Validate, adapt & solve', handlers.onRun);
  run.dataset.role = 'lfea-run';
  run.disabled = !state.packageValue || state.status === 'RUNNING';
  const cancel = workbenchButton(root, 'Cancel run', handlers.onCancelRun);
  cancel.hidden = state.status !== 'RUNNING';
  const benchmark = workbenchButton(root, 'Run Benchmark', handlers.onBenchmark);
  benchmark.dataset.role = 'lfea-benchmark';
  const exportDocument = workbenchButton(
    root,
    'Export mesh package',
    handlers.onExportDocument,
  );
  exportDocument.disabled = !state.packageValue;
  const exportEvidence = workbenchButton(
    root,
    'Export evidence bundle',
    handlers.onExportEvidence,
  );
  exportEvidence.dataset.role = 'lfea-export-evidence';
  exportEvidence.disabled = !isCurrentExecution(state)
    || state.execution?.evidenceExport?.status !== 'QUALIFIED_EXPORT';
  const undo = workbenchButton(root, 'Undo', handlers.onUndo);
  undo.disabled = !state.past.length;
  const redo = workbenchButton(root, 'Redo', handlers.onRedo);
  redo.disabled = !state.future.length;
  const mode = resultModeSelect(root, state, modes, handlers);
  toolbar.append(
    mock,
    fileLabel,
    run,
    cancel,
    benchmark,
    exportDocument,
    exportEvidence,
    undo,
    redo,
    mode,
  );
  if (hasQualifiedDisplacements(state.execution)) {
    toolbar.append(deformationScaleInput(root, state, handlers));
  }
  if (state.progress) toolbar.append(progressOutput(root, state.progress));
  return toolbar;
}

export function renderLfeaNodeDraftEditor(root, nodeDraft, handlers) {
  const form = workbenchElement(root, 'div', 'lfea-workbench__node-draft');
  if (!nodeDraft) {
    form.append(workbenchElement(
      root,
      'p',
      null,
      'Select or drag a node to preview coordinates before committing.',
    ));
    return form;
  }
  const x = coordinateInput(root, 'X', nodeDraft.x);
  const y = coordinateInput(root, 'Y', nodeDraft.y);
  const preview = () => handlers.onPreviewNode(
    nodeDraft.nodeId,
    Number(x.input.value),
    Number(y.input.value),
  );
  x.input.addEventListener('change', preview);
  y.input.addEventListener('change', preview);
  form.append(
    workbenchElement(root, 'strong', null, nodeDraft.nodeId),
    x.label,
    y.label,
    workbenchButton(root, `Apply ${nodeDraft.nodeId}`, handlers.onCommitNode),
    workbenchButton(root, 'Revert preview', handlers.onCancelNode),
  );
  return form;
}

export function renderLfeaResults(root, state) {
  const wrapper = workbenchElement(root, 'div', 'lfea-workbench__results');
  if (state.diagnostics?.length) {
    wrapper.append(diagnosticsBlock(root, state.diagnostics));
  }
  const execution = state.execution;
  if (!execution) {
    wrapper.append(workbenchElement(
      root,
      'p',
      null,
      'No solve has been run for this mesh package.',
    ));
    return wrapper;
  }
  wrapper.append(authorityPolicy(root, execution), preflight(root, execution));
  if (execution.result) {
    wrapper.append(
      lfeaResultTable(root, 'Displacements', execution.result.nodalDisplacements ?? []),
      lfeaResultTable(root, 'Reactions', execution.result.reactions ?? []),
      lfeaResultTable(root, 'Raw stress', rawStressRows(execution.result)),
      lfeaResultTable(
        root,
        'Mesh quality evidence — no acceptance threshold applied',
        qualityEvidenceRows(execution.result),
      ),
    );
  }
  if (execution.stressProjection) {
    wrapper.append(
      workbenchElement(
        root,
        'h3',
        null,
        'Projected stress — NON-AUTHORITATIVE REVIEW PROJECTION',
      ),
      lfeaResultTable(
        root,
        'Projected nodal stress',
        execution.stressProjection.nodalValues ?? [],
      ),
    );
  }
  wrapper.append(workbenchJsonBlock(
    root,
    reviewSummary(execution),
    'lfea-review-summary',
  ));
  return wrapper;
}

function resultModeSelect(root, state, modes, handlers) {
  const select = workbenchElement(root, 'select');
  select.dataset.role = 'lfea-result-mode';
  for (const value of modes) {
    const option = workbenchElement(root, 'option', null, value.replaceAll('_', ' '));
    option.value = value;
    option.selected = value === state.display.resultMode;
    option.disabled = value === 'DEFORMED'
      ? !hasQualifiedDisplacements(state.execution)
      : value === 'PROJECTED_STRESS' && !state.execution?.stressProjection;
    select.append(option);
  }
  select.addEventListener('change', () => handlers.onResultMode(select.value));
  return select;
}

function deformationScaleInput(root, state, handlers) {
  const label = workbenchElement(
    root,
    'label',
    'lfea-workbench__deformation-scale',
    `Deformation scale (${state.display.deformationScaleSource}) `,
  );
  const input = workbenchElement(root, 'input');
  input.type = 'number';
  input.step = 'any';
  input.min = '0';
  input.value = String(state.display.deformationScale);
  input.dataset.role = 'lfea-deformation-scale';
  input.addEventListener('change', () => handlers.onDeformationScale(input.value));
  label.append(input);
  return label;
}

function progressOutput(root, progress) {
  const output = workbenchElement(
    root,
    'output',
    'lfea-workbench__progress',
    `${progress.stage} ${progress.index}/${progress.total}`,
  );
  output.setAttribute('role', 'status');
  output.setAttribute('aria-live', 'polite');
  return output;
}

function coordinateInput(root, name, value) {
  const label = workbenchElement(root, 'label', null, `${name} `);
  const input = workbenchElement(root, 'input');
  input.type = 'number';
  input.step = 'any';
  input.value = String(value);
  input.setAttribute('aria-label', `${name} coordinate`);
  label.append(input);
  return { label, input };
}

function diagnosticsBlock(root, diagnostics) {
  const block = workbenchJsonBlock(root, diagnostics, 'lfea-diagnostics');
  const hasError = diagnostics.some((row) => row.severity === 'ERROR');
  block.setAttribute('role', hasError ? 'alert' : 'status');
  block.setAttribute('aria-live', hasError ? 'assertive' : 'polite');
  return block;
}

function authorityPolicy(root, execution) {
  return workbenchElement(
    root,
    'p',
    'lfea-workbench__authority',
    `Raw: ${execution.authorityPolicy.rawStress}. `
      + `Projected: ${execution.authorityPolicy.projectedStress}.`,
  );
}

function preflight(root, execution) {
  if (!execution.preflight) return workbenchElement(root, 'span');
  const value = workbenchElement(
    root,
    'p',
    'lfea-workbench__preflight',
    `Preflight ${execution.preflight.status} — `
      + `${execution.preflight.nodeCount} nodes, `
      + `${execution.preflight.elementCount} elements, `
      + `${execution.preflight.dofCount} DOF. `
      + execution.preflight.advice,
  );
  value.dataset.role = 'lfea-preflight';
  value.dataset.status = execution.preflight.status;
  return value;
}

function rawStressRows(result) {
  return Array.isArray(result.integrationPointResults)
    ? result.integrationPointResults
    : result.elementStresses ?? [];
}

function reviewSummary(execution) {
  return {
    pipelineStatus: execution.status,
    failedStage: execution.failedStage,
    solverStatus: execution.result?.status ?? null,
    reviewStatus: execution.review?.status ?? null,
    evidenceExportStatus: execution.evidenceExport?.status ?? null,
    authorityPolicy: execution.authorityPolicy,
    equilibriumTotals: execution.result?.equilibriumTotals ?? null,
    energyConsistency: execution.result?.energyConsistency ?? null,
  };
}

function hasQualifiedDisplacements(execution) {
  return execution?.result?.status === 'QUALIFIED'
    && Array.isArray(execution.result.nodalDisplacements)
    && execution.result.nodalDisplacements.length > 0;
}

function isCurrentExecution(state) {
  return Boolean(state.execution)
    && state.execution.inputSemanticHash === state.packageValue?.semanticHash
    && state.execution.inputModelVersion === state.modelVersion;
}
