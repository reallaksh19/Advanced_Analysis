import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTROLLERS = Object.freeze([
  'topology-edit-3d-inspection-controller.js',
  'topology-edit-3d-route-controller.js',
  'topology-edit-3d-dossier-controller.js',
]);

test('every search override forwards modifier options through the production chain', async () => {
  for (const file of CONTROLLERS) {
    const source = await readFile(
      new URL(`../src/workspace/${file}`, import.meta.url),
      'utf8',
    );
    assert.match(
      source,
      /activateSearchResult\(result, options = \{\}\) \{/,
      `${file} must accept search activation options.`,
    );
    assert.match(
      source,
      /super\.activateSearchResult\(result, options\)/,
      `${file} must forward additive selection options.`,
    );
  }
});

test('search composition forwards options without engineering or lifecycle authority', async () => {
  for (const file of CONTROLLERS) {
    const source = await readFile(
      new URL(`../src/workspace/${file}`, import.meta.url),
      'utf8',
    );
    const method = source.match(
      /activateSearchResult\(result, options = \{\}\) \{([\s\S]*?)\n  \}/,
    );
    assert.ok(method, `${file} search override was not found.`);
    assert.doesNotMatch(
      method[1],
      /\.execute\(|acceptAutofix|commitDraft|WorkspaceState|localStorage|sessionStorage/,
    );
  }
});
