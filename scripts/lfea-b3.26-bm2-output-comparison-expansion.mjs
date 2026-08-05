const CASES = Object.freeze(['OPE', 'SUS', 'EXP']);
const PHYSICAL_CASES = Object.freeze(['OPE', 'SUS']);
const EXPANSION_DERIVATION = Object.freeze({
  caseNumber: 6,
  formula: 'L6=L3-L4',
  leftCase: 'OPE',
  rightCase: 'SUS',
});
const DISPLACEMENT_FIELDS = Object.freeze(['DX', 'DY', 'DZ', 'RX', 'RY', 'RZ']);
const RESTRAINT_FIELDS = Object.freeze(['FX', 'FY', 'FZ', 'MX', 'MY', 'MZ']);
const ACTION_FIELDS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);

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

function stableRowUid({ caseLabel, reportFamily, sourceRowOrdinal, nodeId = null, fromNode = null, toNode = null }) {
  const location = nodeId == null ? `${fromNode}->${toNode}` : nodeId;
  return `${caseLabel}:${reportFamily}:${sourceRowOrdinal}:${location}`;
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

function subtractFields(left, right, fields, context) {
  return Object.freeze(Object.fromEntries(fields.map((field) => {
    const value = left[field] - right[field];
    if (!Number.isFinite(value)) {
      throw new Error(`Non-finite derived EXP ${field} for ${context}.`);
    }
    return [field, Object.is(value, -0) ? 0 : value];
  })));
}

function indexedRows(report, identityOf, context) {
  const occurrences = new Map();
  const rows = new Map();
  for (const row of report.rows) {
    const identity = identityOf(row);
    const ordinal = occurrences.get(identity) ?? 0;
    occurrences.set(identity, ordinal + 1);
    const key = `${identity}\u0000${ordinal}`;
    if (rows.has(key)) throw new Error(`Duplicate ${context} identity ${key}.`);
    rows.set(key, row);
  }
  return rows;
}

function matchedPhysicalRows(leftReport, rightReport, identityOf, context) {
  const left = indexedRows(leftReport, identityOf, `${context} OPE`);
  const right = indexedRows(rightReport, identityOf, `${context} SUS`);
  if (left.size !== right.size) {
    throw new Error(`Cannot derive EXP ${context}: OPE has ${left.size} rows but SUS has ${right.size}.`);
  }
  const matches = [];
  for (const [key, leftRow] of left) {
    const rightRow = right.get(key);
    if (!rightRow) throw new Error(`Cannot derive EXP ${context}: SUS is missing row identity ${key}.`);
    matches.push(Object.freeze({ leftRow, rightRow }));
  }
  for (const key of right.keys()) {
    if (!left.has(key)) throw new Error(`Cannot derive EXP ${context}: OPE is missing row identity ${key}.`);
  }
  return Object.freeze(matches);
}

function reportSummary(rows, grouped) {
  return Object.freeze({
    declaredReportRows: rows.length,
    uniqueSemanticIdentities: new Set(rows.map((row) => row.rowUid)).size,
    duplicateSemanticIdentities: [...grouped.values()].filter((group) => group.length > 1).length,
    duplicateRowOccurrences: [...grouped.values()]
      .reduce((sum, group) => sum + Math.max(0, group.length - 1), 0),
  });
}

function deriveDisplacementReport(leftReport, rightReport) {
  const matches = matchedPhysicalRows(leftReport, rightReport, (row) => String(row.nodeId), 'displacement');
  const rows = Object.freeze(matches.map(({ leftRow, rightRow }, sourceRowOrdinal) => Object.freeze({
    caseLabel: 'EXP',
    reportFamily: 'displacement',
    sourceRowOrdinal,
    occurrenceOrdinalWithinCaseFamilyAndPair: leftRow.occurrenceOrdinalWithinCaseFamilyAndPair,
    rowUid: stableRowUid({
      caseLabel: 'EXP',
      reportFamily: 'displacement',
      sourceRowOrdinal,
      nodeId: leftRow.nodeId,
    }),
    nodeId: leftRow.nodeId,
    ...subtractFields(leftRow, rightRow, DISPLACEMENT_FIELDS, `node ${leftRow.nodeId}`),
  })));
  const byNode = groupRows(rows, (row) => row.nodeId);
  return Object.freeze({ rows, byNode, ...reportSummary(rows, byNode), derivation: EXPANSION_DERIVATION });
}

function deriveRestraintReport(leftReport, rightReport) {
  const matches = matchedPhysicalRows(
    leftReport,
    rightReport,
    (row) => `${row.nodeId}:${row.type}`,
    'restraint',
  );
  const rows = Object.freeze(matches.map(({ leftRow, rightRow }, sourceRowOrdinal) => Object.freeze({
    caseLabel: 'EXP',
    reportFamily: 'restraint',
    sourceRowOrdinal,
    occurrenceOrdinalWithinCaseFamilyAndPair: leftRow.occurrenceOrdinalWithinCaseFamilyAndPair,
    rowUid: stableRowUid({
      caseLabel: 'EXP',
      reportFamily: 'restraint',
      sourceRowOrdinal,
      nodeId: leftRow.nodeId,
    }),
    nodeId: leftRow.nodeId,
    type: leftRow.type,
    ...subtractFields(leftRow, rightRow, RESTRAINT_FIELDS, `restraint ${leftRow.nodeId}:${leftRow.type}`),
  })));
  const byNode = groupRows(rows, (row) => row.nodeId);
  return Object.freeze({
    rows,
    byNode,
    aggregatedByNode: aggregateRestraintsByNode(rows),
    ...reportSummary(rows, byNode),
    derivation: EXPANSION_DERIVATION,
  });
}

function deriveElementReport(leftReport, rightReport, reportFamily) {
  const matches = matchedPhysicalRows(
    leftReport,
    rightReport,
    (row) => `${row.reportFromNode}->${row.reportToNode}`,
    reportFamily,
  );
  const rows = Object.freeze(matches.map(({ leftRow, rightRow }, sourceRowOrdinal) => Object.freeze({
    caseLabel: 'EXP',
    reportFamily,
    sourceRowOrdinal,
    occurrenceOrdinalWithinCaseFamilyAndPair: leftRow.occurrenceOrdinalWithinCaseFamilyAndPair,
    rowUid: stableRowUid({
      caseLabel: 'EXP',
      reportFamily,
      sourceRowOrdinal,
      fromNode: leftRow.reportFromNode,
      toNode: leftRow.reportToNode,
    }),
    reportFromNode: leftRow.reportFromNode,
    reportToNode: leftRow.reportToNode,
    coarsePairKey: leftRow.coarsePairKey,
    reversedCoarsePairKey: leftRow.reversedCoarsePairKey,
    I: subtractFields(leftRow.I, rightRow.I, ACTION_FIELDS, `${reportFamily} ${leftRow.coarsePairKey} I`),
    J: subtractFields(leftRow.J, rightRow.J, ACTION_FIELDS, `${reportFamily} ${leftRow.coarsePairKey} J`),
  })));
  const byPair = groupRows(rows, (row) => row.coarsePairKey);
  return Object.freeze({ rows, byPair, ...reportSummary(rows, byPair), derivation: EXPANSION_DERIVATION });
}

export function completeBm2ExpansionCase(reportMaps) {
  for (const label of PHYSICAL_CASES) {
    for (const [name, map] of Object.entries(reportMaps)) {
      if (!map.has(label)) throw new Error(`Output_BM2.xml is missing ${name} report for physical case ${label}.`);
    }
  }
  const explicitExpansionFamilies = Object.entries(reportMaps)
    .filter(([, map]) => map.has('EXP'))
    .map(([name]) => name);
  if (explicitExpansionFamilies.length !== 0 && explicitExpansionFamilies.length !== Object.keys(reportMaps).length) {
    throw new Error(`Output_BM2.xml has a partial explicit EXP report set: ${explicitExpansionFamilies.join(', ')}.`);
  }
  if (explicitExpansionFamilies.length === 0) {
    reportMaps.displacement.set('EXP', deriveDisplacementReport(
      reportMaps.displacement.get('OPE'),
      reportMaps.displacement.get('SUS'),
    ));
    reportMaps.restraint.set('EXP', deriveRestraintReport(
      reportMaps.restraint.get('OPE'),
      reportMaps.restraint.get('SUS'),
    ));
    reportMaps.globalForce.set('EXP', deriveElementReport(
      reportMaps.globalForce.get('OPE'),
      reportMaps.globalForce.get('SUS'),
      'globalForce',
    ));
    reportMaps.localForce.set('EXP', deriveElementReport(
      reportMaps.localForce.get('OPE'),
      reportMaps.localForce.get('SUS'),
      'localForce',
    ));
  }
  for (const label of CASES) {
    for (const [name, map] of Object.entries(reportMaps)) {
      if (!map.has(label)) throw new Error(`Output_BM2.xml is missing ${name} report for ${label}.`);
    }
  }
  return Object.freeze({
    caseNumber: EXPANSION_DERIVATION.caseNumber,
    formula: EXPANSION_DERIVATION.formula,
    leftCase: EXPANSION_DERIVATION.leftCase,
    rightCase: EXPANSION_DERIVATION.rightCase,
    status: explicitExpansionFamilies.length === 0
      ? 'DERIVED_FROM_MATCHED_PHYSICAL_REPORT_ROWS'
      : 'EXPLICIT_SOURCE_REPORTS',
    reportFamilies: Object.freeze(Object.keys(reportMaps)),
  });
}
