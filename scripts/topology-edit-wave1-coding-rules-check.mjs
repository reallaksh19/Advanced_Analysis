import assert from 'node:assert/strict';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTROLLER = 'src/workspace/topology-edit-3d-view-controller.js';
const WORKFLOW = '.github/workflows/topology-edit-wave1.yml';
const NEW_MODULES = Object.freeze([
  'src/workspace/topology-edit/topology-edit-authority-receipt.js',
  'src/workspace/topology-edit/topology-edit-candidate-builder.js',
  'src/workspace/topology-edit/topology-edit-candidate-validator.js',
  'src/workspace/topology-edit/topology-edit-canonical-state.js',
  'src/workspace/topology-edit/topology-edit-certification-service.js',
  'src/workspace/topology-edit/topology-edit-certified-journal.js',
  'src/workspace/topology-edit/topology-edit-certified-session.js',
  'src/workspace/topology-edit/topology-edit-command-contract.js',
  'src/workspace/topology-edit/topology-edit-command-effect-validator.js',
  'src/workspace/topology-edit/topology-edit-command-resolver.js',
  'src/workspace/topology-edit/topology-edit-command-ui.js',
  'src/workspace/topology-edit/topology-edit-journal-service.js',
  'src/workspace/topology-edit/topology-edit-pure-reducer.js',
  'src/workspace/topology-edit/topology-edit-render-packet.js',
  'src/workspace/topology-edit/topology-edit-replay-service.js',
]);
const KERNEL_MODULES = NEW_MODULES.filter((file) => (
  !file.endsWith('command-ui.js') && !file.endsWith('render-packet.js')
));
const FUNCTION_EXCEPTIONS = Object.freeze({});

async function readRepositoryFile(file) {
  return readFile(path.join(ROOT, file), 'utf8');
}

function physicalLineCount(source) {
  return source.endsWith('\n') ? source.split('\n').length - 1 : source.split('\n').length;
}

function stripCommentsAndStrings(source) {
  let result = '';
  let mode = 'code';
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (mode === 'line-comment') {
      if (char === '\n') { mode = 'code'; result += '\n'; } else result += ' ';
      continue;
    }
    if (mode === 'block-comment') {
      if (char === '*' && next === '/') { result += '  '; index += 1; mode = 'code'; }
      else result += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (mode !== 'code') {
      if (char === '\\') { result += '  '; index += 1; continue; }
      if ((mode === 'single' && char === "'") || (mode === 'double' && char === '"') || (mode === 'template' && char === '`')) mode = 'code';
      result += char === '\n' ? '\n' : ' ';
      continue;
    }
    if (char === '/' && next === '/') { result += '  '; index += 1; mode = 'line-comment'; continue; }
    if (char === '/' && next === '*') { result += '  '; index += 1; mode = 'block-comment'; continue; }
    if (char === "'") mode = 'single';
    else if (char === '"') mode = 'double';
    else if (char === '`') mode = 'template';
    result += mode === 'code' ? char : ' ';
  }
  return result;
}

function functionStarts(lines) {
  const starts = [];
  const patterns = [
    /^\s*(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/,
    /^\s{2}([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*\{/,
  ];
  lines.forEach((line, index) => {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) { starts.push({ name: match[1], start: index }); break; }
    }
  });
  return starts;
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

function logicalLineCount(lines, start, end) {
  return lines.slice(start, end + 1).filter((line) => line.trim()).length;
}

function longFunctions(file, source) {
  const strippedLines = stripCommentsAndStrings(source).split('\n');
  const sourceLines = source.split('\n');
  return functionStarts(strippedLines).map(({ name, start }) => {
    const end = functionEnd(strippedLines, start);
    return { file, name, lines: logicalLineCount(sourceLines, start, end) };
  }).filter((row) => row.lines > 40 && !FUNCTION_EXCEPTIONS[`${row.file}:${row.name}`]);
}

async function walk(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else files.push(child);
  }
  return files;
}

async function prefixedFiles(directory) {
  const absolute = path.join(ROOT, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith('topology-edit'))
    .map((entry) => path.join(absolute, entry.name));
}

async function topologyEditOwnedPaths() {
  return [
    ...await walk(path.join(ROOT, 'src/workspace/topology-edit')),
    ...await walk(path.join(ROOT, 'src/vendor/topology-edit')),
    ...await prefixedFiles('scripts'),
    ...await prefixedFiles('tests'),
    path.join(ROOT, CONTROLLER),
    path.join(ROOT, WORKFLOW),
  ];
}

async function assertNoBackupArtifacts() {
  const files = await topologyEditOwnedPaths();
  const backups = files.filter((file) => /(?:\.bak|\.old|~)$/i.test(file));
  assert.deepEqual(backups, [], `Work-pack backup artifacts are prohibited: ${backups.join(', ')}`);
}

function assertNamedExports(file, source) {
  assert.equal(/\bexport\s+default\b/.test(source), false, `${file} must use named exports.`);
}

function assertKernelContainment(file, source) {
  for (const token of ['three', 'WorkspaceState', 'commitDraftToWorkspace', 'SequentialCommandGateway']) {
    assert.equal(source.includes(token), false, `${file} must not reference ${token}.`);
  }
  for (const token of ['Math.random', 'Date.now']) {
    assert.equal(source.includes(token), false, `${file} must not derive authority from ${token}.`);
  }
}

async function assertProductionConsumption() {
  const controller = await readRepositoryFile(CONTROLLER);
  for (const token of ['TopologyEditCertifiedSession', 'TOPOLOGY_EDIT_COMMAND_ACTIONS', 'buildTopologyEditRenderPacket']) {
    assert.ok(controller.includes(token), `Production controller must consume ${token}.`);
  }
  for (const token of ['commitDraftToWorkspace', 'TopologyEditAutofixController', 'TopologyEditCommandJournal', 'Date.now']) {
    assert.equal(controller.includes(token), false, `Production controller must not reference ${token}.`);
  }
  const candidateValidator = await readRepositoryFile(
    'src/workspace/topology-edit/topology-edit-candidate-validator.js',
  );
  assert.ok(
    candidateValidator.includes('validateTopologyEditCommandEffect'),
    'Command effect validator must have a production kernel consumer.',
  );
  await assert.rejects(access(path.join(
    ROOT,
    'src/workspace/topology-edit/topology-edit-command-journal.js',
  )));
}

export async function verifyTopologyEditWave1CodingRules() {
  await assertNoBackupArtifacts();
  const sizeEvidence = [];
  const functionViolations = [];
  for (const file of NEW_MODULES) {
    const source = await readRepositoryFile(file);
    const lines = physicalLineCount(source);
    assert.ok(lines <= 300, `${file} has ${lines} physical lines; maximum is 300.`);
    assertNamedExports(file, source);
    sizeEvidence.push({ file, lines });
    functionViolations.push(...longFunctions(file, source));
  }
  for (const file of KERNEL_MODULES) {
    assertKernelContainment(file, await readRepositoryFile(file));
  }
  await assertProductionConsumption();
  assert.deepEqual(functionViolations, [], `Functions above 40 logical lines require refactoring or an explicit reviewed exception:\n${JSON.stringify(functionViolations, null, 2)}`);
  return Object.freeze({
    modules: sizeEvidence,
    functionExceptions: Object.keys(FUNCTION_EXCEPTIONS),
  });
}

async function main() {
  const evidence = await verifyTopologyEditWave1CodingRules();
  console.log(JSON.stringify(evidence, null, 2));
  console.log('TOPOLOGY EDIT WAVE 1 CODING RULES CHECK PASSED');
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    console.error(`TOPOLOGY EDIT WAVE 1 CODING RULES CHECK FAILED: ${error.message}`);
    process.exitCode = 1;
  });
}
