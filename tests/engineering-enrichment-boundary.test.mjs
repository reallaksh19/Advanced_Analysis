import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = path.join(ROOT, 'src/workspace/engineering-enrichment');
const INDEX_PATH = path.join(SOURCE_DIR, 'index.js');
const HANDOVER_PATH = path.join(ROOT, 'docs/loadcaseenrichment.md');

const FORBIDDEN_PUBLIC_AUTHORITY = Object.freeze([
  /acceptance\.js/u,
  /EngineeringEnrichmentAcceptanceDecision/u,
  /EngineeringEnrichmentAcceptedBindingSet/u,
  /buildEngineeringEnrichmentAcceptanceDecision/u,
  /assertEngineeringEnrichmentAcceptanceDecision/u,
  /buildAcceptedFirstCutBindingSet/u,
  /assertEngineeringEnrichmentAcceptedBindingSet/u,
]);

const FORBIDDEN_AUTHORITY_CREATION = Object.freeze([
  /reviewDecisionCreated\s*:\s*true/u,
  /approvalGranted\s*:\s*true/u,
  /bindingCreated\s*:\s*true/u,
  /authorityLevel\s*:\s*['"]AUTHORIZED_MASTER['"]/u,
  /AUTHORIZED_FOR_FIRST_CUT_PREFLIGHT/u,
  /ACCEPT_EXACT_MASTER_CANDIDATES/u,
]);

const FORBIDDEN_INTEGRATION_IMPORT =
  /(?:from\s+|import\s*\()['"][^'"]*(?:lafea|first-cut|calc-workspace|workspace\/enrichment)[^'"]*['"]/iu;
const FORBIDDEN_RUNTIME_INTEGRATION =
  /\b(?:FirstCutWorkbench|FirstCutResultStore|localStorage|indexedDB|XMLHttpRequest)\b|\bfetch\s*\(/u;

function sourceFiles() {
  return fs.readdirSync(SOURCE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => path.join(SOURCE_DIR, entry.name))
    .sort();
}

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function relative(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/');
}

test('engineering-enrichment public surface excludes acceptance and binding authority', () => {
  const source = read(INDEX_PATH);
  FORBIDDEN_PUBLIC_AUTHORITY.forEach((pattern) => {
    assert.doesNotMatch(source, pattern);
  });
});

test('engineering-enrichment source cannot create approval or production binding authority', () => {
  sourceFiles().forEach((filePath) => {
    const source = read(filePath);
    FORBIDDEN_AUTHORITY_CREATION.forEach((pattern) => {
      assert.doesNotMatch(source, pattern, relative(filePath));
    });
  });
});

test('engineering-enrichment source has no LFEA or production integration import edge', () => {
  sourceFiles().forEach((filePath) => {
    const source = read(filePath);
    assert.doesNotMatch(source, FORBIDDEN_INTEGRATION_IMPORT, relative(filePath));
    assert.doesNotMatch(source, FORBIDDEN_RUNTIME_INTEGRATION, relative(filePath));
  });
});

test('Phase 6I non-dependency boundary remains explicit in the handover', () => {
  const source = read(HANDOVER_PATH);
  assert.match(source, /PR #371 is not a prerequisite, upstream dependency, release gate/u);
  assert.match(
    source,
    /Engineering-enrichment and empirical load-calculation outputs, including PR #371 shadow proposals, are not consumed by this Phase 6I candidate/u,
  );
  assert.match(source, /Project approval, LFEA candidate binding, applicability, derivation policy/u);
});
