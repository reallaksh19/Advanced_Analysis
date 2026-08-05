import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  normalizeTopologyEditCleanShellState,
  topologyEditCleanShellDraftSummary,
} from '../src/workspace/viewport-productivity/topology-edit-clean-shell-runtime.js';

test('clean shell state clamps inspector width and canonicalizes drawer state', () => {
  const state = normalizeTopologyEditCleanShellState({
    inspectorOpen: false,
    inspectorWidthPx: 900,
    openPanels: ['display', 'commands', 'display', '', null],
  });

  assert.deepEqual(state, {
    schema: 'TopologyEditCleanShellState.v1',
    inspectorOpen: false,
    inspectorWidthPx: 520,
    openPanels: ['commands', 'display'],
  });
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.openPanels), true);
});

test('clean shell state defaults to an open 320 px inspector', () => {
  assert.deepEqual(normalizeTopologyEditCleanShellState(null), {
    schema: 'TopologyEditCleanShellState.v1',
    inspectorOpen: true,
    inspectorWidthPx: 320,
    openPanels: [],
  });
});

test('draft summary distinguishes clean, dirty, saved, preview, error, and blocked states', () => {
  assert.equal(topologyEditCleanShellDraftSummary().state, 'clean');
  assert.equal(topologyEditCleanShellDraftSummary({ activeCommandCount: 2 }).state, 'dirty');
  assert.equal(topologyEditCleanShellDraftSummary({
    activeCommandCount: 2,
    hasPersistedHash: true,
  }).state, 'saved');
  assert.equal(topologyEditCleanShellDraftSummary({
    activeCommandCount: 2,
    hasPreview: true,
  }).state, 'preview');
  assert.equal(topologyEditCleanShellDraftSummary({
    persistenceError: 'disk full',
  }).state, 'error');
  assert.equal(topologyEditCleanShellDraftSummary({
    staleReason: 'base changed',
  }).state, 'blocked');
});

test('preview and safety states have precedence over persisted state', () => {
  assert.deepEqual(topologyEditCleanShellDraftSummary({
    activeCommandCount: 3,
    hasPersistedHash: true,
    hasPreview: true,
  }), {
    state: 'preview',
    label: 'Preview · 3 edits',
    title: 'A display-only preview is active and has not been journaled.',
  });
  assert.equal(topologyEditCleanShellDraftSummary({
    activeCommandCount: 3,
    hasPersistedHash: true,
    hasPreview: true,
    persistenceError: 'write failed',
  }).state, 'error');
});
