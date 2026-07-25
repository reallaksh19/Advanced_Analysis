import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const modelUrl = pathToFileURL(path.join(root, 'src/calc-workspace/workspaceModel.js')).href;
const engineUrl = pathToFileURL(path.join(root, 'src/calc-workspace/supportLoadEngine.js')).href;
const {
  RVM_SELECTED_GEOMETRY_WORKSPACE_PACKAGE_SCHEMA,
  flattenDynamicProperties,
  normalizeCalculationWorkspacePackage,
  renderableWorkspaceObjects,
} = await import(modelUrl);
const {
  buildSupportLoadModel,
  calculateSupportLoads,
  normalizeSupportLoadProfile,
  SUPPORT_LOAD_INPUT_SCHEMA,
} = await import(engineUrl);

const packageJson = {
  schema: RVM_SELECTED_GEOMETRY_WORKSPACE_PACKAGE_SCHEMA,
  source: {
    app: '3D_Viewer',
    sourceModelName: 'BM_CII',
    sourceFileName: 'BM_CII.rvm',
    scopeMode: 'selected',
    capturedAt: '2026-06-24T00:00:00.000Z',
  },
  axisTransform: { verticalAxis: 'Y', northAxis: 'Z', handedness: 'right' },
  geometry: {
    objects: [
      {
        id: 'PIPE-ACCESS-8',
        name: 'Pipe Access 8',
        type: 'PIPE',
        sourcePath: '/UNIT/8-P25168',
        apos: { x: 0, y: 0, z: 0 },
        lpos: { x: 10750, y: 0, z: 0 },
        sourceAttributes: {
          LINE_NO: '8"-P25168-61502-01',
          DIAMETER: 219.075,
          WALL_THICK: 12.7,
          TEMP_EXP_C1: 100,
          FLUID_WT_OPE_KG_M: 9.93657505285411,
          FLUID_WT_HYD_KG_M: 9.93657505285411,
          UNIT_PIPE_WT_KG_M: 100,
        },
        attributes: {
          enrichment: {
            lineList: { lineNo: '8"-P25168-61502-01', temp1C: 100 },
            pipingClass: { className: '61502', wallThicknessMm: 12.7 },
            weight: { unitPipeWeightKgPerM: 100 },
            audit: { confidence: 1, missing: [], conflicts: [], needsReview: false },
          },
        },
      },
    ],
    supports: [],
    branches: [{ id: 'branch:access', lineNo: '8"-P25168-61502-01', objectIds: ['PIPE-ACCESS-8'], pipeCount: 1 }],
  },
  enrichment: {
    stats: { objects: 1, resolved: 1, conflicts: 0, missing: 0, approximate: 0 },
    diagnostics: [],
  },
  packageHash: 'check-hash',
};

const sourceTextBefore = JSON.stringify(packageJson);
const workspace = normalizeCalculationWorkspacePackage(packageJson, 'check-fixture', '2026-06-24T00:00:00.000Z');
assert.strictEqual(workspace.schema, 'calculation-workspace/v1');
assert.strictEqual(workspace.summary.objects, 1);
assert.strictEqual(workspace.summary.pipes, 1);
assert.strictEqual(JSON.stringify(packageJson), sourceTextBefore, 'import must not mutate package JSON');
assert.ok(Object.isFrozen(workspace.dataset.objects[0]), 'imported workspace objects must be frozen');

const props = flattenDynamicProperties(workspace.dataset.objects[0]);
assert.ok(props.some((row) => row.path === 'sourceAttributes.WALL_THICK'));
assert.ok(props.some((row) => row.path === 'attributes.enrichment.weight.unitPipeWeightKgPerM'));

const renderModel = renderableWorkspaceObjects(workspace);
assert.strictEqual(renderModel.objects.length, 1);
assert.strictEqual(renderModel.objects[0].lengthMm, 10750);

const supportLoad = buildSupportLoadModel(workspace, '2026-06-24T00:00:00.000Z');
const input = supportLoad.inputsByPipeId['PIPE-ACCESS-8'];
assert.strictEqual(input.schema, SUPPORT_LOAD_INPUT_SCHEMA);
assert.strictEqual(input.readiness.readyForLineStop, true);
assert.ok(Array.isArray(supportLoad.logs), 'support-load model must expose calculation logs');
assert.ok(supportLoad.formulaText.includes('OPE_V_A'), 'support-load model must expose equations');
const customProfile = normalizeSupportLoadProfile({ guideSpanLoadMultiplier: 0.7, lineStopIdExpression: 'D_MINUS_2WT' });
assert.strictEqual(customProfile.guideSpanLoadMultiplier, 0.7);
assert.strictEqual(customProfile.lineStopIdExpression, 'D_MINUS_2WT');

const benchmarkInput = {
  schema: SUPPORT_LOAD_INPUT_SCHEMA,
  sourceObjectId: 'ACCESS-BENCH',
  identity: { lineNo: '8"-P25168-61502-01', branchKey: 'access', nps: 8, pipeOdMm: 219.075 },
  pipePhysical: { wallThicknessMm: 12.7, unitPipeWtKgPerM: 100 },
  process: { tempExpC1: 100, fluidWtOpeKgPerM: 9.93657505285411, fluidWtHydKgPerM: 9.93657505285411 },
  spans: { autoSpanMm: 10750, depSpanMm: 10750 },
  readiness: { missing: [] },
};
const result = calculateSupportLoads(benchmarkInput, '2026-06-24T00:00:00.000Z');
assert.strictEqual(result.vertical.opeVDep, 13000);
assert.strictEqual(result.guide.roundedGuideHDep, 650);
assert.strictEqual(result.guide.guideHDep, 3900);
assert.strictEqual(result.lineStop.lineStopH, 8800);

const files = [
  'src/calc-workspace/CalculationWorkspaceTab.jsx',
  'src/calc-workspace/WorkspaceCanvas.jsx',
  'src/calc-workspace/WorkspaceLoadCalculationPanel.jsx',
  'src/calc-workspace/WorkspacePropertyPanel.jsx',
  'src/calc-workspace/WorkspaceLoadHud.jsx',
  'src/App.jsx',
  'src/components/TopNav.jsx',
];
const texts = Object.fromEntries(files.map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
assert.ok(texts['src/components/TopNav.jsx'].includes("id: 'workspace'"));
assert.ok(texts['src/components/TopNav.jsx'].includes("name: '3D Calc'"));
assert.ok(texts['src/components/TopNav.jsx'].includes("name: 'Pipe Solver'"));
assert.ok(texts['src/App.jsx'].includes('<CalculationWorkspaceTab />'));
assert.ok(texts['src/App.jsx'].includes('<WorkspaceHandoffBridge />'));
assert.ok(texts['src/calc-workspace/CalculationWorkspaceTab.jsx'].includes('Load Calculation'));
assert.ok(texts['src/calc-workspace/CalculationWorkspaceTab.jsx'].includes('WorkspaceLoadCalculationPanel'));
assert.ok(texts['src/calc-workspace/WorkspaceLoadCalculationPanel.jsx'].includes('Selected Pipe Preview'));
assert.ok(texts['src/calc-workspace/WorkspaceLoadCalculationPanel.jsx'].includes('Factors'));
assert.ok(texts['src/calc-workspace/WorkspaceLoadCalculationPanel.jsx'].includes('Equations'));
assert.ok(texts['src/calc-workspace/WorkspaceLoadCalculationPanel.jsx'].includes('Calculation Logs'));
assert.ok(texts['src/calc-workspace/WorkspacePropertyPanel.jsx'].includes('flattenDynamicProperties'));
assert.ok(texts['src/calc-workspace/WorkspaceLoadHud.jsx'].includes('VerticalN_A'));
assert.ok(texts['src/calc-workspace/WorkspaceLoadHud.jsx'].includes('selectedWorkspaceObject'));
assert.ok(!texts['src/calc-workspace/WorkspaceLoadHud.jsx'].includes('summaryResult'));

console.log('Calculation Workspace check passed');
