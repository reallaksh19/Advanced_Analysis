import { readFileSync } from 'node:fs';
import {
  BM2_CII_OUTPUT_PATH,
  BM2_COMPARISON_POLICY,
  parseBm2CiiOutput,
} from './lfea-b3.26-bm2-output-comparison.mjs';
import { solveBm2InputXmlConditioned } from './lfea-b3.26-bm2-solve-runtime.mjs';

const CASES = Object.freeze(['OPE', 'SUS', 'EXP']);
const NODE_DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const ACTION_FIELDS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);
const TRANSLATION_DOFS = new Set(['UX', 'UY', 'UZ']);
const FORCE_FIELDS = new Set(['fx', 'fy', 'fz']);

export const BM2_COMPARISON_FAMILIES = Object.freeze([
  'displacement',
  'restraint',
  'globalForce',
  'localForce',
]);

export const BM2_COVERAGE_SCHEMA = 'fea-caesar-output-coverage/v1';
export const BM2_MATCHED_SUBSET_METRIC = 'CURRENT_MATCHED_SOURCE_SUBSET_SCALARS';

export function absoluteToleranceForComparison(family, field) {
  if (family === 'displacement') {
    if (TRANSLATION_DOFS.has(field)) return BM2_COMPARISON_POLICY.absoluteTolerance.translation;
    if (NODE_DOFS.includes(field)) return BM2_COMPARISON_POLICY.absoluteTolerance.rotation;
  }
  if (family === 'restraint') {
    if (TRANSLATION_DOFS.has(field)) return BM2_COMPARISON_POLICY.absoluteTolerance.force;
    if (NODE_DOFS.includes(field)) return BM2_COMPARISON_POLICY.absoluteTolerance.moment;
  }
  if (family === 'globalForce' || family === 'localForce') {
    if (FORCE_FIELDS.has(field)) return BM2_COMPARISON_POLICY.absoluteTolerance.force;
    if (ACTION_FIELDS.includes(field)) return BM2_COMPARISON_POLICY.absoluteTolerance.moment;
  }
  throw new Error(`Unsupported BM2 comparison family/field: ${family}/${field}`);
}

function ciiDisplacement(row) {
  return {
    UX: row.DX / 1000,
    UY: row.DY / 1000,
    UZ: row.DZ / 1000,
    RX: row.RX * Math.PI / 180,
    RY: row.RY * Math.PI / 180,
    RZ: row.RZ * Math.PI / 180,
  };
}

function ciiRestraint(row) {
  return { UX: -row.FX, UY: -row.FY, UZ: -row.FZ, RX: -row.MX, RY: -row.MY, RZ: -row.MZ };
}

function subtractActions(a, b) {
  return Object.fromEntries(ACTION_FIELDS.map((field) => [field, a[field] - b[field]]));
}

function ownValues(report) {
  const cases = Object.fromEntries(CASES.map((label) => [label, { nodes: [], elements: [] }]));
  report.nodes.forEach((node, sourceRowOrdinal) => {
    const sourceIdentity = Object.freeze({
      sourceComponentUid: `SOURCE_NODE:${node.sourceNodeId}`,
      sourceElementOrdinal: null,
      sourceFromNode: null,
      sourceToNode: null,
      analysisComponentUid: node.kernelNodeId,
      stationRole: 'SOURCE_NODE',
      stationNode: node.sourceNodeId,
      stationOrdinal: sourceRowOrdinal,
      sourceRowOrdinal,
    });
    cases.OPE.nodes.push(Object.freeze({ ...sourceIdentity, nodeId: node.sourceNodeId, value: node.operating }));
    cases.SUS.nodes.push(Object.freeze({ ...sourceIdentity, nodeId: node.sourceNodeId, value: node.sustained }));
    cases.EXP.nodes.push(Object.freeze({
      ...sourceIdentity,
      nodeId: node.sourceNodeId,
      value: Object.freeze({
        displacement: Object.fromEntries(NODE_DOFS.map((field) => [
          field,
          node.operating.displacement[field] - node.sustained.displacement[field],
        ])),
        reaction: Object.fromEntries(NODE_DOFS.map((field) => [
          field,
          node.operating.reaction[field] - node.sustained.reaction[field],
        ])),
      }),
    }));
  });

  report.elements.forEach((element, sourceElementOrdinal) => {
    const base = {
      sourceComponentUid: element.sourceElementId,
      sourceElementOrdinal,
      sourceFromNode: element.fromNode,
      sourceToNode: element.toNode,
      analysisComponentUid: element.kernelElementId,
      stationRole: 'SOURCE_ELEMENT_IJ',
      stationNode: null,
      stationOrdinal: 0,
      coarsePairKey: `${element.fromNode}-${element.toNode}`,
      sourceRowOrdinal: sourceElementOrdinal,
      bendTagged: element.bendTagged,
      rigid: element.rigid,
    };
    cases.OPE.elements.push(Object.freeze({
      ...base,
      global: element.operating.global,
      local: element.operating.local,
    }));
    cases.SUS.elements.push(Object.freeze({
      ...base,
      global: element.sustained.global,
      local: element.sustained.local,
    }));
    cases.EXP.elements.push(Object.freeze({
      ...base,
      global: Object.freeze({
        I: Object.freeze(subtractActions(element.operating.global.I, element.sustained.global.I)),
        J: Object.freeze(subtractActions(element.operating.global.J, element.sustained.global.J)),
      }),
      local: Object.freeze({
        I: Object.freeze(subtractActions(element.operating.local.I, element.sustained.local.I)),
        J: Object.freeze(subtractActions(element.operating.local.J, element.sustained.local.J)),
      }),
    }));
  });
  return cases;
}

function groupRows(rows, keyOf) {
  const grouped = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return grouped;
}

function causes({ family, nodeId, sourceElement, branchNodeIds }) {
  const values = [];
  if (family === 'restraint') values.push('BM2_RESTRAINT_LINEARIZATION_AND_UNKNOWN_TYPE');
  if (nodeId === '130') values.push('BM2_UNKNOWN_RESTRAINT_TYPE_15_OMITTED');
  if (sourceElement?.bendTagged) values.push('BM2_BEND_CHORD_STIFFNESS_ONLY');
  if (sourceElement?.rigid) values.push('BM2_RIGID_BODY_LOAD_DISTRIBUTION_ASSUMPTION');
  const pairNodes = sourceElement
    ? [sourceElement.sourceFromNode, sourceElement.sourceToNode]
    : [];
  if (branchNodeIds.has(nodeId) || pairNodes.some((id) => branchNodeIds.has(id))) {
    values.push('BM2_BRANCH_JUNCTION_FLEXIBILITY_NOT_APPLIED');
  }
  values.push('BM2_GLOBAL_STIFFNESS_INCOMPLETE_BEND_BRANCH_RESTRAINT_MODEL');
  return [...new Set(values)];
}

function scalar({ caseLabel, family, rowIdentity, identifier, end = null, field, ours, cii, context }) {
  const absoluteDifference = ours - cii;
  const nearZero = Math.abs(cii) <= BM2_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const percentDifference = nearZero ? null : (absoluteDifference / Math.abs(cii)) * 100;
  const tolerance = nearZero
    ? absoluteToleranceForComparison(family, field)
    : BM2_COMPARISON_POLICY.relativeTolerancePercent;
  const passed = nearZero
    ? Math.abs(absoluteDifference) <= tolerance
    : Math.abs(percentDifference) <= tolerance;
  return Object.freeze({
    caseLabel,
    family,
    rowIdentity,
    identifier,
    end,
    field,
    ours,
    cii,
    absoluteDifference,
    percentDifference,
    comparisonMode: nearZero ? 'ABSOLUTE_NEAR_ZERO_REFERENCE' : 'RELATIVE_PERCENT',
    tolerance,
    toleranceUnit: nearZero ? 'ABSOLUTE_SI' : 'PERCENT',
    passed,
    causeCodes: passed ? [] : causes(context),
  });
}

function summary(rows) {
  const passed = rows.filter((row) => row.passed).length;
  const failed = rows.length - passed;
  return Object.freeze({
    comparisons: rows.length,
    passed,
    failed,
    untraced: rows.filter((row) => !row.passed && row.causeCodes.length === 0).length,
  });
}

function toleranceAudit(cases) {
  const counts = {};
  for (const family of BM2_COMPARISON_FAMILIES) counts[family] = {};
  for (const section of Object.values(cases)) {
    for (const family of BM2_COMPARISON_FAMILIES) {
      for (const row of section[family].rows) {
        if (row.comparisonMode !== 'ABSOLUTE_NEAR_ZERO_REFERENCE') continue;
        const key = `${row.field}:${row.tolerance}`;
        counts[family][key] = (counts[family][key] ?? 0) + 1;
      }
    }
  }
  return Object.freeze(Object.fromEntries(
    Object.entries(counts).map(([family, rows]) => [family, Object.freeze(rows)]),
  ));
}

function coverageRecord({
  caseLabel,
  reportFamily,
  reportSet,
  declaredSourceRows,
  sourceMatchableRows,
  matchedRows,
  matchedComparisonRows,
  unmatchedSolverRows,
  unresolvedClassificationRows,
  scalarComponentsPerRow,
  matchedScalarDenominator,
  sourceLevelScalarDenominator,
  unmatchedReferenceRowUids,
  unmatchedSolverRowUids,
}) {
  const parsedReportRows = reportSet.rows.length;
  const internalGeneratedRows = 0;
  const intentionallyExcludedRows = 0;
  const unmatchedReferenceRows = 0;
  if (parsedReportRows !== matchedRows + unmatchedReferenceRows + internalGeneratedRows
    + intentionallyExcludedRows + unresolvedClassificationRows) {
    throw new Error(`${caseLabel}/${reportFamily} coverage partition does not close.`);
  }
  const coverageStatus = unresolvedClassificationRows === 0 && unmatchedSolverRows === 0
    ? 'COMPLETE'
    : 'INCOMPLETE_BLOCKED';
  return Object.freeze({
    schema: BM2_COVERAGE_SCHEMA,
    case: caseLabel,
    reportFamily,
    declaredReportRows: reportSet.declaredReportRows,
    parsedReportRows,
    uniqueSemanticIdentities: reportSet.uniqueSemanticIdentities,
    duplicateSemanticIdentities: reportSet.duplicateSemanticIdentities,
    duplicateRowOccurrences: reportSet.duplicateRowOccurrences,
    declaredSourceRows,
    sourceMatchableRows,
    internalGeneratedRows,
    intentionallyExcludedRows,
    unresolvedClassificationRows,
    matchedRows,
    matchedComparisonRows,
    unmatchedReferenceRows,
    unmatchedSolverRows,
    unmatchedReferenceRowUids: Object.freeze(unmatchedReferenceRowUids),
    unmatchedSolverRowUids: Object.freeze(unmatchedSolverRowUids),
    scalarComponentsPerRow,
    matchedScalarDenominator,
    sourceLevelScalarDenominator,
    fullStationScalarDenominator: parsedReportRows * scalarComponentsPerRow,
    coverageStatus,
  });
}

function compareUniquePairs({ caseLabel, family, reportSet, ownElements, ownField, branchNodeIds }) {
  const ownByPair = groupRows(ownElements, (row) => row.coarsePairKey);
  const rows = [];
  const matchedReferenceUids = new Set();
  const matchedSolverUids = new Set();

  for (const [pairKey, referenceGroup] of reportSet.byPair) {
    const ownGroup = ownByPair.get(pairKey) ?? [];
    if (referenceGroup.length !== 1 || ownGroup.length !== 1) continue;
    const reference = referenceGroup[0];
    const ownRow = ownGroup[0];
    matchedReferenceUids.add(reference.rowUid);
    matchedSolverUids.add(ownRow.sourceComponentUid);
    for (const end of ['I', 'J']) {
      for (const field of ACTION_FIELDS) {
        rows.push(scalar({
          caseLabel,
          family,
          rowIdentity: Object.freeze({
            sourceComponentUid: ownRow.sourceComponentUid,
            sourceElementOrdinal: ownRow.sourceElementOrdinal,
            sourceFromNode: ownRow.sourceFromNode,
            sourceToNode: ownRow.sourceToNode,
            analysisComponentUid: ownRow.analysisComponentUid,
            stationRole: ownRow.stationRole,
            stationNode: ownRow.stationNode,
            stationOrdinal: ownRow.stationOrdinal,
            reportFromNode: reference.reportFromNode,
            reportToNode: reference.reportToNode,
            reportedEnd: end,
            sourceRowOrdinal: reference.sourceRowOrdinal,
            occurrenceOrdinalWithinCaseFamilyAndPair: reference.occurrenceOrdinalWithinCaseFamilyAndPair,
            reportRowUid: reference.rowUid,
          }),
          identifier: reference.coarsePairKey,
          end,
          field,
          ours: ownRow[ownField][end][field],
          cii: reference[end][field],
          context: { family, nodeId: null, sourceElement: ownRow, branchNodeIds },
        }));
      }
    }
  }

  const unmatchedReferenceRows = reportSet.rows.filter((row) => !matchedReferenceUids.has(row.rowUid));
  const unmatchedSolverRows = ownElements.filter((row) => !matchedSolverUids.has(row.sourceComponentUid));
  return Object.freeze({
    rows: Object.freeze(rows),
    unmatchedReferenceRows: Object.freeze(unmatchedReferenceRows),
    unmatchedSolverRows: Object.freeze(unmatchedSolverRows),
    summary: summary(rows),
    coverage: coverageRecord({
      caseLabel,
      reportFamily: family,
      reportSet,
      declaredSourceRows: ownElements.length,
      sourceMatchableRows: ownElements.length - unmatchedSolverRows.length,
      matchedRows: matchedReferenceUids.size,
      matchedComparisonRows: matchedReferenceUids.size,
      unmatchedSolverRows: unmatchedSolverRows.length,
      unresolvedClassificationRows: unmatchedReferenceRows.length,
      scalarComponentsPerRow: 12,
      matchedScalarDenominator: rows.length,
      sourceLevelScalarDenominator: ownElements.length * 12,
      unmatchedReferenceRowUids: unmatchedReferenceRows.map((row) => row.rowUid),
      unmatchedSolverRowUids: unmatchedSolverRows.map((row) => row.sourceComponentUid),
    }),
  });
}

export function buildBm2CiiComparisonConditioned() {
  const cii = parseBm2CiiOutput(readFileSync(BM2_CII_OUTPUT_PATH, 'utf8'));
  const solved = solveBm2InputXmlConditioned();
  const ours = ownValues(solved.report);
  const branchNodeIds = new Set(['30', '60', '70', '100', '140', '150']);
  const cases = {};

  for (const caseLabel of CASES) {
    const ownNodes = ours[caseLabel].nodes;
    const ownNodesById = groupRows(ownNodes, (row) => row.nodeId);

    const displacementRows = [];
    const matchedDisplacementUids = new Set();
    for (const reference of cii.displacement.get(caseLabel).rows) {
      const ownGroup = ownNodesById.get(reference.nodeId) ?? [];
      if (ownGroup.length !== 1) continue;
      const ownRow = ownGroup[0];
      matchedDisplacementUids.add(reference.rowUid);
      const ciiRow = ciiDisplacement(reference);
      for (const field of NODE_DOFS) {
        displacementRows.push(scalar({
          caseLabel,
          family: 'displacement',
          rowIdentity: Object.freeze({
            sourceComponentUid: ownRow.sourceComponentUid,
            sourceElementOrdinal: null,
            sourceFromNode: null,
            sourceToNode: null,
            analysisComponentUid: ownRow.analysisComponentUid,
            stationRole: 'SOURCE_NODE',
            stationNode: reference.nodeId,
            stationOrdinal: ownRow.stationOrdinal,
            reportFromNode: null,
            reportToNode: null,
            reportedEnd: null,
            sourceRowOrdinal: reference.sourceRowOrdinal,
            occurrenceOrdinalWithinCaseFamilyAndPair: reference.occurrenceOrdinalWithinCaseFamilyAndPair,
            reportRowUid: reference.rowUid,
          }),
          identifier: reference.nodeId,
          field,
          ours: ownRow.value.displacement[field],
          cii: ciiRow[field],
          context: { family: 'displacement', nodeId: reference.nodeId, sourceElement: null, branchNodeIds },
        }));
      }
    }
    const unmatchedDisplacementRows = cii.displacement.get(caseLabel).rows
      .filter((row) => !matchedDisplacementUids.has(row.rowUid));
    const matchedOwnNodeIds = new Set(displacementRows.map((row) => row.identifier));
    const unmatchedOwnNodes = ownNodes.filter((row) => !matchedOwnNodeIds.has(row.nodeId));
    const displacement = Object.freeze({
      rows: Object.freeze(displacementRows),
      unmatchedReferenceRows: Object.freeze(unmatchedDisplacementRows),
      unmatchedSolverRows: Object.freeze(unmatchedOwnNodes),
      summary: summary(displacementRows),
      coverage: coverageRecord({
        caseLabel,
        reportFamily: 'displacement',
        reportSet: cii.displacement.get(caseLabel),
        declaredSourceRows: ownNodes.length,
        sourceMatchableRows: ownNodes.length - unmatchedOwnNodes.length,
        matchedRows: matchedDisplacementUids.size,
        matchedComparisonRows: matchedDisplacementUids.size,
        unmatchedSolverRows: unmatchedOwnNodes.length,
        unresolvedClassificationRows: unmatchedDisplacementRows.length,
        scalarComponentsPerRow: 6,
        matchedScalarDenominator: displacementRows.length,
        sourceLevelScalarDenominator: ownNodes.length * 6,
        unmatchedReferenceRowUids: unmatchedDisplacementRows.map((row) => row.rowUid),
        unmatchedSolverRowUids: unmatchedOwnNodes.map((row) => row.sourceComponentUid),
      }),
    });

    const restraintRows = [];
    const matchedRestraintRawUids = new Set();
    const restraintSet = cii.restraint.get(caseLabel);
    for (const [nodeId, reference] of restraintSet.aggregatedByNode) {
      const ownGroup = ownNodesById.get(nodeId) ?? [];
      if (ownGroup.length !== 1) continue;
      const ownRow = ownGroup[0];
      for (const uid of reference.sourceRowUids) matchedRestraintRawUids.add(uid);
      const ciiRow = ciiRestraint(reference);
      for (const field of NODE_DOFS) {
        restraintRows.push(scalar({
          caseLabel,
          family: 'restraint',
          rowIdentity: Object.freeze({
            sourceComponentUid: ownRow.sourceComponentUid,
            sourceElementOrdinal: null,
            sourceFromNode: null,
            sourceToNode: null,
            analysisComponentUid: ownRow.analysisComponentUid,
            stationRole: 'SOURCE_RESTRAINT_NODE_AGGREGATE',
            stationNode: nodeId,
            stationOrdinal: ownRow.stationOrdinal,
            reportFromNode: null,
            reportToNode: null,
            reportedEnd: null,
            sourceRowOrdinal: Object.freeze(reference.sourceRowOrdinals),
            occurrenceOrdinalWithinCaseFamilyAndPair: null,
            reportRowUid: Object.freeze(reference.sourceRowUids),
          }),
          identifier: nodeId,
          field,
          ours: ownRow.value.reaction[field],
          cii: ciiRow[field],
          context: { family: 'restraint', nodeId, sourceElement: null, branchNodeIds },
        }));
      }
    }
    const unmatchedRestraintReferenceRows = restraintSet.rows
      .filter((row) => !matchedRestraintRawUids.has(row.rowUid));
    const matchedRestraintNodeIds = new Set(restraintRows.map((row) => row.identifier));
    const ownRestrainedNodes = ownNodes.filter((row) => row.value.reaction
      && Object.values(row.value.reaction).some((value) => Math.abs(value) > 0));
    const unmatchedOwnRestraints = ownRestrainedNodes.filter((row) => !matchedRestraintNodeIds.has(row.nodeId));
    const restraint = Object.freeze({
      rows: Object.freeze(restraintRows),
      unmatchedReferenceRows: Object.freeze(unmatchedRestraintReferenceRows),
      unmatchedSolverRows: Object.freeze(unmatchedOwnRestraints),
      summary: summary(restraintRows),
      coverage: coverageRecord({
        caseLabel,
        reportFamily: 'restraint',
        reportSet: restraintSet,
        declaredSourceRows: restraintSet.aggregatedByNode.size,
        sourceMatchableRows: matchedRestraintNodeIds.size,
        matchedRows: matchedRestraintRawUids.size,
        matchedComparisonRows: matchedRestraintNodeIds.size,
        unmatchedSolverRows: unmatchedOwnRestraints.length,
        unresolvedClassificationRows: unmatchedRestraintReferenceRows.length,
        scalarComponentsPerRow: 6,
        matchedScalarDenominator: restraintRows.length,
        sourceLevelScalarDenominator: restraintSet.aggregatedByNode.size * 6,
        unmatchedReferenceRowUids: unmatchedRestraintReferenceRows.map((row) => row.rowUid),
        unmatchedSolverRowUids: unmatchedOwnRestraints.map((row) => row.sourceComponentUid),
      }),
    });

    const globalForce = compareUniquePairs({
      caseLabel,
      family: 'globalForce',
      reportSet: cii.globalForce.get(caseLabel),
      ownElements: ours[caseLabel].elements,
      ownField: 'global',
      branchNodeIds,
    });
    const localForce = compareUniquePairs({
      caseLabel,
      family: 'localForce',
      reportSet: cii.localForce.get(caseLabel),
      ownElements: ours[caseLabel].elements,
      ownField: 'local',
      branchNodeIds,
    });
    cases[caseLabel] = Object.freeze({ displacement, restraint, globalForce, localForce });
  }

  const summaries = Object.values(cases).flatMap((section) => [
    section.displacement.summary,
    section.restraint.summary,
    section.globalForce.summary,
    section.localForce.summary,
  ]);
  const totals = summaries.reduce((acc, row) => ({
    comparisons: acc.comparisons + row.comparisons,
    passed: acc.passed + row.passed,
    failed: acc.failed + row.failed,
    untraced: acc.untraced + row.untraced,
  }), { comparisons: 0, passed: 0, failed: 0, untraced: 0 });

  const coverageRows = Object.values(cases).flatMap((section) => BM2_COMPARISON_FAMILIES
    .map((family) => section[family].coverage));
  const sourceLevelScalarDenominator = coverageRows.reduce(
    (sum, row) => sum + row.sourceLevelScalarDenominator,
    0,
  );
  const fullStationScalarDenominator = coverageRows.reduce(
    (sum, row) => sum + row.fullStationScalarDenominator,
    0,
  );
  const benchmarkCoverage = Object.freeze({
    schema: BM2_COVERAGE_SCHEMA,
    metricName: BM2_MATCHED_SUBSET_METRIC,
    matchedScalarDenominator: totals.comparisons,
    sourceLevelScalarDenominator,
    sourceLevelDenominatorStatus: 'PROVISIONAL_COMPLETE_SOURCE_LEVEL',
    fullStationScalarDenominator,
    fullStationDenominatorStatus: 'COMPUTED_FROM_RETAINED_REPORT_ROWS',
    declaredReportRows: coverageRows.reduce((sum, row) => sum + row.declaredReportRows, 0),
    parsedReportRows: coverageRows.reduce((sum, row) => sum + row.parsedReportRows, 0),
    duplicateRowOccurrences: coverageRows.reduce((sum, row) => sum + row.duplicateRowOccurrences, 0),
    matchedRows: coverageRows.reduce((sum, row) => sum + row.matchedRows, 0),
    unresolvedClassificationRows: coverageRows.reduce(
      (sum, row) => sum + row.unresolvedClassificationRows,
      0,
    ),
    unmatchedSolverRows: coverageRows.reduce((sum, row) => sum + row.unmatchedSolverRows, 0),
    coverageStatus: coverageRows.every((row) => row.coverageStatus === 'COMPLETE')
      ? 'COMPLETE'
      : 'INCOMPLETE_BLOCKED',
  });

  return Object.freeze({
    schema: 'lfea-bm2-cii-output-comparison/v4',
    sourceInputPath: 'benchmarks/LFEA/BM2/Input_BM2.xml',
    sourceOutputPath: 'benchmarks/LFEA/BM2/Output_BM2.xml',
    sourceInputSemanticHash: solved.source.semanticHash,
    comparisonPolicy: BM2_COMPARISON_POLICY,
    comparisonMetric: BM2_MATCHED_SUBSET_METRIC,
    comparisonScope: 'MATCHED_SOURCE_SUBSET_ONLY',
    completeComparisonClaim: false,
    restraintAuthorityStatus: 'RAW_NUMERIC_TYPE_MAPPING_UNRESOLVED; PROJECT_MUTATIONS_NOT_BENCHMARK_AUTHORITY',
    toleranceAuthority: 'RESULT_FAMILY_AND_COMPONENT_V1',
    toleranceAudit: toleranceAudit(cases),
    solverConditioningProfile: solved.report.solverConditioningProfile,
    matchedSubsetStatus: totals.failed === 0 ? 'WITHIN_TOLERANCE' : 'GAP_DISCLOSED',
    qualificationStatus: benchmarkCoverage.coverageStatus,
    totals: Object.freeze(totals),
    coverage: benchmarkCoverage,
    limitations: solved.report.limitations,
    cases: Object.freeze(cases),
  });
}
