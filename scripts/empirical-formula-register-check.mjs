import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import {
  EMPIRICAL_FORMULA_METHOD,
  EMPIRICAL_FORMULA_REGISTER,
  createEmpiricalFormulaRegister,
  requireEmpiricalFormulaRegister,
} from '../src/workspace/engineering-loads/empirical-formula-register.js';
import { calculateSupportLoadDistribution } from '../src/workspace/engineering-loads/support-load-distribution-v3.js';
import {
  createEmptyProjectDataProfile,
  createEvidenceValue,
} from '../src/workspace/project-data/project-data-contract.js';

const catalog = JSON.parse(await readFile(
  new URL('../benchmarks/empirical/empirical-gravity-benchmarks.json', import.meta.url),
  'utf8',
));

assert.equal(catalog.schema, 'empirical-gravity-benchmark-catalog/v1');
assert.equal(catalog.method, EMPIRICAL_FORMULA_METHOD);
assert.equal(EMPIRICAL_FORMULA_REGISTER.schema, 'empirical-formula-register/v1');
assert.equal(EMPIRICAL_FORMULA_REGISTER.method, catalog.method);
assert.equal(Object.isFrozen(EMPIRICAL_FORMULA_REGISTER), true);
assert.deepEqual(createEmpiricalFormulaRegister(), EMPIRICAL_FORMULA_REGISTER);
assert.equal(createEmpiricalFormulaRegister().semanticHash, EMPIRICAL_FORMULA_REGISTER.semanticHash);

const benchmarkIds = new Set(catalog.cases.map((row) => row.benchmarkId));
assert.equal(benchmarkIds.size, catalog.cases.length, 'benchmark IDs must be unique');
const termIds = new Set(EMPIRICAL_FORMULA_REGISTER.terms.map((row) => row.termId));
for (const term of EMPIRICAL_FORMULA_REGISTER.terms) {
  assert.ok(term.benchmarks.every((benchmarkId) => benchmarkIds.has(benchmarkId)), `${term.termId} references an unknown benchmark`);
}
for (const benchmark of catalog.cases) {
  assert.ok(benchmark.scope.length > 0);
  assert.ok(benchmark.scope.every((termId) => termIds.has(termId)), `${benchmark.benchmarkId} references an unknown formula term`);
}

const tampered = structuredClone(EMPIRICAL_FORMULA_REGISTER);
tampered.terms[0].equation = 'tampered';
assert.throws(
  () => requireEmpiricalFormulaRegister(tampered),
  (error) => error.code === 'EMPIRICAL_FORMULA_REGISTER_HASH_MISMATCH',
);

function checkIndependentClosedFormOracles(value) {
  const symmetric = benchmark(value, 'EMP-GRAVITY-SYMMETRIC-001');
  const input = symmetric.inputs;
  const expected = symmetric.expected;
  const insideDiameterMm = input.outsideDiameterMm - (2 * input.wallThicknessMm);
  const metalMassKg = annulusArea(input.outsideDiameterMm, insideDiameterMm)
    * input.lengthM * input.materialDensityKgPerM3;
  const insulationMassKg = annulusArea(
    input.outsideDiameterMm + (2 * input.insulationThicknessMm),
    input.outsideDiameterMm,
  ) * input.lengthM * input.insulationDensityKgPerM3;
  const operatingFluidMassKg = circleArea(insideDiameterMm)
    * input.lengthM * input.operatingFluidDensityKgPerM3;
  const hydroFluidMassKg = circleArea(insideDiameterMm)
    * input.lengthM * input.hydroFluidDensityKgPerM3;

  close(insideDiameterMm, expected.insideDiameterMm);
  close(metalMassKg, expected.metalMassKg);
  close(insulationMassKg, expected.insulationMassKg);
  close(operatingFluidMassKg, expected.operatingFluidMassKg);
  close(hydroFluidMassKg, expected.hydroFluidMassKg);

  const fluidByCase = { EMPTY: 0, OPE: operatingFluidMassKg, HYD: hydroFluidMassKg };
  for (const [caseId, caseExpected] of Object.entries(expected.cases)) {
    const pipeMassKg = metalMassKg + insulationMassKg + fluidByCase[caseId];
    const forceN = (pipeMassKg + input.componentMassKg)
      * input.gravityMPerS2 * input.loadFactor;
    close(pipeMassKg, caseExpected.pipeMassKg);
    close(forceN, caseExpected.totalAppliedForceN);
    const reactions = pointDistribution(
      forceN,
      input.componentChainageMm,
      input.supportChainagesMm[0],
      input.supportChainagesMm[1],
    );
    close(reactions[0], caseExpected.supportReactionsN[0]);
    close(reactions[1], caseExpected.supportReactionsN[1]);
    close(sum(reactions) - forceN, caseExpected.forceResidualN);
    close(
      reactions[0] * input.supportChainagesMm[0]
        + reactions[1] * input.supportChainagesMm[1]
        - forceN * input.componentChainageMm,
      caseExpected.momentResidualNmm,
    );
  }

  const point = benchmark(value, 'EMP-POINT-UNEQUAL-001');
  const pointReactions = pointDistribution(
    point.inputs.forceN,
    point.inputs.pointChainageMm,
    ...point.inputs.supportChainagesMm,
  );
  assert.deepEqual(pointReactions, point.expected.supportReactionsN);
  close(sum(pointReactions) - point.inputs.forceN, point.expected.forceResidualN);
  close(
    pointReactions[0] * point.inputs.supportChainagesMm[0]
      + pointReactions[1] * point.inputs.supportChainagesMm[1],
    point.expected.reactionMomentNmm,
  );

  const exact = benchmark(value, 'EMP-POINT-AT-SUPPORT-001');
  const exactReactions = exact.inputs.supportChainagesMm.map((chainage) => (
    chainage === exact.inputs.pointChainageMm ? exact.inputs.forceN : 0
  ));
  assert.deepEqual(exactReactions, exact.expected.supportReactionsN);

  const uniform = benchmark(value, 'EMP-UNIFORM-MULTISPAN-001');
  const uniformReactions = uniformDistribution(
    uniform.inputs.totalForceN,
    uniform.inputs.startChainageMm,
    uniform.inputs.endChainageMm,
    uniform.inputs.supportChainagesMm,
  );
  assert.deepEqual(uniformReactions, uniform.expected.supportReactionsN);
  close(sum(uniformReactions) - uniform.inputs.totalForceN, uniform.expected.forceResidualN);
  close(
    uniformReactions.reduce((total, reaction, index) => (
      total + reaction * uniform.inputs.supportChainagesMm[index]
    ), 0),
    uniform.expected.reactionMomentNmm,
  );
}

function checkProductionFixture(value) {
  const symmetric = benchmark(value, 'EMP-GRAVITY-SYMMETRIC-001');
  const before = {
    dataset: semanticHash(DATASET),
    profile: semanticHash(PROFILE),
    supports: semanticHash(SUPPORT_SITE_MODEL),
    routes: semanticHash(ROUTE_PARTITION_MODEL),
  };
  const distribution = calculateSupportLoadDistribution({
    dataset: DATASET,
    profile: PROFILE,
    supportSiteModel: SUPPORT_SITE_MODEL,
    routePartitionModel: ROUTE_PARTITION_MODEL,
    masterData: MASTER_DATA,
  });
  const repeated = calculateSupportLoadDistribution({
    dataset: DATASET,
    profile: PROFILE,
    supportSiteModel: SUPPORT_SITE_MODEL,
    routePartitionModel: ROUTE_PARTITION_MODEL,
    masterData: MASTER_DATA,
  });
  assert.deepEqual(repeated, distribution);
  assert.equal(distribution.status, 'CALCULATED');
  assert.equal(distribution.method, EMPIRICAL_FORMULA_METHOD);
  assert.deepEqual(distribution.loadCases.map((row) => row.loadCaseId), ['EMPTY', 'OPE', 'HYD']);

  for (const loadCase of distribution.loadCases) {
    const expected = symmetric.expected.cases[loadCase.loadCaseId];
    assert.equal(loadCase.status, 'CALCULATED');
    assert.equal(loadCase.excludedInputs.length, 0);
    assert.equal(loadCase.blockers.length, 0);
    assert.equal(loadCase.equilibrium.passed, true);
    assert.equal(loadCase.contributionLedger.length, 2);
    loadCase.supportResults.forEach((result, index) => {
      close(result.verticalForceN, expected.supportReactionsN[index]);
    });
    close(loadCase.equilibrium.forceResidualN, expected.forceResidualN);
    close(loadCase.equilibrium.momentResidualNmm, expected.momentResidualNmm);
  }

  assert.deepEqual({
    dataset: semanticHash(DATASET),
    profile: semanticHash(PROFILE),
    supports: semanticHash(SUPPORT_SITE_MODEL),
    routes: semanticHash(ROUTE_PARTITION_MODEL),
  }, before, 'production fixture inputs mutated');
  return distribution;
}

function benchmark(value, id) {
  const row = value.cases.find((candidate) => candidate.benchmarkId === id);
  assert.ok(row, `missing benchmark ${id}`);
  return row;
}

function annulusArea(outerDiameterMm, innerDiameterMm) {
  return Math.PI * ((outerDiameterMm ** 2) - (innerDiameterMm ** 2)) / 4e6;
}

function circleArea(diameterMm) {
  return Math.PI * diameterMm ** 2 / 4e6;
}

function pointDistribution(forceN, pointMm, lowerMm, upperMm) {
  const span = upperMm - lowerMm;
  return [
    forceN * (upperMm - pointMm) / span,
    forceN * (pointMm - lowerMm) / span,
  ];
}

function uniformDistribution(forceN, startMm, endMm, supportChainagesMm) {
  const reactions = supportChainagesMm.map(() => 0);
  const cuts = [
    startMm,
    ...supportChainagesMm.filter((value) => value > startMm && value < endMm),
    endMm,
  ];
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const lower = cuts[index];
    const upper = cuts[index + 1];
    const pieceForce = forceN * (upper - lower) / (endMm - startMm);
    const point = (lower + upper) / 2;
    const exact = supportChainagesMm.indexOf(point);
    if (exact >= 0) {
      reactions[exact] += pieceForce;
      continue;
    }
    const lowerIndex = supportChainagesMm.findLastIndex((value) => value < point);
    const upperIndex = supportChainagesMm.findIndex((value) => value > point);
    assert.ok(lowerIndex >= 0 && upperIndex >= 0, 'uniform segment is not bracketed');
    const allocation = pointDistribution(
      pieceForce,
      point,
      supportChainagesMm[lowerIndex],
      supportChainagesMm[upperIndex],
    );
    reactions[lowerIndex] += allocation[0];
    reactions[upperIndex] += allocation[1];
  }
  return reactions;
}

function close(actual, expected, tolerance = 1e-12) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, observed ${actual}`,
  );
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

const HASHES = Object.freeze({
  dataset: '1'.repeat(64),
  lineList: '2'.repeat(64),
  pipingClass: '3'.repeat(64),
  componentWeight: '4'.repeat(64),
});

const DATASET = Object.freeze({
  datasetId: 'EMP-PROD-02-DATASET',
  version: 1,
  sourceSha256: HASHES.dataset,
  entities: Object.freeze([
    Object.freeze({
      entityId: 'pipe-1',
      entityType: 'PIPE',
      lineKey: 'L-1',
      sourceEntityId: 'source-pipe-1',
      jsonPointer: '/entities/0',
      componentReference: 'PIPE-1',
      properties: Object.freeze({}),
    }),
    Object.freeze({
      entityId: 'component-1',
      entityType: 'VALVE',
      lineKey: 'L-1',
      sourceEntityId: 'source-component-1',
      jsonPointer: '/entities/1',
      componentReference: 'VALVE-1',
      properties: Object.freeze({ attributes: Object.freeze({ CATALOG_KEY: 'CV-1' }) }),
    }),
  ]),
});

const SUPPORT_SITE_MODEL = Object.freeze({
  schema: 'support-site-model/v1',
  sites: Object.freeze([
    supportSite('S-0', 0),
    supportSite('S-1', 1000),
  ]),
});

const ROUTE_PARTITION_MODEL = Object.freeze({
  schema: 'route-partition-model/v1',
  routes: Object.freeze([Object.freeze({
    routeId: 'R-1',
    status: 'READY',
    blockers: Object.freeze([]),
    physicalEdgeIds: Object.freeze(['pipe-1', 'component-1']),
    entityChainages: Object.freeze([
      Object.freeze({ entityId: 'pipe-1', startMm: 0, endMm: 1000, pointMm: 500, sourceStartChainageMm: 0, sourceEndChainageMm: 1000 }),
      Object.freeze({ entityId: 'component-1', startMm: 500, endMm: 500, pointMm: 500, sourceStartChainageMm: 500, sourceEndChainageMm: 500 }),
    ]),
  })]),
  edges: Object.freeze([
    Object.freeze({ entityId: 'pipe-1', entityType: 'PIPE', lengthMm: 1000, pointComponent: false, topologyCarrier: false, startMm: Object.freeze({ x: 0, y: 0, z: 0 }), endMm: Object.freeze({ x: 1000, y: 0, z: 0 }) }),
    Object.freeze({ entityId: 'component-1', entityType: 'VALVE', lengthMm: 0, pointComponent: true, topologyCarrier: false, startMm: Object.freeze({ x: 500, y: 0, z: 0 }), endMm: Object.freeze({ x: 500, y: 0, z: 0 }) }),
  ]),
});

const MASTER_DATA = Object.freeze({
  lineList: Object.freeze({ sourceHash: HASHES.lineList }),
  pipingClass: Object.freeze({ sourceHash: HASHES.pipingClass }),
  weight: Object.freeze({ sourceHash: HASHES.componentWeight }),
});

const PROFILE = makeProfile();

function makeProfile() {
  const empty = createEmptyProjectDataProfile();
  const approved = (value, source) => createEvidenceValue(value, { source }, true);
  const source = (value, sourceKey, sourceHash) => createEvidenceValue(
    value,
    { source: 'EMP_PROD_02_BENCHMARK', sourceKey, sourceHash },
    true,
  );
  return Object.freeze({
    ...empty,
    projectId: 'EMP-PROD-02-PROJECT',
    revision: 1,
    updatedAt: '2026-08-04T19:30:00.000Z',
    sourcesAndUnits: Object.freeze({
      ...empty.sourcesAndUnits,
      lineListSource: source({ sha256: HASHES.lineList }, 'lineList', HASHES.lineList),
      pipingClassSource: source({ sha256: HASHES.pipingClass }, 'pipingClass', HASHES.pipingClass),
      componentWeightSource: source({ sha256: HASHES.componentWeight }, 'componentWeight', HASHES.componentWeight),
    }),
    topology: Object.freeze({
      ...empty.topology,
      portMatchToleranceMm: approved(1, 'EMP_PROD_02_TOPOLOGY'),
      supportSiteGroupingToleranceMm: approved(1, 'EMP_PROD_02_TOPOLOGY'),
      autoCarrierCoincidenceToleranceMm: approved(1, 'EMP_PROD_02_TOPOLOGY'),
      routeJoiningRules: approved({ mode: 'EXACT' }, 'EMP_PROD_02_TOPOLOGY'),
      supportTypeCapabilities: approved({ REST: { vertical: true } }, 'EMP_PROD_02_TOPOLOGY'),
    }),
    loadCalculation: Object.freeze({
      ...empty.loadCalculation,
      gravityMPerS2: approved(9.81, 'EMP_PROD_02_LOAD_POLICY'),
      loadFactor: approved(1, 'EMP_PROD_02_LOAD_POLICY'),
      materialDensitiesKgPerM3: approved({ 'MAT-1': 7850 }, 'EMP_PROD_02_MATERIAL'),
      pipeSectionProperties: approved({
        'L-1': {
          outsideDiameterMm: 100,
          wallThicknessMm: 5,
          materialCode: 'MAT-1',
          insulationCode: 'INS-1',
          insulationThicknessMm: 10,
        },
      }, 'EMP_PROD_02_SECTION'),
      operatingFluidDensitiesKgPerM3: approved({ 'L-1': 800 }, 'EMP_PROD_02_FLUID'),
      hydroFluidDensitiesKgPerM3: approved({ 'L-1': 1000 }, 'EMP_PROD_02_FLUID'),
      insulationDensitiesKgPerM3: approved({ 'INS-1': 120 }, 'EMP_PROD_02_INSULATION'),
      componentWeightsKg: approved({ 'CV-1': 10 }, 'EMP_PROD_02_COMPONENT'),
      equilibriumTolerances: approved({ forceN: 1e-8, momentNmm: 1e-5 }, 'EMP_PROD_02_EQUILIBRIUM'),
      activeLoadCases: approved(['EMPTY', 'OPE', 'HYD'], 'EMP_PROD_02_CASES'),
    }),
  });
}

function supportSite(siteId, x) {
  return Object.freeze({
    siteId,
    tags: Object.freeze([siteId]),
    positionMm: Object.freeze({ x, y: 0, z: 0 }),
    assemblyIds: Object.freeze([`assembly-${siteId}`]),
    memberEntityIds: Object.freeze([`support-${siteId}`]),
    assemblies: Object.freeze([Object.freeze({
      members: Object.freeze([Object.freeze({ sourceType: 'REST' })]),
    })]),
  });
}

checkIndependentClosedFormOracles(catalog);
const production = checkProductionFixture(catalog);

console.log(JSON.stringify({
  status: 'PASS',
  schema: EMPIRICAL_FORMULA_REGISTER.schema,
  method: EMPIRICAL_FORMULA_REGISTER.method,
  formulaRegisterSemanticHash: EMPIRICAL_FORMULA_REGISTER.semanticHash,
  benchmarkCatalogueSemanticHash: semanticHash(catalog),
  formulaTermCount: EMPIRICAL_FORMULA_REGISTER.terms.length,
  benchmarkCount: catalog.cases.length,
  productionDistributionSemanticHash: semanticHash(production),
  productionCases: production.loadCases.map((row) => ({
    loadCaseId: row.loadCaseId,
    status: row.status,
    reactionsN: row.supportResults.map((result) => result.verticalForceN),
    forceResidualN: row.equilibrium.forceResidualN,
    momentResidualNmm: row.equilibrium.momentResidualNmm,
  })),
  numericalMethodChanged: false,
}, null, 2));
