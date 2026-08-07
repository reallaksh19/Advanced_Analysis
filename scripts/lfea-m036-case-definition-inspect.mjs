#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import {
  BM4_INPUT_PATH,
  BM4_OUTPUT_PATH,
} from './lfea-m034-bm4-solve-fixtures.mjs';

function interestingTags(text) {
  const rows = [];
  const pattern = /<\s*([A-Za-z0-9_-]+)\b([^>]*)>/gu;
  for (const match of text.matchAll(pattern)) {
    const name = match[1].toUpperCase();
    const attrs = match[2] ?? '';
    if (!/(CASE|LOAD|SUS|OPE|ALT|NONLINEAR|RESTRAINT)/u.test(`${name} ${attrs.toUpperCase()}`)) continue;
    const compact = attrs.replace(/\s+/gu, ' ').trim();
    rows.push({ name, attrs: compact.slice(0, 900) });
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

const input = unique(interestingTags(readFileSync(BM4_INPUT_PATH, 'utf8')));
const output = unique(interestingTags(readFileSync(BM4_OUTPUT_PATH, 'utf8')));
const selectedInput = input.filter((row) => /(CASE|LOAD|ALT|SUS|OPE)/u.test(`${row.name} ${row.attrs.toUpperCase()}`));
const selectedOutput = output.filter((row) => /(CASE 19|CASE 20|CASE 21|ALTERNATE|ALT)/u.test(row.attrs.toUpperCase()));

console.log(JSON.stringify({
  input: selectedInput.slice(0, 120),
  output: selectedOutput.slice(0, 80),
}, null, 2));
