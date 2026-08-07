import { semanticHash } from '../shared-piping-model/canonical-json.js';
import {
  REDUCER_SAMPLING_RULES,
  requireReducerCondensationRequest,
  sealReducerCondensationRequest,
} from './contract.js';
import { compileTenCylinderReducerAuthority } from './reducer-condensation.js';

export const REDUCER_SAMPLING_QUALIFICATION_SCHEMA = 'fea-linear-reducer-sampling-qualification/v1';

/** Predict the 12 local boundary actions from one condensed reducer authority. */
export function predictReducerBoundaryActions({ authority, displacement, includeGravity = true, includeThermal = true }) {
  if (!authority?.condensed || !Array.isArray(authority.condensed.localStiffness)) {
    throw new TypeError('authority must be a compiled reducer condensation authority.');
  }
  requireVector12(displacement, 'displacement');
  const result = new Array(12).fill(0);
  for (let row = 0; row < 12; row += 1) {
    let value = 0;
    for (let column = 0; column < 12; column += 1) {
      value += authority.condensed.localStiffness[row * 12 + column] * displacement[column];
    }
    if (includeGravity) value -= authority.condensed.gravityLocalVector[row];
    if (includeThermal) value -= authority.condensed.thermalInitialStrainLocalVector[row];
    result[row] = clean(value);
  }
  return Object.freeze(result);
}

/**
 * Evaluate only named reducer section-sampling hypotheses. There is no fitted
 * fractional sampling parameter: each rule is compiled independently and must
 * satisfy every supplied constitutive observation under the declared absolute
 * plus relative force/moment tolerance.
 */
export function qualifyReducerSamplingRules({
  cases,
  samplingRules = REDUCER_SAMPLING_RULES,
  absoluteTolerance,
  relativeTolerance,
}) {
  if (!Array.isArray(cases) || cases.length === 0) throw new TypeError('cases must contain at least one reducer observation.');
  if (!Array.isArray(samplingRules) || samplingRules.length === 0) throw new TypeError('samplingRules must not be empty.');
  const absTol = nonnegative(absoluteTolerance, 'absoluteTolerance');
  const relTol = nonnegative(relativeTolerance, 'relativeTolerance');
  const acceptedCases = cases.map((entry, index) => {
    const request = requireReducerCondensationRequest(entry.request);
    requireVector12(entry.displacement, `cases[${index}].displacement`);
    requireVector12(entry.referenceAction, `cases[${index}].referenceAction`);
    if (typeof entry.caseId !== 'string' || entry.caseId.length === 0) throw new TypeError(`cases[${index}].caseId must be text.`);
    return {
      caseId: entry.caseId,
      request,
      displacement: [...entry.displacement],
      referenceAction: [...entry.referenceAction],
      includeGravity: entry.includeGravity !== false,
      includeThermal: entry.includeThermal !== false,
    };
  });

  const rules = [...new Set(samplingRules)];
  for (const rule of rules) {
    if (!REDUCER_SAMPLING_RULES.includes(rule)) throw new TypeError(`Unsupported reducer sampling rule ${rule}.`);
  }
  const evaluations = rules.map((samplingRule) => evaluateRule({
    samplingRule,
    cases: acceptedCases,
    absoluteTolerance: absTol,
    relativeTolerance: relTol,
  }));
  const passing = evaluations.filter((row) => row.passed);
  const status = passing.length === 1 ? 'QUALIFIED' : passing.length === 0 ? 'UNQUALIFIED' : 'AMBIGUOUS';
  const draft = {
    schema: REDUCER_SAMPLING_QUALIFICATION_SCHEMA,
    status,
    qualifiedSamplingRule: passing.length === 1 ? passing[0].samplingRule : null,
    caseCount: acceptedCases.length,
    samplingRules: Object.freeze([...rules]),
    tolerance: Object.freeze({ absolute: absTol, relative: relTol }),
    evaluations: Object.freeze(evaluations),
    policy: Object.freeze({
      arbitraryFractionFittingAllowed: false,
      singleRuleRequiredAcrossCases: true,
      failClosedWhenNoUniqueRule: true,
    }),
  };
  return Object.freeze({ ...draft, semanticHash: semanticHash(draft) });
}

function evaluateRule({ samplingRule, cases, absoluteTolerance, relativeTolerance }) {
  const rows = cases.map((entry) => {
    const request = sealReducerCondensationRequest({
      ...entry.request,
      samplingRule,
      semanticHash: '',
    });
    const authority = compileTenCylinderReducerAuthority(request);
    const predicted = predictReducerBoundaryActions({
      authority,
      displacement: entry.displacement,
      includeGravity: entry.includeGravity,
      includeThermal: entry.includeThermal,
    });
    const residuals = predicted.map((value, index) => clean(value - entry.referenceAction[index]));
    const limits = entry.referenceAction.map((value) => absoluteTolerance + relativeTolerance * Math.max(Math.abs(value), 1));
    const passed = residuals.every((value, index) => Math.abs(value) <= limits[index]);
    return Object.freeze({
      caseId: entry.caseId,
      authoritySemanticHash: authority.semanticHash,
      maxAbsoluteResidual: Math.max(...residuals.map(Math.abs)),
      maxNormalizedResidual: Math.max(...residuals.map((value, index) => Math.abs(value) / Math.max(limits[index], Number.MIN_VALUE))),
      passed,
    });
  });
  return Object.freeze({
    samplingRule,
    passed: rows.every((row) => row.passed),
    cases: Object.freeze(rows),
  });
}

function requireVector12(value, field) {
  if (!Array.isArray(value) || value.length !== 12 || value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
    throw new TypeError(`${field} must contain exactly 12 finite numbers.`);
  }
}

function nonnegative(value, field) {
  if (!(typeof value === 'number' && Number.isFinite(value) && value >= 0)) throw new TypeError(`${field} must be nonnegative.`);
  return value;
}

function clean(value) { return Object.is(value, -0) ? 0 : value; }
