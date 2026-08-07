import { workbenchButton, workbenchElement } from '../workbench-dom.js';
import {
  LFEA_EDITOR_ENUMS,
  lfeaElementType,
  lfeaReferenceValues,
} from '../lfea-structured-editor-contract.js';

export function renderLfeaEditorFields(root, state, contract, record = null) {
  const grid = workbenchElement(root, 'div', 'lfea-shell-v2__editor-grid');
  const controls = new Map();
  const readers = new Map();

  for (const descriptor of contract.fields) {
    const rendered = renderField(root, state, descriptor, record?.[descriptor.name], controls);
    rendered.control.dataset.field = descriptor.name;
    controls.set(descriptor.name, rendered.control);
    readers.set(descriptor.name, rendered.read);
    grid.append(fieldShell(root, descriptor.label, rendered.element));
  }

  return {
    element: grid,
    readRecord: () => Object.fromEntries(
      contract.fields.map((descriptor) => [
        descriptor.name,
        readers.get(descriptor.name)(),
      ]),
    ),
  };
}

function renderField(root, state, descriptor, value, controls) {
  if (descriptor.kind === 'number') return numberField(root, value);
  if (descriptor.kind === 'enum') return selectField(root, descriptor.options, value);
  if (descriptor.kind === 'reference') {
    return selectField(root, referenceValues(state, descriptor.reference), value);
  }
  if (descriptor.kind === 'multi-reference') {
    return multiReferenceField(root, referenceValues(state, descriptor.reference), value);
  }
  if (descriptor.kind === 'node-slots') return nodeSlotsField(root, state, value, controls);
  if (descriptor.kind === 'edge-references') return edgeReferencesField(root, state, value);
  if (descriptor.kind === 'selector-reference') {
    return selectorReferenceField(root, state, value, controls);
  }
  if (descriptor.kind === 'constraint-component') {
    return constraintComponentField(root, value);
  }
  return textField(root, value);
}

function textField(root, value) {
  const input = workbenchElement(root, 'input');
  input.type = 'text';
  input.value = value ?? '';
  return { element: input, control: input, read: () => input.value };
}

function numberField(root, value) {
  const input = workbenchElement(root, 'input');
  input.type = 'number';
  input.step = 'any';
  input.value = value ?? '';
  return {
    element: input,
    control: input,
    read: () => input.value === '' ? null : Number(input.value),
  };
}

function selectField(root, options, value) {
  const select = workbenchElement(root, 'select');
  setSelectOptions(root, select, options, value);
  return { element: select, control: select, read: () => select.value };
}

function multiReferenceField(root, options, value) {
  const select = workbenchElement(root, 'select');
  select.multiple = true;
  select.size = Math.min(Math.max(options.length, 3), 8);
  const selected = new Set(Array.isArray(value) ? value : []);
  for (const optionValue of options) {
    const option = optionNode(root, optionValue, optionValue);
    option.selected = selected.has(optionValue);
    select.append(option);
  }
  return {
    element: select,
    control: select,
    read: () => [...select.selectedOptions].map((option) => option.value),
  };
}

function nodeSlotsField(root, state, value, controls) {
  const host = workbenchElement(root, 'div', 'lfea-shell-v2__node-slots');
  const nodeIds = lfeaReferenceValues(state.packageValue, 'nodes', 'nodeId');
  const selects = Array.from({ length: 4 }, (_, index) => {
    const slot = workbenchElement(root, 'label', null, `N${index + 1}`);
    const select = workbenchElement(root, 'select');
    setSelectOptions(root, select, nodeIds, value?.[index] ?? '');
    select.dataset.role = `lfea-node-slot-${index + 1}`;
    slot.append(select);
    host.append(slot);
    return select;
  });
  return {
    element: host,
    control: host,
    read: () => selects.slice(
      0,
      controls.get('elementType')?.value === 'T3' ? 3 : 4,
    ).map((select) => select.value),
  };
}

function edgeReferencesField(root, state, value) {
  const host = workbenchElement(root, 'div', 'lfea-shell-v2__edge-list');
  const rows = [];
  const initial = Array.isArray(value) && value.length ? value : [null];

  const appendRow = (rowValue = null) => {
    const row = workbenchElement(root, 'div', 'lfea-shell-v2__edge-row');
    const element = workbenchElement(root, 'select');
    setSelectOptions(
      root,
      element,
      lfeaReferenceValues(state.packageValue, 'elements', 'elementId'),
      rowValue?.elementId ?? '',
    );
    const edge = workbenchElement(root, 'select');
    const refreshEdges = (selected = edge.value) => {
      const elementType = lfeaElementType(state.packageValue, element.value);
      setSelectOptions(root, edge, LFEA_EDITOR_ENUMS.localEdgeIds[elementType] ?? [], selected);
    };
    refreshEdges(rowValue?.localEdgeId ?? '');
    element.addEventListener('change', () => refreshEdges(''));
    const remove = workbenchButton(root, 'Remove', () => {
      const index = rows.findIndex((candidate) => candidate.row === row);
      if (index >= 0) rows.splice(index, 1);
      row.remove();
    });
    row.append(element, edge, remove);
    rows.push({ row, element, edge });
    host.append(row);
  };

  initial.forEach(appendRow);
  const add = workbenchButton(root, 'Add edge', () => appendRow());
  add.className = 'lfea-shell-v2__inline-action';
  host.append(add);

  return {
    element: host,
    control: host,
    read: () => rows.map(({ element, edge }) => ({
      elementId: element.value,
      localEdgeId: edge.value,
    })),
  };
}

function selectorReferenceField(root, state, value, controls) {
  const select = workbenchElement(root, 'select');
  const refresh = (selected = select.value) => {
    const type = controls.get('selectorType')?.value;
    const reference = type === 'BOUNDARY'
      ? { path: 'boundaries', key: 'boundaryId' }
      : type === 'POINT'
        ? { path: 'points', key: 'pointId' }
        : null;
    setSelectOptions(root, select, reference ? referenceValues(state, reference) : [], selected);
  };
  refresh(value ?? '');
  controls.get('selectorType')?.addEventListener('change', () => refresh(''));
  return { element: select, control: select, read: () => select.value };
}

function constraintComponentField(root, value) {
  const host = workbenchElement(root, 'div', 'lfea-shell-v2__constraint-component');
  const type = workbenchElement(root, 'select');
  setSelectOptions(root, type, LFEA_EDITOR_ENUMS.constraintComponentTypes, value?.type ?? '');
  const number = workbenchElement(root, 'input');
  number.type = 'number';
  number.step = 'any';
  number.value = value?.type === 'PRESCRIBED' ? value.value : '';
  const sync = () => {
    number.disabled = type.value !== 'PRESCRIBED';
    if (number.disabled) number.value = '';
  };
  type.addEventListener('change', sync);
  sync();
  host.append(type, number);
  return {
    element: host,
    control: host,
    read: () => type.value === 'PRESCRIBED'
      ? { type: type.value, value: number.value === '' ? null : Number(number.value) }
      : { type: type.value },
  };
}

function referenceValues(state, reference) {
  return lfeaReferenceValues(state.packageValue, reference.path, reference.key);
}

function setSelectOptions(root, select, options, selected) {
  select.replaceChildren(optionNode(root, '', 'Select…'));
  for (const value of options) select.append(optionNode(root, value, value));
  select.value = selected ?? '';
}

function optionNode(root, value, label) {
  const option = workbenchElement(root, 'option', null, String(label));
  option.value = value;
  return option;
}

function fieldShell(root, label, control) {
  const field = workbenchElement(root, 'label', 'lfea-shell-v2__editor-field');
  field.append(workbenchElement(root, 'span', null, label), control);
  return field;
}
