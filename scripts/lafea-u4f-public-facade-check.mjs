#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  mountLafeaHybridResultViewport as publicWorkbenchMount,
} from '../src/workspace/lafea-workbench.js';
import {
  mountLafeaHybridResultViewport as isolatedMount,
} from '../src/workspace/lafea-hybrid-result-viewport-public.js';
import {
  mountLafeaHybridResultViewport as internalMount,
} from '../src/workspace/lafea-hybrid-result-viewport.js';

assert.strictEqual(publicWorkbenchMount, isolatedMount);
assert.notStrictEqual(publicWorkbenchMount, internalMount);

const publicSource = fs.readFileSync(
  new URL('../src/workspace/lafea-hybrid-result-viewport-public.js', import.meta.url),
  'utf8',
);
const workbenchSource = fs.readFileSync(
  new URL('../src/workspace/lafea-workbench.js', import.meta.url),
  'utf8',
);

assert.match(workbenchSource, /from '\.\/lafea-hybrid-result-viewport-public\.js'/u);
assert.match(publicSource, /const PUBLIC_MOUNT_KEYS = Object\.freeze\(\[/u);
for (const key of [
  'schema', 'getState', 'getSelection', 'selectSource',
  'clearSelection', 'refresh', 'destroy',
]) {
  assert.match(publicSource, new RegExp(`'${key}'`, 'u'));
}
assert.doesNotMatch(publicSource, /\bmodel\s*[,}]/u);
assert.doesNotMatch(publicSource, /\bresultRequest\b|\brenderPacket\b|\bfieldValues\b|\bpositions\b/u);
assert.doesNotMatch(publicSource, /template|application-templates|benchmark-fixtures/u);

console.log(JSON.stringify({
  check: 'lafea-u4f-public-facade-isolation',
  status: 'PASS',
  publicMountUsesIsolationWrapper: true,
  internalModelExposedByPublicMount: false,
  renderBuffersExposedByPublicMount: false,
}));
