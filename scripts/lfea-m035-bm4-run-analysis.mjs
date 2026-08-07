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

const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const ACTIONS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);
const TRANSLATIONS = new Set(['UX', 'UY', 'UZ']);
const FORCES = new Set(['fx', 'fy', 'fz']);
const NONLINEAR = new Set(M035_NONLINEAR_SUPPORT_NODE_IDS);
const BEND_EXCLUDED = new Set(M035_BEND_SCORING_EXCLUDED_NODE_IDS);
const CROSS_EFFECT = new Set([
  ...M035_NONLINEAR_SUPPORT_NODE_IDS,
  ...M035_LIFTOFF_CROSS_EFFECT_WATCH_NODE_IDS,
]);

function zeroDof() {
  return Object.fromEntries(DOFS.map((dof) => [dof, 0]));
}
function subtractDof(a = {}, b = {}) {
  return Object.fromEntries(DOFS.map((dof) => [dof, (a[dof] ?? 0) - (b[dof] ?? 0)]));
}
function subtractAction(a = {}, b = {}) {
  return Object.fromEntries(ACTIONS.map((field) => [field, (a[field] ?? 0) - (b[field] ?? 0)]));
}
function subtractActions(ope, sus) {
  return {
    global: { I: subtractAction(ope.global.I, sus.global.I), J: subtractAction(ope.global.J, sus.global.J) },
    local: { I: subtractAction(ope.local.I, sus.local.I), J: subtractAction(ope.local.J, sus.local.J) },
  };
}
function ownElement({ fromNode, toNode, bendTagged, rigid, actions }) {
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

function baselineSnapshot(solved) {
  const nodes = new Map();
  const susNodes = new Map();
  const opeNodes = new Map();
  const expNodes = new Map();
  for (const row of solved.report.nodes) {
    const id = String(row.sourceNodeId);
    susNodes.set(id, { displacement: { ...row.sustained.displacement }, reaction: { ...row.sustained.reaction } });
    opeNodes.set(id, { displacement: { ...row.operating.displacement }, reaction: { ...row.operating.reaction } });
    expNodes.set(id, {
      displacement: subtractDof(row.operating.displacement, row.sustained.displacement),
      reaction: subtractDof(row.operating.reaction, row.sustained.reaction),
    });
  }
  nodes.set('SUS', susNodes);
  nodes.set('OPE', opeNodes);
  nodes.set('EXP', expNodes);

  const elements = new Map();
  const susElements = solved.report.elements.map((row) => ownElement({
    fromNode: row.fromNode,
    toNode: row.toNode,
    bendTagged: row.bendTagged,
    rigid: row.rigid,
    actions: row.sustained,
  }));
  const opeElements = solved.report.elements.map((row) => ownElement({
    fromNode: row.fromNode,
    toNode: row.toNode,
    bendTagged: row.bendTagged,
    rigid: row.rigid,
    actions: row.operating,
  }));
  const susByPair = new Map(susElements.map((row) => [row.pairKey, row]));
  const expElements = opeElements.map((ope) => ownElement({
    fromNode: ope.fromNode,
    toNode: ope.toNode,
    bendTagged: ope.bendTagged,
    rigid: ope.rigid,
    actions: subtractActions(ope, susByPair.get(ope.pairKey)),
  }));
  elements.set('SUS', susElements);
  elements.set('OPE', opeElements);
  elements.set('EXP', expElements);
  return { nodes, elements };
}

function featureSnapshot(solved) {
  const reactionsSus = new Map();
  const reactionsOpe = new Map();
  for (const row of solved.report.nodes) {
    reactionsSus.set(String(row.referenceNodeId), zeroDof());
    reactionsOpe.set(String(row.referenceNodeId), zeroDof());
  }
  for (const row of solved.report.restraints) {
    const id = String(row.referenceNodeId);
    if (!reactionsSus.has(id)) reactionsSus.set(id, zeroDof());
    if (!reactionsOpe.has(id)) reactionsOpe.set(id, zeroDof());
    reactionsSus.get(id)[row.dof] = row.sustained;
    reactionsOpe.get(id)[row.dof] = row.operating;
  }

  const nodes = new Map([['SUS', new Map()], ['OPE', new Map()], ['EXP', new Map()]]);
  for (const row of solved.report.nodes) {
    const id = String(row.referenceNodeId);
    nodes.get('SUS').set(id, { displacement: { ...row.sustained }, reaction: { ...(reactionsSus.get(id) ?? zeroDof()) } });
    nodes.get('OPE').set(id, { displacement: { ...row.operating }, reaction: { ...(reactionsOpe.get(id) ?? zeroDof()) } });
    nodes.get('EXP').set(id, { displacement: { ...row.expansion }, reaction: subtractDof(reactionsOpe.get(id), reactionsSus.get(id)) });
  }

  const baseById = new Map(solved.authorities.base.entries.map((row) => [String(row.sourceSegment.id), row]));
  const elements = new Map();
  for (const [label, key] of [['SUS', 'sustained'], ['OPE', 'operating'], ['EXP', 'expansion']]) {
    const rows = [];
    for (const row of solved.report.elements) {
      const base = baseById.get(String(row.sourceElementId));
      rows.push(ownElement({
        fromNode: row.fromNode,
        toNode: row.toNode,
        bendTagged: base?.sourceSegment.type === 'BEND',
        rigid: base?.rigidAuthority !== null,
        actions: row[key],
      }));
    }
    elements.set(label, rows);
  }
  return { nodes, elements };
}

function absoluteTolerance(family, field) {
  if (family === 'displacement') {
    return TRANSLATIONS.has(field)
      ? BM4_COMPARISON_POLICY.absoluteTolerance.translation
      : BM4_COMPARISON_POLICY.absoluteTolerance.rotation;
  }
  if (TRANSLATIONS.has(field) || FORCES.has(field)) return BM4_COMPARISON_POLICY.absoluteTolerance.force;
  return BM4_COMPARISON_POLICY.absoluteTolerance.moment;
}
function ciiDisplacement(row) {
  return {
    UX: row.DX / 1000, UY: row.DY / 1000, UZ: row.DZ / 1000,
    RX: row.RX * Math.PI / 180, RY: row.RY * Math.PI / 180, RZ: row.RZ * Math.PI / 180,
  };
}
function ciiRestraint(row) {
  return { UX: -row.FX, UY: -row.FY, UZ: -row.FZ, RX: -row.MX, RY: -row.MY, RZ: -row.MZ };
}

function scopeFor({ family, identifier, touchedNodes, bendTagged }) {
  const id = String(identifier);
  if (family === 'restraint' && NONLINEAR.has(id)) {
    return { included: false, code: 'M036_UNILATERAL_SUPPORT_REACTION_OUT_OF_SCOPE', crossEffectPossible: false };
  }
  if (family === 'displacement' && BEND_EXCLUDED.has(id)) {
    return { included: false, code: 'M036_LIFTOFF_BEND_ENDPOINT_OUT_OF_SCOPE', crossEffectPossible: false };
  }
  if ((family === 'globalForce' || family === 'localForce')
      && bendTagged
      && touchedNodes.some((nodeId) => BEND_EXCLUDED.has(String(nodeId)))) {
    return { included: false, code: 'M036_LIFTOFF_BEND_ENDPOINT_OUT_OF_SCOPE', crossEffectPossible: false };
  }
  const crossEffectPossible = touchedNodes.some((nodeId) => CROSS_EFFECT.has(String(nodeId)));
  return {
    included: true,
    code: crossEffectPossible ? 'M036_LIFTOFF_LOAD_PATH_CROSS_EFFECT_POSSIBLE' : 'M035_IN_SCOPE',
    crossEffectPossible,
  };
}

function deviation({ family, identifier, end, field, ours, cii, touchedNodes, bendTagged = false }) {
  const absoluteDifference = ours - cii;
  const nearZero = Math.abs(cii) <= BM4_COMPARISON_POLICY.nearZeroReferenceThreshold;
  const percentDifference = nearZero ? null : absoluteDifference / Math.abs(cii) * 100;
  const absoluteLimit = nearZero ? absoluteTolerance(family, field) : null;
  const passedTarget = nearZero
    ? Math.abs(absoluteDifference) <= absoluteLimit
    : Math.abs(percentDifference) <= BM4_COMPARISON_POLICY.targetTolerancePercent;
  const passedStandingBar = nearZero
    ? Math.abs(absoluteDifference) <= absoluteLimit
    : Math.abs(percentDifference) <= BM4_COMPARISON_POLICY.relativeTolerancePercent;
  return {
    family, identifier, end, field, ours, cii, absoluteDifference, percentDifference,
    comparisonMode: nearZero ? 'ABSOLUTE_NEAR_ZERO_REFERENCE' : 'RELATIVE_PERCENT',
    passedTarget, passedStandingBar,
    m035Scope: scopeFor({ family, identifier, touchedNodes, bendTagged }),
  };
}

function compareNodes(family, ownByNode, ciiMap) {
  const rows = [];
  const unmatchedCiiNodes = [];
  for (const [nodeIdRaw, ciiRow] of ciiMap) {
    const nodeId = String(nodeIdRaw);
    const own = ownByNode.get(nodeId);
    if (!own) { unmatchedCiiNodes.push(nodeId); continue; }
    const ciiValue = family === 'displacement' ? ciiDisplacement(ciiRow) : ciiRestraint(ciiRow);
    const ownValue = family === 'displacement' ? own.displacement : own.reaction;
    for (const field of DOFS) {
      rows.push(deviation({
        family, identifier: nodeId, end: null, field,
        ours: ownValue[field] ?? 0, cii: ciiValue[field], touchedNodes: [nodeId],
      }));
    }
  }
  const unmatchedOwnNodes = [...ownByNode.keys()].filter((nodeId) => !ciiMap.has(nodeId));
  return { rows, unmatchedCiiNodes, unmatchedOwnNodes };
}

function compareElements(family, ownField, ownElements, ciiByPair) {
  const rows = [];
  const unmatchedCiiPairs = [];
  const byPair = new Map(ownElements.map((row) => [row.pairKey, row]));
  const matched = new Set();
  for (const [pairKey, ciiGroup] of ciiByPair) {
    if (ciiGroup.length !== 1) {
      unmatchedCiiPairs.push({ pairKey, reason: `${ciiGroup.length} CAESAR rows share this pair` });
      continue;
    }
    const own = byPair.get(pairKey);
    if (!own) {
      unmatchedCiiPairs.push({ pairKey, reason: 'no matching source element (CAESAR bend/internal station split)' });
      continue;
    }
    matched.add(pairKey);
    const cii = ciiGroup[0];
    const touchedNodes = [String(cii.fromNode), String(cii.toNode)];
    for (const end of ['I', 'J']) {
      for (const field of ACTIONS) {
        rows.push(deviation({
          family, identifier: pairKey, end, field,
          ours: own[ownField][end][field], cii: cii[end][field], touchedNodes, bendTagged: own.bendTagged,
        }));
      }
    }
  }
  return { rows, unmatchedCiiPairs, unmatchedOwnPairs: [...byPair.keys()].filter((pairKey) => !matched.has(pairKey)) };
}

function compareSnapshot(snapshot, cii) {
  const result = {};
  for (const label of CASES) {
    result[label] = {
      displacement: compareNodes('displacement', snapshot.nodes.get(label), cii.displacement.get(label)),
      restraint: compareNodes('restraint', snapshot.nodes.get(label), cii.restraint.get(label)),
      globalForce: compareElements('globalForce', 'global', snapshot.elements.get(label), cii.globalForce.get(label).byPair),
      localForce: compareElements('localForce', 'local', snapshot.elements.get(label), cii.localForce.get(label).byPair),
    };
  }
  return result;
}

function summarize(rows, scoped) {
  const selected = scoped ? rows.filter((row) => row.m035Scope.included) : rows;
  const pass5 = selected.filter((row) => row.passedTarget).length;
  const pass10 = selected.filter((row) => row.passedStandingBar).length;
  return {
    comparisons: selected.length,
    passedTarget5pct: pass5,
    failedTarget5pct: selected.length - pass5,
    target5pctRate: selected.length ? pass5 / selected.length : null,
    passedStandingBar10pct: pass10,
    failedStandingBar10pct: selected.length - pass10,
    standingBar10pctRate: selected.length ? pass10 / selected.length : null,
  };
}
function allRows(cases, families) {
  const rows = [];
  for (const label of CASES) for (const family of families) rows.push(...cases[label][family].rows);
  return rows;
}
function aggregate(cases) {
  const displacement = allRows(cases, ['displacement']);
  const forces = allRows(cases, ['restraint', 'globalForce', 'localForce']);
  const combined = [...displacement, ...forces];
  return {
    raw: { displacement: summarize(displacement, false), forces: summarize(forces, false), all: summarize(combined, false) },
    scoped: { displacement: summarize(displacement, true), forces: summarize(forces, true), all: summarize(combined, true) },
  };
}
function summarizeCases(cases) {
  const output = {};
  for (const label of CASES) {
    output[label] = {};
    for (const family of ['displacement', 'restraint', 'globalForce', 'localForce']) {
      const record = cases[label][family];
      output[label][family] = {
        raw: summarize(record.rows, false),
        scoped: summarize(record.rows, true),
        unmatchedCii: record.unmatchedCiiNodes?.length ?? record.unmatchedCiiPairs?.length ?? 0,
      };
    }
  }
  return output;
}
function ratePct(summary) {
  return summary.target5pctRate === null ? null : summary.target5pctRate * 100;
}
function deltaPctPoints(after, before) {
  if (after.target5pctRate === null || before.target5pctRate === null) return null;
  return (after.target5pctRate - before.target5pctRate) * 100;
}
function caseForceSummary(cases, label) {
  return summarize([
    ...cases[label].restraint.rows,
    ...cases[label].globalForce.rows,
    ...cases[label].localForce.rows,
  ], false);
}
function probe(cases, nodeId, family = 'restraint', field = 'UY') {
  const output = {};
  for (const label of CASES) {
    const row = cases[label][family].rows.find((candidate) => candidate.identifier === nodeId && candidate.field === field);
    if (row) output[label] = {
      ours: row.ours, cii: row.cii, percentDifference: row.percentDifference,
      passed5pct: row.passedTarget, scope: row.m035Scope.code,
    };
  }
  return output;
}

function main() {
  console.log('\n--- M035 BM4 CASE 19/20/21 before/after CAESAR comparison ---\n');
  const cii = loadBm4CiiOutputCases1921();
  const baselineSolved = solveBm4InputXmlConditioned();
  const featureSolved = solveBm4M035FeatureCases();
  const baselineCases = compareSnapshot(baselineSnapshot(baselineSolved), cii);
  const featureCases = compareSnapshot(featureSnapshot(featureSolved), cii);
  const baselineAggregate = aggregate(baselineCases);
  const featureAggregate = aggregate(featureCases);

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
    baseline: { aggregate: baselineAggregate, caseSummary: summarizeCases(baselineCases), cases: baselineCases },
    m035: { aggregate: featureAggregate, caseSummary: summarizeCases(featureCases), cases: featureCases },
    deltaPercentagePoints: {
      rawDisplacement5pct: deltaPctPoints(featureAggregate.raw.displacement, baselineAggregate.raw.displacement),
      rawForces5pct: deltaPctPoints(featureAggregate.raw.forces, baselineAggregate.raw.forces),
      scopedDisplacement5pct: deltaPctPoints(featureAggregate.scoped.displacement, baselineAggregate.scoped.displacement),
      scopedForces5pct: deltaPctPoints(featureAggregate.scoped.forces, baselineAggregate.scoped.forces),
    },
    probes: {
      node20090RestraintUY: { baseline: probe(baselineCases, '20090'), m035: probe(featureCases, '20090') },
      node20170RestraintUY: { baseline: probe(baselineCases, '20170'), m035: probe(featureCases, '20170') },
      node20300RestraintUY: { baseline: probe(baselineCases, '20300'), m035: probe(featureCases, '20300') },
    },
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
    probes: report.probes,
  };

  const reportDir = fileURLToPath(new URL('../reports', import.meta.url));
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(
    fileURLToPath(new URL('../reports/m035-bm4-before-after-cases-19-20-21.json', import.meta.url)),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  console.log(`M035_COMPARISON_SUMMARY=${JSON.stringify(compact)}`);
  for (const label of CASES) {
    const baselineDisplacement = report.baseline.caseSummary[label].displacement.raw;
    const featureDisplacement = report.m035.caseSummary[label].displacement.raw;
    const baselineForces = caseForceSummary(baselineCases, label);
    const featureForces = caseForceSummary(featureCases, label);
    console.log(
      `CASE ${label}: baseline displacement 5%=${ratePct(baselineDisplacement).toFixed(2)}% forces 5%=${ratePct(baselineForces).toFixed(2)}%`
      + ` | M035 displacement 5%=${ratePct(featureDisplacement).toFixed(2)}% forces 5%=${ratePct(featureForces).toFixed(2)}%`,
    );
  }
  console.log('Full report written to reports/m035-bm4-before-after-cases-19-20-21.json');
}

main();
