import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NEAR_ZERO_REFERENCE_MARKER,
  buildDistributedWeight,
  compareBenchmarkQuantity,
  resolveSectionStates,
} from '../src/core/empirical-piping-mechanics/index.js';

const nearZero = compareBenchmarkQuantity({
  calculated: 1.174,
  reference: 0.400,
  referenceFloor: 1.0,
  benchmarkScale: 20,
  absoluteTolerance: 1.5,
  relativeTolerancePercent: 8,
});
assert.equal(nearZero.relativeErrorPercent, NEAR_ZERO_REFERENCE_MARKER);
assert.equal(nearZero.nearZero, true);
assert.equal(nearZero.passes, true);

const ordinary = compareBenchmarkQuantity({
  calculated: 82.869,
  reference: 82.845,
  referenceFloor: 5,
  benchmarkScale: 82.845,
  absoluteTolerance: 0.25,
  relativeTolerancePercent: 1,
});
assert.ok(ordinary.relativeErrorPercent < 1);
assert.equal(ordinary.passes, true);

const common = {
  outsideDiameterM: 0.4064,
  nominalWallM: 0.009525,
  stiffnessWallM: 0.009525,
  weightWallM: 0.009525,
  corrosionAllowanceM: 0.0016002,
  codeStressWallRule: 'NOMINAL_MINUS_CORROSION',
  authority: { nominalWall: 'TEST', stiffnessWall: 'TEST', weightWall: 'TEST', codeStressWall: 'TEST' },
};
const base = resolveSectionStates(common);
const mutatedCodeWall = resolveSectionStates({ ...common, corrosionAllowanceM: 0.002 });
const weightInput = {
  densityKgM3: 7833.4,
  contentsMassPerLengthKgM: 117.841,
  insulationMassPerLengthKgM: 37.456,
  otherDistributedMassPerLengthKgM: 0,
  gravityGlobalMps2: { x: 0, y: -9.80665 },
};
const baseWeight = buildDistributedWeight({ ...weightInput, sectionStates: base });
const mutatedWeight = buildDistributedWeight({ ...weightInput, sectionStates: mutatedCodeWall });
assert.equal(
  baseWeight.totalMassPerLengthKgM,
  mutatedWeight.totalMassPerLengthKgM,
  'code-stress wall mutation must not change physical weight',
);
assert.notEqual(
  base.codeStress.areaM2,
  mutatedCodeWall.codeStress.areaM2,
  'corrosion mutation must change code-stress area',
);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productionRoot = path.join(repoRoot, 'src/core/empirical-piping-mechanics');
const forbiddenBenchmarkLiterals = [
  '129975000',
  '-12842',
  '22050',
  '82.845e3',
  '129.975e6',
];
for (const file of walk(productionRoot)) {
  if (!file.endsWith('.js')) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const literal of forbiddenBenchmarkLiterals) {
    assert.ok(!source.includes(literal), `Benchmark literal ${literal} leaked into ${path.relative(repoRoot, file)}`);
  }
}

console.log('✅ Empirical piping near-zero, wall-basis and benchmark-isolation anti-drift checks passed.');

function* walk(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) yield* walk(absolute);
    else yield absolute;
  }
}
