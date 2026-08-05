import { readFileSync } from 'node:fs';
import {
  BM2_CII_OUTPUT_PATH,
  BM2_COMPARISON_POLICY,
  parseBm2CiiOutput,
} from './lfea-b3.26-bm2-output-comparison.mjs';
import {
  absoluteToleranceForComparison,
  BM2_COMPARISON_FAMILIES,
} from './lfea-b3.26-bm2-output-comparison-runtime.mjs';
import { solveBm2WithDirectionalRestraints } from './lfea-b3.27-bm2-restraint-active-set-runtime.mjs';

const CASES = Object.freeze(['OPE', 'SUS', 'EXP']);
const NODE_DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const ACTION_FIELDS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);

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
  return {
    UX: -row.FX,
    UY: -row.FY,
    UZ: -row.FZ,
    RX: -row.MX,
    RY: -row.MY,
    RZ: -row.MZ,
  };
}

function ownValues(report) {
  const cases = Object.fromEntries(
    CASES.map((label) => [label, { nodes: new Map(), pairs: new Map() }]),
  );
  for (const node of report.nodes) {
    cases.OPE.nodes.set(node.sourceNodeId, node.operating);
    cases.SUS.nodes.set(node.sourceNodeId, node.sustained);
    cases.EXP.nodes.set(node.sourceNodeId, {
      displacement: Object.fromEntries(NODE_DOFS.map((field) => [
        field,
        node.operating.displacement[field] - node.sustained.displacement[field],
      ])),
      reaction: Object.fromEntries(NODE_DOFS.map((field) => [
        field,
        node.operating.reaction[field] - node.sustained.reaction[field],
      ])),
    });
  }
  const subtract = (left, right) => Object.fromEntries(
    ACTION_FIELDS.map((field) => [field, left[field] - right[field]]),
  );
  for (const element of report.elements) {
    const key = `${element.fromNode}-${element.toNode}`;
    cases.OPE.pairs.set(key, {
      global: element.operating.global,
      local: element.operating.local,
    });
    cases.SUS.pairs.set(key, {
      global: element.sustained.global,
      local: element.sustained.local,
    });
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

function causes({ family, nodeId, pairKey, elementByPair, branchNodeIds, directionalNodeIds }) {
  const values = [];
  if (family === 'restraint' || directionalNodeIds.has(nodeId)) {
    values.push('BM2_DIRECTIONAL_RESTRAINT_ACTIVE_SET_RESIDUAL');
  }
  const element = pairKey ? elementByPair.get(pairKey) : null;
  if (element?.bendTagged) values.push('BM2_BEND_CHORD_STIFFNESS_ONLY');
  if (element?.rigid) values.push('BM2_RIGID_BODY_LOAD_DISTRIBUTION_ASSUMPTION');
  if (branchNodeIds.has(nodeId) || pairKey?.split('-').some((id) => branchNodeIds.has(id))) {
    values.push('BM2_BRANCH_JUNCTION_FLEXIBILITY_NOT_APPLIED');
  }
  values.push('BM2_GLOBAL_STIFFNESS_INCOMPLETE_BEND_BRANCH_MODEL');
  return [...new Set(values)];
}

function scalar({ caseLabel, family, identifier, end = null, field, ours, cii, context }) {
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
  return Object.freeze({
    comparisons: rows.length,
    passed,
    failed: rows.length - passed,
    untraced: rows.filter((row) => !row.passed && row.causeCodes.length === 0).length,
  });
}

function compareLedger(before, after) {
  const key = (row) => [
    row.caseLabel,
    row.family,
    row.identifier,
    row.end ?? '',
    row.field,
  ].join('|');
  const flatten = (comparison) => Object.values(comparison.cases).flatMap((section) => (
    BM2_COMPARISON_FAMILIES.flatMap((family) => section[family].rows)
  ));
  const prior = new Map(flatten(before).map((row) => [key(row), row]));
  const current = new Map(flatten(after).map((row) => [key(row), row]));
  const newlyPassed = [];
  const newlyFailed = [];
  for (const [rowKey, row] of current) {
    const priorRow = prior.get(rowKey);
    if (!priorRow) continue;
    if (!priorRow.passed && row.passed) newlyPassed.push(rowKey);
    if (priorRow.passed && !row.passed) newlyFailed.push(rowKey);
  }
  return Object.freeze({
    newlyPassed: Object.freeze(newlyPassed.sort()),
    newlyFailed: Object.freeze(newlyFailed.sort()),
    netFailureChange: after.totals.failed - before.totals.failed,
  });
}

function buildComparisonFromSolved(solved) {
  const cii = parseBm2CiiOutput(readFileSync(BM2_CII_OUTPUT_PATH, 'utf8'));
  const ours = ownValues(solved.report);
  const ownNodeIds = new Set(solved.report.nodes.map((row) => row.sourceNodeId));
  const ownPairKeys = new Set(solved.report.elements.map((row) => `${row.fromNode}-${row.toNode}`));
  const elementByPair = new Map(
    solved.report.elements.map((row) => [`${row.fromNode}-${row.toNode}`, row]),
  );
  const branchNodeIds = new Set(['30', '60', '70', '100', '140', '150']);
  const directionalNodeIds = new Set(solved.directional.map((row) => row.sourceNodeId));
  const cases = {};

  for (const caseLabel of CASES) {
    const displacement = [];
    const unmatchedDisplacementNodes = [];
    for (const [nodeId, reference] of cii.displacement.get(caseLabel)) {
      if (!ownNodeIds.has(nodeId)) {
        unmatchedDisplacementNodes.push(nodeId);
        continue;
      }
      const ciiRow = ciiDisplacement(reference);
      const ownRow = ours[caseLabel].nodes.get(nodeId).displacement;
      for (const field of NODE_DOFS) {
        displacement.push(scalar({
          caseLabel,
          family: 'displacement',
          identifier: nodeId,
          field,
          ours: ownRow[field],
          cii: ciiRow[field],
          context: {
            family: 'displacement',
            nodeId,
            pairKey: null,
            elementByPair,
            branchNodeIds,
            directionalNodeIds,
          },
        }));
      }
    }

    const restraint = [];
    const unmatchedRestraintNodes = [];
    for (const [nodeId, reference] of cii.restraint.get(caseLabel)) {
      if (!ownNodeIds.has(nodeId)) {
        unmatchedRestraintNodes.push(nodeId);
        continue;
      }
      const ciiRow = ciiRestraint(reference);
      const ownRow = ours[caseLabel].nodes.get(nodeId).reaction;
      for (const field of NODE_DOFS) {
        restraint.push(scalar({
          caseLabel,
          family: 'restraint',
          identifier: nodeId,
          field,
          ours: ownRow[field],
          cii: ciiRow[field],
          context: {
            family: 'restraint',
            nodeId,
            pairKey: null,
            elementByPair,
            branchNodeIds,
            directionalNodeIds,
          },
        }));
      }
    }

    const compareActions = (family, referenceMap, ownField) => {
      const rows = [];
      const unmatchedPairKeys = [];
      for (const [pairKey, reference] of referenceMap) {
        if (!ownPairKeys.has(pairKey)) {
          unmatchedPairKeys.push(pairKey);
          continue;
        }
        const ownRow = ours[caseLabel].pairs.get(pairKey)[ownField];
        for (const end of ['I', 'J']) {
          for (const field of ACTION_FIELDS) {
            rows.push(scalar({
              caseLabel,
              family,
              identifier: pairKey,
              end,
              field,
              ours: ownRow[end][field],
              cii: reference[end][field],
              context: {
                family,
                nodeId: null,
                pairKey,
                elementByPair,
                branchNodeIds,
                directionalNodeIds,
              },
            }));
          }
        }
      }
      return Object.freeze({
        rows: Object.freeze(rows),
        unmatchedPairKeys: Object.freeze(unmatchedPairKeys),
        summary: summary(rows),
      });
    };

    const globalForce = compareActions('globalForce', cii.globalForce.get(caseLabel), 'global');
    const localForce = compareActions('localForce', cii.localForce.get(caseLabel), 'local');
    cases[caseLabel] = Object.freeze({
      displacement: Object.freeze({
        rows: Object.freeze(displacement),
        unmatchedNodes: Object.freeze(unmatchedDisplacementNodes),
        summary: summary(displacement),
      }),
      restraint: Object.freeze({
        rows: Object.freeze(restraint),
        unmatchedNodes: Object.freeze(unmatchedRestraintNodes),
        summary: summary(restraint),
      }),
      globalForce,
      localForce,
    });
  }

  const summaries = Object.values(cases).flatMap((section) => [
    section.displacement.summary,
    section.restraint.summary,
    section.globalForce.summary,
    section.localForce.summary,
  ]);
  const totals = summaries.reduce((accumulator, row) => ({
    comparisons: accumulator.comparisons + row.comparisons,
    passed: accumulator.passed + row.passed,
    failed: accumulator.failed + row.failed,
    untraced: accumulator.untraced + row.untraced,
  }), { comparisons: 0, passed: 0, failed: 0, untraced: 0 });

  return Object.freeze({
    schema: 'lfea-bm2-cii-output-comparison/v4',
    sourceInputPath: 'benchmarks/LFEA/BM2/Input_BM2.xml',
    sourceOutputPath: 'benchmarks/LFEA/BM2/Output_BM2.xml',
    sourceInputSemanticHash: solved.source.semanticHash,
    comparisonPolicy: BM2_COMPARISON_POLICY,
    toleranceAuthority: 'RESULT_FAMILY_AND_COMPONENT_V1',
    restraintAuthority: 'INPUTXML_MUTATION_PLUS_DIRECTIONAL_ACTIVE_SET_V1',
    solverConditioningProfile: solved.report.solverConditioningProfile,
    directionalContact: solved.report.contactCases,
    qualificationStatus: totals.failed === 0 ? 'WITHIN_TOLERANCE' : 'GAP_DISCLOSED',
    totals: Object.freeze(totals),
    limitations: solved.report.limitations,
    cases: Object.freeze(cases),
  });
}

export function buildBm2DirectionalRestraintComparison(baselineComparison) {
  const solved = solveBm2WithDirectionalRestraints();
  const comparison = buildComparisonFromSolved(solved);
  return Object.freeze({
    solved,
    comparison,
    delta: compareLedger(baselineComparison, comparison),
  });
}
