/** Read-only source-authority, lifecycle and readiness presentation. */
import { element } from './lafea-workbench-dom.js';

export function renderLafeaLifecyclePanel(rootElement, stageId, stage) {
  const panel = element(rootElement, 'section', 'lafea-lifecycle-panel');
  panel.dataset.role = 'lafea-lifecycle-panel';
  panel.dataset.stageId = stageId;
  const readiness = stage.lifecycleReadiness;
  const binding = stage.lifecycleBinding;
  panel.append(
    paragraph(rootElement, `Lifecycle source binding: ${binding.status}`),
    paragraph(rootElement, binding.reason
      ? `Binding reason: ${binding.reason}`
      : 'Binding reason: none; lifecycle authority is bound to the current editor revision.'),
    paragraph(rootElement, `Calculation state: ${readiness.calculationState}`),
    paragraph(rootElement, `Result state: ${readiness.resultState}`),
    paragraph(rootElement, `Code state: ${readiness.codeState}`),
    paragraph(rootElement, `Release state: ${readiness.releaseState}`),
  );

  if (!stage.lifecycle) {
    panel.append(paragraph(rootElement,
      'Lifecycle not initialized. No engineering source or artifact readiness is claimed.'));
    panel.append(authorityNotice(rootElement));
    return panel;
  }

  const artifacts = stage.lifecycle.artifacts;
  panel.append(
    paragraph(rootElement, `Lifecycle profile: ${stage.lifecycle.profileId}`),
    paragraph(rootElement, `Engineering source hash: ${stage.lifecycle.source.sourceHash}`),
    paragraph(rootElement, stage.sourceAuthority
      ? `Source authority: ${stage.sourceAuthority.schema} / ${stage.sourceAuthority.canonicalizationProfile}`
      : 'Source authority: external/manual opaque authority; automatic producer registration is disabled.'),
  );

  const readinessList = element(rootElement, 'dl', 'lafea-lifecycle-panel__readiness');
  appendDefinition(rootElement, readinessList, 'Source current', readiness.sourceCurrent);
  appendDefinition(rootElement, readinessList, 'Model current', readiness.modelCurrent);
  appendApplicableDefinition(rootElement, readinessList, 'Mesh generated',
    readiness.meshApplicable, readiness.meshGenerated);
  appendApplicableDefinition(rootElement, readinessList, 'Mesh qualified',
    readiness.meshApplicable, readiness.meshQualified);
  appendDefinition(rootElement, readinessList, 'Result ready', readiness.resultReady);
  appendApplicableDefinition(rootElement, readinessList, 'Screening assessment ready',
    readiness.assessmentApplicable, readiness.assessmentReady);
  appendApplicableDefinition(rootElement, readinessList, 'Convergence ready',
    readiness.convergenceApplicable, readiness.convergenceReady);
  appendApplicableDefinition(rootElement, readinessList, 'Code assessment ready',
    readiness.codeAssessmentApplicable, readiness.codeReady);
  appendDefinition(rootElement, readinessList, 'Report current', readiness.reportCurrent);
  appendDefinition(rootElement, readinessList, 'Report qualified', readiness.reportQualified);
  panel.append(readinessList);

  const table = element(rootElement, 'table', 'lafea-lifecycle-panel__artifacts');
  const head = element(rootElement, 'thead');
  const headRow = element(rootElement, 'tr');
  ['Artifact', 'State', 'Qualification', 'Engineering hash', 'Producer'].forEach((label) => {
    headRow.append(element(rootElement, 'th', null, label));
  });
  head.append(headRow);
  const body = element(rootElement, 'tbody');
  Object.values(artifacts).forEach((artifact) => {
    const row = element(rootElement, 'tr');
    row.dataset.artifactKind = artifact.kind;
    [artifact.kind, artifact.status, artifact.qualification,
      artifact.artifactHash ?? 'NONE', artifact.producerRef ?? 'NONE']
      .forEach((value) => row.append(element(rootElement, 'td', null, String(value))));
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
  list.append(element(rootElement, 'dt', null, label),
    element(rootElement, 'dd', null, value ? 'YES' : 'NO'));
}

function appendApplicableDefinition(rootElement, list, label, applicable, value) {
  list.append(element(rootElement, 'dt', null, label),
    element(rootElement, 'dd', null, applicable ? (value ? 'YES' : 'NO') : 'NOT APPLICABLE'));
}

function authorityNotice(rootElement) {
  return paragraph(rootElement,
    'CALCULATION_ACCEPTED_BY_STAGE_CONTRACT is distinct from RESULT_READY, CODE_READY and '
      + 'RELEASE_QUALIFIED. NB-T2 registers only explicit current-core producer records with '
      + 'canonical SHA-256 identities and exact current parent lineage; no code or release state is promoted.');
}
