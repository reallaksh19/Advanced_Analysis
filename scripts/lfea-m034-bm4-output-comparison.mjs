import { readFileSync } from 'node:fs';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { BM4_OUTPUT_PATH } from './lfea-m034-bm4-solve-fixtures.mjs';

export { BM4_OUTPUT_PATH };

// M034: BM4 output parser scoped to CASE 19 (SUS) / CASE 20 (OPE) / CASE 21
// (EXP) only -- BM4's Output_BM4.xml declares TWO independent SUS/OPE/EXP
// trios (2/17/40 and 19/20/21); this project's dispatched scope directive
// is cases 19/20/21 only, so we match by explicit CASE NUMBER rather than
// by the (SUS)/(OPE)/(EXP) abbreviation alone, which is ambiguous here.

const CASE_NUMBERS = Object.freeze({ SUS: 19, OPE: 20, EXP: 21 });
const CASE_LABELS = Object.freeze(['SUS', 'OPE', 'EXP']);

export const BM4_COMPARISON_POLICY = Object.freeze({
  relativeTolerancePercent: 10,
  targetTolerancePercent: 5,
  nearZeroReferenceThreshold: 1e-9,
  absoluteTolerance: Object.freeze({
    translation: 1e-5,
    rotation: 1e-5,
    force: 1,
    moment: 0.1,
  }),
});

function num(attributes, key) {
  const value = Number(attributes?.[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite ${key} in BM4 CAESAR output: ${attributes?.[key]}`);
  }
  return value;
}

function caseNumberFromLoadcase(loadcase) {
  const match = /^CASE\s+(\d+)\s+\(([A-Z]+)\)/u.exec(String(loadcase ?? '').trim());
  if (!match) throw new Error(`Unrecognised BM4 LOADCASE label: ${loadcase}`);
  return { caseNumber: Number(match[1]), category: match[2] };
}

function reportsForCaseNumber(xmlText, tagName, caseNumber) {
  const matches = findElements(xmlText, tagName).filter((report) => (
    caseNumberFromLoadcase(report.attributes.LOADCASE).caseNumber === caseNumber
  ));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${tagName} for CASE ${caseNumber}; found ${matches.length}.`);
  }
  return matches[0];
}

function parseDisplacement(xmlText, caseNumber) {
  const report = reportsForCaseNumber(xmlText, 'DISPLACEMENT_REPORT', caseNumber);
  const rows = findElements(report.inner, 'NODE').map((node) => {
    const translations = findElements(node.inner, 'TRANSLATIONS')[0];
    const rotations = findElements(node.inner, 'ROTATIONS')[0];
    const nodeId = node.attributes.NUMBER;
    return Object.freeze({
      nodeId,
      DX: num(translations.attributes, 'DX'),
      DY: num(translations.attributes, 'DY'),
      DZ: num(translations.attributes, 'DZ'),
      RX: num(rotations.attributes, 'RX'),
      RY: num(rotations.attributes, 'RY'),
      RZ: num(rotations.attributes, 'RZ'),
    });
  });
  return new Map(rows.map((row) => [row.nodeId, row]));
}

function parseRestraint(xmlText, caseNumber) {
  const report = reportsForCaseNumber(xmlText, 'RESTRAINT_REPORT', caseNumber);
  const rows = findElements(report.inner, 'RESTRAINT').map((row) => {
    const forces = findElements(row.inner, 'FORCES')[0];
    const moments = findElements(row.inner, 'MOMENTS')[0];
    const nodeId = row.attributes.NODE;
    return Object.freeze({
      nodeId,
      type: row.attributes.TYPE,
      FX: num(forces.attributes, 'FX'),
      FY: num(forces.attributes, 'FY'),
      FZ: num(forces.attributes, 'FZ'),
      MX: num(moments.attributes, 'MX'),
      MY: num(moments.attributes, 'MY'),
      MZ: num(moments.attributes, 'MZ'),
    });
  });
  const aggregated = new Map();
  for (const row of rows) {
    const existing = aggregated.get(row.nodeId);
    if (!existing) {
      aggregated.set(row.nodeId, { ...row });
    } else {
      existing.FX += row.FX; existing.FY += row.FY; existing.FZ += row.FZ;
      existing.MX += row.MX; existing.MY += row.MY; existing.MZ += row.MZ;
      existing.type = `${existing.type} + ${row.type}`;
    }
  }
  return aggregated;
}

function parseElementActions(xmlText, tagName, caseNumber) {
  const report = reportsForCaseNumber(xmlText, tagName, caseNumber);
  const rows = findElements(report.inner, 'ELEMENT').map((row) => {
    const forces = findElements(row.inner, 'FORCES')[0];
    const moments = findElements(row.inner, 'MOMENTS')[0];
    const from = findElements(forces.inner, 'FROM')[0];
    const to = findElements(forces.inner, 'TO')[0];
    const fromMoments = findElements(moments.inner, 'FROM')[0];
    const toMoments = findElements(moments.inner, 'TO')[0];
    const fromNode = row.attributes.FROM_NODE;
    const toNode = row.attributes.TO_NODE;
    return Object.freeze({
      fromNode,
      toNode,
      pairKey: `${fromNode}-${toNode}`,
      I: Object.freeze({
        fx: num(from.attributes, 'FX'), fy: num(from.attributes, 'FY'), fz: num(from.attributes, 'FZ'),
        mx: num(fromMoments.attributes, 'MX'), my: num(fromMoments.attributes, 'MY'), mz: num(fromMoments.attributes, 'MZ'),
      }),
      J: Object.freeze({
        fx: num(to.attributes, 'FX'), fy: num(to.attributes, 'FY'), fz: num(to.attributes, 'FZ'),
        mx: num(toMoments.attributes, 'MX'), my: num(toMoments.attributes, 'MY'), mz: num(toMoments.attributes, 'MZ'),
      }),
    });
  });
  const byPair = new Map();
  for (const row of rows) {
    if (!byPair.has(row.pairKey)) byPair.set(row.pairKey, []);
    byPair.get(row.pairKey).push(row);
  }
  return { rows, byPair };
}

export function parseBm4CiiOutputCases1921(xmlText) {
  if (typeof xmlText !== 'string') throw new TypeError('parseBm4CiiOutputCases1921 requires XML text.');
  const displacement = new Map();
  const restraint = new Map();
  const globalForce = new Map();
  const localForce = new Map();
  for (const label of CASE_LABELS) {
    const caseNumber = CASE_NUMBERS[label];
    displacement.set(label, parseDisplacement(xmlText, caseNumber));
    restraint.set(label, parseRestraint(xmlText, caseNumber));
    globalForce.set(label, parseElementActions(xmlText, 'GLOBAL_FORCE_REPORT', caseNumber));
    localForce.set(label, parseElementActions(xmlText, 'LOCAL_FORCE_REPORT', caseNumber));
  }
  return Object.freeze({
    schema: 'lfea-bm4-cii-output-comparison-cases-19-20-21/v1',
    caseNumbers: CASE_NUMBERS,
    displacement,
    restraint,
    globalForce,
    localForce,
  });
}

export function loadBm4CiiOutputCases1921() {
  return parseBm4CiiOutputCases1921(readFileSync(BM4_OUTPUT_PATH, 'utf8'));
}
