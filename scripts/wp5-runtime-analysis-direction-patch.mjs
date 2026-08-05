import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('./empirical-restraint-network-check.mjs', import.meta.url);
let source = readFileSync(path, 'utf8');
const before = `function port(componentKey, role, position) {
  return {
    portKey: \`${'${componentKey}'}:${'${role}'}\`,
    role,
    position,
    sourceReference: { sourcePath: \`${'${componentKey}'}.${'${role}'}\` },
  };
}`;
const after = `function port(componentKey, role, position) {
  const portKey = \`${'${componentKey}'}:${'${role}'}\`;
  const peerMap = {
    'PIPE-1:TO': 'PIPE-2:FROM',
    'PIPE-2:FROM': 'PIPE-1:TO',
    'LOOP-1:TO': 'LOOP-2:FROM',
    'LOOP-2:FROM': 'LOOP-1:TO',
    'LOOP-2:TO': 'LOOP-3:FROM',
    'LOOP-3:FROM': 'LOOP-2:TO',
    'LOOP-3:TO': 'LOOP-4:FROM',
    'LOOP-4:FROM': 'LOOP-3:TO',
    'LOOP-4:TO': 'LOOP-1:FROM',
    'LOOP-1:FROM': 'LOOP-4:TO',
  };
  const sourceReference = { sourcePath: \`${'${componentKey}'}.${'${role}'}\` };
  if (peerMap[portKey]) sourceReference.explicitPeerPortKey = peerMap[portKey];
  const branchCenter = role === 'FROM' && ['ARM-Z', 'ARM-X', 'ARM-Y'].includes(componentKey);
  if (branchCenter) sourceReference.explicitConnectionId = 'WP5-BRANCH-JUNCTION';
  return {
    portKey,
    role,
    position,
    multiConnection: branchCenter && componentKey === 'ARM-Z',
    sourceReference,
  };
}`;
const first = source.indexOf(before);
assert.notEqual(first, -1, 'WP5 topology-evidence patch target not found.');
assert.equal(source.indexOf(before, first + 1), -1, 'WP5 topology-evidence patch target is not unique.');
source = `${source.slice(0, first)}${after}${source.slice(first + before.length)}`;
assert.match(source, /explicitPeerPortKey/);
assert.match(source, /WP5-BRANCH-JUNCTION/);
writeFileSync(path, source);
console.log('wp5-explicit-topology-evidence-patch: APPLIED');
