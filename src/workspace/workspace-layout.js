import { advancedShellStyles } from './workspace-shell-styles.js';
import { lafeaWorkbenchStyles } from './lafea-workbench.js';
import { lfeaWorkbenchStyles } from './lfea-workbench.js';

/**
 * Mounts the four-view Advanced Analysis shell and its stable controller roots.
 *
 * @param {HTMLElement} rootElement Application host.
 * @returns {void}
 */
export function renderWorkspaceLayout(rootElement) {
  rootElement.replaceChildren();
  const shell = rootElement.ownerDocument.createElement('div');
  shell.innerHTML = workspaceMarkup();
  const style = rootElement.ownerDocument.createElement('style');
  style.textContent = `${advancedShellStyles()}${lafeaWorkbenchStyles()}${lfeaWorkbenchStyles()}`;
  rootElement.append(style, shell.firstElementChild);
}

function workspaceMarkup() {
  return `<div class="application-shell" data-role="application-shell">
    <header class="application-navigation-shell" style="display:flex; justify-content:space-between; align-items:center; min-height:40px; max-height:42px; padding:0 12px; background:#091322; border-bottom:1px solid #1e293b; flex-wrap:wrap; gap:8px;">
      <div class="brand-group" style="display:flex; align-items:center; gap:10px;">
        <div class="brand-logo" aria-hidden="true" style="color:#38bdf8;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div class="brand-text" style="display:flex; align-items:baseline; gap:6px;">
          <span class="brand-title" style="font-weight:800; font-size:13px; color:#f8fafc; letter-spacing:0.5px;">ADVANCED ANALYSIS</span>
          <span class="brand-subtitle" style="font-size:11px; color:#64748b;">· CAD &amp; Piping Support FEA Workspace</span>
        </div>
      </div>
      <div class="navigation-bar-container" style="display:flex; align-items:center; gap:8px;">
        <div class="application-navigation" data-role="application-navigation" role="navigation" aria-label="Application views" style="display:flex; gap:4px;"></div>
        <output class="application-navigation__status" data-role="application-navigation-status" aria-live="polite" style="display:none;"></output>
      </div>
      <div class="top-bar-meta" style="display:flex; align-items:center; gap:8px;">
        <div class="meta-pill" data-role="tab-benchmark-status" data-benchmark-tab="WORKSPACE" data-status="Qualified" style="display:flex; align-items:center; gap:4px; background:#052e16; border:1px solid #14532d; border-radius:12px; padding:2px 10px; font-size:11px; color:#4ade80;">
          <span class="status-dot" style="width:6px; height:6px; border-radius:50%; background:#22c55e;"></span>
          <strong data-role="tab-benchmark-value">Qualified 5/5</strong>
          <a data-role="tab-benchmark-evidence" href="qualification/advanced-tab-benchmarks.md" target="_blank" rel="noopener" style="display:none;">Evidence</a>
        </div>
        <div class="meta-pill" style="display:flex; align-items:center; gap:4px; font-size:11px; color:#94a3b8;"><span class="pill-label">Dataset:</span> <strong data-role="topbar-dataset" style="color:#e2e8f0;">None Loaded</strong></div>
        <div class="meta-pill" style="display:flex; align-items:center; gap:4px; font-size:11px; color:#94a3b8;"><span class="pill-label">System:</span> <strong style="color:#e2e8f0;">SI</strong></div>
        <div class="meta-pill status-ready" style="display:flex; align-items:center; gap:4px; background:#022c22; color:#34d399; padding:2px 8px; border-radius:10px; font-size:11px;"><span class="status-dot" style="width:6px; height:6px; border-radius:50%; background:#10b981;"></span> <strong>Engine Ready</strong></div>
      </div>
    </header>
    <div class="application-view application-view--workspace" data-application-view="WORKSPACE" style="display:flex; flex:1; min-height:0; overflow:hidden;">
      ${workspaceView()}
    </div>
    <div class="application-view application-view--load-calc" data-application-view="LOAD_CALC" hidden aria-hidden="true">
      <div data-role="load-calc-consumer-root"></div>
    </div>
    <div class="application-view application-view--lafea" data-application-view="LAFEA" hidden aria-hidden="true">
      <div data-role="lafea-consumer-root"></div>
    </div>
    <div class="application-view application-view--lfea" data-application-view="LFEA" hidden aria-hidden="true">
      <div data-role="lfea-consumer-root"></div>
    </div>
  </div>`;
}

function qualificationBanner(tabId) {
  return '';
}

function workspaceView() {
  return `<main class="workspace-shell" aria-label="Analysis Workspace">
    <aside class="workspace-panel tree-panel" data-panel="tree" aria-label="Dataset tree and layers">
      <!-- Left Sub-View 1: Workspace Dataset Tree -->
      <div data-left-view="workspace" style="display:flex; flex-direction:column; height:100%; min-height:0;">
        <header class="panel-header">
          <div class="panel-header__title">
            <span class="panel-eyebrow">Analysis Workspace</span>
            <h1>Dataset Tree</h1>
          </div>
          <button type="button" class="panel-collapse-btn" data-action="toggle-tree-collapse" aria-label="Toggle Tree Panel" title="Collapse Tree">◀</button>
          <button type="button" class="panel-expand-btn" data-action="toggle-tree-collapse" aria-label="Expand Tree Panel" title="Expand Tree">▶</button>
        </header>
        <div class="panel-collapsible-content">
          <section class="dataset-toolbar" aria-label="Dataset actions">
            <div class="dataset-toolbar__actions">
              <button type="button" data-action="load-mock-dataset" data-mock-data="true">⚡ Load Mock</button>
              <button type="button" data-action="load-staggered-mock" data-mock-data="true">🧊 Routed 3D</button>
              <button type="button" data-action="import-dataset">📥 Import JSON</button>
              <button type="button" data-action="clear-dataset" disabled>🗑️ Clear</button>
            </div>
            <div class="panel-search-container"><input type="search" data-role="tree-search" class="panel-search-input" placeholder="Search entities..."></div>
            <input data-role="dataset-file" type="file" accept=".json,application/json" hidden>
            <output data-role="tree-status">No dataset loaded</output>
            <p class="dataset-error" data-role="tree-error" hidden></p>
          </section>
          <section class="layer-summary" aria-label="Dataset summary"><span data-role="summary-pipes">Pipes 0</span><span data-role="summary-supports">Supports 0</span></section>
          <div class="tree-list" data-role="tree-list"><p class="panel-empty">Import a supported workspace JSON package.</p></div>
        </div>
      </div>

      <!-- Left Sub-View 2: Load Calc Topology -->
      <div data-left-view="loadcalc" style="display:none; flex-direction:column; height:100%; min-height:0;">
        <header class="panel-header">
          <div class="panel-header__title">
            <span class="panel-eyebrow">Load Calc Workbench</span>
            <h1>Topology &amp; Evidence</h1>
          </div>
          <button type="button" class="panel-collapse-btn" data-action="toggle-tree-collapse" aria-label="Toggle Tree Panel" title="Collapse Tree">◀</button>
          <button type="button" class="panel-expand-btn" data-action="toggle-tree-collapse" aria-label="Expand Tree Panel" title="Expand Tree">▶</button>
        </header>
        <div class="panel-collapsible-content" data-role="load-calc-left-host" style="display:flex; flex-direction:column; flex:1; min-height:0; padding:10px; overflow-y:auto;">
          <p class="panel-empty">Load Calc Topology Summary</p>
        </div>
      </div>
    </aside>
    <div class="panel-resizer panel-resizer--left" data-action="resize-left" aria-label="Resize Left Panel"></div>
    <section class="workspace-panel viewport-panel" data-panel="viewport" aria-label="3D viewport" style="display:flex; flex-direction:column; flex:1; height:100%; min-height:0; overflow:hidden;">
      <header class="viewport-toolbar" style="padding:4px 12px; min-height:38px; max-height:40px; border-bottom:1px solid #1e293b; background:#0f172a; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
          <div class="viewport-tab-selector" style="display:flex; background:#020617; border:1px solid #334155; border-radius:6px; padding:2px; gap:2px;">
            <button type="button" data-action="switch-viewport-tab" data-tab="svg" class="viewport-tab-btn viewport-tab-btn--active" style="padding:4px 12px; border:none; border-radius:4px; background:#0284c7; color:#ffffff; font-weight:700; font-size:11px; cursor:pointer; transition:all 0.15s;">📐 2D SVG &amp; Topology Draft</button>
            <button type="button" data-action="switch-viewport-tab" data-tab="webgl" class="viewport-tab-btn" style="padding:4px 12px; border:none; border-radius:4px; background:transparent; color:#94a3b8; font-weight:700; font-size:11px; cursor:pointer; transition:all 0.15s;">🖥️ 3D WebGL Model</button>
            <button type="button" data-action="switch-viewport-tab" data-tab="split" class="viewport-tab-btn" style="padding:4px 12px; border:none; border-radius:4px; background:transparent; color:#94a3b8; font-weight:700; font-size:11px; cursor:pointer; transition:all 0.15s;">🌗 Split View</button>
          </div>
          <button type="button" data-action="load-webgl-geometry" class="viewport-load-geo-btn" title="Load/Refresh 3D Mesh Geometry" style="padding:5px 10px; border:1px solid #38bdf8; border-radius:5px; background:#0284c7; color:#ffffff; font-weight:700; font-size:11px; cursor:pointer; display:flex; align-items:center; gap:5px; transition:all 0.15s; box-shadow:0 0 10px rgba(56,189,248,0.3);">⚡ Load Geometry</button>
          <button type="button" data-action="toggle-viewport-table" class="viewport-table-toggle-btn" title="Toggle Interactive Editing Data Table" style="padding:5px 10px; border:1px solid #334155; border-radius:5px; background:#0f172a; color:#38bdf8; font-weight:700; font-size:11px; cursor:pointer; display:flex; align-items:center; gap:5px; transition:all 0.15s;">📊 Data Table</button>
          <button type="button" data-action="open-zone-selector" class="viewport-zone-btn" title="Open 2D Drag-Rectangle Zone &amp; Sub-Graph Selector" style="padding:5px 10px; border:1px solid #334155; border-radius:5px; background:#0f172a; color:#facc15; font-weight:700; font-size:11px; cursor:pointer; display:flex; align-items:center; gap:5px; transition:all 0.15s;">🎯 Select Zones</button>
          
          <!-- Topology Primitives Quick-Icons Bar -->
          <div class="topology-primitives-bar" style="display:flex; align-items:center; gap:4px; border-left:1px solid #334155; padding-left:8px; margin-left:4px; flex-wrap:wrap;">
            <span style="font-size:10px; font-weight:700; color:#38bdf8; text-transform:uppercase; margin-right:2px;">Add:</span>
            <button type="button" data-topology-primitive="Node" title="Add/Select Pipe Node" style="padding:3px 7px; background:#0f172a; color:#38bdf8; border:1px solid #334155; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">📍 Node</button>
            <button type="button" data-topology-primitive="Elbow" title="Elbow Fitting" style="padding:3px 7px; background:#0f172a; color:#38bdf8; border:1px solid #334155; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">⭕ Elbow</button>
            <button type="button" data-topology-primitive="Tee" title="Branch Tee Fitting" style="padding:3px 7px; background:#0f172a; color:#38bdf8; border:1px solid #334155; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">🔀 Tee</button>
            <button type="button" data-topology-primitive="Anchor" title="Rigid Anchor Boundary" style="padding:3px 7px; background:#0f172a; color:#ef4444; border:1px solid #334155; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">⚓ Anchor</button>
            <button type="button" data-topology-primitive="Hanger" title="Spring Hanger Support" style="padding:3px 7px; background:#0f172a; color:#facc15; border:1px solid #334155; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">🪝 Hanger</button>
            <button type="button" data-topology-primitive="Restraint" title="Guide/Restraint Support" style="padding:3px 7px; background:#0f172a; color:#4ade80; border:1px solid #334155; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">🛡️ Restraint</button>
          </div>

          <!-- 3D Edit Tools Bar (Move, Stretch, Connect, Split, Rotate, Bridge, Delete, Measure, Autofix) -->
          <div class="topology-edit-tools-bar" style="display:flex; align-items:center; gap:4px; border-left:1px solid #334155; padding-left:8px; margin-left:4px; flex-wrap:wrap;">
            <span style="font-size:10px; font-weight:700; color:#facc15; text-transform:uppercase; margin-right:2px;">Edit:</span>
            <button type="button" data-edit-tool="move-node" title="Move 3D Node Position" style="padding:3px 7px; background:#0f172a; color:#f8fafc; border:1px solid #334155; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">✋ Move</button>
            <button type="button" data-edit-tool="stretch-pipe" title="Axial Pipe Elongation" style="padding:3px 7px; background:#0f172a; color:#f8fafc; border:1px solid #334155; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">↔️ Stretch</button>
            <button type="button" data-edit-tool="connect-node" title="Snap / Merge Node Endpoints" style="padding:3px 7px; background:#0f172a; color:#f8fafc; border:1px solid #334155; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">🔗 Connect</button>
            <button type="button" data-edit-tool="split-edge" title="Split Pipe Segment with Node" style="padding:3px 7px; background:#0f172a; color:#f8fafc; border:1px solid #334155; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">✂️ Split</button>
            <button type="button" data-edit-tool="rotate-subgraph" title="Rotate Pipe Sub-Graph" style="padding:3px 7px; background:#0f172a; color:#f8fafc; border:1px solid #334155; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">🔄 Rotate</button>
            <button type="button" data-edit-tool="bridge-gap" title="Bridge Disconnected Pipe Gap" style="padding:3px 7px; background:#0f172a; color:#f8fafc; border:1px solid #334155; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">🌉 Bridge</button>
            <button type="button" data-edit-tool="delete-entity" title="Delete Selected Entity" style="padding:3px 7px; background:#0f172a; color:#f87171; border:1px solid #334155; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">🗑️ Delete</button>
            <button type="button" data-edit-tool="measure" title="3D Distance Measurement" style="padding:3px 7px; background:#0f172a; color:#38bdf8; border:1px solid #334155; border-radius:4px; font-size:11px; font-weight:700; cursor:pointer;">📏 Measure</button>
            <button type="button" data-edit-tool="run-autofix" title="Run Governed Topology Autofix Engine" style="padding:3px 7px; background:#6366f1; color:#ffffff; border:1px solid #818cf8; border-radius:4px; font-size:11px; font-weight:800; cursor:pointer;">⚡ Autofix</button>
          </div>
        </div>
        <div class="viewport-toolbar__actions" aria-label="Viewport navigation" style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          <div class="toolbar-group">
            <button type="button" data-viewport-action="mode-select" title="Select Entity">Select</button>
            <button type="button" data-viewport-action="mode-orbit" title="Orbit Camera">Orbit</button>
            <button type="button" data-viewport-action="mode-pan" title="Pan Camera">Pan</button>
          </div>
          <div class="toolbar-group">
            <button type="button" data-viewport-action="fit" title="Fit Entire Model">Fit All</button>
            <button type="button" data-viewport-action="fit-selection" title="Fit Selected Entity">Fit Sel</button>
            <button type="button" data-viewport-action="pivot-selection" title="Set Orbit Pivot to Selection">Pivot Sel</button>
            <button type="button" data-viewport-action="clear-pivot" title="Reset Orbit Pivot to Origin">Clear Pivot</button>
            <button type="button" data-viewport-action="home" title="Reset Camera">Home</button>
          </div>
          <div class="toolbar-group">
            <button type="button" data-viewport-action="view-iso" title="Isometric View">ISO</button>
            <button type="button" data-viewport-action="view-top" title="Top View">Top</button>
            <button type="button" data-viewport-action="view-bottom" title="Bottom View">Bot</button>
            <button type="button" data-viewport-action="view-front" title="Front View">Front</button>
            <button type="button" data-viewport-action="view-back" title="Back View">Back</button>
            <button type="button" data-viewport-action="view-left" title="Left View">Left</button>
            <button type="button" data-viewport-action="view-right" title="Right View">Right</button>
          </div>
          <div class="toolbar-group">
            <button type="button" data-viewport-action="toggle-projection" title="Toggle Perspective / Orthographic Camera">🎥 Persp/Ortho</button>
            <button type="button" data-viewport-action="toggle-axis" title="Toggle Y-Up / Z-Up World Alignment">⬆️ Axis</button>
          </div>
        </div>
      </header>
      <div class="viewport-edit-bar" data-role="viewport-edit-bar" style="padding:4px 8px; background:#091322; border-bottom:1px solid #1e293b; display:flex; align-items:center; gap:6px; flex-wrap:wrap; min-height:34px;"></div>
      <div class="viewport-content-wrapper" style="display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden; position:relative;">
        <div class="viewport-stage" data-webgl-host data-role="viewport-render-host" aria-label="Read-only model viewport" style="display:none; height:0; min-height:0; flex:none; position:relative;">
          <div class="webgl-load-prompt" data-role="webgl-load-prompt" style="position:absolute; inset:0; z-index:40; background:rgba(2,6,23,0.92); backdrop-filter:blur(4px); display:none; align-items:center; justify-content:center; flex-direction:column; gap:14px; padding:20px;">
            <div style="font-size:32px;">🖥️⚡</div>
            <span style="font-size:15px; font-weight:700; color:#f8fafc;">3D WebGL Geometry Loading Deferred</span>
            <p style="font-size:12px; color:#94a3b8; max-width:400px; text-align:center; margin:0;">To preserve memory and maintain peak FPS on complex piping networks, high-density 3D meshes load on demand.</p>
            <button type="button" data-action="load-webgl-geometry" style="padding:8px 18px; border-radius:6px; background:#0284c7; color:#fff; font-weight:700; font-size:13px; border:1px solid #38bdf8; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 0 18px rgba(56,189,248,0.4);">⚡ Load 3D Geometry Now</button>
          </div>
        </div>
        <div data-role="sequential-sketcher-root" style="display:flex; flex-direction:column; flex:1; min-height:0; overflow:hidden;"></div>
        <div class="panel-resizer panel-resizer--vertical" data-action="resize-viewport-vertical" aria-label="Resize Viewport Height" title="Drag up/down to adjust Viewport vs Data Table height" style="display:none; height:12px; cursor:row-resize; background:#0f172a; border-top:2px solid #38bdf8; border-bottom:2px solid #38bdf8; align-items:center; justify-content:center; margin:2px 0; user-select:none; z-index:50;">
          <span style="width:50px; height:4px; background:#38bdf8; border-radius:2px; box-shadow:0 0 8px #38bdf8;"></span>
        </div>
        <div class="viewport-table-dock" data-role="viewport-table-dock" style="display:none; flex:0 0 220px; min-height:80px; border-top:1px solid #1e293b; background:#091322; overflow:auto;"></div>
      </div>
      <footer class="viewport-footer" style="display:none;">
        <output data-role="viewport-status">No dataset loaded</output>
        <span class="footer-separator">|</span>
        <span data-role="viewport-selection">Selection: none</span>
      </footer>
    </section>
    <div class="panel-resizer panel-resizer--right" data-action="resize-right" aria-label="Resize Right Panel"></div>
    <aside class="workspace-panel properties-panel" data-panel="properties" aria-label="Properties and analysis actions" style="display:flex; flex-direction:column; min-width:0; height:100%; overflow:hidden;">
      <!-- Right Sub-View 1: Workspace 4-Tab Dashboard -->
      <div data-right-view="workspace" style="display:flex; flex-direction:column; height:100%; min-height:0;">
        <header class="panel-header" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#0f172a; border-bottom:1px solid #1e293b; flex:none;">
          <button type="button" class="panel-expand-btn" data-action="toggle-properties-collapse" aria-label="Expand Properties Panel" title="Expand Properties">◀</button>
          <div class="panel-header__title">
            <span class="panel-eyebrow" style="font-size:10px; color:#38bdf8; font-weight:700; text-transform:uppercase;">Model &amp; Contextual Workflow</span>
            <h2 style="font-size:14px; font-weight:700; color:#f8fafc; margin:0;">Properties &amp; Actions</h2>
          </div>
          <button type="button" class="panel-collapse-btn" data-action="toggle-properties-collapse" aria-label="Toggle Properties Panel" title="Collapse Properties">▶</button>
        </header>
        <div class="right-panel-sub-nav" style="display:flex; background:#020617; border-bottom:1px solid #1e293b; padding:4px; gap:4px; flex:none;">
          <button type="button" data-action="switch-right-tab" data-tab="inspector" class="right-tab-btn right-tab-btn--active" style="flex:1; min-width:0; padding:6px 2px; border:none; border-radius:4px; background:#0284c7; color:#ffffff; font-weight:700; font-size:10px; cursor:pointer; text-align:center; transition:all 0.15s; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="Inspector">🔍 Inspector</button>
          <button type="button" data-action="switch-right-tab" data-tab="health" class="right-tab-btn" style="flex:1; min-width:0; padding:6px 2px; border:none; border-radius:4px; background:transparent; color:#94a3b8; font-weight:700; font-size:10px; cursor:pointer; text-align:center; transition:all 0.15s; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="Health">🩺 Health</button>
          <button type="button" data-action="switch-right-tab" data-tab="loadcalc" class="right-tab-btn" style="flex:1; min-width:0; padding:6px 2px; border:none; border-radius:4px; background:transparent; color:#94a3b8; font-weight:700; font-size:10px; cursor:pointer; text-align:center; transition:all 0.15s; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="Load Calc">⚡ Load Calc</button>
          <button type="button" data-action="switch-right-tab" data-tab="overrides" class="right-tab-btn" style="flex:1; min-width:0; padding:6px 2px; border:none; border-radius:4px; background:transparent; color:#94a3b8; font-weight:700; font-size:10px; cursor:pointer; text-align:center; transition:all 0.15s; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="Overrides">📝 Overrides</button>
        </div>
        <div class="panel-collapsible-content" style="display:flex; flex-direction:column; flex:1; min-height:0; overflow-y:auto; gap:10px; padding:10px;">
          <div class="panel-search-container properties-search-container" style="flex:none;"><input type="search" data-role="properties-search" class="panel-search-input" placeholder="Filter properties..."></div>
          
          <!-- Tab 1: Inspector -->
          <div data-tab-group="inspector" style="display:flex; flex-direction:column; gap:10px;">
            <div class="properties-accordion-section" data-section-id="inspector">
              <header class="accordion-section-header"><span class="accordion-section-title">Selected Entity Inspector</span><div class="accordion-header-actions"><button type="button" class="accordion-popout-btn" title="Pop out to window">⤢</button><span class="accordion-toggle-icon">▼</span></div></header>
              <div class="accordion-section-body"><div class="properties-content" data-role="properties-content"><p class="panel-empty">Select an entity to inspect its properties.</p></div></div>
            </div>
          </div>

          <!-- Tab 2: Health -->
          <div data-tab-group="health" style="display:none; flex-direction:column; gap:10px;">
            <div class="properties-accordion-section" data-section-id="shared-model">
              <header class="accordion-section-header"><span class="accordion-section-title">Shared Piping Model</span><div class="accordion-header-actions"><button type="button" class="accordion-popout-btn" title="Pop out to window">⤢</button><span class="accordion-toggle-icon">▼</span></div></header>
              <div class="accordion-section-body"><div data-role="shared-model-summary"></div></div>
            </div>
            <div class="properties-accordion-section" data-section-id="topology">
              <header class="accordion-section-header"><span class="accordion-section-title">Topology Health</span><div class="accordion-header-actions"><button type="button" class="accordion-popout-btn" title="Pop out to window">⤢</button><span class="accordion-toggle-icon">▼</span></div></header>
              <div class="accordion-section-body"><div data-role="topology-summary"></div></div>
            </div>
            <div class="properties-accordion-section" data-section-id="supports">
              <header class="accordion-section-header"><span class="accordion-section-title">Support &amp; Restraint Health</span><div class="accordion-header-actions"><button type="button" class="accordion-popout-btn" title="Pop out to window">⤢</button><span class="accordion-toggle-icon">▼</span></div></header>
              <div class="accordion-section-body"><div data-role="support-restraint-summary"></div></div>
            </div>
          </div>

          <!-- Tab 3: Load Calc & FEA Solvers -->
          <div data-tab-group="loadcalc" style="display:none; flex-direction:column; gap:10px;">
            <div class="properties-accordion-section" data-section-id="loads">
              <header class="accordion-section-header"><span class="accordion-section-title">Model Loads</span><div class="accordion-header-actions"><button type="button" class="accordion-popout-btn" title="Pop out to window">⤢</button><span class="accordion-toggle-icon">▼</span></div></header>
              <div class="accordion-section-body"><div data-role="model-load-summary"></div></div>
            </div>
            <div class="properties-accordion-section" data-section-id="screening">
              <header class="accordion-section-header"><span class="accordion-section-title">Support Load Screening</span><div class="accordion-header-actions"><button type="button" class="accordion-popout-btn" title="Pop out to window">⤢</button><span class="accordion-toggle-icon">▼</span></div></header>
              <div class="accordion-section-body"><div data-role="support-load-screening-summary"></div></div>
            </div>
            <div class="properties-accordion-section" data-section-id="beam">
              <header class="accordion-section-header"><span class="accordion-section-title">Vertical Beam Solver</span><div class="accordion-header-actions"><button type="button" class="accordion-popout-btn" title="Pop out to window">⤢</button><span class="accordion-toggle-icon">▼</span></div></header>
              <div class="accordion-section-body"><div data-role="vertical-beam-summary"></div></div>
            </div>
            <div class="properties-accordion-section" data-section-id="calculation">
              <header class="accordion-section-header"><span class="accordion-section-title">Model Calculation Package</span><div class="accordion-header-actions"><button type="button" class="accordion-popout-btn" title="Pop out to window">⤢</button><span class="accordion-toggle-icon">▼</span></div></header>
              <div class="accordion-section-body"><div data-role="model-calculation-summary"></div></div>
            </div>
            <div class="properties-accordion-section" data-section-id="whole-model-loads">
              <header class="accordion-section-header"><span class="accordion-section-title">Whole-Model Support Load</span><div class="accordion-header-actions"><button type="button" class="accordion-popout-btn" title="Pop out to window">⤢</button><span class="accordion-toggle-icon">▼</span></div></header>
              <div class="accordion-section-body"><div data-role="model-support-load-summary"></div></div>
            </div>
          </div>

          <!-- Tab 4: Overrides & Sidecars -->
          <div data-tab-group="overrides" style="display:none; flex-direction:column; gap:10px;">
            <div class="properties-accordion-section" data-section-id="first-cut">
              <header class="accordion-section-header"><span class="accordion-section-title">First-Cut Load Enrichment</span><div class="accordion-header-actions"><button type="button" class="accordion-popout-btn" title="Pop out to window">⤢</button><span class="accordion-toggle-icon">▼</span></div></header>
              <div class="accordion-section-body" data-first-cut-section="true"><div data-role="first-cut-workbench-root"></div></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Sub-View 2: Load Calc Solvers & Evaluation -->
      <div data-right-view="loadcalc" style="display:none; flex-direction:column; height:100%; min-height:0;">
        <header class="panel-header" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#0f172a; border-bottom:1px solid #1e293b; flex:none;">
          <button type="button" class="panel-expand-btn" data-action="toggle-properties-collapse" aria-label="Expand Properties Panel" title="Expand Properties">◀</button>
          <div class="panel-header__title">
            <span class="panel-eyebrow" style="font-size:10px; color:#38bdf8; font-weight:700; text-transform:uppercase;">Load Calc FEA Solvers</span>
            <h2 style="font-size:14px; font-weight:700; color:#f8fafc; margin:0;">Evaluation &amp; Screening</h2>
          </div>
          <button type="button" class="panel-collapse-btn" data-action="toggle-properties-collapse" aria-label="Toggle Properties Panel" title="Collapse Properties">▶</button>
        </header>
        <div class="panel-collapsible-content" id="load-calc-properties-host" style="display:flex; flex-direction:column; flex:1; min-height:0; overflow-y:auto; padding:10px;">
          <div data-role="properties-content" style="flex:1;"></div>
        </div>
      </div>
    </aside>
    <div class="panel-popup-window" data-role="panel-popup-overlay" style="display:none;" aria-label="Floating Panel Window" role="region">
      <header class="panel-popup-header" data-role="popup-drag-handle" style="cursor:move;" title="Drag to move window">
        <span class="panel-popup-title" data-role="panel-popup-title">Panel Window</span>
        <div class="panel-popup-controls">
          <button type="button" class="panel-popup-btn panel-popup-collapse-btn" data-action="popup-collapse" title="Collapse/Expand Window">▼</button>
          <button type="button" class="panel-popup-btn panel-popup-maximize-btn" data-action="popup-maximize" title="Toggle Maximize">🗖</button>
          <button type="button" class="panel-popup-btn panel-popup-dock-btn" data-action="popup-dock" title="Dock back into panel">🗗 Dock back</button>
          <button type="button" class="panel-popup-btn panel-popup-close-btn" data-action="popup-close" title="Close window">✕</button>
        </div>
      </header>
      <div class="panel-popup-body" data-role="panel-popup-body"></div>
    </div>
  </main>`;
}
