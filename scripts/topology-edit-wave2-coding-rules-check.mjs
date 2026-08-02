import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTROLLER = 'src/workspace/topology-edit-3d-view-controller.js';
const MODULES = Object.freeze([
  'src/workspace/topology-edit/topology-edit-component-evidence.js',
  'src/workspace/topology-edit/topology-edit-edge-geometry.js',
  'src/workspace/topology-edit/topology-edit-fitting-geometry.js',
  'src/workspace/topology-edit/topology-edit-geometry-math.js',
  'src/workspace/topology-edit/topology-edit-junction-geometry.js',
  'src/workspace/topology-edit/topology-edit-picking-contract.js',
  'src/workspace/topology-edit/topology-edit-render-model.js',
  'src/workspace/topology-edit/topology-edit-viewport-backend.js',
  'src/workspace/topology-edit/topology-edit-viewport-renderer.js',
  'src/workspace/topology-edit/topology-edit-visual-component-factory.js',
  'src/workspace/topology-edit/topology-edit-visual-policy.js',
  'src/workspace/topology-edit/topology-edit-visual-projector.js',
  'src/workspace/topology-edit/topology-edit-visual-session.js',
  'src/workspace/topology-edit/support-restraint-family.js',
  'src/workspace/topology-edit/support-restraint-geometry.js',
  'src/workspace/topology-edit/support-restraint-projector.js',
  'src/workspace/topology-edit/visual-geometry-contract.js',
]);
const RENDERER_MODULES = new Set([
  'src/workspace/topology-edit/topology-edit-viewport-backend.js',
  'src/workspace/topology-edit/topology-edit-viewport-renderer.js',
]);
const PURE_MODULES = MODULES.filter((file) => (
  !file.endsWith('topology-edit-picking-contract.js') && !RENDERER_MODULES.has(file)
));

async function source(file) {
  return readFile(path.join(ROOT, file), 'utf8');
}

function physicalLines(text) {
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}

function stripCommentsAndStrings(text) {
  let result = '';
  let mode = 'code';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (mode === 'line') {
      if (char === '\n') { mode = 'code'; result += '\n'; } else result += ' ';
      continue;
    }
    if (mode === 'block') {
      if (char === '*' && next === '/') { result += '  '; index += 1; mode = 'code'; }
      else result += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (mode !== 'code') {
      if (char === '\\') { result += '  '; index += 1; continue; }
      if ((mode === 'single' && char === "'")
        || (mode === 'double' && char === '"')
        || (mode === 'template' && char === '`')) mode = 'code';
      result += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (char === '/' && next === '/') { result += '  '; index += 1; mode = 'line'; continue; }
    if (char === '/' && next === '*') { result += '  '; index += 1; mode = 'block'; continue; }
    if (char === "'") mode = 'single';
    else if (char === '"') mode = 'double';
    else if (char === '`') mode = 'template';
    result += mode === 'code' ? char : ' ';
  }
  return result;
}

function functionStarts(lines) {
  const patterns = [
    /^\s*(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
    /^\s{2}([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*\{/,
  ];
  return lines.flatMap((line, index) => {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) return [{ name: match[1], start: index }];
    }
    return [];
  });
}

function functionEnd(lines, start) {
  let depth = 0;
  let opened = false;
  for (let index = start; index < lines.length; index += 1) {
    for (const char of lines[index]) {
      if (char === '{') { depth += 1; opened = true; }
      if (char === '}') depth -= 1;
    }
    if (opened && depth === 0) return index;
  }
  return lines.length - 1;
}

function longFunctions(file, text) {
  const stripped = stripCommentsAndStrings(text).split('\n');
  const original = text.split('\n');
  return functionStarts(stripped).map(({ name, start }) => {
    const end = functionEnd(stripped, start);
    const lines = original.slice(start, end + 1).filter((row) => row.trim()).length;
    return { file, name, lines };
  }).filter((row) => row.lines > 40);
}

function assertNamedExports(file, text) {
  assert.equal(/\bexport\s+default\b/.test(text), false, `${file} must use named exports.`);
}

function assertPureContainment(file, text) {
  for (const token of ['WorkspaceState', 'commitDraftToWorkspace', 'TopologyEditAutofixController', 'SequentialCommandGateway']) {
    assert.equal(text.includes(token), false, `${file} must not reference ${token}.`);
  }
  for (const token of ['Math.random', 'Date.now']) {
    assert.equal(text.includes(token), false, `${file} must not derive authority from ${token}.`);
  }
  assert.equal(/from\s+['"]three['"]/.test(text), false, `${file} must remain Three.js-independent.`);
}

async function assertProductionConsumption() {
  const controller = await source(CONTROLLER);
  for (const token of ['TopologyEditCertifiedSession', 'buildTopologyEditVisualSession', 'createDimensionAuthority']) {
    assert.ok(controller.includes(token), `Production controller must consume ${token}.`);
  }
  for (const token of ['commitDraftToWorkspace', 'TopologyEditAutofixController', 'Date.now']) {
    assert.equal(controller.includes(token), false, `Production controller must not reference ${token}.`);
  }
  const visualSession = await source('src/workspace/topology-edit/topology-edit-visual-session.js');
  for (const token of ['deriveTopologyVisualGeometry', 'deriveAllSupportRestraintGeometry', 'projectSupportGeometryToViewport']) {
    assert.ok(visualSession.includes(token), `Visual session must consume ${token}.`);
  }
  const fitting = await source('src/workspace/topology-edit/topology-edit-fitting-geometry.js');
  for (const token of ['deriveVisualEdge', 'deriveVisualJunction']) {
    assert.ok(fitting.includes(token), `Fitting orchestrator must consume ${token}.`);
  }
  const backend = await source('src/workspace/topology-edit/topology-edit-viewport-backend.js');
  assert.ok(backend.includes('segmentGeometry'), 'Viewport backend must consume renderer helpers.');
  assert.ok(backend.includes('setPresentationSectionPlanes'), 'Viewport backend must preserve section-plane authority.');
  await access(path.join(ROOT, 'src/workspace/topology-edit/topology-edit-viewport-renderer.js'));
}

export async function verifyTopologyEditWave2CodingRules() {
  const modules = [];
  const functions = [];
  for (const file of MODULES) {
    const text = await source(file);
    const lines = physicalLines(text);
    assert.ok(lines <= 300, `${file} has ${lines} physical lines; maximum is 300.`);
    assertNamedExports(file, text);
    modules.push({ file, lines });
    functions.push(...longFunctions(file, text));
  }
  for (const file of PURE_MODULES) assertPureContainment(file, await source(file));
  await assertProductionConsumption();
  assert.deepEqual(functions, [], `Functions above 40 logical lines require refactoring:\n${JSON.stringify(functions, null, 2)}`);
  return Object.freeze({ modules, functionExceptions: [] });
}

async function main() {
  const evidence = await verifyTopologyEditWave2CodingRules();
  console.log(JSON.stringify(evidence, null, 2));
  console.log('TOPOLOGY EDIT WAVE 2 CODING RULES CHECK PASSED');
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`TOPOLOGY EDIT WAVE 2 CODING RULES CHECK FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
