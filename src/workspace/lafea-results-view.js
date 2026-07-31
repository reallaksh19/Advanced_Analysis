/**
 * Accessible LAFEA result presentation boundary.
 *
 * The default view is stage-specific and unit-aware. Complete qualified
 * evidence remains available in a collapsed disclosure for audit/export.
 */
import {
  presentLafeaResult,
  resolveLafeaUnits,
} from './lafea-result-presenters/index.js';
import { renderLafeaShellResult } from './lafea-result-svg.js';

export function renderLafeaEvidence(root, stageId, documentValue, state, execution) {
  const wrapper = create(root, 'div', 'lafea-workbench__evidence');
  const diagnostics = state.diagnostics?.length ? state.diagnostics : execution?.diagnostics ?? [];
  if (diagnostics.length) wrapper.append(diagnosticsView(root, diagnostics));
  if (!execution) {
    wrapper.append(create(root, 'p', null, 'No calculation has been run for this stage.'));
    return wrapper;
  }
  const qualified = execution.status === 'QUALIFIED';
  const authority = create(
    root,
    'p',
    'lafea-workbench__authority',
    qualified
      ? 'Qualified result evidence from the stage-specific retained API.'
      : 'No authoritative result: the retained API rejected this document.',
  );
  wrapper.append(authority);
  if (qualified) {
    const units = resolveLafeaUnits(stageId, documentValue);
    const presentation = presentLafeaResult(stageId, execution.result, units);
    wrapper.append(presentationView(root, presentation));
    if (stageId === 'LAFEA.4') {
      const plot = create(root, 'div', 'lafea-workbench__result-plot');
      renderLafeaShellResult(plot, documentValue, execution.result, units);
      wrapper.append(plot);
    }
  }
  wrapper.append(rawEvidence(root, execution.result));
  return wrapper;
}

function presentationView(root, presentation) {
  const wrapper = create(root, 'div', 'lafea-result-presentation');
  for (const section of presentation.sections) {
    const block = create(root, 'section');
    block.append(create(root, 'h3', null, section.title), rowsTable(root, section.rows));
    wrapper.append(block);
  }
  if (presentation.governing) {
    wrapper.append(create(
      root,
      'p',
      'lafea-result-governing',
      `Governing retained evidence: ${presentation.governing.label} `
        + `${format(presentation.governing.value)} ${presentation.governing.unit}`,
    ));
  }
  if (presentation.limitations.length) {
    const list = create(root, 'ul', 'lafea-result-limitations');
    presentation.limitations.forEach((value) => list.append(create(root, 'li', null, String(value))));
    wrapper.append(create(root, 'h3', null, 'Limitations'), list);
  }
  return wrapper;
}

function rowsTable(root, rows) {
  const wrapper = create(root, 'div');
  let page = 0;
  const render = () => {
    const start = page * 100;
    const values = rows.slice(start, start + 100);
    const table = create(root, 'table', 'lafea-result-table');
    const head = create(root, 'tr');
    ['Quantity', 'Value', 'Unit', 'Formula', 'Source'].forEach((label) => {
      const cell = create(root, 'th', null, label);
      cell.scope = 'col';
      head.append(cell);
    });
    table.append(head);
    for (const row of values) {
      const record = create(root, 'tr');
      record.append(
        create(root, 'th', null, row.label),
        create(root, 'td', null, format(row.value)),
        create(root, 'td', null, row.unit),
        create(root, 'td', null, row.formulaId ?? 'Published result'),
        create(root, 'td', null, row.sourcePath),
      );
      record.firstElementChild.scope = 'row';
      table.append(record);
    }
    wrapper.replaceChildren(table, pagination(root, start, values.length, rows.length, {
      previous: () => { page -= 1; render(); },
      next: () => { page += 1; render(); },
    }));
  };
  render();
  return wrapper;
}

function pagination(root, start, count, total, handlers) {
  const controls = create(root, 'div', 'lafea-workbench__pagination');
  const previous = create(root, 'button', null, 'Previous');
  previous.type = 'button';
  previous.disabled = start === 0;
  previous.addEventListener('click', handlers.previous);
  const next = create(root, 'button', null, 'Next');
  next.type = 'button';
  next.disabled = start + count >= total;
  next.addEventListener('click', handlers.next);
  controls.append(
    create(root, 'output', null, `Showing ${start + 1}-${start + count} of ${total}`),
    previous,
    next,
  );
  return controls;
}

function diagnosticsView(root, diagnostics) {
  const region = create(root, 'div', 'lafea-diagnostics');
  region.dataset.role = 'lafea-diagnostics';
  region.setAttribute('role', diagnostics.some((item) => item.severity === 'ERROR') ? 'alert' : 'status');
  region.setAttribute('aria-live', 'assertive');
  const list = create(root, 'ul');
  diagnostics.forEach((item) => {
    list.append(create(root, 'li', null, `${item.code ?? item.severity}: ${item.message}`));
  });
  region.append(list);
  return region;
}

function flattenObject(obj, prefix = '') {
  const rows = [];
  if (!obj || typeof obj !== 'object') return rows;
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      rows.push(...flattenObject(value, fullKey));
    } else {
      const valStr = Array.isArray(value)
        ? `[ ${value.map((v) => (typeof v === 'number' ? Number(v).toPrecision(5) : JSON.stringify(v))).join(', ')} ]`
        : String(value ?? '');
      rows.push({ key: fullKey, value: valStr, type: Array.isArray(value) ? 'Array / Vector' : typeof value });
    }
  }
  return rows;
}

function buildResultTable(root, result) {
  const table = create(root, 'table', 'lafea-result-table');
  table.style.marginTop = '10px';
  table.style.marginBottom = '14px';
  const head = create(root, 'tr');
  ['Evidence Pathway / Parameter', 'Qualified Result & Coordinates', 'Data Schema', 'Audit Integrity'].forEach((label) => {
    const th = create(root, 'th', null, label);
    th.scope = 'col';
    head.append(th);
  });
  table.append(head);
  const rows = flattenObject(result).slice(0, 100);
  for (const row of rows) {
    const tr = create(root, 'tr');
    const tdKey = create(root, 'td', null, row.key);
    tdKey.style.fontWeight = '700';
    tdKey.style.color = '#38bdf8';
    const tdVal = create(root, 'td', null, row.value);
    tdVal.style.fontFamily = 'monospace, ui-monospace';
    tr.append(
      tdKey,
      tdVal,
      create(root, 'td', null, row.type),
      create(root, 'td', null, '✔ IMMUTABLE TRUTH'),
    );
    table.append(tr);
  }
  return table;
}

function rawEvidence(root, result) {
  const details = create(root, 'details', 'lafea-raw-evidence');
  const summary = create(root, 'summary', null, 'Raw qualified evidence (Table View & Audit Export)');
  const table = buildResultTable(root, result);
  const jsonDetails = create(root, 'details');
  const jsonSummary = create(root, 'summary', null, '📝 View / Copy Raw JSON Evidence');
  jsonSummary.style.cursor = 'pointer';
  jsonSummary.style.color = '#94a3b8';
  jsonSummary.style.marginTop = '8px';
  const pre = create(root, 'pre');
  pre.dataset.role = 'lafea-result';
  pre.textContent = JSON.stringify(result, null, 2);
  jsonDetails.append(jsonSummary, pre);
  details.append(summary, table, jsonDetails);
  return details;
}

function create(root, tag, className, text) {
  const value = root.ownerDocument.createElement(tag);
  if (className) value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function format(value) {
  return typeof value === 'number' ? Number(value).toPrecision(8) : String(value);
}
