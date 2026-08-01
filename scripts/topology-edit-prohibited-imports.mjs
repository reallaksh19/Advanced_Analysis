import assert from 'node:assert/strict';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const SRC_ROOT = path.join(ROOT, 'src');
const DISPOSITION_PATH = path.join(
  ROOT,
  'src/vendor/topology-edit/behavior-disposition.json',
);

const SEQUENTIAL_GATEWAY =
  'src/workspace/sequential-sketcher/sequential-command-gateway.js';

const LOAD_DATASET_ALLOWLIST = new Set([
  'src/workspace/topology-edit/topology-edit-commit-service.js',
  'src/workspace/topology-edit/topology-edit-rollback-service.js',
]);

const PROHIBITED_SOURCE_PATTERNS = Object.freeze([
  {
    name: 'non-deterministic identity generation',
    pattern: /\bMath\.random\s*\(/,
  },
  {
    name: 'direct workspace entity-array replacement',
    pattern: /\bdataset\.entities\s*=/,
  },
  {
    name: 'remote runtime module dependency',
    pattern: /https?:\/\/(?:esm\.sh|unpkg\.com|cdn\.jsdelivr\.net)\b/,
  },
  {
    name: 'runtime sibling-repository dependency',
    pattern: /(?:^|['"`])\.\.\/XML_Compare_Utilities(?:\/|['"`])/m,
  },
]);

function repositoryPath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join('/');
}

async function walkJavaScript(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkJavaScript(child));
    else if (/\.(?:js|mjs)$/.test(entry.name)) files.push(child);
  }
  return files;
}

function importSpecifiers(source) {
  const specifiers = new Set();
  const staticImport =
    /(?:^|[;\n])\s*(?:import|export)\s+(?:[\s\S]*?\s+from\s*)?['"]([^'"]+)['"]/g;
  const dynamicImport = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const expression of [staticImport, dynamicImport]) {
    expression.lastIndex = 0;
    let match;
    while ((match = expression.exec(source))) specifiers.add(match[1]);
  }
  return [...specifiers];
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function resolveRelativeModule(importer, rawSpecifier) {
  if (!rawSpecifier.startsWith('.')) return null;

  const specifier = rawSpecifier.replace(/[?#].*$/, '');
  const unresolved = path.resolve(path.dirname(importer), specifier);
  const candidates = path.extname(unresolved)
    ? [unresolved]
    : [
        unresolved,
        `${unresolved}.js`,
        `${unresolved}.mjs`,
        path.join(unresolved, 'index.js'),
        path.join(unresolved, 'index.mjs'),
      ];

  for (const candidate of candidates) {
    if (await exists(candidate)) {
      const info = await stat(candidate);
      if (info.isFile() && /\.(?:js|mjs)$/.test(candidate)) return candidate;
    }
  }
  return null;
}

async function buildImportGraph() {
  const files = await walkJavaScript(SRC_ROOT);
  const graph = new Map();

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const dependencies = [];
    for (const specifier of importSpecifiers(source)) {
      const resolved = await resolveRelativeModule(file, specifier);
      if (resolved) dependencies.push(resolved);
    }
    graph.set(file, Object.freeze([...new Set(dependencies)]));
  }

  return graph;
}

function findDependencyPath(graph, roots, target) {
  const queue = roots.map((root) => [root, [root]]);
  const visited = new Set();

  while (queue.length) {
    const [current, chain] = queue.shift();
    if (current === target) return chain;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const dependency of graph.get(current) ?? []) {
      queue.push([dependency, [...chain, dependency]]);
    }
  }
  return null;
}

function reachableFrom(graph, roots) {
  const result = new Set();
  const stack = [...roots];
  while (stack.length) {
    const current = stack.pop();
    if (result.has(current)) continue;
    result.add(current);
    for (const dependency of graph.get(current) ?? []) stack.push(dependency);
  }
  return result;
}

function findCycle(graph, allowedNodes) {
  const state = new Map();
  const stack = [];

  function visit(node) {
    const status = state.get(node) ?? 0;
    if (status === 1) {
      const start = stack.indexOf(node);
      return [...stack.slice(start), node];
    }
    if (status === 2) return null;

    state.set(node, 1);
    stack.push(node);

    for (const dependency of graph.get(node) ?? []) {
      if (!allowedNodes.has(dependency)) continue;
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }

    stack.pop();
    state.set(node, 2);
    return null;
  }

  for (const node of allowedNodes) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return null;
}

export async function verifyTopologyEditImportBoundaries() {
  const disposition = JSON.parse(await readFile(DISPOSITION_PATH, 'utf8'));
  const rootFiles = disposition.modules.map((module) =>
    path.join(ROOT, module.targetPath),
  );

  const graph = await buildImportGraph();
  for (const rootFile of rootFiles) {
    assert.ok(graph.has(rootFile), `Missing import-graph root ${repositoryPath(rootFile)}`);
  }

  const sequentialGatewayPath = path.join(ROOT, SEQUENTIAL_GATEWAY);
  const dependencyPath = findDependencyPath(
    graph,
    rootFiles,
    sequentialGatewayPath,
  );

  assert.equal(
    dependencyPath,
    null,
    dependencyPath
      ? `Canonical Topology Edit dependency reaches SequentialCommandGateway: ${
          dependencyPath.map(repositoryPath).join(' -> ')
        }`
      : '',
  );

  const reachable = reachableFrom(graph, rootFiles);
  const cycle = findCycle(graph, reachable);
  assert.equal(
    cycle,
    null,
    cycle
      ? `Circular import reachable from Topology Edit: ${
          cycle.map(repositoryPath).join(' -> ')
        }`
      : '',
  );

  for (const module of disposition.modules) {
    const source = await readFile(path.join(ROOT, module.targetPath), 'utf8');

    for (const prohibited of PROHIBITED_SOURCE_PATTERNS) {
      assert.ok(
        !prohibited.pattern.test(source),
        `${module.targetPath} contains ${prohibited.name}`,
      );
    }

    if (
      /\bWorkspaceState\.loadDataset\s*\(/.test(source) &&
      !LOAD_DATASET_ALLOWLIST.has(module.targetPath)
    ) {
      throw new Error(
        `${module.targetPath} mutates the live workspace outside the governed commit/rollback allowlist`,
      );
    }
  }

  return Object.freeze({
    topologyEditRoots: rootFiles.length,
    reachableJavaScriptModules: reachable.size,
    sequentialGatewayReachable: false,
    circularImports: 0,
  });
}

async function main() {
  const evidence = await verifyTopologyEditImportBoundaries();
  console.log(JSON.stringify(evidence, null, 2));
  console.log('TOPOLOGY EDIT PROHIBITED IMPORT AND CIRCULARITY CHECK PASSED');
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : '';

if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(
      `TOPOLOGY EDIT PROHIBITED IMPORT AND CIRCULARITY CHECK FAILED: ${error.message}`,
    );
    process.exitCode = 1;
  });
}
