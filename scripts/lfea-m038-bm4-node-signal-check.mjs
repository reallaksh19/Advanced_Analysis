#!/usr/bin/env node
import { loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import { normalizeBm4CiiLocalForceForM035 } from './lfea-bm4-local-force-reference-normalization.mjs';

const TARGET_PAIR = '20340-20350';
const DOWNSTREAM_PAIR = '20390-20440';
const STOP_NODE = '20390';
const CASES = Object.freeze(['SUS', 'OPE', 'EXP']);

function sourceAction(solved, recovery, pairKey) {
  const [fromNode, toNode] = pairKey.split('-');
  const sourceEntry = solved.authorities.base.entries.find((entry) => (
    String(entry.sourceSegment.startNodeId) === fromNode
    && String(entry.sourceSegment.endNodeId) === toNode
  ));
  if (!sourceEntry) throw new Error(`BM4 M038 node signal source pair ${pairKey} is missing.`);
  const sourceId = String(sourceEntry.sourceSegment.id);
  const descendants = solved.authorities.entries.filter((entry) => entry.sourceSegmentId === sourceId);
  const byElement = new Map(recovery.elementActions.map((row) => [row.elementId, row]));
  const first = byElement.get(descendants[0]?.elementId);
  const last = byElement.get(descendants.at(-1)?.elementId);
  if (!first || !last) throw new Error(`BM4 M038 node signal recovery for ${pairKey} is missing.`);
  return Object.freeze({ local: Object.freeze({ I: first.local.I, J: last.local.J }) });
}

function reaction(execution, nodeId, dof) {
  return execution.reactions.find((row) => row.nodeId === `BM4M035.N${nodeId}` && row.dof === dof)?.value ?? 0;
}

function subtract(left, right) {
  return Object.freeze(Object.fromEntries(Object.keys(left).map((field) => [field, left[field] - right[field]])));
}

function nativeCaseActions(solved, pairKey) {
  const sus = sourceAction(solved, solved.sustained.recovery, pairKey).local.I;
  const ope = sourceAction(solved, solved.operating.recovery, pairKey).local.I;
  return Object.freeze({ SUS: sus, OPE: ope, EXP: subtract(ope, sus) });
}

function nativeCaseReaction(solved, nodeId, dof) {
  const sus = reaction(solved.sustained.execution, nodeId, dof);
  const ope = reaction(solved.operating.execution, nodeId, dof);
  return Object.freeze({ SUS: sus, OPE: ope, EXP: ope - sus });
}

function ciiAxial(cii, caseLabel, pairKey) {
  const rows = cii.localForce.get(caseLabel).byPair.get(pairKey) ?? [];
  if (rows.length !== 1) throw new Error(`Expected one CAESAR ${caseLabel} local-force row for ${pairKey}; found ${rows.length}.`);
  return rows[0].I.fx;
}

function ciiReaction(rawCii, caseLabel, nodeId, field) {
  const row = rawCii.restraint.get(caseLabel).get(nodeId);
  if (!row) throw new Error(`Expected CAESAR ${caseLabel} restraint row at ${nodeId}.`);
  return -row[field];
}

function signal(ours, cii) {
  const delta = ours - cii;
  const percent = cii === 0 ? null : 100 * delta / Math.abs(cii);
  return Object.freeze({ ours, cii, delta, percent });
}

const solved = solveBm4M035M036Combined();
const rawCii = loadBm4CiiOutputCases1921();
const cii = normalizeBm4CiiLocalForceForM035(rawCii, solved.authorities);
const target = nativeCaseActions(solved, TARGET_PAIR);
const downstream = nativeCaseActions(solved, DOWNSTREAM_PAIR);
const stop = nativeCaseReaction(solved, STOP_NODE, 'UX');

const report = Object.fromEntries(CASES.map((caseLabel) => {
  const targetSignal = signal(target[caseLabel].fx, ciiAxial(cii, caseLabel, TARGET_PAIR));
  const downstreamSignal = signal(downstream[caseLabel].fx, ciiAxial(cii, caseLabel, DOWNSTREAM_PAIR));
  const stopSignal = signal(stop[caseLabel], ciiReaction(rawCii, caseLabel, STOP_NODE, 'FX'));
  return [caseLabel, Object.freeze({
    axial20340: targetSignal,
    stop20390UX: stopSignal,
    axial20390: downstreamSignal,
    equilibriumResidualClosure: targetSignal.delta - stopSignal.delta - downstreamSignal.delta,
  })];
}));

console.log(`M038_NODE_SIGNAL=${JSON.stringify(Object.freeze({
  schema: 'm038-bm4-node-signal/v1',
  targetPair: TARGET_PAIR,
  stopNode: STOP_NODE,
  downstreamPair: DOWNSTREAM_PAIR,
  cases: report,
}))}`);
