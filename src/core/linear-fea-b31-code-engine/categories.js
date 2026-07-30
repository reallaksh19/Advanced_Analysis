import { resolveAllowableAtTemperature } from './allowable-resolution.js';
import {
  APPROXIMATION_STATUSES,
  DISPLACEMENT_STRESS_RANGE,
  OCCASIONAL,
  OPERATING,
  EXPANSION_RANGE_ENVELOPE,
  USER_PROJECT_CHECK,
  SUSTAINED,
  fail,
  requireMember,
} from './code-engine-contract.js';

/**
 * Section 10.2 required code stress categories. This module builds the
 * per-category allowable stress and limitation (section 11) disclosures.
 * SUSTAINED, OCCASIONAL and DISPLACEMENT_STRESS_RANGE are evaluated;
 * OPERATING, EXPANSION_RANGE_ENVELOPE and USER_PROJECT_CHECK are refused
 * explicitly rather than shallow-implemented — a clean refusal is better
 * than a category that quietly behaves like a compliance check it is not.
 */

function limitation(code, register, status, disclosure, details = {}) {
  requireMember(status, APPROXIMATION_STATUSES, `${code}.status`, 'CODE_ENGINE_LIMITATION_INVALID');
  return { code, register, status, disclosure, details };
}

/**
 * Refuse categories the spec explicitly forbids treating as a compliance
 * check (section 10.2 OPERATING, USER_PROJECT_CHECK) and the one this phase
 * has not implemented (EXPANSION_RANGE_ENVELOPE), before any of the
 * SUSTAINED/OCCASIONAL/DISPLACEMENT_STRESS_RANGE machinery runs.
 */
export function requireImplementedCategory(category) {
  if (category === OPERATING) {
    fail(
      'category OPERATING is the combined operating state and is explicitly not automatically a code-acceptance category (section 10.2); it cannot be evaluated as a compliance check here.',
      'CODE_ENGINE_OPERATING_NOT_A_COMPLIANCE_CATEGORY',
    );
  }
  if (category === USER_PROJECT_CHECK) {
    fail(
      'category USER_PROJECT_CHECK is project-specific and explicitly kept separate from B31.3 compliance status (section 10.2); it cannot be evaluated as a compliance check here.',
      'CODE_ENGINE_USER_PROJECT_CHECK_NOT_A_COMPLIANCE_CATEGORY',
    );
  }
  if (category === EXPANSION_RANGE_ENVELOPE) {
    fail(
      'category EXPANSION_RANGE_ENVELOPE (the difference between declared operating state pairs) is not implemented this phase; it is refused rather than shallow-implemented against an un-declared case-pair identity.',
      'CODE_ENGINE_EXPANSION_RANGE_ENVELOPE_NOT_IMPLEMENTED',
    );
  }
  if (category !== SUSTAINED && category !== OCCASIONAL && category !== DISPLACEMENT_STRESS_RANGE) {
    fail(`category ${category} is not a recognised B31.3 code-result category.`, 'CODE_ENGINE_CATEGORY_UNSUPPORTED');
  }
}

/**
 * Section 10.3/10.5: SUSTAINED and OCCASIONAL both compare against the
 * hot allowable scaled by the declared weld/joint factor; OCCASIONAL further
 * scales by the profile-declared, category-traceable duration/occurrence
 * factor (never a global multiplier).
 */
export function sustainedOrOccasionalAllowable({
  category, profile, dataset, hotTemperature, occasionalCategoryId,
}) {
  const hotAllowable = resolveAllowableAtTemperature(dataset.allowablePoints, hotTemperature, profile.temperatureInterpolationPolicy);
  const limitations = [];
  if (hotAllowable.method !== 'EXACT_MATCH') {
    limitations.push(limitation(
      'CODE_ENGINE_APPROXIMATION_ALLOWABLE_TEMPERATURE_INTERPOLATION',
      'section-11',
      'ACCEPTED',
      'Hot allowable stress resolved by declared linear-bracket interpolation between two edition-dataset points rather than an exact temperature match.',
      { lowerTemperature: hotAllowable.lowerTemperature, upperTemperature: hotAllowable.upperTemperature, evaluationTemperature: hotTemperature },
    ));
  }
  let allowableStress = hotAllowable.value * dataset.weldJointFactor.value;
  if (category === OCCASIONAL) {
    const entry = profile.occasionalDurationFactors.find((candidate) => candidate.occasionalCategoryId === occasionalCategoryId);
    if (entry === undefined) {
      fail(
        `profile.occasionalDurationFactors declares no entry for occasionalCategoryId ${occasionalCategoryId}; the duration/occurrence factor must be a declared, traceable per-category value, never a bare literal (section 10.5).`,
        'CODE_ENGINE_OCCASIONAL_FACTOR_NOT_DECLARED',
      );
    }
    allowableStress *= entry.durationFactor.value;
  }
  return { allowableStress, limitations, hotAllowable };
}

/**
 * Section 10.5: displacement stress-range allowable is the edition profile's
 * generic combination of the declared cold/hot allowables and cycle-reduction
 * data (`DISPLACEMENT_RANGE_COLD_HOT_CYCLE_REDUCTION_LINEAR_V1` — a weighted
 * sum then a reduction factor, never a specific ASME numeric table), with an
 * optional, visible, evidence-carrying liberal-allowable uplift (default OFF).
 */
export function displacementRangeAllowable({ profile, dataset, hotTemperature, coldTemperature }) {
  const hotAllowable = resolveAllowableAtTemperature(dataset.allowablePoints, hotTemperature, profile.temperatureInterpolationPolicy);
  const coldAllowable = resolveAllowableAtTemperature(dataset.allowablePoints, coldTemperature, profile.temperatureInterpolationPolicy);
  const limitations = [];
  for (const [label, resolved] of [['hot', hotAllowable], ['cold', coldAllowable]]) {
    if (resolved.method !== 'EXACT_MATCH') {
      limitations.push(limitation(
        'CODE_ENGINE_APPROXIMATION_ALLOWABLE_TEMPERATURE_INTERPOLATION',
        'section-11',
        'ACCEPTED',
        `${label} allowable stress resolved by declared linear-bracket interpolation between two edition-dataset points rather than an exact temperature match.`,
        { lowerTemperature: resolved.lowerTemperature, upperTemperature: resolved.upperTemperature },
      ));
    }
  }
  const { coldWeight, hotWeight, cycleReductionFactor } = dataset.displacementRangeCoefficients;
  let allowableStress = (coldWeight.value * coldAllowable.value + hotWeight.value * hotAllowable.value) * cycleReductionFactor.value;
  if (profile.liberalAllowableUse) {
    allowableStress *= 1 + profile.liberalAllowableUpliftFactor.value;
    limitations.push(limitation(
      'CODE_ENGINE_APPROXIMATION_LIBERAL_ALLOWABLE_USE',
      'section-11',
      'CONDITIONAL',
      'Displacement stress-range allowable increased by the declared liberal-allowable uplift factor; section 10.5 requires this visible switch (default OFF) to carry complete calculation evidence and user verification.',
      { upliftFactor: profile.liberalAllowableUpliftFactor.value, upliftSource: profile.liberalAllowableUpliftFactor.source },
    ));
  }
  return { allowableStress, limitations, hotAllowable, coldAllowable };
}

export { limitation };
