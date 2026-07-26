/**
 * Accessible record and evidence tables for the LFEA workbench.
 *
 * Result rows use explicit pagination. No row or field is silently truncated,
 * and every page reports its exact source range.
 */
import {
  activateOnKeyboard,
  compactJson,
  recordIdentity,
  scalarText,
  workbenchButton,
  workbenchElement,
} from './workbench-dom.js';

const PAGE_SIZE = 100;

export function lfeaRecordTable(root, rows, selectedIndex, onSelect) {
  const wrapper = workbenchElement(root, 'div', 'lfea-workbench__table');
  let page = selectedIndex >= 0 ? Math.floor(selectedIndex / PAGE_SIZE) : 0;
  const render = () => {
    const maximumPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
    page = Math.min(page, maximumPage);
    const start = page * PAGE_SIZE;
    const values = rows.slice(start, start + PAGE_SIZE);
    const table = workbenchElement(root, 'table');
    const heading = workbenchElement(root, 'tr');
    ['#', 'Identity', 'Record'].forEach((label) =>
      heading.append(workbenchElement(root, 'th', null, label)));
    table.append(heading);
    values.forEach((row, localIndex) => {
      const index = start + localIndex;
      const select = () => onSelect(index);
      const tr = workbenchElement(root, 'tr');
      tr.dataset.selected = String(index === selectedIndex);
      tr.tabIndex = 0;
      tr.setAttribute('role', 'row');
      tr.setAttribute('aria-selected', String(index === selectedIndex));
      tr.addEventListener('click', select);
      activateOnKeyboard(tr, select);
      tr.append(
        workbenchElement(root, 'td', null, String(index + 1)),
        workbenchElement(root, 'td', null, recordIdentity(row)),
        workbenchElement(root, 'td', null, compactJson(row)),
      );
      table.append(tr);
    });
    const controls = pageControls(
      root,
      start,
      values.length,
      rows.length,
      () => { page -= 1; render(); },
      () => { page += 1; render(); },
    );
    wrapper.replaceChildren(controls, table);
  };
  render();
  return wrapper;
}

export function lfeaResultTable(root, title, rows) {
  const section = workbenchElement(root, 'section', 'lfea-workbench__result-table');
  section.append(workbenchElement(root, 'h3', null, title));
  if (!rows.length) {
    section.append(workbenchElement(root, 'p', null, 'No rows.'));
    return section;
  }
  let page = 0;
  const body = workbenchElement(root, 'div');
  const render = () => {
    const maximumPage = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
    page = Math.min(page, maximumPage);
    const start = page * PAGE_SIZE;
    const values = rows.slice(start, start + PAGE_SIZE);
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const table = workbenchElement(root, 'table');
    const header = workbenchElement(root, 'tr');
    keys.forEach((key) => header.append(workbenchElement(root, 'th', null, key)));
    table.append(header);
    values.forEach((row) => {
      const tr = workbenchElement(root, 'tr');
      keys.forEach((key) =>
        tr.append(workbenchElement(root, 'td', null, scalarText(row[key]))));
      table.append(tr);
    });
    const controls = pageControls(
      root,
      start,
      values.length,
      rows.length,
      () => { page -= 1; render(); },
      () => { page += 1; render(); },
    );
    const scroll = workbenchElement(root, 'div', 'lfea-workbench__table');
    scroll.append(table);
    body.replaceChildren(controls, scroll);
  };
  render();
  section.append(body);
  return section;
}

function pageControls(root, start, count, total, previous, next) {
  const controls = workbenchElement(root, 'div', 'lfea-workbench__pagination');
  const label = workbenchElement(
    root,
    'output',
    null,
    `Showing ${total ? start + 1 : 0}–${start + count} of ${total}`,
  );
  const previousButton = workbenchButton(root, 'Previous', previous);
  previousButton.disabled = start === 0;
  const nextButton = workbenchButton(root, 'Next', next);
  nextButton.disabled = start + count >= total;
  controls.append(label, previousButton, nextButton);
  return controls;
}
