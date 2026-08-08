import { elementDofIndex } from '../src/core/linear-fea-contract/conventions.js';
import {
  computeFrameElementSemanticHash,
  requireFrameElement,
} from '../src/core/linear-fea-frame-element/frame-element.js';
import {
  requireFrameElementProfile,
  resolveFrameElementPolicies,
} from '../src/core/linear-fea-frame-element/frame-element-contract.js';
import { thermalInitialStrainVector } from '../src/core/linear-fea-frame-element/frame-element-loads.js';
import {
  applyOffsetToLoad,
  condenseEndConditions,
  frameLocalStiffness,
  frameOffsetMatrix,
  transformLoadToGlobal,
} from '../src/core/linear-fea-frame-element/frame-element-stiffness.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
} from '../src/core/linear-fea-solver/index.js';
import { compileUnilateralSolverExecution } from '../src/core/linear-fea-unilateral-solver/index.js';
import { solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';
import { BM4_SOLVER_CONDITIONING_PROFILE } from './lfea-m034-bm4-solve-fixtures.mjs';
import { buildBm4M035FeatureAuthorities } from './lfea-m035-bm4-feature-solve-runtime.mjs';
import {
  analyseM035M036Case,
  buildM035M036Inventory,
} from './lfea-m035-m036-bm4-integration-runtime.mjs';

const DISCLOSURE = 'M047 counterfactual A/B only: closed-end straight-span pressure elongation is injected to test the translation-slope hypothesis. No BM4 Bourdon option authority is asserted; bend-arc rotational/opening effects and rigid-body pressure strain remain excluded.';

function add(left, right) { return left.map((value, index) => value + right[index]); }

function axialStrain(authorities, entry, pressure) {
  const dimensions = entry.sourceEntry.physicalSection.dimensions;
  const elasticModulus = authorities.material.materialState.elasticModulus;
  const poissonRatio = entry.sourceEntry.sourceSegment.meta.analysis.poissonRatio;
  const denominator = elasticModulus * (dimensions.outerDiameter ** 2 - dimensions.innerDiameter ** 2);
  if (!(pressure > 0) || !(denominator > 0) || !Number.isFinite(poissonRatio)) return 0;
  return (1 - 2 * poissonRatio) * pressure * dimensions.innerDiameter ** 2 / denominator;
}

function augmentUniformAxialStrain({ frame, profile, primitive, strain }) {
  const acceptedFrame = requireFrameElement(frame);
  const acceptedProfile = requireFrameElementProfile(profile);
  const policies = resolveFrameElementPolicies(acceptedProfile);
  if (acceptedFrame.profileSemanticHash !== acceptedProfile.semanticHash) throw new Error('M047 frame/profile hash mismatch.');
  if (primitive.elementId !== acceptedFrame.elementId) throw new Error(`M047 pressure primitive mismatch for ${acceptedFrame.elementId}.`);
  const base = frameLocalStiffness({
    elasticModulus: acceptedFrame.material.elasticModulus,
    shearModulus: acceptedFrame.material.shearModulus,
    area: acceptedFrame.section.area,
    secondMomentY: acceptedFrame.section.secondMomentY,
    secondMomentZ: acceptedFrame.section.secondMomentZ,
    polarMoment: acceptedFrame.section.polarMoment,
    length: acceptedFrame.geometry.length,
    shearDeformation: acceptedFrame.shearDeformation,
    shearCorrectionFactorY: acceptedFrame.shearCorrection?.y.value,
    shearCorrectionFactorZ: acceptedFrame.shearCorrection?.z.value,
  });
  const raw = thermalInitialStrainVector({
    elasticModulus: acceptedFrame.material.elasticModulus,
    area: acceptedFrame.section.area,
    axialStrain: strain,
  });
  const entries = [
    ...acceptedFrame.endConditions.releases.map((entry) => ({ index: elementDofIndex(entry.end, entry.dof), stiffness: 0 })),
    ...acceptedFrame.endConditions.springs.map((entry) => ({ index: elementDofIndex(entry.end, entry.dof), stiffness: entry.stiffness })),
  ].sort((left, right) => left.index - right.index);
  const condensed = condenseEndConditions(base.matrix, [raw], entries, policies.releaseSingularityTolerance.value);
  let global = transformLoadToGlobal(condensed.vectors[0], acceptedFrame.transformation.matrix);
  if (acceptedFrame.rigidOffsets.I !== null || acceptedFrame.rigidOffsets.J !== null) {
    global = applyOffsetToLoad(global, frameOffsetMatrix(acceptedFrame.rigidOffsets));
  }
  const draft = {
    ...acceptedFrame,
    initialStrainLoadVector: {
      local: add(acceptedFrame.initialStrainLoadVector.local, condensed.vectors[0]),
      global: add(acceptedFrame.initialStrainLoadVector.global, global),
    },
    limitations: [...acceptedFrame.limitations, {
      code: 'FRAME_ELEMENT_LIMITATION_M047_COUNTERFACTUAL_PRESSURE_ELONGATION',
      severity: 'INFO', scope: 'ELEMENT', stiffnessRelevant: false,
      details: {
        disclosure: DISCLOSURE,
        primitiveId: primitive.primitiveId,
        primitiveSemanticHash: primitive.semanticHash,
        axialStrain: strain,
        freeExtension: strain * acceptedFrame.geometry.length,
      },
    }].sort((left, right) => left.code.localeCompare(right.code)),
    semanticHash: '',
  };
  draft.semanticHash = computeFrameElementSemanticHash(draft);
  return requireFrameElement(draft);
}

function candidateAnalysis(authorities, constraints, label, thermal, movements) {
  const seed = analyseM035M036Case(authorities, constraints, label, thermal, movements);
  const entryByElement = authorities.entryByElementId;
  const pressureByElement = new Map(seed.loadCase.primitives.filter((row) => row.kind === 'PRESSURE').map((row) => [row.elementId, row]));
  let activated = 0;
  const frames = seed.frames.map((frame) => {
    const entry = entryByElement.get(frame.elementId);
    const primitive = pressureByElement.get(frame.elementId);
    if (!entry || !primitive || entry.sourceEntry.rigidAuthority !== null) return frame;
    const strain = axialStrain(authorities, entry, primitive.pressure);
    if (strain === 0) return frame;
    activated += 1;
    return augmentUniformAxialStrain({ frame, profile: authorities.frameProfile, primitive, strain });
  });
  const execution = compileSolverExecution({
    compilation: seed.compilation,
    elementContributions: [
      ...frames.map(elementContributionFromFrameElement),
      ...seed.pipingComponents.flatMap(elementContributionsFromPipingComponent),
    ],
    loadCase: seed.loadCase,
    solverProfile: solverProfile(BM4_SOLVER_CONDITIONING_PROFILE),
  });
  const recovery = compileResultRecovery({
    compilation: seed.compilation, execution, loadCase: seed.loadCase,
    frameElements: frames, pipingComponents: seed.pipingComponents,
    recoveryProfile: recoveryProfile({ recoverComponentCodePoints: false }),
  });
  return Object.freeze({ ...seed, frames, execution, recovery, activated });
}

function finalAnalysis(authorities, inventory, run, label, thermal) {
  const state = new Map(run.convergedState.map((row) => [row.declarationId, row.status]));
  const active = run.unilateral.filter((row) => state.get(row.declarationId) === 'ENGAGED');
  const result = candidateAnalysis(
    authorities,
    [...inventory.base, ...active.map((row) => row.constraintDeclaration)],
    label,
    thermal,
    active.map((row) => row.prescribedMovement).filter(Boolean),
  );
  if (result.execution.semanticHash !== run.finalExecutionHash) throw new Error(`${label} M047 final execution hash drift.`);
  return result;
}

export function solveBm4M047PressureElongationCandidate() {
  const authorities = buildBm4M035FeatureAuthorities();
  const inventory = buildM035M036Inventory(authorities);
  const solve = (label, thermal) => compileUnilateralSolverExecution({
    baseDeclarations: inventory.base,
    unilateral: inventory.unilateral,
    buildAndSolve: (constraints, active) => candidateAnalysis(authorities, constraints, label, thermal, active.prescribedMovements).execution,
  });
  const sustainedRun = solve('BM4-M047-SUS-PRESSURE-ELONGATION-CANDIDATE', false);
  const operatingRun = solve('BM4-M047-OPE-PRESSURE-ELONGATION-CANDIDATE', true);
  const sustained = finalAnalysis(authorities, inventory, sustainedRun, 'BM4-M047-SUS-PRESSURE-ELONGATION-CANDIDATE', false);
  const operating = finalAnalysis(authorities, inventory, operatingRun, 'BM4-M047-OPE-PRESSURE-ELONGATION-CANDIDATE', true);
  return Object.freeze({ authorities, inventory, sustainedRun, operatingRun, sustained, operating, disclosure: DISCLOSURE });
}
