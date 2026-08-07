#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import {
  BM4_INPUT_PATH,
  BM4_OUTPUT_PATH,
} from './lfea-m034-bm4-solve-fixtures.mjs';

function tagRows(text) {
  const rows = [];
  const pattern = /<\s*([A-Za-z0-9_-]+)\b([^>]*)>/gu;
  for (const match of text.matchAll(pattern)) {
    const name = match[1].toUpperCase();
    const attrs = (match[2] ?? '').replace(/\s+/gu, ' ').trim();
    rows.push({ name, attrs });
  }
  return rows;
}

function unique(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.name}|${row.attrs}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function loadCaseEvidence(text) {
  return unique(tagRows(text).filter((row) => {
    const haystack = `${row.name} ${row.attrs}`.toUpperCase();
    const namedLoadCase = /(LOAD.*CASE|CASE.*LOAD|STATIC.*CASE)/u.test(row.name);
    const formula = /(W\s*\+|T1|P1|SUS|OPE|EXP|ALTERNATE|ALT[_ -]?SUS|NONLINEAR)/u.test(haystack);
    return namedLoadCase || formula;
  })).slice(0, 100);
}

function outputEvidence(text) {
  return unique(tagRows(text).filter((row) => {
    const haystack = `${row.name} ${row.attrs}`.toUpperCase();
    return /(CASE\s+(19|20|21)\b|ALTERNATE|ALT[_ -]?SUS)/u.test(haystack);
  })).slice(0, 80);
}

console.log(JSON.stringify({
  input: loadCaseEvidence(readFileSync(BM4_INPUT_PATH, 'utf8')),
  output: outputEvidence(readFileSync(BM4_OUTPUT_PATH, 'utf8')),
}, null, 2));
