/**
 * Accessible LAFEA result presentation boundary.
 *
 * Stage presenters may display only retained result fields. Raw evidence is an
 * advanced audit view and is not blanket-labelled as qualified numerical truth.
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

  const accepted = execution.status === 'QUALIFIED';
  wrapper.append(create(
    root,
    'p',
    'lafea-workbench__authority',
    accepted
      ? 'Retained result evidence accepted by the current stage result contract.'
      : 'No authoritative result is available for this execution.',
  ));

  if (accepted && execution.result) {
    const units = resolveLafeaUnits(stageId, documentValue);
    const presentation = presentLafeaResult(stageId, execution.result, units);
    wrapper.append(presentationView(root, presentation));
    if (stageId === 'LAFEA.4') {
      const plot = create(root, 'div', 'lafea-workbench__result-plot');
      renderLafeaShellResult(plot, documentValue, execution.result, units);
      wrapper.append(plot);
    }
  }

  if (execution.result) wrapper.append(rawEvidence(root, execution.result));
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
    presentation.limitations.forEach((value) => {
      list.append(create(root, 'li', null, formatLimitation(String(value))));
    });
    wrapper.append(
      create(root, 'h4', 'lafea-result-limitations-title', 'Current stage limitations'),
      list,
    );
  }
  return wrapper;
}

function formatLimitation(code) {
  const known = {
    NO_CODE_COMPLIANCE: 'No code-compliance assessment is produced by this stage.',
    NO_CONTACT: 'No contact, friction, gap, lift-off or one-way behavior.',
    NO_FEA: 'No finite-element stiffness solution is performed by this stage.',
    NO_LOCAL_ATTACHMENT_STRESS: 'No local attachment or discontinuity stress is produced.',
    NO_SHELL_BENDING: 'No shell bending stress is produced.',
    NO_WELD_STRESS: 'No weld stress is produced.',
    NO_BUCKLING: 'No buckling assessment is produced.',
    NO_CRACK_OR_FRACTURE: 'No fracture or crack assessment is produced.',
    NO_FATIGUE: 'No fatigue assessment is produced.',
    ELASTIC_PRESSURE_STRESS_ONLY: 'Pressure evidence is limited to the declared elastic baseline.',
    NO_MATERIAL_ALLOWABLE_OR_PASS_FAIL_UTILIZATION: 'No material allowable or pass/fail utilization is produced.',
    NO_PLASTICITY: 'Material behavior is linear elastic; plasticity is excluded.',
    NO_STRESS_CONCENTRATION_FACTOR: 'No local stress-concentration factor is produced.',
    NO_TRANSVERSE_SHEAR_STRESS_RECOVERY: 'No transverse-shear stress recovery is produced.',
  };
  if (known[code]) return known[code];
  if (/^[A-Z0-9_]+$/u.test(code)) {
    return code.toLowerCase().replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());
  }
  return code;
}

function rowsTable(root, rows) {
  const wrapper = create(root, 'div');
  let page = 0;
  const pageSize = 100;

  const render = () => {
    const start = page * pageSize;
    const values = rows.slice(start, start + pageSize);
    const table = create(root, 'table', 'lafea-result-table');
    const head = create(root, 'tr');
    ['Quantity', 'Value', 'Unit', 'Formula identity', 'Retained source path', 'Authority'].forEach((label) => {
      const cell = create(root, 'th', null, label);
      cell.scope = 'col';
      head.append(cell);
    });
    table.append(head);

    for (const row of values) {
      const record = create(root, 'tr');
      const label = create(root, 'th', null, String(row.label ?? 'Retained value'));
      label.scope = 'row';
      record.append(
        label,
        create(root, 'td', null, format(row.value)),
        create(root, 'td', null, String(row.unit ?? '')),
        create(root, 'td', null, humanizeIdentity(row.formulaId)),
        create(root, 'td', null, String(row.sourcePath ?? 'UNRESOLVED_SOURCE_PATH')),
        create(root, 'td', null, 'RETAINED_STAGE_RESULT'),
      );
      table.append(record);
    }

    wrapper.replaceChildren(table);
    if (rows.length > pageSize) {
      wrapper.append(pagination(root, start, values.length, rows.length, {
        previous: () => { page -= 1; render(); },
        next: () => { page += 1; render(); },
      }));
    }
  };

  render();
  return wrapper;
}

function rawEvidence(root, result) {
  const details = create(root, 'details', 'lafea-raw-evidence');
  const summary = create(root, 'summary', null, 'Advanced raw retained result evidence');
  const rows = flattenEvidence(result);
  const tableHost = create(root, 'div');
  let page = 0;
  const pageSize = 100;

  const render = () => {
    const start = page * pageSize;
    const values = rows.slice(start, start + pageSize);
    const table = create(root, 'table', 'lafea-result-table');
    const head = create(root, 'tr');
    ['Evidence path', 'Retained value', 'Data type', 'Authority classification'].forEach((label) => {
      const cell = create(root, 'th', null, label);
      cell.scope = 'col';
      head.append(cell);
    });
    table.append(head);

    values.forEach((row) => {
      const record = create(root, 'tr');
      const path = create(root, 'th', null, row.path);
      path.scope = 'row';
      record.append(
        path,
        create(root, 'td', null, row.value),
        create(root, 'td', null, row.type),
        create(root, 'td', null, 'RAW_RETAINED_FIELD'),
      );
      table.append(record);
    });

    tableHost.replaceChildren(table);
    if (rows.length > pageSize) {
      tableHost.append(pagination(root, start, values.length, rows.length, {
        previous: () => { page -= 1; render(); },
        next: () => { page += 1; render(); },
      }));
    }
  };
  render();

  const jsonDetails = create(root, 'details');
  const jsonSummary = create(root, 'summary', null, 'View or copy retained JSON');
  const pre = create(root, 'pre');
  pre.dataset.role = 'lafea-result';
  pre.textContent = JSON.stringify(result, null, 2);
  jsonDetails.append(jsonSummary, pre);
  details.append(summary, tableHost, jsonDetails);
  return details;
}

function flattenEvidence(value, path = 'result', rows = []) {
  if (Array.isArray(value)) {
    rows.push({ path, value: JSON.stringify(value), type: 'array' });
    return rows;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      flattenEvidence(child, `${path}.${key}`, rows);
    }
    return rows;
  }
  rows.push({ path, value: String(value ?? ''), type: value === null ? 'null' : typeof value });
  return rows;
}

function diagnosticsView(root, diagnostics) {
  const region = create(root, 'div', 'lafea-diagnostics');
  region.dataset.role = 'lafea-diagnostics';
  region.setAttribute('role', diagnostics.some((item) => item.severity === 'ERROR') ? 'alert' : 'status');
  region.setAttribute('aria-live', 'assertive');
  const list = create(root, 'ul');
  diagnostics.forEach((item) => {
    list.append(create(
      root,
      'li',
      null,
      `${item.code ?? item.severity}: ${item.message}${item.path ? ` [${item.path}]` : ''}`,
    ));
  });
  region.append(list);
  return region;
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
    create(root, 'output', null, `Showing ${total ? start + 1 : 0}-${start + count} of ${total}`),
    previous,
    next,
  );
  return controls;
}

function humanizeIdentity(value) {
  if (!value) return 'UNRESOLVED_FORMULA_IDENTITY';
  return String(value).replace(/_/g, ' ');
}

function format(value) {
  if (typeof value !== 'number') return String(value ?? '');
  if (!Number.isFinite(value)) return 'NON_FINITE';
  return Number(value.toPrecision(8)).toString();
}

function create(root, tag, className, text) {
  const element = root.ownerDocument.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
