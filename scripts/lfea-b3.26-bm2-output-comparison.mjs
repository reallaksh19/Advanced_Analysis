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

function immutableMap(entries) {
  return new Map(entries);
}

function groupRows(rows, keyOf) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return immutableMap([...grouped].map(([key, values]) => [key, Object.freeze(values)]));
}

function occurrenceOrdinals(rows, keyOf) {
  const counts = new Map();
  return rows.map((row) => {
    const key = keyOf(row);
    const occurrenceOrdinalWithinCaseFamilyAndPair = counts.get(key) ?? 0;
    counts.set(key, occurrenceOrdinalWithinCaseFamilyAndPair + 1);
    return Object.freeze({ ...row, occurrenceOrdinalWithinCaseFamilyAndPair });
  });
}

function stableRowUid({ caseLabel, reportFamily, sourceRowOrdinal, nodeId = null, fromNode = null, toNode = null }) {
  const location = nodeId == null ? `${fromNode}->${toNode}` : nodeId;
  return `${caseLabel}:${reportFamily}:${sourceRowOrdinal}:${location}`;
}

function parseEndActions(row, metadata) {
  const forces = findElements(row.inner, 'FORCES')[0];
  const moments = findElements(row.inner, 'MOMENTS')[0];
  const from = findElements(forces.inner, 'FROM')[0];
  const to = findElements(forces.inner, 'TO')[0];
  const fromMoments = findElements(moments.inner, 'FROM')[0];
  const toMoments = findElements(moments.inner, 'TO')[0];
  const reportFromNode = row.attributes.FROM_NODE;
  const reportToNode = row.attributes.TO_NODE;
  return Object.freeze({
    ...metadata,
    reportFromNode,
    reportToNode,
    coarsePairKey: `${reportFromNode}-${reportToNode}`,
    reversedCoarsePairKey: `${reportToNode}-${reportFromNode}`,
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

function parseElementReports(xmlText, tagName, reportFamily) {
  const reports = new Map();
  for (const report of findElements(xmlText, tagName)) {
    const caseLabel = caseAbbrev(report.attributes.LOADCASE);
    const rawRows = findElements(report.inner, 'ELEMENT').map((row, sourceRowOrdinal) => parseEndActions(row, {
      caseLabel,
      reportFamily,
      sourceRowOrdinal,
      rowUid: stableRowUid({
        caseLabel,
        reportFamily,
        sourceRowOrdinal,
        fromNode: row.attributes.FROM_NODE,
        toNode: row.attributes.TO_NODE,
      }),
    }));
    const rows = Object.freeze(occurrenceOrdinals(rawRows, (row) => row.coarsePairKey));
    const byPair = groupRows(rows, (row) => row.coarsePairKey);
    reports.set(caseLabel, Object.freeze({
      rows,
      byPair,
      declaredReportRows: rows.length,
      uniqueSemanticIdentities: new Set(rows.map((row) => row.rowUid)).size,
      duplicateSemanticIdentities: [...byPair.values()].filter((group) => group.length > 1).length,
      duplicateRowOccurrences: [...byPair.values()]
        .reduce((sum, group) => sum + Math.max(0, group.length - 1), 0),
    }));
  }
  return reports;
}

function aggregateRestraintsByNode(rows) {
  const grouped = groupRows(rows, (row) => row.nodeId);
  return immutableMap([...grouped].map(([nodeId, entries]) => [nodeId, Object.freeze({
    nodeId,
    sourceRowUids: Object.freeze(entries.map((row) => row.rowUid)),
    sourceRowOrdinals: Object.freeze(entries.map((row) => row.sourceRowOrdinal)),
    types: Object.freeze(entries.map((row) => row.type)),
    type: entries.map((row) => row.type).join(' + '),
    FX: entries.reduce((sum, row) => sum + row.FX, 0),
    FY: entries.reduce((sum, row) => sum + row.FY, 0),
    FZ: entries.reduce((sum, row) => sum + row.FZ, 0),
    MX: entries.reduce((sum, row) => sum + row.MX, 0),
    MY: entries.reduce((sum, row) => sum + row.MY, 0),
    MZ: entries.reduce((sum, row) => sum + row.MZ, 0),
  })]));
}

export function parseBm2CiiOutput(xmlText) {
  if (typeof xmlText !== 'string') throw new TypeError('parseBm2CiiOutput requires XML text.');

  const displacement = new Map();
  for (const report of findElements(xmlText, 'DISPLACEMENT_REPORT')) {
    const caseLabel = caseAbbrev(report.attributes.LOADCASE);
    const rows = Object.freeze(findElements(report.inner, 'NODE').map((node, sourceRowOrdinal) => {
      const translations = findElements(node.inner, 'TRANSLATIONS')[0];
      const rotations = findElements(node.inner, 'ROTATIONS')[0];
      const nodeId = node.attributes.NUMBER;
      return Object.freeze({
        caseLabel,
        reportFamily: 'displacement',
        sourceRowOrdinal,
        occurrenceOrdinalWithinCaseFamilyAndPair: 0,
        rowUid: stableRowUid({ caseLabel, reportFamily: 'displacement', sourceRowOrdinal, nodeId }),
        nodeId,
        DX: num(translations.attributes, 'DX'),
        DY: num(translations.attributes, 'DY'),
        DZ: num(translations.attributes, 'DZ'),
        RX: num(rotations.attributes, 'RX'),
        RY: num(rotations.attributes, 'RY'),
        RZ: num(rotations.attributes, 'RZ'),
      });
    }));
    const byNode = groupRows(rows, (row) => row.nodeId);
    displacement.set(caseLabel, Object.freeze({
      rows,
      byNode,
      declaredReportRows: rows.length,
      uniqueSemanticIdentities: new Set(rows.map((row) => row.rowUid)).size,
      duplicateSemanticIdentities: [...byNode.values()].filter((group) => group.length > 1).length,
      duplicateRowOccurrences: [...byNode.values()]
        .reduce((sum, group) => sum + Math.max(0, group.length - 1), 0),
    }));
  }

  const restraint = new Map();
  for (const report of findElements(xmlText, 'RESTRAINT_REPORT')) {
    const caseLabel = caseAbbrev(report.attributes.LOADCASE);
    const rawRows = findElements(report.inner, 'RESTRAINT').map((row, sourceRowOrdinal) => {
      const forces = findElements(row.inner, 'FORCES')[0];
      const moments = findElements(row.inner, 'MOMENTS')[0];
      const nodeId = row.attributes.NODE;
      return Object.freeze({
        caseLabel,
        reportFamily: 'restraint',
        sourceRowOrdinal,
        rowUid: stableRowUid({ caseLabel, reportFamily: 'restraint', sourceRowOrdinal, nodeId }),
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
    const rows = Object.freeze(occurrenceOrdinals(rawRows, (row) => row.nodeId));
    const byNode = groupRows(rows, (row) => row.nodeId);
    restraint.set(caseLabel, Object.freeze({
      rows,
      byNode,
      aggregatedByNode: aggregateRestraintsByNode(rows),
      declaredReportRows: rows.length,
      uniqueSemanticIdentities: new Set(rows.map((row) => row.rowUid)).size,
      duplicateSemanticIdentities: [...byNode.values()].filter((group) => group.length > 1).length,
      duplicateRowOccurrences: [...byNode.values()]
        .reduce((sum, group) => sum + Math.max(0, group.length - 1), 0),
    }));
  }

  const globalForce = parseElementReports(xmlText, 'GLOBAL_FORCE_REPORT', 'globalForce');
  const localForce = parseElementReports(xmlText, 'LOCAL_FORCE_REPORT', 'localForce');
  for (const label of CASES) {
    for (const [name, map] of Object.entries({ displacement, restraint, globalForce, localForce })) {
      if (!map.has(label)) throw new Error(`Output_BM2.xml is missing ${name} report for ${label}.`);
    }
  }

  return Object.freeze({
    schema: 'fea-caesar-output-row-custody/v1',
    displacement,
    restraint,
    globalForce,
    localForce,
  });
}
