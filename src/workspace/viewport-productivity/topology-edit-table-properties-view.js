import {
  topologyEditTableColumnsFor,
} from '../topology-edit/table/topology-edit-table-columns.js';
import {
  deriveTopologyEditTableCellCapability,
} from '../topology-edit/table/topology-edit-table-edit-capability.js';

const TYPE_ORDER = ['PIPE', 'ELBOW', 'FLANGE', 'VALVE', 'TEE', 'REDUCER', 'SUPPORT', 'COMPONENT', 'JUNCTION'];

export function topologyEditTableVisibleColumns(projection) {
  const rows = projection?.rows ?? [];
  const seen = new Map();
  addDescriptors(seen, topologyEditTableColumnsFor('COMPONENT'));
  const present = new Set(rows.map((row) => row.elementType));
  for (const type of TYPE_ORDER) {
    if (present.has(type)) addDescriptors(seen, topologyEditTableColumnsFor(type));
  }
  for (const type of [...present].sort()) {
    if (!TYPE_ORDER.includes(type)) addDescriptors(seen, topologyEditTableColumnsFor(type));
  }
  for (const row of rows) {
    for (const key of Object.keys(row.fields ?? {})) {
      if (!seen.has(key)) seen.set(key, fallbackDescriptor(key));
    }
  }
  return [...seen.values()];
}

export function renderTopologyEditTableAllProperties(row, runtime) {
  if (!row) return '';
  const descriptors = descriptorMap(row.elementType);
  const fieldKeys = orderedFieldKeys(row, descriptors);
  const projected = fieldKeys.map((key) => ({
    label: descriptors.get(key)?.label ?? humanLabel(key),
    value: row.fields?.[key],
    authority: row.fieldAuthority?.[key] ?? 'UNRESOLVED',
    capability: deriveTopologyEditTableCellCapability({
      row,
      columnKey: key,
      projection: runtime?.projection,
    }),
  }));
  const identity = [
    ['Canonical ID', row.identity?.canonicalId],
    ['Canonical kind', row.identity?.canonicalKind],
    ['Component key', row.identity?.componentKey],
    ['Entity ID', row.identity?.entityId],
    ['Source entity ID', row.identity?.sourceEntityId],
    ['Node IDs', row.identity?.nodeIds],
    ['Port bindings', row.identity?.portBindings],
    ['Target revision', row.targetRevision],
  ];
  const custody = Object.entries(row.custody ?? {}).map(([key, value]) => [humanLabel(key), value]);
  const source = sourcePropertyRows(sourceEntityFor(runtime, row));
  return `<section class="topology-edit-table__all-properties" data-table-all-properties>
    <header><strong>All properties</strong><span>${projected.length} projected · ${source.length} source/vendor</span></header>
    ${propertyTable('Identity', identity.map(([label, value]) => ({ label, value, authority: 'IDENTITY' })))}
    ${propertyTable('Engineering properties', projected, true)}
    ${propertyTable('Custody', custody.map(([label, value]) => ({ label, value, authority: 'READ_ONLY' })))}
    ${source.length ? propertyTable('Source / vendor properties (read-only)', source.map(([label, value]) => ({
      label, value, authority: 'SOURCE_OBSERVED',
    }))) : ''}
  </section>`;
}

export function topologyEditTableTypeSummary(rows = []) {
  const counts = new Map();
  for (const row of rows) counts.set(row.elementType, (counts.get(row.elementType) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([left], [right]) => typeRank(left) - typeRank(right) || left.localeCompare(right))
    .map(([type, count]) => `${typeLabel(type)} ${count}`)
    .join(' · ');
}

function propertyTable(title, rows, showCapability = false) {
  return `<details class="topology-edit-table__property-group" open>
    <summary>${escapeHtml(title)}</summary>
    <div class="topology-edit-table__property-scroll"><table aria-label="${escapeHtml(title)}">
      <thead><tr><th>Property</th><th>Value</th><th>Authority</th>${showCapability ? '<th>Capability</th>' : ''}</tr></thead>
      <tbody>${rows.map((row) => `<tr><th scope="row">${escapeHtml(row.label)}</th><td>${escapeHtml(display(row.value))}</td><td>${escapeHtml(row.authority)}</td>${showCapability ? `<td data-table-capability-status="${escapeHtml(row.capability?.status)}" data-table-capability-reason="${escapeHtml(row.capability?.reasonCode)}">${escapeHtml(capabilityText(row.capability))}</td>` : ''}</tr>`).join('')}</tbody>
    </table></div>
  </details>`;
}

function sourceEntityFor(runtime, row) {
  const ids = new Set([
    row.identity?.componentKey,
    row.identity?.entityId,
    row.identity?.sourceEntityId,
  ].filter(Boolean).map(String));
  return (runtime?.controller?.workspaceDataset?.entities ?? []).find((entity) => ids.has(String(entity.entityId))) ?? null;
}

function sourcePropertyRows(entity) {
  if (!entity) return [];
  const result = [];
  for (const key of Object.keys(entity).sort()) {
    if (key === 'properties') continue;
    result.push([key, entity[key]]);
  }
  flattenProperties(entity.properties, 'properties', result);
  return result;
}

function flattenProperties(value, prefix, result) {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    result.push([prefix, value]);
    return;
  }
  const keys = Object.keys(value).sort();
  if (!keys.length) {
    result.push([prefix, value]);
    return;
  }
  for (const key of keys) flattenProperties(value[key], `${prefix}.${key}`, result);
}

function descriptorMap(type) {
  return new Map(topologyEditTableColumnsFor(type).map((descriptor) => [descriptor.key, descriptor]));
}

function orderedFieldKeys(row, descriptors) {
  const result = [];
  const seen = new Set();
  for (const key of row.columnKeys ?? []) {
    if (!seen.has(key)) { seen.add(key); result.push(key); }
  }
  for (const key of Object.keys(row.fields ?? {}).sort()) {
    if (!seen.has(key) && row.fields[key] !== null && row.fields[key] !== undefined) {
      seen.add(key); result.push(key);
    }
  }
  for (const key of descriptors.keys()) {
    if (!seen.has(key) && row.fields?.[key] !== undefined) {
      seen.add(key); result.push(key);
    }
  }
  return result;
}

function capabilityText(capability) {
  if (!capability) return 'READ_ONLY';
  if (capability.status === 'AVAILABLE') return 'AVAILABLE';
  return `${capability.status} — ${capability.reason}`;
}
function addDescriptors(target, descriptors) {
  for (const descriptor of descriptors) if (!target.has(descriptor.key)) target.set(descriptor.key, descriptor);
}
function fallbackDescriptor(key) { return { key, label: humanLabel(key), valueType: 'text', readOnly: true, editor: null }; }
function humanLabel(key) { return String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()); }
function typeRank(type) { const index = TYPE_ORDER.indexOf(type); return index < 0 ? TYPE_ORDER.length : index; }
function typeLabel(type) { return type === 'ELBOW' ? 'BEND/ELBOW' : type; }
function display(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
