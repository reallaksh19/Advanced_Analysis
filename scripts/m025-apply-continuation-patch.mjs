#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'scripts/lfea-b3.15-bm1-inputxml-fixtures.mjs';
let content = readFileSync(path, 'utf8');

function replaceOnce(search, replacement, label) {
  const index = content.indexOf(search);
  if (index < 0) throw new Error(`M025 continuation patch could not find ${label}.`);
  if (content.indexOf(search, index + search.length) >= 0) {
    throw new Error(`M025 continuation patch found ${label} more than once.`);
  }
  content = `${content.slice(0, index)}${replacement}${content.slice(index + search.length)}`;
}

replaceOnce(
  'function analyseCase(authorities, loadCaseId, thermal, frictionForces = []) {',
  'function analyseCase(authorities, loadCaseId, thermal, frictionForces = [], thermalScale = thermal ? 1 : 0) {',
  'analyseCase signature',
);
replaceOnce(
  '  const loadCase = compileCase(authorities, loadCaseId, thermal, frictionForces);',
  '  const loadCase = compileCase(authorities, loadCaseId, thermal, frictionForces, thermalScale);',
  'analyseCase compileCase call',
);
replaceOnce(
  'function compileCase(authorities, loadCaseId, thermal, frictionForces = []) {',
  'function compileCase(authorities, loadCaseId, thermal, frictionForces = [], thermalScale = thermal ? 1 : 0) {',
  'compileCase signature',
);
replaceOnce(
  '        operatingTemperature: analysis.operatingTemperature,',
  '        operatingTemperature: INSTALLATION_TEMPERATURE + thermalScale * (analysis.operatingTemperature - INSTALLATION_TEMPERATURE),',
  'temperature continuation value',
);
replaceOnce(
  "        sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-TEMP_EXP_C1`, sourceRevision: `${entry.segment.id}:${analysis.operatingTemperature}` }),",
  "        sourceEvidence: sourceEvidence({ sourceId: `${SOURCE_ID}-TEMP_EXP_C1`, sourceRevision: `${entry.segment.id}:${analysis.operatingTemperature}:${thermalScale}` }),",
  'temperature continuation evidence',
);

writeFileSync(path, content);
console.log('M025 patched BM1 thermal continuation path.');
