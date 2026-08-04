/** Read-only canonical search and exact-focus composition for the Topology Edit 3D view. */
import './topology-edit-tool-fixes.css';
import { EVENT_TOPICS } from './event-topics.js';
import { TopologyEdit3DViewController as LifecycleController } from './topology-edit-3d-view-controller.js';
import {
  topologyEditSelectionDescription,
  updateTopologyEditSelection,
} from './topology-edit/topology-edit-command-ui.js';
import {
  isTopologyEditCanonicalIdVisible,
} from './viewport-presentation/topology-edit-visibility-model.js';
import {
  topologyEditPresentationActions,
} from './viewport-presentation/topology-edit-presentation-contract.js';
import {
  buildTopologyEditSearchIndex,
} from './viewport-productivity/topology-edit-search-index.js';
import { TopologyEditSearchPanel } from './viewport-productivity/topology-edit-search-panel.js';
import {
  focusTopologyEditCanonicalIds,
} from './viewport-productivity/topology-edit-scene-focus.js';

const PRESENTATION_ACTIONS = topologyEditPresentationActions();

export class TopologyEdit3DViewController extends LifecycleController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.searchIndex = null;
    this.searchPanel = new TopologyEditSearchPanel({
      onActivate: (result, options) => this.activateSearchResult(result, options),
      isCanonicalIdVisible: (canonicalId) => this.isSearchResultVisible(canonicalId),
    });
  }

  buildShell() {
    super.buildShell();
    const mount = globalThis.document?.createElement('section');
    if (!mount || !this.checkerElement) {
      throw new Error('TopologyEditSearchController: canonical search host is unavailable.');
    }
    mount.dataset.role = 'topology-edit-canonical-search';
    mount.className = 'topology-edit-canonical-search';
    mount.setAttribute('aria-label', 'Canonical topology search');
    this.checkerElement.before(mount);
    this.searchPanel.mount(mount);
  }

  deactivate() {
    this.searchPanel.destroy();
    this.searchIndex = null;
    super.deactivate();
  }

  refreshView(canonical) {
    super.refreshView(canonical);
    this.searchIndex = buildTopologyEditSearchIndex({
      canonicalTopology: canonical,
      diagnostics: this.visualDiagnostics,
    });
    this.searchPanel.updateIndex(this.searchIndex);
    this.updateReviewEvidence(canonical);
  }

  previewAutofix(suggestionHash) {
    super.previewAutofix(suggestionHash);
    this.updateReviewEvidence(this.session?.currentTopology());
  }

  acceptAutofix() {
    super.acceptAutofix();
    this.updateReviewEvidence(this.session?.currentTopology());
  }

  cancelAutofix(silent = false) {
    super.cancelAutofix(silent);
    this.updateReviewEvidence(this.session?.currentTopology());
  }

  applyPresentationAction(action) {
    super.applyPresentationAction(action);
    this.searchPanel.refreshVisibility();
  }

  isSearchResultVisible(canonicalId) {
    const visibility = this.presentationState?.canonicalVisibility;
    return visibility
      ? isTopologyEditCanonicalIdVisible(visibility, canonicalId)
      : true;
  }

  activateSearchResult(result, options = {}) {
    if (!this.searchIndex || result?.searchIndexHash !== this.searchIndex.searchIndexHash) {
      this.setStatus('Search result is stale; run the search again.');
      return;
    }
    const wasHidden = !this.isSearchResultVisible(result.canonicalId);
    if (wasHidden) {
      this.applyPresentationAction({ type: PRESENTATION_ACTIONS.SHOW_ALL_IDS });
    }
    const focus = focusTopologyEditCanonicalIds({
      groups: this.viewportBackend?.groups,
      camera: this.viewportBackend?.activeCamera,
      canonicalIds: [result.canonicalId],
    });
    if (focus.status !== 'FOCUSED') {
      this.setStatus(
        `Canonical object ${result.canonicalId} is indexed but absent from the current visual projection.`,
      );
      return;
    }
    const additive = Boolean(options.additive);
    if (result.objectKind === 'node' || result.objectKind === 'edge') {
      if (this.selectionCoordinator) {
        this.selectionCoordinator.requestCanonical(
          additive ? 'ADD' : 'REPLACE',
          [result.canonicalId],
          'search',
          {
            primaryId: result.canonicalId,
            anchorId: additive ? undefined : result.canonicalId,
          },
        );
      } else {
        this.selection = updateTopologyEditSelection(
          this.selection,
          result.canonicalId,
          additive,
        );
      }
      this.presentationToolbar?.update(this.presentationState);
    }
    if (!this.selectionCoordinator && result.workspaceEntityIds.length) {
      this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
        entityId: result.workspaceEntityIds[0],
        source: 'topology-edit-3d',
      });
    }
    this.updateActionButtons();
    this.setStatus(
      `${wasHidden ? 'Presentation visibility reset; ' : ''}`
      + `focused ${result.canonicalId} by exact canonical identity. `
      + topologyEditSelectionDescription(this.selection),
    );
  }

  updateReviewEvidence(canonical) {
    if (!this.hostElement || !canonical) return;
    const preview = this.autofixPreview;
    this.hostElement.dataset.topologyEditCanonicalHash = String(
      canonical.canonicalTopologyHash ?? '',
    );
    this.hostElement.dataset.topologyEditSourceHash = String(canonical.sourceHash ?? '');
    this.hostElement.dataset.topologyEditJournalHash = String(
      this.session?.journal?.journalHash ?? '',
    );
    this.hostElement.dataset.topologyEditSessionVersion = String(
      this.session?.journal?.sessionVersion ?? 0,
    );
    this.hostElement.dataset.topologyEditActiveCommandCount = String(
      this.session?.journal?.activeCommandIds?.length ?? 0,
    );
    this.hostElement.dataset.topologyEditPreviewHash = String(
      preview?.candidateDraftHash ?? '',
    );
    this.hostElement.dataset.topologyEditPreviewCertificationHash = String(
      preview?.certification?.certificationHash ?? preview?.certificationHash ?? '',
    );
  }
}
