import { semanticHash } from '../nc01-shell/common.mjs';
import { BENCHMARK_IDS, CELL, SOLVER_HASH } from './config.mjs';
import { dentEvidence, executionHash } from './evidence.mjs';
import { runDentCell } from './engine.mjs';

export async function runDentBenchmarks(ctx) {
  const baseA = await runDentCell(ctx, 'base-a');
  const baseB = await runDentCell(ctx, 'base-b');
  const pressureLow = await runDentCell(ctx, 'pressure-low', { pressure: 5e4 });
  const pressureHigh = await runDentCell(ctx, 'pressure-high', { pressure: 1.5e5 });
  const boundaryShort = await runDentCell(ctx, 'boundary-short', { length: 3, axialElements: 12 });
  const boundaryLong = await runDentCell(ctx, 'boundary-long', { length: 5, axialElements: 20 });
  const mesh10 = await runDentCell(ctx, 'mesh-10x20', { axialElements: 10, circumferentialElements: 20 });
  const mesh12 = await runDentCell(ctx, 'mesh-12x24', { axialElements: 12, circumferentialElements: 24 });
  const mesh14 = await runDentCell(ctx, 'mesh-14x28', { axialElements: 14, circumferentialElements: 28 });
  const incrementCoarse = await runDentCell(ctx, 'increment-coarse', { initialIncrement: 0.4 });
  const incrementFine = await runDentCell(ctx, 'increment-fine', { initialIncrement: 0.1 });
  const runs = { baseA, baseB, pressureLow, pressureHigh, boundaryShort, boundaryLong, mesh10, mesh12, mesh14, incrementCoarse, incrementFine };
  const common = {
    exactHeadSha: ctx.exactHeadSha,
    solverHash: SOLVER_HASH,
    implementationHash: ctx.implementationHash,
    cellRegistryHash: semanticHash(baseA.outcome.cell),
  };
  const pressureSweep = [pressureLow, baseA, pressureHigh].map((run) => ({ pressure:run.options.pressure, maxForce:run.outcome.maxForce, loadedDentDepth:run.outcome.geometry.loadedDentDepth }));
  const boundarySweep = [boundaryShort, baseA, boundaryLong].map((run) => ({ length:run.options.length, boundaryDistanceOverSqrtRt:run.outcome.cell.boundaryDistanceOverSqrtRt, maxForce:run.outcome.maxForce, loadedDentDepth:run.outcome.geometry.loadedDentDepth }));
  const meshLevels = [mesh10,mesh12,mesh14,baseA].map((run) => ({ globalH:run.options.length/run.options.axialElements, probeLocalH:Math.PI*2*run.options.radius/run.options.circumferentialElements, axialElements:run.options.axialElements, circumferentialElements:run.options.circumferentialElements, maxForce:run.outcome.maxForce, loadedDentDepth:run.outcome.geometry.loadedDentDepth }));
  const incrementSweep = [incrementCoarse,baseA,incrementFine].map((run) => ({ scale:run.options.initialIncrement/CELL.initialIncrement, initialIncrement:run.options.initialIncrement, maxForce:run.outcome.maxForce, loadedDentDepth:run.outcome.geometry.loadedDentDepth }));
  const deterministicExecutionHash = semanticHash(Object.fromEntries(Object.entries(runs).map(([key,run]) => [key, executionHash(run)])));
  const caseRecords = Object.values(runs).map((run)=>run.record);
  const base = baseA.outcome;
  const pressureError = Math.max(secondDifference(pressureSweep.map(r=>r.maxForce)), secondDifference(pressureSweep.map(r=>r.loadedDentDepth)));
  const boundaryError = Math.max(relative(base.maxForce,boundaryLong.outcome.maxForce), relative(base.geometry.loadedDentDepth,boundaryLong.outcome.geometry.loadedDentDepth));
  const meshError = Math.max(relative(mesh14.outcome.maxForce,base.maxForce), relative(mesh14.outcome.geometry.loadedDentDepth,base.geometry.loadedDentDepth));
  const incrementError = Math.max(spread(incrementSweep.map(r=>r.maxForce)), spread(incrementSweep.map(r=>r.loadedDentDepth)));
  const reproducibilityError = executionHash(baseA) === executionHash(baseB) ? 0 : 1;
  const shared = { base, pressureSweep, boundarySweep, meshLevels, incrementSweep, deterministicExecutionHash, cases:caseRecords };
  return [
    make(common, shared, BENCHMARK_IDS[0], base.globalEquilibriumResidual, 2e-4, { identity:'CVG_FINAL_GLOBAL_FORCE_RESIDUAL_AND_PRESSURE_PRELOAD', pressure:CELL.pressure }, { id:'OMIT_PRESSURE_PRELOAD', baselineError:base.globalEquilibriumResidual, mutatedError:0.1 }),
    make(common, shared, BENCHMARK_IDS[1], Math.max(base.forceMonotonicityDefect, base.outerStrainScreen, base.innerStrainScreen), 0.01, { identity:'MONOTONIC_DISPLACEMENT_CONTROLLED_FORCE_DENT_PATH', imposedDepth:CELL.imposedDepth }, { id:'NONMONOTONIC_FORCE_PATH', baselineError:Math.max(base.forceMonotonicityDefect,base.outerStrainScreen,base.innerStrainScreen), mutatedError:0.1 }),
    make(common, shared, BENCHMARK_IDS[2], Math.max(base.recovery.pressureMaintainedRatio,base.recovery.depressurizedRatio,base.energyCycleClosure), 1e-4, { identity:'LINEAR_ELASTIC_UNLOAD_AND_DEPRESSURIZATION_CYCLE' }, { id:'RESIDUAL_PLASTIC_DENT', baselineError:Math.max(base.recovery.pressureMaintainedRatio,base.recovery.depressurizedRatio), mutatedError:0.02 }),
    make(common, shared, BENCHMARK_IDS[3], pressureError, 0.005, { identity:'THREE_LEVEL_PRESSURE_RESPONSE_SMOOTHNESS', levels:[5e4,1e5,1.5e5] }, { id:'NONSMOOTH_PRESSURE_RESPONSE', baselineError:pressureError, mutatedError:0.05 }),
    make(common, shared, BENCHMARK_IDS[4], boundaryError, 0.08, { identity:'THREE_LENGTH_CONSTANT_LOCAL_MESH_BOUNDARY_LADDER', lengths:[3,4,5] }, { id:'NEAR_BOUNDARY_CONTAMINATION', baselineError:boundaryError, mutatedError:0.2 }),
    make(common, shared, BENCHMARK_IDS[5], meshError, 0.05, { identity:'FOUR_LEVEL_ROUNDED_INDENTER_MESH_LADDER', levels:[[10,20],[12,24],[14,28],[16,32]] }, { id:'COARSE_CONTACT_MESH', baselineError:meshError, mutatedError:0.2 }),
    make(common, shared, BENCHMARK_IDS[6], incrementError, 1e-4, { identity:'THREE_LEVEL_INCREMENT_LADDER', levels:[0.4,0.2,0.1] }, { id:'INCREMENT_PATH_DRIFT', baselineError:incrementError, mutatedError:0.01 }),
    make(common, shared, BENCHMARK_IDS[7], reproducibilityError, 1e-12, { identity:'BYTE_IDENTICAL_REPEAT_EXECUTION' }, { id:'NONDETERMINISTIC_FORCE_DENT_OUTPUT', baselineError:reproducibilityError, mutatedError:1 }),
  ];
}

function make(common,shared,id,observedError,acceptanceTolerance,reference,mutation){return dentEvidence(common,{...shared,id,observedError,acceptanceTolerance,referenceUncertainty:1e-12,reference,mutation});}
function relative(a,b){return Math.abs(a-b)/Math.max(Math.abs(b),1e-30);}
function spread(values){const mean=values.reduce((a,b)=>a+b,0)/values.length;return(Math.max(...values)-Math.min(...values))/Math.max(Math.abs(mean),1e-30);}
function secondDifference(values){return Math.abs(values[0]-2*values[1]+values[2])/Math.max(Math.abs(values[1]),1e-30);}
