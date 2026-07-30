/**
 * Zone Density & Sub-Graph Area Selector Popup Dialog
 * Adapted from 3DV (JsonViewerZoneDensitySelector.js)
 * Enables 2D drag-rectangle spatial selection and checkbox multi-select grid for large models.
 */

export function showZoneDensitySelectorPopup(dataset, onApply) {
  if (typeof document === 'undefined') return;
  document.querySelector('[data-role="zone-selector-popup"]')?.remove();

  const zones = extractZones(dataset);
  const state = { selectedIds: new Set(zones.map((z) => z.id)), qualities: {}, drag: null, canvas: null, tableBody: null };
  zones.forEach((z) => { state.qualities[z.id] = 'full'; });

  const backdrop = createEl('div', 'position:fixed; inset:0; z-index:10000; background:rgba(2,6,23,0.85); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center;');
  backdrop.dataset.role = 'zone-selector-popup';
  const dialog = createEl('div', 'width:720px; max-width:92vw; background:#0b1528; border:1px solid #38bdf8; border-radius:10px; box-shadow:0 0 30px rgba(56,189,248,0.3); color:#f8fafc; font-family:sans-serif; display:flex; flex-direction:column; overflow:hidden;');
  
  const header = createHeader(() => backdrop.remove());
  const body = createEl('div', 'display:grid; grid-template-columns: 280px 1fr; gap:12px; padding:12px; height:340px; overflow:hidden;');

  const previewPanel = createPreviewPanel(zones, state);
  const tablePanel = createTablePanel(zones, state, previewPanel.draw);
  body.append(previewPanel.container, tablePanel.container);

  const footer = createFooter(zones, state, () => {
    onApply?.(Array.from(state.selectedIds), state.qualities);
    backdrop.remove();
  }, () => backdrop.remove());

  dialog.append(header, body, footer);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  state.canvas = previewPanel.canvas;
  state.tableBody = tablePanel.tableBody;
  previewPanel.initDrag(zones, tablePanel.render);
  tablePanel.render();
  previewPanel.draw();
}

function extractZones(dataset) {
  const entities = dataset?.entities || [];
  const groups = new Map();
  entities.forEach((entity) => {
    const area = entity?.properties?.sourceAttributes?.AREA || entity?.category || 'Main Piping System';
    const current = groups.get(area) || { id: area, label: area, count: 0, bbox: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity } };
    current.count++;
    const start = entity.properties?.geometry?.start || entity.properties?.geometry?.center;
    const end = entity.properties?.geometry?.end || start;
    if (start) {
      current.bbox.minX = Math.min(current.bbox.minX, start.x, end?.x || start.x);
      current.bbox.minY = Math.min(current.bbox.minY, start.y, end?.y || start.y);
      current.bbox.maxX = Math.max(current.bbox.maxX, start.x, end?.x || start.x);
      current.bbox.maxY = Math.max(current.bbox.maxY, start.y, end?.y || start.y);
    }
    groups.set(area, current);
  });

  return Array.from(groups.values()).map((g, index) => ({
    id: g.id, label: g.label, count: g.count,
    bbox: Number.isFinite(g.bbox.minX) ? g.bbox : { minX: index * 100, minY: index * 50, maxX: (index + 1) * 100, maxY: (index + 1) * 50 },
  }));
}

function createEl(tag, css) {
  const el = document.createElement(tag);
  if (css) el.style.cssText = css;
  return el;
}

function createHeader(onClose) {
  const header = createEl('header', 'padding:10px 16px; background:#0f172a; border-bottom:1px solid #1e293b; display:flex; justify-content:space-between; align-items:center;');
  header.innerHTML = '<div style="display:flex; align-items:center; gap:8px;"><span style="font-size:18px;">🎯</span><strong style="font-size:14px; color:#38bdf8;">Zone Density &amp; Sub-Graph Selector</strong></div>';
  const closeBtn = createEl('button', 'background:none; border:none; color:#94a3b8; font-size:16px; cursor:pointer; font-weight:700;');
  closeBtn.textContent = '✕';
  closeBtn.onclick = onClose;
  header.appendChild(closeBtn);
  return header;
}

function createPreviewPanel(zones, state) {
  const container = createEl('div', 'background:#020617; border:1px solid #1e293b; border-radius:8px; display:flex; flex-direction:column; padding:8px; gap:6px;');
  const title = createEl('div', 'font-size:11px; font-weight:700; color:#94a3b8; text-transform:uppercase;');
  title.textContent = '2D Spatial Bounding Canvas (Drag Box)';
  const canvas = createEl('canvas', 'width:100%; flex:1; background:#030a16; border-radius:6px; cursor:crosshair;');
  container.append(title, canvas);

  const draw = () => drawCanvas(canvas, zones, state);
  const initDrag = (zoneList, renderTable) => {
    let start = null;
    canvas.onpointerdown = (e) => {
      const rect = canvas.getBoundingClientRect();
      start = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      state.drag = { left: start.x, top: start.y, width: 0, height: 0 };
    };
    canvas.onpointermove = (e) => {
      if (!start) return;
      const rect = canvas.getBoundingClientRect();
      const curr = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      state.drag = { left: Math.min(start.x, curr.x), top: Math.min(start.y, curr.y), width: Math.abs(curr.x - start.x), height: Math.abs(curr.y - start.y) };
      draw();
    };
    canvas.onpointerup = () => {
      if (state.drag && state.drag.width > 5 && state.drag.height > 5) {
        selectZonesInRect(canvas, zones, state, state.drag); renderTable();
      }
      start = null; state.drag = null; draw();
    };
  };
  return { container, canvas, draw, initDrag };
}

function createTablePanel(zones, state, drawPreview) {
  const container = createEl('div', 'background:#020617; border:1px solid #1e293b; border-radius:8px; display:flex; flex-direction:column; padding:8px; gap:6px; overflow:hidden;');
  const toolbar = createEl('div', 'display:flex; justify-content:space-between; align-items:center; font-size:11px;');
  toolbar.innerHTML = '<span style="font-weight:700; color:#94a3b8; text-transform:uppercase;">Sub-Graph Area Grid</span>';

  const btnGroup = createEl('div', 'display:flex; gap:6px;');
  const allBtn = createEl('button', 'padding:2px 8px; font-size:10px; background:#1e293b; color:#38bdf8; border:1px solid #334155; border-radius:4px; cursor:pointer;');
  allBtn.textContent = 'Select All';
  allBtn.onclick = () => { zones.forEach((z) => state.selectedIds.add(z.id)); render(); drawPreview(); };
  const clearBtn = createEl('button', 'padding:2px 8px; font-size:10px; background:#1e293b; color:#94a3b8; border:1px solid #334155; border-radius:4px; cursor:pointer;');
  clearBtn.textContent = 'Clear All';
  clearBtn.onclick = () => { state.selectedIds.clear(); render(); drawPreview(); };
  btnGroup.append(allBtn, clearBtn);
  toolbar.appendChild(btnGroup);

  const tableWrapper = createEl('div', 'flex:1; overflow:auto;');
  const table = createEl('table', 'width:100%; border-collapse:collapse; font-size:12px; color:#cbd5e1;');
  table.innerHTML = '<thead style="background:#0f172a; position:sticky; top:0; color:#94a3b8;"><tr style="text-align:left;"><th style="padding:6px; width:30px;"></th><th style="padding:6px;">Zone / Area</th><th style="padding:6px; text-align:right;">Items</th><th style="padding:6px;">LOD</th></tr></thead>';
  const tableBody = createEl('tbody');
  table.appendChild(tableBody);
  tableWrapper.appendChild(table);
  container.append(toolbar, tableWrapper);

  const render = () => {
    tableBody.replaceChildren();
    zones.forEach((z) => {
      const tr = createEl('tr', 'border-bottom:1px solid #1e293b;');
      const checked = state.selectedIds.has(z.id);
      if (checked) tr.style.background = 'rgba(56,189,248,0.1)';

      const tdCheck = createEl('td', 'padding:6px; text-align:center;');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = checked;
      cb.onchange = () => { if (cb.checked) state.selectedIds.add(z.id); else state.selectedIds.delete(z.id); render(); drawPreview(); };
      tdCheck.appendChild(cb);

      const tdLabel = createEl('td', 'padding:6px; font-weight:600; color:#f8fafc;');
      tdLabel.textContent = z.label;

      const tdCount = createEl('td', 'padding:6px; text-align:right; color:#38bdf8; font-weight:700;');
      tdCount.textContent = z.count;

      const tdLod = createEl('td', 'padding:6px;');
      const sel = createEl('select', 'background:#0f172a; color:#fff; border:1px solid #334155; border-radius:4px; font-size:11px; padding:2px 4px;');
      ['full', 'medium', 'light', 'hidden'].forEach((opt) => {
        const o = document.createElement('option'); o.value = opt; o.textContent = opt.toUpperCase();
        if (state.qualities[z.id] === opt) o.selected = true;
        sel.appendChild(o);
      });
      sel.onchange = () => { state.qualities[z.id] = sel.value; drawPreview(); };
      tdLod.appendChild(sel);

      tr.append(tdCheck, tdLabel, tdCount, tdLod);
      tableBody.appendChild(tr);
    });
  };

  return { container, tableBody, render };
}

function createFooter(zones, state, onApply, onCancel) {
  const footer = createEl('footer', 'padding:10px 16px; background:#0f172a; border-top:1px solid #1e293b; display:flex; justify-content:space-between; align-items:center;');
  const info = createEl('span', 'font-size:12px; color:#94a3b8;');
  info.textContent = `Selected ${state.selectedIds.size} of ${zones.length} zone(s)`;
  const btnGroup = createEl('div', 'display:flex; gap:8px;');
  const cancelBtn = createEl('button', 'padding:6px 14px; background:transparent; border:1px solid #334155; border-radius:6px; color:#94a3b8; cursor:pointer; font-weight:600; font-size:12px;');
  cancelBtn.textContent = 'Cancel'; cancelBtn.onclick = onCancel;
  const applyBtn = createEl('button', 'padding:6px 16px; background:#0284c7; border:1px solid #38bdf8; border-radius:6px; color:#fff; cursor:pointer; font-weight:700; font-size:12px; box-shadow:0 0 12px rgba(56,189,248,0.4);');
  applyBtn.textContent = 'Apply Zone Selection'; applyBtn.onclick = onApply;
  btnGroup.append(cancelBtn, applyBtn); footer.append(info, btnGroup);
  return footer;
}

function drawCanvas(canvas, zones, state) {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(Math.floor(rect.width), 260); const height = Math.max(Math.floor(rect.height), 220);
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, width, height);

  ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
  for (let x = 20; x < width; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  for (let y = 20; y < height; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  zones.forEach((z) => {
    minX = Math.min(minX, z.bbox.minX); minY = Math.min(minY, z.bbox.minY);
    maxX = Math.max(maxX, z.bbox.maxX); maxY = Math.max(maxY, z.bbox.maxY);
  });
  const rangeX = Math.max(maxX - minX, 1); const rangeY = Math.max(maxY - minY, 1); const pad = 20;

  zones.forEach((z) => {
    const selected = state.selectedIds.has(z.id);
    const l = pad + ((z.bbox.minX - minX) / rangeX) * (width - pad * 2);
    const t = pad + (1 - ((z.bbox.maxY - minY) / rangeY)) * (height - pad * 2);
    const w = Math.max(((z.bbox.maxX - z.bbox.minX) / rangeX) * (width - pad * 2), 24);
    const h = Math.max(((z.bbox.maxY - z.bbox.minY) / rangeY) * (height - pad * 2), 24);

    ctx.fillStyle = selected ? 'rgba(56,189,248,0.3)' : 'rgba(30,41,59,0.5)';
    ctx.strokeStyle = selected ? '#38bdf8' : '#475569'; ctx.lineWidth = selected ? 2 : 1;
    ctx.fillRect(l, t, w, h); ctx.strokeRect(l, t, w, h);
    ctx.fillStyle = selected ? '#ffffff' : '#94a3b8'; ctx.font = '10px sans-serif';
    ctx.fillText(z.label.slice(0, 10), l + 4, t + 14);
  });

  if (state.drag) {
    ctx.fillStyle = 'rgba(250,204,21,0.2)'; ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]);
    ctx.fillRect(state.drag.left, state.drag.top, state.drag.width, state.drag.height);
    ctx.strokeRect(state.drag.left, state.drag.top, state.drag.width, state.drag.height);
    ctx.setLineDash([]);
  }
}

function selectZonesInRect(canvas, zones, state, drag) {
  const width = canvas.width; const height = canvas.height;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  zones.forEach((z) => {
    minX = Math.min(minX, z.bbox.minX); minY = Math.min(minY, z.bbox.minY);
    maxX = Math.max(maxX, z.bbox.maxX); maxY = Math.max(maxY, z.bbox.maxY);
  });
  const rangeX = Math.max(maxX - minX, 1); const rangeY = Math.max(maxY - minY, 1); const pad = 20;

  zones.forEach((z) => {
    const l = pad + ((z.bbox.minX - minX) / rangeX) * (width - pad * 2);
    const t = pad + (1 - ((z.bbox.maxY - minY) / rangeY)) * (height - pad * 2);
    const w = Math.max(((z.bbox.maxX - z.bbox.minX) / rangeX) * (width - pad * 2), 24);
    const h = Math.max(((z.bbox.maxY - z.bbox.minY) / rangeY) * (height - pad * 2), 24);

    const overlap = !(l > drag.left + drag.width || l + w < drag.left || t > drag.top + drag.height || t + h < drag.top);
    if (overlap) state.selectedIds.add(z.id);
  });
}
