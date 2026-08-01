import { advancedShellStyles } from './workspace-shell-styles.js';
import { lafeaWorkbenchStyles } from './lafea-workbench.js';
import { lfeaWorkbenchStyles } from './lfea-workbench.js';

/** Mounts stable roots for the shared Workspace/Load Calc viewport. */
export function renderWorkspaceLayout(rootElement) {
  rootElement.replaceChildren();
  const shell = rootElement.ownerDocument.createElement('div');
  shell.innerHTML = applicationMarkup();
  const style = rootElement.ownerDocument.createElement('style');
  style.textContent = `${advancedShellStyles()}${lafeaWorkbenchStyles()}${lfeaWorkbenchStyles()}${empiricalStyles()}`;
  rootElement.append(style, shell.firstElementChild);
}

function applicationMarkup() {
  return `<div class="application-shell" data-role="application-shell">
    <header class="application-navigation-shell">
      <div class="brand-group"><strong>ADVANCED ANALYSIS</strong><span>1885S empirical benchmark</span></div>
      <nav class="application-navigation" data-role="application-navigation" aria-label="Application views"></nav>
      <output data-role="application-navigation-status" aria-live="polite"></output>
      <div class="top-bar-meta">
        <span data-role="tab-benchmark-status" data-benchmark-tab="WORKSPACE" data-status="Unknown"><strong data-role="tab-benchmark-value">Not run</strong><a data-role="tab-benchmark-evidence" hidden>Evidence</a></span>
        <span>Dataset: <strong data-role="topbar-dataset">None loaded</strong></span>
      </div>
    </header>
    <div data-application-view="WORKSPACE" class="application-view application-view--workspace">${workspaceMarkup()}</div>
    <div data-application-view="LOAD_CALC" hidden aria-hidden="true"></div>
    <div class="application-view application-view--lafea" data-application-view="LAFEA" hidden aria-hidden="true"><div data-role="lafea-consumer-root"></div></div>
    <div class="application-view application-view--lfea" data-application-view="LFEA" hidden aria-hidden="true"><div data-role="lfea-consumer-root"></div></div>
  </div>`;
}

function workspaceMarkup() {
  return `<main class="workspace-shell" aria-label="Analysis Workspace">
    <aside class="workspace-panel tree-panel" data-panel="tree">
      <header class="panel-header"><div><span class="panel-eyebrow">Workspace</span><h1>Dataset Tree</h1></div><button type="button" data-action="toggle-tree-collapse">Collapse</button></header>
      <section class="dataset-toolbar">
        <div class="dataset-toolbar__actions"><button type="button" data-action="import-dataset">Import SJSON/JSON</button><button type="button" data-action="clear-dataset" disabled>Clear</button></div>
        <input data-role="dataset-file" type="file" accept=".json,application/json" hidden>
        <input data-role="tree-search" type="search" placeholder="Search source IDs, tags, branches">
        <output data-role="tree-status">No dataset loaded</output><p data-role="tree-error" class="dataset-error" hidden></p>
      </section>
      <section class="layer-summary"><span data-role="summary-pipes">Pipes 0</span><span data-role="summary-supports">Supports 0</span></section>
      <div data-role="tree-list" class="tree-list"></div>
    </aside>
    <div class="panel-resizer panel-resizer--left" data-action="resize-left"></div>
    <section class="workspace-panel viewport-panel" data-panel="viewport">
      ${viewportToolbar()}
      <div data-role="viewport-edit-bar" class="viewport-edit-bar"></div>
      <div class="shared-viewport-stack">
        <div data-role="viewport-stage" class="viewport-stage">
          <div data-role="sequential-sketcher-root" class="viewport-svg-host" hidden></div>
          <div data-role="viewport-render-host" class="viewport-webgl-host"></div>
        </div>
        <div data-role="load-calc-consumer-root" class="load-calc-dock" hidden></div>
        <div data-role="topology-edit-render-host" class="viewport-webgl-host topology-edit-render-host" hidden></div>
      </div>
      <div data-role="viewport-table-dock" class="viewport-table-dock" hidden></div>
      <footer class="viewport-footer"><output data-role="viewport-status">No dataset loaded</output><span data-role="viewport-selection">Selection: none</span></footer>
    </section>
    <div class="panel-resizer panel-resizer--right" data-action="resize-right"></div>
    <aside class="workspace-panel properties-panel" data-panel="properties">
      <header class="panel-header"><div><span class="panel-eyebrow">Canonical selection</span><h2>Properties &amp; Loads</h2></div><button type="button" data-action="toggle-properties-collapse">Collapse</button></header>
      <div class="panel-collapsible-content">
      <input data-role="properties-search" type="search" placeholder="Filter properties">
      <div data-role="properties-content"><p class="panel-empty">Select an entity in SVG, WebGL, tree, or the load table.</p></div>
      <details><summary>Model health</summary><div data-role="shared-model-summary"></div><div data-role="topology-summary"></div><div data-role="support-restraint-summary"></div></details>
      <details><summary>Existing analysis contracts</summary><div data-role="model-load-summary"></div><div data-role="support-load-screening-summary"></div><div data-role="vertical-beam-summary"></div><div data-role="model-calculation-summary"></div><div data-role="model-support-load-summary"></div></details>
      <section class="properties-accordion-section" data-section-id="first-cut" hidden>
        <header class="accordion-section-header"><span>First-Cut Load Enrichment</span><button type="button" class="accordion-popout-btn">Pop out</button></header>
        <div class="accordion-section-body"><div data-role="first-cut-workbench-root"></div></div>
      </section>
      <div data-role="settings-consumer-root" hidden></div>
      </div>
    </aside>
  </main>`;
}

function viewportToolbar() {
  return `<header class="viewport-toolbar">
    <div role="tablist" aria-label="Viewport mode"><button type="button" data-action="switch-viewport-tab" data-tab="webgl" aria-selected="true">3D WebGL</button><button type="button" data-action="switch-viewport-tab" data-tab="svg" aria-selected="false">2D SVG</button><button type="button" data-action="switch-viewport-tab" data-tab="split" aria-selected="false">Split</button><button type="button" data-action="switch-viewport-tab" data-tab="topology-edit" aria-selected="false">3D Edit</button></div>
    <div aria-label="Navigation">
      <button type="button" data-viewport-action="mode-select">Select</button><button type="button" data-viewport-action="mode-orbit">Orbit</button><button type="button" data-viewport-action="mode-pan">Pan</button>
      <button type="button" data-viewport-action="fit">Fit all</button><button type="button" data-viewport-action="fit-selection">Fit selection</button><button type="button" data-viewport-action="pivot-selection">Pivot selection</button><button type="button" data-viewport-action="home">Home</button><button type="button" data-viewport-action="previous-view">Previous</button>
      <span class="viewport-view-cube" aria-label="View cube"><button type="button" data-viewport-action="view-iso">Iso</button><button type="button" data-viewport-action="view-top">Top</button><button type="button" data-viewport-action="view-front">Front</button><button type="button" data-viewport-action="view-right">Right</button></span><button type="button" data-viewport-action="toggle-projection">Perspective / Ortho</button>
    </div>
    <button type="button" data-action="toggle-viewport-table">Data table</button>
  </header>`;
}

function empiricalStyles() {
  return `.application-navigation-shell{display:flex;align-items:center;gap:16px;min-height:42px;padding:0 12px;background:#091322;border-bottom:1px solid #1e293b}.brand-group{display:flex;gap:8px;align-items:baseline;color:#f8fafc}.brand-group span,.top-bar-meta{color:#94a3b8;font-size:11px}.application-navigation{display:flex;gap:4px;margin-left:auto}.top-bar-meta{display:flex;gap:12px}.workspace-shell{display:grid;grid-template-columns:minmax(48px,300px) 4px minmax(360px,1fr) 4px minmax(48px,360px);height:100%;min-height:0}.viewport-panel,.properties-panel,.tree-panel{display:flex;flex-direction:column;min-height:0}.workspace-panel--collapsed{overflow:hidden}.workspace-panel--collapsed>*:not(.panel-header){display:none}.workspace-panel--collapsed .panel-header>div{display:none}.tree-list,.properties-panel>[data-role="properties-content"]{overflow:auto;flex:1}.shared-viewport-stack{display:flex;flex-direction:column;flex:1;min-height:0}.viewport-stage{position:relative;display:flex;flex:1;min-height:180px}.viewport-webgl-host,.viewport-svg-host{width:100%;height:100%;min-height:0}.load-calc-dock{flex:1;min-height:220px;overflow:hidden;border-top:1px solid #334155}.viewport-footer{display:flex;justify-content:space-between;padding:4px 8px;background:#091322}.viewport-edit-bar,.viewport-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 8px;background:#0f172a;border-bottom:1px solid #334155}.viewport-toolbar>div{display:flex;gap:4px;flex-wrap:wrap}.viewport-view-cube{display:inline-grid;grid-template-columns:repeat(2,auto);gap:2px;padding:2px;border:1px solid #475569;border-radius:4px}.empirical-load-calc{height:100%;display:flex;flex-direction:column;background:#0b1120;color:#e2e8f0}.empirical-load-calc__header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:8px 12px;border-bottom:1px solid #334155}.empirical-load-calc__header h1{font-size:15px;margin:0}.empirical-load-calc__facts,.empirical-load-calc__tabs,.empirical-load-calc__actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.empirical-load-calc__facts{font-size:11px;color:#94a3b8}.empirical-load-calc__actions{margin-left:auto}.empirical-load-calc__pane{flex:1;overflow:auto;padding:12px}.empirical-load-calc table{width:100%;border-collapse:collapse}.empirical-load-calc th,.empirical-load-calc td{border:1px solid #334155;padding:5px;text-align:left}.empirical-load-calc pre{white-space:pre-wrap}.load-contract-summary dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 12px}.load-blockers{color:#fbbf24}.viewport-table-dock{max-height:220px;overflow:auto}.topology-edit-render-host{flex:1 1 100%;display:flex;flex-direction:column;min-height:0}.topology-edit-render-host[hidden]{display:none}.load-calc-dock--compact{flex:0 0 auto!important;min-height:0!important}.load-calc-dock--compact .empirical-load-calc__pane{display:none}`;
}
