import { readFileSync } from 'node:fs';
import {
  BM2_CII_OUTPUT_PATH,
  BM2_COMPARISON_POLICY,
  parseBm2CiiOutput,
} from './lfea-b3.26-bm2-output-comparison.mjs';
import { solveBm2InputXmlConditioned } from './lfea-m031-bm2-qualified-runtime.mjs';

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
export const BM2_MATCHED_SUBSET_METRIC = 'FULL_RETAINED_STATION_SCALARS';

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

function dominantGuideDof(restraint) {
  const direction = [
    Math.abs(restraint.xCosine ?? 0),
    Math.abs(restraint.yCosine ?? 0),
    Math.abs(restraint.zCosine ?? 0),
  ];
  const maximum = Math.max(...direction);
  if (!(maximum > 0)) throw new Error('BM2 guide restraint has no non-zero direction cosine.');
  return ['UX', 'UY', 'UZ'][direction.indexOf(maximum)];
}

function sourceRestraintDescriptors(node) {
  const declarations = [...(node.sourceRestraints ?? [])];
  if (node.restraint === 'ANCHOR' && !declarations.some((row) => String(row.typeCode) === '0')) {
    declarations.push(Object.freeze({ typeCode: '0', syntheticFromTopologyAnchor: true }));
  }
  const occurrenceByType = new Map();
  return Object.freeze(declarations.map((restraint, sourceOrdinal) => {
    const typeCode = String(restraint.typeCode);
    let ciiType;
    let dofs;
    if (typeCode === '0') {
      ciiType = 'Rigid ANC';
      dofs = NODE_DOFS;
    } else if (typeCode === '14') {
      ciiType = 'Rigid +Y';
      dofs = ['UY'];
    } else if (typeCode === '15') {
      ciiType = 'Rigid +Z';
      dofs = ['UZ'];
    } else if (typeCode === '8') {
      ciiType = 'Rigid GUI';
      dofs = [dominantGuideDof(restraint)];
    } else {
      throw new Error(`BM2 source restraint type ${typeCode} has no component-level CAESAR comparison mapping.`);
    }
    const occurrenceOrdinalWithinNodeAndType = occurrenceByType.get(ciiType) ?? 0;
    occurrenceByType.set(ciiType, occurrenceOrdinalWithinNodeAndType + 1);
    return Object.freeze({
      sourceOrdinal,
      occurrenceOrdinalWithinNodeAndType,
      ciiType,
      dofs: Object.freeze([...dofs]),
      source: restraint,
    });
  }));
}

function componentReaction(reaction, ownedDofs) {
  const owned = new Set(ownedDofs);
  return Object.freeze(Object.fromEntries(NODE_DOFS.map((dof) => [dof, owned.has(dof) ? reaction[dof] : 0])));
}

function subtractNodeVectors(left, right) {
  return Object.freeze(Object.fromEntries(NODE_DOFS.map((field) => [field, left[field] - right[field]])));
}

function ownValues(report) {
  const cases = Object.fromEntries(CASES.map((label) => [label, { nodes: [], restraints: [], elements: [] }]));
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
        displacement: subtractNodeVectors(node.operating.displacement, node.sustained.displacement),
        reaction: subtractNodeVectors(node.operating.reaction, node.sustained.reaction),
      }),
    }));

    const descriptors = sourceRestraintDescriptors(node);
    const addComponents = (caseLabel, reaction) => {
      for (const descriptor of descriptors) {
        cases[caseLabel].restraints.push(Object.freeze({
          sourceComponentUid: `SOURCE_RESTRAINT:${node.sourceNodeId}:${descriptor.ciiType}:${descriptor.occurrenceOrdinalWithinNodeAndType}`,
          nodeId: node.sourceNodeId,
          ciiType: descriptor.ciiType,
          sourceOrdinal: descriptor.sourceOrdinal,
          occurrenceOrdinalWithinNodeAndType: descriptor.occurrenceOrdinalWithinNodeAndType,
          analysisComponentUid: node.kernelNodeId,
          stationRole: 'SOURCE_RESTRAINT_COMPONENT',
          stationOrdinal: sourceRowOrdinal,
          ownedDofs: descriptor.dofs,
          sourceRestraint: descriptor.source,
          value: componentReaction(reaction, descriptor.dofs),
        }));
      }
    };
    addComponents('OPE', node.operating.reaction);
    addComponents('SUS', node.sustained.reaction);
    addComponents('EXP', subtractNodeVectors(node.operating.reaction, node.sustained.reaction));
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
  if (family === 'restraint') values.push('BM2_UNILATERAL_CONTACT_RESPONSE_DELTA_AFTER_COMPLEMENTARITY');
  if (nodeId === '130') values.push('BM2_PLUS_Z_RESPONSE_DELTA_AFTER_COMPLEMENTARITY');
  if (sourceElement?.bendTagged) values.push('BM2_REMAINING_BEND_RESPONSE_DELTA_AFTER_ARC_FLEXIBILITY');
  if (sourceElement?.rigid) values.push('BM2_RIGID_BODY_LOAD_DISTRIBUTION_ASSUMPTION');
  const pairNodes = sourceElement
    ? [sourceElement.sourceFromNode, sourceElement.sourceToNode]
    : [];
  const relatedNodes = [nodeId, ...pairNodes].filter(Boolean).map(String);
  if (relatedNodes.some((id) => id === '100' || id === '140')) {
    values.push('BM2_WELDOLET_SKETCH_2_6_FLEXIBILITY_EQUATIONS_DEFERRED');
  } else if (branchNodeIds.has(nodeId) || pairNodes.some((id) => branchNodeIds.has(id))) {
    values.push('BM2_REMAINING_WELDING_TEE_RESPONSE_DELTA_AFTER_MATRIX_STIFFNESS');
  }
  values.push('BM2_NUMERICAL_RESPONSE_DELTA_AFTER_M031_MECHANICS');
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
    const matchedOwnRestraintUids = new Set();
    const restraintSet = cii.restraint.get(caseLabel);
    const ownRestraints = ours[caseLabel].restraints;
    const ownRestraintsByComponent = groupRows(
      ownRestraints,
      (row) => `${row.nodeId}:${row.ciiType}`,
    );
    for (const reference of restraintSet.rows) {
      const ownGroup = ownRestraintsByComponent.get(`${reference.nodeId}:${reference.type}`) ?? [];
      const ownRow = ownGroup.find((row) => !matchedOwnRestraintUids.has(row.sourceComponentUid));
      if (!ownRow) continue;
      matchedRestraintRawUids.add(reference.rowUid);
      matchedOwnRestraintUids.add(ownRow.sourceComponentUid);
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
            stationRole: ownRow.stationRole,
            stationNode: reference.nodeId,
            stationOrdinal: ownRow.stationOrdinal,
            reportFromNode: null,
            reportToNode: null,
            reportedEnd: null,
            sourceRowOrdinal: reference.sourceRowOrdinal,
            occurrenceOrdinalWithinCaseFamilyAndPair: reference.occurrenceOrdinalWithinCaseFamilyAndPair,
            reportRowUid: reference.rowUid,
            restraintType: reference.type,
            ownedDofs: ownRow.ownedDofs,
          }),
          identifier: `${reference.nodeId}:${reference.type}`,
          field,
          ours: ownRow.value[field],
          cii: ciiRow[field],
          context: { family: 'restraint', nodeId: reference.nodeId, sourceElement: null, branchNodeIds },
        }));
      }
    }
    const unmatchedRestraintReferenceRows = restraintSet.rows
      .filter((row) => !matchedRestraintRawUids.has(row.rowUid));
    const unmatchedOwnRestraints = ownRestraints
      .filter((row) => !matchedOwnRestraintUids.has(row.sourceComponentUid));
    const restraint = Object.freeze({
      rows: Object.freeze(restraintRows),
      unmatchedReferenceRows: Object.freeze(unmatchedRestraintReferenceRows),
      unmatchedSolverRows: Object.freeze(unmatchedOwnRestraints),
      summary: summary(restraintRows),
      coverage: coverageRecord({
        caseLabel,
        reportFamily: 'restraint',
        reportSet: restraintSet,
        declaredSourceRows: ownRestraints.length,
        sourceMatchableRows: ownRestraints.length - unmatchedOwnRestraints.length,
        matchedRows: matchedRestraintRawUids.size,
        matchedComparisonRows: matchedRestraintRawUids.size,
        unmatchedSolverRows: unmatchedOwnRestraints.length,
        unresolvedClassificationRows: unmatchedRestraintReferenceRows.length,
        scalarComponentsPerRow: 6,
        matchedScalarDenominator: restraintRows.length,
        sourceLevelScalarDenominator: ownRestraints.length * 6,
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
  const sourceLevelScalarDenominator = solved.report.stationCustody.sourceLevelScalarDenominator;
  const fullStationScalarDenominator = coverageRows.reduce(
    (sum, row) => sum + row.fullStationScalarDenominator,
    0,
  );
  const benchmarkCoverage = Object.freeze({
    schema: BM2_COVERAGE_SCHEMA,
    metricName: BM2_MATCHED_SUBSET_METRIC,
    matchedScalarDenominator: totals.comparisons,
    sourceLevelScalarDenominator,
    sourceLevelDenominatorStatus: 'SOURCE_LEDGER_EXACT_3240',
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
    comparisonScope: 'FULL_RETAINED_STATION_ROWS',
    completeComparisonClaim: benchmarkCoverage.coverageStatus === 'COMPLETE',
    restraintAuthorityStatus: solved.report.nonlinearRestraints.status,
    toleranceAuthority: 'RESULT_FAMILY_AND_COMPONENT_V1',
    toleranceAudit: toleranceAudit(cases),
    solverConditioningProfile: solved.report.solverConditioningProfile,
    matchedSubsetStatus: totals.failed === 0 ? 'WITHIN_TOLERANCE' : 'GAP_DISCLOSED',
    qualificationStatus: benchmarkCoverage.coverageStatus,
    totals: Object.freeze(totals),
    coverage: benchmarkCoverage,
    limitations: solved.report.limitations,
    solverQualification: Object.freeze({
      flexibilityOwnership: solved.report.flexibilityOwnership,
      nonlinearRestraints: solved.report.nonlinearRestraints,
      conditioning: solved.report.conditioning,
      stationCustody: solved.report.stationCustody,
    }),
    cases: Object.freeze(cases),
  });
}
