import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DOF_ORDER } from '../src/core/linear-fea-contract/conventions.js';
import { solveBm4M035M036Combined } from './lfea-m035-m036-bm4-integration-runtime.mjs';
import {
  M043_CASES,
  M043_L0_DISPOSITION,
  M043_LADDER_POLICY,
  M043_RETRACEABLE_CASES,
  indexNodeDofVector,
  loadBm4LadderAuthority,
} from './lfea-m043-bm4-ladder-fixtures.mjs';
import { auditCaesarCaseLoadInvariants, auditGlobalLoadBalance } from './lfea-m043-bm4-load-balance.mjs';
import { auditDisplacementParity, contrastCaseSlopes } from './lfea-m043-bm4-displacement-parity.mjs';
import {
  assembleResidual,
  buildElementIndex,
  selfTestRetrace,
} from './lfea-m043-bm4-residual-retrace.mjs';
import {
  admitElements,
  caesarDisplacementField,
  resolveRetraceableNodes,
} from './lfea-m043-bm4-retrace-domain.mjs';
import { classifyResidualSignature, deriveVerdict } from './lfea-m043-bm4-residual-signature.mjs';

// Mirrors NODE_PREFIX in lfea-m035-m036-bm4-integration-runtime.mjs. Asserted
// against the real solved model below rather than trusted, so that a prefix
// change breaks loudly instead of silently emptying every comparison.
const NODE_PREFIX = 'BM4M035.N';

function differenceVector(minuend, subtrahend) {
  const left = indexNodeDofVector(minuend);
  const right = indexNodeDofVector(subtrahend);
  const rows = [];
  for (const at of new Set([...left.keys(), ...right.keys()])) {
    const [nodeId, dof] = at.split('|');
    rows.push({ nodeId, dof, value: (left.get(at) ?? 0) - (right.get(at) ?? 0) });
  }
  return rows;
}

/**
 * EXP (L21 = L20 - L19) is a reported difference of two solves, not a solve.
 * Displacement and reaction both difference linearly, so L2 and L3 are valid on
 * it; L4's equilibrium identity is not applied (see M043_RETRACEABLE_CASES).
 */
function expansionPseudoAnalysis(sustained, operating) {
  return Object.freeze({
    derived: true,
    derivation: 'EXP = OPE - SUS, applied to displacement and reaction by linearity',
    compilation: operating.compilation,
    loadCase: operating.loadCase,
    frames: operating.frames,
    pipingComponents: operating.pipingComponents,
    execution: Object.freeze({
      status: `DERIVED_FROM_${sustained.execution.status}_AND_${operating.execution.status}`,
      displacement: Object.freeze(differenceVector(operating.execution.displacement, sustained.execution.displacement)),
      reactions: Object.freeze(differenceVector(operating.execution.reactions, sustained.execution.reactions)),
    }),
  });
}

function requirePrefixBinding(analysis, cii) {
  const nodeIds = new Set(analysis.compilation.model.nodes.map((node) => node.nodeId));
  const matched = [...cii.displacement.get('SUS').keys()]
    .filter((sourceNodeId) => nodeIds.has(`${NODE_PREFIX}${sourceNodeId}`));
  if (matched.length === 0) {
    throw new Error(`M043 node prefix ${NODE_PREFIX} binds no CAESAR node to the solved model; the runtime prefix has changed.`);
  }
  return matched.length;
}

export function buildBm4LadderReport() {
  const solved = solveBm4M035M036Combined();
  const cii = loadBm4LadderAuthority();
  const boundNodeCount = requirePrefixBinding(solved.sustained, cii);

  const analysisByCase = new Map([
    ['SUS', solved.sustained],
    ['OPE', solved.operating],
    ['EXP', expansionPseudoAnalysis(solved.sustained, solved.operating)],
  ]);

  const loadBalance = M043_CASES.map((caseLabel) => auditGlobalLoadBalance({
    analysis: analysisByCase.get(caseLabel), cii, caseLabel,
  }));
  const caseInvariants = auditCaesarCaseLoadInvariants(cii);
  const displacement = M043_CASES.map((caseLabel) => auditDisplacementParity({
    analysis: analysisByCase.get(caseLabel), cii, caseLabel, nodePrefix: NODE_PREFIX,
  }));
  const slopeContrast = contrastCaseSlopes(displacement);

  // L4. The self-test runs on the real sustained solve and gates everything
  // after it: a retrace that cannot reproduce the solver's own reactions is not
  // evidence about CAESAR.
  const elementIndex = buildElementIndex(solved.sustained);
  const selfTest = selfTestRetrace(solved.sustained, elementIndex);

  const retrace = [];
  for (const caseLabel of M043_RETRACEABLE_CASES) {
    const analysis = analysisByCase.get(caseLabel);
    const caseElementIndex = caseLabel === 'SUS' ? elementIndex : buildElementIndex(analysis);
    if (selfTest.status !== 'QUALIFIED') {
      retrace.push(Object.freeze({
        level: 'L4', name: 'RESIDUAL_RETRACE', caseLabel,
        status: 'BLOCKED_PENDING_QUALIFIED_SELF_TEST',
      }));
      continue;
    }
    const { caesar, field } = caesarDisplacementField({ cii, caseLabel, nodePrefix: NODE_PREFIX });
    const precision = M043_LADDER_POLICY.authorityDisplacementPrecision;
    const admission = admitElements({
      elementIndex: caseElementIndex,
      displacementPrecision: precision,
      noiseBudgetNewtons: precision.elementNoiseBudgetNewtons,
    });
    const admittedElementIds = new Set(admission.admitted.map((element) => element.elementId));
    const nodes = resolveRetraceableNodes({
      elementIndex: caseElementIndex,
      caesarDisplacement: caesar,
      nodePrefix: NODE_PREFIX,
      admittedElementIds,
    });
    const assembled = assembleResidual({
      elementIndex: caseElementIndex,
      loadCase: analysis.loadCase,
      displacement: field,
      displacementPrecision: M043_LADDER_POLICY.authorityDisplacementPrecision,
    });
    const constrainedKeys = new Set(analysis.execution.reactions.map((row) => `${row.nodeId}|${row.dof}`));
    const signature = classifyResidualSignature({
      residual: assembled.residual,
      appliedLoad: assembled.f,
      noise: assembled.noise,
      retraceableNodes: nodes.retraceable,
      constrainedKeys,
      elementIndex: caseElementIndex,
      caseLabel,
      resolvableSignalToNoiseRatio:
        M043_LADDER_POLICY.authorityDisplacementPrecision.resolvableSignalToNoiseRatio,
    });
    retrace.push(Object.freeze({
      level: 'L4',
      name: 'RESIDUAL_RETRACE',
      caseLabel,
      status: 'COMPUTED',
      identity: 'r = K_lfea * u_caesar - F_lfea',
      elementAdmission: Object.freeze({
        admittedElementCount: admission.admitted.length,
        rejectedElementCount: admission.rejected.length,
        noiseBudgetNewtons: admission.noiseBudgetNewtons,
        worstRejected: Object.freeze(admission.rejected.slice(0, 10)),
      }),
      retraceableNodeCount: nodes.retraceable.length,
      excludedNodeCount: nodes.excluded.length,
      excludedNodes: nodes.excluded,
      signature,
      verdict: deriveVerdict(signature),
    }));
  }

  return Object.freeze({
    schema: 'lfea-m043-bm4-causal-order-ladder/v1',
    subject: 'BM4 CASE 19 (SUS) / 20 (OPE) / 21 (EXP)',
    method: 'COMPARE_IN_CAUSAL_ORDER_AND_STOP_AT_THE_FIRST_LEVEL_THAT_DISAGREES',
    policy: M043_LADDER_POLICY,
    boundNodeCount,
    solverStatus: Object.freeze({
      sustained: solved.sustained.execution.status,
      operating: solved.operating.execution.status,
    }),
    levels: Object.freeze({
      L0: M043_L0_DISPOSITION,
      L2: Object.freeze({ perCase: Object.freeze(loadBalance), authorityInvariants: caseInvariants }),
      L3: Object.freeze({ perCase: Object.freeze(displacement), slopeContrast }),
      L4: Object.freeze({ selfTest, perCase: Object.freeze(retrace) }),
    }),
  });
}

function fraction(value) {
  return value === null || value === undefined ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function printReport(report) {
  console.log(`--- M043 BM4 causal-order ladder (SUS ${report.solverStatus.sustained} / OPE ${report.solverStatus.operating}) ---`);
  console.log(`L0 ${report.levels.L0.status}`);

  console.log('\nL2 GLOBAL LOAD BALANCE (isolates load vector + restraint set, independent of K)');
  for (const level of report.levels.L2.perCase) {
    console.log(`  ${level.caseLabel}: ${level.status}  force ${level.summary.force.passedCount}/${level.summary.force.total}  moment ${level.summary.moment.passedCount}/${level.summary.moment.total}`);
    for (const row of level.rows) {
      const pct = row.percentDifference === null ? 'near-zero' : `${row.percentDifference.toFixed(2)}%`;
      console.log(`    ${row.dof}: lfea=${row.ours.toFixed(2)} caesar=${row.reference.toFixed(2)} delta=${row.delta.toFixed(2)} ${row.units} ${pct} ${row.passed ? 'PASS' : 'FAIL'}`);
    }
  }
  const invariants = report.levels.L2.authorityInvariants;
  console.log(`  authority invariants: ${invariants.interpretation}`);
  console.log(`    vertical totals agree SUS/OPE=${invariants.verticalTotalsAgreeBetweenSusAndOpe} horizontal totals vanish=${invariants.horizontalTotalsVanishInEveryCase}`);

  console.log('\nL3 NODAL DISPLACEMENT PARITY (the primary solve unknown)');
  for (const level of report.levels.L3.perCase) {
    console.log(`  ${level.caseLabel}: matched nodes=${level.matchedNodeCount} authority-only=${level.caesarOnlyNodeCount}`);
    console.log(`    translation ${fraction(level.summary.translation.passedFraction)} within ${M043_LADDER_POLICY.displacement.targetTolerancePercent}%  slope=${level.summary.translation.regression.slope?.toFixed(4)} signAgreement=${fraction(level.summary.translation.regression.signAgreement)}`);
    console.log(`    rotation    ${fraction(level.summary.rotation.passedFraction)} within ${M043_LADDER_POLICY.displacement.targetTolerancePercent}%  slope=${level.summary.rotation.regression.slope?.toFixed(4)} signAgreement=${fraction(level.summary.rotation.regression.signAgreement)}`);
    console.log(`    byDof ${DOF_ORDER.map((dof) => `${dof}=${fraction(level.summary.byDof[dof].passedFraction)}`).join(' ')}`);
  }

  console.log('\nL4 RESIDUAL RETRACE  r = K_lfea * u_caesar - F_lfea');
  const selfTest = report.levels.L4.selfTest;
  console.log(`  self-test: ${selfTest.status}  freeDof=${selfTest.freeDofWorstNormalized.toExponential(3)} (limit ${selfTest.freeDofLimit}) reaction=${selfTest.reactionWorstRelative.toExponential(3)} (limit ${selfTest.reactionLimit})`);
  for (const level of report.levels.L4.perCase) {
    if (level.status !== 'COMPUTED') { console.log(`  ${level.caseLabel}: ${level.status}`); continue; }
    const s = level.signature;
    console.log(`  ${level.caseLabel}: retraceable nodes=${level.retraceableNodeCount} excluded=${level.excludedNodeCount}`);
    console.log(`    resolution: ${s.resolution.resolvableNodeCount}/${s.resolution.freeRetraceableNodeCount} nodes resolvable above their own noise bound (best SNR ${s.resolution.worstSignalToNoiseRatio.toPrecision(3)}, required ${s.resolution.resolvableSignalToNoiseRatio}) -> ${s.resolution.status}`);
    console.log(`    verdict: ${level.verdict.status}`);
    for (const finding of level.verdict.findings) console.log(`      [${finding.code}] ${finding.detail}`);
    if (s.resolution.status !== 'NO_RESOLVABLE_DOF_AT_THIS_AUTHORITY_PRECISION') {
      console.log(`    global free-DOF force sum = ${s.globalForceSumMagnitude.toPrecision(6)} N (${fraction(s.globalForceSumFractionOfLoadScale)} of load scale ${s.loadScale.toPrecision(6)})`);
      console.log(`    residual RMS: force=${s.familySplit.forceResidualRms.toPrecision(6)} N moment=${s.familySplit.momentResidualRms.toPrecision(6)} N*m`);
      console.log(`    axial signature: meanAxialFraction=${s.axialSignature.meanAxialFraction?.toFixed(3)} over ${s.axialSignature.sampledNodeCount} nodes -> ${s.axialSignature.interpretation}`);
      console.log('    worst 5 resolvable nodes by force residual:');
      for (const row of s.worstNodesByForceResidual.slice(0, 5)) {
        console.log(`      ${row.nodeId}: |r|=${row.forceMagnitude.toPrecision(6)} N noiseBound=${row.forceNoiseBound.toPrecision(6)} N SNR=${row.signalToNoiseRatio?.toPrecision(3)} axialFraction=${row.axialFraction?.toFixed(3)} via ${row.governingElementId} (L=${row.governingElementLength?.toPrecision(3)}m)`);
      }
    }
  }
}

function main() {
  const report = buildBm4LadderReport();
  printReport(report);
  const target = fileURLToPath(new URL('../reports/m043-bm4-causal-order-ladder.json', import.meta.url));
  mkdirSync(dirname(resolve(target)), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nFull ladder report written to reports/m043-bm4-causal-order-ladder.json`);
}

if (process.argv[1] && process.argv[1].endsWith('lfea-m043-bm4-ladder-report.mjs')) main();
