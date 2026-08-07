import { workbenchElement } from '../workbench-dom.js';

export function renderLfeaDiagnosticsDrawer(root, state) {
  const details = workbenchElement(root, 'details', 'lfea-shell-v2__diagnostics');
  details.dataset.role = 'lfea-diagnostics-drawer';
  details.open = state.status === 'FAILED'
    || state.diagnostics?.some((row) => row.severity === 'ERROR');

  const summary = workbenchElement(root, 'summary');
  summary.append(
    workbenchElement(root, 'strong', null, 'Diagnostics'),
    workbenchElement(root, 'span', null, `${state.diagnostics?.length ?? 0} current`),
  );
  details.append(summary);

  const body = workbenchElement(root, 'div', 'lfea-shell-v2__diagnostic-list');
  if (!state.diagnostics?.length) {
    body.append(workbenchElement(root, 'p', 'lfea-shell-v2__muted', 'No current diagnostics.'));
  } else {
    for (const diagnostic of state.diagnostics) body.append(diagnosticRow(root, diagnostic));
  }
  const raw = workbenchElement(root, 'pre');
  raw.dataset.role = 'lfea-diagnostics';
  raw.hidden = true;
  raw.textContent = JSON.stringify(state.diagnostics ?? [], null, 2);
  body.append(raw);
  details.append(body);
  return details;
}

function diagnosticRow(root, diagnostic) {
  const row = workbenchElement(root, 'article', 'lfea-shell-v2__diagnostic');
  row.dataset.severity = diagnostic.severity ?? 'INFO';
  const heading = workbenchElement(root, 'header');
  heading.append(
    workbenchElement(root, 'span', 'lfea-shell-v2__severity', diagnostic.severity ?? 'INFO'),
    workbenchElement(root, 'code', null, diagnostic.code ?? 'LFEA_DIAGNOSTIC'),
  );
  row.append(
    heading,
    workbenchElement(root, 'p', null, diagnostic.message ?? 'LFEA diagnostic.'),
  );
  if (diagnostic.reason) {
    row.append(workbenchElement(root, 'small', null, `Reason: ${diagnostic.reason}`));
  }
  return row;
}
