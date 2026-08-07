#!/usr/bin/env node

/** Static T0 and Phase 2A-2F authority guard. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('src/core/linear-piping-analysis-consumer');
const files = fs.readdirSync(ROOT)
  .filter((name) => name.endsWith('.js'))
  .map((name) => path.join(ROOT, name));
const source = Object.fromEntries(
  files.map((file) => [path.basename(file), fs.readFileSync(file, 'utf8')]),
);
const combined = Object.values(source).join('\n');

// This file already exceeded the package's <300-line rule on the PR base.
// Keep the debt explicit and frozen: it may not grow under unrelated work.
// Any edit that changes its physical line count must split it below 300 instead
// of silently increasing or relaxing this baseline exception.
const LEGACY_LINE_COUNT_BASELINE = Object.freeze({
  'inputxml-feature-inventory.js': 434,
});

const forbidden = [
  ['WORKSPACE_IMPORT', /from\s+['"][^'"]*workspace/u],
  ['UNCONTROLLED_RAW_IMPORT', /DOMParser|FileReader|parsePcf|readFileSync\([^)]*source/u],
  ['EMPIRICAL_REACTION', /tributary|percentageOfWeight|reactionFactor|0\.6\s*\*/u],
  ['INTERFACE_MECHANICS_PREMATURE', /momentAtReference|offsetMoment|nozzleUtilization/u],
  ['SOLVER_REIMPLEMENTATION', /assembleGlobal|factorizeFree|solveScaled|stiffnessMatrix/u],
  ['MATERIAL_SECTION_AXIS_REIMPLEMENTATION', /interpolateMaterial|calculateSection|constructLocalAxes/u],
  ['RANDOM_IDENTITY', /Math\.random|randomUUID/u],
  ['LOCALE_ORDERING', /localeCompare/u],
  ['HIDDEN_DEFAULT_PARAMETER', /function\s+\w+\s*\([^)]*=/u],
];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/u).length;
  const name = path.basename(file);
  const legacyBaseline = LEGACY_LINE_COUNT_BASELINE[name];
  if (legacyBaseline === undefined) {
    assert.ok(lines < 300, `${file} has ${lines} physical lines; limit is <300`);
  } else {
    assert.equal(
      lines,
      legacyBaseline,
      `${file} is grandfathered only at its pre-existing ${legacyBaseline}-line baseline; split it below 300 before changing its size`,
    );
  }
  forbidden.forEach(([code, pattern]) => {
    assert.doesNotMatch(text, pattern, `${code}: ${file}`);
  });
}

assert.match(source['consumer.js'], /compileSolverExecution/u);
assert.match(source['consumer.js'], /compileResultRecovery/u);
assert.match(source['consumer.js'], /interfaceLoadResults:\s*null/u);
assert.match(source['consumer.js'], /nozzleAssessments:\s*null/u);
assert.match(source['consumer.js'], /codeResults:\s*null/u);

assert.match(source['source-orchestration.js'], /compileMechanicalModel/u);
assert.match(source['source-orchestration.js'], /compilePhysicalLoadCase/u);
assert.match(source['source-orchestration.js'], /compileLinearPipingSourceAnalysisContext/u);
assert.match(source['source-orchestration.js'], /runLinearPipingAnalysis/u);
assert.doesNotMatch(source['source-orchestration.js'], /compileSolverExecution|compileResultRecovery/u);

assert.match(source['source-analysis-context.js'], /linear-piping-source-analysis-context\/v1/u);
assert.match(source['source-analysis-context.js'], /requireMechanicalModelCompilation/u);
assert.match(source['source-analysis-context.js'], /requirePhysicalLoadCase/u);
assert.doesNotMatch(
  source['source-analysis-context.js'],
  /compileMechanicalModel|compilePhysicalLoadCase|compileSolverExecution|compileResultRecovery/u,
);

assert.match(source['inputxml-source-contract.js'], /linear-piping-inputxml-analysis-request\/v1/u);
assert.match(source['inputxml-source-contract.js'], /linear-piping-inputxml-analysis-request\/v2/u);
assert.match(source['inputxml-source-contract.js'], /INPUTXML_INGESTION_V2_KEYS/u);
assert.doesNotMatch(source['inputxml-source-contract.js'], /inputXmlToCanonicalGeometry|conditionGeometry/u);

const unitContract = source['inputxml-unit-contract.js'];
assert.match(unitContract, /INPUTXML-LENGTH-TO-METRE-EXACT-R1/u);
assert.match(unitContract, /m:\s*Object\.freeze\(\{ numerator: 1, denominator: 1 \}\)/u);
assert.match(unitContract, /mm:\s*Object\.freeze\(\{ numerator: 1, denominator: 1000 \}\)/u);
assert.match(unitContract, /cm:\s*Object\.freeze\(\{ numerator: 1, denominator: 100 \}\)/u);
assert.match(unitContract, /in:\s*Object\.freeze\(\{ numerator: 127, denominator: 5000 \}\)/u);
assert.match(unitContract, /ft:\s*Object\.freeze\(\{ numerator: 381, denominator: 1250 \}\)/u);
assert.match(unitContract, /PIPING_INPUTXML_UNIT_PROFILE_HASH_MISMATCH/u);
assert.match(unitContract, /PIPING_INPUTXML_UNIT_RESULT_HASH_MISMATCH/u);
assert.doesNotMatch(unitContract, /0\.001|0\.0254|0\.3048/u);

const normalizer = source['inputxml-unit-normalization.js'];
for (const token of [
  'nodes', 'segments', 'length', 'diameter', 'thickness',
  'bendDeclaredRadius', 'bendComputedRadius', 'bendArcCentre',
]) assert.match(normalizer, new RegExp(token, 'u'));
assert.match(normalizer, /PIPING_INPUTXML_UNIT_FIELD_UNCLASSIFIED/u);
assert.match(normalizer, /INPUTXML_LENGTH_UNIT_NORMALIZED/u);
assert.doesNotMatch(normalizer, /inputXmlToCanonicalGeometry|conditionGeometry/u);

const requestValidation = source['inputxml-request-validation.js'];
assert.match(requestValidation, /LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_V2_SCHEMA/u);
assert.match(requestValidation, /requireLinearPipingInputXmlUnitProfile/u);
assert.match(requestValidation, /PIPING_INPUTXML_UNIT_NOT_CANONICAL/u);
assert.match(requestValidation, /PIPING_INPUTXML_UNIT_NOT_AUTHORIZED/u);

const inputXmlGateway = source['inputxml-source-binding.js'];
assert.match(inputXmlGateway, /inputXmlToCanonicalGeometry/u);
assert.match(inputXmlGateway, /normalizeLinearPipingInputXmlGeometry/u);
assert.match(inputXmlGateway, /conditionGeometry/u);
assert.match(inputXmlGateway, /compileLinearPipingSourceAnalysisContext/u);
assert.match(inputXmlGateway, /inputXmlUnitEvidenceProjection/u);
assert.doesNotMatch(
  inputXmlGateway,
  /resolveLinearFeaMaterialState|resolvePipeSection|resolveFrameLocalAxes|compileSolverExecution|compileResultRecovery|recoverLinearPipingInterfaceLoads|compileNozzleAllowableAssessment|compileLinearPipingB31Application/u,
);

const adapterImports = files
  .filter((file) => /inputXmlToCanonicalGeometry/u.test(fs.readFileSync(file, 'utf8')))
  .map((file) => path.basename(file));
assert.deepEqual(adapterImports, ['inputxml-source-binding.js']);

const index = source['index.js'];
for (const token of [
  'runLinearPipingAnalysisFromSourceAuthorities',
  'compileLinearPipingSourceAnalysisContext',
  'compileLinearPipingInputXmlAnalysisContext',
  'LINEAR_PIPING_INPUTXML_ANALYSIS_REQUEST_V2_SCHEMA',
  'sealLinearPipingInputXmlUnitProfile',
  'normalizeLinearPipingInputXmlGeometry',
]) assert.match(index, new RegExp(token, 'u'));

assert.doesNotMatch(combined, /unit\s*\?\?\s*['"]m['"]|unit\s*\|\|\s*['"]m['"]/u);

const gravityExpansion = source['gravity-expansion.js'];
const massSourceExpansion = source['gravity-expansion-mass-sources.js'];
const gravityExpansionPrimitives = source['gravity-expansion-primitives.js'];
const elementAugmentation = source['gravity-expansion-element-augmentation.js'];
assert.match(gravityExpansion, /GRAVITY_MASS_SOURCES/u, 'M012 must reuse the B-3.0 mass-source registry');
assert.match(gravityExpansion, /indexDistributedWeightPrimitives/u);
assert.match(gravityExpansion, /expandDeclaredDistributedWeightSource/u);
assert.match(massSourceExpansion, /kind\s*===\s*'DISTRIBUTED_WEIGHT'/u);
assert.match(massSourceExpansion, /massPerUnitLength\s*\*\s*acceleration/u);
assert.match(
  gravityExpansionPrimitives,
  /densityEvidence/u,
  'M012 derivation record must retain the declared DISTRIBUTED_WEIGHT primitive\'s densityEvidence',
);
assert.match(
  gravityExpansionPrimitives,
  /geometryEvidence/u,
  'M012 derivation record must retain the declared DISTRIBUTED_WEIGHT primitive\'s geometryEvidence',
);
assert.match(elementAugmentation, /for\s*\(const primitive of generatedPrimitives\)/u);
assert.match(
  elementAugmentation,
  /generatedLocal\.map\(\(value, index\)\s*=>\s*value\s*\+\s*local\[index\]\)/u,
  'M012 must reuse augmentFrameElement multi-primitive summation',
);
assert.doesNotMatch(
  `${gravityExpansion}\n${massSourceExpansion}`,
  /common-enriched-properties/u,
  'M012 must not depend on non-LFEA fluid or insulation registries',
);
assert.doesNotMatch(
  massSourceExpansion,
  /Math\.PI|outerDiameter|wallThickness|innerDiameter|insulationThickness|fluidDensity|insulationDensity/u,
  'M012 must consume declared massPerUnitLength without re-deriving density or geometry',
);

const thermalExpansion = source['thermal-expansion-augmentation.js'];
const thermalElementAugmentation = source['thermal-expansion-element-augmentation.js'];
assert.match(thermalExpansion, /primitive\.kind\s*===\s*'TEMPERATURE'/u);
assert.match(thermalExpansion, /componentElementIds\.has\(primitive\.elementId\)/u);
assert.match(thermalExpansion, /computePipingComponentSemanticHash/u);
assert.match(thermalElementAugmentation, /thermalInitialStrainVector/u);
assert.match(thermalElementAugmentation, /condenseEndConditions/u);
assert.match(thermalElementAugmentation, /transformLoadToGlobal/u);
assert.match(thermalElementAugmentation, /frameOffsetMatrix/u);
assert.match(thermalElementAugmentation, /initialStrainLoadVector/u);
assert.match(thermalElementAugmentation, /computeFrameElementSemanticHash/u);
assert.match(thermalElementAugmentation, /operatingTemperature\s*-\s*temperature\.installationTemperature/u);
assert.match(
  thermalElementAugmentation,
  /thermalExpansionCoefficient\s*\*\s*temperatureDifference/u,
  'M014 must use the retained material coefficient and sealed temperature difference',
);
assert.doesNotMatch(
  thermalElementAugmentation,
  /elasticModulus\s*\*\s*[^;\n]*area|area\s*\*\s*[^;\n]*elasticModulus|Math\.PI|outerDiameter|wallThickness/u,
  'M014 must reuse thermalInitialStrainVector instead of reimplementing B-3.1 thermal mechanics',
);
assert.doesNotMatch(
  `${thermalExpansion}\n${thermalElementAugmentation}`,
  /component-elements\.js|bend-component\.js|common-enriched-properties|linear-fea-b31-code-engine/u,
  'M014 must remain a component-agnostic consumer and not reach into forbidden packages',
);
assert.match(index, /augmentPipingComponentTemperatureAuthorities/u);

const packageValue = JSON.parse(fs.readFileSync('package.json', 'utf8'));
assert.equal(
  packageValue.scripts['check:linear-piping-analysis-consumer'],
  'node scripts/linear-piping-analysis-consumer-check.mjs && node scripts/linear-piping-analysis-consumer-anti-drift-check.mjs',
);
assert.match(packageValue.scripts['check:lfea-linear-core'], /check:linear-piping-analysis-consumer/u);
assert.match(packageValue.scripts.gate, /check:linear-piping-analysis-consumer/u);
assert.equal(
  packageValue.scripts['check:lfea-b3.10'],
  'node scripts/lfea-b3.10-distributed-weight-expansion-check.mjs',
);
assert.equal(
  packageValue.scripts['check:lfea-b3.11'],
  'node scripts/lfea-b3.11-thermal-component-augmentation-check.mjs',
);
const linearCore = packageValue.scripts['check:lfea-linear-core'];
const b39 = linearCore.indexOf('check:lfea-b3.9');
const b310 = linearCore.indexOf('check:lfea-b3.10');
const b311 = linearCore.indexOf('check:lfea-b3.11');
const b40 = linearCore.indexOf('check:lfea-b4.0');
assert.ok(
  b39 >= 0 && b310 > b39 && b311 > b310 && b40 > b311,
  'check:lfea-b3.11 must run after B3.10 and before B4.0',
);

await import('./linear-piping-source-orchestration-check.mjs');
await import('./linear-piping-inputxml-source-binding-check.mjs');
await import('./linear-piping-source-analysis-context-check.mjs');
await import('./linear-piping-inputxml-analysis-context-check.mjs');
await import('./linear-piping-inputxml-unit-normalization-check.mjs');
await import('./linear-piping-multicase-application-check.mjs');
await import('./linear-piping-multicase-application-anti-drift-check.mjs');

console.log('Linear piping analysis consumer T0 and Phase 2A-2F anti-drift check PASS');
