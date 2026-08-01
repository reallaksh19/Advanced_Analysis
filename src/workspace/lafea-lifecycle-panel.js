/**
 * Read-only lifecycle/lineage presentation for the LAFEA workbench.
 *
 * This view consumes store-owned lifecycle state. It does not create hashes,
 * register artifacts, run calculations or promote retained calculation output.
 */
import { element } from './lafea-workbench-dom.js';

export function renderLafeaLifecyclePanel(rootElement, stageId, stage) {
  const panel = element(rootElement, 'section', 'lafea-lifecycle-panel');
  panel.dataset.role = 'lafea-lifecycle-panel';
  panel.dataset.stageId = stageId;

  const readiness = stage.lifecycleReadiness;
  const binding = stage.lifecycleBinding;
  panel.append(
    paragraph(rootElement, `Lifecycle source binding: ${binding.status}`),
    paragraph(
      rootElement,
      binding.reason
        ? `Binding reason: ${binding.reason}`
        : 'Binding reason: none; the retained lifecycle is bound to the current editor revision.',
    ),
  );

  if (!stage.lifecycle) {
    panel.append(paragraph(
      rootElement,
      'Lifecycle not initialized. No source, model, execution, result, mesh, recovery, convergence, assessment or report evidence is promoted.',
    ));
    panel.append(authorityNotice(rootElement));
    return panel;
  }

  const artifacts = stage.lifecycle.artifacts;
  panel.append(
    paragraph(rootElement, `Lifecycle profile: ${stage.lifecycle.profileId}`),
    paragraph(rootElement, `Opaque source hash: ${stage.lifecycle.source.sourceHash}`),
  );

  const readinessList = element(rootElement, 'dl', 'lafea-lifecycle-panel__readiness');
  appendDefinition(rootElement, readinessList, 'Source current', readiness.sourceCurrent);
  appendDefinition(rootElement, readinessList, 'Model current', readiness.modelCurrent);
  appendApplicableDefinition(
    rootElement,
    readinessList,
    'Mesh generated',
    'ANALYSIS_MESH' in artifacts,
    readiness.meshGenerated,
  );
  appendApplicableDefinition(
    rootElement,
    readinessList,
    'Mesh qualified',
    'ANALYSIS_MESH' in artifacts,
    readiness.meshQualified,
  );
  appendDefinition(rootElement, readinessList, 'Result ready', readiness.resultReady);
  appendApplicableDefinition(
    rootElement,
    readinessList,
    'Screening assessment ready',
    'SCREENING_ASSESSMENT' in artifacts,
    currentPass(artifacts.SCREENING_ASSESSMENT),
  );
  appendApplicableDefinition(
    rootElement,
    readinessList,
    'Convergence ready',
    'CONVERGENCE' in artifacts,
    currentPass(artifacts.CONVERGENCE),
  );
  appendApplicableDefinition(
    rootElement,
    readinessList,
    'Code assessment ready',
    'CODE_ASSESSMENT' in artifacts,
    readiness.codeReady,
  );
  appendDefinition(rootElement, readinessList, 'Report current', readiness.reportCurrent);
  panel.append(readinessList);

  const table = element(rootElement, 'table', 'lafea-lifecycle-panel__artifacts');
  const head = element(rootElement, 'thead');
  const headRow = element(rootElement, 'tr');
  ['Artifact', 'State', 'Qualification', 'Opaque hash', 'Producer'].forEach((label) => {
    headRow.append(element(rootElement, 'th', null, label));
  });
  head.append(headRow);
  const body = element(rootElement, 'tbody');
  Object.values(artifacts).forEach((artifact) => {
    const row = element(rootElement, 'tr');
    row.dataset.artifactKind = artifact.kind;
    [
      artifact.kind,
      artifact.status,
      artifact.qualification,
      artifact.artifactHash ?? 'NONE',
      artifact.producerRef ?? 'NONE',
    ].forEach((value) => row.append(element(rootElement, 'td', null, String(value))));
    body.append(row);
  });
  table.append(head, body);
  panel.append(table);

  if (readiness.blockingReasons.length) {
    const title = element(rootElement, 'h4', null, 'Blocking reasons');
    const reasons = element(rootElement, 'ul');
    readiness.blockingReasons.forEach((reason) => {
      reasons.append(element(rootElement, 'li', null, reason));
    });
    panel.append(title, reasons);
  }

  panel.append(authorityNotice(rootElement));
  return panel;
}

function paragraph(rootElement, text) {
  return element(rootElement, 'p', null, text);
}

function appendDefinition(rootElement, list, label, value) {
  list.append(
    element(rootElement, 'dt', null, label),
    element(rootElement, 'dd', null, value ? 'YES' : 'NO'),
  );
}

function appendApplicableDefinition(rootElement, list, label, applicable, value) {
  list.append(
    element(rootElement, 'dt', null, label),
    element(rootElement, 'dd', null, applicable ? (value ? 'YES' : 'NO') : 'NOT APPLICABLE'),
  );
}

function currentPass(artifact) {
  return artifact?.status === 'CURRENT' && artifact?.qualification === 'PASS';
}

function authorityNotice(rootElement) {
  return paragraph(
    rootElement,
    'A retained workbench calculation is not registered automatically as lifecycle evidence. '
      + 'Only explicit producer-owned artifact records authorized by the current stage profile '
      + 'and carrying current parent lineage may promote readiness.',
  );
}
