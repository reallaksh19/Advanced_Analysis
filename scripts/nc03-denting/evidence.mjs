import { seal, semanticHash } from '../nc01-shell/common.mjs';

export function dentEvidence(common, input) {
  const raw = seal({ schema:'lafea-nc03-raw-denting-manifest/v2', benchmarkId:input.id, cases:input.cases }, 'semanticHash');
  const reference = seal({ schema:'lafea-nc03-independent-denting-reference/v2', benchmarkId:input.id, ...input.reference }, 'semanticHash');
  const oracle = seal({ schema:'lafea-nc03-independent-denting-oracle/v2', benchmarkId:input.id,
    implementationId:'LAFEA_NC03_STANDALONE_DAT_CVG_ORACLE_V2', implementationHash:common.implementationHash,
    productionDentingImports:[], referenceHash:reference.semanticHash }, 'semanticHash');
  return seal({
    schema:'nonlinear-shell-contact-elastic-denting-evidence/v2',
    id:input.id,
    exactHeadSha:common.exactHeadSha,
    solverHash:common.solverHash,
    implementationHash:common.implementationHash,
    source:'EXTERNAL_SOLVER_EXECUTION',
    cellRegistryHash:common.cellRegistryHash,
    rawEvidenceHash:raw.semanticHash,
    referenceHash:reference.semanticHash,
    oracleHash:oracle.semanticHash,
    referenceUncertainty:input.referenceUncertainty,
    acceptanceTolerance:input.acceptanceTolerance,
    observedError:input.observedError,
    globalEquilibriumResidual:input.base.globalEquilibriumResidual,
    energyCycleClosure:input.base.energyCycleClosure,
    outerStrainScreen:input.base.outerStrainScreen,
    innerStrainScreen:input.base.innerStrainScreen,
    loadedDentDepthRatio:input.base.geometry.loadedDentDepthRatio,
    forcePath:input.base.forcePath,
    recovery:input.base.recovery,
    pressureSweep:input.pressureSweep,
    boundarySweep:input.boundarySweep,
    meshLevels:input.meshLevels,
    incrementSweep:input.incrementSweep,
    deterministicExecutionHash:input.deterministicExecutionHash,
    mutation:input.mutation,
  }, 'semanticHash');
}

export const executionHash = (run) => semanticHash(run.record.deterministicFiles);
