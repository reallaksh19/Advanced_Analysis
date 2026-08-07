#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { solveBm4InputXmlConditioned } from './lfea-m034-bm4-solve-runtime.mjs';
import { BM4_COMPARISON_POLICY, loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035FeatureCases } from './lfea-m035-bm4-feature-solve-runtime.mjs';
import {
  M035_BEND_SCORING_EXCLUDED_NODE_IDS,
  M035_LIFTOFF_CROSS_EFFECT_WATCH_NODE_IDS,
  M035_NONLINEAR_SUPPORT_NODE_IDS,
} from './lfea-m035-bm4-scope-policy.mjs';

const NODE_DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const ACTION_FIELDS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);
const TRANSLATION_DOFS = new Set(['UX', 'UY', 'UZ']);
const FORCE_FIELDS = new Set(['fx', 'fy', 'fz']);
const CASE_LABELS = Object.freeze(['SUS', 'OPE', 'EXP']);
const FEATURE_PROBE_NODE_IDS = Object.freeze(['20090', '20160', '20170', '20295', '20300', '21640']);
const nonlinearNodes = new Set(M035_NONLINEAR_SUPPORT_NODE_IDS);
const bendExcludedNodes = new Set(M035_BEND_SCORING_EXCLUDED_NODE_IDS);
const crossEffectNodes = new Set([
  ...M035_NONLINEAR_SUPPORT_NODE_IDS,
  ...M035_LIFTOFF_CROSS_EFFECT_WATCH_NODE_IDS,
]);

function zeroDof() {
  return Object.fromEntries(NODE_DOFS.map((dof) => [dof, 0]));
}
function subtractDof(a, b) {
  return Object.fromEntries(NODE_DOFS.map((dof) => [dof, (a?.[dof] ?? 0) - (b?.[dof] ?? 0)]));
}
function subtractAction(a, b) {
  return Object.fromEntries(ACTION_FIELDS.map((field) => [field, (a?.[field] ?? 0) - (b?.[field] ?? 0)]));
}
function subtractElementActions(ope, sus) {
  return {
    global: {
      I: subtractAction(ope.global.I, sus.global.I),
      J: subtractAction(ope.global.J, sus.global.J),
    },
    local: {
      I: subtractAction(ope.local.I, sus.local.I),
      J: subtractAction(ope.local.J, sus.local.J),
    },
  };
}

function baselineSnapshot(solved) {
  const nodeCases = new Map();
  for (const [label, caseKey] of [['SUS', 'sustained'], ['OPE', 'operating']]) {
    nodeCases.set(label, new Map(solved.report.nodes.map((row) => [String(row.sourceNodeId), {
      displacement: { ...row[caseKey].displacement },
      reaction: { ...row[caseKey].reaction },
    }])));
  }
  nodeCases.set('EXP', new Map(solved.report.nodes.map((row) => [String(row.sourceNodeId), {
    displacement: subtractDof(row.operating.displacement, row.sustained.displacement),
    reaction: subtractDof(row.operating.reaction, row.sustained.reaction),
  }])));

  const elementCases = new Map();
  for (const [label, caseKey] of [['SUS', 'sustained'], ['OPE', 'operating']]) {
    elementCases.set(label, solved.report.elements.map((row) => elementRow({
      fromNode: row.fromNode,
      toNode: row.toNode,
      bendTagged: row.bendTagged,
      rigid: row.rigid,
      actions: row[caseKey],
    })));
  }
  const susByPair = new Map(elementCases.get('SUS').map((row) => [row.pairKey, row]));
  elementCases.set('EXP', elementCases.get('OPE').map((row) => {
    const sus = susByPair.get(row.pairKey);
    return elementRow({
      fromNode: row.fromNode,
      toNode: row.toNode,
      bendTagged: row.bendTagged,
      rigid: row.rigid,
      actions: subtractElementActions(row, sus),
    });
  }));
  return { nodeCases, elementCases };
}

function featureSnapshot(solved) {
  const nodeCases = new Map();
  const reactionSus = new Map(solved.report.nodes.map((row) => [String(row.referenceNodeId), zeroDof()]));
  const reactionOpe = new Map(solved.report.nodes.map((row) => [String(row.referenceNodeId), zeroDof()]));
  for (const row of solved.report.restraints) {
    const nodeId = String(row.referenceNodeId);
    if (!reactionSus.has(nodeId)) reactionSus.set(nodeId, zeroDof());
    if (!reactionOpe.has(nodeId)) reactionOpe.set(nodeId, zeroDof());
    reactionSus.get(nodeId)[row.dof] = row.sustained;
    reactionOpe.get(nodeId)[row.dof] = row.operating;
  }
  nodeCases.set('SUS', new Map(solved.report.nodes.map((row) => [String(row.referenceNodeId), {
    displacement: { ...row.sustained },
    reaction: { ...(reactionSus.get(String(row.referenceNodeId)) ?? zeroDof()) },
  }])));
  nodeCases.set('OPE', new Map(solved.report.nodes.map((row) => [String(row.referenceNodeId), {
    displacement: { ...row.operating },
    reaction: { ...(reactionOpe.get(String(row.referenceNodeId)) ?? zeroDof()) },
  }])));
  nodeCases.set('EXP', new Map(solved.report.nodes.map((row) => {
    const nodeId = String(row.referenceNodeId);
    return [nodeId, {
      displacement: { ...row.expansion },
      reaction: subtractDof(reactionOpe.get(nodeId), reactionSus.get(nodeId)),
    }];
  }));

  const baseBySourceId = new Map(solved.authorities.base.entries.map((row) => [String(row.sourceSegment.id), row]));
  const elementCases = new Map();
  for (const [label, caseKey] of [['SUS', 'sustained'], ['OPE', 'operating'], ['EXP', 'expansion']]) {
    elementCases.set(label, solved.report.elements.map((row) => {
      const base = baseBySourceId.get(String(row.sourceElementId));
      return elementRow({
        fromNode: row.fromNode,
        toNode: row.toNode,
        bendTagged: base?.sourceSegment.type === 'BEND',
        rigid: base?.rigidAuthority !== null,
        actions: row[caseKey],
      });
    }));
  }
  return { nodeCases, elementCases };
}

function elementRow({ fromNode, toNode, bendTagged, rigid, actions }) {
  return {
    pairKey: `${fromNode}-${toNode}`,
    fromNode: String(fromNode),
    toNode: String(toNode),
    bendTagged: Boolean(bendTagged),
    rigid: Boolean(rigid),
    global: actions.global,
    local: actions.local,
  };
}

function absoluteTolerance(family, field) {
  if (family === 'displacement') {
    return TRANSLATION_DOFS.has(field)
      ? BM4_COMPARISON_POLICY.absoluteTolerance.translation
      : BM4_COMPARISON_POLICY.absoluteTolerance.rotation;
  }
  if (TRANSLATION_DOFS.has(field) || FORCE_FIELDS.has(field)) return BM4_COMPARISON_POLICY.absoluteTolerance.force;
  return BM4_COMPARISON_POLICY.absoluteTolerance.moment;
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
  return {
    UX: -row.FX, UY: -row.FY, UZ: -row.FZ,
    RX: -row.MX, RY: -row.MY, RZ: -row.MZ,
  };
}

function deviation({ family, identifier, end, field, ours, cii, meta }) {
  const absoluteDifference = ours - cii;
  const nearZero = Math.abs(cii) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const percentDifference = nearZero ? null : (absoluteDifference / Math.abs(cii)) * 100;
  const tolerance = nearZero ? absoluteTolerance(family, field) : null;
  const passedTarget = nearZero
    ? Math.abs(absoluteDifference) <= tolerance
    : Math.abs(percentDifference) <= BM4_COMPARISON_POLICY.targetTolerancePercent;
  const passedStandingBar = nearZero
    ? Math.abs(absoluteDifference) <= tolerance
    : Math.abs(percentDifference) <= BM4_COMPARISON_POLICY.relativeTolerancePercent;
  const scope = classifyScope({ family, identifier, meta });
  return {
    family, identifier, end, field, ours, cii, absoluteDifference, percentDifference,
    comparisonMode: nearZero ? 'ABSOLUTE_NEAR_ZERO_REFERENCE' : 'RELATIVE_PERCENT',
    passedTarget, passedStandingBar,
    m035Scope: scope,
  };
}

function classifyScope({ family, identifier, meta }) {
  const touchedNodes = meta?.touchedNodes ?? [String(identifier)];
  if (family === 'restraint' && nonlinearNodes.has(String(identifier))) {
    return { included: false, code: 'M036_UNILATERAL_SUPPORT_REACTION_OUT_OF_SCOPE', crossEffectPossible: false };
  }
  if (family === 'displacement' && bendExcludedNodes.has(String(identifier))) {
    return { included: false, code: 'M036_LIFTOFF_BEND_ENDPOINT_OUT_OF_SCOPE', crossEffectPossible: false };
  }
  if ((family === 'globalForce' || family === 'localForce')
      && meta?.bendTagged
      && touchedNodes.some((nodeId) => bendExcludedNodes.has(String(nodeId)))) {
    return { included: false, code: 'M036_LIFTOFF_BEND_ENDPOINT_OUT_OF_SCOPE', crossEffectPossible: false };
  }
  const crossEffectPossible = touchedNodes.some((nodeId) => crossEffectNodes.has(String(nodeId)));
  return {
    included: true,
    code: crossEffectPossible ? 'M036_LIFTOFF_LOAD_PATH_CROSS_EFFECT_POSSIBLE' : 'M035_IN_SCOPE',
    crossEffectPossible,
  };
}

function compareNodeFamily({ family, ownByNode, ciiMap }) {
  const rows = [];
  const unmatchedCiiNodes = [];
  const unmatchedOwnNodes = [];
  for (const [nodeId, ciiRow] of ciiMap) {
    const own = ownByNode.get(String(nodeId));
    if (!own) { unmatchedCiiNodes.push(String(nodeId)); continue; }
    const ciiValue = family === 'displacement' ? ciiDisplacement(ciiRow) : ciiRestraint(ciiRow);
    const ownValue = family === 'displacement' ? own.displacement : own.reaction;
    for (const field of NODE_DOFS) {
      rows.push(deviation({
        family,
        identifier: String(nodeId),
        end: null,
        field,
        ours: ownValue[field] ?? 0,
        cii: ciiValue[field],
        meta: { touchedNodes: [String(nodeId)] },
      }));
    }
  }
  for (const nodeId of ownByNode.keys()) if (!ciiMap.has(nodeId)) unmatchedOwnNodes.push(String(nodeId));
  return { rows, unmatchedCiiNodes, unmatchedOwnNodes };
}

function compareElementFamily({ family, ownField, ownElements, ciiByPair }) {
  const rows = [];
  const unmatchedCiiPairs = [];
  const elementsByPair = new Map(ownElements.map((row) => [row.pairKey, row]));
  for (const [pairKey, ciiGroup] of ciiByPair) {
    if (ciiGroup.length !== 1) {
      unmatchedCiiPairs.push({ pairKey, reason: `${ciiGroup.length} CAESAR rows share this pair` });
      continue;
    }
    const own = elementsByPair.get(pairKey);
    if (!own) {
      unmatchedCiiPairs.push({ pairKey, reason: 'no matching source element (CAESAR bend/internal station split)' });
      continue;
    }
    const cii = ciiGroup[0];
    for (const end of ['I', 'J']) {
      for (const field of ACTION_FIELDS) {
        rows.push(deviation({
          family,
          identifier: pairKey,
          end,
          field,
          ours: own[ownField][end][field],
          cii: cii[end][field],
          meta: {
            touchedNodes: [String(cii.fromNode), String(cii.toNode)],
            bendTagged: own.bendTagged,
            rigid: own.rigid,
          },
        }));
      }
    }
  }
  const matched = new Set([...ciiByPair.entries()]
    .filter(([pairKey, group]) => group.length === 1 && elementsByPair.has(pairKey))
    .map(([pairKey]) => pairKey));
  return {
    rows,
    unmatchedCiiPairs,
    unmatchedOwnPairs: [...elementsByPair.keys()].filter((pairKey) => !matched.has(pairKey)),
  };
}

function compareSnapshot(snapshot, cii) {
  const cases = {};
  for (const label of CASE_LABELS) {
    const ownByNode = snapshot.nodeCases.get(label);
    const ownElements = snapshot.elementCases.get(label);
    cases[label] = {
      displacement: compareNodeFamily({ family: 'displacement', ownByNode, ciiMap: cii.displacement.get(label) }),
      restraint: compareNodeFamily({ family: 'restraint', ownByNode, ciiMap: cii.restraint.get(label) }),
      globalForce: compareElementFamily({ family: 'globalForce', ownField: 'global', ownElements, ciiByPair: cii.globalForce.get(label).byPair }),
      localForce: compareElementFamily({ family: 'localForce', ownField: 'local', ownElements, ciiByPair: cii.localForce.get(label).byPair }),
    };
  }
  return cases;
}

function summarizeRows(rows, scoped = false) {
  const considered = scoped ? rows.filter((row) => row.m035Scope.included) : rows;
  const targetPass = considered.filter((row) => row.passedTarget).length;
  const standingPass = considered.filter((row) => row.passedStandingBar).length;
  return {
    comparisons: considered.length,
    passedTarget5pct: targetPass,
    failedTarget5pct: considered.length - targetPass,
    target5pctRate: considered.length === 0 ? null : targetPass / considered.length,
    passedStandingBar10pct: standingPass,
    failedStandingBar10pct: considered.length - standingPass,
    standingBar10pctRate: considered.length === 0 ? null : standingPass / considered.length,
  };
}

function flattenFamilies(cases, familyNames) {
  return CASE_LABELS.flatMap((label) => familyNames.flatMap((family) => cases[label][family].rows));
}

function aggregateSummary(cases) {
  const displacement = flattenFamilies(cases, ['displacement']);
  const forces = flattenFamilies(cases, ['restraint', 'globalForce', 'localForce']);
  const all = [...displacement, ...forces];
  return {
    raw: {
      displacement: summarizeRows(displacement, false),
      forces: summarizeRows(forces, false),
      all: summarizeRows(all, false),
    },
    scoped: {
      displacement: summarizeRows(displacement, true),
      forces: summarizeRows(forces, true),
      all: summarizeRows(all, true),
    },
  };
}

function caseSummary(cases) {
  return Object.fromEntries(CASE_LABELS.map((label) => [label, Object.fromEntries(
    ['displacement', 'restraint', 'globalForce', 'localForce'].map((family) => [family, {
      raw: summarizeRows(cases[label][family].rows, false),
      scoped: summarizeRows(cases[label][family].rows, true),
      unmatchedCii: cases[label][family].unmatchedCiiNodes?.length ?? cases[label][family].unmatchedCiiPairs?.length ?? 0,
    }]),
  )]));
}

function ratePct(summary) {
  return summary.target5pctRate === null ? null : summary.target5pctRate * 100;
}
function deltaPoints(after, before) {
  if (after.target5pctRate === null || before.target5pctRate === null) return null;
  return (after.target5pctRate - before.target5pctRate) * 100;
}

function probeRows(cases) {
  const result = {};
  for (const label of CASE_LABELS) {
    result[label] = {};
    for (const nodeId of FEATURE_PROBE_NODE_IDS) {
      result[label][nodeId] = {};
      for (const family of ['displacement', 'restraint']) {
        result[label][nodeId][family] = cases[label][family].rows.filter((row) => row.identifier === nodeId);
      }
    }
  }
  return result;
}

function compactProbe(cases, nodeId, family, field = 'UY') {
  const result = {};
  for (const label of CASE_LABELS) {
    const row = cases[label][family].rows.find((candidate) => candidate.identifier === nodeId && candidate.field === field);
    if (row) result[label] = { ours: row.ours, cii: row.cii, pct: row.percentDifference, pass5: row.passedTarget, scope: row.m035Scope.code };
  }
  return result;
}

function flattenCaseForces(caseRecord) {
  return ['restraint', 'globalForce', 'localForce'].flatMap((family) => caseRecord[family].rows);
}

function main() {
  console.log('\n--- M035 BM4 CASE 19/20/21 before/after CAESAR comparison ---\n');
  const cii = loadBm4CiiOutputCases1921();
  const baselineSolved = solveBm4InputXmlConditioned();
  const featureSolved = solveBm4M035FeatureCases();
  const baselineCases = compareSnapshot(baselineSnapshot(baselineSolved), cii);
  const featureCases = compareSnapshot(featureSnapshot(featureSolved), cii);
  const baselineAggregate = aggregateSummary(baselineCases);
  const featureAggregate = aggregateSummary(featureCases);
  const report = {
    schema: 'm035-bm4-before-after-cases-19-20-21/v1',
    policies: {
      comparison: BM4_COMPARISON_POLICY,
      scope: {
        nonlinearSupportNodeIds: M035_NONLINEAR_SUPPORT_NODE_IDS,
        bendScoringExcludedNodeIds: M035_BEND_SCORING_EXCLUDED_NODE_IDS,
        liftOffCrossEffectWatchNodeIds: M035_LIFTOFF_CROSS_EFFECT_WATCH_NODE_IDS,
      },
    },
    featureModel: {
      summary: featureSolved.report.summary,
      sustainedSolverStatus: featureSolved.sustained.execution.status,
      operatingSolverStatus: featureSolved.operating.execution.status,
      limitations: featureSolved.report.limitations,
    },
    baseline: { aggregate: baselineAggregate, cases: baselineCases, caseSummary: caseSummary(baselineCases) },
    m035: { aggregate: featureAggregate, cases: featureCases, caseSummary: caseSummary(featureCases) },
    deltaPercentagePoints: {
      rawDisplacement5pct: deltaPoints(featureAggregate.raw.displacement, baselineAggregate.raw.displacement),
      rawForces5pct: deltaPoints(featureAggregate.raw.forces, baselineAggregate.raw.forces),
      scopedDisplacement5pct: deltaPoints(featureAggregate.scoped.displacement, baselineAggregate.scoped.displacement),
      scopedForces5pct: deltaPoints(featureAggregate.scoped.forces, baselineAggregate.scoped.forces),
    },
    probes: { baseline: probeRows(baselineCases), m035: probeRows(featureCases) },
  };

  const compact = {
    baseline: {
      rawDisplacement5pct: ratePct(baselineAggregate.raw.displacement),
      rawForces5pct: ratePct(baselineAggregate.raw.forces),
      scopedDisplacement5pct: ratePct(baselineAggregate.scoped.displacement),
      scopedForces5pct: ratePct(baselineAggregate.scoped.forces),
    },
    m035: {
      rawDisplacement5pct: ratePct(featureAggregate.raw.displacement),
      rawForces5pct: ratePct(featureAggregate.raw.forces),
      scopedDisplacement5pct: ratePct(featureAggregate.scoped.displacement),
      scopedForces5pct: ratePct(featureAggregate.scoped.forces),
    },
    deltaPercentagePoints: report.deltaPercentagePoints,
    solver: report.featureModel,
    probes: {
      node20300RestraintUY: { baseline: compactProbe(baselineCases, '20300', 'restraint'), m035: compactProbe(featureCases, '20300', 'restraint') },
      node20170RestraintUY: { baseline: compactProbe(baselineCases, '20170', 'restraint'), m035: compactProbe(featureCases, '20170', 'restraint') },
      node20090RestraintUY: { baseline: compactProbe(baselineCases, '20090', 'restraint'), m035: compactProbe(featureCases, '20090', 'restraint') },
    },
  };

  mkdirSync(fileURLToPath(new URL('../reports', import.meta.url)), { recursive: true });
  writeFileSync(
    fileURLToPath(new URL('../reports/m035-bm4-before-after-cases-19-20-21.json', import.meta.url)),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  console.log(`M035_COMPARISON_SUMMARY=${JSON.stringify(compact)}`);
  for (const label of CASE_LABELS) {
    const b = report.baseline.caseSummary[label];
    const m = report.m035.caseSummary[label];
    const baselineForces = summarizeRows(flattenCaseForces(baselineCases[label]), false);
    const featureForces = summarizeRows(flattenCaseForces(featureCases[label]), false);
    console.log(`CASE ${label}: baseline displacement 5%=${ratePct(b.displacement.raw).toFixed(2)}% forces 5%=${ratePct(baselineForces).toFixed(2)}% | M035 displacement 5%=${ratePct(m.displacement.raw).toFixed(2)}% forces 5%=${ratePct(featureForces).toFixed(2)}%`);
  }
  console.log('Full report written to reports/m035-bm4-before-after-cases-19-20-21.json');
  return report;
}

main();
