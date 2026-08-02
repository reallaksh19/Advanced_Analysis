/** Event lifecycle and keyboard behavior for the real Workspace dataset tree. */
import { EVENT_TOPICS } from './event-topics.js';
import { MODEL_ZONE_EVENTS } from './model-zone-selector.js';
import { filterTree, focusTreeIndex, renderVisibleItems, scrollToTreeIndex, updateFlattenedNodes } from './tree-panel-tree.js';

export const TOPOLOGY_EDIT_DEMO_FIXTURE_PATH = 'fixtures/topology-edit-20-element-demo.staged.json';
const TOPOLOGY_EDIT_DEMO_SOURCE_NAME = 'topology-edit-20-element-demo.staged.json';

export function initializeTreePanel(panel) {
  if (panel.initialized) return;
  panel.listElement = panel.requireElement('[data-role="tree-list"]');
  panel.fileElement = panel.requireElement('[data-role="dataset-file"]');
  panel.statusElement = panel.requireElement('[data-role="tree-status"]');
  panel.errorElement = panel.requireElement('[data-role="tree-error"]');
  panel.clearButton = panel.requireElement('[data-action="clear-dataset"]');
  panel.demoButton = ensureTopologyEditDemoButton(panel);
  panel.searchElement = panel.requireElement('[data-role="tree-search"]');
  panel.pipesElement = panel.requireElement('[data-role="summary-pipes"]');
  panel.supportsElement = panel.requireElement('[data-role="summary-supports"]');
  panel.listElement.replaceChildren();
  panel.listElement.role = 'tree';
  panel.listElement.tabIndex = 0;
  panel.listElement.style.position = 'relative';
  panel.contentElement = panel.rootElement.ownerDocument.createElement('div');
  panel.contentElement.className = 'tree-list-content';
  panel.listElement.append(panel.contentElement);
  panel.unsubscribeCallbacks = subscriptions(panel);
  panel.rootElement.addEventListener('click', panel.handleClick);
  panel.rootElement.addEventListener('change', panel.handleChange);
  panel.listElement.addEventListener('scroll', panel.handleScroll, { passive: true });
  panel.listElement.addEventListener('keydown', panel.handleKeyDown);
  panel.searchElement.addEventListener('input', panel.handleSearchInput);
  panel.initialized = true;
}

export function handleTreeClick(panel, event) {
  const trigger = event.target?.closest?.('[data-action], [data-entity-id], [data-branch-id]');
  if (!trigger || !panel.rootElement.contains(trigger)) return;
  if (trigger.dataset.action === 'import-dataset') { panel.fileElement.click(); return; }
  if (trigger.dataset.action === 'load-topology-edit-demo') { void loadTopologyEditDemo(panel); return; }
  if (trigger.dataset.action === 'clear-dataset') { panel.eventBus.publish(EVENT_TOPICS.DATASET_CLEAR_REQUESTED); return; }
  selectTreeTrigger(panel, trigger);
}

export async function handleTreeChange(panel, event) {
  if (event.target !== panel.fileElement) return;
  const file = panel.fileElement.files?.[0];
  if (!file) return;
  try {
    const sourceBytes = new Uint8Array(await file.arrayBuffer());
    panel.clearError();
    panel.statusElement.textContent = `Loading ${file.name}…`;
    await publishDatasetLoad(panel, file.name, sourceBytes);
  } catch (error) {
    publishLoadFailure(panel, file.name, error);
  } finally { panel.fileElement.value = ''; }
}

export async function loadTopologyEditDemo(panel, options = {}) {
  const fixtureUrl = options.fixtureUrl ?? topologyEditDemoUrl(panel);
  const fetchFn = options.fetchFn ?? browserFetch(panel);
  panel.demoButton.disabled = true;
  panel.clearError();
  panel.statusElement.textContent = 'Loading 20-element 3D Edit demo…';
  try {
    const response = await fetchFn(fixtureUrl, { cache: 'no-store' });
    if (!response?.ok) throw new Error(`Demo fixture request failed (${response?.status ?? 'no response'}).`);
    const sourceBytes = new Uint8Array(await response.arrayBuffer());
    const rawPackage = parseJsonBytes(sourceBytes);
    assertTopologyEditDemoPackage(rawPackage);
    await publishDatasetLoad(panel, TOPOLOGY_EDIT_DEMO_SOURCE_NAME, sourceBytes, rawPackage);
  } catch (error) {
    publishLoadFailure(panel, TOPOLOGY_EDIT_DEMO_SOURCE_NAME, error);
  } finally {
    panel.demoButton.disabled = false;
  }
}

async function publishDatasetLoad(panel, sourceName, sourceBytes, parsedPackage = null) {
  const rawPackage = parsedPackage ?? parseJsonBytes(sourceBytes);
  const sourceSha256 = await sha256(sourceBytes);
  panel.eventBus.publish(EVENT_TOPICS.DATASET_LOAD_REQUESTED, {
    rawPackage,
    sourceName,
    sourceBytes,
    sourceSha256,
  });
}

function parseJsonBytes(sourceBytes) {
  return JSON.parse(new TextDecoder('utf-8').decode(sourceBytes));
}

function publishLoadFailure(panel, sourceName, error) {
  panel.eventBus.publish(EVENT_TOPICS.DATASET_LOAD_FAILED, {
    message: error instanceof Error ? error.message : String(error),
    sourceName,
  });
}

function assertTopologyEditDemoPackage(value) {
  if (value?.schema !== 'inputxml-managed-stage/v1') {
    throw new TypeError('3D Edit demo fixture has an unsupported staged JSON schema.');
  }
  if (!Array.isArray(value.objects) || value.objects.length !== 20) {
    throw new TypeError('3D Edit demo fixture must contain exactly 20 objects.');
  }
  const ids = value.objects.map((row) => String(row?.id || ''));
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    throw new TypeError('3D Edit demo fixture object IDs must be present and unique.');
  }
}

function ensureTopologyEditDemoButton(panel) {
  const existing = panel.rootElement.querySelector('[data-action="load-topology-edit-demo"]');
  if (existing) return existing;
  const actions = panel.requireElement('.dataset-toolbar__actions');
  const button = panel.rootElement.ownerDocument.createElement('button');
  button.type = 'button';
  button.className = 'dataset-toolbar__demo-button';
  button.dataset.action = 'load-topology-edit-demo';
  button.title = 'Load the 20-element staged JSON fixture for 3D Edit testing';
  button.setAttribute('aria-label', 'Load 20-element 3D Edit demo');
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4 7h8m-8 5h5m-5 5h8M15 5l4 2.3v4.6l-4 2.3-4-2.3V7.3L15 5Zm0 9.2V19m-4-7.1-3 1.8" />
  </svg><span>3D Demo</span><span class="dataset-toolbar__demo-count">20</span>`;
  actions.append(button);
  return button;
}

function topologyEditDemoUrl(panel) {
  const baseUrl = String(import.meta.env?.BASE_URL || '/');
  const root = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(`${root}${TOPOLOGY_EDIT_DEMO_FIXTURE_PATH}`, panel.rootElement.ownerDocument.baseURI).href;
}

function browserFetch(panel) {
  const browserWindow = panel.rootElement.ownerDocument.defaultView;
  const fetchFn = browserWindow?.fetch ?? globalThis.fetch;
  if (typeof fetchFn !== 'function') throw new Error('Fetch is unavailable; the 3D Edit demo cannot be loaded.');
  return fetchFn.bind(browserWindow ?? globalThis);
}

async function sha256(sourceBytes) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable; the dataset cannot be imported without source-hash evidence.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', sourceBytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function handleTreeKeyDown(panel, event) {
  if (!panel.flattenedNodes.length) return;
  const active = panel.rootElement.ownerDocument.activeElement;
  if (!panel.listElement.contains(active) && active !== panel.listElement) return;
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(event.key)) return;
  event.preventDefault();
  if (panel.focusedIndex < 0) panel.focusedIndex = 0;
  applyKey(panel, panel.flattenedNodes[panel.focusedIndex], event.key);
  scrollToTreeIndex(panel, panel.focusedIndex);
  renderVisibleItems(panel);
  focusTreeIndex(panel);
}

export function destroyTreePanel(panel) {
  if (!panel.initialized) return;
  panel.rootElement.removeEventListener('click', panel.handleClick);
  panel.rootElement.removeEventListener('change', panel.handleChange);
  panel.listElement.removeEventListener('scroll', panel.handleScroll);
  panel.listElement.removeEventListener('keydown', panel.handleKeyDown);
  panel.searchElement.removeEventListener('input', panel.handleSearchInput);
  panel.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
  panel.unsubscribeCallbacks = [];
  panel.dataset = null;
  panel.sourceDataset = null;
  panel.demoButton = null;
  panel.initialized = false;
}

function subscriptions(panel) {
  return [
    panel.eventBus.subscribe(MODEL_ZONE_EVENTS.CHANGED, ({ selection, dataset }) => panel.applyZoneSelection(selection, dataset)),
    panel.eventBus.subscribe(EVENT_TOPICS.WORKSPACE_SNAPSHOT_CHANGED, ({ snapshot }) => requestAnimationFrame(() => panel.renderSnapshot(snapshot))),
    panel.eventBus.subscribe(EVENT_TOPICS.DATASET_LOAD_FAILED, ({ message }) => panel.renderError(message)),
    panel.eventBus.subscribe(EVENT_TOPICS.DATASET_CLEARED, () => panel.renderEmpty()),
  ];
}

function selectTreeTrigger(panel, trigger) {
  const index = Number.parseInt(trigger.dataset.index, 10);
  if (!Number.isInteger(index) || index < 0 || index >= panel.flattenedNodes.length) return;
  panel.focusedIndex = index;
  const item = panel.flattenedNodes[index];
  if (trigger.dataset.action === 'toggle-branch' || item.type === 'branch') toggleBranch(panel, item);
  else if (trigger.dataset.action === 'select-entity' || item.type === 'entity') publishSelection(panel, item.id);
  focusTreeIndex(panel);
}

function applyKey(panel, item, key) {
  if (key === 'ArrowDown') panel.focusedIndex = Math.min(panel.flattenedNodes.length - 1, panel.focusedIndex + 1);
  else if (key === 'ArrowUp') panel.focusedIndex = Math.max(0, panel.focusedIndex - 1);
  else if (key === 'ArrowRight') moveRight(panel, item);
  else if (key === 'ArrowLeft') moveLeft(panel, item);
  else if (item.type === 'branch') toggleBranch(panel, item);
  else publishSelection(panel, item.id);
}

function moveRight(panel, item) {
  if (item.type !== 'branch') return;
  if (!item.isExpanded) { panel.expandedBranches.add(item.id); updateFlattenedNodes(panel); }
  else panel.focusedIndex = Math.min(panel.flattenedNodes.length - 1, panel.focusedIndex + 1);
}

function moveLeft(panel, item) {
  if (item.type === 'branch' && item.isExpanded) { panel.expandedBranches.delete(item.id); updateFlattenedNodes(panel); return; }
  if (item.depth <= 0) return;
  for (let index = panel.focusedIndex - 1; index >= 0; index -= 1) {
    const candidate = panel.flattenedNodes[index];
    if (candidate.type === 'branch' && candidate.depth === item.depth - 1) { panel.focusedIndex = index; return; }
  }
}

function toggleBranch(panel, item) {
  if (item.isExpanded) panel.expandedBranches.delete(item.id); else panel.expandedBranches.add(item.id);
  updateFlattenedNodes(panel);
}

function publishSelection(panel, entityId) { panel.eventBus.publish(EVENT_TOPICS.VIEWPORT_SELECTION_REQUESTED, { entityId, source: 'tree' }); }
