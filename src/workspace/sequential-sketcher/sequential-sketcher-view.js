/**
 * UI Renderer for Sequential Sketcher 2D SVG canvas & Engineering Property Inspector
 * Features:
 * - Projections: ISO, XY, XZ, YZ
 * - Interactive Mouse Pan & Wheel Zoom
 * - Responsive Vector Aspect Ratio: preserveAspectRatio="xMidYMid meet"
 * - Engineering Tools: Export SVG, Toggle Grid, Selection Highlights
 * - Property Inspector Panel: Displays entity identity, 3D geometry, support details, materials, and specs.
 */
import { project3DPoint } from '../lfea-svg/lfea-svg-scene-builder.js';
import { SequentialEditPanel } from './sequential-edit-panel.js';
import { SequentialTableStore } from './sequential-table-store.js';
import { SequentialTopologyTableView } from './sequential-topology-table-view.js';
import { SvgSymbolFactory } from './svg-symbol-factory.js';
import { PipingSupportEngine } from './support-engine.js';
import { buildPropertyInspector } from './property-inspector-view.js';
import { buildSvgDefs, buildEngineeringGrid } from './sketcher-grid-view.js';
import { buildHeaderToolbar } from './sketcher-toolbar-view.js';
import { renderEntities } from './sketcher-entities-view.js';
import { computeProjectedPoints, attachCanvasNavigation } from './sketcher-canvas-controller.js';
import { EventBus } from '../event-bus.js';
import { TOPOLOGY_EVENTS } from '../topology-events.js';

export class SequentialSketcherView {
  constructor(rootElement, gateway = null) {
    this.rootElement = rootElement;
    this.gateway = gateway;
    this.editPanel = gateway ? new SequentialEditPanel(null, gateway) : null;
    this.projection = 'ISO';
    this.zoomLevel = 1.0;
    this.panOffset = { x: 0, y: 0 };
    this.showGrid = true;
    this.currentDataset = null;
    this.selectedEntity = null;
    this.onProjectionChange = null;
    this.onSelectEntity = null;
    this.isPanning = false;
    this.dragStart = { x: 0, y: 0 };
    this.tableStore = gateway ? new SequentialTableStore(gateway.workspaceState, gateway) : null;
    this.loadScale = 1.0;
    this.selectedBranch = 'All Branches';
    this.symbolFactory = new SvgSymbolFactory();
    this.supportEngine = new PipingSupportEngine();
    this.tableView = this.tableStore ? new SequentialTopologyTableView(null, this.tableStore) : null;
  }

  render(dataset, options = {}) {
    if (options.projection) this.projection = options.projection;
    if (dataset) this.currentDataset = dataset;
    if (!this.rootElement) return;

    this.rootElement.replaceChildren();
    const container = this.rootElement.ownerDocument.createElement('div');
    container.className = 'sequential-sketcher-panel';
    container.style.position = 'relative';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.gap = '10px';
    container.style.background = '#091322';
    container.style.padding = '12px';
    container.style.borderRadius = '8px';
    container.style.border = '1px solid #1e293b';
    container.style.height = '100%';
    container.style.overflowY = 'auto';
    container.style.boxSizing = 'border-box';

    // Header Toolbar
    const isEmbedded = Boolean(this.rootElement.closest('.viewport-panel') || this.rootElement.closest('.application-shell'));
    const header = buildHeaderToolbar(this.rootElement.ownerDocument, {
      titleText: `Sequential Engineering SVG — ${this.currentDataset?.sourceName || this.currentDataset?.datasetId || 'No Dataset Loaded'}`,
      hideTitle: isEmbedded,
      currentProjection: this.projection,
      showGrid: this.showGrid,
      onProjectionClick: (proj) => {
        this.projection = proj;
        this.resetView();
        if (this.onProjectionChange) this.onProjectionChange(proj);
        this.render(this.currentDataset);
      },
      onFitView: () => { this.resetView(); this.render(this.currentDataset); },
      onFitSelection: () => this.fitSelection(),
      onZoomIn: () => { this.zoomLevel *= 1.25; this.render(this.currentDataset); },
      onZoomOut: () => { this.zoomLevel /= 1.25; this.render(this.currentDataset); },
      onToggleGrid: () => { this.showGrid = !this.showGrid; this.render(this.currentDataset); },
      onExportSvg: () => this.exportSvg(),
      onIncreaseLoadFont: () => { this.loadScale = Math.min(2.5, this.loadScale + 0.25); this.render(this.currentDataset); },
      onDecreaseLoadFont: () => { this.loadScale = Math.max(0.75, this.loadScale - 0.25); this.render(this.currentDataset); },
      onBranchSelect: (b) => { this.selectedBranch = b; this.render(this.currentDataset); },
      selectedBranch: this.selectedBranch,
      onCheckTopology: () => EventBus.publish(TOPOLOGY_EVENTS.REBUILD_EXACT_REQUESTED),
      onRebuildExact: () => EventBus.publish(TOPOLOGY_EVENTS.REBUILD_EXACT_REQUESTED),
      onRebuildTolerance: () => EventBus.publish(TOPOLOGY_EVENTS.REBUILD_TOLERANCE_REQUESTED, { tolerance: 5 }),
      onExportTopology: () => EventBus.publish(TOPOLOGY_EVENTS.EXPORT_REQUESTED)
    });
    container.append(header);

    // Render Edit Panel Toolbar (Only when not embedded in main viewport)
    if (this.gateway && !isEmbedded) {
      const editToolbarHost = this.rootElement.ownerDocument.createElement('div');
      this.editPanel.rootElement = editToolbarHost;
      this.editPanel.onCommandExecuted = () => this.render(this.currentDataset);
      this.editPanel.render(this.selectedEntity?.entityId || null);
      container.append(editToolbarHost);
    }

    // Main Content Layout: Full-Width SVG Host (Property Inspector is routed to Right Panel)
    const bodyLayout = this.rootElement.ownerDocument.createElement('div');
    bodyLayout.style.display = 'grid';
    bodyLayout.style.gridTemplateColumns = '1fr';
    bodyLayout.style.gap = '12px';
    bodyLayout.style.flex = '1';
    bodyLayout.style.minHeight = '0';

    const svgHost = this.rootElement.ownerDocument.createElement('div');
    svgHost.className = 'sequential-sketcher-svg-host';
    svgHost.style.minHeight = '450px';
    svgHost.style.background = '#030712';
    svgHost.style.borderRadius = '6px';
    svgHost.style.border = '1px solid #1e293b';
    svgHost.style.position = 'relative';
    svgHost.style.overflow = 'hidden';

    if (!this.currentDataset || !Array.isArray(this.currentDataset.entities) || this.currentDataset.entities.length === 0) {
      const emptyMsg = this.rootElement.ownerDocument.createElement('p');
      emptyMsg.style.color = '#94a3b8';
      emptyMsg.style.padding = '20px';
      emptyMsg.style.textAlign = 'center';
      emptyMsg.textContent = 'Import a 3D piping dataset (Sjson.json / .inputxml) in the 3D Piping Workspace (W) to render sequential engineering SVG geometry.';
      svgHost.append(emptyMsg);
    } else {
      svgHost.append(this.buildSvg(this.currentDataset));
    }

    bodyLayout.append(svgHost);
    container.append(bodyLayout);

    // Reactive Topology Table Panel (Zustand-like Bi-directional Synchronized Data Grid)
    if (this.tableView) {
      const tableHost = this.rootElement.ownerDocument.createElement('div');
      tableHost.className = 'sequential-sketcher-table-host';
      this.tableView.rootElement = tableHost;
      this.tableView.mount();
      container.append(tableHost);
    }

    this.rootElement.append(container);
  }



  resetView() {
    this.zoomLevel = 1.0;
    this.panOffset = { x: 0, y: 0 };
  }

  fitSelection(targetEntityId = null) {
    const entityToFit = targetEntityId 
      ? this.currentDataset?.entities?.find(e => e.entityId === targetEntityId)
      : this.selectedEntity;
    
    if (!entityToFit || !this.currentDataset) return;
    this.selectedEntity = entityToFit;

    const geom = entityToFit.properties?.geometry || {};
    const attrs = entityToFit.properties?.attributes || {};
    const sourceAttrs = entityToFit.properties?.sourceAttributes || {};
    const getPt = (keys) => keys.reduce((pt, key) => pt || geom[key] || attrs[key] || sourceAttrs[key], null);
    
    const start3D = getPt(['start', 'position', 'center', 'APOS', 'HPOS', 'POS']);
    const end3D = getPt(['end', 'center', 'LPOS', 'TPOS', 'BPOS']);

    const p1 = start3D ? project3DPoint(start3D, this.projection) : null;
    const p2 = end3D ? project3DPoint(end3D, this.projection) : null;

    if (!p1 && !p2) return;

    const allProjected = [];
    this.currentDataset.entities.forEach((entity) => {
      const g = entity.properties?.geometry || {};
      const a = entity.properties?.attributes || {};
      const sa = entity.properties?.sourceAttributes || {};
      const gPt = (keys) => keys.reduce((pt, key) => pt || g[key] || a[key] || sa[key], null);
      const s3 = gPt(['start', 'position', 'center', 'APOS', 'HPOS', 'POS']);
      const e3 = gPt(['end', 'center', 'LPOS', 'TPOS', 'BPOS']);
      const proj1 = s3 ? project3DPoint(s3, this.projection) : null;
      const proj2 = e3 ? project3DPoint(e3, this.projection) : null;
      if (proj1) allProjected.push(proj1);
      if (proj2) allProjected.push(proj2);
    });

    if (allProjected.length === 0) return;

    const datasetMinX = Math.min(...allProjected.map((p) => p.px));
    const datasetMaxX = Math.max(...allProjected.map((p) => p.px));
    const datasetMinY = Math.min(...allProjected.map((p) => p.py));
    const datasetMaxY = Math.max(...allProjected.map((p) => p.py));
    const datasetCenterX = (datasetMinX + datasetMaxX) / 2;
    const datasetCenterY = (datasetMinY + datasetMaxY) / 2;

    const entityPts = [p1, p2].filter(Boolean);
    const entityMinX = Math.min(...entityPts.map((p) => p.px));
    const entityMaxX = Math.max(...entityPts.map((p) => p.px));
    const entityMinY = Math.min(...entityPts.map((p) => p.py));
    const entityMaxY = Math.max(...entityPts.map((p) => p.py));
    const targetCenterX = (entityMinX + entityMaxX) / 2;
    const targetCenterY = (entityMinY + entityMaxY) / 2;

    this.panOffset.x = datasetCenterX - targetCenterX;
    this.panOffset.y = datasetCenterY - targetCenterY;
    this.zoomLevel = 2.2;
    this.render(this.currentDataset);
  }

  exportSvg() {
    if (!this.currentDataset) return;
    const svgElement = this.rootElement.querySelector('svg');
    if (!svgElement) return;
    const serializer = new (globalThis.XMLSerializer || String)();
    const svgString = serializer.serializeToString ? serializer.serializeToString(svgElement) : svgElement.outerHTML;
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = this.rootElement.ownerDocument.createElement('a');
    link.href = url;
    link.download = `sequential-sketcher-${this.currentDataset.datasetId || 'drawing'}-${this.projection}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  }

  buildSvg(dataset) {
    const doc = this.rootElement.ownerDocument;
    const SVG_NS = 'http://www.w3.org/2000/svg';

    let activeDataset = dataset;
    if (this.selectedBranch !== 'All Branches' && dataset?.entities) {
      const filtered = dataset.entities.filter(e => String(e.properties?.branchId || e.properties?.lineId || e.name || '').includes(this.selectedBranch));
      if (filtered.length > 0) activeDataset = { ...dataset, entities: filtered };
    }

    const projData = computeProjectedPoints(activeDataset, this.projection, this.zoomLevel, this.panOffset);
    const { entityProjected, minX, maxX, minY, maxY, extent, margin, size, viewBox } = projData;

    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('style', 'display:block; width:100%; height:100%; min-height:450px; background:#020617; cursor:grab;');

    attachCanvasNavigation(svg, size, this);

    svg.append(buildSvgDefs(doc));
    if (this.showGrid) {
      svg.append(buildEngineeringGrid(doc, minX, maxX, minY, maxY, margin, extent, size));
    }

    const baseStroke = size / 200;
    const bendRadius = size * 0.005;
    const teeSize = size * 0.009;
    const supportSize = size * 0.011;
    const valveRadius = size * 0.005;

    renderEntities(doc, svg, entityProjected, {
      symbolFactory: this.symbolFactory,
      supportEngine: this.supportEngine,
      selectedEntityId: this.selectedEntity?.entityId || null,
      baseStroke,
      bendRadius,
      teeSize,
      supportSize,
      valveRadius,
      loadScale: this.loadScale,
      onEntityClick: (entity) => {
        if (globalThis.getSelection) {
          globalThis.getSelection().removeAllRanges();
        }
        this.selectedEntity = entity;
        if (this.onSelectEntity) this.onSelectEntity(entity.entityId, entity);
      },
    });

    return svg;
  }

  buildPropertyInspector(entity) {
    return buildPropertyInspector(this.rootElement.ownerDocument, entity, this.supportEngine, () => {
      this.selectedEntity = null;
      this.render(this.currentDataset);
    });
  }
}
