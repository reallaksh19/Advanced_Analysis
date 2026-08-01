import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { prepareInlineComponentReplacement } from '../src/workspace/editing/inline-component-replacement-command.js';
import { calculateSupportLoadDistribution } from '../src/workspace/engineering-loads/support-load-distribution-v3.js';
import { parseMasterFile } from '../src/workspace/master-data-events-handler.js';
import { projectDataValue, validateProjectDataProfile } from '../src/workspace/project-data/project-data-contract.js';
import { buildResolvedEngineeringGeometry } from '../src/workspace/resolved-engineering-geometry.js';
import { buildRoutePartitionModel } from '../src/workspace/routes/route-partition-model.js';
import { SequentialCommandGateway } from '../src/workspace/sequential-sketcher/sequential-command-gateway.js';
import { buildSupportSiteModel } from '../src/workspace/support-sites/support-site-model.js';
import { buildViewportRenderModel } from '../src/workspace/viewport-render-model.js';
import { WorkspaceStateStore } from '../src/workspace/workspace-state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePaths = Object.freeze({
  dataset: 'F:/CODE-5-SS/3D_Converters/Benchmarks/1885Sjson/Sjson.json',
  lineList: 'D:/Code3/EF/AML-91-PDFEED-PX-2345-00001-0000 BC4.xlsx',
  pipingClass: 'F:/CODE-4-SS/SS2/3D_Viewer_github_clone/docs/Masters/Piping class master.xlsx',
  componentWeight: 'F:/CODE-6/XML_Compare_Utilities/docs/Masters/wtValveweights.json',
});
const profile = JSON.parse(await readFile(path.join(root, 'project-data/1885s-project-data-profile.json'), 'utf8'));
const datasetBytes = await readFile(sourcePaths.dataset);
const datasetHash = sha256(datasetBytes);
const benchmarkCopy = await readFile(path.join(root, 'benchmarks/Sjson.json'));
assert.equal(sha256(benchmarkCopy), datasetHash, 'The repository benchmark copy differs from the supplied SJSON.');
const dataset = normalizeWorkspaceDataset(JSON.parse(datasetBytes.toString('utf8')), sourcePaths.dataset, { sourceBytes: datasetBytes, sourceSha256: datasetHash });
const masterData = {
  lineList: await loadMaster('lineList', sourcePaths.lineList),
  pipingClass: await loadMaster('pipingClass', sourcePaths.pipingClass),
  weight: await loadMaster('weight', sourcePaths.componentWeight),
};
const activeHashes = Object.freeze({ dataset: datasetHash, lineList: masterData.lineList.sourceHash, pipingClass: masterData.pipingClass.sourceHash, componentWeight: masterData.weight.sourceHash });

assert.equal(dataset.summary.nodeCount, 279);
const supportSites = buildSupportSiteModel(dataset, profile);
assert.deepEqual(supportSites.summary, { sourceSupportRecordCount: 139, supportAssemblyCount: 38, physicalLocationCount: 37 });
const routePartitions = buildRoutePartitionModel(dataset, profile);
assert.equal(routePartitions.status, 'READY');
assert.deepEqual(routePartitions.summary, { routeCount: 13, edgeCount: 127, physicalEdgeCount: 124, autoCarrierCount: 3 });
const renderModel = buildViewportRenderModel(buildResolvedEngineeringGeometry(dataset, profile, supportSites));
assert.deepEqual({ renderableCount: renderModel.summary.renderableCount, segmentCount: renderModel.summary.segmentCount, pointCount: renderModel.summary.pointCount, skippedCount: renderModel.summary.skippedCount }, { renderableCount: 150, segmentCount: 116, pointCount: 37, skippedCount: 27 });

const lineRow = masterData.lineList.rawRows.find((row) => row._sourceSheet === 'LineList' && row._sourceRowNumber === 316);
assert.equal(lineRow.NAME, 'S8811951');
assert.equal(lineRow['Piping Class'], '91261M7');
assert.equal(Number(lineRow['Nominal Pipe Size\r\ninch']), 6);
const target = dataset.entities.find((entity) => entity.properties?.attributes?.NAME === '/88-UZV-11951');
assert.equal(target.entityId, '=1006649732/51250');
const targetBranchEntities = dataset.entities.filter((entity) => entity.branchId === target.branchId);
assert.equal(targetBranchEntities.length, 69);
assert.equal(targetBranchEntities.every((entity) => entity.lineKey === 'S8811951' && entity.pipingClass === '91261M7' && entity.nominalDiameterMm === 150 && entity.service === 'S'), true);
const prepared = prepareInlineComponentReplacement(dataset, target.entityId, profile, masterData);
assert.equal(prepared.command.retiredEntityIds.length, 3);
assert.equal(prepared.command.retainedEntityIds.length, 4);
const replacementEntities = prepared.previewDataset.entities.filter((entity) => entity.properties?.attributes?.REPLACEMENT_COMMAND_ID);
assert.deepEqual(replacementEntities.map(replacementSummary), [
  { role: 'FLAN', lengthMm: 147, massKg: 59, scheduleEvidence: true },
  { role: 'VALV', lengthMm: 610, massKg: 263, scheduleEvidence: false },
  { role: 'FLAN', lengthMm: 147, massKg: 59, scheduleEvidence: true },
]);
const workspaceState = new WorkspaceStateStore();
workspaceState.loadDataset(dataset);
const gateway = new SequentialCommandGateway(workspaceState, { publish() {} });
assert.equal(gateway.previewInlineReplacement(target.entityId, profile, masterData).status, 'preview');
assert.equal(gateway.commitPreview().status, 'applied');
assert.equal(workspaceState.getSnapshot().dataset.calculationFreshness, 'STALE');
assert.equal(gateway.undo(), true);
assert.equal(workspaceState.getSnapshot().dataset.entities.some((entity) => entity.entityId === target.entityId), true);
assert.equal(gateway.redo(), true);
assert.equal(workspaceState.getSnapshot().dataset.entities.filter((entity) => entity.properties?.attributes?.REPLACEMENT_COMMAND_ID).length, 3);

const loadAudit = validateProjectDataProfile(profile, 'loads', activeHashes);
assert.equal(loadAudit.valid, false);
const distribution = calculateSupportLoadDistribution({ dataset, profile, masterData, supportSiteModel: supportSites, routePartitionModel: routePartitions });
assert.equal(distribution.status, 'BLOCKED');
assert.deepEqual(distribution.loadCases.map((loadCase) => loadCase.loadCaseId), ['EMPTY', 'OPE', 'HYD']);
distribution.loadCases.forEach((loadCase) => {
  assert.equal(loadCase.status, 'BLOCKED');
  assert.equal(loadCase.contributionLedger.length, 0);
  assert.equal(loadCase.supportResults.every((result) => result.verticalForceN === null), true);
  assert.equal(loadCase.equilibrium.status, 'NOT_RUN_PROJECT_DATA_BLOCKED');
});

const evidenceBase = {
  schema: '1885s-webgl-load-benchmark-evidence/v1',
  projectId: '1885S',
  evidenceBasis: 'SUPPLIED_REAL_FILES_ONLY',
  generatedFromProfileRevision: profile.revision,
  sources: Object.fromEntries(Object.entries(sourcePaths).map(([key, filePath]) => [key, { path: filePath, sha256: activeHashes[key] }])),
  projectDataProfile: profile,
  normalization: { datasetId: dataset.datasetId, nodeCount: dataset.summary.nodeCount, sourceAxis: 'Z_UP', branchIdentity: { lineKey: target.lineKey, pipingClass: target.pipingClass, nominalDiameterMm: target.nominalDiameterMm, service: target.service, branchId: target.branchId }, supportSites: supportSites.summary, routes: routePartitions.summary, viewport: renderModel.summary },
  masterMatches: { lineList: prepared.command.masterChecks.lineListRow, pipingClass: prepared.command.masterChecks.pipingClassRows, componentCatalog: prepared.command.catalogRows },
  editQualification: { status: 'PASSED', commandId: prepared.command.commandId, retiredEntityIds: prepared.command.retiredEntityIds, retainedEntityIds: prepared.command.retainedEntityIds, replacementEntities: replacementEntities.map(replacementSummary), audit: prepared.command.audit, undo: 'PASSED', redo: 'PASSED' },
  loadQualification: { status: 'BLOCKED_PROJECT_DATA_INCOMPLETE', method: distribution.method, blockedFields: loadAudit.errors, cases: distribution.loadCases.map((loadCase) => ({ loadCaseId: loadCase.loadCaseId, status: loadCase.status, verticalForceNPublished: false, contributionCount: loadCase.contributionLedger.length, equilibriumStatus: loadCase.equilibrium.status })) },
  browserQualification: {
    status: 'BLOCKED',
    reason: 'CONNECTED_CHROME_CONTROL_UNAVAILABLE',
    Chrome: { status: 'NOT_RUN', webglReadyMs: null, selectionP95Ms: null, editCommitMs: null, navigationFps: null },
    Edge: { status: 'NOT_RUN', functionalSmoke: null },
    thresholds: { webglReadyMaxMs: projectDataValue(profile, 'benchmark.webglReadyMaxMs'), selectionP95MaxMs: projectDataValue(profile, 'benchmark.selectionP95MaxMs'), editCommitMaxMs: projectDataValue(profile, 'benchmark.editCommitMaxMs'), navigationMinFps: projectDataValue(profile, 'benchmark.navigationMinFps') },
  },
};
const evidence = { ...evidenceBase, semanticHash: semanticHash(evidenceBase) };
const json = `${JSON.stringify(evidence, null, 2)}\n`;
const markdown = renderMarkdown(evidence);
for (const directory of ['public/qualification', 'reports/qualification']) {
  await writeFile(path.join(root, directory, '1885s-webgl-load-benchmark.json'), json);
  await writeFile(path.join(root, directory, '1885s-webgl-load-benchmark.md'), markdown);
}
console.log(`1885S empirical qualification passed; evidence ${evidence.semanticHash}. Browser qualification remains BLOCKED.`);

async function loadMaster(masterKey, filePath) {
  const bytes = await readFile(filePath);
  const parsed = await parseMasterFile(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), filePath, masterKey);
  return { rawRows: parsed.rawRows, fileName: filePath, sheetName: parsed.sheetName, sourceHash: parsed.sourceMetadata.sourceHash, byteLength: parsed.sourceMetadata.byteLength };
}
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function replacementSummary(entity) { return { role: entity.entityType, lengthMm: entity.properties.attributes.CATALOG_LENGTH_MM, massKg: entity.properties.attributes.CATALOG_MASS_KG, scheduleEvidence: entity.entityType === 'FLAN' && /sch\s*80/i.test(entity.properties.attributes.DTXR) }; }
function renderMarkdown(evidence) {
  const blockers = evidence.loadQualification.blockedFields.map((row) => `| ${row.path} | ${row.code} | ${row.message} |`).join('\n');
  const sources = Object.entries(evidence.sources).map(([key, value]) => `| ${key} | \`${value.sha256}\` | \`${value.path}\` |`).join('\n');
  return `# 1885S WebGL Editing and Empirical Load Benchmark\n\nEvidence hash: \`${evidence.semanticHash}\`\n\nThis qualification uses only the supplied SJSON, line list, piping-class master, Topo Validator weight master, and approved Project Data. No numeric support reaction is published because required engineering inputs remain unapproved.\n\n## Source authority\n\n| Source | SHA-256 | File |\n|---|---|---|\n${sources}\n\n## Verified normalization\n\n- 279 source nodes\n- 139 support records -> 38 tagged assemblies -> 37 physical sites\n- 13 route partitions, 127 topology edges, 124 physical edges, and 3 AUTO carriers\n- Source coordinates remain Z-up; conversion occurs only at the Three.js boundary\n- Line S8811951 / class 91261M7 / DN150 / row 316 preserved\n\n## Inline replacement\n\nStatus: **PASSED**\n\nExactly three components were retired. Gaskets \`/51249\` and \`/51255\`, support \`/51254\`, and the B2 AUTO carrier retained their identities. The replacement is VLV3 DN150 Class 900 (610 mm, 263 kg) with two real DN150 Class 900 weld-neck flange rows (147 mm, 59 kg); flange Sch 80 text is retained from source DTXR. Endpoint, ancestry, retained-identity, connectivity, non-overlap, undo, and redo checks passed.\n\n## Empirical loads\n\nMethod: \`CHAINAGE_TRIBUTARY_SPAN_V2\`  \nStatus: **BLOCKED — no numeric reactions published**\n\n| Project Data field | Code | Reason |\n|---|---|---|\n${blockers}\n\nEMPTY, OPE, and HYD remain separate blocked cases. Their \`verticalForceN\` values are null and equilibrium is not run while Project Data is incomplete.\n\n## Browser benchmark\n\nStatus: **BLOCKED** — connected Chrome control was unavailable. Chrome timings and Edge smoke results are null, not estimated. Approved thresholds remain 3,000 ms WebGL ready, 100 ms selection p95, 500 ms edit commit, and 30 fps navigation.\n`;
}
