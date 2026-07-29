#!/usr/bin/env node

/**
 * Shared pipe wall geometry check.
 *
 * Covers `src/core/pipe-wall-geometry/`: the circular hollow section properties
 * the beam kernel needs (LFEA B-2) and the shell attenuation length the local
 * model is governed by (LAFEA section 1). Both read the same mean radius, so
 * both live here.
 */

import assert from 'node:assert/strict';
import {
  SharedAnalysisContractError,
} from '../src/core/shared-analysis-contract/index.js';
import {
  attachmentToRunRatioCheck,
  attenuationLength,
  decayZoneElementSize,
  diameterToThicknessCheck,
  pipeSectionProperties,
  requiredModelExtent,
} from '../src/core/pipe-wall-geometry/index.js';

/** Algebraic identities are exact. */
const EXACT = 1e-12;
/**
 * Published section tables are rounded to six significant figures, so a
 * comparison against them cannot be tighter than the rounding.
 */
const PUBLISHED_TABLE = 1e-6;

console.log('\n--- Shared pipe wall geometry check ---');
checkPublishedSection();
checkSectionIdentities();
checkDegenerateSections();
checkAttenuationLength();
checkDerivedLimitsComeFromTheProfile();
checkApplicabilityRatios();
console.log('\n✅ Shared pipe wall geometry check passed.\n');

function checkPublishedSection() {
  // NPS 8 Sch 40: OD 8.625 in, wall 0.322 in -> I = 72.4892 in^4, Z = 16.8091 in^3.
  const section = pipeSectionProperties(8.625, 0.322);
  assertClose(section.inertia, 72.4892, PUBLISHED_TABLE, 'NPS 8 Sch 40 inertia');
  assertClose(section.sectionModulus, 16.8091, PUBLISHED_TABLE, 'NPS 8 Sch 40 section modulus');
  assertClose(section.insideDiameter, 7.981, PUBLISHED_TABLE, 'NPS 8 Sch 40 inside diameter');
  assertClose(section.meanRadius, (8.625 - 0.322) / 2, EXACT, 'NPS 8 Sch 40 mean radius');
  console.log('✅ NPS 8 Sch 40 matches the published section table.');
}

function checkSectionIdentities() {
  const outside = 273.05;
  const thickness = 9.27;
  const section = pipeSectionProperties(outside, thickness);
  // Exact identities, not engineering agreement.
  assertClose(section.polarInertia, 2 * section.inertia, EXACT, 'polar inertia');
  assertClose(section.sectionModulus, section.inertia / (outside / 2), EXACT, 'section modulus');
  assertClose(section.insideDiameter, outside - 2 * thickness, EXACT, 'inside diameter');
  assertClose(section.meanRadius, (outside - thickness) / 2, EXACT, 'mean radius');
  assert.equal(Object.isFrozen(section), true);
  assert.ok(section.formulaIds.length >= 5);
  console.log('✅ Section identities hold exactly and the record carries its formula IDs.');
}

function checkDegenerateSections() {
  assertRejects(() => pipeSectionProperties(0, 1), 'NON_POSITIVE_VALUE', 'zero outside diameter');
  assertRejects(() => pipeSectionProperties(100, 0), 'NON_POSITIVE_VALUE', 'zero wall thickness');
  assertRejects(() => pipeSectionProperties(100, 50), 'DEGENERATE_SECTION', 'wall equal to half the diameter');
  assertRejects(() => pipeSectionProperties(100, 60), 'DEGENERATE_SECTION', 'wall above half the diameter');
  assertRejects(() => pipeSectionProperties('100', 5), 'NON_FINITE_VALUE', 'string diameter');
  console.log('✅ Degenerate sections are rejected, not clamped.');
}

function checkAttenuationLength() {
  // lambda = sqrt(R t). NPS 12 Sch 40: OD 323.85 mm, wall 10.31 mm.
  const section = pipeSectionProperties(323.85, 10.31);
  const lambda = attenuationLength(section.meanRadius, 10.31);
  assertClose(lambda.value, Math.sqrt(section.meanRadius * 10.31), EXACT, 'attenuation length');
  // Hand check: R = 156.77 mm, t = 10.31 mm -> sqrt(1616.3) = 40.20 mm.
  // (The LAFEA plan's section 7 narrative quotes 21 mm for this size, which is
  // not what sqrt(R t) gives. The formula in section 1 is authoritative here;
  // the narrative figure is inconsistent with it and is not used.)
  assertClose(lambda.value, 40.2032, 1e-5, 'NPS 12 Sch 40 attenuation length');
  // Halving the thickness refines the length scale by sqrt(2), which is what
  // makes element counts predictable under refinement.
  const halved = attenuationLength(section.meanRadius, 10.31 / 2);
  assertClose(lambda.value / halved.value, Math.SQRT2, 1e-9, 'attenuation length scaling');
  assertRejects(() => attenuationLength(0, 10), 'NON_POSITIVE_VALUE', 'zero mean radius');
  console.log('✅ The attenuation length is sqrt(R t) and scales as sqrt(thickness).');
}

function checkDerivedLimitsComeFromTheProfile() {
  const lambda = attenuationLength(150, 10);
  // The multipliers 2.5 and 0.5 are engineering practice, not code text: they
  // are supplied by the profile and rejected when absent.
  const profile = {
    modelExtentAttenuationMultiple: { value: 2.5, source: 'LAFEA-PROFILE-1' },
    decayZoneElementFraction: { value: 0.5, source: 'LAFEA-PROFILE-1' },
  };
  const extent = requiredModelExtent(lambda, profile);
  const size = decayZoneElementSize(lambda, profile);
  assertClose(extent.value, 2.5 * lambda.value, EXACT, 'required model extent');
  assertClose(size.value, 0.5 * lambda.value, EXACT, 'decay zone element size');
  assert.equal(extent.multipleSource, 'LAFEA-PROFILE-1');
  assert.equal(size.fractionSource, 'LAFEA-PROFILE-1');

  assertRejects(
    () => requiredModelExtent(lambda, {}),
    'MODEL_EXTENT_ATTENUATION_MULTIPLE_NOT_DECLARED',
    'absent extent multiple',
  );
  assertRejects(
    () => decayZoneElementSize(lambda, { decayZoneElementFraction: { value: 0.5 } }),
    'MISSING_FIELD',
    'element fraction without a source',
  );
  // An element fraction above 1 would put the element size beyond the whole
  // decay length, which is not a refinement choice but an error.
  assertRejects(
    () => decayZoneElementSize(lambda, { decayZoneElementFraction: { value: 1.5, source: 'X' } }),
    'DECLARED_VALUE_ABOVE_MAXIMUM',
    'element fraction above one',
  );
  console.log('✅ Extent and element size read their multipliers from the profile, with sources.');
}

function checkApplicabilityRatios() {
  const profile = {
    thinShellDiameterToThicknessMinimum: { value: 20, source: 'LAFEA-PROFILE-1' },
    attachmentToRunDiameterMaximum: { value: 0.8, source: 'LAFEA-PROFILE-1' },
  };
  // NPS 12 Sch 40: D/t about 31, within range.
  const thin = diameterToThicknessCheck(323.85, 10.31, profile);
  assert.equal(thin.accepted, true);
  assert.equal(thin.limit, 20);
  assert.equal(thin.limitSource, 'LAFEA-PROFILE-1');
  // A heavy wall falls out of thin-shell range and must say so.
  const thick = diameterToThicknessCheck(323.85, 40, profile);
  assert.equal(thick.accepted, false);
  assert.equal(thick.checkId, 'THIN_SHELL_DIAMETER_TO_THICKNESS');

  // 6 in trunnion on 12 in run: d/D about 0.53, within range.
  const ratio = attachmentToRunRatioCheck(168.28, 323.85, profile);
  assert.equal(ratio.accepted, true);
  assertClose(ratio.actual, 168.28 / 323.85, EXACT, 'attachment to run ratio');
  // An attachment larger than its run pipe is not a local attachment problem.
  assert.equal(attachmentToRunRatioCheck(355.6, 323.85, profile).accepted, false);
  console.log('✅ Applicability ratios report value, limit and limit source, and reject out of range.');
}

function assertClose(actual, expected, tolerance, label) {
  const scale = Math.max(Math.abs(expected), Math.abs(actual), Number.MIN_VALUE);
  const relative = Math.abs(actual - expected) / scale;
  assert.ok(
    relative <= tolerance,
    `${label}: ${actual} differs from ${expected} by ${relative} relative, above ${tolerance}`,
  );
}

function assertRejects(action, code, label) {
  assert.throws(action, (error) => {
    assert.ok(
      error instanceof SharedAnalysisContractError,
      `${label}: expected a SharedAnalysisContractError, got ${error.name}`,
    );
    assert.equal(error.code, code, `${label}: expected code ${code}, got ${error.code}`);
    return true;
  }, `${label} was not rejected`);
}
