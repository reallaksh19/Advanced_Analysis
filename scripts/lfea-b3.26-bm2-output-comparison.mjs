import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import {
  BM2_BENCHMARK_CASE_AUTHORITY,
  BM2_CASE_LABELS,
  BM2_CII_OUTPUT_PATH,
  BM2_EXPLICIT_CASE_LABELS,
} from './lfea-b3.26-bm2-case-authority.mjs';

export { BM2_CII_OUTPUT_PATH };

const DISPLACEMENT_FIELDS = Object.freeze(['DX', 'DY', 'DZ', 'RX', 'RY', 'RZ']);
const ACTION_FIELDS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);
const RESTRAINT_FIELDS = Object.freeze(['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ']);

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

function reportStatistics(rows, grouped, sourceReportRows = rows.length) {
  return {
    declaredReportRows: rows.length,
    sourceReportRows,
    uniqueSemanticIdentities: new Set(rows.map((row) => row.rowUid)).size,
    duplicateSemanticIdentities: [...grouped.values()].filter((group) => group.length > 1).length,
    duplicateRowOccurrences: [...grouped.values()]
      .reduce((sum, group) => sum + Math.max(0, group.length - 1), 0),
  };
}

function displacementReport(rows, sourceReportRows = rows.length) {
  const frozenRows = Object.freeze(rows);
  const byNode = groupRows(frozenRows, (row) => row.nodeId);
  return Object.freeze({
    rows: frozenRows,
    byNode,
    ...reportStatistics(frozenRows, byNode, sourceReportRows),
  });
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

function restraintReport(rows, sourceReportRows = rows.length) {
  const frozenRows = Object.freeze(rows);
  const byNode = groupRows(frozenRows, (row) => row.nodeId);
  return Object.freeze({
    rows: frozenRows,
    byNode,
    aggregatedByNode: aggregateRestraintsByNode(frozenRows),
    ...reportStatistics(frozenRows, byNode, sourceReportRows),
  });
}

function elementReport(rows, sourceReportRows = rows.length) {
  const frozenRows = Object.freeze(rows);
  const byPair = groupRows(frozenRows, (row) => row.coarsePairKey);
  return Object.freeze({
    rows: frozenRows,
    byPair,
    ...reportStatistics(frozenRows, byPair, sourceReportRows),
  });
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
    reports.set(
      caseLabel,
      elementReport(occurrenceOrdinals(rawRows, (row) => row.coarsePairKey)),
    );
  }
  return reports;
}

function rowIndex(rows, keyOf, label) {
  const index = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (index.has(key)) throw new Error(`${label} contains duplicate derivation identity ${key}.`);
    index.set(key, row);
  }
  return index;
}

function matchedRows(leftReport, rightReport, keyOf, label) {
  if (leftReport.rows.length !== rightReport.rows.length) {
    throw new Error(`${label} OPE/SUS row counts differ; EXP derivation is blocked.`);
  }
  const rightByKey = rowIndex(rightReport.rows, keyOf, `${label} SUS`);
  const pairs = leftReport.rows.map((left) => {
    const key = keyOf(left);
    const right = rightByKey.get(key);
    if (!right) throw new Error(`${label} SUS is missing row identity ${key}; EXP derivation is blocked.`);
    rightByKey.delete(key);
    return { left, right };
  });
  if (rightByKey.size > 0) {
    throw new Error(`${label} SUS contains unmatched rows; EXP derivation is blocked.`);
  }
  return pairs;
}

function nodeOccurrenceKey(row) {
  return `${row.nodeId}|${row.occurrenceOrdinalWithinCaseFamilyAndPair}`;
}

function elementOccurrenceKey(row) {
  return `${row.reportFromNode}->${row.reportToNode}|${row.occurrenceOrdinalWithinCaseFamilyAndPair}`;
}

function derivationEvidence(left, right) {
  return Object.freeze({
    rule: 'MATCHED_ROW_OPE_MINUS_SUS_V1',
    formula: BM2_BENCHMARK_CASE_AUTHORITY.cases.EXP.formula,
    leftRowUid: left.rowUid,
    rightRowUid: right.rowUid,
  });
}

function deriveDisplacementExpansion(ope, sus) {
  const rows = matchedRows(ope, sus, nodeOccurrenceKey, 'BM2 displacement')
    .map(({ left, right }) => Object.freeze({
      caseLabel: 'EXP',
      reportFamily: 'displacement',
      sourceRowOrdinal: left.sourceRowOrdinal,
      occurrenceOrdinalWithinCaseFamilyAndPair: left.occurrenceOrdinalWithinCaseFamilyAndPair,
      rowUid: stableRowUid({
        caseLabel: 'EXP',
        reportFamily: 'displacement',
        sourceRowOrdinal: left.sourceRowOrdinal,
        nodeId: left.nodeId,
      }),
      nodeId: left.nodeId,
      ...Object.fromEntries(DISPLACEMENT_FIELDS.map((field) => [field, left[field] - right[field]])),
      derivation: derivationEvidence(left, right),
    }));
  return displacementReport(rows, 0);
}

function deriveRestraintExpansion(ope, sus) {
  const rows = matchedRows(ope, sus, nodeOccurrenceKey, 'BM2 restraint')
    .map(({ left, right }) => {
      if (left.type !== right.type) {
        throw new Error(
          `BM2 restraint type differs at ${nodeOccurrenceKey(left)}; EXP derivation is blocked.`,
        );
      }
      return Object.freeze({
        caseLabel: 'EXP',
        reportFamily: 'restraint',
        sourceRowOrdinal: left.sourceRowOrdinal,
        occurrenceOrdinalWithinCaseFamilyAndPair: left.occurrenceOrdinalWithinCaseFamilyAndPair,
        rowUid: stableRowUid({
          caseLabel: 'EXP',
          reportFamily: 'restraint',
          sourceRowOrdinal: left.sourceRowOrdinal,
          nodeId: left.nodeId,
        }),
        nodeId: left.nodeId,
        type: left.type,
        ...Object.fromEntries(RESTRAINT_FIELDS.map((field) => [field, left[field] - right[field]])),
        derivation: derivationEvidence(left, right),
      });
    });
  return restraintReport(rows, 0);
}

function subtractAction(left, right) {
  return Object.freeze(Object.fromEntries(
    ACTION_FIELDS.map((field) => [field, left[field] - right[field]]),
  ));
}

function deriveElementExpansion(ope, sus, reportFamily) {
  const rows = matchedRows(ope, sus, elementOccurrenceKey, `BM2 ${reportFamily}`)
    .map(({ left, right }) => Object.freeze({
      caseLabel: 'EXP',
      reportFamily,
      sourceRowOrdinal: left.sourceRowOrdinal,
      occurrenceOrdinalWithinCaseFamilyAndPair: left.occurrenceOrdinalWithinCaseFamilyAndPair,
      rowUid: stableRowUid({
        caseLabel: 'EXP',
        reportFamily,
        sourceRowOrdinal: left.sourceRowOrdinal,
        fromNode: left.reportFromNode,
        toNode: left.reportToNode,
      }),
      reportFromNode: left.reportFromNode,
      reportToNode: left.reportToNode,
      coarsePairKey: left.coarsePairKey,
      reversedCoarsePairKey: left.reversedCoarsePairKey,
      I: subtractAction(left.I, right.I),
      J: subtractAction(left.J, right.J),
      derivation: derivationEvidence(left, right),
    }));
  return elementReport(rows, 0);
}

function completeExpansionCase(reportMaps) {
  for (const label of BM2_EXPLICIT_CASE_LABELS) {
    for (const [name, map] of Object.entries(reportMaps)) {
      if (!map.has(label)) throw new Error(`Output_BM2.xml is missing ${name} report for ${label}.`);
    }
  }

  const expPresence = Object.entries(reportMaps).map(([name, map]) => ({ name, present: map.has('EXP') }));
  const explicitExpFamilies = expPresence.filter((row) => row.present);
  if (explicitExpFamilies.length > 0 && explicitExpFamilies.length !== expPresence.length) {
    throw new Error(
      `Output_BM2.xml contains a partial explicit EXP case (${explicitExpFamilies.map((row) => row.name).join(', ')}); mixed explicit/derived custody is prohibited.`,
    );
  }
  if (explicitExpFamilies.length === expPresence.length) return false;

  reportMaps.displacement.set('EXP', deriveDisplacementExpansion(
    reportMaps.displacement.get('OPE'),
    reportMaps.displacement.get('SUS'),
  ));
  reportMaps.restraint.set('EXP', deriveRestraintExpansion(
    reportMaps.restraint.get('OPE'),
    reportMaps.restraint.get('SUS'),
  ));
  reportMaps.globalForce.set('EXP', deriveElementExpansion(
    reportMaps.globalForce.get('OPE'),
    reportMaps.globalForce.get('SUS'),
    'globalForce',
  ));
  reportMaps.localForce.set('EXP', deriveElementExpansion(
    reportMaps.localForce.get('OPE'),
    reportMaps.localForce.get('SUS'),
    'localForce',
  ));
  return true;
}

function actualCaseCustody(expansionDerived) {
  return Object.freeze(Object.fromEntries(BM2_CASE_LABELS.map((label) => {
    const authority = BM2_BENCHMARK_CASE_AUTHORITY.cases[label];
    const actualCustody = label === 'EXP' && !expansionDerived
      ? 'EXPLICIT_SOURCE_REPORT'
      : authority.custody;
    return [label, Object.freeze({
      ...authority,
      manifestCustody: authority.custody,
      actualCustody,
      sourceReportPresent: label !== 'EXP' || !expansionDerived,
    })];
  })));
}

export function parseBm2CiiOutput(xmlText) {
  if (typeof xmlText !== 'string') throw new TypeError('parseBm2CiiOutput requires XML text.');

  const displacement = new Map();
  for (const report of findElements(xmlText, 'DISPLACEMENT_REPORT')) {
    const caseLabel = caseAbbrev(report.attributes.LOADCASE);
    const rows = findElements(report.inner, 'NODE').map((node, sourceRowOrdinal) => {
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
    });
    displacement.set(caseLabel, displacementReport(rows));
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
    restraint.set(
      caseLabel,
      restraintReport(occurrenceOrdinals(rawRows, (row) => row.nodeId)),
    );
  }

  const reportMaps = {
    displacement,
    restraint,
    globalForce: parseElementReports(xmlText, 'GLOBAL_FORCE_REPORT', 'globalForce'),
    localForce: parseElementReports(xmlText, 'LOCAL_FORCE_REPORT', 'localForce'),
  };
  const expansionDerived = completeExpansionCase(reportMaps);

  for (const label of BM2_CASE_LABELS) {
    for (const [name, map] of Object.entries(reportMaps)) {
      if (!map.has(label)) throw new Error(`BM2 ${name} custody is incomplete for ${label}.`);
    }
  }

  return Object.freeze({
    schema: 'fea-caesar-output-row-custody/v1',
    benchmarkCaseAuthority: BM2_BENCHMARK_CASE_AUTHORITY,
    caseCustody: actualCaseCustody(expansionDerived),
    expansionDerived,
    ...reportMaps,
  });
}
