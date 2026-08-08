#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { solveBm4M047PressureElongationCandidate } from './lfea-m047-bm4-pressure-elongation-runtime.mjs';

const FAMILIES = Object.freeze([
  'M047_ACTIVATED_NONRIGID_FRAME',
  'EXCLUDED_BEND_ARC_AXIAL_BUDGET',
  'EXCLUDED_RIGID_FRAME_AXIAL_BUDGET',
]);
const HISTORICAL_BEND_AXIAL_ATTEMPT = '775b98f80fed714a8dfe0f23993d41a2d800b604';
const HISTORICAL_BEND_AXIAL_REJECTION = '074fb3de8f036c9655ecc8b49efd0ac12dad86db';

function axialStrain(authorities, entry) {
  const analysis = entry.sourceEntry.sourceSegment.meta.analysis;
  const dimensions = entry.sourceEntry.physicalSection.dimensions;
  const elasticModulus = authorities.material.materialState.elasticModulus;
  const denominator = elasticModulus * (dimensions.outerDiameter ** 2 - dimensions.innerDiameter ** 2);
  if (!(analysis.pressure > 0) || !(denominator > 0) || !Number.isFinite(analysis.poissonRatio)) return 0;
  return (1 - 2 * analysis.poissonRatio)
    * analysis.pressure * dimensions.innerDiameter ** 2 / denominator;
}
function sourceType(entry) {
  if (entry.sourceEntry.rigidAuthority !== null) return 'RIGID';
  return entry.sourceEntry.sourceSegment.type;
}
function rowForFrame(authorities, entry, frame, family) {
  const strain = axialStrain(authorities, entry);
  return Object.freeze({
    family,
    elementId: frame.elementId,
    sourceId: entry.sourceSegmentId,
    sourceType: sourceType(entry),
    pressurePa: entry.sourceEntry.sourceSegment.meta.analysis.pressure,
    poissonRatio: entry.sourceEntry.sourceSegment.meta.analysis.poissonRatio,
    elasticModulusPa: authorities.material.materialState.elasticModulus,
    lengthM: frame.geometry.length,
    axialStrain: strain,
    scalarFreeExtensionM: strain * frame.geometry.length,
  });
}
function familyRows(candidate) {
  const { authorities } = candidate;
  const rows = [];
  for (const frame of candidate.sustained.frames) {
    const entry = authorities.entryByElementId.get(frame.elementId);
    assert.ok(entry, `M053 missing analysis entry for ${frame.elementId}.`);
    const family = entry.sourceEntry.rigidAuthority !== null
      ? 'EXCLUDED_RIGID_FRAME_AXIAL_BUDGET'
      : 'M047_ACTIVATED_NONRIGID_FRAME';
    rows.push(rowForFrame(authorities, entry, frame, family));
  }
  for (const component of candidate.sustained.pipingComponents) {
    for (const componentElement of component.elements) {
      const entry = authorities.entryByElementId.get(componentElement.elementId);
      assert.ok(entry?.bendComponent, `M053 component element ${componentElement.elementId} must map to a bend arc.`);
      rows.push(rowForFrame(
        authorities,
        entry,
        componentElement.frameElement,
        'EXCLUDED_BEND_ARC_AXIAL_BUDGET',
      ));
    }
  }
  return Object.freeze(rows.filter((row) => row.axialStrain > 0));
}
function aggregate(rows) {
  const sourceIds = new Set(rows.map((row) => row.sourceId));
  const totalLengthM = rows.reduce((sum, row) => sum + row.lengthM, 0);
  const scalarFreeExtensionM = rows.reduce((sum, row) => sum + row.scalarFreeExtensionM, 0);
  return Object.freeze({
    analysisElementCount: rows.length,
    distinctSourceCount: sourceIds.size,
    totalLengthM,
    scalarFreeExtensionM,
    scalarFreeExtensionMm: scalarFreeExtensionM * 1000,
    maximumSingleElementExtensionMm: Math.max(...rows.map((row) => row.scalarFreeExtensionM * 1000), 0),
    pressureRangePa: rows.length
      ? Object.freeze([Math.min(...rows.map((row) => row.pressurePa)), Math.max(...rows.map((row) => row.pressurePa))])
      : null,
    axialStrainRange: rows.length
      ? Object.freeze([Math.min(...rows.map((row) => row.axialStrain)), Math.max(...rows.map((row) => row.axialStrain))])
      : null,
    sourceIds: Object.freeze([...sourceIds].sort()),
  });
}
function sourceAggregate(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.sourceId)) groups.set(row.sourceId, []);
    groups.get(row.sourceId).push(row);
  }
  return Object.freeze([...groups.entries()].map(([sourceId, own]) => Object.freeze({
    sourceId,
    sourceType: own[0].sourceType,
    family: own[0].family,
    analysisElementCount: own.length,
    totalLengthM: own.reduce((sum, row) => sum + row.lengthM, 0),
    scalarFreeExtensionMm: own.reduce((sum, row) => sum + row.scalarFreeExtensionM, 0) * 1000,
    pressurePa: own[0].pressurePa,
    axialStrain: own[0].axialStrain,
  })).sort((a, b) => b.scalarFreeExtensionMm - a.scalarFreeExtensionMm || a.sourceId.localeCompare(b.sourceId)));
}

const candidate = solveBm4M047PressureElongationCandidate();
const rows = familyRows(candidate);
const byFamily = Object.fromEntries(FAMILIES.map((family) => [family, aggregate(rows.filter((row) => row.family === family))]));
const activated = byFamily.M047_ACTIVATED_NONRIGID_FRAME;
const bend = byFamily.EXCLUDED_BEND_ARC_AXIAL_BUDGET;
const rigid = byFamily.EXCLUDED_RIGID_FRAME_AXIAL_BUDGET;
const omittedAxialMm = bend.scalarFreeExtensionMm + rigid.scalarFreeExtensionMm;
const allAxialMm = activated.scalarFreeExtensionMm + omittedAxialMm;

assert.equal(
  activated.analysisElementCount,
  candidate.sustained.activated,
  'M053 activated-frame budget must match M047 counterfactual activation count.',
);
assert.equal(candidate.sustained.activated, candidate.operating.activated, 'M053 M047 activation count must be case-invariant.');
assert.equal(bend.distinctSourceCount, 12, 'M053 expects 12 BM4 bend source components.');
assert.equal(rigid.distinctSourceCount, 20, 'M053 expects 20 BM4 rigid source components.');
assert.ok(allAxialMm > 0, 'M053 pressure axial budget must be nonzero.');

const report = Object.freeze({
  schema: 'lfea-m053-bm4-pressure-family-budget/v1',
  formula: '(1-2nu)*P*Di^2/(E*(Do^2-Di^2))',
  familyBoundary: Object.freeze({
    M047_ACTIVATED_NONRIGID_FRAME: 'Actually injected by M047 into non-rigid frame elements, including any non-arc frame descendant of a bend source.',
    EXCLUDED_BEND_ARC_AXIAL_BUDGET: 'Counterfactual scalar axial free-extension budget along resolved bend-arc frame elements only. NOT a formed-bend opening/rotation model.',
    EXCLUDED_RIGID_FRAME_AXIAL_BUDGET: 'Counterfactual scalar axial free-extension budget on rigid-source frames only. NOT authority that CAESAR rigid elements pressure-elongate.',
  }),
  historicalBoundary: Object.freeze({
    distributedBendArcAxialAttemptCommit: HISTORICAL_BEND_AXIAL_ATTEMPT,
    distributedBendArcAxialRejectedCommit: HISTORICAL_BEND_AXIAL_REJECTION,
    distributedBendArcAxialModelQualified: false,
    formedBendRotationalPressureEffectTestedByThoseCommits: false,
  }),
  byFamily: Object.freeze(byFamily),
  ratios: Object.freeze({
    omittedAxialBudgetMm: omittedAxialMm,
    omittedToActivatedAxialBudget: omittedAxialMm / activated.scalarFreeExtensionMm,
    bendArcToActivatedAxialBudget: bend.scalarFreeExtensionMm / activated.scalarFreeExtensionMm,
    rigidToActivatedAxialBudget: rigid.scalarFreeExtensionMm / activated.scalarFreeExtensionMm,
    omittedFractionOfAllCounterfactualAxialBudget: omittedAxialMm / allAxialMm,
  }),
  topSourcesByScalarAxialBudget: sourceAggregate(rows).slice(0, 25),
  rows,
  interpretationBoundary: Object.freeze({
    scalarFreeExtensionIsNotStructuralResponse: true,
    scalarBudgetCannotSelectBourdonOption: true,
    bendArcAxialBudgetCannotSubstituteForRotationalOpeningMechanics: true,
    rigidAxialBudgetCannotAuthorizeRigidPressureStrain: true,
  }),
  disposition: Object.freeze({ mechanicsChangedByM053: false, outputFitUsed: false, productionActivationAuthorized: false }),
});

const arg = process.argv.indexOf('--report');
if (arg >= 0) {
  const requested = process.argv[arg + 1]; if (!requested) throw new Error('--report requires a path.');
  const path = resolve(requested); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
}
for (const family of FAMILIES) {
  const value = report.byFamily[family];
  console.log(`M053 ${family}: ${value.analysisElementCount} analysis elements / ${value.distinctSourceCount} sources; length=${value.totalLengthM.toFixed(6)} m; scalar axial free extension=${value.scalarFreeExtensionMm.toFixed(6)} mm.`);
}
console.log(`M053 omitted/activated axial free-extension budget ratio: ${report.ratios.omittedToActivatedAxialBudget.toFixed(6)}.`);
console.log(`M053 bend/activated=${report.ratios.bendArcToActivatedAxialBudget.toFixed(6)}; rigid/activated=${report.ratios.rigidToActivatedAxialBudget.toFixed(6)}.`);
console.log(`M053 historical distributed bend-arc axial experiment remains rejected; formed-bend rotational pressure effect remains untested.`);
