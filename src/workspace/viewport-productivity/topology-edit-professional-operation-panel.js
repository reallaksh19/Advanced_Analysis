const OPERATIONS = Object.freeze([
  ['EXTEND_EDGE', 'Extend open edge'],
  ['SHORTEN_EDGE', 'Shorten open edge'],
  ['SPLIT_EDGE_FROM_DISTANCE', 'Split edge by distance'],
  ['INSERT_INLINE_COMPONENT', 'Insert inline component'],
  ['RECONNECT_ENDPOINTS', 'Reconnect open endpoints'],
  ['MOVE_CONNECTED_RUN', 'Move connected run'],
  ['CREATE_ORTHOGONAL_OFFSET', 'Create orthogonal offset'],
  ['APPLY_DECLARED_SLOPE', 'Apply declared slope'],
]);

export function renderTopologyEditProfessionalOperationPanel(element, state = {}) {
  if (!element) throw new TypeError('TopologyEditProfessionalOperationPanel: element is required.');
  const values = state.values ?? {};
  const plan = state.plan;
  const candidate = state.candidate;
  const validation = state.validation;
  const transaction = state.transaction;
  const catalogueRecords = filteredCatalogueRecords(
    state.catalogue?.records ?? [],
    state.componentContext,
    values.operationType,
  );
  const catalogueOptions = catalogueRecords.map((record) => (
    `<option value="${attr(record.recordId)}"${record.recordId === values.catalogueRecordId ? ' selected' : ''}>${html(catalogueRecordLabel(record))}</option>`
  )).join('');
  const operationOptions = OPERATIONS.map(([value, label]) => (
    `<option value="${value}"${value === (values.operationType ?? 'EXTEND_EDGE') ? ' selected' : ''}>${label}</option>`
  )).join('');
  const unresolved = plan?.unresolvedEvidence?.map((row) => row.code).join(', ') || '';
  const blocking = Number(state.blockingIssueCount ?? 0);

  element.innerHTML = `
    <header class="topology-edit-professional-operation__header">
      <div>
        <strong>Professional engineering operation</strong>
        <p>Plans are exact-ID, catalogue-bound, candidate-certified, worker-validated, and applied atomically.</p>
      </div>
      <output aria-live="polite">${html(state.error || state.message || 'Ready.')}</output>
    </header>
    ${componentHud(state.componentContext)}
    <div class="topology-edit-professional-operation__grid">
      ${field('Operation', select('professional-operation-type', operationOptions))}
      ${field('Edge ID', input('professional-edge-id', values.edgeId))}
      ${field('Endpoint', select('professional-endpoint', options(['FROM', 'TO'], values.endpoint ?? 'TO')))}
      ${field('Distance (mm)', input('professional-distance-mm', values.distanceMm ?? 100, 'number'))}
      ${field('Inline center from FROM (mm)', input('professional-center-distance-mm', values.centerDistanceMm ?? values.distanceMm ?? 100, 'number'))}
      ${field('Inline component length (mm)', input('professional-insertion-length-mm', values.insertionLengthMm ?? '', 'number', 'Required for flange/reducer'))}
      ${field('Inline direction', select('professional-inline-direction', options(['FROM_TO', 'TO_FROM'], values.inlineDirection ?? 'FROM_TO')))}
      ${field('Node IDs', input('professional-node-ids', values.nodeIds, 'text', 'node:a, node:b'))}
      ${field('Boundary node IDs', input('professional-boundary-node-ids', values.boundaryNodeIds, 'text', 'node:outside'))}
      ${field('From node ID', input('professional-from-node-id', values.fromNodeId))}
      ${field('Corner node ID', input('professional-corner-node-id', values.cornerNodeId))}
      ${field('To node ID', input('professional-to-node-id', values.toNodeId))}
      ${field('Diameter (mm)', input('professional-diameter-mm', values.diameterMm ?? 100, 'number'))}
      ${field('Entity type', input('professional-entity-type', values.entityType ?? 'PIPE'))}
      ${field('Delta X (mm)', input('professional-delta-x', values.deltaX ?? 0, 'number'))}
      ${field('Delta Y (mm)', input('professional-delta-y', values.deltaY ?? 0, 'number'))}
      ${field('Delta Z (mm)', input('professional-delta-z', values.deltaZ ?? 0, 'number'))}
      ${field('Ordered slope node IDs', input('professional-ordered-node-ids', values.orderedNodeIds, 'text', 'node:a, node:b'))}
      ${field('Slope rise (mm)', input('professional-rise-mm', values.riseMm ?? 1, 'number'))}
      ${field('Slope run (mm)', input('professional-run-mm', values.runMm ?? 100, 'number'))}
      ${field('Slope direction', select('professional-direction', options(['ASCENDING', 'DESCENDING'], values.direction ?? 'ASCENDING')))}
      ${field('Catalogue record', `<select data-role="professional-catalogue-record"${catalogueRecords.length ? '' : ' disabled'}><option value="">${catalogueRecords.length ? 'Select exact record' : 'No matching record'}</option>${catalogueOptions}</select>`)}
    </div>
    <div class="topology-edit-professional-operation__actions" role="toolbar" aria-label="Professional engineering operation actions">
      <button type="button" data-action="plan-professional-operation"${state.catalogue ? '' : ' disabled'}>Plan</button>
      <button type="button" data-action="validate-professional-operation"${candidate && !unresolved && !state.validationPending ? '' : ' disabled'}>Validate candidate</button>
      <button type="button" data-action="cancel-professional-validation"${state.validationPending ? '' : ' disabled'}>Cancel validation</button>
      <button type="button" data-action="apply-professional-operation"${validation && !blocking && state.transactionPreview ? '' : ' disabled'}>Apply atomically</button>
      <button type="button" data-action="clear-professional-operation"${plan || validation ? '' : ' disabled'}>Clear</button>
      <button type="button" data-action="undo-professional-operation"${state.canUndoTransaction ? '' : ' disabled'}>Undo operation</button>
      <button type="button" data-action="redo-professional-operation"${state.canRedoTransaction ? '' : ' disabled'}>Redo operation</button>
    </div>
    <dl class="topology-edit-professional-operation__evidence">
      <div><dt>Catalogue</dt><dd>${html(state.catalogue?.catalogueHash ?? 'unavailable')}</dd></div>
      <div><dt>Component context</dt><dd>${html(state.componentContext?.contextHash ?? 'none')}</dd></div>
      <div><dt>Plan</dt><dd>${html(plan?.planHash ?? plan?.resultHash ?? 'none')}</dd></div>
      <div><dt>Unresolved</dt><dd>${html(unresolved || 'none')}</dd></div>
      <div><dt>Certified candidate</dt><dd>${html(candidate?.candidateHash ?? 'none')}</dd></div>
      <div><dt>Candidate topology</dt><dd>${html(candidate?.resultingCanonicalHash ?? 'none')}</dd></div>
      <div><dt>Validation</dt><dd>${html(validation?.validationHash ?? (state.validationPending ? 'running' : 'none'))}</dd></div>
      <div><dt>Validation status</dt><dd>${html(validation?.status ?? 'none')}</dd></div>
      <div><dt>In-scope blocking findings</dt><dd>${blocking}</dd></div>
      <div><dt>Transaction preview</dt><dd>${html(state.transactionPreview?.previewHash ?? 'none')}</dd></div>
      <div><dt>Transaction</dt><dd>${html(transaction?.transactionHash ?? 'none')}</dd></div>
    </dl>`;
}

export function readTopologyEditProfessionalOperationValues(element) {
  const value = (role) => element?.querySelector(`[data-role="${role}"]`)?.value ?? '';
  return Object.freeze({
    operationType: value('professional-operation-type'),
    edgeId: value('professional-edge-id'),
    endpoint: value('professional-endpoint'),
    distanceMm: value('professional-distance-mm'),
    centerDistanceMm: value('professional-center-distance-mm'),
    insertionLengthMm: value('professional-insertion-length-mm'),
    inlineDirection: value('professional-inline-direction'),
    nodeIds: value('professional-node-ids'),
    boundaryNodeIds: value('professional-boundary-node-ids'),
    fromNodeId: value('professional-from-node-id'),
    cornerNodeId: value('professional-corner-node-id'),
    toNodeId: value('professional-to-node-id'),
    diameterMm: value('professional-diameter-mm'),
    entityType: value('professional-entity-type'),
    deltaX: value('professional-delta-x'),
    deltaY: value('professional-delta-y'),
    deltaZ: value('professional-delta-z'),
    orderedNodeIds: value('professional-ordered-node-ids'),
    riseMm: value('professional-rise-mm'),
    runMm: value('professional-run-mm'),
    direction: value('professional-direction'),
    catalogueRecordId: value('professional-catalogue-record'),
  });
}

function componentHud(context) {
  if (!context || context.status === 'NO_SELECTION' || context.status === 'UNSUPPORTED') {
    return '';
  }
  const fields = (context.fieldSchema ?? []).map((row) => `
    <div data-field-key="${attr(row.key)}">
      <dt>${html(row.label)}</dt>
      <dd>${html(formatFieldValue(row.value, row.unit))}<small>${html(row.source)}</small></dd>
    </div>`).join('');
  const diagnostic = context.diagnostics?.[0]?.message ?? '';
  return `
    <section class="topology-edit-component-hud" data-role="topology-edit-component-hud" data-component-type="${attr(context.componentType)}" data-context-status="${attr(context.status)}" aria-label="Selected component engineering context">
      <header>
        <div><strong>${html(context.componentType)}</strong><span>${html(context.selectedCanonicalId)}</span></div>
        <output>${html(context.status)}</output>
      </header>
      <p>${html(diagnostic)}</p>
      <dl>${fields}</dl>
      <small>${context.candidateRecordIds.length} governed catalogue candidate(s)</small>
    </section>`;
}

function filteredCatalogueRecords(records, context, operationType) {
  if (operationType === 'INSERT_INLINE_COMPONENT' && !context?.supported) {
    return records.filter((record) => ['FLANGE', 'VALVE', 'REDUCER'].includes(record.componentType));
  }
  if (!context?.supported) return records;
  const ids = new Set(context.candidateRecordIds ?? []);
  return records.filter((record) => ids.has(record.recordId));
}

function catalogueRecordLabel(record) {
  const details = {
    FLANGE: [record.flangeClass, record.flangeFacing],
    VALVE: [record.valveType, `${record.valveFaceToFaceMm} mm F2F`],
    REDUCER: [
      `${record.nominalSizeMm}→${record.secondaryNominalSizeMm} mm`,
      record.reducerOrientation,
    ],
  }[record.componentType] ?? [record.componentType];
  return [record.recordId, ...details.filter(Boolean)].join(' · ');
}

function formatFieldValue(value, unit) {
  if (value === null || value === undefined || value === '') return 'Unresolved';
  return unit ? `${value} ${unit}` : String(value);
}

function field(label, control) {
  return `<label><span>${html(label)}</span>${control}</label>`;
}
function input(role, value = '', type = 'text', placeholder = '') {
  return `<input data-role="${role}" type="${type}" value="${attr(value)}"${placeholder ? ` placeholder="${attr(placeholder)}"` : ''}>`;
}
function select(role, optionMarkup) {
  return `<select data-role="${role}">${optionMarkup}</select>`;
}
function options(values, selected) {
  return values.map((value) => `<option value="${attr(value)}"${value === selected ? ' selected' : ''}>${html(value)}</option>`).join('');
}
function html(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}
function attr(value) { return html(value); }
