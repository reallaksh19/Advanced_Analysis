import { TOPOLOGY_EDIT_ROUTE_TRACE_SCHEMA } from './topology-edit-route-trace-model.js';

export function renderTopologyEditRouteTracePanel(element, model, selection = null) {
  if (!element) throw new TypeError('Route trace panel element is required.');
  element.innerHTML = topologyEditRouteTraceMarkup(model, selection);
}

export function topologyEditRouteTraceMarkup(model, selection = null) {
  if (!model) return idleMarkup(selection);
  if (model.schema !== TOPOLOGY_EDIT_ROUTE_TRACE_SCHEMA) {
    throw new TypeError(`Route trace panel requires ${TOPOLOGY_EDIT_ROUTE_TRACE_SCHEMA}.`);
  }
  if (model.status !== 'READY') {
    return panelShell(
      `<p role="alert"><strong>${escapeHtml(model.status)}</strong>: ${escapeHtml(model.message)}</p>
       ${failureEvidence(model)}`,
      true,
      false,
    );
  }
  const edgeRows = model.edgeEvidence.map((edge, index) => `
    <tr data-route-edge="${escapeHtml(edge.edgeId)}">
      <td>${index + 1}</td>
      <td><code>${escapeHtml(edge.edgeId)}</code></td>
      <td>${escapeHtml(edge.fromNodeId)} → ${escapeHtml(edge.toNodeId)}</td>
      <td>${format(edge.lengthMm)} mm</td>
      <td>${escapeHtml(edge.componentKey || 'Not declared')}</td>
    </tr>`).join('');
  return panelShell(`
    <dl class="topology-edit-route-trace__summary">
      ${evidence('Mode', model.mode === 'POINT_TO_POINT' ? 'Point-to-point route' : 'Connected component')}
      ${evidence('Nodes', model.traceNodeCount)}
      ${evidence('Edges', model.traceEdgeCount)}
      ${evidence('Total length', `${format(model.totalLengthMm)} mm`)}
      ${evidence('Open endpoints', model.openEndpointIds.join(', ') || 'None')}
      ${evidence('Branch nodes', model.branchNodeIds.join(', ') || 'None')}
      ${evidence('Component keys', model.componentKeys.join(', ') || 'None declared')}
    </dl>
    <table class="topology-edit-route-trace__edges">
      <thead><tr><th>#</th><th>Edge</th><th>Direction</th><th>Length</th><th>Component</th></tr></thead>
      <tbody>${edgeRows}</tbody>
    </table>
    <p class="topology-edit-route-trace__hash">Route trace hash: <code>${escapeHtml(model.routeTraceHash)}</code></p>`, true, true);
}

function idleMarkup(selection) {
  const nodeIds = Array.isArray(selection?.nodeIds) ? selection.nodeIds : [];
  const edgeId = String(selection?.edgeId ?? '').trim();
  const canTrace = nodeIds.length === 2 || Boolean(edgeId);
  const instruction = nodeIds.length === 2
    ? `Trace the exact canonical route from ${escapeHtml(nodeIds[0])} to ${escapeHtml(nodeIds[1])}.`
    : edgeId
      ? `Trace the complete connected component containing ${escapeHtml(edgeId)}.`
      : 'Select exactly two canonical nodes, or select one canonical edge.';
  return panelShell(`<p>${instruction}</p>`, canTrace, false);
}

function panelShell(content, canBuild, canFocus) {
  return `
    <header class="topology-edit-route-trace__header">
      <strong>Canonical route continuity</strong>
      <div class="topology-edit-route-trace__actions">
        <button type="button" data-action="build-route-trace"${canBuild ? '' : ' disabled'}>Trace route</button>
        <button type="button" data-action="focus-route-trace"${canFocus ? '' : ' disabled'}>Focus trace</button>
        <button type="button" data-action="clear-route-trace"${canBuild || canFocus ? '' : ' disabled'}>Clear trace</button>
      </div>
    </header>
    <div class="topology-edit-route-trace__body">${content}</div>`;
}

function failureEvidence(model) {
  const rows = [];
  if (model.requestedNodeIds?.length) rows.push(evidence('Requested nodes', model.requestedNodeIds.join(', ')));
  if (model.selectedEdgeId) rows.push(evidence('Selected edge', model.selectedEdgeId));
  if (model.invalidEdgeIds?.length) rows.push(evidence('Invalid edges', model.invalidEdgeIds.join(', ')));
  if (model.totalLengthMm !== null) rows.push(evidence('Equal minimum length', `${format(model.totalLengthMm)} mm`));
  return rows.length ? `<dl>${rows.join('')}</dl>` : '';
}

function evidence(label, value) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}
function format(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}
