import { canonicalLafeaSha256 } from './lafea-canonical-sha256.js';
import { validateLafeaSelectedPilotReviewSession } from './lafea-selected-pilot-review-session.js';

export const LAFEA_SELECTED_PILOT_REVIEW_PANEL_RECEIPT_SCHEMA =
  'lafea-selected-pilot-review-panel-receipt/v1';
export const LAFEA_SELECTED_PILOT_REVIEW_PANEL_PRODUCER_REVISION = 'NB-T6G.1';

const STATUS = 'READ_ONLY_SELECTED_PILOT_REVIEW_PANEL_MOUNTED';
const SECTIONS = Object.freeze([
  'BASIS', 'LEVEL_EVIDENCE', 'CONVERGENCE', 'FINEST_RETAINED_RESULT',
  'LIVE_DISPLAY_BINDING', 'LIMITATIONS',
]);
const AUTHORITY = Object.freeze({
  readOnlyReviewPanelMounted: true,
  currentViewportMatched: true,
  currentLifecycleMatched: true,
  controllerMutated: false,
  engineeringEvidenceChanged: false,
  solverExecuted: false,
  newEngineeringRecoveryProduced: false,
  newConvergenceProduced: false,
  newDisplayProjectionProduced: false,
  lifecycleArtifactsRegistered: false,
  displayValuesAuthoritative: false,
  generalT7dAuthorized: false,
  additionalContinuumTemplatesAuthorized: false,
  shellAuthorized: false,
  sclAuthorized: false,
  structuralStressAuthorized: false,
  assessmentReady: false,
  codeReady: false,
  reportAuthority: false,
  releaseQualified: false,
  lafea6Enabled: false,
});

export function mountLafeaSelectedPilotReviewPanel(value) {
  const { hostElement, controller, session } = requireInput(value);
  let activeSection = requireSection(value.initialSection ?? 'BASIS', session);
  let destroyed = false;
  let receipt;

  const refresh = () => {
    if (destroyed) throw error('LAFEA_NB_T6G_PANEL_DESTROYED');
    const current = requireCurrent(controller, session);
    receipt = sealReceipt(session, activeSection, current);
    render(hostElement, session, receipt, (next) => {
      activeSection = requireSection(next, session);
      refresh();
    });
    return receipt;
  };
  refresh();

  return Object.freeze({
    selectSection(sectionId) {
      activeSection = requireSection(sectionId, session);
      return refresh();
    },
    getReceipt() {
      if (destroyed) throw error('LAFEA_NB_T6G_PANEL_DESTROYED');
      return receipt;
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      hostElement.replaceChildren();
    },
  });
}

export function validateLafeaSelectedPilotReviewPanelReceipt(value) {
  try {
    requireReceipt(value);
    return Object.freeze({ ok: true, errors: Object.freeze([]) });
  } catch (cause) {
    return Object.freeze({
      ok: false,
      errors: Object.freeze([cause?.code ?? 'LAFEA_NB_T6G_PANEL_RECEIPT_INVALID']),
    });
  }
}

function requireInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw error('LAFEA_NB_T6G_INPUT_INVALID');
  }
  const { hostElement, controller, session } = value;
  if (!hostElement || typeof hostElement.replaceChildren !== 'function'
    || typeof hostElement.ownerDocument?.createElement !== 'function') {
    throw error('LAFEA_NB_T6G_HOST_INVALID');
  }
  if (!controller
    || typeof controller.getDisplayViewportContext !== 'function'
    || typeof controller.exportLifecycle !== 'function') {
    throw error('LAFEA_NB_T6G_CONTROLLER_READ_SURFACE_INVALID');
  }
  const validation = validateLafeaSelectedPilotReviewSession(session);
  if (!validation.ok || session.authority?.readOnlyReviewSessionReady !== true
    || session.authority?.engineeringEvidenceChanged !== false
    || session.authority?.solverExecuted !== false
    || session.authority?.newEngineeringRecoveryProduced !== false
    || session.authority?.newConvergenceProduced !== false
    || session.authority?.newDisplayProjectionProduced !== false
    || session.authority?.lifecycleArtifactsRegistered !== false
    || session.authority?.displayValuesAuthoritative !== false
    || session.authority?.assessmentReady !== false
    || session.authority?.codeReady !== false
    || session.authority?.reportAuthority !== false
    || session.authority?.releaseQualified !== false) {
    throw error('LAFEA_NB_T6G_SESSION_INVALID');
  }
  return { hostElement, controller, session };
}

function requireSection(value, session) {
  if (!SECTIONS.includes(value)
    || !session.reviewSections.some((row) =>
      row.sectionId === value && row.status === 'READY')) {
    throw error('LAFEA_NB_T6G_SECTION_INVALID');
  }
  return value;
}

function requireCurrent(controller, session) {
  const viewport = controller.getDisplayViewportContext();
  if (!viewport || viewport.schema !== 'lafea-workbench-display-context/v1'
    || viewport.stageId !== session.stageId
    || viewport.sceneRevision !== session.displayBinding.sceneRevision
    || viewport.sourceSemanticHash !== session.parentHashes.sourceHash
    || viewport.mode !== session.displayBinding.viewportMode
    || viewport.status !== session.displayBinding.viewportStatus) {
    throw error('LAFEA_NB_T6G_VIEWPORT_CONTEXT_STALE');
  }
  const exported = controller.exportLifecycle();
  if (!exported || exported.schema !== 'lafea-workbench-lifecycle-export/v1'
    || exported.stageId !== session.stageId
    || exported.lifecycle?.source?.status !== 'CURRENT'
    || exported.lifecycle?.source?.sourceHash !== session.parentHashes.sourceHash
    || exported.binding?.status !== 'CURRENT'
    || exported.binding?.boundDocumentDigest === null
    || exported.binding?.boundDocumentDigest !== exported.binding?.currentDocumentDigest
    || exported.readiness?.meshQualified !== true
    || exported.readiness?.resultReady !== true
    || exported.readiness?.convergenceReady !== true
    || exported.readiness?.codeReady !== false) {
    throw error('LAFEA_NB_T6G_LIFECYCLE_CONTEXT_STALE');
  }
  const artifacts = exported.lifecycle.artifacts ?? {};
  for (const [kind, expected] of [
    ['ANALYSIS_MESH', session.parentHashes.analysisMeshHash],
    ['EXECUTION', session.parentHashes.executionHash],
    ['RECOVERY', session.parentHashes.recoveryHash],
    ['CONVERGENCE', session.parentHashes.convergenceHash],
  ]) {
    const artifact = artifacts[kind];
    if (artifact?.status !== 'CURRENT' || artifact?.qualification !== 'PASS'
      || artifact?.artifactHash !== expected) {
      throw error('LAFEA_NB_T6G_LIFECYCLE_ARTIFACT_STALE');
    }
  }
  return Object.freeze({
    viewport: Object.freeze({
      stageId: viewport.stageId,
      sceneRevision: viewport.sceneRevision,
      sourceHash: viewport.sourceSemanticHash,
      mode: viewport.mode,
      status: viewport.status,
    }),
    lifecycle: Object.freeze({
      bindingStatus: exported.binding.status,
      documentDigest: exported.binding.currentDocumentDigest,
      meshQualified: true,
      resultReady: true,
      convergenceReady: true,
      codeReady: false,
      analysisMeshHash: artifacts.ANALYSIS_MESH.artifactHash,
      executionHash: artifacts.EXECUTION.artifactHash,
      recoveryHash: artifacts.RECOVERY.artifactHash,
      convergenceHash: artifacts.CONVERGENCE.artifactHash,
    }),
  });
}

function sealReceipt(session, activeSection, current) {
  const base = {
    schema: LAFEA_SELECTED_PILOT_REVIEW_PANEL_RECEIPT_SCHEMA,
    producerRevision: LAFEA_SELECTED_PILOT_REVIEW_PANEL_PRODUCER_REVISION,
    sessionHash: session.sessionHash,
    sessionId: session.sessionId,
    stageId: session.stageId,
    sourceHash: session.parentHashes.sourceHash,
    analysisMeshHash: session.parentHashes.analysisMeshHash,
    executionHash: session.parentHashes.executionHash,
    recoveryHash: session.parentHashes.recoveryHash,
    convergenceHash: session.parentHashes.convergenceHash,
    displayGeometryHash: session.parentHashes.displayGeometryHash,
    renderProfileHash: session.parentHashes.renderProfileHash,
    sceneRevision: session.displayBinding.sceneRevision,
    fieldId: session.displayBinding.fieldId,
    activeSection,
    renderedSectionIds: [...SECTIONS],
    viewport: current.viewport,
    lifecycle: current.lifecycle,
    status: STATUS,
    authority: AUTHORITY,
  };
  return deepFreeze({ ...base, receiptHash: canonicalLafeaSha256(base) });
}

function requireReceipt(value) {
  if (!value || value.schema !== LAFEA_SELECTED_PILOT_REVIEW_PANEL_RECEIPT_SCHEMA
    || value.producerRevision !== LAFEA_SELECTED_PILOT_REVIEW_PANEL_PRODUCER_REVISION
    || value.status !== STATUS || !SECTIONS.includes(value.activeSection)
    || JSON.stringify(value.renderedSectionIds) !== JSON.stringify(SECTIONS)
    || JSON.stringify(value.authority) !== JSON.stringify(AUTHORITY)
    || value.viewport?.stageId !== value.stageId
    || value.viewport?.sceneRevision !== value.sceneRevision
    || value.viewport?.sourceHash !== value.sourceHash
    || value.lifecycle?.bindingStatus !== 'CURRENT'
    || value.lifecycle?.resultReady !== true
    || value.lifecycle?.convergenceReady !== true
    || value.lifecycle?.codeReady !== false
    || value.lifecycle?.analysisMeshHash !== value.analysisMeshHash
    || value.lifecycle?.executionHash !== value.executionHash
    || value.lifecycle?.recoveryHash !== value.recoveryHash
    || value.lifecycle?.convergenceHash !== value.convergenceHash) {
    throw error('LAFEA_NB_T6G_PANEL_RECEIPT_INVALID');
  }
  const base = { ...value };
  delete base.receiptHash;
  if (canonicalLafeaSha256(base) !== value.receiptHash) {
    throw error('LAFEA_NB_T6G_PANEL_RECEIPT_HASH_TAMPERED');
  }
}

function render(host, session, receipt, onSelect) {
  const doc = host.ownerDocument;
  const panel = node(doc, 'section');
  panel.dataset.role = 'lafea-selected-pilot-review-panel';
  panel.dataset.activeSection = receipt.activeSection;
  const header = node(doc, 'header');
  header.append(
    node(doc, 'h2', `${session.templateId} · ${session.stageId}`),
    node(doc, 'p', 'Read-only evidence review; display values are non-authoritative.'),
  );
  const nav = node(doc, 'nav');
  nav.dataset.role = 'lafea-selected-pilot-review-navigation';
  SECTIONS.forEach((sectionId) => {
    const button = node(doc, 'button', label(sectionId));
    button.dataset.role = 'lafea-selected-pilot-review-section';
    button.dataset.sectionId = sectionId;
    button.setAttribute('aria-pressed',
      sectionId === receipt.activeSection ? 'true' : 'false');
    button.addEventListener('click', () => onSelect(sectionId));
    nav.append(button);
  });
  const content = node(doc, 'article');
  content.dataset.role = 'lafea-selected-pilot-review-content';
  content.dataset.sectionId = receipt.activeSection;
  content.append(node(doc, 'pre',
    JSON.stringify(sectionValue(session, receipt.activeSection, receipt), null, 2)));
  panel.append(header, nav, content, node(doc, 'code', receipt.receiptHash));
  host.replaceChildren(panel);
}

function sectionValue(session, sectionId, receipt) {
  const map = {
    BASIS: session.physicalProblem,
    LEVEL_EVIDENCE: session.levels,
    CONVERGENCE: session.convergence,
    FINEST_RETAINED_RESULT: session.finestResult,
    LIVE_DISPLAY_BINDING: {
      ...session.displayBinding,
      viewport: receipt.viewport,
      lifecycle: receipt.lifecycle,
    },
    LIMITATIONS: session.limitations,
  };
  return map[sectionId];
}

function node(doc, tag, text = null) {
  const value = doc.createElement(tag);
  if (text !== null) value.textContent = String(text);
  return value;
}

function label(value) {
  return value.toLowerCase().replaceAll('_', ' ')
    .replace(/(^|\s)([a-z])/gu, (_match, prefix, letter) =>
      `${prefix}${letter.toUpperCase()}`);
}

function error(code) {
  const value = new TypeError(code);
  value.code = code;
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)
    || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}
