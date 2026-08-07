const EDITABLE_TYPES = new Set(['VALVE', 'TEE']);

export function renderTopologyEditTableEngineeringEditor(row, stagedIntent, projection) {
  if (!EDITABLE_TYPES.has(row?.elementType)) return '';
  if (row.elementType === 'VALVE' && row.identity?.canonicalKind === 'EDGE') {
    return valveEditor(row, stagedIntent);
  }
  if (row.elementType === 'TEE' && row.identity?.canonicalKind === 'JUNCTION') {
    return teeReducerEditor(row, stagedIntent, projection);
  }
  return '';
}

export function describeTopologyEditTableIntent(intent) {
  if (intent?.intentKind === 'PIPE_LENGTH') {
    return `length ${display(intent.priorValue?.lengthMm)} → ${display(intent.requestedValue?.lengthMm)} mm · ${display(intent.geometryPolicy?.anchor)} / ${display(intent.geometryPolicy?.propagation)}`;
  }
  if (intent?.intentKind === 'VALVE_REPLACEMENT') {
    return `${display(intent.priorValue?.valveType)} → ${display(intent.requestedValue?.catalogueBinding?.valveType)} · F2F ${display(intent.priorValue?.lengthMm)} → ${display(intent.requestedValue?.catalogueBinding?.valveFaceToFaceMm)} mm · ${display(intent.geometryPolicy?.anchor)} / ${display(intent.geometryPolicy?.propagation)}`;
  }
  if (intent?.intentKind === 'TEE_REDUCER_RELATION') {
    return `branch ${display(intent.requestedValue?.branchPortKey)} · reducer ${display(intent.requestedValue?.reducerEdgeId)} · DN run ${display(intent.requestedValue?.runNominalSizeMm)} / branch ${display(intent.requestedValue?.teeBranchNominalSizeMm)} / downstream ${display(intent.requestedValue?.downstreamNominalSizeMm)}`;
  }
  return display(intent?.intentKind);
}

function valveEditor(row, stagedIntent) {
  const staged = stagedIntent?.intentKind === 'VALVE_REPLACEMENT' ? stagedIntent : null;
  const binding = staged?.requestedValue?.catalogueBinding ?? null;
  const catalogueJson = binding ? JSON.stringify(binding, null, 2) : '';
  const anchor = staged?.geometryPolicy?.anchor ?? 'FROM';
  const propagation = staged?.geometryPolicy?.propagation ?? 'DOWNSTREAM';
  const gate = token(row.fields?.valveType) === 'GATE';
  const disabled = gate ? '' : 'disabled';
  return `<section class="topology-edit-table__editor" data-table-editor-id="${esc(row.identity.canonicalId)}">
    ${identityHtml(row)}
    <p class="topology-edit-table__notice">M06 replaces an observed GATE valve in-place. Paste the exact BALL catalogue record; no catalogue value is inferred.</p>
    <div class="topology-edit-table__editor-grid">
      <label class="topology-edit-table__wide">Exact BALL catalogue JSON<textarea rows="7" spellcheck="false" data-table-edit-valve-catalogue placeholder='{"catalogueHash":"…","sourceHash":"…","recordId":"…","recordHash":"…","componentType":"VALVE","nominalSizeMm":80,"outsideDiameterMm":88.9,"pipingClass":"…","endConnectionFrom":"…","endConnectionTo":"…","valveType":"BALL","valveFaceToFaceMm":300,"sourceReference":{"documentId":"…","revision":"…","path":"…"}}'>${esc(catalogueJson)}</textarea></label>
      <label>Anchor<select data-table-edit-anchor><option ${anchor === 'FROM' ? 'selected' : ''}>FROM</option><option ${anchor === 'TO' ? 'selected' : ''}>TO</option></select></label>
      <label>Propagation<select data-table-edit-propagation><option ${propagation === 'DOWNSTREAM' ? 'selected' : ''}>DOWNSTREAM</option><option ${propagation === 'UPSTREAM' ? 'selected' : ''}>UPSTREAM</option></select></label>
      <button type="button" data-table-action="stage-valve-replacement" data-canonical-id="${esc(row.identity.canonicalId)}" ${disabled}>Stage GATE → BALL</button>
    </div>
    ${custodyHtml(row)}
  </section>`;
}

function teeReducerEditor(row, stagedIntent, projection) {
  const staged = stagedIntent?.intentKind === 'TEE_REDUCER_RELATION' ? stagedIntent : null;
  const selectedBranch = staged?.requestedValue?.branchPortKey ?? '';
  const selectedReducer = staged?.requestedValue?.reducerEdgeId ?? '';
  const bindings = [...(row.identity?.portBindings ?? [])]
    .filter((entry) => entry?.nodeId && entry?.portKey)
    .sort((left, right) => left.portKey.localeCompare(right.portKey));
  const reducers = (projection?.rows ?? [])
    .filter((candidate) => candidate.elementType === 'REDUCER'
      && candidate.identity?.canonicalKind === 'EDGE'
      && candidate.custody?.catalogueAuthority === 'EXACT'
      && candidate.custody?.catalogue)
    .sort((left, right) => left.identity.canonicalId.localeCompare(right.identity.canonicalId));
  const branchOptions = bindings.map((entry) => option(
    entry.portKey,
    `${entry.portKey} · ${entry.nodeId}`,
    entry.portKey === selectedBranch,
  )).join('');
  const reducerOptions = reducers.map((candidate) => option(
    candidate.identity.canonicalId,
    `${candidate.fields?.tag ?? candidate.identity.canonicalId} · ${candidate.identity.canonicalId}`,
    candidate.identity.canonicalId === selectedReducer,
  )).join('');
  return `<section class="topology-edit-table__editor" data-table-editor-id="${esc(row.identity.canonicalId)}">
    ${identityHtml(row)}
    <p class="topology-edit-table__notice">M10 binds one explicit TEE branch port to one directly connected reducer with exact catalogue custody. No branch role or reducer size is guessed.</p>
    <div class="topology-edit-table__editor-grid">
      <label>Branch port<select data-table-edit-tee-branch-port><option value="">Choose exact branch port…</option>${branchOptions}</select></label>
      <label>Reducer<select data-table-edit-tee-reducer><option value="">Choose exact reducer…</option>${reducerOptions}</select></label>
      <label>Run DN (mm)<input type="number" step="any" min="0" data-table-edit-tee-run-dn value="${esc(staged?.requestedValue?.runNominalSizeMm ?? row.fields?.runDnMm ?? '')}"></label>
      <label>TEE branch DN (mm)<input type="number" step="any" min="0" data-table-edit-tee-branch-dn value="${esc(staged?.requestedValue?.teeBranchNominalSizeMm ?? row.fields?.branchDnMm ?? '')}"></label>
      <label>Downstream DN (mm)<input type="number" step="any" min="0" data-table-edit-tee-downstream-dn value="${esc(staged?.requestedValue?.downstreamNominalSizeMm ?? '')}"></label>
      <button type="button" data-table-action="stage-tee-reducer-relation" data-canonical-id="${esc(row.identity.canonicalId)}">Stage TEE / reducer relation</button>
    </div>
    ${custodyHtml(row)}
  </section>`;
}

function identityHtml(row) {
  return `<div class="topology-edit-table__identity"><strong>${esc(row.fields?.tag ?? row.identity.canonicalId)}</strong><code>${esc(row.identity.canonicalId)}</code><span>${esc(row.elementType)}</span></div>`;
}
function custodyHtml(row) {
  return `<div class="topology-edit-table__custody"><span>Source ${esc(row.custody?.sourceStatus)}</span><span>Catalogue ${esc(row.custody?.catalogueAuthority)}</span><span>Revision ${esc(shortHash(row.targetRevision))}</span></div>`;
}
function option(value, label, selected) {
  return `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;
}
function display(value) { return value === null || value === undefined || value === '' ? '—' : String(value); }
function token(value) { return String(value ?? '').trim().toUpperCase(); }
function shortHash(value) {
  const text = String(value ?? '');
  return text.length > 16 ? `${text.slice(0, 13)}…` : text;
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
