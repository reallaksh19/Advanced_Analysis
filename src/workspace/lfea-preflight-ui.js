import { renderAdaptedConfigPanel } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-config-tabs.js';
import { createXmlCiiAdaptedWorkflowState } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-state.js';
import { deriveXmlCiiServiceFromBranchName } from '../calc-workspace/cii-standalone-port/core/service-process-fallback.js';
import { analyzeTopologyOverlaps } from '../calc-workspace/cii-standalone-port/core/topology-autofix.js';
import { mountAutofixLog } from './topology-autofix-log.js';

let activeState = createXmlCiiAdaptedWorkflowState();
export function getPreflightStateRef() {
  return { current: activeState };
}

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
      .preflight-leaf { background: transparent; color: #64748b; }
      .preflight-leaf td:first-child { padding-left: 48px; }
      .preflight-leaf:hover { background: rgba(56,189,248,0.05); }
      .preflight-input { background: #1e293b; color: #e2e8f0; border: 1px solid #475569; border-radius: 4px; padding: 2px 6px; font-size: 11px; width: 90px; }
      .preflight-input:focus { border-color: #38bdf8; outline: none; background: #0f172a; }
      .val-deduced { background: rgba(234, 179, 8, 0.15); border-radius: 2px; padding: 1px 4px; color: #fde047; }
      .val-error { background: rgba(239, 68, 68, 0.15); border-radius: 2px; padding: 1px 4px; color: #fca5a5; font-weight: bold; }
    </style>
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex: none;">
      <div>
        <h3 style="margin: 0 0 4px 0; color: #38bdf8; font-size: 16px;">Task-Level Pre-Flight Grid</h3>
        <p style="margin: 0; font-size: 12px; color: #94a3b8; max-width: 600px; line-height: 1.4;">
          Tolerance-Based Clustering groups branches by Service, Rating, and Class. 
          Use parent row overrides to instantly fill down properties to all children branches before load calculation.
        </p>
      </div>
      <div style="display: flex; gap: 8px;">
        <button style="background: #1e293b; color: #e2e8f0; border: 1px solid #334155; border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer;">Filters ▾</button>
        <button id="btn-topology-autofix" style="background: #6366f1; color: white; border: none; border-radius: 6px; padding: 6px 16px; font-size: 12px; font-weight: bold; cursor: pointer; transition: background 0.2s;">Autofix Overlaps</button>
        <button id="btn-execute-preflight" style="background: #0284c7; color: white; border: none; border-radius: 6px; padding: 6px 16px; font-size: 12px; font-weight: bold; cursor: pointer; transition: background 0.2s;">Run Fallback Verification</button>
      </div>
    </div>
    <div style="flex: 1; overflow: auto; border: 1px solid #334155; border-radius: 6px; background: #0b1121;" id="preflight-table-container">
      <div style="padding: 20px; color: #94a3b8; font-size: 12px; text-align: center;">Loading branch topology...</div>
    </div>
  `;
  
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

async function loadAndRenderTreeGrid(container, model) {
  try {
    let elements = [];
    if (model?._context?.contracts?.sharedModel) {
      const sm = model._context.contracts.sharedModel;
      elements = [...(sm.components || []), ...(sm.supports || [])];
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
    
    // Extract branches
    let branches = elements.filter(e => e.type === 'BRANCH' || e.entityType === 'BRANCH');
    if (branches.length === 0) {
      branches = elements.map(e => ({
        name: e.name || e.supportKey || e.componentKey || e.id || 'BRANCH-1',
        boreMm: e.engineeringProperties?.nominalDiameterMm || e.boreMm || 150
      }));
    }
    
    // We will extract Service and Class from the branch name
    // Example: /ASIM-1885-6"-S8811951-91261M7-HC-01/B2
    const parsedBranches = branches.map(b => {
      const name = b.name || '';
      // We know parts are delimited by dashes usually.
      const service = deriveXmlCiiServiceFromBranchName(name, {}) || 'UNKNOWN';
      let cls = 'UNKNOWN_SPEC';
      let rating = 'UNKNOWN_RATING';
      let bore = b.boreMm || 0;
      
      const parts = name.split('-');
      if (parts.length > 5) {
         cls = parts[4]; // just heuristics for visual
         if (cls.startsWith('9')) rating = '900#';
         else if (cls.startsWith('3')) rating = '300#';
         else if (cls.startsWith('15')) rating = '1500#';
         else if (cls.startsWith('1')) rating = '150#';
         else if (cls.startsWith('6')) rating = '600#';
      }
      
      return {
        id: name,
        name: name.split('/').pop() || name, // short name
        service,
        rating,
        cls,
        bore,
        p1: 0, t1: 0, t2: 0, t3: 0,
        phase: 'L',
        fluidDensity: 1000,
        metalDensity: 7850
      };
    });
    
    // Group them: Service -> Rating -> Class
    const groups = {};
    for (const b of parsedBranches) {
      if (!groups[b.service]) groups[b.service] = {};
      if (!groups[b.service][b.rating]) groups[b.service][b.rating] = {};
      if (!groups[b.service][b.rating][b.cls]) groups[b.service][b.rating][b.cls] = [];
      groups[b.service][b.rating][b.cls].push(b);
    }
    
    // Render
    let html = `
      <table class="preflight-tree">
        <thead>
          <tr>
            <th>Group / Branch Name</th>
            <th>Class</th>
            <th>Bore</th>
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
    
    for (const [srv, ratings] of Object.entries(groups)) {
      html += `<tr class="preflight-group-1"><td colspan="11">[-] SERVICE: ${srv}</td></tr>`;
      for (const [rat, classes] of Object.entries(ratings)) {
        html += `<tr class="preflight-group-2"><td colspan="11">[-] RATING: ${rat}</td></tr>`;
        for (const [cls, list] of Object.entries(classes)) {
          html += `
            <tr class="preflight-group-3">
              <td>[-] CLASS: ${cls}</td>
              <td><input type="text" class="preflight-input" value="${cls}" placeholder="Override"></td>
              <td></td>
              <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
            </tr>
          `;
          const rep = list.find(b => b.name.toLowerCase().includes('pipe')) || list.find(b => b.name.toLowerCase().includes('flange')) || list[0];
          html += `
            <tr class="preflight-leaf">
              <td>&#x21b3; ${rep.name} ${list.length > 1 ? `<span style="color:#64748b; font-size:9px; font-style:italic; margin-left:8px;">(+${list.length - 1} more)</span>` : ''}</td>
              <td>${rep.cls}</td>
              <td>${rep.bore}</td>
              <td><span class="val-deduced">1500</span></td>
              <td><span class="val-deduced">80</span></td>
              <td></td>
              <td></td>
              <td>${rep.phase}</td>
              <td><span class="${rep.bore > 600 ? 'val-error' : 'val-deduced'}">${rep.fluidDensity}</span></td>
              <td>${rep.metalDensity}</td>
              <td>${rep.bore > 600 ? '<span class="val-error">🛑 Verify > 24"</span> <button style="font-size:9px; padding:1px 4px; margin-left:4px;">Confirm</button>' : '<span class="val-deduced">⚠️ Deduced</span>'}</td>
            </tr>
          `;
        }
      }
    }
    html += `</tbody></table>`;
    container.innerHTML = html;
    
  } catch (err) {
    container.innerHTML = `<div style="padding: 20px; color: #ef4444;">Error loading topology: ${err.message}</div>`;
  }
}
