import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const sourcePath = path.join(
  ROOT,
  'src/core/bucket-b/flange-hub-independent-oracle.js',
);
const outputDirectory = path.join(ROOT, 'reports/bb11-oracle-interface');
const reportPath = path.join(outputDirectory, 'o0-interface-identity-diagnostic.json');
const temporaryPath = path.join(
  ROOT,
  'src/core/bucket-b',
  `.bb11-oracle-interface-${process.pid}.mjs`,
);

const governedBlockMap = `function blockMap(block) {
  const outer = profile(block.profile);
  if (block.kind === 'STRIP') {
    return (u, v) => {`;
const correctedBlockMap = `function blockMap(block) {
  if (block.kind === 'STRIP') {
    const outer = profile(block.profile);
    return (u, v) => {`;
const linearSystemExport =
  'export function solveIndependentOracleLinearSystem({ rows, rhs } = {}) {';
const meshExport = `export function buildIndependentOracleO0MeshDiagnostic() {
  return q4Mesh({ levelId: 'O0', refinement: 1 });
}

${linearSystemExport}`;
const EXPECTED_INTERFACES = [
  ['O-B00', 'O-B01'],
  ['O-B01', 'O-B02'],
  ['O-B02', 'O-B03'],
  ['O-B03', 'O-B04'],
  ['O-B04', 'O-B05'],
  ['O-B05', 'O-B06'],
  ['O-B06', 'O-B07'],
];

await mkdir(outputDirectory, { recursive: true });
const original = await readFile(sourcePath, 'utf8');
assert.equal(occurrences(original, governedBlockMap), 1);
assert.equal(occurrences(original, linearSystemExport), 1);
const transformed = original
  .replace(governedBlockMap, correctedBlockMap)
  .replace(linearSystemExport, meshExport);
await writeFile(temporaryPath, transformed, 'utf8');

let report;
try {
  const moduleUrl = `${pathToFileURL(temporaryPath).href}?run=${Date.now()}`;
  const oracle = await import(moduleUrl);
  const mesh = oracle.buildIndependentOracleO0MeshDiagnostic();
  const nodeById = new Map(mesh.nodes.map((node) => [node.id, node]));
  const blockNodeIds = new Map();
  mesh.elements.forEach((element) => {
    if (!blockNodeIds.has(element.blockId)) blockNodeIds.set(element.blockId, new Set());
    element.nodeIds.forEach((nodeId) => blockNodeIds.get(element.blockId).add(nodeId));
  });
  const interfaces = EXPECTED_INTERFACES.map(([left, right]) => (
    interfaceDiagnostic(left, right, blockNodeIds, nodeById)
  ));
  const components = meshComponents(mesh);
  report = {
    schema: 'bb11-independent-oracle-o0-interface-diagnostic/v1',
    status: 'PASS',
    authority: 'NON_AUTHORIZING_DIAGNOSTIC_ONLY',
    governedOracleSha256: sha256(original),
    transformedOracleSha256: sha256(transformed),
    correction: 'DEFER_PROFILE_RESOLUTION_UNTIL_BLOCK_KIND_IS_STRIP',
    nodeCount: mesh.nodes.length,
    elementCount: mesh.elements.length,
    interfaces,
    components,
    failedInterfaces: interfaces
      .filter((row) => row.exactSharedNodeCount === 0)
      .map((row) => row.interfaceId),
  };
} catch (error) {
  report = {
    schema: 'bb11-independent-oracle-o0-interface-diagnostic/v1',
    status: 'FAIL',
    authority: 'NON_AUTHORIZING_DIAGNOSTIC_ONLY',
    governedOracleSha256: sha256(original),
    transformedOracleSha256: sha256(transformed),
    error: error?.stack ?? String(error),
  };
} finally {
  await rm(temporaryPath, { force: true });
}

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify(report)}\n`);
if (report.status !== 'PASS') process.exitCode = 1;

function interfaceDiagnostic(leftId, rightId, blockNodeIds, nodeById) {
  const leftIds = [...blockNodeIds.get(leftId)];
  const rightIds = [...blockNodeIds.get(rightId)];
  const rightSet = new Set(rightIds);
  const exactShared = leftIds.filter((nodeId) => rightSet.has(nodeId));
  let minimumDistance = Infinity;
  const nearestPairs = [];
  leftIds.forEach((leftNodeId) => rightIds.forEach((rightNodeId) => {
    const left = nodeById.get(leftNodeId);
    const right = nodeById.get(rightNodeId);
    const distance = Math.hypot(left.r - right.r, left.z - right.z);
    if (distance < minimumDistance - 1e-18) {
      minimumDistance = distance;
      nearestPairs.length = 0;
      nearestPairs.push({
        leftNodeId,
        rightNodeId,
        left: { r: left.r, z: left.z },
        right: { r: right.r, z: right.z },
        deltaR: right.r - left.r,
        deltaZ: right.z - left.z,
        distance,
      });
    } else if (Math.abs(distance - minimumDistance) <= 1e-18
      && nearestPairs.length < 10) {
      nearestPairs.push({
        leftNodeId,
        rightNodeId,
        left: { r: left.r, z: left.z },
        right: { r: right.r, z: right.z },
        deltaR: right.r - left.r,
        deltaZ: right.z - left.z,
        distance,
      });
    }
  }));
  const nearDuplicatePairs = [];
  leftIds.forEach((leftNodeId) => rightIds.forEach((rightNodeId) => {
    if (leftNodeId === rightNodeId) return;
    const left = nodeById.get(leftNodeId);
    const right = nodeById.get(rightNodeId);
    const distance = Math.hypot(left.r - right.r, left.z - right.z);
    if (distance <= 1e-6 && nearDuplicatePairs.length < 20) {
      nearDuplicatePairs.push({
        leftNodeId,
        rightNodeId,
        deltaR: right.r - left.r,
        deltaZ: right.z - left.z,
        distance,
      });
    }
  }));
  return {
    interfaceId: `${leftId}/${rightId}`,
    leftBlockId: leftId,
    rightBlockId: rightId,
    exactSharedNodeCount: exactShared.length,
    exactSharedNodeIds: exactShared.sort(),
    minimumDistance,
    nearestPairs,
    nearDuplicatePairs,
  };
}

function meshComponents(mesh) {
  const adjacency = new Map(mesh.nodes.map((node) => [node.id, new Set()]));
  const blockIdsByNode = new Map(mesh.nodes.map((node) => [node.id, new Set()]));
  mesh.elements.forEach((element) => {
    element.nodeIds.forEach((nodeId) => blockIdsByNode.get(nodeId).add(element.blockId));
    element.nodeIds.forEach((left) => element.nodeIds.forEach((right) => {
      if (left !== right) adjacency.get(left).add(right);
    }));
  });
  const visited = new Set();
  const components = [];
  mesh.nodes.forEach((node) => {
    if (visited.has(node.id)) return;
    const stack = [node.id];
    visited.add(node.id);
    const members = [];
    const blockIds = new Set();
    while (stack.length) {
      const nodeId = stack.pop();
      members.push(nodeId);
      blockIdsByNode.get(nodeId).forEach((blockId) => blockIds.add(blockId));
      adjacency.get(nodeId).forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      });
    }
    components.push({
      nodeCount: members.length,
      blockIds: [...blockIds].sort(),
      minimumNodeId: [...members].sort()[0],
    });
  });
  components.sort((left, right) => right.nodeCount - left.nodeCount);
  return {
    componentCount: components.length,
    components,
    accepted: components.length === 1,
  };
}

function occurrences(text, target) {
  return text.split(target).length - 1;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
