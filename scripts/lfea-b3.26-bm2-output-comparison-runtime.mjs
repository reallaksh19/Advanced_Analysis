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
const FORCE_FIELDS = new Set(['UX', 'UY', 'UZ', 'fx', 'fy', 'fz']);
const ROTATION_FIELDS = new Set(['RX', 'RY', 'RZ']);

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

function ownValues(report) {
  const cases = Object.fromEntries(CASES.map((label) => [label, { nodes: new Map(), pairs: new Map() }]));
  for (const node of report.nodes) {
    cases.OPE.nodes.set(node.sourceNodeId, node.operating);
    cases.SUS.nodes.set(node.sourceNodeId, node.sustained);
    cases.EXP.nodes.set(node.sourceNodeId, {
      displacement: Object.fromEntries(NODE_DOFS.map((field) => [field, node.operating.displacement[field] - node.sustained.displacement[field]])),
      reaction: Object.fromEntries(NODE_DOFS.map((field) => [field, node.operating.reaction[field] - node.sustained.reaction[field]])),
    });
  }
  const subtract = (a, b) => Object.fromEntries(ACTION_FIELDS.map((field) => [field, a[field] - b[field]]));
  for (const element of report.elements) {
    const key = `${element.fromNode}-${element.toNode}`;
    cases.OPE.pairs.set(key, { global: element.operating.global, local: element.operating.local });
    cases.SUS.pairs.set(key, { global: element.sustained.global, local: element.sustained.local });
    cases.EXP.pairs.set(key, {
      global: {
        I: subtract(element.operating.global.I, element.sustained.global.I),
        J: subtract(element.operating.global.J, element.sustained.global.J),
      },
      local: {
        I: subtract(element.operating.local.I, element.sustained.local.I),
        J: subtract(element.operating.local.J, element.sustained.local.J),
      },
    });
  }
  return cases;
}

function absoluteTolerance(field) {
  if (FORCE_FIELDS.has(field)) return BM2_COMPARISON_POLICY.absoluteTolerance.force;
  if (ROTATION_FIELDS.has(field)) return BM2_COMPARISON_POLICY.absoluteTolerance.rotation;
  if (['mx', 'my', 'mz'].includes(field)) return BM2_COMPARISON_POLICY.absoluteTolerance.moment;
  return BM2_COMPARISON_POLICY.absoluteTolerance.translation;
}

function causes({ family, nodeId, pairKey, elementByPair, branchNodeIds }) {
  const values = [];
  if (family === 'restraint') values.push('BM2_RESTRAINT_LINEARIZATION_AND_UNKNOWN_TYPE');
  if (nodeId === '130') values.push('BM2_UNKNOWN_RESTRAINT_TYPE_15_OMITTED');
  const element = pairKey ? elementByPair.get(pairKey) : null;
  if (element?.bendTagged) values.push('BM2_BEND_CHORD_STIFFNESS_ONLY');
  if (element?.rigid) values.push('BM2_RIGID_BODY_LOAD_DISTRIBUTION_ASSUMPTION');
  if (branchNodeIds.has(nodeId) || pairKey?.split('-').some((id) => branchNodeIds.has(id))) {
    values.push('BM2_BRANCH_JUNCTION_FLEXIBILITY_NOT_APPLIED');
  }
  values.push('BM2_GLOBAL_STIFFNESS_INCOMPLETE_BEND_BRANCH_RESTRAINT_MODEL');
  return [...new Set(values)];
}

function scalar({ caseLabel, family, identifier, end = null, field, ours, cii, context }) {
  const absoluteDifference = ours - cii;
  const nearZero = Math.abs(cii) <= BM2_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const percentDifference = nearZero ? null : (absoluteDifference / Math.abs(cii)) * 100;
  const tolerance = nearZero ? absoluteTolerance(field) : BM2_COMPARISON_POLICY.relativeTolerancePercent;
  const passed = nearZero ? Math.abs(absoluteDifference) <= tolerance : Math.abs(percentDifference) <= tolerance;
  return Object.freeze({
    caseLabel,
    family,
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

export function buildBm2CiiComparisonConditioned() {
  const cii = parseBm2CiiOutput(readFileSync(BM2_CII_OUTPUT_PATH, 'utf8'));
  const solved = solveBm2InputXmlConditioned();
  const ours = ownValues(solved.report);
  const ownNodeIds = new Set(solved.report.nodes.map((row) => row.sourceNodeId));
  const ownPairKeys = new Set(solved.report.elements.map((row) => `${row.fromNode}-${row.toNode}`));
  const elementByPair = new Map(solved.report.elements.map((row) => [`${row.fromNode}-${row.toNode}`, row]));
  const branchNodeIds = new Set(['30', '70', '100', '140', '150']);
  const cases = {};

  for (const caseLabel of CASES) {
    const displacement = [];
    const unmatchedDisplacementNodes = [];
    for (const [nodeId, reference] of cii.displacement.get(caseLabel)) {
      if (!ownNodeIds.has(nodeId)) { unmatchedDisplacementNodes.push(nodeId); continue; }
      const ciiRow = ciiDisplacement(reference);
      const ownRow = ours[caseLabel].nodes.get(nodeId).displacement;
      for (const field of NODE_DOFS) displacement.push(scalar({
        caseLabel, family: 'displacement', identifier: nodeId, field,
        ours: ownRow[field], cii: ciiRow[field],
        context: { family: 'displacement', nodeId, pairKey: null, elementByPair, branchNodeIds },
      }));
    }

    const restraint = [];
    const unmatchedRestraintNodes = [];
    for (const [nodeId, reference] of cii.restraint.get(caseLabel)) {
      if (!ownNodeIds.has(nodeId)) { unmatchedRestraintNodes.push(nodeId); continue; }
      const ciiRow = ciiRestraint(reference);
      const ownRow = ours[caseLabel].nodes.get(nodeId).reaction;
      for (const field of NODE_DOFS) restraint.push(scalar({
        caseLabel, family: 'restraint', identifier: nodeId, field,
        ours: ownRow[field], cii: ciiRow[field],
        context: { family: 'restraint', nodeId, pairKey: null, elementByPair, branchNodeIds },
      }));
    }

    const compareActions = (family, referenceMap, ownField) => {
      const rows = [];
      const unmatchedPairKeys = [];
      for (const [pairKey, reference] of referenceMap) {
        if (!ownPairKeys.has(pairKey)) { unmatchedPairKeys.push(pairKey); continue; }
        const ownRow = ours[caseLabel].pairs.get(pairKey)[ownField];
        for (const end of ['I', 'J']) {
          for (const field of ACTION_FIELDS) rows.push(scalar({
            caseLabel, family, identifier: pairKey, end, field,
            ours: ownRow[end][field], cii: reference[end][field],
            context: { family, nodeId: null, pairKey, elementByPair, branchNodeIds },
          }));
        }
      }
      return Object.freeze({ rows: Object.freeze(rows), unmatchedPairKeys: Object.freeze(unmatchedPairKeys), summary: summary(rows) });
    };

    const globalForce = compareActions('globalForce', cii.globalForce.get(caseLabel), 'global');
    const localForce = compareActions('localForce', cii.localForce.get(caseLabel), 'local');
    cases[caseLabel] = Object.freeze({
      displacement: Object.freeze({ rows: Object.freeze(displacement), unmatchedNodes: Object.freeze(unmatchedDisplacementNodes), summary: summary(displacement) }),
      restraint: Object.freeze({ rows: Object.freeze(restraint), unmatchedNodes: Object.freeze(unmatchedRestraintNodes), summary: summary(restraint) }),
      globalForce,
      localForce,
    });
  }

  const summaries = Object.values(cases).flatMap((section) => [
    section.displacement.summary, section.restraint.summary, section.globalForce.summary, section.localForce.summary,
  ]);
  const totals = summaries.reduce((acc, row) => ({
    comparisons: acc.comparisons + row.comparisons,
    passed: acc.passed + row.passed,
    failed: acc.failed + row.failed,
    untraced: acc.untraced + row.untraced,
  }), { comparisons: 0, passed: 0, failed: 0, untraced: 0 });

  return Object.freeze({
    schema: 'lfea-bm2-cii-output-comparison/v2',
    sourceInputPath: 'benchmarks/LFEA/BM2/Input_BM2.xml',
    sourceOutputPath: 'benchmarks/LFEA/BM2/Output_BM2.xml',
    sourceInputSemanticHash: solved.source.semanticHash,
    comparisonPolicy: BM2_COMPARISON_POLICY,
    solverConditioningProfile: solved.report.solverConditioningProfile,
    qualificationStatus: totals.failed === 0 ? 'WITHIN_TOLERANCE' : 'GAP_DISCLOSED',
    totals: Object.freeze(totals),
    limitations: solved.report.limitations,
    cases: Object.freeze(cases),
  });
}
