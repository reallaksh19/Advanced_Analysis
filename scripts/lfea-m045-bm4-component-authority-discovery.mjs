#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { BM4_INPUT_PATH, BM4_OUTPUT_PATH } from './lfea-m034-bm4-solve-fixtures.mjs';
import { buildBm4M035FeatureAuthorities } from './lfea-m035-bm4-feature-solve-runtime.mjs';

const interesting = /SIF|FLEX|STRESS|BEND|CODE/i;
const TARGET_CASES = Object.freeze([19, 20, 21]);

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

function firstTag(inner, tag) {
  return findElements(inner, tag)[0] ?? null;
}
function numericPair(inner, tag) {
  const element = firstTag(inner, tag);
  return element ? { from: Number(element.attributes.FROM), to: Number(element.attributes.TO) } : null;
}
function targetCaseNumber(label) {
  const match = /^CASE\s+(\d+)\b/u.exec(String(label ?? '').trim());
  return match ? Number(match[1]) : null;
}
function stressCaseInventory(outputXml) {
  const reports = findElements(outputXml, 'STRESS_REPORT')
    .filter((row) => TARGET_CASES.includes(targetCaseNumber(row.attributes.LOADCASE)));
  return reports.map((report) => {
    const caseNumber = targetCaseNumber(report.attributes.LOADCASE);
    const rows = findElements(report.inner, 'ELEMENT').map((element) => ({
      fromNode: element.attributes.FROM_NODE,
      toNode: element.attributes.TO_NODE,
      name: element.attributes.NAME ?? '',
      sifInPlane: numericPair(element.inner, 'SIF_IN_PLANE'),
      sifOutPlane: numericPair(element.inner, 'SIF_OUT_PLANE'),
      sifAxial: numericPair(element.inner, 'SIF_AXIAL'),
      sifTorsion: numericPair(element.inner, 'SIF_TORSION'),
      axialStress: numericPair(element.inner, 'AXIAL_STRESS'),
      bendingStress: numericPair(element.inner, 'BENDING_STRESS'),
      torsionStress: numericPair(element.inner, 'TORSION_STRESS'),
      codeStress: numericPair(element.inner, 'CODE_STRESS'),
      allowableStress: numericPair(element.inner, 'ALLOWABLE_STRESS'),
    }));
    const nonUnitySif = rows.filter((row) => [row.sifInPlane, row.sifOutPlane, row.sifAxial, row.sifTorsion]
      .filter(Boolean).some((pair) => [pair.from, pair.to].some((value) => value !== 0 && Math.abs(value - 1) > 1e-9)));
    return {
      caseNumber,
      loadcase: report.attributes.LOADCASE,
      codeCheck: report.attributes.CODE_CHECK,
      elementCount: rows.length,
      nonUnitySifCount: nonUnitySif.length,
      nonUnitySifRows: nonUnitySif,
      sampleRows: rows.slice(0, 5),
    };
  });
}

const inputXml = readFileSync(BM4_INPUT_PATH, 'utf8');
const outputXml = readFileSync(BM4_OUTPUT_PATH, 'utf8');
const authorities = buildBm4M035FeatureAuthorities();

const report = {
  schema: 'lfea-m045-bm4-component-authority-discovery/v2',
  inputRelevantTags: discoverXml(inputXml),
  outputRelevantTags: discoverXml(outputXml),
  caesarStressCases: stressCaseInventory(outputXml),
  lfea: {
    bendComponentCount: authorities.bendExpansion.components.length,
    bendSamples: authorities.bendExpansion.components.slice(0, 3).map((component) => simplify(component)),
    bendFlexibility: authorities.bendExpansion.components.map((component) => ({
      componentId: component.componentId,
      factor: component.flexibility.factor,
      factorSource: component.flexibility.factorSource,
      sourceIdentity: component.flexibility.sourceIdentity,
    })),
    teeJunctionCount: authorities.teeJunctions.length,
    teeFactorSamples: authorities.teeJunctions.map((junction) => ({
      junctionNodeId: junction.junctionNodeId,
      factorResult: simplify(junction.factorResult),
    })),
    teeFactors: authorities.teeJunctions.map((junction) => ({
      junctionNodeId: junction.junctionNodeId,
      factors: junction.factorResult.factors,
    })),
  },
};

console.log(JSON.stringify(report, null, 2));
