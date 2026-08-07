#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { BM4_INPUT_PATH, BM4_OUTPUT_PATH } from './lfea-m034-bm4-solve-fixtures.mjs';

const TARGETS = Object.freeze(['20090', '20350', '21470', '21610']);
const NEEDLES = Object.freeze(['CASE 19', 'CASE 20', 'CASE 21', 'W+P1', 'W+T1+P1', 'ALTERNATE', 'ALT SUS']);

function excerpts(text) {
  const upper = text.toUpperCase();
  const rows = [];
  for (const needle of NEEDLES) {
    const index = upper.indexOf(needle);
    if (index < 0) continue;
    rows.push({
      needle,
      excerpt: text.slice(Math.max(0, index - 140), Math.min(text.length, index + needle.length + 220))
        .replace(/\s+/gu, ' ').trim(),
    });
  }
  return rows;
}

function targetStatusByRestraintReport(text) {
  return findElements(text, 'RESTRAINT_REPORT').map((report) => {
    const summed = Object.fromEntries(TARGETS.map((nodeId) => [nodeId, 0]));
    const present = new Set();
    for (const row of findElements(report.inner, 'RESTRAINT')) {
      const nodeId = row.attributes.NODE;
      if (!TARGETS.includes(nodeId)) continue;
      const forces = findElements(row.inner, 'FORCES')[0];
      summed[nodeId] += Number(forces?.attributes?.FY ?? 0);
      present.add(nodeId);
    }
    return {
      loadCase: report.attributes.LOADCASE,
      targetReaction: Object.fromEntries(TARGETS.map((nodeId) => [nodeId, present.has(nodeId) ? -summed[nodeId] : 0])),
      releasedTargets: TARGETS.filter((nodeId) => !present.has(nodeId) || Math.abs(summed[nodeId]) <= 1),
    };
  }).filter((row) => /\((SUS|OPE)\)/u.test(row.loadCase));
}

const input = readFileSync(BM4_INPUT_PATH, 'utf8');
const output = readFileSync(BM4_OUTPUT_PATH, 'utf8');
console.log(JSON.stringify({
  inputCaseDefinitionExcerpts: excerpts(input),
  outputCaseDefinitionExcerpts: excerpts(output),
  restraintStatusHistory: targetStatusByRestraintReport(output),
}, null, 2));
