#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { findElements } from '../src/core/geometry/adapters/inputxml-tag-scanner.js';
import { BM4_OUTPUT_PATH, loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035FeatureCases } from './lfea-m035-bm4-feature-solve-runtime.mjs';

const FOCUS_NODES = Object.freeze(['20170', '20300']);
const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const CASE_NUMBERS = Object.freeze({ SUS: 19, OPE: 20, EXP: 21 });
const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const ACTIONS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);
const ACTION_TO_DOF = Object.freeze({ fx: 'UX', fy: 'UY', fz: 'UZ', mx: 'RX', my: 'RY', mz: 'RZ' });
const REPORT_PATH = fileURLToPath(new URL('../reports/m035-bm4-nodewise-rca.json', import.meta.url));
const MD_PATH = fileURLToPath(new URL('../reports/m035-bm4-nodewise-rca.md', import.meta.url));

function zeros(fields = ACTIONS) { return Object.fromEntries(fields.map((field) => [field, 0])); }
function subtract(a, b, fields = ACTIONS) { return Object.fromEntries(fields.map((field) => [field, (a?.[field] ?? 0) - (b?.[field] ?? 0)])); }
function addVectors(rows, fields = ACTIONS) {
  const out = zeros(fields);
  for (const row of rows) for (const field of fields) out[field] += row[field] ?? 0;
  return out;
}
function maxAbs(vector, fields = ACTIONS) { return Math.max(...fields.map((field) => Math.abs(vector[field] ?? 0))); }
function actionAsDofs(action) { return Object.fromEntries(ACTIONS.map((field) => [ACTION_TO_DOF[field], action[field] ?? 0])); }
function dofsAsAction(dofs) { return Object.fromEntries(ACTIONS.map((field) => [field, dofs[ACTION_TO_DOF[field]] ?? 0])); }
function vectorByNode(rows) {
  const result = new Map();
  for (const row of rows) {
    const vector = result.get(row.nodeId) ?? Object.fromEntries(DOFS.map((dof) => [dof, 0]));
    vector[row.dof] = row.value;
    result.set(row.nodeId, vector);
  }
  return result;
}
function sourceActionMap(authorities, recovery) {
  const byElement = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const result = new Map();
  for (const sourceEntry of authorities.base.entries) {
    const sourceId = String(sourceEntry.sourceSegment.id);
    const descendants = authorities.entries.filter((row) => row.sourceSegmentId === sourceId);
    const first = byElement.get(descendants[0]?.elementId);
    const last = byElement.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`Missing recovered source actions for ${sourceId}.`);
    result.set(sourceId, { I: first.global.I, J: last.global.J });
  }
  return result;
}
function ownSnapshot(solved) {
  const reactions = {
    SUS: vectorByNode(solved.sustained.execution.reactions),
    OPE: vectorByNode(solved.operating.execution.reactions),
  };
  const displacement = {
    SUS: vectorByNode(solved.sustained.execution.displacement),
    OPE: vectorByNode(solved.operating.execution.displacement),
  };
  const actions = {
    SUS: sourceActionMap(solved.authorities, solved.sustained.recovery),
    OPE: sourceActionMap(solved.authorities, solved.operating.recovery),
  };
  return { reactions, displacement, actions };
}
function ownReaction(snapshot, node, label) {
  const kernel = `BM4M035.N${node}`;
  if (label === 'EXP') return subtract(
    dofsAsAction(snapshot.reactions.OPE.get(kernel) ?? {}),
    dofsAsAction(snapshot.reactions.SUS.get(kernel) ?? {}), ACTIONS);
  return dofsAsAction(snapshot.reactions[label].get(kernel) ?? {});
}
function ownDisplacement(snapshot, node, label) {
  const kernel = `BM4M035.N${node}`;
  const sus = snapshot.displacement.SUS.get(kernel) ?? Object.fromEntries(DOFS.map((dof) => [dof, 0]));
  const ope = snapshot.displacement.OPE.get(kernel) ?? Object.fromEntries(DOFS.map((dof) => [dof, 0]));
  return label === 'EXP' ? Object.fromEntries(DOFS.map((dof) => [dof, ope[dof] - sus[dof]])) : snapshot.displacement[label].get(kernel) ?? sus;
}
function ownIncident(solved, snapshot, node, label) {
  return solved.authorities.base.entries.filter((entry) => {
    const source = entry.sourceSegment;
    return String(source.startNodeId) === node || String(source.endNodeId) === node;
  }).map((entry) => {
    const source = entry.sourceSegment;
    const sourceId = String(source.id);
    const end = String(source.startNodeId) === node ? 'I' : 'J';
    const sus = snapshot.actions.SUS.get(sourceId)[end];
    const ope = snapshot.actions.OPE.get(sourceId)[end];
    const action = label === 'EXP' ? subtract(ope, sus) : snapshot.actions[label].get(sourceId)[end];
    return {
      sourceSegmentId: sourceId,
      pair: `${source.startNodeId}-${source.endNodeId}`,
      sourceType: source.type,
      rigid: entry.rigidAuthority !== null,
      end,
      action,
    };
  });
}
function ciiReaction(cii, node, label) {
  const row = cii.restraint.get(label).get(node);
  if (!row) return zeros();
  return { fx: -row.FX, fy: -row.FY, fz: -row.FZ, mx: -row.MX, my: -row.MY, mz: -row.MZ };
}
function ciiDisplacement(cii, node, label) {
  const row = cii.displacement.get(label).get(node);
  if (!row) return Object.fromEntries(DOFS.map((dof) => [dof, 0]));
  return { UX: row.DX / 1000, UY: row.DY / 1000, UZ: row.DZ / 1000,
    RX: row.RX * Math.PI / 180, RY: row.RY * Math.PI / 180, RZ: row.RZ * Math.PI / 180 };
}
function ciiIncident(cii, node, label) {
  return cii.globalForce.get(label).rows.filter((row) => String(row.fromNode) === node || String(row.toNode) === node).map((row) => {
    const end = String(row.fromNode) === node ? 'I' : 'J';
    return { pair: row.pairKey, end, action: row[end] };
  });
}
function closure(reaction, incident) {
  const sum = addVectors(incident.map((row) => row.action));
  const residual = subtract(reaction, sum);
  const scale = Math.max(maxAbs(reaction), maxAbs(sum), 1);
  return { convention: 'reported end action is node-on-element; support reaction is support-on-pipe; closure = reaction - sum(node-on-element end actions)', reaction, sumIncidentEndActions: sum, residual, relativeMaxResidual: maxAbs(residual) / scale };
}
function exactCaseLabels(xmlText) {
  const tags = ['DISPLACEMENT_REPORT', 'RESTRAINT_REPORT', 'GLOBAL_FORCE_REPORT', 'LOCAL_FORCE_REPORT'];
  const result = {};
  for (const tag of tags) {
    result[tag] = {};
    for (const label of CASES) {
      const number = CASE_NUMBERS[label];
      const matches = findElements(xmlText, tag).filter((row) => new RegExp(`^CASE\\s+${number}\\s+\\(`, 'u').test(String(row.attributes.LOADCASE ?? '').trim()));
      assert.equal(matches.length, 1, `${tag} CASE ${number} uniqueness`);
      result[tag][label] = matches[0].attributes.LOADCASE;
    }
  }
  return result;
}
function sourceRestraints(solved, nodeId) {
  const node = solved.authorities.sourceGeometry.nodes.find((candidate) => String(candidate.id) === nodeId);
  return (node?.meta?.restraints ?? []).map((row) => ({
    sourceTypeRaw: row.sourceTypeRaw,
    sourceTypeCode: row.sourceTypeCode,
    typeCode: row.typeCode,
    xCosine: row.xCosine,
    yCosine: row.yCosine,
    zCosine: row.zCosine,
    gap: row.gap,
    frictionCoefficient: row.frictionCoefficient,
    mutationApplied: row.mutationApplied,
  }));
}
function ciiRestraintType(cii, node, label) { return cii.restraint.get(label).get(node)?.type ?? null; }
function thermalDifferenceRows(ope, sus) {
  const susByKey = new Map(sus.map((row) => [`${row.pair}|${row.end}`, row]));
  return ope.map((row) => {
    const prior = susByKey.get(`${row.pair}|${row.end}`);
    return { ...row, action: subtract(row.action, prior?.action ?? zeros()) };
  });
}
function displacementDelta(ope, sus) { return Object.fromEntries(DOFS.map((dof) => [dof, (ope[dof] ?? 0) - (sus[dof] ?? 0)])); }
function percentDifference(ours, cii) { return Math.abs(cii) <= 1e-12 ? null : (ours - cii) / Math.abs(cii) * 100; }
function nodeReport(solved, snapshot, cii, node) {
  const cases = {};
  for (const label of CASES) {
    const ownInc = ownIncident(solved, snapshot, node, label);
    const refInc = ciiIncident(cii, node, label);
    cases[label] = {
      own: { displacement: ownDisplacement(snapshot, node, label), reaction: ownReaction(snapshot, node, label), incident: ownInc, closure: closure(ownReaction(snapshot, node, label), ownInc) },
      cii: { displacement: ciiDisplacement(cii, node, label), reaction: ciiReaction(cii, node, label), restraintType: ciiRestraintType(cii, node, label), incident: refInc, closure: closure(ciiReaction(cii, node, label), refInc) },
    };
  }
  const ownThermal = thermalDifferenceRows(cases.OPE.own.incident, cases.SUS.own.incident);
  const ciiThermal = thermalDifferenceRows(cases.OPE.cii.incident, cases.SUS.cii.incident);
  const ownThermalReaction = subtract(cases.OPE.own.reaction, cases.SUS.own.reaction);
  const ciiThermalReaction = subtract(cases.OPE.cii.reaction, cases.SUS.cii.reaction);
  const ownExpConsistency = subtract(ownThermalReaction, cases.EXP.own.reaction);
  const ciiExpConsistency = subtract(ciiThermalReaction, cases.EXP.cii.reaction);
  return {
    node,
    sourceRestraints: sourceRestraints(solved, node),
    cases,
    thermalOnly: {
      own: { displacement: displacementDelta(cases.OPE.own.displacement, cases.SUS.own.displacement), reaction: ownThermalReaction, incident: ownThermal, expConsistencyResidual: ownExpConsistency },
      cii: { displacement: displacementDelta(cases.OPE.cii.displacement, cases.SUS.cii.displacement), reaction: ciiThermalReaction, incident: ciiThermal, expConsistencyResidual: ciiExpConsistency },
      uyReactionPercentDifference: percentDifference(ownThermalReaction.fy, ciiThermalReaction.fy),
    },
    rca: {
      reactionRecovery: 'FALSIFIED_WHEN_BOTH_NODE_CLOSURES_ARE_TIGHT',
      genericGlobalSignOrAxisTransform: 'FALSIFIED_BY_666_END_VECTOR_PARITY_AND_NODE_CLOSURE',
      frictionProximity: 'NOT_A_CAUSAL_CLASSIFIER; source FRIC metadata alone does not establish participation in CASE 19/20/21',
      primaryLocus: 'THERMAL_LOAD_PATH_OR_MODEL_STATE; isolate support-state/rotational-flexibility/rigid-or-bend end-action transfer with independent mechanics tests',
    },
  };
}
function markdown(report) {
  const lines = ['# BM4 CASE 19/20/21 node-wise RCA', '', '## Case evidence', ''];
  for (const label of CASES) lines.push(`- ${label}: ${report.caseLabels.DISPLACEMENT_REPORT[label]}`);
  lines.push('', '- Friction attribution rule: **source FRIC metadata is not accepted as causation for these benchmark rows without explicit case-level participation evidence.**', '');
  for (const node of report.nodes) {
    lines.push(`## Node ${node.node}`, '', '| case | side | reaction FY N | sum incident FY N | FY residual N | relative max closure |', '|---|---|---:|---:|---:|---:|');
    for (const label of CASES) for (const side of ['own', 'cii']) {
      const c = node.cases[label][side].closure;
      lines.push(`| ${label} | ${side} | ${c.reaction.fy} | ${c.sumIncidentEndActions.fy} | ${c.residual.fy} | ${c.relativeMaxResidual} |`);
    }
    lines.push('', `Thermal-only UY reaction: ours ${node.thermalOnly.own.reaction.fy} N; CAESAR ${node.thermalOnly.cii.reaction.fy} N; error ${node.thermalOnly.uyReactionPercentDifference == null ? 'n/a' : node.thermalOnly.uyReactionPercentDifference.toFixed(2)}%.`, '',
      '### Incident OPE global end actions', '', '| side | element | end | Fx | Fy | Fz | Mx | My | Mz |', '|---|---|---|---:|---:|---:|---:|---:|---:|');
    for (const side of ['own', 'cii']) for (const row of node.cases.OPE[side].incident) {
      const a = row.action;
      lines.push(`| ${side} | ${row.pair} | ${row.end} | ${a.fx} | ${a.fy} | ${a.fz} | ${a.mx} | ${a.my} | ${a.mz} |`);
    }
    lines.push('', `RCA locus: **${node.rca.primaryLocus}**`, '');
  }
  return `${lines.join('\n')}\n`;
}

const xmlText = readFileSync(BM4_OUTPUT_PATH, 'utf8');
const caseLabels = exactCaseLabels(xmlText);
const cii = loadBm4CiiOutputCases1921();
const solved = solveBm4M035FeatureCases();
const snapshot = ownSnapshot(solved);
const nodes = FOCUS_NODES.map((node) => nodeReport(solved, snapshot, cii, node));

for (const node of nodes) {
  for (const label of CASES) {
    assert.ok(node.cases[label].own.closure.relativeMaxResidual < 1e-8, `own node ${node.node} ${label} closure`);
    assert.ok(node.cases[label].cii.closure.relativeMaxResidual < 1e-5, `CAESAR node ${node.node} ${label} closure`);
  }
}

const report = {
  schema: 'm035-bm4-nodewise-rca/v1',
  benchmarkHead: '65acbd5ca6f13e431d913ae8b227148894171812',
  caseLabels,
  caseSemantics: {
    solverPrimitives: {
      SUS: 'dead weight + pressure state; thermalDeltaC=0; pressure thrust disabled',
      OPE: 'dead weight + pressure state + qualified thermal strain; pressure thrust disabled',
      EXP: 'algebraic OPE-SUS',
    },
    frictionDisposition: 'WITHDRAWN_AS_RCA: FRIC declarations in source restraints are metadata, not proof that friction participates in CASE 19/20/21. No residual is classified as friction-caused by proximity in this report.',
  },
  signConvention: 'Global element end actions are reported node-on-element. Support reactions are support-on-pipe. At a node without an external concentrated nodal load: R_support_on_pipe - sum(q_node_on_element)=0.',
  nodes,
  conclusions: [
    'If both own and CAESAR node closures pass, reaction-recovery error is falsified at the audited node.',
    'OPE-SUS isolates the thermal load path; CASE 21 is checked as the independent reported EXP reference.',
    'Large thermal end-action differences with tight node closure localize the discrepancy to model/load-path state rather than equilibrium assembly or reaction sign.',
    'No bend, support, rigid, reducer, or friction mechanics change is authorized by this audit alone; the next mechanism must be falsified/confirmed by an independent canonical test before BM4 tuning.',
  ],
};

mkdirSync(fileURLToPath(new URL('../reports', import.meta.url)), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(MD_PATH, markdown(report));
console.log(`BM4_NODEWISE_RCA_SUMMARY=${JSON.stringify({ caseLabels: report.caseLabels.DISPLACEMENT_REPORT, nodes: nodes.map((node) => ({
  node: node.node,
  opeOwnFy: node.cases.OPE.own.reaction.fy,
  opeCiiFy: node.cases.OPE.cii.reaction.fy,
  thermalOwnFy: node.thermalOnly.own.reaction.fy,
  thermalCiiFy: node.thermalOnly.cii.reaction.fy,
  thermalUyErrorPct: node.thermalOnly.uyReactionPercentDifference,
  ownOpeClosure: node.cases.OPE.own.closure.relativeMaxResidual,
  ciiOpeClosure: node.cases.OPE.cii.closure.relativeMaxResidual,
  ownOpeIncident: node.cases.OPE.own.incident.map((row) => ({ pair: row.pair, end: row.end, action: row.action })),
  ciiOpeIncident: node.cases.OPE.cii.incident.map((row) => ({ pair: row.pair, end: row.end, action: row.action })),
})) })}`);
