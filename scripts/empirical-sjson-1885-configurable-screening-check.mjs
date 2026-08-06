// Guards the corrected kg/cm3-to-kg/m3 source conversion and vertical reactions.
import { readFile } from 'node:fs/promises';

const [resultPath] = process.argv.slice(2);
if (!resultPath) throw new Error('Usage: node empirical-sjson-1885-configurable-screening-check.mjs <result.json>');
const result = JSON.parse(await readFile(resultPath, 'utf8'));

assertEqual(result.schema, 'empirical-sjson-screening-result/v1', 'result schema');
assertEqual(result.status, 'EXPERIMENTAL_CONFIGURABLE_SCREENING', 'result status');
assertEqual(result.qualification.anchorSynthesized, false, 'anchor synthesis');
assertEqual(result.qualification.pressureIncluded, false, 'pressure inclusion');
assertEqual(result.source.commit, '07ce017eb7113517cc032771f7717f88c0a93d4c', 'source commit');
assertEqual(result.source.hashes.enrichedSjsonSha256, 'e9a51723444e9490f5dff9c1ff4a5c56191873033d11a289946746ff1072c5da', 'enriched source hash');
assertEqual(result.source.hashes.topologyInputXmlSha256, 'b46fbc765c71a63eb5d156eeaed3ae3be56584bd753b563d76fb10df21ff652a', 'topology source hash');

const source = result.sourceResolution;
assertEqual(source.inputXmlElements, 163, 'element count');
assertEqual(source.inputXmlNodes, 164, 'node count');
assertEqual(source.physicalSupportSites, 36, 'physical support count');
assertEqual(source.operatingTemperature.min, 325, 'minimum resolved temperature');
assertEqual(source.operatingTemperature.max, 325, 'maximum resolved temperature');
assertEqual(source.temperatureResolution.SOURCE_EXPLICIT, 58, 'explicit temperature count');
assertEqual(source.temperatureResolution.SENTINEL_PREVIOUS_CONNECTED_NODE, 105, 'inherited temperature count');
assertEqual(source.fluidDensityResolution.SOURCE_EXPLICIT, 58, 'explicit fluid-density count');
assertEqual(source.fluidDensityResolution.SENTINEL_PREVIOUS_CONNECTED_NODE, 105, 'inherited fluid-density count');
assertEqual(source.inputXmlFluidDensityUnit, 'kg/cm3', 'input XML fluid-density unit');
assertEqual(source.inputXmlFluidDensityToKgM3, 1000000, 'input XML density conversion');
assertClose(source.resolvedFluidDensityKgM3.min, 300, 1e-12, 'minimum resolved fluid density');
assertClose(source.resolvedFluidDensityKgM3.max, 300, 1e-12, 'maximum resolved fluid density');
assertEqual(source.processResolutionAudit.temperature.fallbackUsed, false, 'temperature fallback');
assertEqual(source.processResolutionAudit.fluidDensity.fallbackUsed, false, 'fluid-density fallback');
assertEqual(source.sourceComponentWeightPositiveCount, 0, 'positive source component weights');

assertEqual(result.configurableAssumptions.processResolution.inputXmlDensityUnit, 'kg/cm3', 'profile density unit');
assertEqual(result.configurableAssumptions.processResolution.inputXmlDensityToKgM3, 1000000, 'profile density conversion');
assertEqual(result.verticalWeight.status, 'CALCULATED_CONFIGURABLE_SCREENING', 'vertical calculation status');
assertClose(result.verticalWeight.totalModelMassKg, 5388.84094, 1e-6, 'total model mass');
assertClose(result.verticalWeight.totalWeightKn, 52.846477, 1e-6, 'total model weight');
assertClose(result.verticalWeight.reactionSumKn, result.verticalWeight.totalWeightKn, 1e-9, 'vertical equilibrium');
assertClose(result.verticalWeight.equilibriumErrorKn, 0, 1e-9, 'vertical equilibrium error');
assertEqual(result.verticalWeight.elementCountByTreatment.GASKET_ZERO, 22, 'zero-weight gasket count');
assertEqual(result.verticalWeight.elementCountByTreatment.FLAN_PIPE_EQUIVALENT_FALLBACK, 20, 'flange fallback count');
assertEqual(result.verticalWeight.elementCountByTreatment.VALV_PIPE_EQUIVALENT_FALLBACK, 4, 'valve fallback count');
assertEqual(result.verticalWeight.elementCountByTreatment.INST_PIPE_EQUIVALENT_FALLBACK, 3, 'instrument fallback count');

for (const [axis, expectedSites, expectedMax] of [['thermalX', 6, 31.567638], ['thermalY', 7, 34.904555]]) {
  const row = result[axis];
  assertEqual(row.status, 'CALCULATED_CONFIGURABLE_SCREENING', `${axis} status`);
  assertEqual(row.constrainedSiteCount, expectedSites, `${axis} constrained sites`);
  assertClose(row.maxAbsReactionKn, expectedMax, 2e-5, `${axis} maximum reaction`);
  assertClose(row.temperatureSummary.min, 325, 1e-12, `${axis} minimum temperature`);
  assertClose(row.temperatureSummary.max, 325, 1e-12, `${axis} maximum temperature`);
  if (Math.abs(row.reactionSumKn) > 1e-3) throw new Error(`${axis} reaction equilibrium exceeds 0.001 kN: ${row.reactionSumKn}`);
  if (row.maxFreeResidualN > 0.2) throw new Error(`${axis} free residual exceeds 0.2 N: ${row.maxFreeResidualN}`);
}

assertEqual(result.supportRows.length, 36, 'support row count');
assertEqual(new Set(result.supportRows.map((row) => row.siteId)).size, 36, 'unique support row count');
const rows = new Map(result.supportRows.map((row) => [row.siteId, row]));
assertReaction(rows, 'N10230', 31.568, -0.770, 0.693);
assertReaction(rows, 'N20120', -22.000, 0, 1.328);
assertReaction(rows, 'N50120', -0.991, -34.905, 1.859);
assertReaction(rows, 'N70040', -1.858, 23.712, 4.704);
assertReaction(rows, 'N60080', 0, 8.968, 3.193);
if (rows.get('N50120').reactionsKn.FzWeight < 1.85) throw new Error('N50120 vertical reaction regressed toward the superseded steel-only value.');
assertEqual(result.componentVectorScreening.maximumSiteId, 'N50120', 'maximum component-vector site');
assertClose(result.componentVectorScreening.maximumMagnitudeKn, 34.968, 0.001, 'maximum component-vector magnitude');

console.log('SJSON 1885 configurable empirical screening qualification passed.');

function assertReaction(rows, siteId, fx, fy, fz) {
  const row = rows.get(siteId);
  if (!row) throw new Error(`Missing support row ${siteId}.`);
  assertClose(row.reactionsKn.FxThermal, fx, 0.001, `${siteId} Fx`);
  assertClose(row.reactionsKn.FyThermal, fy, 0.001, `${siteId} Fy`);
  assertClose(row.reactionsKn.FzWeight, fz, 0.001, `${siteId} Fz`);
}
function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
}
function assertClose(actual, expected, tolerance, label) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label}: expected ${expected} ± ${tolerance}, received ${actual}.`);
  }
}
