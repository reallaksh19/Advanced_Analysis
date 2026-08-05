import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { annularArea } from './flange-hub-loads.js';

export const FLANGE_HUB_REFERENCE_POLICY_ID = 'BB11_FLANGE_HUB_REFERENCE_POLICY_V1';
export const FLANGE_HUB_REFERENCE_CLASSIFICATIONS = Object.freeze([
  'QUALIFYING', 'INTEGRAL_SANITY', 'TREND_ONLY', 'DIAGNOSTIC',
]);

export function closedEndLameReference({
  innerRadius,
  outerRadius,
  internalPressure,
  externalPressure = 0,
  youngsModulus,
  poissonRatio,
  radius,
} = {}) {
  const a = positive(innerRadius, 'innerRadius');
  const b = positive(outerRadius, 'outerRadius');
  const pi = nonnegative(internalPressure, 'internalPressure');
  const po = nonnegative(externalPressure, 'externalPressure');
  const E = positive(youngsModulus, 'youngsModulus');
  const nu = finitePoisson(poissonRatio);
  const r = positive(radius, 'radius');
  if (!(b > a) || r < a || r > b) throw new RangeError('FH_LAME_RADIUS_INVALID');
  const A = (pi * a ** 2 - po * b ** 2) / (b ** 2 - a ** 2);
  const B = a ** 2 * b ** 2 * (pi - po) / (b ** 2 - a ** 2);
  const sigmaR = A - B / r ** 2;
  const sigmaTheta = A + B / r ** 2;
  const sigmaZ = A;
  const radialDisplacement = ((1 - 2 * nu) * A * r + (1 + nu) * B / r) / E;
  return seal({
    referenceId: 'BB11_CLOSED_END_LAME_V1',
    classification: 'QUALIFYING',
    assumptions: 'AXISYMMETRIC_CLOSED_END_GENERALIZED_PLANE_STRAIN',
    radius: r,
    A,
    B,
    sigmaR,
    sigmaZ,
    sigmaTheta,
    tauRZ: 0,
    radialDisplacement,
  });
}

export function prismaticAnnularAxialReference({
  innerRadius,
  outerRadius,
  length,
  axialResultant,
  youngsModulus,
  poissonRatio,
  radius,
} = {}) {
  const area = annularArea(innerRadius, outerRadius);
  const L = positive(length, 'length');
  const F = finite(axialResultant, 'axialResultant');
  const E = positive(youngsModulus, 'youngsModulus');
  const nu = finitePoisson(poissonRatio);
  const r = positive(radius, 'radius');
  if (r < innerRadius || r > outerRadius) throw new RangeError('FH_AXIAL_REFERENCE_RADIUS_INVALID');
  const sigmaZ = F / area;
  const epsilonZ = sigmaZ / E;
  const axialDisplacement = epsilonZ * L;
  const radialDisplacement = -nu * sigmaZ * r / E;
  const strainEnergy = F * axialDisplacement / 2;
  return seal({
    referenceId: 'BB11_PRISMATIC_ANNULAR_AXIAL_V1',
    classification: 'QUALIFYING',
    area,
    axialResultant: F,
    sigmaR: 0,
    sigmaZ,
    sigmaTheta: 0,
    tauRZ: 0,
    epsilonZ,
    axialDisplacement,
    radialDisplacement,
    strainEnergy,
  });
}

export function annularFaceResultantReference({ pressure, innerRadius, outerRadius } = {}) {
  const p = nonnegative(pressure, 'pressure');
  const area = annularArea(innerRadius, outerRadius);
  return seal({
    referenceId: 'BB11_ANNULAR_FACE_RESULTANT_V1',
    classification: 'QUALIFYING',
    pressure: p,
    area,
    axialResultant: -p * area,
  });
}

export function annularPlateSanityReference({
  innerRadius,
  outerRadius,
  thickness,
  pressure,
  youngsModulus,
  poissonRatio,
} = {}) {
  const a = positive(innerRadius, 'innerRadius');
  const b = positive(outerRadius, 'outerRadius');
  const t = positive(thickness, 'thickness');
  const q = nonnegative(pressure, 'pressure');
  const E = positive(youngsModulus, 'youngsModulus');
  const nu = finitePoisson(poissonRatio);
  if (!(b > a)) throw new RangeError('FH_PLATE_RADIUS_ORDER_INVALID');
  const rigidity = E * t ** 3 / (12 * (1 - nu ** 2));
  const loadResultant = -q * Math.PI * (b ** 2 - a ** 2);
  const slenderness = t / (b - a);
  return seal({
    referenceId: 'BB11_ANNULAR_PLATE_SANITY_V1',
    classification: 'TREND_ONLY',
    boundaryModel: 'CLAMPED_INNER_FREE_OUTER_KIRCHHOFF_SANITY_ONLY',
    rigidity,
    slenderness,
    loadResultant,
    trendAssertions: [
      'DEFLECTION_SIGN_FOLLOWS_PRESSURE',
      'DEFLECTION_MAGNITUDE_INCREASES_WITH_PRESSURE',
      'DEFLECTION_MAGNITUDE_DECREASES_WITH_THICKNESS',
    ],
    numericalQualificationAuthority: false,
  });
}

export function compareReferenceQuantity({
  comparisonId,
  classification,
  actual,
  expected,
  relativeTolerance,
  absoluteTolerance = 0,
} = {}) {
  if (!FLANGE_HUB_REFERENCE_CLASSIFICATIONS.includes(classification)) {
    throw new TypeError('FH_REFERENCE_CLASSIFICATION_INVALID');
  }
  const left = finite(actual, 'actual');
  const right = finite(expected, 'expected');
  const rtol = nonnegative(relativeTolerance, 'relativeTolerance');
  const atol = nonnegative(absoluteTolerance, 'absoluteTolerance');
  const absoluteError = Math.abs(left - right);
  const relativeError = absoluteError / Math.max(1e-30, Math.abs(right));
  const accepted = absoluteError <= atol + rtol * Math.abs(right);
  return seal({
    comparisonId: requiredText(comparisonId, 'comparisonId'),
    classification,
    actual: left,
    expected: right,
    absoluteError,
    relativeError,
    absoluteTolerance: atol,
    relativeTolerance: rtol,
    accepted,
    grantsNumericalQualification: accepted && classification === 'QUALIFYING',
  });
}

export function createReferenceRegistry() {
  const payload = {
    referencePolicyId: FLANGE_HUB_REFERENCE_POLICY_ID,
    entries: [
      { referenceId: 'BB11_CLOSED_END_LAME_V1', classification: 'QUALIFYING', displacementTolerance: 0.01, stressTolerance: 0.02 },
      { referenceId: 'BB11_PRISMATIC_ANNULAR_AXIAL_V1', classification: 'QUALIFYING', displacementTolerance: 0.01, stressResultantTolerance: 0.01, energyTolerance: 0.01 },
      { referenceId: 'BB11_ANNULAR_FACE_RESULTANT_V1', classification: 'QUALIFYING', resultantTolerance: 1e-10 },
      { referenceId: 'BB11_ANNULAR_PLATE_SANITY_V1', classification: 'TREND_ONLY', numericalQualificationAuthority: false },
      { referenceId: 'BB11_INDEPENDENT_APPLICATION_ORACLE_V1', classification: 'QUALIFYING', displacementTolerance: 0.02, energyTolerance: 0.02, stressTolerance: 0.05 },
    ],
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function seal(payload) { return deepFreeze({ ...payload, semanticHash: semanticHash(payload) }); }
function positive(value, label) { const number = Number(value); if (!Number.isFinite(number) || !(number > 0)) throw new RangeError(`FH_REFERENCE_INVALID_${label.toUpperCase()}`); return number; }
function nonnegative(value, label) { const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new RangeError(`FH_REFERENCE_INVALID_${label.toUpperCase()}`); return number; }
function finite(value, label) { const number = Number(value); if (!Number.isFinite(number)) throw new RangeError(`FH_REFERENCE_INVALID_${label.toUpperCase()}`); return number; }
function finitePoisson(value) { const number = Number(value); if (!Number.isFinite(number) || number <= -1 || number >= 0.5) throw new RangeError('FH_REFERENCE_INVALID_POISSON_RATIO'); return number; }
function requiredText(value, label) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`FH_REFERENCE_INVALID_${label.toUpperCase()}`); return value; }
