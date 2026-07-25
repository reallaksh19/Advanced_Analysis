export function renderModelSupportLoadReadiness(documentRef, readiness, error = '') {
  const section = documentRef.createElement('section');
  section.className = 'analysis-card model-support-load-readiness';
  section.dataset.modelSupportLoad = 'readiness';

  const title = documentRef.createElement('h3');
  title.textContent = 'Whole-model support load';
  section.append(title);

  if (error) {
    section.append(paragraph(documentRef, error, 'analysis-error'));
    return section;
  }
  if (!readiness) {
    section.append(paragraph(documentRef, 'Load a staged JSON model to evaluate support-load readiness.', 'panel-empty'));
    return section;
  }

  const summary = documentRef.createElement('dl');
  summary.className = 'properties-grid';
  addRow(documentRef, summary, 'Scope', readiness.scope);
  addRow(documentRef, summary, 'Source nodes', readiness.sourceNodeCount);
  addRow(documentRef, summary, 'Load elements', readiness.elements.total);
  addRow(documentRef, summary, 'OPE ready', `${readiness.elements.opeReady}/${readiness.elements.total}`);
  addRow(documentRef, summary, 'HYD ready', `${readiness.elements.hydReady}/${readiness.elements.total}`);
  addRow(documentRef, summary, 'Usable supports', `${readiness.supports.usable}/${readiness.supports.total}`);
  addRow(documentRef, summary, 'Route distribution', readiness.readyForRoutePartitionedDistribution ? 'Ready' : 'Blocked');
  section.append(summary);

  if (readiness.distributionBlockers.length) {
    const list = documentRef.createElement('ul');
    list.className = 'analysis-limitation-list';
    readiness.distributionBlockers.forEach((blocker) => {
      const item = documentRef.createElement('li');
      item.textContent = blocker;
      list.append(item);
    });
    section.append(list);
  }
  return section;
}

function addRow(documentRef, list, label, value) {
  const term = documentRef.createElement('dt');
  term.textContent = label;
  const description = documentRef.createElement('dd');
  description.textContent = String(value);
  list.append(term, description);
}

function paragraph(documentRef, text, className) {
  const node = documentRef.createElement('p');
  node.className = className;
  node.textContent = text;
  return node;
}
