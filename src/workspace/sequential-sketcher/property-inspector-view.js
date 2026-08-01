/**
 * Renders source properties, canonical support-site data, and read-only load
 * evidence. Values are displayed only when present in source or calculation.
 */
export function buildPropertyInspector(documentRef, entity, supportPresenter, onClose) {
  const panel = documentRef.createElement('div');
  panel.className = 'sequential-sketcher-property-card';
  panel.style.cssText = 'background:#0f172a;border:1px solid #334155;border-radius:8px;padding:14px;color:#f8fafc;font-size:12px;display:flex;flex-direction:column;gap:8px;';
  panel.append(header(documentRef, entity, onClose));
  panel.append(section(documentRef, 'Identity and provenance', identityRows(entity)));
  const geometry = entity.properties?.geometry || {};
  panel.append(section(documentRef, 'Source geometry (mm, Z-up)', objectRows(geometry)));

  const supportSite = entity.properties?.supportSite;
  if (supportSite) panel.append(section(documentRef, 'Canonical support site', objectRows(supportSite)));
  const engineeringLoads = entity.properties?.engineeringSupportLoads;
  if (engineeringLoads) panel.append(section(documentRef, 'Empirical vertical support loads', loadRows(engineeringLoads)));

  const sourceAttributes = entity.properties?.attributes || {};
  panel.append(section(documentRef, 'Source attributes', objectRows(sourceAttributes)));
  const qualified = supportPresenter?.formatLoadInspectorProperties?.(entity) || {};
  if (Object.keys(qualified).length) panel.append(section(documentRef, 'Other qualified results', objectRows(qualified)));
  return panel;
}

function header(documentRef, entity, onClose) {
  const root = documentRef.createElement('header');
  root.style.cssText = 'display:flex;justify-content:space-between;gap:8px;border-bottom:1px solid #334155;padding-bottom:8px;';
  const text = documentRef.createElement('div');
  const type = documentRef.createElement('small');
  type.style.cssText = 'display:block;color:#38bdf8;font-weight:700;';
  type.textContent = String(entity.entityType || 'COMPONENT').toUpperCase();
  const title = documentRef.createElement('strong');
  title.style.cssText = 'display:block;font-size:14px;overflow-wrap:anywhere;';
  title.textContent = entity.name || entity.entityId;
  text.append(type, title); root.append(text);
  if (typeof onClose === 'function') {
    const button = documentRef.createElement('button');
    button.type = 'button'; button.textContent = 'Close'; button.addEventListener('click', onClose); root.append(button);
  }
  return root;
}

function section(documentRef, title, rows) {
  const root = documentRef.createElement('section');
  const heading = documentRef.createElement('h3');
  heading.style.cssText = 'margin:6px 0 2px;color:#7dd3fc;font-size:11px;text-transform:uppercase;';
  heading.textContent = title; root.append(heading);
  if (!rows.length) {
    const empty = documentRef.createElement('p');
    empty.style.cssText = 'margin:3px 0;color:#64748b;'; empty.textContent = 'No source-backed value.'; root.append(empty); return root;
  }
  const list = documentRef.createElement('dl');
  list.style.cssText = 'display:grid;grid-template-columns:minmax(110px,1fr) minmax(150px,2fr);gap:4px 8px;margin:0;';
  rows.forEach(([label, value]) => {
    const term = documentRef.createElement('dt'); term.style.color = '#94a3b8'; term.textContent = label;
    const description = documentRef.createElement('dd'); description.style.cssText = 'margin:0;font-family:monospace;overflow-wrap:anywhere;'; description.textContent = display(value);
    list.append(term, description);
  });
  root.append(list); return root;
}

function identityRows(entity) {
  return presentRows({
    'Entity ID': entity.entityId,
    'Source entity ID': entity.sourceEntityId,
    'Component reference': entity.componentReference,
    'Branch owner': entity.branchOwner || entity.branchId,
    'Line key': entity.lineKey,
    Service: entity.service,
    'Piping class': entity.pipingClass,
    'Nominal diameter (mm)': entity.nominalDiameterMm,
    'JSON pointer': entity.jsonPointer,
  });
}

function loadRows(value) {
  const rows = [];
  rows.push(['Freshness', value.freshness?.status]);
  (value.loadCases || []).forEach((loadCase) => {
    rows.push([`${loadCase.loadCaseId} status`, loadCase.status]);
    rows.push([`${loadCase.loadCaseId} verticalForceN`, loadCase.verticalForceN]);
    rows.push([`${loadCase.loadCaseId} contributors`, loadCase.contributorIds]);
    rows.push([`${loadCase.loadCaseId} exclusions`, loadCase.excludedInputs]);
  });
  return rows.filter(([, entry]) => entry !== undefined && entry !== null && entry !== '');
}

function objectRows(value) { return presentRows(value); }
function presentRows(value) { return Object.entries(value || {}).filter(([, entry]) => entry !== undefined && entry !== null && entry !== ''); }
function display(value) { return typeof value === 'object' ? JSON.stringify(value) : String(value); }
