import {
  TopologyEdit3DViewController as ProfessionalController,
} from './topology-edit-3d-productivity-controller.js';
import { SupportRestraintStore } from './support-restraint-store.js';
import { semanticHash } from '../core/shared-piping-model/index.js';
import {
  enrichCanonicalSupportsWithExactOrigins,
} from './topology-edit/topology-edit-sjson-visual-authority.js';
import { deriveSjsonCompleteVisualGeometry } from './topology-edit/topology-edit-sjson-parent-branch-diameter.js';
import {
  adaptSjsonVisualToGovernedEditDraftProjection,
} from './topology-edit/topology-edit-sjson-governed-projection-v2.js';
import {
  TopologyEditSjsonGovernedViewportBackend,
} from './topology-edit/topology-edit-sjson-governed-viewport-backend-v2.js';
import {
  SJSON_BENCHMARK_SOURCE_HASH,
  applySjsonBenchmarkCameraFit,
  deriveGovernedSjsonSupportBundle,
} from './topology-edit/topology-edit-sjson-runtime-authority-v2.js';
import { publishSjsonFidelityEvidence } from './topology-edit/topology-edit-sjson-fidelity-evidence-v2.js';

export class TopologyEdit3DViewController extends ProfessionalController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.sjsonVisualByRole = new Map();
    this.sjsonBenchmarkView = null;
    this.sjsonSupportBundle = null;
    this.sjsonSourceVisualCache = null;
    this.sjsonSourceVisualCacheDataset = null;
    this.sjsonSourceVisualCacheKey = '';
  }

  async activate() {
    await super.activate();
    this.syncSjsonDisplayControls();
  }

  createViewportBackend() {
    return new TopologyEditSjsonGovernedViewportBackend();
  }

  buildShell() {
    super.buildShell();
    const displayBody = this.hostElement?.querySelector(
      '[data-panel-kind="display"] .topology-edit-clean-shell__panel-body',
    );
    if (!displayBody) {
      throw new Error('TOPOLOGY_EDIT_SJSON_DISPLAY_CONTROL_HOST_MISSING');
    }
    displayBody.insertAdjacentHTML('beforeend', sjsonDisplayControlsMarkup());
  }

  handleHostClick(event) {
    if (event.target.closest('[data-action="apply-sjson-display-controls"]')) {
      return this.applySjsonDisplayControls();
    }
    return super.handleHostClick(event);
  }

  handleViewportSelection(pick, event) {
    const result = super.handleViewportSelection(pick, event);
    const panelKind = pick?.objectKind === 'node'
      ? 'topology-edit-professional-interaction'
      : ['component', 'edge'].includes(pick?.objectKind)
        ? 'topology-edit-professional-operation'
        : null;
    if (panelKind) {
      const panel = this.hostElement?.querySelector(`[data-panel-kind="${panelKind}"]`);
      if (panel) panel.open = true;
    }
    return result;
  }

  applySjsonDisplayControls() {
    const host = this.hostElement?.querySelector('[data-role="sjson-display-controls"]');
    if (!host || !this.viewportBackend) return null;
    try {
      const nodeRadiusMm = finiteInput(host, 'sjson-node-radius-mm');
      const nearMm = finiteInput(host, 'sjson-camera-near-mm');
      const farMm = finiteInput(host, 'sjson-camera-far-mm');
      const auto = host.querySelector('[data-role="sjson-camera-auto-clipping"]')?.checked !== false;
      this.viewportBackend.setGovernedNodeMarkerRadiusMm(nodeRadiusMm);
      const clipping = this.viewportBackend.setGovernedCameraClippingPolicy({
        mode: auto ? 'AUTO' : 'MANUAL',
        nearMm,
        farMm,
      });
      setOutput(host, `Node radius ${nodeRadiusMm} mm; ${clipping.mode.toLowerCase()} clipping ${clipping.appliedNearMm.toFixed(3)}–${clipping.appliedFarMm.toFixed(1)} mm.`);
      this.setStatus('SJSON display controls applied.');
      this.syncSjsonDisplayControls();
      return clipping;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setOutput(host, message);
      this.setStatus(`SJSON display controls rejected: ${message}`);
      return null;
    }
  }

  syncSjsonDisplayControls() {
    const host = this.hostElement?.querySelector('[data-role="sjson-display-controls"]');
    const backend = this.viewportBackend;
    if (!host || !backend) return;
    setInput(host, 'sjson-node-radius-mm', backend.governedNodeMarkerRadiusMm);
    const policy = backend.governedCameraClippingPolicy;
    setChecked(host, 'sjson-camera-auto-clipping', policy?.mode !== 'MANUAL');
    setInput(host, 'sjson-camera-near-mm', policy?.nearMm);
    setInput(host, 'sjson-camera-far-mm', policy?.farMm);
    const snapshot = backend.governedCameraClippingSnapshot?.();
    if (snapshot) {
      setOutput(host, `Node radius ${backend.governedNodeMarkerRadiusMm} mm; ${snapshot.mode.toLowerCase()} clipping ${snapshot.appliedNearMm.toFixed(3)}–${snapshot.appliedFarMm.toFixed(1)} mm.`);
    }
  }

  buildWorkspaceCanonical(dataset, graph) {
    const canonical = super.buildWorkspaceCanonical(dataset, graph);
    if (!this.isGovernedSjsonCanonical(canonical)) return canonical;
    return enrichCanonicalSupportsWithExactOrigins(
      canonical,
      dataset,
      SupportRestraintStore.getAttachmentModel(),
    );
  }

  deriveVisual(canonical, modelRole) {
    if (!this.isGovernedSjsonCanonical(canonical)) {
      return super.deriveVisual(canonical, modelRole);
    }
    const role = String(modelRole || 'DRAFT').toUpperCase();
    const cacheKey = `${String(canonical?.sourceHash || '')}:${String(canonical?.canonicalTopologyHash || '')}`;
    if (
      role === 'SOURCE'
      && this.sjsonSourceVisualCache
      && this.sjsonSourceVisualCacheDataset === this.workspaceDataset
      && this.sjsonSourceVisualCacheKey === cacheKey
    ) {
      this.sjsonVisualByRole.set(role, this.sjsonSourceVisualCache);
      if (this.hostElement) this.hostElement.dataset.topologyEditSjsonSourceVisualCache = 'HIT';
      return this.sjsonSourceVisualCache;
    }
    const result = adaptSjsonVisualToGovernedEditDraftProjection({
      visualResult: deriveSjsonCompleteVisualGeometry({
        canonicalTopology: canonical,
        dataset: this.workspaceDataset,
        modelRole,
      }),
      dataset: this.workspaceDataset,
    });
    this.sjsonVisualByRole.set(role, result);
    if (role === 'SOURCE') {
      this.sjsonSourceVisualCache = result;
      this.sjsonSourceVisualCacheDataset = this.workspaceDataset;
      this.sjsonSourceVisualCacheKey = cacheKey;
      if (this.hostElement) this.hostElement.dataset.topologyEditSjsonSourceVisualCache = 'MISS';
    }
    if (role === 'DRAFT') {
      this.sjsonSupportBundle = deriveGovernedSjsonSupportBundle({
        canonical,
        dataset: this.workspaceDataset,
        draftVisual: result,
        backend: this.viewportBackend,
      });
      this.viewportBackend?.setGovernedSupportProjection(
        this.sjsonSupportBundle.supportProjection,
      );
    }
    return result;
  }

  refreshView(canonical) {
    this.sjsonSupportBundle = null;
    this.viewportBackend?.setGovernedSupportProjection(null);
    if (!this.isGovernedSjsonCanonical(canonical)) {
      this.sjsonVisualByRole.clear();
      this.sjsonBenchmarkView = null;
      return super.refreshView(canonical);
    }
    super.refreshView(canonical);

    const bundle = this.sjsonSupportBundle;
    const draftVisual = this.sjsonVisualByRole.get('DRAFT');
    if (!bundle || !draftVisual) {
      throw new Error(
        'TOPOLOGY_EDIT_SJSON_SINGLE_RENDER_PACKET_MISSING: Draft visual and support authority are required.',
      );
    }
    this.sjsonBenchmarkView = applySjsonBenchmarkCameraFit(this.viewportBackend);
    this.visualDiagnostics = [
      ...(draftVisual.model?.diagnostics || []),
      ...bundle.overlays.flatMap((row) => row.diagnostics || []),
      ...bundle.overlays.flatMap((row) => (
        (row.restraints || []).flatMap((restraint) => restraint.diagnostics || [])
      )),
    ];
    this.visualModelHash = semanticHash({
      draftVisualGeometryHash: draftVisual.model?.visualGeometryHash || '',
      editDraftMetrics: draftVisual.editDraftMetrics || null,
      supportProjection: bundle.supportProjection,
      supportAuthorityHash: bundle.supportAuthority.authorityHash,
      supportMetrics: bundle.supportAuthority.metrics,
      supportDiameterIndexHash: bundle.supportTopology.supportVisualDiameterIndexHash || '',
      supportDiameterAdaptations: bundle.supportTopology.supportVisualDiameterAdaptations || [],
      benchmarkView: this.sjsonBenchmarkView,
      singleRenderPacket: true,
    });
    this.updatePresentationBasis(canonical);
    this.presentationRuntime?.apply(this.presentationState);
    this.renderCheckerPanel();
    publishSjsonFidelityEvidence({
      host: this.canvasMount,
      canonical,
      supportProjection: bundle.supportProjection,
      visualResult: draftVisual,
      supportTopology: bundle.supportTopology,
      supportAuthority: bundle.supportAuthority,
      benchmarkView: this.sjsonBenchmarkView,
      visualModelHash: this.visualModelHash,
      journalHash: this.session?.journal?.journalHash || '',
    });
    this.syncSjsonDisplayControls();
  }

  isGovernedSjsonCanonical(canonical) {
    return canonical?.sourceHash === SJSON_BENCHMARK_SOURCE_HASH;
  }

  deactivate() {
    this.viewportBackend?.setGovernedSupportProjection(null);
    this.sjsonVisualByRole.clear();
    this.sjsonBenchmarkView = null;
    this.sjsonSupportBundle = null;
    this.sjsonSourceVisualCache = null;
    this.sjsonSourceVisualCacheDataset = null;
    this.sjsonSourceVisualCacheKey = '';
    super.deactivate();
  }
}

function sjsonDisplayControlsMarkup() {
  return `
    <fieldset data-role="sjson-display-controls" aria-label="SJSON node and camera controls">
      <legend>SJSON viewport</legend>
      <label>Node radius (mm)
        <input type="range" min="1" max="12" step="0.5" value="4.2" data-role="sjson-node-radius-mm">
      </label>
      <label><input type="checkbox" checked data-role="sjson-camera-auto-clipping"> Auto camera clipping</label>
      <label>Near (mm) <input type="number" min="0.001" step="any" value="0.1" data-role="sjson-camera-near-mm"></label>
      <label>Far (mm) <input type="number" min="1" step="any" value="1000000" data-role="sjson-camera-far-mm"></label>
      <button type="button" data-action="apply-sjson-display-controls">Apply viewport settings</button>
      <output data-role="sjson-display-control-status" aria-live="polite"></output>
    </fieldset>`;
}

function finiteInput(host, role) {
  const value = Number(host.querySelector(`[data-role="${role}"]`)?.value);
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${role} requires a positive finite number.`);
  }
  return value;
}

function setInput(host, role, value) {
  const input = host.querySelector(`[data-role="${role}"]`);
  if (input && Number.isFinite(Number(value))) input.value = String(value);
}

function setChecked(host, role, checked) {
  const input = host.querySelector(`[data-role="${role}"]`);
  if (input) input.checked = Boolean(checked);
}

function setOutput(host, text) {
  const output = host.querySelector('[data-role="sjson-display-control-status"]');
  if (output) output.textContent = text;
}
