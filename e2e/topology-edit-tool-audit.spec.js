import { mkdir, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const REPORT_PATH = 'reports/qualification/topology-edit-tool-audit.json';
const CONTROLLER_KEY = '__TOPOLOGY_EDIT_TOOL_AUDIT_CONTROLLER__';
const EDGE_ACTIONS = Object.freeze([
  'split-edge-half', 'disconnect-from', 'disconnect-to', 'delete-edge',
]);
const TWO_NODE_ACTIONS = Object.freeze([
  'set-gap-3', 'set-gap-20', 'merge-nodes', 'bridge-gap', 'add-straight',
]);
const ALL_ACTIONS = Object.freeze([
  'move-positive-z', ...TWO_NODE_ACTIONS, ...EDGE_ACTIONS,
]);
const QUALIFIED_GAP_PORTS = Object.freeze([
  { entityId: 'P-001', role: 'TO', portKey: 'P-001:port:end' },
  { entityId: 'E-001', role: 'FROM', portKey: 'E-001:port:start' },
]);
const COMMAND_SCENARIOS = Object.freeze([
  { actionId: 'move-positive-z', kind: 'single-node' },
  { actionId: 'set-gap-3', kind: 'two-node' },
  { actionId: 'set-gap-20', kind: 'two-node' },
  { actionId: 'merge-nodes', kind: 'two-node' },
  { actionId: 'bridge-gap', kind: 'two-node' },
  { actionId: 'add-straight', kind: 'two-node' },
  { actionId: 'split-edge-half', kind: 'edge' },
  { actionId: 'disconnect-from', kind: 'edge' },
  { actionId: 'disconnect-to', kind: 'any-edge' },
  { actionId: 'delete-edge', kind: 'edge' },
]);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.addInitScript(() => globalThis.localStorage?.clear());
});

test('production endpoint affordances enable exact governed edit tools', async ({ page }) => {
  const host = await openFinalAuditController(page);
  await openPanel(host, 'commands');
  await expectDisabled(page, ALL_ACTIONS);

  const edgeId = (await canonicalEdgeIds(page))[0];
  await selectBySearch(page, host, edgeId);
  await expect(statusOutput(page)).toContainText(`Selected edge ${edgeId}.`);
  await expectEnabled(page, EDGE_ACTIONS);
  await expectDisabled(page, ['move-positive-z', ...TWO_NODE_ACTIONS]);

  const nodeId = await selectExactEndpoint(page, host, QUALIFIED_GAP_PORTS[0]);
  await expect(statusOutput(page)).toContainText(`Selected node ${nodeId}.`);
  await expectEnabled(page, ['move-positive-z']);
  await expectDisabled(page, [...TWO_NODE_ACTIONS, ...EDGE_ACTIONS]);

  await selectQualifiedGapVisible(page, host);
  await expect(statusOutput(page)).toContainText('Selected nodes 1=');
  await expectEnabled(page, TWO_NODE_ACTIONS);
  await expectDisabled(page, ['move-positive-z', ...EDGE_ACTIONS]);
});

test('canonical search replaces active selection and refreshes command enablement', async ({ page }) => {
  const host = await openFinalAuditController(page);
  await openPanel(host, 'commands');
  const edgeId = (await canonicalEdgeIds(page))[0];
  await selectBySearch(page, host, edgeId);
  await expectEnabled(page, EDGE_ACTIONS);

  const nodeId = await canonicalNodeForPort(page, 'P-001:port:start');
  await selectBySearch(page, host, nodeId);
  await expect(statusOutput(page)).toContainText(`Selected node ${nodeId}.`);
  await expectEnabled(page, ['move-positive-z']);
  await expectDisabled(page, [...TWO_NODE_ACTIONS, ...EDGE_ACTIONS]);
});

test('all ten governed edit tools execute independently on fresh 20-object samples', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const executions = [];
  for (const scenario of COMMAND_SCENARIOS) {
    const host = await openFinalAuditController(page);
    await openPanel(host, 'commands');
    const baseHash = await host.getAttribute('data-topology-edit-canonical-hash');
    if (scenario.kind === 'any-edge') {
      executions.push(await executeAgainstAnyEdge(page, host, scenario.actionId, baseHash));
      continue;
    }
    if (scenario.kind === 'two-node') {
      await selectQualifiedGapVisible(page, host);
    } else if (scenario.kind === 'single-node') {
      await selectExactEndpoint(page, host, {
        entityId: 'P-001', role: 'FROM', portKey: 'P-001:port:start',
      });
    } else {
      const edgeId = (await canonicalEdgeIds(page))[0];
      await selectBySearch(page, host, edgeId);
    }
    executions.push(await executeSelectedAction(page, host, scenario.actionId, baseHash));
  }

  const rejected = executions.filter((row) => !row.accepted);
  await testInfo.attach('all-tools-final-state', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
  await mkdir('reports/qualification', { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify({
    schema: 'TopologyEditToolAuditEvidence.v1',
    status: rejected.length ? 'FAIL_GOVERNED_EDIT_TOOL_EXECUTION' : 'PASS_ALL_GOVERNED_EDIT_TOOLS',
    candidateHead: process.env.TOPOLOGY_EDIT_TARGET_HEAD_SHA || process.env.GITHUB_SHA || null,
    fixture: 'public/fixtures/topology-edit-20-element-demo.staged.json',
    qualifiedGapPorts: QUALIFIED_GAP_PORTS.map((row) => row.portKey),
    backend: 'TopologyEditNavigationHudViewportBackend',
    executionCount: executions.length,
    rejectedActionIds: rejected.map((row) => row.actionId),
    executions,
  }, null, 2)}\n`);
  expect(rejected, JSON.stringify(executions, null, 2)).toEqual([]);
});

test('navigation, presentation, history, and draft controls remain operable', async ({ page }) => {
  test.setTimeout(90_000);
  const host = await openFinalAuditController(page);
  await openPanel(host, 'commands');
  const edgeId = (await canonicalEdgeIds(page))[0];
  await selectBySearch(page, host, edgeId);

  for (const mode of ['select', 'orbit', 'pan', 'select']) {
    await page.locator(`[data-navigation-mode="${mode}"]`).click();
    await expect(host).toHaveAttribute('data-topology-edit-navigation-mode', mode);
  }
  await page.locator('[data-navigation-action="fit"]').click();
  await expect(statusOutput(page)).toContainText('View command: fit.');
  const views = host.locator('details[data-panel-kind="views"]');
  await views.locator(':scope > summary').click();
  await page.locator('[data-navigation-action="fit-selection"]').click();
  await expect(statusOutput(page)).toContainText('Focused 1 canonical selection object(s).');
  for (const action of ['home', 'previous', 'pivot-selection']) {
    await page.locator(`[data-navigation-action="${action}"]`).click();
    await expect(statusOutput(page)).toContainText(`View command: ${action}.`);
  }
  await page.locator('[data-navigation-action="projection"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-projection', /orthographic|perspective/i);
  for (const view of ['iso', 'top', 'front', 'right']) {
    await page.locator(`[data-standard-view="${view}"]`).click();
    await expect(statusOutput(page)).toContainText(`Standard view: ${view.toUpperCase()}.`);
  }

  await openPanel(host, 'display');
  await page.locator('[data-action="hide-selected"]').click();
  await expect(page.locator('[data-role="presentation-visibility-status"]')).toHaveText('Hidden: 1');
  await page.locator('[data-action="show-all"]').click();
  await expect(page.locator('[data-role="presentation-visibility-status"]')).toHaveText('Visibility: all');
  await page.locator('[data-action="isolate-selected"]').click();
  await expect(page.locator('[data-role="presentation-visibility-status"]')).toHaveText('Isolated: 1');
  await page.locator('[data-action="reset-presentation"]').click();
  await expect(page.locator('[data-role="presentation-visibility-status"]')).toHaveText('Visibility: all');

  const nodeId = await canonicalNodeForPort(page, 'P-001:port:start');
  await selectBySearch(page, host, nodeId);
  await expectEnabled(page, ['move-positive-z']);
  await page.locator('[data-command-action="move-positive-z"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '1');
  await page.locator('[data-action="undo"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '0');
  await page.locator('[data-action="redo"]').click();
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '1');
  await page.locator('[data-action="save-draft"]').click();
  await expect(statusOutput(page)).toContainText('Draft saved:');
  await expect.poll(() => host.getAttribute('data-topology-edit-draft-package-hash')).not.toBe('');
  await openPanel(host, 'draft');
  await page.locator('[data-action="reload-draft"]').click();
  await expect(statusOutput(page)).toContainText('Draft restored at session version');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-action="export-draft"]').click(),
  ]);
  expect(download.suggestedFilename()).toContain('.json');
});

async function openFinalAuditController(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Application views' });
  await navigation.getByRole('button', { name: 'Workspace', exact: true }).click();
  await page.locator('[data-action="load-topology-edit-demo"]').click();
  await expect.poll(() => page.evaluate(() => (
    globalThis.AnalysisWorkspace?.getSnapshot?.()?.dataset?.entities?.length ?? 0
  ))).toBe(20);
  await page.evaluate(async (key) => {
    const moduleUrl = new URL('src/workspace/topology-edit-3d-professional-controller.js', document.baseURI).href;
    const { TopologyEdit3DViewController } = await import(moduleUrl);
    const prototype = TopologyEdit3DViewController.prototype;
    if (prototype.__toolAuditActivateWrapped) return;
    const activate = prototype.activate;
    prototype.activate = async function auditedActivate(...args) {
      globalThis[key] = this;
      return activate.apply(this, args);
    };
    Object.defineProperty(prototype, '__toolAuditActivateWrapped', { value: true, configurable: true });
  }, CONTROLLER_KEY);
  await page.getByRole('button', { name: '3D Edit', exact: true }).click();
  const host = page.locator('[data-role="topology-edit-render-host"]');
  await expect(host).toBeVisible();
  await expect(host).toHaveAttribute('data-topology-edit-clean-shell', 'true');
  await expect(host).toHaveAttribute('data-topology-edit-active-command-count', '0');
  await expect.poll(() => page.evaluate((key) => (
    globalThis[key]?.viewportBackend?.constructor?.name ?? ''
  ), CONTROLLER_KEY)).toContain('NavigationHud');
  return host;
}

async function openPanel(host, kind) {
  const panel = host.locator(`details[data-panel-kind="${kind}"]`);
  if (!(await panel.evaluate((element) => element.open))) {
    await panel.locator(':scope > summary').click();
  }
  return panel;
}

async function selectExactEndpoint(page, host, { entityId, role }) {
  await openPanel(host, 'topology-edit-visible-endpoints');
  const button = host.locator(
    `[data-role="topology-edit-visible-endpoints"] button[data-workspace-entity-ids="${entityId}"][data-endpoint-role="${role}"]`,
  );
  await expect(button).toHaveCount(1);
  await expect(button).toBeVisible();
  await button.click();
  const selected = await host.getAttribute('data-topology-edit-selection-ids');
  if (!selected) throw new Error(`Endpoint ${entityId} ${role} did not produce canonical selection.`);
  return selected.split(',').at(-1);
}

async function addExactEndpoint(page, host, { entityId, role }) {
  await openPanel(host, 'topology-edit-visible-endpoints');
  const button = host.locator(
    `[data-role="topology-edit-visible-endpoints"] button[data-workspace-entity-ids="${entityId}"][data-endpoint-role="${role}"]`,
  );
  await expect(button).toHaveCount(1);
  await button.click({ modifiers: ['Shift'] });
}

async function selectQualifiedGapVisible(page, host) {
  await selectExactEndpoint(page, host, QUALIFIED_GAP_PORTS[0]);
  await addExactEndpoint(page, host, QUALIFIED_GAP_PORTS[1]);
  await expect(statusOutput(page)).toContainText('Selected nodes 1=');
}

async function canonicalNodeForPort(page, portKey) {
  return page.evaluate(({ key, port }) => {
    const node = globalThis[key]?.session?.currentTopology?.()?.nodes
      ?.find((row) => row.portKeys?.includes(port));
    if (!node) throw new Error(`Canonical node for ${port} is unavailable.`);
    return node.id;
  }, { key: CONTROLLER_KEY, port: portKey });
}

async function canonicalEdgeIds(page) {
  return page.evaluate((key) => (
    globalThis[key]?.session?.currentTopology?.()?.edges?.map((edge) => edge.id).sort() ?? []
  ), CONTROLLER_KEY);
}

async function selectBySearch(page, host, canonicalId, additive = false) {
  await openPanel(host, 'topology-edit-canonical-search');
  const input = page.locator('[data-role="topology-edit-search-input"]');
  await input.fill(canonicalId);
  const result = page.locator(`[data-search-canonical-id="${canonicalId}"]`);
  await expect(result).toHaveCount(1);
  await result.click({ modifiers: additive ? ['Shift'] : [] });
}

async function executeAgainstAnyEdge(page, host, actionId, baseHash) {
  const attempts = [];
  for (const edgeId of await canonicalEdgeIds(page)) {
    await selectBySearch(page, host, edgeId);
    const result = await executeSelectedAction(page, host, actionId, baseHash, edgeId);
    attempts.push({ edgeId, outcomeStatus: result.outcomeStatus, accepted: result.accepted });
    if (result.accepted) return { ...result, attempts };
  }
  return { actionId, accepted: false, targetId: null, outcomeStatus: attempts.at(-1)?.outcomeStatus ?? 'No canonical edges available.', baseHash, afterHash: baseHash, authority: null, attempts };
}

async function executeSelectedAction(page, host, actionId, baseHash, targetId = null) {
  const button = page.locator(`[data-command-action="${actionId}"]`);
  await expect(button).toBeEnabled();
  const priorJournalHash = await page.evaluate((key) => globalThis[key]?.session?.journal?.journalHash ?? null, CONTROLLER_KEY);
  await button.click();
  const outcomeStatus = await statusOutput(page).innerText();
  const activeCommandCount = Number(await host.getAttribute('data-topology-edit-active-command-count') || 0);
  const afterHash = await host.getAttribute('data-topology-edit-canonical-hash');
  const authority = await commandAuthorityEvidence(page, priorJournalHash);
  const accepted = /accepted/i.test(outcomeStatus)
    && activeCommandCount === 1
    && afterHash !== baseHash
    && authority?.activeCanonicalTopologyHash === afterHash
    && [authority?.commandId, authority?.requestHash, authority?.journalEntryHash,
      authority?.transactionHash, authority?.journalHash, authority?.sessionHash].every(Boolean);
  return { actionId, targetId, outcomeStatus, accepted, activeCommandCount, baseHash, afterHash, authority };
}

async function commandAuthorityEvidence(page, priorJournalHash) {
  return page.evaluate(async ({ key, priorHash }) => {
    const session = globalThis[key]?.session;
    const journal = session?.journal;
    const replay = session?.replay;
    const entry = journal?.history?.at(-1) ?? null;
    const snapshot = session?.snapshot?.() ?? null;
    if (!priorHash || !journal || !replay || !entry) return null;
    const { semanticHash } = await import(new URL('src/core/shared-piping-model/index.js', document.baseURI).href);
    const transactionMaterial = {
      schema: 'TopologyEditJournalTransition.v1',
      action: 'ACCEPT_COMMAND',
      disposition: 'ACCEPTED',
      priorJournalHash: priorHash,
      journalHash: journal.journalHash,
      sessionVersion: journal.sessionVersion,
      activeCanonicalTopologyHash: replay.activeCanonicalTopologyHash,
      replayHash: replay.replayHash,
      certificationHash: entry.certificationHash,
      reason: null,
    };
    return {
      commandId: entry.commandId,
      requestHash: entry.request?.requestHash ?? null,
      journalEntryHash: entry.entryHash,
      transactionHash: semanticHash(transactionMaterial),
      journalHash: journal.journalHash,
      activeCanonicalTopologyHash: replay.activeCanonicalTopologyHash,
      sessionHash: snapshot?.sessionHash ?? null,
    };
  }, { key: CONTROLLER_KEY, priorHash: priorJournalHash });
}

function statusOutput(page) {
  return page.locator('[data-role="topology-edit-status"]');
}

async function expectEnabled(page, actionIds) {
  for (const actionId of actionIds) {
    await expect(page.locator(`[data-command-action="${actionId}"]`)).toBeEnabled();
  }
}

async function expectDisabled(page, actionIds) {
  for (const actionId of actionIds) {
    await expect(page.locator(`[data-command-action="${actionId}"]`)).toBeDisabled();
  }
}
