// Guards common POS section authority, kg/cm3-to-kg/m3 conversion, and governed reactions.
import { readFile } from 'node:fs/promises';

const [resultPath] = process.argv.slice(2);
if (!resultPath) throw new Error('Usage: node empirical-sjson-1885-configurable-screening-check.mjs <result.json>');
const result = JSON.parse((await readFile(resultPath, 'utf8')).replace(/^\uFEFF/u, ''));

assertEqual(result.schema, 'empirical-sjson-screening-result/v1', 'result schema');
assertEqual(result.status, 'EXPERIMENTAL_CONFIGURABLE_SCREENING', 'result status');
assertEqual(result.qualification.anchorSynthesized, false, 'anchor synthesis');
assertEqual(result.qualification.pressureIncluded, false, 'pressure inclusion');
assertEqual(result.source.commit, '07ce017eb7113517cc032771f7717f88c0a93d4c', 'source commit');
assertEqual(result.source.hashes.enrichedSjsonSha256, 'e9a51723444e9490f5dff9c1ff4a5c56191873033d11a289946746ff1072c5da', 'enriched source hash');
assertEqual(result.source.hashes.topologyInputXmlSha256, '71e610dd5426606a751b2e494441856b0be28e0d72cf056d1f744ffa85b32dc3', 'governed topology hash');

const authority = result.sectionAuthority;
assertEqual(authority.method, 'COMMON_POS_SECTION_MATERIAL_V1', 'section authority method');
assertEqual(authority.projectionSchema, 'empirical-sjson-governed-section-projection/v1', 'projection schema');
assertEqual(authority.sourceTopologySha256, 'b46fbc765c71a63eb5d156eeaed3ae3be56584bd753b563d76fb10df21ff652a', 'original topology hash');
assertEqual(authority.projectedTopologySha256, result.source.hashes.topologyInputXmlSha256, 'projected topology lineage');
assertEqual(authority.rowCount, 163, 'governed section row count');
assertEqual(authority.uniquePositionRefCount, 163, 'unique governed POS count');
assertEqual(authority.scheduleCounts['80'], 137, 'Sch 80 row count');
assertEqual(authority.scheduleCounts['100'], 26, 'Sch 100 row count');
assertEqual(authority.configuredDimensionApplicationCount, 57, 'scoped configured section count');
assertEqual(authority.scheduleDefaultApplicationCount, 0, 'schedule default count');
assertEqual(authority.changedOutsideDiameterCount, 153, 'governed OD change count');
assertEqual(authority.changedWallThicknessCount, 163, 'governed wall change count');
assertTruthy(authority.projectionSemanticIdentity, 'projection semantic identity');
assertTruthy(authority.posCalculationSemanticIdentity, 'POS calculation semantic identity');
assertTruthy(authority.posReceiptSha256, 'POS receipt hash');

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

assertEqual(result.configurableAssumptions.source.topologyInputXmlPath, 'GENERATED:COMMON_POS_SECTION_MATERIAL_V1', 'configured topology authority');
assertEqual(result.configurableAssumptions.sectionResolution.scheduleDefaultPolicy, 'PROHIBITED', 'profile schedule-default policy');
assertEqual(result.configurableAssumptions.processResolution.inputXmlDensityUnit, 'kg/cm3', 'profile density unit');
assertEqual(result.configurableAssumptions.processResolution.inputXmlDensityToKgM3, 1000000, 'profile density conversion');
assertEqual(result.verticalWeight.status, 'CALCULATED_CONFIGURABLE_SCREENING', 'vertical calculation status');
assertClose(result.verticalWeight.totalModelMassKg, 6696.6257, 1e-6, 'total model mass');
assertClose(result.verticalWeight.totalWeightKn, 65.671464, 1e-6, 'total model weight');
assertClose(result.verticalWeight.reactionSumKn, result.verticalWeight.totalWeightKn, 1e-9, 'vertical equilibrium');
assertClose(result.verticalWeight.equilibriumErrorKn, 0, 1e-9, 'vertical equilibrium error');
assertEqual(result.verticalWeight.elementCountByTreatment.GASKET_ZERO, 22, 'zero-weight gasket count');
assertEqual(result.verticalWeight.elementCountByTreatment.FLAN_PIPE_EQUIVALENT_FALLBACK, 20, 'flange fallback count');
assertEqual(result.verticalWeight.elementCountByTreatment.VALV_PIPE_EQUIVALENT_FALLBACK, 4, 'valve fallback count');
assertEqual(result.verticalWeight.elementCountByTreatment.INST_PIPE_EQUIVALENT_FALLBACK, 3, 'instrument fallback count');
if (result.verticalWeight.totalModelMassKg <= 5388.84094) {
  throw new Error('Governed section mass regressed to the superseded original-XML-wall result.');
}

for (const [axis, expectedSites, expectedMax] of [['thermalX', 6, 45.095715], ['thermalY', 7, 49.675742]]) {
  const row = result[axis];
  assertEqual(row.status, 'CALCULATED_CONFIGURABLE_SCREENING', `${axis} status`);
  assertEqual(row.constrainedSiteCount, expectedSites, `${axis} constrained sites`);
  assertClose(row.maxAbsReactionKn, expectedMax, 2e-5, `${axis} maximum reaction`);
  assertClose(row.temperatureSummary.min, 325, 1e-12, `${axis} minimum temperature`);
  assertClose(row.temperatureSummary.max, 325, 1e-12, `${axis} maximum temperature`);
  if (Math.abs(row.reactionSumKn) > 1e-3) throw new Error(`${axis} reaction equilibrium exceeds 0.001 kN: ${row.reactionSumKn}`);
  const relativeResidual = row.maxFreeResidualN / Math.max(1, row.maxAbsReactionKn * 1000);
  if (row.maxFreeResidualN > 0.5 || relativeResidual > 1e-5) {
    throw new Error(`${axis} free residual is excessive: ${row.maxFreeResidualN} N (${relativeResidual} relative).`);
  }
}

assertEqual(result.supportRows.length, 36, 'support row count');
assertEqual(new Set(result.supportRows.map((row) => row.siteId)).size, 36, 'unique support row count');
const rows = new Map(result.supportRows.map((row) => [row.siteId, row]));
assertReaction(rows, 'N10230', 45.096, -1.235, 0.963);
assertReaction(rows, 'N20120', -31.331, 0, 1.843);
assertReaction(rows, 'N50120', -1.431, -49.676, 2.615);
assertReaction(rows, 'N70040', -2.628, 32.822, 5.307);
assertReaction(rows, 'N60080', 0, 12.637, 3.559);
if (rows.get('N50120').reactionsKn.FzWeight < 2.6) {
  throw new Error('N50120 vertical reaction regressed toward an ungoverned section result.');
}
assertEqual(result.componentVectorScreening.maximumSiteId, 'N50120', 'maximum component-vector site');
assertClose(result.componentVectorScreening.maximumMagnitudeKn, 49.765, 0.001, 'maximum component-vector magnitude');

console.log('SJSON 1885 governed configurable empirical screening qualification passed.');

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
function assertTruthy(actual, label) {
  if (!actual) throw new Error(`${label} is required.`);
}
