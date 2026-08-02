/** Spatial issue-review composition over search, lifecycle, and certified autofix. */
import { EVENT_TOPICS } from './event-topics.js';
import {
  TopologyEdit3DViewController as SearchController,
} from './topology-edit-3d-search-controller.js';
import {
  topologyEditSelectionDescription,
  updateTopologyEditSelection,
} from './topology-edit/topology-edit-command-ui.js';
import { TopologyEditCanvasCallout } from './topology-edit/topology-edit-canvas-callout.js';
import {
  buildTopologyEditIssueOverlay,
} from './topology-edit/topology-edit-issue-overlay.js';
import {
  topologyEditEntityIdsForObject,
} from './topology-edit/topology-edit-render-packet.js';
import {
  topologyEditPresentationActions,
} from './viewport-presentation/topology-edit-presentation-contract.js';
import {
  focusTopologyEditCanonicalIds,
} from './viewport-productivity/topology-edit-scene-focus.js';

const PRESENTATION_ACTIONS = topologyEditPresentationActions();

export class TopologyEdit3DViewController extends SearchController {
  constructor(eventBus, lifecycleOptions = {}) {
    super(eventBus, lifecycleOptions);
    this.issueOverlay = null;
    this.issueCallout = null;
    this.issueCalloutMount = null;
  }

  buildShell() {
    super.buildShell();
    this.hostElement.style.position = 'relative';
    const mount = this.hostElement.ownerDocument.createElement('div');
    mount.dataset.role = 'topology-edit-issue-callout-layer';
    mount.style.position = 'absolute';
    mount.style.inset = '0';
    mount.style.pointerEvents = 'none';
    mount.style.overflow = 'hidden';
    this.hostElement.append(mount);
    this.issueCalloutMount = mount;
    this.issueCallout = new TopologyEditCanvasCallout(mount);
  }

  deactivate() {
    this.issueCallout?.destroy();
    this.issueCallout = null;
    this.issueCalloutMount = null;
    this.issueOverlay = null;
    this.viewportBackend?.clearIssues();
    super.deactivate();
  }

  handleCanvasPointer(event) {
    const pick = this.viewportBackend?.pickAt(event.clientX, event.clientY);
    if (!pick?.objectId || !this.session) return;
    if (pick.objectKind === 'issue') {
      this.showIssueById(pick.objectId, event.clientX, event.clientY);
      return;
    }
    this.applyCanonicalPick(pick, event.shiftKey);
  }

  handleHostClick(event) {
    const showButton = event.target.closest('[data-show-topology-issue]');
    if (showButton) {
      const rect = this.hostElement.getBoundingClientRect();
      this.showIssueById(
        showButton.dataset.showTopologyIssue,
        rect.left + rect.width * 0.64,
        rect.top + Math.min(rect.height * 0.45, 320),
        showButton.dataset.issueOverlayHash,
      );
      return;
    }
    return super.handleHostClick(event);
  }

  applyCanonicalPick(pick, additive) {
    if (pick.objectKind === 'node' || pick.objectKind === 'component') {
      this.selection = updateTopologyEditSelection(
        this.selection,
        pick.objectId,
        additive,
      );
    }
    const entityIds = pick.workspaceEntityIds?.length
      ? pick.workspaceEntityIds
      : topologyEditEntityIdsForObject(
        this.session.currentTopology(),
        pick.objectId,
      );
    if (entityIds.length) {
      this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
        entityId: entityIds[0],
        source: 'topology-edit-3d',
      });
    }
    this.presentationToolbar?.update(this.presentationState);
    this.setStatus(pickStatus(pick, this.selection));
    this.updateActionButtons();
  }

  renderCheckerPanel() {
    if (!this.checkerElement || !this.session) return;
    this.issueCallout?.hideCallout();
    this.issueOverlay = buildTopologyEditIssueOverlay({
      canonicalTopology: this.session.currentTopology(),
      issues: this.issues,
      suggestions: this.autofixSuggestions,
    });
    this.viewportBackend?.renderIssues(this.issueOverlay);
    const visualIssues = this.visualDiagnostics.map((row) => ({
      kind: row.code,
      message: row.message,
    }));
    const total = this.issues.length + visualIssues.length;
    if (!total) {
      this.checkerElement.textContent = 'No topology or visual-evidence issues detected.';
      return;
    }
    const entries = new Map(
      this.issueOverlay.entries.map((entry) => [entry.issueId, entry]),
    );
    const rows = this.issues.slice(0, 30).map((issue) => issueRow(
      issue,
      entries.get(issue.id),
      this.issueOverlay.overlayHash,
    ));
    const visualRows = visualIssues.slice(0, Math.max(0, 30 - rows.length))
      .map((issue) => `<li>${escapeHtml(issue.kind)}: ${escapeHtml(issue.message)}</li>`);
    this.checkerElement.innerHTML = `
      <strong>${total} issue(s); ${this.issueOverlay.anchoredIssueCount} spatial marker(s); ${this.autofixSuggestions.length} source-backed fix(es)</strong>
      <ul>${[...rows, ...visualRows].join('')}</ul>`;
  }

  showIssueById(issueId, screenX, screenY, expectedOverlayHash = null) {
    if (!this.issueOverlay
      || (expectedOverlayHash && expectedOverlayHash !== this.issueOverlay.overlayHash)) {
      this.setStatus('Issue review is stale; refresh the current topology checks.');
      return;
    }
    const entry = this.issueOverlay.entries
      .find((row) => row.issueId === issueId);
    if (!entry) {
      this.setStatus(`Issue ${issueId} is no longer present or has no spatial anchor.`);
      return;
    }
    this.issueCallout?.showIssue({
      entry,
      screenX,
      screenY,
      onPreviewFix: (current) => this.previewIssueFix(current),
      onFlyTo: (current) => this.focusIssue(current),
    });
    this.setStatus(`Reviewing ${entry.severity} ${entry.kind} at ${entry.anchorSource}.`);
  }

  previewIssueFix(entry) {
    const suggestion = this.autofixSuggestions.find((row) => (
      row.issueId === entry.issueId
      && row.suggestionHash === entry.suggestionHash
    ));
    if (!suggestion) {
      this.setStatus('The source-backed fix suggestion is stale; rerun the checker.');
      return;
    }
    this.previewAutofix(suggestion.suggestionHash);
  }

  focusIssue(entry) {
    if (!entry.canonicalIds.length) {
      this.setStatus(`Issue ${entry.issueId} has no canonical focus target.`);
      return;
    }
    let result = this.focusCanonicalIds(entry.canonicalIds);
    let visibilityReset = false;
    if (result.status !== 'FOCUSED') {
      this.applyPresentationAction({ type: PRESENTATION_ACTIONS.SHOW_ALL_IDS });
      visibilityReset = true;
      result = this.focusCanonicalIds(entry.canonicalIds);
    }
    if (result.status !== 'FOCUSED') {
      this.setStatus(`Issue targets are absent from the current visual projection: ${entry.canonicalIds.join(', ')}.`);
      return;
    }
    const firstId = result.foundIds[0];
    const entityIds = topologyEditEntityIdsForObject(
      this.session.currentTopology(),
      firstId,
    );
    if (entityIds.length) {
      this.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, {
        entityId: entityIds[0],
        source: 'topology-edit-issue-review',
      });
    }
    this.setStatus(
      `${visibilityReset ? 'Presentation visibility reset; ' : ''}`
      + `focused ${result.foundIds.length} canonical target(s) for ${entry.kind}.`,
    );
  }

  focusCanonicalIds(canonicalIds) {
    return focusTopologyEditCanonicalIds({
      groups: this.viewportBackend?.groups,
      camera: this.viewportBackend?.activeCamera,
      canonicalIds,
    });
  }
}

function issueRow(issue, entry, overlayHash) {
  const show = entry
    ? ` <button type="button" data-show-topology-issue="${escapeHtml(issue.id)}" data-issue-overlay-hash="${escapeHtml(overlayHash)}">Show in 3D</button>`
    : '';
  const preview = entry?.suggestionHash
    ? ` <button type="button" data-autofix-suggestion="${escapeHtml(entry.suggestionHash)}">Preview ${escapeHtml(entry.commandType)}</button>`
    : '';
  return `<li data-issue-kind="${escapeHtml(issue.kind)}" data-issue-id="${escapeHtml(issue.id)}"><strong>${escapeHtml(issue.severity)}</strong> ${escapeHtml(issue.kind)}: ${escapeHtml(issue.message)}${show}${preview}</li>`;
}

function pickStatus(pick, selection) {
  if (pick.objectKind === 'restraint') {
    return `Selected ${pick.restraintFamily || 'restraint'} ${pick.restraintId} on support ${pick.supportId}.`;
  }
  if (pick.objectKind === 'support') {
    return `Selected support ${pick.supportId || pick.objectId}.`;
  }
  return topologyEditSelectionDescription(selection);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]));
}
