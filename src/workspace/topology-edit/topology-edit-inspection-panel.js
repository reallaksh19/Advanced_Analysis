import { TOPOLOGY_EDIT_INSPECTION_SCHEMA } from './topology-edit-inspection-model.js';

export function renderTopologyEditInspectionPanel(element, model) {
  if (!element) throw new TypeError('Inspection panel element is required.');
  element.innerHTML = topologyEditInspectionMarkup(model);
}

export function topologyEditInspectionMarkup(model) {
  if (model?.schema !== TOPOLOGY_EDIT_INSPECTION_SCHEMA) {
    throw new TypeError(`Inspection panel requires ${TOPOLOGY_EDIT_INSPECTION_SCHEMA}.`);
  }
  if (model.status === 'EMPTY') {
    return panelShell(
      'Canonical inspection',
      '<p>Select a canonical node, component, junction, support, or restraint.</p>',
      false,
    );
  }
  if (model.status === 'STALE_SELECTION') {
    return panelShell(
      'Canonical inspection',
      `<p role="alert">Selection is stale: ${escapeHtml(model.staleIds.join(', '))}.</p>`,
      true,
    );
  }
  const rows = [];
  for (const node of model.nodes) rows.push(nodeMarkup(node));
  if (model.edge) rows.push(edgeMarkup(model.edge));
  for (const entity of model.entities ?? []) rows.push(entityMarkup(entity));
  if (model.measurement) rows.push(measurementMarkup(model.measurement));
  rows.push(`<p class="topology-edit-inspection__hash">Inspection hash: <code>${escapeHtml(model.inspectionHash)}</code></p>`);
  return panelShell('Canonical inspection', rows.join(''), true);
}

function entityMarkup(entity) {
  const optional = [
    ['Component key', entity.componentKey],
    ['Node', entity.nodeId],
    ['Host edge', entity.hostEdgeId],
    ['Support', entity.supportId],
    ['Direction', entity.direction],
    ['Gap', nullableMillimetres(entity.gapMm)],
    ['Travel', nullableMillimetres(entity.travelMm)],
    ['Stiffness', nullableNumber(entity.stiffness, 'N/mm')],
    ['Restraints', entity.restraintCount],
    ['Restraint families', entity.restraintFamilies?.join(', ')],
    ['Source paths', entity.sourcePaths?.join(', ')],
  ].filter(([, value]) => value !== '' && value !== null && value !== undefined);
  return `<section data-inspection-entity="${escapeHtml(entity.canonicalId)}">
    <h4>${escapeHtml(entity.canonicalKind)} ${escapeHtml(entity.canonicalId)}</h4>
    <dl>
      ${evidence('Type', entity.entityType || 'Not declared')}
      ${optional.map(([label, value]) => evidence(label, value)).join('')}
    </dl>
  </section>`;
}

function panelShell(title, content, hasSelection) {
  return `
    <header class="topology-edit-inspection__header">
      <strong>${escapeHtml(title)}</strong>
      <div class="topology-edit-inspection__actions">
        <button type="button" data-action="focus-inspection"${hasSelection ? '' : ' disabled'}>Focus selection</button>
        <button type="button" data-action="clear-inspection"${hasSelection ? '' : ' disabled'}>Clear selection</button>
      </div>
    </header>
    <div class="topology-edit-inspection__body">${content}</div>`;
}

function nodeMarkup(node) {
  return `
    <section data-inspection-node="${escapeHtml(node.nodeId)}">
      <h4>Node ${escapeHtml(node.nodeId)}</h4>
      <dl>
        ${evidence('X', `${format(node.position.x)} mm`)}
        ${evidence('Y', `${format(node.position.y)} mm`)}
        ${evidence('Z', `${format(node.position.z)} mm`)}
        ${evidence('Degree', node.degree)}
        ${evidence('Incident edges', node.incidentEdgeIds.join(', ') || 'None')}
      </dl>
    </section>`;
}

function edgeMarkup(edge) {
  return `
    <section data-inspection-edge="${escapeHtml(edge.edgeId)}">
      <h4>Edge ${escapeHtml(edge.edgeId)}</h4>
      <dl>
        ${evidence('FROM', edge.fromNodeId)}
        ${evidence('TO', edge.toNodeId)}
        ${evidence('Component key', edge.componentKey || 'Not declared')}
        ${evidence('Component type', edge.componentType || 'Not declared')}
        ${evidence('Bore', nullableMillimetres(edge.boreMm))}
        ${evidence('Outside diameter', nullableMillimetres(edge.outsideDiameterMm))}
      </dl>
    </section>`;
}

function measurementMarkup(measurement) {
  const label = measurement.kind === 'NODE_DISTANCE'
    ? 'Two-node measurement'
    : 'Selected-edge measurement';
  return `
    <section data-inspection-measurement="${escapeHtml(measurement.kind)}">
      <h4>${label}</h4>
      <p><strong>CANONICAL COORDINATE MEASUREMENT — NOT ENGINEERING AUTHORITY</strong></p>
      <dl>
        ${evidence('FROM', measurement.fromId)}
        ${evidence('TO', measurement.toId)}
        ${evidence('ΔX', `${signed(measurement.delta.x)} mm`)}
        ${evidence('ΔY', `${signed(measurement.delta.y)} mm`)}
        ${evidence('ΔZ', `${signed(measurement.delta.z)} mm`)}
        ${evidence('Distance', `${format(measurement.distanceMm)} mm`)}
        ${evidence('Unit direction', direction(measurement.unitDirection))}
      </dl>
    </section>`;
}

function evidence(label, value) {
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}

function nullableMillimetres(value) {
  return value === null ? 'Not declared' : `${format(value)} mm`;
}

function nullableNumber(value, unit) {
  return value === null ? 'Not declared' : `${format(value)} ${unit}`;
}

function direction(value) {
  if (!value) return 'Undefined for zero length';
  return `(${signed(value.x)}, ${signed(value.y)}, ${signed(value.z)})`;
}

function signed(value) {
  const number = Number(value);
  const prefix = number > 0 ? '+' : '';
  return `${prefix}${format(number)}`;
}

function format(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('en', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}
