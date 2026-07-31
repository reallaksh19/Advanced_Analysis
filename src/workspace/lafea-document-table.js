/**
 * Interactive live table and topology editor for LAFEA stage documents.
 *
 * Provides real-time spreadsheet-style editing of global simulation parameters
 * and structural geometry topologies (nodes, elements, load reference points)
 * alongside a synchronized raw JSON editor.
 */

/**
 * Render the live geometry table editor or raw JSON fallback.
 *
 * @param {Element|DocumentFragment} rootElement Host DOM context.
 * @param {Record<string, unknown>|null} documentValue Editable stage document.
 * @param {(jsonText: string) => void} onApplyJson Callback to propagate edits.
 * @returns {HTMLElement} Editor widget root container.
 */
export function renderDocumentTableEditor(rootElement, documentValue, onApplyJson) {
  const documentRef = rootElement.ownerDocument || document;
  const container = documentRef.createElement('div');
  container.className = 'lafea-doc-table-view';

  if (!documentValue || typeof documentValue !== 'object') {
    const empty = documentRef.createElement('p');
    empty.className = 'lafea-workbench-svg__empty';
    empty.textContent = 'No validated source document loaded. Click "[SIMULATED] Load Mock Data" above.';
    container.append(empty);
    return container;
  }

  const currentDoc = structuredClone(documentValue);
  let isTableView = true;

  const toolbar = documentRef.createElement('div');
  toolbar.className = 'lafea-doc-table-toolbar';

  const tabs = documentRef.createElement('div');
  tabs.className = 'lafea-doc-table-tabs';

  const tableBtn = createTabButton(documentRef, '📊 Live Topology & Geometry Table', true, () => {
    isTableView = true;
    updateTabs();
    refreshContent();
  });

  const jsonBtn = createTabButton(documentRef, '📝 Raw JSON Source', false, () => {
    isTableView = false;
    updateTabs();
    refreshContent();
  });

  function updateTabs() {
    tableBtn.setAttribute('aria-current', isTableView ? 'step' : 'false');
    jsonBtn.setAttribute('aria-current', !isTableView ? 'step' : 'false');
  }

  tabs.append(tableBtn, jsonBtn);

  const applyBtn = documentRef.createElement('button');
  applyBtn.type = 'button';
  applyBtn.className = 'lafea-doc-apply-btn';
  applyBtn.textContent = '⚡ Apply Live Table Edits & Calculate';
  applyBtn.title = 'Immediately pushes live spreadsheet modifications into solver truth and updates canvas geometry.';
  applyBtn.addEventListener('click', () => onApplyJson(JSON.stringify(currentDoc, null, 2)));

  toolbar.append(tabs, applyBtn);

  const content = documentRef.createElement('div');
  content.className = 'lafea-doc-table-content';
  container.append(toolbar, content);

  function refreshContent() {
    content.replaceChildren();
    if (!isTableView) {
      renderJsonEditor(documentRef, content, currentDoc, onApplyJson);
      return;
    }
    renderScalarsSection(documentRef, content, currentDoc);
    renderCollectionsSection(documentRef, content, currentDoc, refreshContent);
  }

  refreshContent();
  return container;
}

function createTabButton(doc, label, isActive, onClick) {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.setAttribute('aria-current', isActive ? 'step' : 'false');
  btn.addEventListener('click', onClick);
  return btn;
}

function renderJsonEditor(doc, container, currentDoc, onApplyJson) {
  const textarea = doc.createElement('textarea');
  textarea.dataset.role = 'lafea-document-json';
  textarea.spellcheck = false;
  textarea.value = JSON.stringify(currentDoc, null, 2);
  textarea.addEventListener('input', () => {
    try {
      const parsed = JSON.parse(textarea.value);
      Object.assign(currentDoc, parsed);
    } catch {
      // Allow temporary typing errors during manual JSON input
    }
  });
  const apply = doc.createElement('button');
  apply.type = 'button';
  apply.textContent = 'Apply validated JSON';
  apply.style.marginTop = '8px';
  apply.addEventListener('click', () => onApplyJson(textarea.value));
  container.append(textarea, apply);
}

function formatEnglishParameterKey(key) {
  if (!key) return '';
  const known = {
    'sourceEvidence.foundationModel.sourceAncestry.transformationEvidenceHash': 'Load transformation integrity hash (SHA-256)',
    'sourceEvidence.foundationModel.sourceAncestry.canonicalModelSemanticHash': 'Canonical model semantic hash (SHA-256)',
    'sourceEvidence.foundationModel.sourceEvidence.schema': 'Engineering reference specification schema ID',
    'sourceEvidence.foundationModel.sourceEvidence.modelIdentity': 'Origin piping / vessel benchmark title',
    'sourceEvidence.foundationModel.sourceEvidence.modelVersion': 'Origin engineering model revision version',
    'sourceEvidence.foundationModel.sourceEvidence.sourceAncestry.sourceModelIdentity': 'Source piping simulation model identifier',
    'sourceEvidence.foundationModel.sourceEvidence.sourceAncestry.sourceVersion': 'Source piping simulation model revision',
    'sourceEvidence.foundationModel.sourceEvidence.sourceAncestry.adapterIdentity': 'Data import adapter driver name',
    'sourceEvidence.foundationModel.sourceEvidence.sourceAncestry.adapterVersion': 'Data import adapter driver version',
    'sourceEvidence.foundationModel.sourceEvidence.units.length': 'Length measurement unit (e.g., mm, inch)',
    'sourceEvidence.foundationModel.sourceEvidence.units.force': 'Force measurement unit (e.g., N, lbf)',
    'sourceEvidence.foundationModel.sourceEvidence.units.moment': 'Bending / torsion moment unit (e.g., N-mm)',
    'sourceEvidence.foundationModel.sourceEvidence.units.pressure': 'Internal pressure measurement unit (e.g., MPa)',
    'sourceEvidence.foundationModel.sourceEvidence.units.stress': 'Material stress measurement unit (e.g., MPa)',
    'sourceEvidence.foundationModel.sourceEvidence.units.rotation': 'Angular rotation measurement unit (e.g., rad)',
    'meshConfig.density': 'FEA global mesh density preset',
    'meshConfig.bias': 'Discontinuity refinement concentration bias (k_refine)',
    'meshConfig.formulation': 'FEA shell element formulation family',
    'meshConfig.singularity': 'Weld-toe singularity mitigation strategy',
    'schema': 'Engineering schema specification version',
    'modelIdentity': 'Model benchmark identifier',
    'modelVersion': 'Model revision version',
    'units.length': 'Length measurement unit',
    'units.force': 'Force measurement unit',
    'units.moment': 'Moment measurement unit',
    'units.pressure': 'Pressure measurement unit',
    'units.stress': 'Stress measurement unit',
    'units.rotation': 'Angular rotation unit',
    'leverArmX': 'Trunnion / standoff lever arm length (X-direction)',
    'leverArmY': 'Trunnion / standoff lever arm length (Y-direction)',
    'leverArmZ': 'Trunnion / standoff lever arm length (Z-direction)',
    'nodes': 'Structural Finite Element Nodes',
    'elements': '2D Shell / Continuum Finite Elements',
    'loadCases': 'Applied Linear Superposition Load Cases',
    'referencePoints': 'Structural Reference & Measurement Points',
    'id': 'Identifier',
    'nodeId': 'Node ID',
    'elementId': 'Element ID',
    'identity': 'Element Identity',
    'x': 'X Coord',
    'y': 'Y Coord',
    'z': 'Z Coord',
    'type': 'Element Type',
    'thickness': 'Wall Thickness',
    'material': 'Material Basis',
    'screeningCaseId': 'Load Case Identifier',
    'evaluationLocationId': 'Wall Fiber Location',
    'quantity': 'Engineering Stress Quantity',
    'value': 'Calculated Value',
  };
  if (known[key]) return known[key];
  return String(key)
    .replace(/^sourceEvidence\.foundationModel\.sourceEvidence\./, '')
    .replace(/^sourceEvidence\.foundationModel\./, '')
    .replace(/\./g, ' · ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}

function renderScalarsSection(doc, container, currentDoc) {
  const section = doc.createElement('div');
  section.className = 'lafea-doc-table-section';
  const title = doc.createElement('h4');
  title.textContent = '📐 Global Stage Parameters & Properties (Simple English Form)';
  section.append(title);

  const table = doc.createElement('table');
  table.className = 'lafea-doc-grid';
  table.innerHTML = '<thead><tr><th>Engineering Parameter (Simple English)</th><th>Editable Value</th><th>Data Type</th></tr></thead>';
  const tbody = doc.createElement('tbody');

  const scalars = [];
  function pushScalars(obj, prefix = '') {
    for (const [k, v] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (v.value !== undefined && typeof v.value !== 'object') {
          scalars.push({ key: fullKey, parent: obj, prop: k, valObj: v, isWrapper: true });
        } else {
          pushScalars(v, fullKey);
        }
      } else if (v !== null && typeof v !== 'object') {
        scalars.push({ key: fullKey, parent: obj, prop: k, valObj: null, isWrapper: false });
      }
    }
  }
  pushScalars(currentDoc);

  for (const item of scalars) {
    const row = doc.createElement('tr');
    const tdKey = doc.createElement('td');
    const englishName = formatEnglishParameterKey(item.key);
    if (englishName !== item.key) {
      tdKey.innerHTML = `<strong>${englishName}</strong> <code style="font-size:0.75em;color:#64748b;display:block;margin-top:2px;">${item.key}</code>`;
    } else {
      tdKey.textContent = item.key;
    }
    const tdVal = doc.createElement('td');
    const input = doc.createElement('input');
    const curVal = item.isWrapper ? item.valObj.value : item.parent[item.prop];
    input.type = typeof curVal === 'number' ? 'number' : 'text';
    input.value = String(curVal ?? '');
    input.addEventListener('change', () => {
      if (item.isWrapper) {
        item.valObj.value = typeof curVal === 'number' ? (Number(input.value) || 0) : input.value;
      } else {
        item.parent[item.prop] = typeof curVal === 'number' ? (Number(input.value) || 0) : input.value;
      }
    });
    tdVal.append(input);
    const tdType = doc.createElement('td');
    tdType.textContent = typeof curVal;
    row.append(tdKey, tdVal, tdType);
    tbody.append(row);
  }
  table.append(tbody);
  section.append(table);
  container.append(section);
}

function renderCollectionsSection(doc, container, currentDoc, onRefresh) {
  const collections = [];
  for (const [key, val] of Object.entries(currentDoc)) {
    if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object') {
      collections.push({ name: key, array: val });
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const [subKey, subVal] of Object.entries(val)) {
        if (Array.isArray(subVal) && subVal.length > 0 && typeof subVal[0] === 'object') {
          collections.push({ name: `${key}.${subKey}`, array: subVal });
        }
      }
    }
  }

  for (const { name: key, array: val } of collections) {
    const section = doc.createElement('div');
    section.className = 'lafea-doc-table-section';
    const title = doc.createElement('h4');
    title.textContent = `🏷️ ${formatEnglishParameterKey(key).toUpperCase()} (Topology Edit Grid — ${val.length} rows)`;
    section.append(title);

    const sample = val[0];
    const columns = Object.keys(sample).slice(0, 8);
    const table = doc.createElement('table');
    table.className = 'lafea-doc-grid';

    const thead = doc.createElement('thead');
    const headerRow = doc.createElement('tr');
    headerRow.innerHTML = '<th>Index</th>' + columns.map((c) => `<th>${formatEnglishParameterKey(c)}</th>`).join('') + '<th>Action</th>';
    thead.append(headerRow);
    table.append(thead);

    const tbody = doc.createElement('tbody');
    val.forEach((rowObj, idx) => {
      const tr = doc.createElement('tr');
      const rowId = String(rowObj.identity || rowObj.id || rowObj.nodeId || rowObj.elementId || idx);
      tr.dataset.rowId = rowId;
      tr.classList.add('lafea-table-row');
      tr.addEventListener('click', () => {
        doc.querySelectorAll('tr.lafea-row-selected').forEach((el) => el.classList.remove('lafea-row-selected'));
        tr.classList.add('lafea-row-selected');
        doc.querySelectorAll('.lafea-svg-highlighted').forEach((el) => el.classList.remove('lafea-svg-highlighted'));
        doc.querySelectorAll(`[data-node-id="${rowId}"], [data-element-id="${rowId}"]`).forEach((el) => {
          el.classList.add('lafea-svg-highlighted');
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      });
      const tdIdx = doc.createElement('td');
      tdIdx.textContent = `#${idx + 1}`;
      tr.append(tdIdx);

      for (const col of columns) {
        const td = doc.createElement('td');
        const input = doc.createElement('input');
        const origVal = rowObj[col];
        const isWrapper = origVal && typeof origVal === 'object' && !Array.isArray(origVal) && origVal.value !== undefined;
        const isArrWrap = Array.isArray(origVal) && origVal.length > 0 && origVal[0]?.value !== undefined;
        if (isWrapper) {
          const inner = origVal.value;
          input.type = typeof inner === 'number' ? 'number' : 'text';
          input.value = Array.isArray(inner) ? inner.join(', ') : String(inner ?? '');
          input.addEventListener('change', () => {
            if (Array.isArray(inner)) origVal.value = input.value.split(',').map((s) => Number(s.trim()) || 0);
            else origVal.value = typeof inner === 'number' ? (Number(input.value) || 0) : input.value;
          });
        } else if (isArrWrap) {
          input.type = 'text';
          input.value = origVal.map((o) => o.value).join(', ');
          input.addEventListener('change', () => {
            const vals = input.value.split(',').map((s) => Number(s.trim()) || 0);
            vals.forEach((n, i) => { if (origVal[i]) origVal[i].value = n; });
          });
        } else {
          const isObj = origVal !== null && typeof origVal === 'object';
          input.type = typeof origVal === 'number' ? 'number' : 'text';
          input.value = isObj ? JSON.stringify(origVal) : String(origVal ?? '');
          input.addEventListener('change', () => {
            if (isObj) {
              try { rowObj[col] = JSON.parse(input.value); } catch { /* keep text */ }
            } else {
              rowObj[col] = typeof origVal === 'number' ? (Number(input.value) || 0) : input.value;
            }
          });
        }
        td.append(input);
        tr.append(td);
      }

      const tdAct = doc.createElement('td');
      const delBtn = doc.createElement('button');
      delBtn.type = 'button';
      delBtn.textContent = '❌';
      delBtn.title = 'Delete topology row';
      delBtn.addEventListener('click', () => {
        val.splice(idx, 1);
        onRefresh();
      });
      tdAct.append(delBtn);
      tr.append(tdAct);
      tbody.append(tr);
    });
    table.append(tbody);

    const addRowBtn = doc.createElement('button');
    addRowBtn.type = 'button';
    addRowBtn.textContent = `➕ Add row to ${key}`;
    addRowBtn.style.marginTop = '6px';
    addRowBtn.addEventListener('click', () => {
      val.push(structuredClone(val[val.length - 1] || {}));
      onRefresh();
    });

    section.append(table, addRowBtn);
    container.append(section);
  }
}
