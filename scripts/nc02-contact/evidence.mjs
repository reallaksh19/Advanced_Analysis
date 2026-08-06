import { seal } from '../nc01-shell/common.mjs';

export function contactEvidence(common,input){
  const raw=seal({schema:'lafea-nc02-raw-contact-manifest/v2',benchmarkId:input.id,caseRecords:Array.isArray(input.scenario)?input.scenario.map(s=>s.record):[input.scenario.record]},'semanticHash');
  const reference=seal({schema:'lafea-nc02-independent-contact-reference/v2',benchmarkId:input.id,...input.reference},'semanticHash');
  const oracle=seal({schema:'lafea-nc02-independent-contact-oracle/v2',benchmarkId:input.id,implementationId:'LAFEA_NC02_ANALYTICAL_PLANE_FACET_ORACLE_V2',implementationHash:common.implementationHash,productionClosestPointImports:[],referenceHash:reference.semanticHash},'semanticHash');
  return seal({schema:'nonlinear-shell-contact-contact-benchmark-evidence/v2',id:input.id,...common,source:'EXTERNAL_SOLVER_EXECUTION',rawEvidenceHash:raw.semanticHash,referenceHash:reference.semanticHash,oracleHash:oracle.semanticHash,referenceUncertainty:1e-8,acceptanceTolerance:input.tolerance,observedError:finite(input.observedError),
    signedGapRange:[finite(input.metrics.signedGapMin),finite(input.metrics.signedGapMax)],contactNormal:input.metrics.contactNormal,pressureRange:[0,finite(input.metrics.maxPressure)],activeSetCount:input.metrics.activeCount,penetrationRatio:finite(input.metrics.penetrationRatio),contactResultant:[0,0,finite(input.metrics.normalResultant)],contactEnergy:finite(input.metrics.contactEnergy),tangentialTractionMax:finite(input.metrics.tangentialTractionMax),contactWorkImbalance:finite(input.metrics.contactWorkImbalance),globalEquilibriumResidual:finite(input.metrics.globalEquilibriumResidual),closestPointIdentity:'INDEPENDENT_ANALYTICAL_MASTER_FACET',surfaceParameterCoordinates:[0,0],orientationEvidence:'MASTER_NORMAL_TO_ADMISSIBLE_SLAVE_REGION',penaltySweep:input.penaltySweep,incrementSweep:input.incrementSweep,meshLevels:input.meshLevels,stateSequence:input.stateSequence??[],mutation:input.mutation},'semanticHash');
}


function finite(n){if(!Number.isFinite(n))throw new TypeError('Non-finite contact evidence.');return n;}
