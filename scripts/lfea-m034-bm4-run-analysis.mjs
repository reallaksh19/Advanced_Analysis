import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { solveBm4InputXmlConditioned } from './lfea-m034-bm4-solve-runtime.mjs';
import { BM4_COMPARISON_POLICY, loadBm4CiiOutputCases1921 } from './lfea-m034-bm4-output-comparison.mjs';

// M034 Phase 2: real solve + CASE 19(SUS)/20(OPE)/21(EXP) comparison against
// Output_BM4.xml, with a full nodewise/elementwise deviation report and
// named root-cause tagging for every miss against the <5% target the Owner
// set (looser ±10% standing bar reported alongside it for context). Forces
// and displacement only, per the Owner's staged directive; stress deferred.

const NODE_DOFS = ['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ'];
const TRANSLATION_DOFS = new Set(['UX', 'UY', 'UZ']);
const ACTION_FIELDS = ['fx', 'fy', 'fz', 'mx', 'my', 'mz'];
const FORCE_FIELDS = new Set(['fx', 'fy', 'fz']);

function absoluteTolerance(family, field) {
  if (family === 'displacement') {
    return TRANSLATION_DOFS.has(field)
      ? BM4_COMPARISON_POLICY.absoluteTolerance.translation
      : BM4_COMPARISON_POLICY.absoluteTolerance.rotation;
  }
  if (TRANSLATION_DOFS.has(field) || FORCE_FIELDS.has(field)) return BM4_COMPARISON_POLICY.absoluteTolerance.force;
  return BM4_COMPARISON_POLICY.absoluteTolerance.moment;
}

function deviation({ family, identifier, end, field, ours, cii, causesFor }) {
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
  return {
    family, identifier, end, field, ours, cii, absoluteDifference, percentDifference,
    comparisonMode: nearZero ? 'ABSOLUTE_NEAR_ZERO_REFERENCE' : 'RELATIVE_PERCENT',
    passedTarget, passedStandingBar,
    causeCodes: passedTarget ? [] : causesFor(),
  };
}

function buildTopologyContext(authorities) {
  const nodeDegree = new Map();
  const bump = (nodeId) => nodeDegree.set(nodeId, (nodeDegree.get(nodeId) ?? 0) + 1);
  for (const entry of authorities.entries) {
    bump(entry.sourceSegment.startNodeId);
    bump(entry.sourceSegment.endNodeId);
  }
  const branchNodeIds = new Set([...nodeDegree.entries()].filter(([, count]) => count > 2).map(([id]) => id));

  // Direct diameter-change detection: a node touched by segments of more
  // than one outer diameter is a real inline reducer location.
  const diameterByNode = new Map();
  for (const entry of authorities.entries) {
    const od = entry.physicalSection.dimensions.outerDiameter;
    for (const nodeId of [entry.sourceSegment.startNodeId, entry.sourceSegment.endNodeId]) {
      if (!diameterByNode.has(nodeId)) diameterByNode.set(nodeId, new Set());
      diameterByNode.get(nodeId).add(od);
    }
  }
  const reducerNodeIds = new Set([...diameterByNode.entries()].filter(([, ods]) => ods.size > 1).map(([id]) => id));

  const bendNodeIds = new Set();
  const rigidNodeIds = new Set();
  for (const entry of authorities.entries) {
    const target = entry.sourceSegment.meta.bendDeclaredRadius != null ? bendNodeIds : null;
    if (target) { target.add(entry.sourceSegment.startNodeId); target.add(entry.sourceSegment.endNodeId); }
    if (entry.rigidAuthority) { rigidNodeIds.add(entry.sourceSegment.startNodeId); rigidNodeIds.add(entry.sourceSegment.endNodeId); }
  }
  return Object.freeze({ branchNodeIds, reducerNodeIds, bendNodeIds, rigidNodeIds });
}

function causesFor({ family, nodeId, element, topology, elementsById }) {
  const codes = [];
  if (family === 'restraint') codes.push('BM4_RESTRAINT_LINEARIZATION');
  const touchedNodes = element ? [element.reportFromNode, element.reportToNode] : [nodeId];
  if (touchedNodes.some((id) => topology.branchNodeIds.has(id))) codes.push('BM4_BRANCH_JUNCTION_FLEXIBILITY_NOT_APPLIED');
  if (touchedNodes.some((id) => topology.reducerNodeIds.has(id))) codes.push('BM4_NO_TRUE_REDUCER_CONDENSATION');
  const ownElement = element ? elementsById.get(element.pairKey) : null;
  const bendNearby = ownElement ? ownElement.bendTagged : touchedNodes.some((id) => topology.bendNodeIds.has(id));
  const rigidNearby = ownElement ? ownElement.rigid : touchedNodes.some((id) => topology.rigidNodeIds.has(id));
  if (bendNearby) codes.push('BM4_BEND_CHORD_STIFFNESS_ONLY');
  if (rigidNearby) codes.push('BM4_RIGID_BODY_LOAD_DISTRIBUTION_ASSUMPTION');
  codes.push('BM4_GLOBAL_STIFFNESS_INCOMPLETE_BEND_BRANCH_RESTRAINT_MODEL');
  return [...new Set(codes)];
}

function ownDisplacement(row) {
  return Object.fromEntries(NODE_DOFS.map((dof) => [dof, row.displacement[dof]]));
}
function ownReaction(row) {
  return Object.fromEntries(NODE_DOFS.map((dof) => [dof, row.reaction[dof]]));
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
function subtractDof(a, b) {
  return Object.fromEntries(NODE_DOFS.map((dof) => [dof, a[dof] - b[dof]]));
}
function subtractAction(a, b) {
  return Object.fromEntries(ACTION_FIELDS.map((field) => [field, a[field] - b[field]]));
}

function compareDisplacementOrRestraint({ family, ownByNode, ciiMap, topology }) {
  const rows = [];
  const unmatchedCiiNodes = [];
  const unmatchedOwnNodes = [];
  for (const [nodeId, ciiRow] of ciiMap) {
    const ownRow = ownByNode.get(nodeId);
    if (!ownRow) { unmatchedCiiNodes.push(nodeId); continue; }
    const ciiValue = family === 'displacement' ? ciiDisplacement(ciiRow) : ciiRestraint(ciiRow);
    const ownValue = family === 'displacement' ? ownDisplacement(ownRow) : ownReaction(ownRow);
    for (const field of NODE_DOFS) {
      rows.push(deviation({
        family, identifier: nodeId, end: null, field,
        ours: ownValue[field], cii: ciiValue[field],
        causesFor: () => causesFor({ family, nodeId, element: null, topology, elementsById: new Map() }),
      }));
    }
  }
  for (const nodeId of ownByNode.keys()) if (!ciiMap.has(nodeId)) unmatchedOwnNodes.push(nodeId);
  return { rows, unmatchedCiiNodes, unmatchedOwnNodes };
}

function compareElementFamily({ family, ownField, ownElements, ciiByPair, topology }) {
  const rows = [];
  const unmatchedCiiPairs = [];
  const elementsById = new Map(ownElements.map((element) => [element.pairKey, element]));
  for (const [pairKey, ciiGroup] of ciiByPair) {
    if (ciiGroup.length !== 1) { unmatchedCiiPairs.push({ pairKey, reason: `${ciiGroup.length} CAESAR rows share this pair` }); continue; }
    const own = elementsById.get(pairKey);
    if (!own) { unmatchedCiiPairs.push({ pairKey, reason: 'no matching source element (bend/branch station split)' }); continue; }
    const cii = ciiGroup[0];
    for (const end of ['I', 'J']) {
      for (const field of ACTION_FIELDS) {
        rows.push(deviation({
          family, identifier: pairKey, end, field,
          ours: own[ownField][end][field], cii: cii[end][field],
          causesFor: () => causesFor({
            family, nodeId: null,
            element: { reportFromNode: cii.fromNode, reportToNode: cii.toNode, pairKey },
            topology, elementsById,
          }),
        }));
      }
    }
  }
  const matchedPairKeys = new Set([...ciiByPair.keys()].filter((key) => elementsById.has(key) && ciiByPair.get(key).length === 1));
  const unmatchedOwnPairs = [...elementsById.keys()].filter((key) => !matchedPairKeys.has(key));
  return { rows, unmatchedCiiPairs, unmatchedOwnPairs };
}

function ownElementsForCase(report, caseKey) {
  return report.elements.map((element) => ({
    pairKey: `${element.fromNode}-${element.toNode}`,
    bendTagged: element.bendTagged,
    rigid: element.rigid,
    global: element[caseKey].global,
    local: element[caseKey].local,
  }));
}

function deriveExpElements(opeElements, susElements) {
  const susByPair = new Map(susElements.map((e) => [e.pairKey, e]));
  return opeElements.map((ope) => {
    const sus = susByPair.get(ope.pairKey);
    return {
      pairKey: ope.pairKey, bendTagged: ope.bendTagged, rigid: ope.rigid,
      global: { I: subtractAction(ope.global.I, sus.global.I), J: subtractAction(ope.global.J, sus.global.J) },
      local: { I: subtractAction(ope.local.I, sus.local.I), J: subtractAction(ope.local.J, sus.local.J) },
    };
  });
}

function summarize(rows) {
  const targetFailed = rows.filter((r) => !r.passedTarget);
  const standingBarFailed = rows.filter((r) => !r.passedStandingBar);
  return {
    comparisons: rows.length,
    passedTarget5pct: rows.length - targetFailed.length,
    failedTarget5pct: targetFailed.length,
    passedStandingBar10pct: rows.length - standingBarFailed.length,
    failedStandingBar10pct: standingBarFailed.length,
  };
}

function causeTally(rows) {
  const tally = new Map();
  for (const row of rows) {
    if (row.passedTarget) continue;
    for (const code of row.causeCodes) tally.set(code, (tally.get(code) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]);
}

function worstRows(rows, n = 12) {
  return [...rows]
    .filter((r) => !r.passedTarget)
    .sort((a, b) => {
      const magA = a.percentDifference == null ? Math.abs(a.absoluteDifference) * 1e9 : Math.abs(a.percentDifference);
      const magB = b.percentDifference == null ? Math.abs(b.absoluteDifference) * 1e9 : Math.abs(b.percentDifference);
      return magB - magA;
    })
    .slice(0, n);
}

function fmtRow(row) {
  const loc = row.end ? `${row.identifier} [${row.end}]` : row.identifier;
  const pct = row.percentDifference == null ? 'n/a (near-zero ref)' : `${row.percentDifference.toFixed(1)}%`;
  return `    ${loc.padEnd(14)} ${row.field.padEnd(3)} ours=${row.ours.toExponential(3).padStart(11)} cii=${row.cii.toExponential(3).padStart(11)} dev=${pct.padStart(20)} causes=[${row.causeCodes.join(', ')}]`;
}

function printRootCause(label, family, rows) {
  const tally = causeTally(rows);
  if (tally.length === 0) return;
  console.log(`  -- ${label}/${family} root-cause tally (>5% misses, ${rows.filter((r) => !r.passedTarget).length} total) --`);
  for (const [code, count] of tally) console.log(`     ${count.toString().padStart(4)}  ${code}`);
  console.log(`  -- ${label}/${family} worst offenders --`);
  for (const row of worstRows(rows)) console.log(fmtRow(row));
  console.log('');
}

function main() {
  console.log('\n--- M034 BM4 (GH TYPE-4): CASE 19(SUS)/20(OPE)/21(EXP) forces + displacement comparison ---\n');

  const solved = solveBm4InputXmlConditioned();
  const cii = loadBm4CiiOutputCases1921();
  const topology = buildTopologyContext(solved);

  console.log(`Ingestion: ${solved.report.counts.sourceNodes} source nodes / ${solved.report.counts.sourceElements} source elements`);
  console.log(`Rigid elements: ${solved.report.counts.rigidElements} / Bend-tagged: ${solved.report.counts.bendTaggedElements}`);
  console.log(`Branch (degree>2) nodes: ${topology.branchNodeIds.size} [${[...topology.branchNodeIds].join(', ')}]`);
  console.log(`Reducer (diameter-change) nodes: ${topology.reducerNodeIds.size} [${[...topology.reducerNodeIds].join(', ')}]`);
  console.log(`Solver execution status -- SUS: ${solved.sustained.execution.status}, OPE: ${solved.operating.execution.status}\n`);

  const ownByNodeSus = new Map(solved.report.nodes.map((n) => [n.sourceNodeId, n.sustained]));
  const ownByNodeOpe = new Map(solved.report.nodes.map((n) => [n.sourceNodeId, n.operating]));
  const ownByNodeExp = new Map(solved.report.nodes.map((n) => [
    n.sourceNodeId,
    { displacement: subtractDof(n.operating.displacement, n.sustained.displacement), reaction: subtractDof(n.operating.reaction, n.sustained.reaction) },
  ]));

  const ownElementsSus = ownElementsForCase(solved.report, 'sustained');
  const ownElementsOpe = ownElementsForCase(solved.report, 'operating');
  const ownElementsExp = deriveExpElements(ownElementsOpe, ownElementsSus);

  const casePlan = [
    { label: 'SUS', ownByNode: ownByNodeSus, ownElements: ownElementsSus },
    { label: 'OPE', ownByNode: ownByNodeOpe, ownElements: ownElementsOpe },
    { label: 'EXP', ownByNode: ownByNodeExp, ownElements: ownElementsExp },
  ];

  const fullReport = { schema: 'm034-bm4-forces-displacement-comparison/v1', cases: {} };

  for (const { label, ownByNode, ownElements } of casePlan) {
    const displacement = compareDisplacementOrRestraint({ family: 'displacement', ownByNode, ciiMap: cii.displacement.get(label), topology });
    const restraint = compareDisplacementOrRestraint({ family: 'restraint', ownByNode, ciiMap: cii.restraint.get(label), topology });
    const globalForce = compareElementFamily({ family: 'globalForce', ownField: 'global', ownElements, ciiByPair: cii.globalForce.get(label).byPair, topology });
    const localForce = compareElementFamily({ family: 'localForce', ownField: 'local', ownElements, ciiByPair: cii.localForce.get(label).byPair, topology });

    fullReport.cases[label] = { displacement, restraint, globalForce, localForce };

    console.log(`=== CASE ${label} ===`);
    for (const [name, section] of Object.entries({ displacement, restraint, globalForce, localForce })) {
      const s = summarize(section.rows);
      console.log(`  ${name.padEnd(12)} matched=${s.comparisons.toString().padStart(4)}  within 5%=${s.passedTarget5pct.toString().padStart(4)}  within 10%=${s.passedStandingBar10pct.toString().padStart(4)}  >10% miss=${s.failedStandingBar10pct}`);
    }
    console.log(`  displacement unmatched CAESAR nodes: ${section_unmatched(displacement)} | restraint unmatched: ${section_unmatched(restraint)}`);
    console.log(`  globalForce unmatched CAESAR pairs: ${globalForce.unmatchedCiiPairs.length} | localForce unmatched: ${localForce.unmatchedCiiPairs.length}\n`);

    printRootCause(label, 'displacement', displacement.rows);
    printRootCause(label, 'restraint (support reaction force)', restraint.rows);
    printRootCause(label, 'globalForce (element end action)', globalForce.rows);
  }

  mkdirSync(fileURLToPath(new URL('../reports', import.meta.url)), { recursive: true });
  writeFileSync(
    fileURLToPath(new URL('../reports/m034-bm4-forces-displacement-comparison.json', import.meta.url)),
    `${JSON.stringify(fullReport, null, 2)}\n`,
  );
  console.log('Full nodewise report written to reports/m034-bm4-forces-displacement-comparison.json');

  return fullReport;
}

function section_unmatched(section) {
  return (section.unmatchedCiiNodes ?? []).length;
}

main();
