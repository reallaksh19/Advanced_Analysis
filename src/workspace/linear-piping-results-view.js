import { requireLinearPipingPresentation } from '../core/linear-piping-presentation/index.js';

/**
 * Read-only DOM renderer for one CURRENT sealed piping presentation.
 *
 * This module formats already recovered and assessed records. It does not
 * calculate reactions, transform vectors, transfer moments, derive stress,
 * choose combinations or calculate utilization.
 */
export function renderLinearPipingResultsView(root, presentation) {
  if (!root || typeof root.replaceChildren !== 'function') {
    throw new TypeError('Linear piping results view requires a DOM root.');
  }
  const accepted = requireLinearPipingPresentation(presentation);
  const documentRef = root.ownerDocument ?? document;
  const view = element(documentRef, 'section', 'linear-piping-results');
  view.dataset.currency = accepted.currency;
  view.dataset.status = accepted.status;
  view.dataset.exportEligibility = accepted.exportEligibility;

  view.append(
    renderHeader(documentRef, accepted),
    renderSummary(documentRef, accepted),
    renderInterfaceTable(documentRef, accepted),
    renderNozzleTable(documentRef, accepted),
    renderCodeTable(documentRef, accepted),
    renderLimitations(documentRef, accepted),
  );
  root.replaceChildren(view);
  return view;
}

function renderHeader(doc, value) {
  const header = element(doc, 'header', 'linear-piping-results__header');
  const title = element(doc, 'h2');
  title.textContent = `Linear Piping FEA — ${value.applicationId}`;
  const state = element(doc, 'p', 'linear-piping-results__state');
  state.textContent = [
    `Currency: ${value.currency}`,
    `Status: ${value.status}`,
    `Export: ${value.exportEligibility}`,
  ].join(' | ');
  const identity = element(doc, 'code', 'linear-piping-results__identity');
  identity.textContent = value.applicationResultSemanticHash;
  header.append(title, state, identity);
  return header;
}

function renderSummary(doc, value) {
  const section = sectionWithHeading(doc, 'Summary');
  const list = element(doc, 'dl', 'linear-piping-results__summary');
  for (const [label, key] of [
    ['Analyses', 'analysisCount'],
    ['Interface results', 'interfaceResultCount'],
    ['Nozzle assessments', 'nozzleAssessmentCount'],
    ['B31.3 checks', 'codeCheckCount'],
    ['Nozzle PASS', 'nozzlePassCount'],
    ['Nozzle FAIL', 'nozzleFailCount'],
    ['Nozzle not configured', 'nozzleNotConfiguredCount'],
    ['Code qualified', 'codeQualifiedCount'],
    ['Code conditional', 'codeConditionalCount'],
  ]) {
    const term = element(doc, 'dt');
    term.textContent = label;
    const definition = element(doc, 'dd');
    definition.textContent = String(value.summary[key]);
    list.append(term, definition);
  }
  section.append(list);
  return section;
}

function renderInterfaceTable(doc, value) {
  const columns = [
    ['Interface', (row) => row.interfaceId],
    ['Kind', (row) => row.interfaceKind],
    ['Case', (row) => row.loadCaseId],
    ['Sign', (row) => row.reportingSignConvention],
    ['Fx local', (row) => numberWithUnit(row.forceLocal.x, row.units.force)],
    ['Fy local', (row) => numberWithUnit(row.forceLocal.y, row.units.force)],
    ['Fz local', (row) => numberWithUnit(row.forceLocal.z, row.units.force)],
    ['Mx ref', (row) => numberWithUnit(row.momentAtReferenceLocal.x, row.units.moment)],
    ['My ref', (row) => numberWithUnit(row.momentAtReferenceLocal.y, row.units.moment)],
    ['Mz ref', (row) => numberWithUnit(row.momentAtReferenceLocal.z, row.units.moment)],
    ['Recovery', (row) => row.recoverySemanticHash],
  ];
  return renderTableSection(doc, 'Support, anchor and nozzle interface actions', columns, value.interfaceRows);
}

function renderNozzleTable(doc, value) {
  const columns = [
    ['Nozzle', (row) => row.interfaceId],
    ['Case', (row) => row.loadCaseId],
    ['Assessment', (row) => row.assessmentStatus],
    ['Qualification', (row) => row.qualificationStatus],
    ['Utilization', (row) => numberText(row.utilization)],
    ['Governing term', (row) => `${row.governingTerm.termId} (${numberText(row.governingTerm.value)})`],
    ['Profile', (row) => row.profileSemanticHash],
    ['Assessment hash', (row) => row.semanticHash],
  ];
  return renderTableSection(doc, 'Configured nozzle assessments', columns, value.nozzleRows);
}

function renderCodeTable(doc, value) {
  const columns = [
    ['Check', (row) => row.checkId],
    ['Category', (row) => row.category],
    ['Component', (row) => row.componentId],
    ['Code point', (row) => row.codePointId],
    ['Combination', (row) => row.combinationId],
    ['Stress', (row) => numberWithUnit(row.calculatedStress, 'Pa')],
    ['Allowable', (row) => numberWithUnit(row.allowableStress, 'Pa')],
    ['Utilization', (row) => numberText(row.utilization)],
    ['Status', (row) => row.status],
    ['Result hash', (row) => row.semanticHash],
  ];
  return renderTableSection(doc, 'B31.3 application results', columns, value.codeRows);
}

function renderLimitations(doc, value) {
  const section = sectionWithHeading(doc, 'Limitations and configuration');
  const list = element(doc, 'ul', 'linear-piping-results__limitations');
  for (const code of value.notConfigured) {
    const item = element(doc, 'li');
    item.textContent = code;
    list.append(item);
  }
  for (const row of value.limitations) {
    const item = element(doc, 'li');
    const disclosure = row?.limitation?.disclosure
      ?? row?.limitation?.details?.disclosure
      ?? JSON.stringify(row?.limitation ?? row);
    item.textContent = `${row.sourceKind}:${row.sourceId} — ${disclosure}`;
    list.append(item);
  }
  if (list.childElementCount === 0) {
    const item = element(doc, 'li');
    item.textContent = 'No retained application limitations.';
    list.append(item);
  }
  section.append(list);
  return section;
}

function renderTableSection(doc, heading, columns, rows) {
  const section = sectionWithHeading(doc, heading);
  const table = element(doc, 'table', 'linear-piping-results__table');
  const thead = element(doc, 'thead');
  const headerRow = element(doc, 'tr');
  for (const [label] of columns) {
    const cell = element(doc, 'th');
    cell.scope = 'col';
    cell.textContent = label;
    headerRow.append(cell);
  }
  thead.append(headerRow);
  const tbody = element(doc, 'tbody');
  for (const row of rows) {
    const tr = element(doc, 'tr');
    for (const [, read] of columns) {
      const cell = element(doc, 'td');
      cell.textContent = String(read(row));
      tr.append(cell);
    }
    tbody.append(tr);
  }
  if (rows.length === 0) {
    const tr = element(doc, 'tr');
    const cell = element(doc, 'td');
    cell.colSpan = columns.length;
    cell.textContent = 'No current rows.';
    tr.append(cell);
    tbody.append(tr);
  }
  table.append(thead, tbody);
  section.append(table);
  return section;
}

function sectionWithHeading(doc, text) {
  const section = element(doc, 'section', 'linear-piping-results__section');
  const heading = element(doc, 'h3');
  heading.textContent = text;
  section.append(heading);
  return section;
}

function element(doc, tagName, className = '') {
  const value = doc.createElement(tagName);
  if (className) value.className = className;
  return value;
}

function numberWithUnit(value, unit) {
  return `${numberText(value)} ${unit}`;
}

function numberText(value) {
  if (!Number.isFinite(value)) throw new TypeError('Presentation encountered a non-finite value.');
  return String(Object.is(value, -0) ? 0 : value);
}
