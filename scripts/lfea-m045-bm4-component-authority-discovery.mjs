#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { BM4_INPUT_PATH, BM4_OUTPUT_PATH } from './lfea-m034-bm4-solve-fixtures.mjs';
import { buildBm4M035FeatureAuthorities } from './lfea-m035-bm4-feature-solve-runtime.mjs';

const interesting = /SIF|FLEX|STRESS|BEND|CODE/i;

function attrs(text) {
  const result = {};
  for (const match of text.matchAll(/([A-Za-z_][A-Za-z0-9_]*)="([^"]*)"/gu)) result[match[1]] = match[2];
  return result;
}

function discoverXml(text) {
  const byTag = new Map();
  for (const match of text.matchAll(/<([A-Za-z_][A-Za-z0-9_]*)(\s[^<>]*?)?\/?\s*>/gu)) {
    const tag = match[1];
    const rawAttrs = match[2] ?? '';
    if (!interesting.test(tag) && !interesting.test(rawAttrs)) continue;
    const entry = byTag.get(tag) ?? { count: 0, attributeNames: new Set(), examples: [] };
    entry.count += 1;
    const parsed = attrs(rawAttrs);
    for (const key of Object.keys(parsed)) entry.attributeNames.add(key);
    if (entry.examples.length < 5) entry.examples.push(parsed);
    byTag.set(tag, entry);
  }
  return Object.fromEntries([...byTag.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([tag, entry]) => [tag, {
    count: entry.count,
    attributeNames: [...entry.attributeNames].sort(),
    examples: entry.examples,
  }]));
}

function simplify(value, depth = 0) {
  if (depth > 3) return Array.isArray(value) ? `[array:${value.length}]` : typeof value;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 3).map((entry) => simplify(entry, depth + 1));
  return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, entry]) => [key, simplify(entry, depth + 1)]));
}

const inputXml = readFileSync(BM4_INPUT_PATH, 'utf8');
const outputXml = readFileSync(BM4_OUTPUT_PATH, 'utf8');
const authorities = buildBm4M035FeatureAuthorities();

const report = {
  schema: 'lfea-m045-bm4-component-authority-discovery/v1',
  inputRelevantTags: discoverXml(inputXml),
  outputRelevantTags: discoverXml(outputXml),
  lfea: {
    bendComponentCount: authorities.bendExpansion.components.length,
    bendSamples: authorities.bendExpansion.components.slice(0, 3).map((component) => simplify(component)),
    teeJunctionCount: authorities.teeJunctions.length,
    teeFactorSamples: authorities.teeJunctions.map((junction) => ({
      junctionNodeId: junction.junctionNodeId,
      factorResult: simplify(junction.factorResult),
    })),
  },
};

console.log(JSON.stringify(report, null, 2));
