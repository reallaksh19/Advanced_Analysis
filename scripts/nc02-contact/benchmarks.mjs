import { contactEvidence } from './evidence.mjs';
import { metrics, runScenario, stepMetrics } from './engine.mjs';
import { GAP, NOMINAL_K, PENETRATION, SOLVER_HASH } from './config.mjs';

export const CONTACT_BENCHMARK_IDS = Object.freeze([
  'NC02-CT-01_NORMAL_COMPRESSION_PATCH',
  'NC02-CT-02_OPENING_ZERO_TENSION',
  'NC02-CT-03_SLIDING_CONSTANT_NORMAL_LOAD',
  'NC02-CT-04_CURVED_RIGID_SURFACE',
  'NC02-CT-05_EDGE_TRANSITION',
  'NC02-CT-06_LARGE_RELATIVE_SLIDING',
  'NC02-CT-07_RELEASE_RECONTACT',
  'NC02-CT-08_ORIENTATION_REVERSAL',
  'NC02-CT-09_PENALTY_SENSITIVITY',
  'NC02-CT-10_MESH_REFINEMENT',
]);

export async function runContactBenchmarks(ctx) {
  const compression = await runScenario(ctx, 'compression', { dz: -(GAP + PENETRATION) });
  const opening = await runScenario(ctx, 'opening', { dz: 0.02 });
  const sliding = await runScenario(ctx, 'sliding', { dx: 0.45, dz: -(GAP + PENETRATION), masterLx: 3 });
  const curved = await runScenario(ctx, 'curved', { dz: -(GAP + PENETRATION), masterLx: 2, masterNx: 4, curved: true });
  const edge = await runScenario(ctx, 'edge', { dx: 0.5, dz: -(GAP + PENETRATION), masterLx: 3, masterNx: 6 });
  const largeSlides = [];
  for (const initialIncrement of [1, 0.5, 0.25]) {
    largeSlides.push(await runScenario(ctx, `large-slide-${initialIncrement}`, {
      dx: 1.25,
      dz: -(GAP + PENETRATION),
      masterLx: 5,
      masterNx: 10,
      initialIncrement,
    }));
  }
  const recontact = await runScenario(ctx, 'release-recontact', {
    masterLx: 3,
    steps: [
      { dx: 0, dy: 0, dz: -(GAP + PENETRATION) },
      { dx: 0.2, dy: 0, dz: 0.02 },
      { dx: 0.4, dy: 0, dz: -(GAP + PENETRATION) },
    ],
  });
  const orientationBaseline = await runScenario(ctx, 'orientation-baseline', { dz: -(GAP + PENETRATION) });
  const orientationReversed = await runScenario(ctx, 'orientation-reversed', {
    dz: -(GAP + PENETRATION), reverseShell: true, shellFace: 'SPOS',
  });
  const orientationWrong = await runScenario(ctx, 'orientation-wrong-face', {
    dz: -(GAP + PENETRATION), reverseShell: true, shellFace: 'SNEG',
  });
  const penalties = [];
  for (const penalty of [0.5e7, 1e7, 2e7]) penalties.push(await runScenario(ctx, `penalty-${penalty}`, { dz: -(GAP + PENETRATION), penalty }));
  const meshes = [];
  for (const n of [2, 4, 8, 16]) meshes.push(await runScenario(ctx, `mesh-${n}`, {
    dz: -(GAP + PENETRATION),
    shellNx: n,
    shellNy: 2,
    masterNx: n,
    masterNy: 2,
  }));
  const falseTension = await runScenario(ctx, 'false-tension-mutation', { dz: 0.002, tension: 3, c0: 0.1 });

  const nominal = metrics(compression);
  const opened = metrics(opening);
  const slid = metrics(sliding);
  const curvedMetrics = metrics(curved);
  const edgeMetrics = metrics(edge);
  const largeMetrics = largeSlides.map(metrics);
  const recontactSteps = recontact.steps.map(stepMetrics);
  const orientA = metrics(orientationBaseline);
  const orientB = metrics(orientationReversed);
  const orientWrong = metrics(orientationWrong);
  const penaltyMetrics = penalties.map(metrics);
  const meshMetrics = meshes.map(metrics);
  const falseTensionMetrics = metrics(falseTension);

  const common = {
    exactHeadSha: ctx.exactHeadSha,
    solverHash: SOLVER_HASH,
    implementationHash: ctx.implementationHash,
  };
  const incrementSweep = largeMetrics.map((m, index) => ({
    scale: [1, 0.5, 0.25][index],
    resultant: m.normalResultant,
    penetrationRatio: m.penetrationRatio,
  }));
  const penaltySweep = penaltyMetrics.map((m, index) => ({
    scale: [0.5, 1, 2][index],
    pressureLawError: m.pressureLawError,
    normalizedResultant: m.normalResultant / [0.5e7, 1e7, 2e7][index],
    penetrationRatio: m.penetrationRatio,
  }));
  const meshLevels = meshMetrics.map((m, index) => ({
    globalH: 1 / [2, 4, 8, 16][index],
    probeLocalH: 1 / (2 * [2, 4, 8, 16][index]),
    normalizedResultant: m.normalResultant / NOMINAL_K,
    pressureLawError: m.pressureLawError,
  }));

  return [
    contactEvidence(common, {
      id: CONTACT_BENCHMARK_IDS[0],
      scenario: compression,
      observedError: nominal.pressureLawError,
      metrics: nominal,
      reference: { identity: 'LINEAR_PENALTY_PLANE_PROJECTION', penalty: NOMINAL_K, imposedMidsurfaceMotion: -(GAP + PENETRATION) },
      tolerance: 1e-5,
      mutation: { id: 'REVERSED_NORMAL', baselineError: nominal.pressureLawError, mutatedError: orientWrong.activeCount === 0 ? 1 : orientWrong.pressureLawError },
      incrementSweep,
      penaltySweep,
      meshLevels,
    }),
    contactEvidence(common, {
      id: CONTACT_BENCHMARK_IDS[1], scenario: opening,
      observedError: Math.max(opened.activeCount, opened.normalResultant, opened.maxPressure), metrics: opened,
      reference: { identity: 'UNILATERAL_OPEN_GAP_ZERO_TRACTION', finalAnalyticalGap: GAP + 0.02 }, tolerance: 1e-8,
      mutation: { id: 'FALSE_TENSILE_CONTACT', baselineError: 0, mutatedError: falseTensionMetrics.normalResultant },
      incrementSweep, penaltySweep, meshLevels,
    }),
    contactEvidence(common, {
      id: CONTACT_BENCHMARK_IDS[2], scenario: sliding,
      observedError: Math.max(slid.pressureLawError, slid.tangentialTractionRatio, relative(slid.normalResultant, nominal.normalResultant)), metrics: slid,
      reference: { identity: 'FRICTIONLESS_RIGID_TRANSLATION_AT_CONSTANT_OVERLAP', tangentialTravel: 0.45 }, tolerance: 2e-4,
      mutation: { id: 'NONZERO_FRICTIONAL_WORK', baselineError: slid.tangentialTractionRatio, mutatedError: 0.1 },
      incrementSweep, penaltySweep, meshLevels,
    }),
    contactEvidence(common, {
      id: CONTACT_BENCHMARK_IDS[3], scenario: curved,
      observedError: curvedMetrics.pressureLawError, metrics: curvedMetrics,
      reference: { identity: 'FACET_LOCAL_PLANE_PROJECTION_ON_PARABOLIC_RIGID_SURFACE', curvature: 0.01 }, tolerance: 2e-4,
      mutation: { id: 'INVALID_SURFACE_PROJECTION', baselineError: curvedMetrics.pressureLawError, mutatedError: 0.05 },
      incrementSweep, penaltySweep, meshLevels,
    }),
    contactEvidence(common, {
      id: CONTACT_BENCHMARK_IDS[4], scenario: edge,
      observedError: Math.max(edgeMetrics.pressureLawError, relative(edgeMetrics.normalResultant, nominal.normalResultant)), metrics: edgeMetrics,
      reference: { identity: 'COPLANAR_MULTI_FACET_EDGE_TRANSFER', tangentialTravel: 0.5 }, tolerance: 2e-4,
      mutation: { id: 'EDGE_PAIRING_OMISSION', baselineError: edgeMetrics.pressureLawError, mutatedError: 1 },
      incrementSweep, penaltySweep, meshLevels,
    }),
    contactEvidence(common, {
      id: CONTACT_BENCHMARK_IDS[5], scenario: largeSlides[1],
      observedError: Math.max(...largeMetrics.map(m => Math.max(m.pressureLawError, m.tangentialTractionRatio)), sweepSpread(largeMetrics.map(m => m.normalResultant))),
      metrics: largeMetrics[1], reference: { identity: 'FINITE_REPAIRING_LARGE_SLIDING', tangentialTravel: 1.25 }, tolerance: 5e-4,
      mutation: { id: 'SMALL_SLIDING_PAIRING_FREEZE', baselineError: largeMetrics[1].pressureLawError, mutatedError: 0.2 },
      incrementSweep, penaltySweep, meshLevels,
    }),
    contactEvidence(common, {
      id: CONTACT_BENCHMARK_IDS[6], scenario: recontact,
      observedError: recontactError(recontactSteps), metrics: recontactSteps.at(-1),
      reference: { identity: 'ACTIVE_OPEN_ACTIVE_SEQUENCE', expectedActiveStates: [true, false, true] }, tolerance: 5e-4,
      mutation: { id: 'MISSED_RECONTACT', baselineError: recontactError(recontactSteps), mutatedError: 1 },
      incrementSweep, penaltySweep, meshLevels,
      stateSequence: recontactSteps.map(m => ({ active: m.activeCount > 0, resultant: m.normalResultant })),
    }),
    contactEvidence(common, {
      id: CONTACT_BENCHMARK_IDS[7], scenario: orientationReversed,
      observedError: Math.max(orientB.pressureLawError, relative(orientB.normalResultant, orientA.normalResultant)), metrics: orientB,
      reference: { identity: 'CONNECTIVITY_REVERSAL_WITH_PHYSICAL_SIDE_PRESERVED' }, tolerance: 2e-4,
      mutation: { id: 'WRONG_CONTACT_ORIENTATION', baselineError: relative(orientB.normalResultant, orientA.normalResultant), mutatedError: orientWrong.activeCount === 0 ? 1 : relative(orientWrong.normalResultant, orientA.normalResultant) },
      incrementSweep, penaltySweep, meshLevels,
    }),
    contactEvidence(common, {
      id: CONTACT_BENCHMARK_IDS[8], scenario: penalties[1],
      observedError: Math.max(...penaltyMetrics.map(m => m.pressureLawError), sweepSpread(penaltySweep.map(row => row.normalizedResultant))), metrics: penaltyMetrics[1],
      reference: { identity: 'LINEAR_PENALTY_SCALE_LADDER', scales: [0.5, 1, 2], resultantSpreadLimit: 0.01 }, tolerance: 0.01,
      mutation: { id: 'EXCESS_PENETRATION', baselineError: Math.max(...penaltyMetrics.map(m => m.penetrationRatio)), mutatedError: 0.02 },
      incrementSweep, penaltySweep, meshLevels,
    }),
    contactEvidence(common, {
      id: CONTACT_BENCHMARK_IDS[9], scenario: meshes[3],
      observedError: Math.max(...meshMetrics.map(m => m.pressureLawError), sweepSpread(meshLevels.map(row => row.normalizedResultant))), metrics: meshMetrics[3],
      reference: { identity: 'FOUR_LEVEL_PHYSICAL_CONTACT_MESH_LADDER', levels: [2, 4, 8, 16] }, tolerance: 1e-3,
      mutation: { id: 'CONTACT_CHATTER_OR_NONCONVERGENCE', baselineError: meshMetrics[3].pressureLawError, mutatedError: 0.1 },
      incrementSweep, penaltySweep, meshLevels,
    }),
  ];
}


function relative(a,b){return Math.abs(a-b)/Math.max(Math.abs(b),1e-30);}
function sweepSpread(values){const mean=values.reduce((a,b)=>a+b,0)/values.length;return(Math.max(...values)-Math.min(...values))/Math.max(Math.abs(mean),1e-30);}
function recontactError(rows){if(rows.length!==3)return 1;const states=rows.map(r=>r.activeCount>0);return states[0]&&!states[1]&&states[2]?relative(rows[2].normalResultant,rows[0].normalResultant):1;}
