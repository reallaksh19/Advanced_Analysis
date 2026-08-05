import {
  TopologyEdit3DViewController as ProfessionalController,
} from './topology-edit-3d-professional-controller.js';
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
  }

  createViewportBackend() {
    return new TopologyEditSjsonGovernedViewportBackend();
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
    const result = adaptSjsonVisualToGovernedEditDraftProjection({
      visualResult: deriveSjsonCompleteVisualGeometry({
        canonicalTopology: canonical,
        dataset: this.workspaceDataset,
        modelRole,
      }),
      dataset: this.workspaceDataset,
    });
    const role = String(modelRole || 'DRAFT').toUpperCase();
    this.sjsonVisualByRole.set(role, result);
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
  }

  isGovernedSjsonCanonical(canonical) {
    return canonical?.sourceHash === SJSON_BENCHMARK_SOURCE_HASH;
  }

  deactivate() {
    this.viewportBackend?.setGovernedSupportProjection(null);
    this.sjsonVisualByRole.clear();
    this.sjsonBenchmarkView = null;
    this.sjsonSupportBundle = null;
    super.deactivate();
  }
}
