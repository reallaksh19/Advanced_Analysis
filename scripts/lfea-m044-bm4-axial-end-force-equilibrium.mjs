#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import { BM4_M040_FRICTION_NODE_IDS } from './lfea-m040-bm4-friction-authority.mjs';

const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);
const FRICTION = new Set(BM4_M040_FRICTION_NODE_IDS);
const ABS_TOL = 5;
const REL_TOL = 0.02;

function pairKey(entry) {
  return `${entry.sourceSegment.startNodeId}-${entry.sourceSegment.endNodeId}`;
}
function vec(action) {
  return { x: action.fx, y: action.fy, z: action.fz };
}
function point(geometry, id) {
  const row = geometry.nodes.find((node) => String(node.id) === String(id));
  if (!row) throw new Error(`M044 missing node ${id}.`);
  return [row.x, row.y, row.z];
}
function minus(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function unit(a) {
  const n = Math.hypot(...a);
  if (!(n > 0)) throw new Error('M044 zero-length tangent.');
  return a.map((v) => v / n);
}
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function project(v, t) { return v.x * t[0] + v.y * t[1] + v.z * t[2]; }
function sourceGlobal(solved, recovery) {
  const recovered = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const out = new Map();
  for (const source of solved.authorities.base.entries) {
    const sourceId = String(source.sourceSegment.id);
    const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
    const first = recovered.get(descendants[0]?.elementId);
    const last = recovered.get(descendants.at(-1)?.elementId);
    if (!first || !last) throw new Error(`M044 missing recovered actions for ${sourceId}.`);
    out.set(pairKey(source), Object.freeze({
      sourceId,
      fromNode: String(source.sourceSegment.startNodeId),
      toNode: String(source.sourceSegment.endNodeId),
      I: vec(first.global.I),
      J: vec(last.global.J),
    }));
  }
  return out;
}
function subtractAction(a, b) {
  return {
    sourceId: a.sourceId,
    fromNode: a.fromNode,
    toNode: a.toNode,
    I: { x: a.I.x - b.I.x, y: a.I.y - b.I.y, z: a.I.z - b.I.z },
    J: { x: a.J.x - b.J.x, y: a.J.y - b.J.y, z: a.J.z - b.J.z },
  };
}
function lfeaCases(solved) {
  const sus = sourceGlobal(solved, solved.sustained.recovery);
  const ope = sourceGlobal(solved, solved.operating.recovery);
  const exp = new Map();
  for (const [key, hot] of ope) exp.set(key, Object.freeze(subtractAction(hot, sus.get(key))));
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function ciiCases(raw) {
  return new Map(CASES.map((label) => [label, new Map(
    [...raw.globalForce.get(label).byPair]
      .filter(([, rows]) => rows.length === 1)
      .map(([key, rows]) => [key, Object.freeze({
        fromNode: rows[0].fromNode,
        toNode: rows[0].toNode,
        I: vec(rows[0].I),
        J: vec(rows[0].J),
      })]),
  )]));
}
function reactionMap(execution) {
  const out = new Map();
  for (const row of execution.reactions) {
    if (!['UX', 'UY', 'UZ'].includes(row.dof)) continue;
    const nodeId = String(row.nodeId).replace(/^BM4M035\.N/u, '');
    if (!out.has(nodeId)) out.set(nodeId, { x: 0, y: 0, z: 0 });
    out.get(nodeId)[{ UX: 'x', UY: 'y', UZ: 'z' }[row.dof]] += row.value;
  }
  return out;
}
function lfeaReactionCases(solved) {
  const sus = reactionMap(solved.sustained.execution);
  const ope = reactionMap(solved.operating.execution);
  const exp = new Map();
  for (const id of new Set([...sus.keys(), ...ope.keys()])) {
    const a = ope.get(id) ?? { x: 0, y: 0, z: 0 };
    const b = sus.get(id) ?? { x: 0, y: 0, z: 0 };
    exp.set(id, { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
  }
  return new Map([['SUS', sus], ['OPE', ope], ['EXP', exp]]);
}
function ciiReactionCases(raw) {
  const out = new Map();
  for (const label of CASES) out.set(label, new Map([...raw.restraint.get(label)].map(([id, r]) => [id, { x: r.FX, y: r.FY, z: r.FZ }])));
  return out;
}
function constraintNodes(solved) {
  const ids = new Set(BM4_M040_FRICTION_NODE_IDS);
  for (const group of [solved.inventory.base, solved.inventory.unilateral]) {
    for (const row of group) ids.add(String(row.nodeId).replace(/^BM4M035\.N/u, ''));
  }
  return ids;
}
function topology(solved) {
  const incoming = new Map();
  const outgoing = new Map();
  for (const entry of solved.authorities.base.entries) {
    const from = String(entry.sourceSegment.startNodeId);
    const to = String(entry.sourceSegment.endNodeId);
    if (!incoming.has(to)) incoming.set(to, []);
    if (!outgoing.has(from)) outgoing.set(from, []);
    incoming.get(to).push(entry);
    outgoing.get(from).push(entry);
  }
  const rows = [];
  for (const nodeId of new Set([...incoming.keys(), ...outgoing.keys()])) {
    const ins = incoming.get(nodeId) ?? [];
    const outs = outgoing.get(nodeId) ?? [];
    if (ins.length !== 1 || outs.length !== 1) continue;
    const p = point(solved.authorities.analysisGeometry, nodeId);
    const tIn = unit(minus(p, point(solved.authorities.analysisGeometry, ins[0].sourceSegment.startNodeId)));
    const tOut = unit(minus(point(solved.authorities.analysisGeometry, outs[0].sourceSegment.endNodeId), p));
    if (dot(tIn, tOut) < 0.9999) continue;
    rows.push(Object.freeze({ nodeId, incomingPair: pairKey(ins[0]), outgoingPair: pairKey(outs[0]), tangent: tIn }));
  }
  return rows;
}
function rowsForSystem({ topologyRows, actions, reactions, constrained }) {
  const rows = [];
  for (const top of topologyRows) for (const caseLabel of CASES) {
    const incoming = actions.get(caseLabel).get(top.incomingPair);
    const outgoing = actions.get(caseLabel).get(top.outgoingPair);
    if (!incoming || !outgoing) continue;
    const reaction = reactions.get(caseLabel).get(top.nodeId) ?? { x: 0, y: 0, z: 0 };
    rows.push(Object.freeze({
      caseLabel,
      nodeId: top.nodeId,
      incomingPair: top.incomingPair,
      outgoingPair: top.outgoingPair,
      incomingJ: project(incoming.J, top.tangent),
      outgoingI: project(outgoing.I, top.tangent),
      reaction: project(reaction, top.tangent),
      constrained: constrained.has(top.nodeId),
      frictionAuthority: FRICTION.has(top.nodeId),
    }));
  }
  return rows;
}
function residual(row, jSign, reactionSign) {
  return row.outgoingI + jSign * row.incomingJ - reactionSign * row.reaction;
}
function normalized(row, value) {
  return Math.abs(value) / Math.max(Math.abs(row.outgoingI), Math.abs(row.incomingJ), Math.abs(row.reaction), 1);
}
function score(rows, jSign, reactionSign) {
  const values = rows.map((row) => normalized(row, residual(row, jSign, reactionSign))).sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
  const p95 = values[Math.min(values.length - 1, Math.floor(values.length * 0.95))] ?? Infinity;
  const max = values.at(-1) ?? Infinity;
  return Object.freeze({ jSign, reactionSign, count: rows.length, mean, p95, max });
}
function calibrate(name, rows, knownJSign = null) {
  const free = rows.filter((row) => !row.constrained && Math.max(Math.abs(row.incomingJ), Math.abs(row.outgoingI)) > 1);
  const endCandidates = [-1, 1].map((jSign) => score(free, jSign, 1)).sort((a, b) => a.mean - b.mean || a.max - b.max);
  const jSign = endCandidates[0].jSign;
  if (knownJSign !== null) assert.equal(jSign, knownJSign, `${name} free-node end convention drifted from its qualified contract.`);
  const restrained = rows.filter((row) => row.constrained && Math.abs(row.reaction) > 1);
  const reactionCandidates = [-1, 1].map((reactionSign) => score(restrained, jSign, reactionSign)).sort((a, b) => a.mean - b.mean || a.max - b.max);
  return Object.freeze({
    name,
    anchor: 'I_END_SIGN_FIXED_AT_PLUS_ONE; J_AND_REACTION_SIGNS_CALIBRATED_FROM_OWN_NODAL_EQUILIBRIUM',
    freeNodeCount: free.length,
    restrainedNodeCount: restrained.length,
    selected: Object.freeze({ iSign: 1, jSign, reactionSign: reactionCandidates[0].reactionSign }),
    endCandidates,
    reactionCandidates,
  });
}
function mapped(row, calibration) {
  return Object.freeze({
    incomingJ: calibration.selected.jSign * row.incomingJ,
    outgoingI: row.outgoingI,
    reaction: calibration.selected.reactionSign * row.reaction,
  });
}
function correctedTransitions(topologyRows, lRows, cRows, lCal, cCal) {
  const lIndex = new Map(lRows.map((row) => [`${row.caseLabel}:${row.nodeId}`, row]));
  const cIndex = new Map(cRows.map((row) => [`${row.caseLabel}:${row.nodeId}`, row]));
  const out = [];
  for (const top of topologyRows) for (const caseLabel of CASES) {
    const left = lIndex.get(`${caseLabel}:${top.nodeId}`);
    const right = cIndex.get(`${caseLabel}:${top.nodeId}`);
    if (!left || !right) continue;
    const l = mapped(left, lCal);
    const c = mapped(right, cCal);
    const inDelta = l.incomingJ - c.incomingJ;
    const outDelta = l.outgoingI - c.outgoingI;
    const reactionDelta = l.reaction - c.reaction;
    const transitionResidual = inDelta + outDelta - reactionDelta;
    const scale = Math.max(Math.abs(inDelta), Math.abs(outDelta), Math.abs(reactionDelta), 1);
    out.push(Object.freeze({
      caseLabel,
      nodeId: top.nodeId,
      incomingPair: top.incomingPair,
      outgoingPair: top.outgoingPair,
      incomingEndDiscrepancy: inDelta,
      outgoingEndDiscrepancy: outDelta,
      reactionDiscrepancy: reactionDelta,
      transitionResidual,
      normalizedResidual: Math.abs(transitionResidual) / scale,
      closed: Math.abs(transitionResidual) <= ABS_TOL || Math.abs(transitionResidual) / scale <= REL_TOL,
      frictionAuthority: FRICTION.has(top.nodeId),
      constrained: left.constrained,
    }));
  }
  return out;
}
function rowAt(rows, caseLabel, nodeId) {
  return rows.find((row) => row.caseLabel === caseLabel && row.nodeId === nodeId) ?? null;
}
function worst(rows) {
  return [...rows].sort((a, b) => b.normalizedResidual - a.normalizedResidual || a.nodeId.localeCompare(b.nodeId))[0] ?? null;
}

const solved = solveBm4M035M036Combined();
const rawCii = loadBm4CiiOutputCases1921();
const topologyRows = topology(solved);
const constrained = constraintNodes(solved);
const lRows = rowsForSystem({ topologyRows, actions: lfeaCases(solved), reactions: lfeaReactionCases(solved), constrained });
const cRows = rowsForSystem({ topologyRows, actions: ciiCases(rawCii), reactions: ciiReactionCases(rawCii), constrained });
const lCal = calibrate('LFEA', lRows, 1);
const cCal = calibrate('CAESAR', cRows);
const transitions = correctedTransitions(topologyRows, lRows, cRows, lCal, cCal);
const significant = transitions.filter((row) => Math.max(Math.abs(row.incomingEndDiscrepancy), Math.abs(row.outgoingEndDiscrepancy), Math.abs(row.reactionDiscrepancy)) > 1);
const closed = significant.filter((row) => row.closed);
const friction = significant.filter((row) => row.frictionAuthority);
const frictionClosed = friction.filter((row) => row.closed);
const node20350 = rowAt(transitions, 'OPE', '20350');
const node22370 = rowAt(transitions, 'OPE', '22370');

assert.ok(lCal.freeNodeCount > 0 && cCal.freeNodeCount > 0, 'M044 requires unsupported straight-node calibration evidence.');
assert.equal(lCal.selected.jSign, 1, 'M044 must recover LFEA joint-on-element sum convention.');
assert.ok(node20350 && node22370, 'M044 requires the M043 diagnostic nodes 20350 and 22370.');
assert.ok(node20350.closed, 'M044 corrected node 20350 equilibrium must close before retiring the M043 raw-jump artifact.');
assert.ok(node22370.closed, 'M044 corrected node 22370 equilibrium must close before retiring the M043 factor-of-two artifact.');

const report = Object.freeze({
  schema: 'lfea-m044-bm4-axial-end-force-equilibrium/v1',
  targetCases: Object.freeze({ SUS: 19, OPE: 20, EXP: 21 }),
  recoveryAuthority: Object.freeze({
    lfeaReportedAction: 'JOINT_ON_ELEMENT',
    lfeaInternalNodeRule: 'INCOMING_J_PLUS_OUTGOING_I_MINUS_EXTERNAL_NODAL_LOAD_OR_REACTION_EQUALS_ZERO',
    source: 'src/core/linear-fea-result-recovery/recovery-contract.js and code-points.js',
  }),
  calibration: Object.freeze({ LFEA: lCal, CAESAR: cCal }),
  correctedTransition: Object.freeze({
    comparedRows: transitions.length,
    significantRows: significant.length,
    closedRows: closed.length,
    closeFraction: significant.length ? closed.length / significant.length : 0,
    frictionAuthorityRows: friction.length,
    frictionClosedRows: frictionClosed.length,
    frictionCloseFraction: friction.length ? frictionClosed.length / friction.length : 0,
    worstRow: worst(significant),
    node20350Ope: node20350,
    node22370Ope: node22370,
    rows: transitions,
  }),
  disposition: Object.freeze({
    mechanicsChangedByM044: false,
    m043DifferenceJumpWasValidNodalBalance: false,
    node20350ZeroReactionParadoxResolved: node20350.closed,
    node22370FactorTwoParadoxResolved: node22370.closed,
    frictionCauseConcluded: false,
    pressureCauseConcluded: false,
    conclusion: closed.length === significant.length
      ? 'ELEMENT_END_TO_NODAL_AXIAL_CONVENTION_RESOLVED_ALL_SIGNIFICANT_STRAIGHT_NODE_TRANSITIONS_CLOSE'
      : 'ELEMENT_END_TO_NODAL_AXIAL_CONVENTION_RESOLVED_RESIDUAL_TRANSITIONS_REMAIN',
    nextRcaBoundary: closed.length === significant.length
      ? 'TRACK_CANONICAL_SECTION_AXIAL_DISCREPANCY_ALONG_SOURCE_SEGMENTS_AND_LOCATE_FIRST_NON_EQUILIBRIUM_MECHANICS_BOUNDARY'
      : 'INVESTIGATE_FIRST_REMAINING_CORRECTED_STRAIGHT_NODE_TRANSITION',
  }),
});

const arg = process.argv.indexOf('--report');
if (arg >= 0) {
  const requested = process.argv[arg + 1];
  if (!requested) throw new Error('--report requires a path.');
  const path = resolve(requested);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(`M044 LFEA convention: ${JSON.stringify(report.calibration.LFEA.selected)}`);
console.log(`M044 CAESAR convention: ${JSON.stringify(report.calibration.CAESAR.selected)}`);
console.log(`M044 corrected transitions closed: ${closed.length}/${significant.length}; friction ${frictionClosed.length}/${friction.length}`);
console.log(`M044 node20350 OPE: ${JSON.stringify(node20350)}`);
console.log(`M044 node22370 OPE: ${JSON.stringify(node22370)}`);
console.log(`M044 worst corrected transition: ${JSON.stringify(report.correctedTransition.worstRow)}`);
console.log(`M044 conclusion: ${report.disposition.conclusion}`);
