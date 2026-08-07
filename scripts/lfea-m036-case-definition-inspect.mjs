#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { BM4_INPUT_PATH, BM4_OUTPUT_PATH } from './lfea-m034-bm4-solve-fixtures.mjs';

const NEEDLES = Object.freeze(['CASE 19', 'CASE 20', 'CASE 21', 'W+P1', 'W+T1+P1', 'ALTERNATE', 'ALT SUS']);

function excerpts(text) {
  const upper = text.toUpperCase();
  const rows = [];
  for (const needle of NEEDLES) {
    let cursor = 0;
    for (;;) {
      const index = upper.indexOf(needle, cursor);
      if (index < 0) break;
      const start = Math.max(0, index - 180);
      const end = Math.min(text.length, index + needle.length + 260);
      rows.push({ needle, excerpt: text.slice(start, end).replace(/\s+/gu, ' ').trim() });
      cursor = index + needle.length;
      if (rows.filter((row) => row.needle === needle).length >= 8) break;
    }
  }
  return rows;
}

console.log(JSON.stringify({
  input: excerpts(readFileSync(BM4_INPUT_PATH, 'utf8')),
  output: excerpts(readFileSync(BM4_OUTPUT_PATH, 'utf8')),
}, null, 2));
