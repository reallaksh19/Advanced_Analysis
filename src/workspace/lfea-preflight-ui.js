import { renderAdaptedConfigPanel } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-config-tabs.js';
import { createXmlCiiAdaptedWorkflowState } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-state.js';
import { deriveXmlCiiServiceFromBranchName } from '../calc-workspace/cii-standalone-port/core/service-process-fallback.js';
import { analyzeTopologyOverlaps } from '../calc-workspace/cii-standalone-port/core/topology-autofix.js';
import { mountAutofixLog } from './topology-autofix-log.js';
import { masterDataController } from './master-data-controller.js';
import { deriveLineKeyFromBranchName } from '../calc-workspace/cii-standalone-port/core/regex-line-key.js';

export function deriveWallThicknessFromDtxr(boreMm, pipingClass = '', dtxrAttr = {}) {
  const b = parseFloat(boreMm) || 150;
  
  // 1. Explicit WT / WALL_THICKNESS / THK in DTXR attributes
  const explicitWt = parseFloat(dtxrAttr.WT || dtxrAttr.WALL_THICKNESS || dtxrAttr.WALLTHK || dtxrAttr.THK || dtxrAttr.THICKNESS);
  if (Number.isFinite(explicitWt) && explicitWt > 0) return explicitWt;

  // 2. Schedule parsing (SCH 40, SCH 80, SCH 160, STD, XS)
  const schStr = String(dtxrAttr.SCH || dtxrAttr.SCHEDULE || pipingClass || '').toUpperCase();
  if (schStr.includes('SCH 80') || schStr.includes('SCH80') || schStr.includes('XS')) {
    if (b <= 50) return 5.54;
    if (b <= 100) return 8.56;
    if (b <= 150) return 10.97;
    if (b <= 200) return 12.70;
    return 12.70;
  }
  if (schStr.includes('SCH 160') || schStr.includes('SCH160')) {
    if (b <= 150) return 18.26;
    return 23.01;
  }
  
  // 3. Standard Schedule 40 / 91261M7 / Default Nominal Wall Thickness Table (ASME B36.10M)
  if (b <= 25) return 3.38;
  if (b <= 40) return 3.68;
  if (b <= 50) return 3.91;
  if (b <= 80) return 5.49;
  if (b <= 100) return 6.02;
  if (b <= 150) return 7.11; // Standard 6" Sch 40
  if (b <= 200) return 8.18; // Standard 8" Sch 40
  if (b <= 250) return 9.27; // Standard 10" Sch 40
  if (b <= 300) return 10.31; // Standard 12" Sch 40
  return 9.52; // Default Standard Wall
}

let activeState = createXmlCiiAdaptedWorkflowState();
export function getPreflightStateRef() {
  return { current: activeState };
}

let loadedProcessOverrides = null;

export function renderProjectConfiguration(container, renderCallback) {
  container.innerHTML = '';
  const card = document.createElement('div');
  card.style.cssText = 'padding: 20px; color: #e2e8f0; width: 100%; height: 100%; box-sizing: border-box; background: #0b1121; overflow: auto;';
  
  const stateRef = getPreflightStateRef();
  const internalRender = () => {
    card.innerHTML = '';
    renderAdaptedConfigPanel(card, stateRef, internalRender);
  };
  
  internalRender();
  container.appendChild(card);
}

export function renderPreflightGrid(container, model, renderCallback) {
  container.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'preflight-grid-wrap';
  wrap.style.cssText = 'padding: 20px; color: #e2e8f0; height: 100%; display: flex; flex-direction: column; overflow: hidden; background: #0f172a;';
  
  wrap.innerHTML = `
    <style>
      .preflight-tree { width: 100%; border-collapse: collapse; font-size: 11px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
      .preflight-tree th { background: #1e293b; color: #7dd3fc; padding: 6px 8px; text-align: left; border-bottom: 1px solid #334155; position: sticky; top: 0; z-index: 10; font-weight: normal; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; }
      .preflight-tree td { padding: 4px 8px; border-bottom: 1px solid rgba(51,65,85,0.4); white-space: nowrap; }
      .preflight-group-1 { background: #0f172a; font-weight: bold; color: #f8fafc; border-top: 1px solid #334155; }
      .preflight-group-1 td { padding: 8px; }
      .preflight-group-2 { background: rgba(30,41,59,0.4); font-weight: bold; color: #cbd5e1; }
      .preflight-group-2 td:first-child { padding-left: 24px; }
      .preflight-group-3 { background: rgba(30,41,59,0.2); font-weight: bold; color: #94a3b8; }
      .preflight-group-3 td:first-child { padding-left: 36px; }
      .preflight-leaf { background: transparent; color: #cbd5e1; }
      .preflight-leaf td:first-child { padding-left: 48px; }
      .preflight-leaf:hover { background: rgba(56,189,248,0.05); }
      .preflight-input { background: #1e293b; color: #e2e8f0; border: 1px solid #475569; border-radius: 4px; padding: 2px 6px; font-size: 11px; width: 90px; }
      .preflight-input:focus { border-color: #38bdf8; outline: none; background: #0f172a; }
      .val-deduced { background: rgba(234, 179, 8, 0.15); border-radius: 2px; padding: 1px 4px; color: #fde047; }
      .val-loaded { background: rgba(16, 185, 129, 0.2); border-radius: 2px; padding: 1px 4px; color: #34d399; font-weight: bold; }
      .val-error { background: rgba(239, 68, 68, 0.15); border-radius: 2px; padding: 1px 4px; color: #fca5a5; font-weight: bold; }
    </style>
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex: none;">
      <div>
        <h3 style="margin: 0 0 4px 0; color: #38bdf8; font-size: 16px;">Task-Level Pre-Flight Grid</h3>
        <p style="margin: 0; font-size: 12px; color: #94a3b8; max-width: 600px; line-height: 1.4;">
          Tolerance-Based Clustering groups branches by Service, Rating, and Class. 
          Use "Load Process Data" to auto-populate P1, T1-T3, and fluid densities from saved Line List master.
        </p>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="btn-load-process-data" style="background: #10b981; color: white; border: none; border-radius: 6px; padding: 6px 16px; font-size: 12px; font-weight: bold; cursor: pointer; transition: background 0.2s;">⚡ Load Process Data</button>
        <button id="btn-derive-wall-thickness" style="background: #8b5cf6; color: white; border: none; border-radius: 6px; padding: 6px 16px; font-size: 12px; font-weight: bold; cursor: pointer; transition: background 0.2s;" title="Derive Wall Thickness based on DTXR & Piping Specification">Derive Wall Thickness (DTXR)</button>
        <button style="background: #1e293b; color: #e2e8f0; border: 1px solid #334155; border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer;">Filters ▾</button>
        <button id="btn-topology-autofix" style="background: #6366f1; color: white; border: none; border-radius: 6px; padding: 6px 16px; font-size: 12px; font-weight: bold; cursor: pointer; transition: background 0.2s;">Autofix Overlaps</button>
        <button id="btn-execute-preflight" style="background: #0284c7; color: white; border: none; border-radius: 6px; padding: 6px 16px; font-size: 12px; font-weight: bold; cursor: pointer; transition: background 0.2s;">Run Fallback Verification</button>
      </div>
    </div>
    <div style="flex: 1; overflow: auto; border: 1px solid #334155; border-radius: 6px; background: #0b1121;" id="preflight-table-container">
      <div style="padding: 20px; color: #94a3b8; font-size: 12px; text-align: center;">Loading branch topology...</div>
    </div>
  `;

  // Attach Derive Wall Thickness listener
  const btnDeriveWt = wrap.querySelector('#btn-derive-wall-thickness');
  if (btnDeriveWt) {
    btnDeriveWt.addEventListener('click', () => {
      const tableContainer = wrap.querySelector('#preflight-table-container');
      if (!tableContainer) return;
      const lkInputs = tableContainer.querySelectorAll('.lk-val-input[data-field="wallThickness"]');
      lkInputs.forEach(input => {
        const lkRow = input.closest('tr[data-tree-id]');
        if (!lkRow) return;
        const lkId = lkRow.dataset.treeId;
        const boreTd = lkRow.children[2]?.textContent || '150';
        const clsTd = lkRow.children[1]?.textContent || '';
        const wt = deriveWallThicknessFromDtxr(boreTd, clsTd);
        input.value = wt;
        
        const statusCell = lkRow.querySelector('.lk-status-cell');
        if (statusCell) {
          statusCell.innerHTML = '<span style="color:#a855f7; font-weight:bold;">⚡ DTXR Derived</span>';
        }

        if (lkId) {
          const leafRows = tableContainer.querySelectorAll(`tr[data-parent-id="${lkId}"]`);
          leafRows.forEach(leaf => {
            const leafSpan = leaf.querySelector('.leaf-wallThickness');
            if (leafSpan) leafSpan.textContent = wt;
          });
        }
      });
    });
  }

  // Attach Load Process Data logic
  const btnProcessData = wrap.querySelector('#btn-load-process-data');
  if (btnProcessData) {
    btnProcessData.addEventListener('click', () => {
      const lineRows = masterDataController.getMasterData()?.lineList?.normalizedRows || masterDataController.getLegacyContext()?.lineRows || [];
      if (!lineRows.length) {
        alert('⚠️ No saved Line List master data found in localStorage. Please upload or save a Line List in the Master Data tab first!');
        return;
      }
      
      loadedProcessOverrides = {};
      btnProcessData.textContent = `✅ Process Data Loaded (${lineRows.length} rows)`;
      btnProcessData.style.background = '#059669';
      
      // Re-render tree grid with loaded process data
      loadAndRenderTreeGrid(wrap.querySelector('#preflight-table-container'), model, lineRows);
    });
  }
  
  // Attach Autofix Modal logic
  const btnAutofix = wrap.querySelector('#btn-topology-autofix');
  if (btnAutofix) {
    btnAutofix.addEventListener('click', () => {
      // Create Modal
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.8); display: flex; align-items: center; justify-content: center; z-index: 1000;';
      
      const modal = document.createElement('div');
      modal.style.cssText = 'background: #1e293b; border: 1px solid #334155; border-radius: 8px; width: 400px; padding: 24px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);';
      
      modal.innerHTML = `
        <h3 style="margin: 0 0 16px 0; color: #f8fafc; font-size: 16px;">Topology Autofix Settings</h3>
        <p style="color: #94a3b8; font-size: 12px; margin-bottom: 20px;">Configure the engine to automatically merge overlapping supports.</p>
        
        <div style="margin-bottom: 16px;">
          <label style="display: block; color: #cbd5e1; font-size: 12px; margin-bottom: 8px;">Spatial Tolerance (mm)</label>
          <input type="number" id="autofix-tolerance" value="1.0" step="0.1" style="width: 100%; background: #0f172a; border: 1px solid #475569; color: white; padding: 8px; border-radius: 4px; font-size: 14px;">
        </div>
        
        <div style="margin-bottom: 24px;">
          <label style="display: block; color: #cbd5e1; font-size: 12px; margin-bottom: 8px;">Merge Priority Logic</label>
          <select id="autofix-priority" style="width: 100%; background: #0f172a; border: 1px solid #475569; color: white; padding: 8px; border-radius: 4px; font-size: 14px;">
            <option value="hierarchy">REST > LINESTOP > SUPPORT > SREF</option>
            <option value="first">Use First Found</option>
          </select>
        </div>
        
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
          <button id="autofix-cancel" style="background: transparent; color: #cbd5e1; border: 1px solid #475569; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Cancel</button>
          <button id="autofix-analyze" style="background: #6366f1; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold;">Analyze & Visualize in 3D</button>
        </div>
      `;
      
      overlay.appendChild(modal);
      wrap.appendChild(overlay);
      
      modal.querySelector('#autofix-cancel').addEventListener('click', () => overlay.remove());
      modal.querySelector('#autofix-analyze').addEventListener('click', () => {
        overlay.remove();
        const tolerance = parseFloat(modal.querySelector('#autofix-tolerance').value) || 1.0;
        
        // Dispatch event to application shell to run the autofix visualization
        const event = new CustomEvent('topology:autofix-visualize', {
          bubbles: true,
          detail: { tolerance }
        });
        wrap.dispatchEvent(event);
      });
    });
  }

  // Listen to the analyze event
  wrap.addEventListener('topology:autofix-visualize', async (e) => {
    const tolerance = e.detail.tolerance || 1.0;
    
    // Use the compiled sharedModel supports directly or fallback to demo supports
    let elements = model?._context?.contracts?.sharedModel?.supports;
    if (!elements || elements.length === 0) {
      elements = [
        { supportKey: 'ROUTE-SUPP-1', name: 'ROUTE-SUPP-1', type: 'SUPPORT', position: { x: 500, y: 0, z: 0 }, supportEvidence: { SUPPORT_TYPE: 'REST' } },
        { supportKey: 'ROUTE-SUPP-1-SREF', name: 'ROUTE-SUPP-1/SREF', type: 'SUPPORT', position: { x: 500, y: 0, z: 0 }, supportEvidence: { SUPPORT_TYPE: 'SREF' } },
        { supportKey: 'ROUTE-SUPP-2', name: 'ROUTE-SUPP-2', type: 'SUPPORT', position: { x: 2000, y: 3000, z: -1500 }, supportEvidence: { SUPPORT_TYPE: 'LINESTOP' } },
        { supportKey: 'ROUTE-SUPP-2-SREF', name: 'ROUTE-SUPP-2/SREF', type: 'SUPPORT', position: { x: 2000, y: 3000, z: -1500 }, supportEvidence: { SUPPORT_TYPE: 'SREF' } },
        { supportKey: 'ROUTE-SUPP-3', name: 'ROUTE-SUPP-3', type: 'SUPPORT', position: { x: 3000, y: 1000, z: -2500 }, supportEvidence: { SUPPORT_TYPE: 'ANCHOR' } },
      ];
    }
    
    const results = analyzeTopologyOverlaps(elements, tolerance);
    
    // Dispatch global event for 3D Viewer to render overlays
    document.dispatchEvent(new CustomEvent('viewport:render-autofix-overlays', { detail: { merges: results.merges } }));
    
    // Render the Log Ledger
    mountAutofixLog(wrap, results.merges, (coordinate) => {
       // Request 3D viewer to fly to coordinate
       document.dispatchEvent(new CustomEvent('viewport:fly-to', { detail: { target: coordinate } }));
    });
    
    // Store elements context for acceptance
    wrap._activeAutofixContext = { elements, merges: results.merges };
  });
  
  wrap.addEventListener('topology:autofix-accept', async () => {
    if (!wrap._activeAutofixContext) return;
    const { elements, merges } = wrap._activeAutofixContext;
    
    const absorbedNames = new Set(merges.flatMap(m => m.absorbed.map(a => a.name || a.supportKey)));
    const fixedElements = elements.map(n => {
        const key = n.name || n.supportKey;
        if (absorbedNames.has(key)) {
            return { ...n, attributes: { ...n.attributes, IGNORED_OVERLAP: true }, type: 'IGNORED_SUPPORT' };
        }
        return n;
    });

    if (model && model._context && model._context.contracts && model._context.contracts.sharedModel) {
      // Patch the consumer context's sharedModel supports
      model._context.contracts.sharedModel = {
        ...model._context.contracts.sharedModel,
        supports: fixedElements
      };
      
      // Dispatch rebuild so the Load Engine immediately flushes cache and uses the new fixed topology
      wrap.dispatchEvent(new CustomEvent('topology:rebuild-requested', { bubbles: true }));
    }
    
    // Clear 3D Overlays
    document.dispatchEvent(new CustomEvent('viewport:clear-autofix-overlays'));
    
    wrap._activeAutofixContext = null;
    if (renderCallback) renderCallback();
  });
  
  wrap.addEventListener('topology:autofix-reject', () => {
    document.dispatchEvent(new CustomEvent('viewport:clear-autofix-overlays'));
  });

  container.appendChild(wrap);
  
  // Load data to populate the grid
  loadAndRenderTreeGrid(wrap.querySelector('#preflight-table-container'), model);
}

async function loadAndRenderTreeGrid(container, model, processLineRows = null) {
  try {
    let elements = [];
    if (Array.isArray(model)) {
      elements = model;
    } else if (model?._context?.contracts?.sharedModel) {
      const sm = model._context.contracts.sharedModel;
      elements = [...(sm.components || []), ...(sm.supports || [])];
    } else if (model?.components || model?.branches) {
      elements = [...(model.branches || []), ...(model.components || [])];
    }
    
    // Fallback demonstration dataset if no active dataset
    if (!elements || elements.length === 0) {
      elements = [
        { name: '/ASIM-1885-6"-S8811951-91261M7-HC-01/B1', type: 'BRANCH', boreMm: 150 },
        { name: '/ASIM-1885-8"-S8811951-91261M7-HC-01/B2', type: 'BRANCH', boreMm: 200 },
        { name: '/ASIM-1885-12"-S8811951-93001M7-HC-02/B1', type: 'BRANCH', boreMm: 300 },
        { name: '/ASIM-1885-24"-S8811951-96001M7-HC-03/B1', type: 'BRANCH', boreMm: 650 },
      ];
    }
    
    const lineRows = processLineRows || masterDataController.getMasterData()?.lineList?.normalizedRows || masterDataController.getLegacyContext()?.lineRows || [];
    
    // Flatten components/branches into individual items grouped by Line Key
    const allItems = [];
    elements.forEach(item => {
      if (Array.isArray(item.children) && item.children.length > 0) {
        item.children.forEach(child => {
          allItems.push({
            ...child,
            lineKeyName: item.name || item.id || child.attributes?.OWNER || 'UNASSIGNED_LINEKEY'
          });
        });
      } else {
        const ownerName = item.attributes?.OWNER || item.owner || item.branchName || item.name || 'UNASSIGNED_LINEKEY';
        allItems.push({
          ...item,
          lineKeyName: ownerName
        });
      }
    });

    const parsedItems = allItems.map(item => {
      const rawFullName = item.lineKeyName || item.name || item.id || '';
      const cleanFullName = rawFullName.startsWith('/') ? rawFullName.substring(1) : rawFullName;

      // Extract isolated Line Key token e.g. S8811951 using deriveLineKeyFromBranchName
      let isolatedLineKeyToken = deriveLineKeyFromBranchName(cleanFullName, {}) || deriveLineKeyFromBranchName(rawFullName, {});
      if (!isolatedLineKeyToken) {
        const stripped = cleanFullName.replace(/\/B\d+.*$/i, '');
        const match = stripped.match(/(?:S|D|PL|HC)?\d{4,}/i);
        isolatedLineKeyToken = match ? match[0] : stripped;
      }
      
      const fullLineKeyName = cleanFullName.replace(/\/B\d+.*$/i, '');
      const service = deriveXmlCiiServiceFromBranchName(cleanFullName, {}) || 'UNKNOWN';
      let cls = item.attributes?.SPEC || 'UNKNOWN_SPEC';
      let rating = item.attributes?.RATING || 'UNKNOWN_RATING';
      let bore = item.boreMm || item._boreValue || item.bore || 150;
      if (typeof bore === 'string') bore = parseFloat(bore) || 150;

      const parts = cleanFullName.split('-');
      if (parts.length > 3) {
        if (cls === 'UNKNOWN_SPEC') cls = parts[4] || parts[3] || cls;
        if (rating === 'UNKNOWN_RATING') {
          if (cls.startsWith('9')) rating = '900#';
          else if (cls.startsWith('3')) rating = '300#';
          else if (cls.startsWith('15')) rating = '1500#';
          else if (cls.startsWith('1')) rating = '150#';
          else if (cls.startsWith('6')) rating = '600#';
        }
      }

      const itemName = item.name || item.id || item.supportKey || item.type || 'ITEM';
      const itemType = item.type || item.RAW_TYPE || 'ITEM';

      return {
        id: item.id || itemName,
        itemName,
        itemType,
        isolatedLineKeyToken,
        fullLineKeyName,
        service,
        rating,
        cls,
        bore
      };
    });

    // Grouping: Service -> Rating -> Class -> LineKeyToken -> Items
    const groups = {};
    parsedItems.forEach(item => {
      if (!groups[item.service]) groups[item.service] = {};
      if (!groups[item.service][item.rating]) groups[item.service][item.rating] = {};
      if (!groups[item.service][item.rating][item.cls]) groups[item.service][item.rating][item.cls] = {};
      
      const groupKey = item.isolatedLineKeyToken || item.fullLineKeyName;
      if (!groups[item.service][item.rating][item.cls][groupKey]) {
        groups[item.service][item.rating][item.cls][groupKey] = {
          isolatedLineKeyToken: item.isolatedLineKeyToken,
          fullLineKeyName: item.fullLineKeyName,
          service: item.service,
          rating: item.rating,
          cls: item.cls,
          bore: item.bore,
          items: [],
          p1: 0, t1: 0, t2: 0, t3: 0,
          phase: 'L',
          fluidDensity: 1000,
          metalDensity: 7850,
          isProcessMatched: false
        };
      }
      groups[item.service][item.rating][item.cls][groupKey].items.push(item);
    });

    // Pre-index lineRows into an O(1) lookup Map to eliminate browser main thread freeze
    const lineRowMap = new Map();
    if (lineRows && lineRows.length) {
      lineRows.forEach(r => {
        const lKey = String(r.lineKey || r.lineNoKey || r.lineNo || r.lineSeqNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (lKey && lKey.length >= 3) lineRowMap.set(lKey, r);
        
        const k2 = String(r.lineKey2 || r.lineSeqNo || r.lineNo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (k2 && k2.length >= 3) lineRowMap.set(k2, r);

        const k1 = String(r.lineKey1 || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (k1 && k2 && (k1 + k2).length >= 3) lineRowMap.set(k1 + k2, r);
      });
    }

    // Match each Line Key against master lineList rows using O(1) lookup
    for (const srv of Object.keys(groups)) {
      for (const rat of Object.keys(groups[srv])) {
        for (const cls of Object.keys(groups[srv][rat])) {
          for (const lKeyStr of Object.keys(groups[srv][rat][cls])) {
            const lkObj = groups[srv][rat][cls][lKeyStr];
            if (lineRows.length) {
              const cleanLk = (lkObj.isolatedLineKeyToken || lkObj.fullLineKeyName).toUpperCase().replace(/[^A-Z0-9]/g, '');
              let matchedRow = lineRowMap.get(cleanLk);
              
              if (!matchedRow) {
                for (const [key, r] of lineRowMap.entries()) {
                  if (cleanLk.length >= 3 && key.length >= 3 && (cleanLk.includes(key) || key.includes(cleanLk))) {
                    matchedRow = r;
                    break;
                  }
                }
              }

              if (matchedRow) {
                lkObj.isProcessMatched = true;
                lkObj.p1 = Number(matchedRow.p1 || matchedRow.hydroPressure || 0);
                lkObj.t1 = Number(matchedRow.t1 || 0);
                lkObj.t2 = Number(matchedRow.t2 || 0);
                lkObj.t3 = Number(matchedRow.t3 || 0);
                lkObj.phase = matchedRow.phase || 'L';
                lkObj.fluidDensity = Number(matchedRow.density || matchedRow.densityMixed || 1000);
                if (matchedRow.pipingClass) lkObj.cls = matchedRow.pipingClass;
                if (matchedRow.rating) lkObj.rating = matchedRow.rating;
              }
            }
          }
        }
      }
    }

    // Render HTML Tree Grid
    let html = `
      <table class="preflight-tree">
        <thead>
          <tr>
            <th>Group / Isolated Line Key / Member Tree</th>
            <th>Class</th>
            <th>Bore (mm)</th>
            <th>Wall Thk (mm)</th>
            <th>P1 (kPa)</th>
            <th>T1 (°C)</th>
            <th>T2 (°C)</th>
            <th>T3 (°C)</th>
            <th>Phase</th>
            <th>Fluid &rho;</th>
            <th>Metal &rho;</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
    `;

    let srvIdx = 0;
    for (const [srv, ratings] of Object.entries(groups)) {
      srvIdx++;
      const srvId = `srv-${srvIdx}`;

      // Pick default values from first available line key
      let firstLk = {};
      for (const rat of Object.values(ratings)) {
        for (const cls of Object.values(rat)) {
          const lks = Object.values(cls);
          if (lks.length) { firstLk = lks[0]; break; }
        }
        if (firstLk.p1) break;
      }

      // Service-Level Bulk Fill Down Row
      html += `
        <tr class="preflight-group-1" data-tree-id="${srvId}" data-srv-name="${srv}" style="background: #0f172a; color: #f8fafc; border-top: 1px solid #334155;">
          <td style="padding: 8px;"><span class="toggle-icon">[-]</span> <strong>SERVICE: ${srv}</strong></td>
          <td><span style="color:#94a3b8; font-size:10px;">Service Header</span></td>
          <td><button class="btn-fill-down" data-action="fill-down-service" data-srv-id="${srvId}" style="background: #10b981; color: #0f172a; border: none; border-radius: 3px; padding: 2px 6px; font-size: 10px; font-weight: bold; cursor: pointer;" title="Fill Down values to ALL lines in this Service">⚡ Fill Service</button></td>
          <td><input type="text" class="preflight-input srv-val-input" data-srv-id="${srvId}" data-field="p1" value="${firstLk.p1 || ''}" placeholder="Srv P1"></td>
          <td><input type="text" class="preflight-input srv-val-input" data-srv-id="${srvId}" data-field="t1" value="${firstLk.t1 || ''}" placeholder="Srv T1"></td>
          <td><input type="text" class="preflight-input srv-val-input" data-srv-id="${srvId}" data-field="t2" value="${firstLk.t2 || ''}" placeholder="Srv T2"></td>
          <td><input type="text" class="preflight-input srv-val-input" data-srv-id="${srvId}" data-field="t3" value="${firstLk.t3 || ''}" placeholder="Srv T3"></td>
          <td><input type="text" class="preflight-input srv-val-input" data-srv-id="${srvId}" data-field="phase" value="${firstLk.phase || 'L'}" placeholder="Phase" style="width: 35px;"></td>
          <td><input type="text" class="preflight-input srv-val-input" data-srv-id="${srvId}" data-field="fluidDensity" value="${firstLk.fluidDensity || '1000'}" placeholder="Density" style="width: 50px;"></td>
          <td>${firstLk.metalDensity || 7850}</td>
          <td><span style="color:#34d399; font-size:10px;">Service Fill-Down</span></td>
        </tr>
      `;

      let ratIdx = 0;
      for (const [rat, classes] of Object.entries(ratings)) {
        ratIdx++;
        const ratId = `${srvId}-rat-${ratIdx}`;
        html += `
          <tr class="preflight-group-2" data-tree-id="${ratId}" data-parent-id="${srvId}" style="cursor: pointer; user-select: none;">
            <td colspan="11" style="padding-left: 20px;"><span class="toggle-icon">[-]</span> RATING: ${rat}</td>
          </tr>
        `;

        let clsIdx = 0;
        for (const [cls, lineKeys] of Object.entries(classes)) {
          clsIdx++;
          const clsId = `${ratId}-cls-${clsIdx}`;
          // Group default values for class fill down
          const firstClsLk = Object.values(lineKeys)[0] || {};
          html += `
            <tr class="preflight-group-3" data-tree-id="${clsId}" data-parent-id="${ratId}" data-cls-name="${cls}" style="background: rgba(30, 41, 59, 0.6);">
              <td style="padding-left: 32px;"><span class="toggle-icon">[-]</span> <strong>CLASS: ${cls}</strong></td>
              <td><input type="text" class="preflight-input cls-override-input" value="${cls}" data-cls-key="${cls}" placeholder="Class Name"></td>
              <td><button class="btn-fill-down" data-action="fill-down-class" data-cls-id="${clsId}" style="background: #38bdf8; color: #0f172a; border: none; border-radius: 3px; padding: 2px 6px; font-size: 10px; font-weight: bold; cursor: pointer;" title="Fill Down values to all lines in this class">⚡ Fill Class</button></td>
              <td><input type="text" class="preflight-input cls-val-input" data-cls-id="${clsId}" data-field="p1" value="${firstClsLk.p1 || ''}" placeholder="Class P1"></td>
              <td><input type="text" class="preflight-input cls-val-input" data-cls-id="${clsId}" data-field="t1" value="${firstClsLk.t1 || ''}" placeholder="Class T1"></td>
              <td><input type="text" class="preflight-input cls-val-input" data-cls-id="${clsId}" data-field="t2" value="${firstClsLk.t2 || ''}" placeholder="Class T2"></td>
              <td><input type="text" class="preflight-input cls-val-input" data-cls-id="${clsId}" data-field="t3" value="${firstClsLk.t3 || ''}" placeholder="Class T3"></td>
              <td><input type="text" class="preflight-input cls-val-input" data-cls-id="${clsId}" data-field="phase" value="${firstClsLk.phase || 'L'}" placeholder="Phase" style="width: 35px;"></td>
              <td><input type="text" class="preflight-input cls-val-input" data-cls-id="${clsId}" data-field="fluidDensity" value="${firstClsLk.fluidDensity || '1000'}" placeholder="Density" style="width: 50px;"></td>
              <td>${firstClsLk.metalDensity || 7850}</td>
              <td><span style="color:#7dd3fc; font-size:10px;">Class Fill-Down</span></td>
            </tr>
          `;

          let lkIdx = 0;
          for (const [lkName, lkObj] of Object.entries(lineKeys)) {
            lkIdx++;
            const lkId = `${clsId}-lk-${lkIdx}`;
            const displayKeyToken = lkObj.isolatedLineKeyToken || lkObj.fullLineKeyName;

            // Single Row per Isolated Line Key with Inline Editable Inputs
            const derivedWt = deriveWallThicknessFromDtxr(lkObj.bore, lkObj.cls);
            html += `
              <tr class="preflight-group-4" data-tree-id="${lkId}" data-parent-id="${clsId}" data-lk-token="${displayKeyToken}" style="background: rgba(56, 189, 248, 0.08); font-weight: bold;">
                <td style="padding-left: 44px;">
                  <span class="toggle-icon">[+]</span> <strong>LINE KEY: ${displayKeyToken}</strong> 
                  <span style="color:#94a3b8; font-size:10px; font-weight:normal; margin-left:6px;">(${lkObj.fullLineKeyName} &bull; ${lkObj.items.length} items)</span>
                </td>
                <td>${lkObj.cls}</td>
                <td>${lkObj.bore || 150}</td>
                <td><input type="text" class="preflight-input lk-val-input" data-lk-id="${lkId}" data-field="wallThickness" value="${lkObj.wallThickness || derivedWt}" style="width: 55px;"></td>
                <td><input type="text" class="preflight-input lk-val-input" data-lk-id="${lkId}" data-field="p1" value="${lkObj.p1 || ''}"></td>
                <td><input type="text" class="preflight-input lk-val-input" data-lk-id="${lkId}" data-field="t1" value="${lkObj.t1 || ''}"></td>
                <td><input type="text" class="preflight-input lk-val-input" data-lk-id="${lkId}" data-field="t2" value="${lkObj.t2 || ''}"></td>
                <td><input type="text" class="preflight-input lk-val-input" data-lk-id="${lkId}" data-field="t3" value="${lkObj.t3 || ''}"></td>
                <td><input type="text" class="preflight-input lk-val-input" data-lk-id="${lkId}" data-field="phase" value="${lkObj.phase || 'L'}" style="width: 35px;"></td>
                <td><input type="text" class="preflight-input lk-val-input" data-lk-id="${lkId}" data-field="fluidDensity" value="${lkObj.fluidDensity || '1000'}" style="width: 50px;"></td>
                <td>${lkObj.metalDensity}</td>
                <td class="lk-status-cell">${lkObj.isProcessMatched ? '<span style="color:#34d399; font-weight:bold;">✅ Line Key Matched</span>' : (lkObj.bore > 600 ? '<span class="val-error">🛑 Verify > 24"</span>' : '<span class="val-deduced">⚠️ Deduced</span>')}</td>
              </tr>
            `;

            // Member Component Leaf Rows (Collapsed by default under the single Line Key row)
            for (const item of lkObj.items) {
              html += `
                <tr class="preflight-leaf" data-parent-id="${lkId}" style="display: none; color: #cbd5e1; font-size: 11px;">
                  <td style="padding-left: 64px;">↳ ${item.itemType} ${item.itemName}</td>
                  <td>${lkObj.cls}</td>
                  <td>${item.bore || lkObj.bore || 150}</td>
                  <td><span class="leaf-wallThickness">${derivedWt}</span></td>
                  <td><span class="leaf-p1">${lkObj.p1 || '-'}</span></td>
                  <td><span class="leaf-t1">${lkObj.t1 || '-'}</span></td>
                  <td><span class="leaf-t2">${lkObj.t2 || '-'}</span></td>
                  <td><span class="leaf-t3">${lkObj.t3 || '-'}</span></td>
                  <td><span class="leaf-phase">${lkObj.phase}</span></td>
                  <td><span class="leaf-fluidDensity">${lkObj.fluidDensity}</span></td>
                  <td>${lkObj.metalDensity}</td>
                  <td><span style="color: #64748b;">Member of ${displayKeyToken}</span></td>
                </tr>
              `;
            }
          }
        }
      }
    }

    html += `</tbody></table>`;
    container.innerHTML = html;

    // Attach Fill Down & Event Delegation Handlers
    container.addEventListener('click', (e) => {
      // 1. Fill Down Service Button Click Handler
      const srvBtn = e.target.closest('[data-action="fill-down-service"]');
      if (srvBtn) {
        e.stopPropagation();
        const srvId = srvBtn.dataset.srvId;
        const srvRow = container.querySelector(`tr[data-tree-id="${srvId}"]`);
        if (!srvRow) return;

        const srvValues = {};
        srvRow.querySelectorAll('.srv-val-input').forEach(input => {
          srvValues[input.dataset.field] = input.value;
        });

        // Fill Down to all child Class inputs and Line Key inputs under this Service
        const allSrvInputs = container.querySelectorAll(`tr[data-parent-id^="${srvId}"] .cls-val-input, tr[data-parent-id^="${srvId}"] .lk-val-input`);
        allSrvInputs.forEach(input => {
          const field = input.dataset.field;
          if (srvValues[field] !== undefined) {
            input.value = srvValues[field];
          }
        });

        // Also fill down to deeper descendant Line Keys
        const srvLkRows = container.querySelectorAll(`.preflight-group-4`);
        srvLkRows.forEach(lkRow => {
          const lkId = lkRow.dataset.treeId;
          if (lkId && lkId.startsWith(srvId)) {
            lkRow.querySelectorAll('.lk-val-input').forEach(input => {
              const field = input.dataset.field;
              if (srvValues[field] !== undefined) input.value = srvValues[field];
            });

            const statusCell = lkRow.querySelector('.lk-status-cell');
            if (statusCell) {
              statusCell.innerHTML = '<span style="color:#10b981; font-weight:bold;">⚡ Service Filled</span>';
            }

            const leafRows = container.querySelectorAll(`tr[data-parent-id="${lkId}"]`);
            leafRows.forEach(leaf => {
              Object.entries(srvValues).forEach(([field, val]) => {
                const leafSpan = leaf.querySelector(`.leaf-${field}`);
                if (leafSpan) leafSpan.textContent = val || '-';
              });
            });
          }
        });
        return;
      }

      // 2. Fill Down Class Button Click Handler
      const clsBtn = e.target.closest('[data-action="fill-down-class"]');
      if (clsBtn) {
        e.stopPropagation();
        const clsId = clsBtn.dataset.clsId;
        const clsRow = container.querySelector(`tr[data-tree-id="${clsId}"]`);
        if (!clsRow) return;

        // Read Class Header Values
        const classValues = {};
        clsRow.querySelectorAll('.cls-val-input').forEach(input => {
          classValues[input.dataset.field] = input.value;
        });

        // Fill Down to all child Line Key rows under this class
        const childLkRows = container.querySelectorAll(`tr[data-parent-id="${clsId}"]`);
        childLkRows.forEach(lkRow => {
          const lkId = lkRow.dataset.treeId;
          lkRow.querySelectorAll('.lk-val-input').forEach(input => {
            const field = input.dataset.field;
            if (classValues[field] !== undefined) {
              input.value = classValues[field];
            }
          });

          // Update Status Badge
          const statusCell = lkRow.querySelector('.lk-status-cell');
          if (statusCell) {
            statusCell.innerHTML = '<span style="color:#38bdf8; font-weight:bold;">⚡ Class Filled</span>';
          }

          // Update Leaf child values
          if (lkId) {
            const leafRows = container.querySelectorAll(`tr[data-parent-id="${lkId}"]`);
            leafRows.forEach(leaf => {
              Object.entries(classValues).forEach(([field, val]) => {
                const leafSpan = leaf.querySelector(`.leaf-${field}`);
                if (leafSpan) leafSpan.textContent = val || '-';
              });
            });
          }
        });
        return;
      }

      // 3. Collapsible Tree Toggle
      const toggleRow = e.target.closest('[data-tree-id]');
      if (!toggleRow || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;

      const treeId = toggleRow.dataset.treeId;
      const iconSpan = toggleRow.querySelector('.toggle-icon');
      const isExpanded = iconSpan ? iconSpan.textContent === '[-]' : false;

      const setChildrenVisibility = (parentId, visible) => {
        const directChildren = container.querySelectorAll(`[data-parent-id="${parentId}"]`);
        directChildren.forEach(child => {
          child.style.display = visible ? '' : 'none';
          const childTreeId = child.dataset.treeId;
          const childIcon = child.querySelector('.toggle-icon');
          const childExpanded = childIcon ? childIcon.textContent === '[-]' : false;
          
          if (childTreeId) {
            setChildrenVisibility(childTreeId, visible && childExpanded);
          }
        });
      };

      if (isExpanded) {
        if (iconSpan) iconSpan.textContent = '[+]';
        setChildrenVisibility(treeId, false);
      } else {
        if (iconSpan) iconSpan.textContent = '[-]';
        setChildrenVisibility(treeId, true);
      }
    });

    // 4. Live Cell Edit Listener for Line Key inputs
    container.addEventListener('input', (e) => {
      const lkInput = e.target.closest('.lk-val-input');
      if (lkInput) {
        const lkRow = lkInput.closest('tr[data-tree-id]');
        if (!lkRow) return;
        const lkId = lkRow.dataset.treeId;
        const field = lkInput.dataset.field;
        const val = lkInput.value;

        // Update status badge
        const statusCell = lkRow.querySelector('.lk-status-cell');
        if (statusCell) {
          statusCell.innerHTML = '<span style="color:#fbbf24; font-weight:bold;">✏️ Overridden</span>';
        }

        // Update leaf rows under this line key
        if (lkId) {
          const leafRows = container.querySelectorAll(`tr[data-parent-id="${lkId}"]`);
          leafRows.forEach(leaf => {
            const leafSpan = leaf.querySelector(`.leaf-${field}`);
            if (leafSpan) leafSpan.textContent = val || '-';
          });
        }
      }
    });

    // 3. Reactivity on Input Change (Single Line Custom Overrides & Auto Fill-Down on Class Inputs)
    container.addEventListener('input', (e) => {
      // Individual Line Key Input Change
      const lkInput = e.target.closest('.lk-val-input');
      if (lkInput) {
        const field = lkInput.dataset.field;
        const newVal = lkInput.value;
        const lkRow = lkInput.closest('tr');
        const lkId = lkRow?.dataset.treeId;

        // Update status to Custom Override
        const statusCell = lkRow?.querySelector('.lk-status-cell');
        if (statusCell) {
          statusCell.innerHTML = '<span style="color:#f59e0b; font-weight:bold;">✏️ Custom Override</span>';
        }

        // Update child leaf rows
        if (lkId) {
          const leafRows = container.querySelectorAll(`tr[data-parent-id="${lkId}"]`);
          leafRows.forEach(leaf => {
            const leafSpan = leaf.querySelector(`.leaf-${field}`);
            if (leafSpan) leafSpan.textContent = newVal || '-';
          });
        }
      }
    });
    
  } catch (err) {
    container.innerHTML = `<div style="padding: 20px; color: #ef4444;">Error loading topology: ${err.message}</div>`;
  }
}
