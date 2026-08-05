import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

patchTest();
patchController();
patchStore();
console.log('wp3-qualification-fix-patch: APPLIED');

function patchTest() {
  const path = new URL('../scripts/empirical-load-calc-scenario-check.mjs', import.meta.url);
  let source = readFileSync(path, 'utf8');
  const classBlock = `class FakeEventBus {
  constructor() { this.listeners = new Map(); }
  subscribe(topic, callback) {
    const rows = this.listeners.get(topic) || new Set();
    rows.add(callback);
    this.listeners.set(topic, rows);
    return () => rows.delete(callback);
  }
  publish(topic, payload) {
    [...(this.listeners.get(topic) || [])].forEach((callback) => callback(payload));
  }
}
`;
  source = replaceOnce(source, `
${classBlock}`, '\n', 'remove trailing fake event bus');
  source = replaceOnce(
    source,
    "const fixture = buildFixture();\n",
    `${classBlock}\nconst fixture = buildFixture();\n`,
    'insert fake event bus before use',
  );
  writeFileSync(path, source);
}

function patchController() {
  const path = new URL('../src/workspace/engineering-loads/empirical-load-calc-scenario-controller.js', import.meta.url);
  let source = readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    "  authorize(value = {}) {\n    return this.#run('authorize', () => this.store.authorize({\n",
    "  authorize(value = {}) {\n    this.refresh();\n    return this.#run('authorize', () => this.store.authorize({\n",
    'authorize refresh',
  );
  source = replaceOnce(
    source,
    "  calculate(value = {}) {\n    return this.#run('calculate', () => this.store.execute({\n",
    "  calculate(value = {}) {\n    this.refresh();\n    return this.#run('calculate', () => this.store.execute({\n",
    'calculate refresh',
  );
  writeFileSync(path, source);
}

function patchStore() {
  const path = new URL('../src/workspace/engineering-loads/empirical-load-calc-scenario-store.js', import.meta.url);
  let source = readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
    "  const rows = [...(request.blockers || [])];\n",
    "  const rows = (request.blockers || []).filter((row) => row.severity === 'ERROR');\n",
    'error blocker filtering',
  );
  writeFileSync(path, source);
}

function replaceOnce(value, before, after, label) {
  const count = value.split(before).length - 1;
  assert.equal(count, 1, `${label}: expected one source match, found ${count}`);
  return value.replace(before, after);
}
