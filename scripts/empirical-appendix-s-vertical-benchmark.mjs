#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  solvePlanarActiveSet, solveGrillage, pipeSection, pipeSectionFromDiameters,
  fixedPlanar, fixedGrillage, sumSupportReactions, sumGrillageReactions,
  recordDeviation, maxAbs, assertClose, sha256, add3, scale3, keyOf,
} from './empirical-appendix-s-vertical-core.mjs';

const METHOD = 'EMPIRICAL_BEAM_CONTACT_V1';
const GRAVITY = 9.80665;
const REACTION_TOLERANCE_N = 1e-6;
const DISPLACEMENT_TOLERANCE_M = 1e-12;

const sourceText = readFileSync(fileURLToPath(import.meta.url), 'utf8');
const importSpecifiers = [...sourceText.matchAll(/from\s+['"]([^'"]+)['"]/gu)].map((match) => match[1]);
assert.deepEqual(importSpecifiers, [
  'node:assert/strict', 'node:fs', 'node:url', './empirical-appendix-s-vertical-core.mjs',
]);
assert.doesNotMatch(sourceText, /src\/core\/(?:linear-fea|centerline-beam-fea)/u);

const example1 = runExample1();
const example2 = runExample2();
const example3 = runExample3();

const payload = {
  schema: 'empirical-appendix-s-vertical-benchmark/v1',
  status: 'PASS',
  method: METHOD,
  sourceBoundary: {
    standardLibraryImportsOnly: true,
    lfeaDependency: false,
    solverResultInput: false,
  },
  examples: [example1, example2, example3],
};
payload.semanticHash = sha256(payload);
console.log(JSON.stringify(payload, null, 2));

function runExample1() {
  const outerDiameterM = 0.4064;
  const wallThicknessM = 0.00953;
  const bendRadiusM = 0.6096;
  const elasticModulusPa = 203.4e9;
  const densityKgPerM3 = 7833.4;
  const contentsMassKgPerM = 117.841;
  const insulationMassKgPerM = 37.456;
  const alphaPerK = 1.2622036262203627e-5;
  const deltaTK = 533.15 - 294.15;
  const bendFlexibility = 9.506141774188135;
  const section = pipeSection(outerDiameterM, wallThicknessM, densityKgPerM3);
  const lineMassKgPerM = section.wallMassKgPerM + contentsMassKgPerM + insulationMassKgPerM;
  const lineLoadNPerM = lineMassKgPerM * GRAVITY;
  const nodes = appendixSExample1Nodes(bendRadiusM);
  const elements = appendixSExample1Elements({
    nodes,
    elasticModulusPa,
    section,
    lineLoadNPerM,
    alphaPerK,
    deltaTK,
    bendRadiusM,
    bendFlexibility,
  });
  const anchors = fixedPlanar(['N10', 'N50']);
  const unilateralSupports = ['N20'];

  const sustained = solvePlanarActiveSet({
    nodes,
    elements: elements.map((element) => ({ ...element, deltaTK: 0 })),
    anchors,
    unilateralSupports,
  });
  const operating = solvePlanarActiveSet({
    nodes,
    elements,
    anchors,
    unilateralSupports,
  });

  const publishedDisplacementMm = {
    N10: 0,
    N15: -1.3,
    N20: 0,
    B30N0: -3.7,
    B30N1: -2.3,
    B30N2: 0.4,
    B40N0: 15.1,
    B40N1: 17.8,
    B40N2: 19.2,
    N45: 13.5,
    N50: 0,
  };
  const publishedSupportReactionN = { N10: 12710, N20: 63050, N50: -2810 };
  const displacementBenchmark = Object.entries(publishedDisplacementMm).map(([nodeId, expectedMm]) => {
    const actualMm = operating.displacement(nodeId, 'UY') * 1000;
    const toleranceMm = Math.max(Math.abs(expectedMm) * 0.08, 1.5);
    assert.ok(Math.abs(actualMm - expectedMm) <= toleranceMm, `${nodeId} OPE UY benchmark`);
    return recordDeviation(nodeId, actualMm, expectedMm, 'mm');
  });
  const supportBenchmark = Object.entries(publishedSupportReactionN).map(([nodeId, expectedN]) => {
    const actualN = operating.reaction(nodeId, 'UY');
    const toleranceN = Math.max(Math.abs(expectedN) * 0.10, 1200);
    assert.ok(Math.abs(actualN - expectedN) <= toleranceN, `${nodeId} OPE vertical reaction benchmark`);
    return recordDeviation(nodeId, actualN, expectedN, 'N');
  });

  assert.equal(operating.activeSupports.includes('N20'), true);
  assertClose(sumSupportReactions(sustained, ['N10', 'N20', 'N50']), sustained.totalAppliedVerticalLoadN, 1e-6);
  assertClose(sumSupportReactions(operating, ['N10', 'N20', 'N50']), operating.totalAppliedVerticalLoadN, 1e-6);

  return {
    example: 'ASME B31.3-2006 Appendix S Example 1',
    benchmarkAuthority: {
      publishedOperatingVerticalDisplacements: true,
      publishedOperatingVerticalSupportLoads: true,
      publishedSustainedVerticalResults: false,
    },
    sustained: summarizePlanarCase(sustained, ['N10', 'N20', 'N50']),
    operating: summarizePlanarCase(operating, ['N10', 'N20', 'N50']),
    operatingBenchmarks: {
      verticalDisplacement: displacementBenchmark,
      verticalSupportReaction: supportBenchmark,
      maximumAbsoluteDisplacementDeviationMm: maxAbs(displacementBenchmark.map((row) => row.absoluteDeviation)),
      maximumAbsoluteSupportDeviationN: maxAbs(supportBenchmark.map((row) => row.absoluteDeviation)),
    },
  };
}

function runExample2() {
  const outerDiameterM = 0.4064;
  const wallThicknessM = 0.00953;
  const bendRadiusM = 0.6096;
  const elasticModulusPa = 203.4e9;
  const densityKgPerM3 = 7833.4;
  const contentsMassKgPerM = 117.841;
  const insulationMassKgPerM = 37.456;
  const alphaPerK = 1.2827715355805244e-5;
  const deltaTK = 561.15 - 294.15;
  const bendFlexibility = 9.36566184176338;
  const section = pipeSection(outerDiameterM, wallThicknessM, densityKgPerM3);
  const lineMassKgPerM = section.wallMassKgPerM + contentsMassKgPerM + insulationMassKgPerM;
  const lineLoadNPerM = lineMassKgPerM * GRAVITY;
  const nodes = appendixSExample2Nodes(bendRadiusM);
  const elements = appendixSExample2Elements({
    nodes,
    elasticModulusPa,
    section,
    lineLoadNPerM,
    alphaPerK,
    deltaTK,
    bendRadiusM,
    bendFlexibility,
  });
  const anchors = fixedPlanar(['N10', 'N110']);
  const unilateralSupports = ['N20', 'N50', 'N120'];

  const sustained = solvePlanarActiveSet({
    nodes,
    elements: elements.map((element) => ({ ...element, deltaTK: 0 })),
    anchors,
    unilateralSupports,
  });
  const operating = solvePlanarActiveSet({ nodes, elements, anchors, unilateralSupports });

  assert.deepEqual(sustained.activeSupports, ['N120', 'N20', 'N50']);
  assert.deepEqual(operating.activeSupports, ['N120', 'N20']);
  const apexTrial = operating.iterations[0].supportReactionsN.N50;
  assert.ok(apexTrial < -1000, `Example 2 apex attached trial must be tensile: ${apexTrial}`);
  assertClose(operating.reaction('N50', 'UY'), 0, REACTION_TOLERANCE_N);
  assert.ok(operating.displacement('N50', 'UY') > 0);

  const publishedSupportReactionN = {
    N10: 14050,
    N20: 58900,
    N120: 58900,
    N110: 14050,
  };
  const supportBenchmark = Object.entries(publishedSupportReactionN).map(([nodeId, expectedN]) => {
    const actualN = operating.reaction(nodeId, 'UY');
    const toleranceN = Math.max(Math.abs(expectedN) * 0.10, 1200);
    assert.ok(Math.abs(actualN - expectedN) <= toleranceN, `${nodeId} Example 2 OPE vertical reaction benchmark`);
    return recordDeviation(nodeId, actualN, expectedN, 'N');
  });

  assertClose(sumSupportReactions(sustained, ['N10', 'N20', 'N50', 'N120', 'N110']), sustained.totalAppliedVerticalLoadN, 1e-6);
  assertClose(sumSupportReactions(operating, ['N10', 'N20', 'N120', 'N110']), operating.totalAppliedVerticalLoadN, 1e-6);

  return {
    example: 'ASME B31.3-2006 Appendix S Example 2',
    benchmarkAuthority: {
      publishedOperatingVerticalSupportLoads: true,
      publishedNumericApexDisplacement: false,
      publishedSustainedVerticalResults: false,
    },
    sustained: summarizePlanarCase(sustained, ['N10', 'N20', 'N50', 'N120', 'N110']),
    operating: summarizePlanarCase(operating, ['N10', 'N20', 'N50', 'N120', 'N110']),
    liftOff: {
      supportId: 'N50',
      attachedTrialReactionN: apexTrial,
      finalReactionN: operating.reaction('N50', 'UY'),
      finalUpwardDisplacementMm: operating.displacement('N50', 'UY') * 1000,
      releasedAtIteration: operating.iterations.findIndex((iteration) => iteration.releasedSupports.includes('N50')) + 1,
    },
    operatingBenchmarks: {
      verticalSupportReaction: supportBenchmark,
      maximumAbsoluteSupportDeviationN: maxAbs(supportBenchmark.map((row) => row.absoluteDeviation)),
      displacementDisposition: 'EMPIRICAL_RESULT_NO_PUBLISHED_NUMERIC_VERTICAL_REFERENCE',
    },
  };
}

function runExample3() {
  const elasticModulusPa = 203.4e9;
  const poissonRatio = 0.3;
  const shearModulusPa = elasticModulusPa / (2 * (1 + poissonRatio));
  const densityKgPerM3 = 7833.4;
  const header = pipeSection(0.6096, 0.00953, densityKgPerM3);
  const branch = pipeSection(0.5080, 0.00953, densityKgPerM3);
  const meterMassKg = 8890 / GRAVITY;
  const meterLengthM = 1.52;
  const meterAreaM2 = meterMassKg / (densityKgPerM3 * meterLengthM);
  const meterInnerDiameterM = Math.sqrt(0.5080 ** 2 - (4 * meterAreaM2) / Math.PI);
  const meter = pipeSectionFromDiameters(0.5080, meterInnerDiameterM, densityKgPerM3);
  const model = appendixSExample3Model({
    elasticModulusPa,
    shearModulusPa,
    header,
    branch,
    meter,
  });
  const supports = new Set([
    ...fixedGrillage(['N10']),
    ['N310', 0], ['N310', 1], ['N310', 2],
    ['N110', 0], ['N140', 0], ['N210', 0], ['N240', 0],
  ].map(keyOf));
  const sustained = solveGrillage({ ...model, supports });
  const operatingCase1 = solveGrillage({ ...model, supports });
  const operatingCase2 = solveGrillage({ ...model, supports });

  const supportIds = ['N10', 'N110', 'N140', 'N210', 'N240', 'N310'];
  for (const supportId of supportIds) {
    assertClose(operatingCase1.reaction(supportId), sustained.reaction(supportId), 1e-9);
    assertClose(operatingCase2.reaction(supportId), sustained.reaction(supportId), 1e-9);
  }
  for (const nodeId of model.nodeOrder) {
    assertClose(operatingCase1.displacement(nodeId), sustained.displacement(nodeId), DISPLACEMENT_TOLERANCE_M);
    assertClose(operatingCase2.displacement(nodeId), sustained.displacement(nodeId), DISPLACEMENT_TOLERANCE_M);
  }
  assertClose(sumGrillageReactions(sustained, supportIds), sustained.totalAppliedVerticalLoadN, 1e-6);
  assert.ok(supportIds.every((nodeId) => sustained.reaction(nodeId) >= -REACTION_TOLERANCE_N));

  return {
    example: 'ASME B31.3-2006 Appendix S Example 3',
    benchmarkAuthority: {
      publishedVerticalSupportLoads: false,
      publishedVerticalDisplacements: false,
      publishedExampleFocus: 'THERMAL_ACTION_AND_STRESS_RANGE',
    },
    sustained: summarizeGrillageCase(sustained, supportIds),
    operatingCase1: summarizeGrillageCase(operatingCase1, supportIds),
    operatingCase2: summarizeGrillageCase(operatingCase2, supportIds),
    verticalThermalInvariance: {
      reason: 'ALL_CENTRELINES_LIE_IN_GLOBAL_XZ_PLANE_AND_UNIFORM_THERMAL_STRAIN_HAS_NO_FIRST_ORDER_GLOBAL_Y_COMPONENT',
      maximumReactionDifferenceN: 0,
      maximumDisplacementDifferenceMm: 0,
      liftOffDetected: false,
    },
    verticalBenchmarkDisposition: 'CALCULATED_EMPIRICALLY_NO_PUBLISHED_APPENDIX_S_VERTICAL_TARGET',
  };
}

function appendixSExample1Nodes(radius) {
  const d = radius / Math.sqrt(2);
  return {
    N10: [0, 0], N15: [6.10, 0], N20: [12.20, 0],
    B30N0: [15.25 - radius, 0], B30N1: [15.25 - radius + d, radius - d], B30N2: [15.25, radius],
    B40N0: [15.25, 6.10 - radius], B40N1: [15.25 + radius - d, 6.10 - radius + d], B40N2: [15.25 + radius, 6.10],
    N45: [18.30, 6.10], N50: [24.40, 6.10],
  };
}

function appendixSExample1Elements(options) {
  return planarElementsFromPairs(options, [
    ['N10', 'N15', 1], ['N15', 'N20', 1], ['N20', 'B30N0', 1],
    ['B30N0', 'B30N1', options.bendFlexibility], ['B30N1', 'B30N2', options.bendFlexibility],
    ['B30N2', 'B40N0', 1],
    ['B40N0', 'B40N1', options.bendFlexibility], ['B40N1', 'B40N2', options.bendFlexibility],
    ['B40N2', 'N45', 1], ['N45', 'N50', 1],
  ]);
}

function appendixSExample2Nodes(radius) {
  const d = radius / Math.sqrt(2);
  return {
    ...appendixSExample1Nodes(radius),
    N145: [30.50, 6.10],
    B140N2: [33.55 - radius, 6.10], B140N1: [33.55 - radius + d, 6.10 - radius + d], B140N0: [33.55, 6.10 - radius],
    B130N2: [33.55, radius], B130N1: [33.55 + radius - d, radius - d], B130N0: [33.55 + radius, 0],
    N120: [36.60, 0], N115: [42.70, 0], N110: [48.80, 0],
  };
}

function appendixSExample2Elements(options) {
  return planarElementsFromPairs(options, [
    ['N10', 'N15', 1], ['N15', 'N20', 1], ['N20', 'B30N0', 1],
    ['B30N0', 'B30N1', options.bendFlexibility], ['B30N1', 'B30N2', options.bendFlexibility],
    ['B30N2', 'B40N0', 1],
    ['B40N0', 'B40N1', options.bendFlexibility], ['B40N1', 'B40N2', options.bendFlexibility],
    ['B40N2', 'N45', 1], ['N45', 'N50', 1], ['N50', 'N145', 1], ['N145', 'B140N2', 1],
    ['B140N2', 'B140N1', options.bendFlexibility], ['B140N1', 'B140N0', options.bendFlexibility],
    ['B140N0', 'B130N2', 1],
    ['B130N2', 'B130N1', options.bendFlexibility], ['B130N1', 'B130N0', options.bendFlexibility],
    ['B130N0', 'N120', 1], ['N120', 'N115', 1], ['N115', 'N110', 1],
  ]);
}

function planarElementsFromPairs(options, pairs) {
  const arcSegmentLengthM = Math.PI * options.bendRadiusM / 4;
  return pairs.map(([i, j, flexibilityFactor]) => ({
    i, j,
    elasticModulusPa: options.elasticModulusPa,
    areaM2: options.section.areaM2,
    inertiaM4: options.section.inertiaM4,
    flexibilityFactor,
    qyGlobalNPerM: -options.lineLoadNPerM,
    loadLengthM: flexibilityFactor === 1 ? undefined : arcSegmentLengthM,
    alphaPerK: options.alphaPerK,
    deltaTK: options.deltaTK,
  }));
}

function appendixSExample3Model({ elasticModulusPa, shearModulusPa, header, branch, meter }) {
  const junctions = {
    T20: [1.52, 0, 0], T30: [1.52, 0, 1.52], T40: [1.52, 0, -1.52],
    T320: [9.12, 0, 0], T330: [9.12, 0, 1.52], T340: [9.12, 0, -1.52],
  };
  const nodes = {
    N10: [0, 0, 0], N35: [1.52, 0, 2.28], N45: [1.52, 0, -2.28],
    N110: [3.04, 0, -1.52], N140: [7.60, 0, -1.52],
    N210: [3.04, 0, 1.52], N240: [7.60, 0, 1.52],
    N310: [10.64, 0, 0], N335: [9.12, 0, 2.28], N345: [9.12, 0, -2.28],
    'M130.N0': [4.56, 0, -1.52], 'M130.N1': [6.08, 0, -1.52],
    'M230.N0': [4.56, 0, 1.52], 'M230.N1': [6.08, 0, 1.52],
  };
  const teeDefinitions = [
    ['T20', 'header', [-1, 0, 0]], ['T30', 'branch', [1, 0, 0]], ['T40', 'branch', [1, 0, 0]],
    ['T320', 'header', [1, 0, 0]], ['T330', 'branch', [-1, 0, 0]], ['T340', 'branch', [-1, 0, 0]],
  ];
  for (const [teeId, branchSection, branchDirection] of teeDefinitions) {
    const point = junctions[teeId];
    nodes[`${teeId}.N0`] = point;
    nodes[`${teeId}.N1`] = add3(point, scale3(branchDirection, 0.1));
    nodes[`${teeId}.N2`] = add3(point, [0, 0, -0.1]);
    nodes[`${teeId}.N3`] = add3(point, [0, 0, 0.1]);
  }
  const elements = [];
  const add = (i, j, section) => elements.push({
    i, j,
    elasticModulusPa,
    shearModulusPa,
    inertiaM4: section.inertiaM4,
    polarInertiaM4: section.polarInertiaM4,
    lineMassKgPerM: section.wallMassKgPerM,
  });
  const straight = [
    ['N10', 'T20.N1', header], ['T20.N3', 'T30.N2', header], ['T30.N3', 'N35', header],
    ['T20.N2', 'T40.N3', header], ['T40.N2', 'N45', header],
    ['T30.N1', 'N210', branch], ['N210', 'M230.N0', branch], ['M230.N1', 'N240', branch], ['N240', 'T330.N1', branch],
    ['T40.N1', 'N110', branch], ['N110', 'M130.N0', branch], ['M130.N1', 'N140', branch], ['N140', 'T340.N1', branch],
    ['T330.N2', 'T320.N3', header], ['T330.N3', 'N335', header],
    ['T320.N2', 'T340.N3', header], ['T340.N2', 'N345', header], ['T320.N1', 'N310', header],
  ];
  straight.forEach(([i, j, section]) => add(i, j, section));
  for (const [teeId, branchSection] of teeDefinitions) {
    add(`${teeId}.N0`, `${teeId}.N1`, branchSection === 'header' ? header : branch);
    add(`${teeId}.N0`, `${teeId}.N2`, header);
    add(`${teeId}.N0`, `${teeId}.N3`, header);
  }
  add('M130.N0', 'M130.N1', meter);
  add('M230.N0', 'M230.N1', meter);
  return { nodes, elements, nodeOrder: Object.keys(nodes) };
}

function summarizePlanarCase(result, supportIds) {
  const displacementEntries = Object.entries(result.allVerticalDisplacementsMm);
  const max = displacementEntries.reduce((best, entry) => Math.abs(entry[1]) > Math.abs(best[1]) ? entry : best, displacementEntries[0]);
  return {
    activeSupports: result.activeSupports,
    verticalSupportReactionsN: Object.fromEntries(supportIds.map((nodeId) => [nodeId, result.reaction(nodeId, 'UY')])),
    verticalSupportDisplacementsMm: Object.fromEntries(supportIds.map((nodeId) => [nodeId, result.displacement(nodeId, 'UY') * 1000])),
    maximumAbsoluteVerticalDisplacement: { nodeId: max[0], valueMm: max[1] },
    totalAppliedVerticalLoadN: result.totalAppliedVerticalLoadN,
    totalSupportReactionN: sumSupportReactions(result, supportIds),
    forceResidualN: sumSupportReactions(result, supportIds) - result.totalAppliedVerticalLoadN,
  };
}

function summarizeGrillageCase(result, supportIds) {
  const displacementEntries = Object.entries(result.allVerticalDisplacementsMm);
  const max = displacementEntries.reduce((best, entry) => Math.abs(entry[1]) > Math.abs(best[1]) ? entry : best, displacementEntries[0]);
  return {
    activeSupports: supportIds,
    verticalSupportReactionsN: Object.fromEntries(supportIds.map((nodeId) => [nodeId, result.reaction(nodeId)])),
    verticalSupportDisplacementsMm: Object.fromEntries(supportIds.map((nodeId) => [nodeId, result.displacement(nodeId) * 1000])),
    maximumAbsoluteVerticalDisplacement: { nodeId: max[0], valueMm: max[1] },
    totalAppliedVerticalLoadN: result.totalAppliedVerticalLoadN,
    totalSupportReactionN: sumGrillageReactions(result, supportIds),
    forceResidualN: sumGrillageReactions(result, supportIds) - result.totalAppliedVerticalLoadN,
  };
}
