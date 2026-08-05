import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

patchProjection();
patchRenderer();
patchLoadCalcController();
patchScenarioView();
patchTest();
console.log('wp4-selection-and-pick-patch: APPLIED');

function patchProjection() {
  const path = new URL('../src/workspace/engineering-loads/empirical-result-overlay.js', import.meta.url);
  let source = readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    "    pickIdentity: {\n      objectKind: 'result',\n",
    `    pickTarget: {
      modelRole: 'result',
      objectKind: 'result',
      objectId: overlayId,
      nodeId: '',
      supportId: result.supportSiteId,
      restraintId: result.restraintId,
      workspaceEntityIds: [...(result.sourceEntityIds || [])],
    },
    pickIdentity: {
      objectKind: 'result',
`,
    'projection pick target',
  );
  writeFileSync(path, source);
}

function patchRenderer() {
  const path = new URL('../src/workspace/topology-edit/topology-edit-empirical-result-renderer-v1.js', import.meta.url);
  let source = readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    "  const geometry = new THREE.EdgesGeometry(\n    new THREE.SphereGeometry(ZERO_FORCE_MARKER_RADIUS_MM, 8, 6),\n    1,\n  );\n",
    `  const sphere = new THREE.SphereGeometry(ZERO_FORCE_MARKER_RADIUS_MM, 8, 6);
  const geometry = new THREE.EdgesGeometry(sphere, 1);
  sphere.dispose();
`,
    'zero force source geometry disposal',
  );
  source = replaceOnce(
    source,
    "    renderRole: EMPIRICAL_RESULT_FORCE_ARROW_ROLE,\n    resultType: arrow.resultType,\n",
    `    renderRole: EMPIRICAL_RESULT_FORCE_ARROW_ROLE,
    objectKind: 'result',
    objectId: arrow.overlayId,
    entityId: arrow.entityId,
    resultType: arrow.resultType,
`,
    'direct result pick identity',
  );
  writeFileSync(path, source);
}

function patchLoadCalcController() {
  const path = new URL('../src/workspace/load-calc-consumer-controller.js', import.meta.url);
  let source = readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    "        overlaySnapshot: empiricalResultOverlayStore.getSnapshot(),\n      };\n",
    "        overlaySnapshot: empiricalResultOverlayStore.getSnapshot(),\n        selectedEntityId: this.context?.selectedEntityId || null,\n      };\n",
    'selected entity view state',
  );
  writeFileSync(path, source);
}

function patchScenarioView() {
  const path = new URL('../src/workspace/engineering-loads/empirical-load-calc-scenario-view.js', import.meta.url);
  let source = readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    "  const { proposal } = normalizeState(state);\n  const rows = proposal?.adaptedRequest?.restraintOccurrences || [];\n",
    "  const { proposal, selectedEntityId } = normalizeState(state);\n  const rows = proposal?.adaptedRequest?.restraintOccurrences || [];\n",
    'restraint selected entity',
  );
  source = replaceOnce(
    source,
    "            <tbody>${rows.map(restraintRow).join('')}</tbody>\n",
    "            <tbody>${rows.map((row) => restraintRow(row, selectedEntityId)).join('')}</tbody>\n",
    'restraint row selected entity',
  );
  source = replaceOnce(
    source,
    "  const { execution, snapshot } = normalizeState(state);\n",
    "  const { execution, snapshot, selectedEntityId } = normalizeState(state);\n",
    'result selected entity',
  );
  source = replaceOnce(
    source,
    "      ${cases.length ? cases.map(resultCase).join('') : emptyState(\n",
    "      ${cases.length ? cases.map((row) => resultCase(row, selectedEntityId)).join('') : emptyState(\n",
    'result case selected entity',
  );
  source = replaceOnce(
    source,
    "  const { snapshot, proposal, authorization, execution } = normalizeState(state);\n",
    "  const { snapshot, proposal, authorization, execution, overlaySnapshot } = normalizeState(state);\n",
    'evidence overlay snapshot state',
  );
  source = replaceOnce(
    source,
    "    authorization,\n    execution: execution ? {\n",
    "    authorization,\n    resultOverlay: overlaySnapshot,\n    execution: execution ? {\n",
    'evidence overlay snapshot',
  );
  source = replaceOnce(
    source,
    "function restraintRow(row) {\n  return `<tr data-restraint-id=\"${escapeHtml(row.restraintId)}\" data-support-site-id=\"${escapeHtml(row.supportSiteId)}\">\n",
    `function restraintRow(row, selectedEntityId) {
  const selected = rowMatchesEntity(row, selectedEntityId);
  return \`<tr data-restraint-id="\${escapeHtml(row.restraintId)}" data-support-site-id="\${escapeHtml(row.supportSiteId)}" data-viewport-selected="\${selected}"\${selected ? ' class="engineering-table__row--selected"' : ''}>\n`,
    'restraint row selection markup',
  );
  source = replaceOnce(
    source,
    "function resultCase(row) {\n",
    "function resultCase(row, selectedEntityId) {\n",
    'result case signature',
  );
  source = replaceOnce(
    source,
    "      <tbody>${(row.supportResults || []).map(resultRow).join('')}</tbody>\n",
    "      <tbody>${(row.supportResults || []).map((result) => resultRow(result, selectedEntityId)).join('')}</tbody>\n",
    'result row selected entity',
  );
  source = replaceOnce(
    source,
    "function resultRow(row) {\n  const force = row.globalReaction?.forceN || {};\n",
    `function resultRow(row, selectedEntityId) {
  const selected = rowMatchesEntity(row, selectedEntityId);
  const force = row.globalReaction?.forceN || {};
`,
    'result row selection state',
  );
  source = replaceOnce(
    source,
    "  return `<tr data-result-restraint-id=\"${escapeHtml(row.restraintId)}\">\n",
    "  return `<tr data-result-restraint-id=\"${escapeHtml(row.restraintId)}\" data-viewport-selected=\"${selected}\"${selected ? ' class=\"engineering-table__row--selected\"' : ''}>\n",
    'result row selection markup',
  );
  source = replaceOnce(
    source,
    "    execution: state?.execution || null,\n  };\n}\n",
    `    execution: state?.execution || null,
    overlaySnapshot: state?.overlaySnapshot || null,
    selectedEntityId: state?.selectedEntityId || null,
  };
}

function rowMatchesEntity(row, selectedEntityId) {
  if (!selectedEntityId) return false;
  return row.hostEntityId === selectedEntityId
    || row.hostSourceEntityId === selectedEntityId
    || (row.sourceEntityIds || []).includes(selectedEntityId);
}
`,
    'normalized selection state and matcher',
  );
  writeFileSync(path, source);
}

function patchTest() {
  const path = new URL('../scripts/empirical-result-overlay-check.mjs', import.meta.url);
  let source = readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    "assert(proxies.every((object) => object.userData.objectKind === 'result'));\n",
    "assert(proxies.every((object) => object.userData.objectKind === 'result'));\nassert(proxies.every((object) => object.userData.pickTarget?.objectKind === 'result'));\nassert(proxies.every((object) => object.userData.pickTarget?.workspaceEntityIds?.length === 1));\n",
    'result pick target checks',
  );
  writeFileSync(path, source);
}

function replaceOnce(value, before, after, label) {
  const count = value.split(before).length - 1;
  assert.equal(count, 1, `${label}: expected one source match, found ${count}`);
  return value.replace(before, after);
}
