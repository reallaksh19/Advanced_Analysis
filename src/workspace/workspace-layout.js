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
    <header class="application-navigation-shell">
      <div class="application-top-bar">
        <div class="brand-group">
          <div class="brand-logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div class="brand-text">
            <span class="brand-title">ADVANCED ANALYSIS</span>
            <span class="brand-subtitle">Workspace, Load Calculation &amp; Finite Element Analysis</span>
          </div>
        </div>
        <div class="top-bar-meta">
          <div class="meta-pill"><span class="pill-label">Dataset:</span> <strong data-role="topbar-dataset">None Loaded</strong></div>
          <div class="meta-pill"><span class="pill-label">System:</span> <strong>SI (mm, N, MPa)</strong></div>
          <div class="meta-pill status-ready"><span class="status-dot"></span> <strong>Engine Ready</strong></div>
        </div>
      </div>
      <div class="navigation-bar-container">
        <div class="application-navigation" data-role="application-navigation" role="navigation" aria-label="Application views"></div>
        <output class="application-navigation__status" data-role="application-navigation-status" aria-live="polite"></output>
      </div>
    </header>
    <div class="application-view application-view--workspace" data-application-view="WORKSPACE">
      ${qualificationBanner('WORKSPACE')}
      ${workspaceView()}
    </div>
    <div class="application-view application-view--load-calc" data-application-view="LOAD_CALC" hidden aria-hidden="true">
      ${qualificationBanner('LOAD_CALC')}
      <div data-role="load-calc-consumer-root"></div>
    </div>
    <div class="application-view application-view--lafea" data-application-view="LAFEA" hidden aria-hidden="true">
      ${qualificationBanner('LAFEA')}
      <div data-role="lafea-consumer-root"></div>
    </div>
    <div class="application-view application-view--lfea" data-application-view="LFEA" hidden aria-hidden="true">
      ${qualificationBanner('LFEA')}
      <div data-role="lfea-consumer-root"></div>
    </div>
  </div>`;
}

function qualificationBanner(tabId) {
  return `<section class="tab-benchmark-status" data-role="tab-benchmark-status" data-benchmark-tab="${tabId}" data-status="Not Run" aria-label="${tabId} benchmark qualification">
    <span class="tab-benchmark-status__label">Benchmark qualification</span>
    <strong data-role="tab-benchmark-value">Not Run</strong>
    <span data-role="tab-benchmark-summary">No complete benchmark suite has been loaded.</span>
    <a data-role="tab-benchmark-evidence" href="qualification/advanced-tab-benchmarks.md" target="_blank" rel="noopener">Evidence</a>
  </section>`;
}

function workspaceView() {
  return `<main class="workspace-shell" aria-label="Analysis Workspace">
    <aside class="workspace-panel tree-panel" data-panel="tree" aria-label="Dataset tree and layers">
      <header class="panel-header"><span class="panel-eyebrow">Analysis Workspace</span><h1>Dataset Tree</h1></header>
      <section class="dataset-toolbar" aria-label="Dataset actions">
        <div class="dataset-toolbar__actions"><button type="button" data-action="load-mock-dataset" data-mock-data="true">[SIMULATED] Load Mock Data</button><button type="button" data-action="import-dataset">Import JSON</button><button type="button" data-action="clear-dataset" disabled>Clear</button></div>
        <input data-role="dataset-file" type="file" accept=".json,application/json" hidden>
        <output data-role="tree-status">No dataset loaded</output>
        <p class="dataset-error" data-role="tree-error" hidden></p>
      </section>
      <section class="layer-summary" aria-label="Dataset summary"><span data-role="summary-pipes">Pipes 0</span><span data-role="summary-supports">Supports 0</span></section>
      <div class="tree-list" data-role="tree-list"><p class="panel-empty">Import a supported workspace JSON package.</p></div>
    </aside>
    <section class="workspace-panel viewport-panel" data-panel="viewport" aria-label="3D viewport">
      <header class="viewport-toolbar">
        <div><span class="panel-eyebrow">Read-only model review</span><h2>Model Viewport</h2></div>
        <div class="viewport-toolbar__status"><output data-role="viewport-status">No dataset loaded</output><div class="viewport-toolbar__actions" aria-label="Viewport navigation"><button type="button" data-viewport-action="fit">Fit View</button><button type="button" data-viewport-action="reset">Reset View</button></div></div>
      </header>
      <div class="viewport-stage" data-webgl-host data-role="viewport-render-host" aria-label="Read-only model viewport"></div>
      <footer class="viewport-footer" data-role="viewport-selection">Selection: none</footer>
    </section>
    <aside class="workspace-panel properties-panel" data-panel="properties" aria-label="Properties and analysis actions">
      <header class="panel-header"><span class="panel-eyebrow">Model and contextual workflow</span><h2>Properties &amp; Actions</h2></header>
      <div data-role="shared-model-summary"></div><div data-role="topology-summary"></div><div data-role="support-restraint-summary"></div><div data-role="model-load-summary"></div><div data-role="support-load-screening-summary"></div><div data-role="vertical-beam-summary"></div><div data-role="model-calculation-summary"></div><div data-role="model-support-load-summary"></div>
      <div class="properties-content" data-role="properties-content"><p class="panel-empty">Select an entity to inspect its properties.</p></div>
    </aside>
  </main>`;
}
