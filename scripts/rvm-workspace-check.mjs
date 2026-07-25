import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const workspaceUrl = pathToFileURL(path.join(root, 'src/calc-extended/workspace/rvmSelectedGeometryWorkspace.js')).href;
const {
  RVM_SELECTED_GEOMETRY_WORKSPACE_PACKAGE_SCHEMA,
  normalizeRvmSelectedGeometryWorkspacePackage,
  workspaceObjectRows,
} = await import(workspaceUrl);

const packageJson = {
  schema: RVM_SELECTED_GEOMETRY_WORKSPACE_PACKAGE_SCHEMA,
  source: {
    app: '3D_Viewer',
    sourceModelName: 'BM_CII',
    sourceFileName: 'BM_CII.rvm',
    scopeMode: 'selected',
    capturedAt: '2026-06-23T00:00:00.000Z',
  },
  axisTransform: { verticalAxis: 'Z', northAxis: 'Y', handedness: 'right' },
  geometry: {
    objects: [
      {
        id: 'PIPE-100-A',
        name: 'Pipe 100',
        type: 'PIPE',
        sourcePath: '/UNIT/LINE-100',
        sourceAttributes: { LINE_NO: '8-L100-STEAM', PIPING_CLASS: '66620M0' },
        attributes: {
          enrichment: {
            lineList: { lineNo: '8-L100-STEAM' },
            pipingClass: { className: '66620M0' },
            audit: { confidence: 1, missing: [], conflicts: [], needsReview: false },
          },
        },
      },
      {
        id: 'SUP-100-A',
        name: 'Support 100',
        type: 'ATTA',
        sourcePath: '/UNIT/LINE-100/SUPPORT',
        sourceAttributes: {},
        attributes: {
          enrichment: {
            audit: { confidence: null, missing: ['lineList'], conflicts: [], needsReview: true },
          },
        },
      },
    ],
    supports: [{ id: 'SUP-100-A', type: 'ATTA' }],
    branches: [{ id: 'branch:1', lineNo: '8-L100-STEAM', objectIds: ['PIPE-100-A'] }],
  },
  enrichment: {
    stats: { objects: 2, resolved: 1, conflicts: 0, missing: 1, approximate: 0 },
    diagnostics: [{ objectId: 'SUP-100-A', objectName: 'Support 100', type: 'ATTA', missing: ['lineList'] }],
  },
  packageHash: 'abc123',
};

const normalized = normalizeRvmSelectedGeometryWorkspacePackage(packageJson, 'script-fixture', '2026-06-23T00:00:00.000Z');
assert.strictEqual(normalized.summary.objects, 2);
assert.strictEqual(normalized.summary.pipes, 1);
assert.strictEqual(normalized.summary.supports, 1);
assert.strictEqual(normalized.summary.branches, 1);
assert.ok(Object.isFrozen(normalized.geometry.objects[0]));

const rows = workspaceObjectRows(normalized, 10);
assert.strictEqual(rows[0].status, 'resolved');
assert.strictEqual(rows[1].status, 'review');
assert.strictEqual(rows[0].lineNo, '8-L100-STEAM');

const files = {
  calcTab: 'src/calc-extended/components/CalcExtendedTab.jsx',
  workspaceTab: 'src/calc-extended/components/RvmWorkspaceTab.jsx',
  workspaceStore: 'src/calc-extended/store/useRvmWorkspaceStore.js',
  workspaceCore: 'src/calc-extended/workspace/rvmSelectedGeometryWorkspace.js',
  extendedStore: 'src/calc-extended/store/useExtendedStore.js',
};
const texts = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(path.join(root, file), 'utf8')]));

assert.ok(texts.calcTab.includes("import RvmWorkspaceTab from './RvmWorkspaceTab';"));
assert.ok(texts.calcTab.includes("setActiveSubTab('workspace')"));
assert.ok(texts.calcTab.includes('<RvmWorkspaceTab />'));
assert.ok(texts.extendedStore.includes("activeSubTab: 'workspace'"));
assert.ok(texts.workspaceTab.includes('RVM_SELECTED_GEOMETRY_POST_MESSAGE_TYPE'));
assert.ok(texts.workspaceTab.includes('PENDING_WORKSPACE_PACKAGE_STORAGE_KEY'));
assert.ok(texts.workspaceStore.includes('normalizeRvmSelectedGeometryWorkspacePackage'));

for (const [key, sourceText] of Object.entries({
  workspaceTab: texts.workspaceTab,
  workspaceStore: texts.workspaceStore,
  workspaceCore: texts.workspaceCore,
})) {
  assert.ok(!/function\s+[^(]*\([^)]*,?\s*[A-Za-z_$][A-Za-z0-9_$]*\s*=/.test(sourceText), `${key} has a default function parameter`);
  assert.ok(!/\.sourceAttributes\s*=/.test(sourceText), `${key} mutates sourceAttributes`);
  assert.ok(!/\.attributes\.enrichment\s*=/.test(sourceText), `${key} mutates live enrichment attributes`);
}

console.log('RVM workspace import shell check passed');
