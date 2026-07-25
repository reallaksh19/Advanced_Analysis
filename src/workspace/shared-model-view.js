export function renderSharedModelSummary(documentRef, model, status = {}) {
  const section = documentRef.createElement('section');
  section.className = 'shared-model-summary';
  section.dataset.role = 'shared-model-card';
  section.setAttribute('aria-label', 'Shared piping model');
  section.append(heading(documentRef));
  if (!model) return renderEmpty(documentRef, section);
  section.dataset.modelHash = model.semanticHash;
  section.append(summaryGrid(documentRef, model));
  section.append(hashLine(documentRef, model.semanticHash));
  section.append(exportButton(documentRef));
  const statusLine = exportStatus(documentRef, status);
  if (statusLine) section.append(statusLine);
  return section;
}

function heading(documentRef) {
  const header = documentRef.createElement('header');
  const eyebrow = documentRef.createElement('span');
  eyebrow.className = 'panel-eyebrow';
  eyebrow.textContent = 'Shared piping model/v1';
  const title = documentRef.createElement('h3');
  title.textContent = 'Reusable Model';
  header.append(eyebrow, title);
  return header;
}

function renderEmpty(documentRef, section) {
  const empty = documentRef.createElement('p');
  empty.className = 'panel-empty';
  empty.textContent = 'Import a dataset to build the shared piping model.';
  section.append(empty);
  return section;
}

function summaryGrid(documentRef, model) {
  const grid = documentRef.createElement('dl');
  grid.className = 'shared-model-summary__grid';
  const rows = [
    ['Components', model.summary.componentCount],
    ['Supports', model.summary.supportCount],
    ['Ports', model.summary.unconnectedPortCount],
    ['Diagnostics', model.summary.diagnosticCount],
  ];
  rows.forEach(([label, value]) => grid.append(term(documentRef, label), detail(documentRef, value)));
  return grid;
}

function term(documentRef, value) {
  const element = documentRef.createElement('dt');
  element.textContent = value;
  return element;
}

function detail(documentRef, value) {
  const element = documentRef.createElement('dd');
  element.textContent = String(value);
  return element;
}

function hashLine(documentRef, value) {
  const line = documentRef.createElement('p');
  line.className = 'shared-model-summary__hash';
  line.dataset.role = 'shared-model-hash';
  line.textContent = `Semantic hash: ${value}`;
  return line;
}

function exportButton(documentRef) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.dataset.sharedModelAction = 'export';
  button.textContent = 'Export Shared Model';
  return button;
}

function exportStatus(documentRef, status) {
  if (!status.state) return null;
  const output = documentRef.createElement('output');
  output.dataset.role = 'shared-model-export-status';
  output.textContent = status.state === 'completed'
    ? `Exported ${status.filename} (${status.byteLength} bytes)`
    : status.message;
  return output;
}
