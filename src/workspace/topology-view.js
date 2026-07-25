export function renderTopologySummary(documentRef, graph, status = {}, toleranceValue = '') {
  const section = documentRef.createElement('section');
  section.className = 'topology-summary';
  section.dataset.role = 'topology-card';
  section.setAttribute('aria-label', 'Piping port topology');
  section.append(heading(documentRef));
  if (!graph) return renderEmpty(documentRef, section);
  section.dataset.topologyHash = graph.semanticHash;
  section.append(summaryGrid(documentRef, graph));
  section.append(profileLine(documentRef, graph.profile));
  section.append(toleranceControls(documentRef, graph, toleranceValue));
  section.append(actionButtons(documentRef));
  const statusLine = topologyStatus(documentRef, status);
  if (statusLine) section.append(statusLine);
  return section;
}

function heading(documentRef) {
  const header = documentRef.createElement('header');
  const eyebrow = documentRef.createElement('span');
  eyebrow.className = 'panel-eyebrow';
  eyebrow.textContent = 'Piping topology/v1';
  const title = documentRef.createElement('h3');
  title.textContent = 'Topology Health';
  header.append(eyebrow, title);
  return header;
}

function renderEmpty(documentRef, section) {
  const empty = documentRef.createElement('p');
  empty.className = 'panel-empty';
  empty.textContent = 'Import a dataset to build exact component-port topology.';
  section.append(empty);
  return section;
}

function summaryGrid(documentRef, graph) {
  const grid = documentRef.createElement('dl');
  grid.className = 'topology-summary__grid';
  const rows = [
    ['Components', graph.summary.componentCount],
    ['Ports', graph.summary.portCount],
    ['Connections', graph.summary.connectionCount],
    ['Connected components', graph.summary.connectedComponentCount],
    ['Unconnected ports', graph.summary.unconnectedPortCount],
    ['Ambiguous ports', graph.summary.ambiguousPortCount],
    ['Cycles', graph.summary.cycleCount],
  ];
  rows.forEach(([label, value]) => grid.append(term(documentRef, label), detail(documentRef, value)));
  return grid;
}

function profileLine(documentRef, profile) {
  const line = documentRef.createElement('p');
  line.className = 'topology-summary__profile';
  line.dataset.role = 'topology-active-profile';
  const tolerance = profile.allowToleranceInference ? ` · tolerance ${profile.tolerance} ${profile.lengthUnit}` : '';
  line.textContent = `Active profile: ${profile.profileId}${tolerance}`;
  return line;
}

function toleranceControls(documentRef, graph, toleranceValue) {
  const wrapper = documentRef.createElement('label');
  wrapper.className = 'topology-summary__tolerance';
  const label = documentRef.createElement('span');
  label.textContent = `Tolerance (${graph.profile.lengthUnit})`;
  const input = documentRef.createElement('input');
  input.type = 'number';
  input.min = '0';
  input.step = 'any';
  input.inputMode = 'decimal';
  input.dataset.role = 'topology-tolerance';
  input.value = toleranceValue;
  input.placeholder = 'Positive value';
  wrapper.append(label, input);
  return wrapper;
}

function actionButtons(documentRef) {
  const wrapper = documentRef.createElement('div');
  wrapper.className = 'topology-summary__actions';
  wrapper.append(
    actionButton(documentRef, 'exact', 'Rebuild Exact Topology'),
    actionButton(documentRef, 'tolerance', 'Rebuild With Tolerance'),
    actionButton(documentRef, 'export', 'Export Topology Graph'),
  );
  return wrapper;
}

function actionButton(documentRef, action, label) {
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.dataset.topologyAction = action;
  button.textContent = label;
  return button;
}

function topologyStatus(documentRef, status) {
  if (!status.state) return null;
  const output = documentRef.createElement('output');
  output.dataset.role = 'topology-status';
  output.className = status.state === 'failed' ? 'topology-summary__status topology-summary__status--failed' : 'topology-summary__status';
  output.textContent = statusMessage(status);
  return output;
}

function statusMessage(status) {
  if (status.state === 'exported') return `Exported ${status.filename} (${status.byteLength} bytes)`;
  if (status.state === 'rebuilt') return `Topology rebuilt with ${status.profileId}.`;
  return status.message || 'Topology action failed.';
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
