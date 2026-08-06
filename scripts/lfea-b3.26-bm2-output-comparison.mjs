import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import {
  BM2_BENCHMARK_CASE_AUTHORITY,
  BM2_CASE_LABELS,
  BM2_CII_OUTPUT_PATH,
  BM2_EXPLICIT_CASE_LABELS,
  BM2_REPORT_FAMILIES,
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

function parseCaseIdentity(loadcase) {
  const match = /^CASE\s+(\d+)\s+\(([A-Z]+)\)\s+(.+)$/u.exec(String(loadcase ?? '').trim());
  if (!match) throw new Error(`Unrecognised BM2 LOADCASE label: ${loadcase}`);
  const caseNumber = Number(match[1]);
  const caseLabel = BM2_CASE_LABELS.find((label) => (
    BM2_BENCHMARK_CASE_AUTHORITY.cases[label].caseNumber === caseNumber
  ));
  if (!caseLabel) throw new Error(`BM2 LOADCASE ${caseNumber} is outside retained case authority.`);
  const authority = BM2_BENCHMARK_CASE_AUTHORITY.cases[caseLabel];
  if (match[2] !== authority.category || match[3] !== authority.formula) {
    throw new Error(
      `BM2 CASE ${caseNumber} identity mismatch: expected (${authority.category}) ${authority.formula}.`,
    );
  }
  return Object.freeze({
    caseLabel,
    caseNumber,
    category: match[2],
    formula: match[3],
    loadcase: String(loadcase),
  });
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

function physicalSourceRowUid(rowUid, sourceReportOccurrenceOrdinal) {
  return `${rowUid}:physical-report-occurrence:${sourceReportOccurrenceOrdinal}`;
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

function physicalSelectionMetadata(sourceReportOccurrenceOrdinal) {
  return Object.freeze({
    sourceReportOccurrenceOrdinal,
    sourceReportSelectionRule: 'PHYSICAL_REPORT_OCCURRENCE',
  });
}

function displacementReport(rows, sourceReportRows = rows.length, metadata = {}) {
  const frozenRows = Object.freeze(rows);
  const byNode = groupRows(frozenRows, (row) => row.nodeId);
  return Object.freeze({
    rows: frozenRows,
    byNode,
    ...metadata,
    ...reportStatistics(frozenRows, byNode, sourceReportRows),
  });
}

function aggregateRestraintsByNode(rows) {
  const grouped = groupRows(rows, (row) => row.nodeId);
  return immutableMap([...grouped].map(([nodeId, entries]) => [nodeId, Object.freeze({
    nodeId,
    sourceRowUids: Object.freeze(entries.map((row) => row.rowUid)),
    sourcePhysicalRowUids: Object.freeze(entries.map((row) => row.sourcePhysicalRowUid)),
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

function restraintReport(rows, sourceReportRows = rows.length, metadata = {}) {
  const frozenRows = Object.freeze(rows);
  const byNode = groupRows(frozenRows, (row) => row.nodeId);
  return Object.freeze({
    rows: frozenRows,
    byNode,
    aggregatedByNode: aggregateRestraintsByNode(frozenRows),
    ...metadata,
    ...reportStatistics(frozenRows, byNode, sourceReportRows),
  });
}

function elementReport(rows, sourceReportRows = rows.length, metadata = {}) {
  const frozenRows = Object.freeze(rows);
  const byPair = groupRows(frozenRows, (row) => row.coarsePairKey);
  return Object.freeze({
    rows: frozenRows,
    byPair,
    ...metadata,
    ...reportStatistics(frozenRows, byPair, sourceReportRows),
  });
}

function addOccurrence(occurrences, caseLabel, report) {
  if (!occurrences.has(caseLabel)) occurrences.set(caseLabel, []);
  occurrences.get(caseLabel).push(report);
}

function selectGovernedOccurrences(occurrences, reportFamily) {
  const reports = new Map();
  const custody = {};
  for (const label of BM2_CASE_LABELS) {
    const authority = BM2_BENCHMARK_CASE_AUTHORITY.cases[label];
    const physicalReports = occurrences.get(label) ?? [];
    if (authority.sourceReportSelection) {
      const expected = authority.sourceReportSelection.expectedPhysicalOccurrencesPerFamily;
      if (physicalReports.length !== expected) {
        throw new Error(
          `BM2 ${reportFamily} ${label} physical report occurrence count ${physicalReports.length} != ${expected}.`,
        );
      }
      const selectedOrdinal = authority.sourceReportSelection.selectedOccurrenceOrdinal;
      const selected = physicalReports[selectedOrdinal];
      if (!selected) {
        throw new Error(`BM2 ${reportFamily} ${label} selected occurrence ${selectedOrdinal} is unavailable.`);
      }
      reports.set(label, selected);
      custody[label] = Object.freeze({
        physicalOccurrenceCount: physicalReports.length,
        selectedOccurrenceOrdinal: selectedOrdinal,
        selectionRule: authority.sourceReportSelection.selectionRule,
      });
      continue;
    }
    if (physicalReports.length > 1) {
      throw new Error(`BM2 ${reportFamily} ${label} has multiple explicit physical reports.`);
    }
    if (physicalReports.length === 1) reports.set(label, physicalReports[0]);
    custody[label] = Object.freeze({
      physicalOccurrenceCount: physicalReports.length,
      selectedOccurrenceOrdinal: physicalReports.length === 1 ? 0 : null,
      selectionRule: physicalReports.length === 1 ? 'ONLY_PHYSICAL_REPORT_OCCURRENCE' : null,
    });
  }
  return Object.freeze({ reports, custody: Object.freeze(custody) });
}

function rowMetadata(identity, reportFamily, sourceRowOrdinal, sourceReportOccurrenceOrdinal, location) {
  const rowUid = stableRowUid({
    caseLabel: identity.caseLabel,
    reportFamily,
    sourceRowOrdinal,
    ...location,
  });
  return {
    caseLabel: identity.caseLabel,
    caseNumber: identity.caseNumber,
    caseFormula: identity.formula,
    reportFamily,
    sourceReportOccurrenceOrdinal,
    sourceRowOrdinal,
    rowUid,
    sourcePhysicalRowUid: physicalSourceRowUid(rowUid, sourceReportOccurrenceOrdinal),
  };
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
  const occurrences = new Map();
  for (const report of findElements(xmlText, tagName)) {
    const identity = parseCaseIdentity(report.attributes.LOADCASE);
    const sourceReportOccurrenceOrdinal = occurrences.get(identity.caseLabel)?.length ?? 0;
    const rawRows = findElements(report.inner, 'ELEMENT').map((row, sourceRowOrdinal) => parseEndActions(row, rowMetadata(
      identity,
      reportFamily,
      sourceRowOrdinal,
      sourceReportOccurrenceOrdinal,
      { fromNode: row.attributes.FROM_NODE, toNode: row.attributes.TO_NODE },
    )));
    addOccurrence(
      occurrences,
      identity.caseLabel,
      elementReport(
        occurrenceOrdinals(rawRows, (row) => row.coarsePairKey),
        rawRows.length,
        physicalSelectionMetadata(sourceReportOccurrenceOrdinal),
      ),
    );
  }
  return selectGovernedOccurrences(occurrences, reportFamily);
}

function parseDisplacementReports(xmlText) {
  const occurrences = new Map();
  for (const report of findElements(xmlText, 'DISPLACEMENT_REPORT')) {
    const identity = parseCaseIdentity(report.attributes.LOADCASE);
    const sourceReportOccurrenceOrdinal = occurrences.get(identity.caseLabel)?.length ?? 0;
    const rawRows = findElements(report.inner, 'NODE').map((node, sourceRowOrdinal) => {
      const translations = findElements(node.inner, 'TRANSLATIONS')[0];
      const rotations = findElements(node.inner, 'ROTATIONS')[0];
      const nodeId = node.attributes.NUMBER;
      return Object.freeze({
        ...rowMetadata(
          identity,
          'displacement',
          sourceRowOrdinal,
          sourceReportOccurrenceOrdinal,
          { nodeId },
        ),
        nodeId,
        DX: num(translations.attributes, 'DX'),
        DY: num(translations.attributes, 'DY'),
        DZ: num(translations.attributes, 'DZ'),
        RX: num(rotations.attributes, 'RX'),
        RY: num(rotations.attributes, 'RY'),
        RZ: num(rotations.attributes, 'RZ'),
      });
    });
    addOccurrence(
      occurrences,
      identity.caseLabel,
      displacementReport(
        occurrenceOrdinals(rawRows, (row) => row.nodeId),
        rawRows.length,
        physicalSelectionMetadata(sourceReportOccurrenceOrdinal),
      ),
    );
  }
  return selectGovernedOccurrences(occurrences, 'displacement');
}

function parseRestraintReports(xmlText) {
  const occurrences = new Map();
  for (const report of findElements(xmlText, 'RESTRAINT_REPORT')) {
    const identity = parseCaseIdentity(report.attributes.LOADCASE);
    const sourceReportOccurrenceOrdinal = occurrences.get(identity.caseLabel)?.length ?? 0;
    const rawRows = findElements(report.inner, 'RESTRAINT').map((row, sourceRowOrdinal) => {
      const forces = findElements(row.inner, 'FORCES')[0];
      const moments = findElements(row.inner, 'MOMENTS')[0];
      const nodeId = row.attributes.NODE;
      return Object.freeze({
        ...rowMetadata(
          identity,
          'restraint',
          sourceRowOrdinal,
          sourceReportOccurrenceOrdinal,
          { nodeId },
        ),
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
    addOccurrence(
      occurrences,
      identity.caseLabel,
      restraintReport(
        occurrenceOrdinals(rawRows, (row) => row.nodeId),
        rawRows.length,
        physicalSelectionMetadata(sourceReportOccurrenceOrdinal),
      ),
    );
  }
  return selectGovernedOccurrences(occurrences, 'restraint');
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
    rule: 'MATCHED_ROW_OPE_MINUS_SUS_V2',
    formula: BM2_BENCHMARK_CASE_AUTHORITY.cases.EXP.formula,
    leftRowUid: left.rowUid,
    rightRowUid: right.rowUid,
    leftPhysicalRowUid: left.sourcePhysicalRowUid,
    rightPhysicalRowUid: right.sourcePhysicalRowUid,
  });
}

function deriveDisplacementExpansion(ope, sus) {
  const rows = matchedRows(ope, sus, nodeOccurrenceKey, 'BM2 displacement')
    .map(({ left, right }) => Object.freeze({
      caseLabel: 'EXP',
      caseNumber: BM2_BENCHMARK_CASE_AUTHORITY.cases.EXP.caseNumber,
      caseFormula: BM2_BENCHMARK_CASE_AUTHORITY.cases.EXP.formula,
      reportFamily: 'displacement',
      sourceReportOccurrenceOrdinal: null,
      sourceRowOrdinal: left.sourceRowOrdinal,
      occurrenceOrdinalWithinCaseFamilyAndPair: left.occurrenceOrdinalWithinCaseFamilyAndPair,
      rowUid: stableRowUid({
        caseLabel: 'EXP',
        reportFamily: 'displacement',
        sourceRowOrdinal: left.sourceRowOrdinal,
        nodeId: left.nodeId,
      }),
      sourcePhysicalRowUid: null,
      nodeId: left.nodeId,
      ...Object.fromEntries(DISPLACEMENT_FIELDS.map((field) => [field, left[field] - right[field]])),
      derivation: derivationEvidence(left, right),
    }));
  return displacementReport(rows, 0, Object.freeze({
    sourceReportOccurrenceOrdinal: null,
    sourceReportSelectionRule: 'DERIVED_CASE_NO_PHYSICAL_REPORT',
  }));
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
        caseNumber: BM2_BENCHMARK_CASE_AUTHORITY.cases.EXP.caseNumber,
        caseFormula: BM2_BENCHMARK_CASE_AUTHORITY.cases.EXP.formula,
        reportFamily: 'restraint',
        sourceReportOccurrenceOrdinal: null,
        sourceRowOrdinal: left.sourceRowOrdinal,
        occurrenceOrdinalWithinCaseFamilyAndPair: left.occurrenceOrdinalWithinCaseFamilyAndPair,
        rowUid: stableRowUid({
          caseLabel: 'EXP',
          reportFamily: 'restraint',
          sourceRowOrdinal: left.sourceRowOrdinal,
          nodeId: left.nodeId,
        }),
        sourcePhysicalRowUid: null,
        nodeId: left.nodeId,
        type: left.type,
        ...Object.fromEntries(RESTRAINT_FIELDS.map((field) => [field, left[field] - right[field]])),
        derivation: derivationEvidence(left, right),
      });
    });
  return restraintReport(rows, 0, Object.freeze({
    sourceReportOccurrenceOrdinal: null,
    sourceReportSelectionRule: 'DERIVED_CASE_NO_PHYSICAL_REPORT',
  }));
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
      caseNumber: BM2_BENCHMARK_CASE_AUTHORITY.cases.EXP.caseNumber,
      caseFormula: BM2_BENCHMARK_CASE_AUTHORITY.cases.EXP.formula,
      reportFamily,
      sourceReportOccurrenceOrdinal: null,
      sourceRowOrdinal: left.sourceRowOrdinal,
      occurrenceOrdinalWithinCaseFamilyAndPair: left.occurrenceOrdinalWithinCaseFamilyAndPair,
      rowUid: stableRowUid({
        caseLabel: 'EXP',
        reportFamily,
        sourceRowOrdinal: left.sourceRowOrdinal,
        fromNode: left.reportFromNode,
        toNode: left.reportToNode,
      }),
      sourcePhysicalRowUid: null,
      reportFromNode: left.reportFromNode,
      reportToNode: left.reportToNode,
      coarsePairKey: left.coarsePairKey,
      reversedCoarsePairKey: left.reversedCoarsePairKey,
      I: subtractAction(left.I, right.I),
      J: subtractAction(left.J, right.J),
      derivation: derivationEvidence(left, right),
    }));
  return elementReport(rows, 0, Object.freeze({
    sourceReportOccurrenceOrdinal: null,
    sourceReportSelectionRule: 'DERIVED_CASE_NO_PHYSICAL_REPORT',
  }));
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

function actualCaseCustody(expansionDerived, sourceReportOccurrenceCustody) {
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
      reportFamilyOccurrences: Object.freeze(Object.fromEntries(BM2_REPORT_FAMILIES.map((family) => [
        family,
        sourceReportOccurrenceCustody[family][label],
      ]))),
    })];
  })));
}

export function parseBm2CiiOutput(xmlText) {
  if (typeof xmlText !== 'string') throw new TypeError('parseBm2CiiOutput requires XML text.');

  const displacementSelection = parseDisplacementReports(xmlText);
  const restraintSelection = parseRestraintReports(xmlText);
  const globalForceSelection = parseElementReports(xmlText, 'GLOBAL_FORCE_REPORT', 'globalForce');
  const localForceSelection = parseElementReports(xmlText, 'LOCAL_FORCE_REPORT', 'localForce');
  const reportMaps = {
    displacement: displacementSelection.reports,
    restraint: restraintSelection.reports,
    globalForce: globalForceSelection.reports,
    localForce: localForceSelection.reports,
  };
  const sourceReportOccurrenceCustody = Object.freeze({
    displacement: displacementSelection.custody,
    restraint: restraintSelection.custody,
    globalForce: globalForceSelection.custody,
    localForce: localForceSelection.custody,
  });
  const expansionDerived = completeExpansionCase(reportMaps);

  for (const label of BM2_CASE_LABELS) {
    for (const [name, map] of Object.entries(reportMaps)) {
      if (!map.has(label)) throw new Error(`BM2 ${name} custody is incomplete for ${label}.`);
    }
  }

  return Object.freeze({
    schema: 'fea-caesar-output-row-custody/v2',
    benchmarkCaseAuthority: BM2_BENCHMARK_CASE_AUTHORITY,
    sourceReportOccurrenceCustody,
    caseCustody: actualCaseCustody(expansionDerived, sourceReportOccurrenceCustody),
    expansionDerived,
    ...reportMaps,
  });
}
