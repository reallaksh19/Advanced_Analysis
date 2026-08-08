import {
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
} from '../src/core/linear-fea-solver/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import { compileSolverExecution } from '../src/core/linear-fea-solver/index.js';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';
import { solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { BM4_SOLVER_CONDITIONING_PROFILE } from './lfea-m034-bm4-solve-fixtures.mjs';
import { analyseCase, buildBm4M035FeatureAuthorities } from './lfea-m035-bm4-feature-solve-runtime.mjs';
import {
  PRESSURE_ELONGATION_SKIPPED_ELEMENT_IDS,
  addPressureElongationToContribution,
  pressureElongationGlobalVector,
} from './lfea-m045-bm4-pressure-elongation.mjs';

// M045 solve: re-runs M035's own case build (frames, piping components, load
// case) UNCHANGED via the exported analyseCase, then re-solves with each
// eligible frame's initialStrainLoadGlobal augmented by closed-end pressure
// elongation. solveBm4M035FeatureCases() itself is untouched by this file,
// so M035's own qualification suite and every existing consumer of it
// (M043's L2/L3/L4, M044's node-level report) keep their original numbers;
// this is a NEW, separate solve variant, not a replacement.

const SKIPPED = new Set(PRESSURE_ELONGATION_SKIPPED_ELEMENT_IDS);

function pressurizedElementIds(loadCase) {
  return new Set(loadCase.primitives.filter((row) => row.kind === 'PRESSURE').map((row) => row.elementId));
}

function withPressureElongation(frame, authorities) {
  const entry = authorities.entryByElementId.get(frame.elementId);
  if (!entry) throw new Error(`M045: no M035 authority entry for ${frame.elementId}.`);
  const section = entry.sourceEntry.physicalSection;
  const extra = pressureElongationGlobalVector({
    pressure: entry.sourceEntry.sourceSegment.meta.analysis.pressure,
    poissonRatio: authorities.material.materialState.poissonRatio,
    innerDiameter: section.dimensions.innerDiameter,
    outerDiameter: section.dimensions.outerDiameter,
    elasticModulus: frame.material.elasticModulus,
    area: frame.section.area,
    transformationMatrix: frame.transformation.matrix,
  });
  return addPressureElongationToContribution(elementContributionFromFrameElement(frame), extra);
}

function analyseCaseWithPressureElongation(authorities, loadCaseId, thermal) {
  const base = analyseCase(authorities, loadCaseId, thermal);
  const pressurized = pressurizedElementIds(base.loadCase);
  const contributions = base.frames.map((frame) => {
    const eligible = pressurized.has(frame.elementId) && !SKIPPED.has(frame.elementId);
    return eligible ? withPressureElongation(frame, authorities) : elementContributionFromFrameElement(frame);
  });
  const execution = compileSolverExecution({
    compilation: authorities.compilation,
    elementContributions: [
      ...contributions,
      ...base.pipingComponents.flatMap(elementContributionsFromPipingComponent),
    ],
    loadCase: base.loadCase,
    solverProfile: solverProfile(BM4_SOLVER_CONDITIONING_PROFILE),
  });
  const recovery = compileResultRecovery({
    compilation: authorities.compilation,
    execution,
    loadCase: base.loadCase,
    frameElements: base.frames,
    pipingComponents: base.pipingComponents,
    recoveryProfile: recoveryProfile({ recoverComponentCodePoints: false }),
  });
  return Object.freeze({
    loadCase: base.loadCase,
    frames: base.frames,
    pipingComponents: base.pipingComponents,
    execution,
    recovery,
    pressureElongationElementCount: [...pressurized].filter((id) => !SKIPPED.has(id)).length,
    pressureElongationSkippedCount: [...pressurized].filter((id) => SKIPPED.has(id)).length,
  });
}

export function solveBm4M045PressureElongationCases() {
  const authorities = buildBm4M035FeatureAuthorities();
  const sustained = analyseCaseWithPressureElongation(authorities, 'BM4-M045-SUSTAINED-W-P1', false);
  const operating = analyseCaseWithPressureElongation(authorities, 'BM4-M045-OPERATING-W-T1-P1', true);
  return Object.freeze({ authorities, sustained, operating });
}

const NODE_PREFIX = 'BM4M035.N';

function stripPrefix(entries) {
  return entries.map((row) => Object.freeze({ ...row, nodeId: row.nodeId.replace(NODE_PREFIX, '') }));
}

/** {SUS, OPE} executions with pressure elongation applied, keyed by bare CAESAR node id -- same shape as M044's bm4NlLfeaExecutions(), for direct reuse by M044's node-comparison functions. */
export function bm4NlLfeaExecutionsWithPressureElongation() {
  const solved = solveBm4M045PressureElongationCases();
  return Object.freeze({
    SUS: Object.freeze({ ...solved.sustained.execution, reactions: stripPrefix(solved.sustained.execution.reactions), displacement: stripPrefix(solved.sustained.execution.displacement) }),
    OPE: Object.freeze({ ...solved.operating.execution, reactions: stripPrefix(solved.operating.execution.reactions), displacement: stripPrefix(solved.operating.execution.displacement) }),
  });
}
