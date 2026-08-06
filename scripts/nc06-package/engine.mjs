import { REGISTERED_INPUT, UNCERTAINTY } from './config.mjs';

const MPA_TO_KSI = 0.14503773773020923;
const M_TO_IN = 39.37007874015748;
const keys = Object.freeze([
  'diameter','thickness','length','elasticModulus','poissonRatio','pressure',
  'loadedDent','residualDent','maxPeeq','plasticPointFraction','inputMode',
]);
const rel = (a,b) => Math.abs(a-b) / Math.max(Math.abs(a),Math.abs(b),1e-30);

export function canonicalizeInput(profile, input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('INPUT_INVALID');
  if (Object.keys(input).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(input,key))) throw new TypeError('INPUT_MAPPING_INCOMPLETE');
  if (input.inputMode !== 'MEASURED_OR_QUALIFIED_SOURCE_ONLY') throw new TypeError('INFERRED_OR_OUTPUT_FITTED_INPUT_REJECTED');
  const value = structuredClone(input);
  if (profile === 'MM_MPA') {
    for (const key of ['diameter','thickness','length','loadedDent','residualDent']) value[key] /= 1000;
  } else if (profile === 'IN_KSI') {
    for (const key of ['diameter','thickness','length','loadedDent','residualDent']) value[key] /= M_TO_IN;
    for (const key of ['elasticModulus','pressure']) value[key] /= MPA_TO_KSI;
  } else if (profile !== 'M_MPA') throw new TypeError('UNIT_PROFILE_UNSUPPORTED');
  for (const key of keys.filter((key) => key !== 'inputMode')) if (!Number.isFinite(value[key])) throw new TypeError(`NONFINITE:${key}`);
  return Object.freeze(value);
}

export function calculateOwnerProcedure(canonical, { uncertainty = UNCERTAINTY } = {}) {
  validateRegisteredCell(canonical);
  const depthRatio = canonical.loadedDent / canonical.diameter;
  const permanentFraction = canonical.residualDent / canonical.loadedDent;
  const pressureElasticRatio = canonical.pressure * canonical.diameter / (2 * canonical.thickness * canonical.elasticModulus);
  const diameterToThickness = canonical.diameter / canonical.thickness;
  const lengthToDiameter = canonical.length / canonical.diameter;
  const nominal = Math.max(
    depthRatio / (REGISTERED_INPUT.loadedDent / REGISTERED_INPUT.diameter),
    permanentFraction / 0.6,
    canonical.maxPeeq / 0.01,
    canonical.plasticPointFraction / 0.9,
  );
  const uncertainDepth = (canonical.loadedDent + uncertainty.loadedDent) / Math.max(canonical.diameter - uncertainty.diameter, 1e-30);
  const uncertainPermanent = (canonical.residualDent + uncertainty.residualDent) / Math.max(canonical.loadedDent - uncertainty.loadedDent, 1e-30);
  const uncertainPressureRatio = (canonical.pressure + uncertainty.pressure) * (canonical.diameter + uncertainty.diameter) /
    (2 * Math.max(canonical.thickness - uncertainty.thickness,1e-30) * Math.max(canonical.elasticModulus - uncertainty.elasticModulus,1e-30));
  const uncertain = Math.max(
    uncertainDepth / (REGISTERED_INPUT.loadedDent / REGISTERED_INPUT.diameter),
    uncertainPermanent / 0.6,
    (canonical.maxPeeq + uncertainty.maxPeeq) / 0.01,
    (canonical.plasticPointFraction + uncertainty.plasticPointFraction) / 0.9,
    uncertainPressureRatio / pressureElasticRatio,
  );
  const raw = {
    depthRatio, permanentFraction, pressureElasticRatio,
    diameterToThickness, lengthToDiameter,
    nominalGoverningIndex: nominal,
    uncertainGoverningIndex: uncertain,
    uncertaintyMarginImpact: uncertain - nominal,
  };
  return Object.freeze({
    schema: 'lafea-owner-procedure-ledger/v1',
    status: 'PACKAGE_LEDGER_COMPLETE',
    caseDisposition: 'NOT_AUTHORIZED',
    raw,
    finalReported: Object.fromEntries(Object.entries(raw).map(([key,value]) => [key, Number(value.toPrecision(8))])),
    clauseLedger: ['OP-01','OP-02','OP-03','OP-04','OP-05'],
  });
}

export function validateRegisteredCell(value) {
  const normalized = {
    diameterToThickness: value.diameter/value.thickness,
    lengthToDiameter: value.length/value.diameter,
    pressureElasticRatio: value.pressure*value.diameter/(2*value.thickness*value.elasticModulus),
    poissonRatio: value.poissonRatio,
  };
  const reference = {
    diameterToThickness: REGISTERED_INPUT.diameter/REGISTERED_INPUT.thickness,
    lengthToDiameter: REGISTERED_INPUT.length/REGISTERED_INPUT.diameter,
    pressureElasticRatio: REGISTERED_INPUT.pressure*REGISTERED_INPUT.diameter/(2*REGISTERED_INPUT.thickness*REGISTERED_INPUT.elasticModulus),
    poissonRatio: REGISTERED_INPUT.poissonRatio,
  };
  for (const key of Object.keys(reference)) if (rel(normalized[key],reference[key]) > 1e-12) throw new TypeError(`OUT_OF_REGISTERED_CELL:${key}`);
  if (value.loadedDent <= 0 || value.residualDent < 0 || value.residualDent > value.loadedDent) throw new TypeError('DENT_GEOMETRY_INVALID');
  if (value.maxPeeq < 0 || value.plasticPointFraction < 0 || value.plasticPointFraction > 1) throw new TypeError('PLASTIC_METRIC_INVALID');
  return true;
}

export const relativeDifference = rel;
