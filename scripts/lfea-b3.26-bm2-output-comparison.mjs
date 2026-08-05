import { fileURLToPath } from 'node:url';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';

export const BM2_CII_OUTPUT_PATH = fileURLToPath(new URL('../benchmarks/LFEA/BM2/Output_BM2.xml', import.meta.url));

const CASES = Object.freeze(['OPE', 'SUS', 'EXP']);

export const BM2_COMPARISON_POLICY = Object.freeze({
  relativeTolerancePercent: 10,
  nearZeroReferenceThreshold: 1e-9,
  absoluteTolerance: Object.freeze({
    translation: 1e-5,
    rotation: 1e-5,
    force: 1,
    moment: 0.1,
  }),
});

function caseAbbrev(loadcase) {
  const match = /\(([A-Z]+)\)/u.exec(String(loadcase ?? ''));
  if (!match) throw new Error(`Unrecognised BM2 LOADCASE label: ${loadcase}`);
  return match[1];
}

function num(attributes, key) {
  const value = Number(attributes?.[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Non-finite ${key} in BM2 CAESAR output: ${attributes?.[key]}`);
  }
  return value;
}

function parseEndActions(row) {
  const forces = findElements(row.inner, 'FORCES')[0];
  const moments = findElements(row.inner, 'MOMENTS')[0];
  const from = findElements(forces.inner, 'FROM')[0];
  const to = findElements(forces.inner, 'TO')[0];
  const fromMoments = findElements(moments.inner, 'FROM')[0];
  const toMoments = findElements(moments.inner, 'TO')[0];
  return Object.freeze({
    fromNode: row.attributes.FROM_NODE,
    toNode: row.attributes.TO_NODE,
    I: Object.freeze({
      fx: num(from.attributes, 'FX'),
      fy: num(from.attributes, 'FY'),
      fz: num(from.attributes, 'FZ'),
      mx: num(fromMoments.attributes, 'MX'),
      my: num(fromMoments.attributes, 'MY'),
      mz: num(fromMoments.attributes, 'MZ'),
    }),
    J: Object.freeze({
      fx: num(to.attributes, 'FX'),
      fy: num(to.attributes, 'FY'),
      fz: num(to.attributes, 'FZ'),
      mx: num(toMoments.attributes, 'MX'),
      my: num(toMoments.attributes, 'MY'),
      mz: num(toMoments.attributes, 'MZ'),
    }),
  });
}

function parseElementReports(xmlText, tagName) {
  const reports = new Map();
  for (const report of findElements(xmlText, tagName)) {
    const label = caseAbbrev(report.attributes.LOADCASE);
    const rows = new Map();
    for (const row of findElements(report.inner, 'ELEMENT')) {
      const key = `${row.attributes.FROM_NODE}-${row.attributes.TO_NODE}`;
      rows.set(key, parseEndActions(row));
    }
    reports.set(label, rows);
  }
  return reports;
}

export function parseBm2CiiOutput(xmlText) {
  if (typeof xmlText !== 'string') throw new TypeError('parseBm2CiiOutput requires XML text.');

  const displacement = new Map();
  for (const report of findElements(xmlText, 'DISPLACEMENT_REPORT')) {
    const label = caseAbbrev(report.attributes.LOADCASE);
    const rows = new Map();
    for (const node of findElements(report.inner, 'NODE')) {
      const translations = findElements(node.inner, 'TRANSLATIONS')[0];
      const rotations = findElements(node.inner, 'ROTATIONS')[0];
      rows.set(node.attributes.NUMBER, Object.freeze({
        DX: num(translations.attributes, 'DX'),
        DY: num(translations.attributes, 'DY'),
        DZ: num(translations.attributes, 'DZ'),
        RX: num(rotations.attributes, 'RX'),
        RY: num(rotations.attributes, 'RY'),
        RZ: num(rotations.attributes, 'RZ'),
      }));
    }
    displacement.set(label, rows);
  }

  const restraint = new Map();
  for (const report of findElements(xmlText, 'RESTRAINT_REPORT')) {
    const label = caseAbbrev(report.attributes.LOADCASE);
    const rows = new Map();
    for (const row of findElements(report.inner, 'RESTRAINT')) {
      const forces = findElements(row.inner, 'FORCES')[0];
      const moments = findElements(row.inner, 'MOMENTS')[0];
      const nodeId = row.attributes.NODE;
      const existing = rows.get(nodeId) ?? {
        type: row.attributes.TYPE,
        FX: 0,
        FY: 0,
        FZ: 0,
        MX: 0,
        MY: 0,
        MZ: 0,
      };
      rows.set(nodeId, Object.freeze({
        type: existing.type === row.attributes.TYPE
          ? existing.type
          : `${existing.type} + ${row.attributes.TYPE}`,
        FX: existing.FX + num(forces.attributes, 'FX'),
        FY: existing.FY + num(forces.attributes, 'FY'),
        FZ: existing.FZ + num(forces.attributes, 'FZ'),
        MX: existing.MX + num(moments.attributes, 'MX'),
        MY: existing.MY + num(moments.attributes, 'MY'),
        MZ: existing.MZ + num(moments.attributes, 'MZ'),
      }));
    }
    restraint.set(label, rows);
  }

  const globalForce = parseElementReports(xmlText, 'GLOBAL_FORCE_REPORT');
  const localForce = parseElementReports(xmlText, 'LOCAL_FORCE_REPORT');
  for (const label of CASES) {
    for (const [name, map] of Object.entries({ displacement, restraint, globalForce, localForce })) {
      if (!map.has(label)) throw new Error(`Output_BM2.xml is missing ${name} report for ${label}.`);
    }
  }

  return Object.freeze({ displacement, restraint, globalForce, localForce });
}
