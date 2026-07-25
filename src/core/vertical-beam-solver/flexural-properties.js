import {
  deepFreeze, semanticHash, stringValue, validateSharedPipingModel,
} from '../shared-piping-model/index.js';
import { validateVerticalLoadPathModel } from '../support-load-screening/index.js';
import {
  AUDIT_CODES, ELIGIBLE_CIRCULAR_TYPES, FLEXURAL_BASIS,
  FLEXURAL_PROPERTY_PROJECTION_SCHEMA, FORMULA_IDS, QUALIFICATION,
} from './constants.js';
import { diagnostic, diagnosticOrder } from './diagnostics.js';
import { finitePositive } from './numeric.js';
import { validateVerticalBeamSolverProfile } from './profile.js';

const MPA_TO_PA = 1e6;
const MM4_TO_M4 = 1e-12;
const MM_TO_M = 1e-3;

export function buildFlexuralPropertyProjection(sharedModel, pathModel, profile) {
  assertInputs(sharedModel, pathModel, profile);
  const components = new Map(sharedModel.components.map((row) => [row.componentKey, row]));
  const records = pathModel.paths.flatMap((path) => path.componentIntervals.map((interval) => (
    resolveInterval(path, interval, components.get(interval.componentKey))
  ))).sort(recordOrder);
  const diagnostics = records.flatMap((row) => row.diagnostics).sort(diagnosticOrder);
  const base = {
    schema: FLEXURAL_PROPERTY_PROJECTION_SCHEMA,
    datasetId: sharedModel.project.datasetId,
    sharedModelSemanticHash: sharedModel.semanticHash,
    pathModelSemanticHash: pathModel.semanticHash,
    profileSemanticHash: profile.semanticHash,
    records,
    diagnostics,
    summary: {
      intervalCount: records.length,
      readyIntervalCount: records.filter(isReady).length,
      blockedIntervalCount: records.filter((row) => !isReady(row)).length,
      directEiCount: records.filter((row) => row.resolutionBasis === FLEXURAL_BASIS.DIRECT_EI).length,
      directICount: records.filter((row) => row.resolutionBasis === FLEXURAL_BASIS.EXPLICIT_E_I).length,
      circularDerivedCount: records.filter((row) => row.resolutionBasis === FLEXURAL_BASIS.CIRCULAR_E_I).length,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateFlexuralPropertyProjection(value) {
  const errors = [];
  if (value?.schema !== FLEXURAL_PROPERTY_PROJECTION_SCHEMA) errors.push('Invalid flexural-property projection schema.');
  if (!stringValue(value?.datasetId)) errors.push('Flexural-property datasetId is required.');
  if (!Array.isArray(value?.records)) errors.push('Flexural-property records must be an array.');
  const keys = (value?.records || []).map((row) => `${row.pathId}|${row.componentKey}`);
  if (new Set(keys).size !== keys.length) errors.push('Flexural-property path/component records must be unique.');
  (value?.records || []).forEach((row) => validateRecord(row, errors));
  if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('Flexural-property semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function resolveInterval(path, interval, component) {
  const base = intervalBase(path, interval, component);
  if (path.qualification !== QUALIFICATION.READY) return blocked(base, AUDIT_CODES.PATH_NOT_QUALIFIED);
  if (!component) return blocked(base, AUDIT_CODES.MISSING_FLEXURAL_PROPERTY);
  const properties = component.engineeringProperties || {};
  const directEi = evidenceNumber(properties.flexuralRigidityNm2);
  if (invalidField(component, 'flexuralRigidityNm2') && !properties.flexuralRigidityNm2) {
    return blocked(base, AUDIT_CODES.INVALID_FLEXURAL_RIGIDITY);
  }
  if (properties.flexuralRigidityNm2) {
    if (!directEi) return blocked(base, AUDIT_CODES.INVALID_FLEXURAL_RIGIDITY, properties.flexuralRigidityNm2);
    return ready(base, { ei: directEi, basis: FLEXURAL_BASIS.DIRECT_EI, evidence: [properties.flexuralRigidityNm2], trace: [directEiTrace(directEi)] });
  }
  if (!ELIGIBLE_CIRCULAR_TYPES.includes(base.sourceType)) {
    return blocked(base, AUDIT_CODES.UNSUPPORTED_COMPONENT_FLEXURAL_MODEL);
  }
  const elasticMpa = evidenceNumber(properties.elasticModulusMpa);
  if (!elasticMpa) {
    const invalid = properties.elasticModulusMpa || invalidField(component, 'elasticModulusMpa');
    return blocked(base, invalid ? AUDIT_CODES.INVALID_ELASTIC_MODULUS : AUDIT_CODES.MISSING_FLEXURAL_PROPERTY, properties.elasticModulusMpa);
  }
  const elasticPa = elasticMpa * MPA_TO_PA;
  if (properties.secondMomentAreaMm4 || invalidField(component, 'secondMomentAreaMm4')) return fromDirectI(base, properties, elasticPa);
  return fromCircularSection(base, properties, elasticPa);
}

function fromDirectI(base, properties, elasticPa) {
  const directI = evidenceNumber(properties.secondMomentAreaMm4);
  if (!directI) return blocked(base, AUDIT_CODES.INVALID_SECOND_MOMENT, properties.secondMomentAreaMm4);
  const secondMomentM4 = directI * MM4_TO_M4;
  return ready(base, {
    elasticPa, secondMomentM4, ei: elasticPa * secondMomentM4,
    basis: FLEXURAL_BASIS.EXPLICIT_E_I,
    evidence: [properties.elasticModulusMpa, properties.secondMomentAreaMm4],
    trace: [eiTrace(elasticPa, secondMomentM4)],
  });
}

function fromCircularSection(base, properties, elasticPa) {
  const odMm = evidenceNumber(properties.outerDiameterMm);
  const wallMm = evidenceNumber(properties.wallThicknessMm);
  if (!odMm || !wallMm || wallMm >= odMm / 2) {
    const code = properties.outerDiameterMm || properties.wallThicknessMm
      ? AUDIT_CODES.INVALID_CIRCULAR_SECTION : AUDIT_CODES.MISSING_FLEXURAL_PROPERTY;
    return blocked(base, code, properties.outerDiameterMm || properties.wallThicknessMm);
  }
  const odM = odMm * MM_TO_M, wallM = wallMm * MM_TO_M, idM = odM - 2 * wallM;
  const secondMomentM4 = Math.PI / 64 * (odM ** 4 - idM ** 4);
  if (!finitePositive(secondMomentM4)) return blocked(base, AUDIT_CODES.INVALID_CIRCULAR_SECTION);
  return ready(base, {
    elasticPa, secondMomentM4, ei: elasticPa * secondMomentM4,
    basis: FLEXURAL_BASIS.CIRCULAR_E_I,
    evidence: [properties.elasticModulusMpa, properties.outerDiameterMm, properties.wallThicknessMm],
    trace: [circularTrace(odM, wallM, idM, secondMomentM4), eiTrace(elasticPa, secondMomentM4)],
  });
}

function intervalBase(path, interval, component) {
  return {
    pathId: path.pathId,
    componentKey: interval.componentKey,
    intervalStartM: interval.startStationM,
    intervalEndM: interval.endStationM,
    lengthM: interval.lengthM,
    sourceType: stringValue(component?.type).toUpperCase() || 'UNKNOWN',
  };
}

function ready(base, values) {
  const payload = {
    ...base,
    elasticModulusPa: values.elasticPa ?? null,
    secondMomentAreaM4: values.secondMomentM4 ?? null,
    flexuralRigidityNm2: values.ei,
    resolutionBasis: values.basis,
    formulaTrace: values.trace || [],
    sourceEvidence: (values.evidence || []).filter(Boolean),
    qualification: QUALIFICATION.READY,
    diagnostics: [],
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function blocked(base, code, evidence = null) {
  const payload = {
    ...base, elasticModulusPa: null, secondMomentAreaM4: null,
    flexuralRigidityNm2: null, resolutionBasis: null, formulaTrace: [],
    sourceEvidence: evidence ? [evidence] : [], qualification: QUALIFICATION.BLOCKED,
    diagnostics: [diagnostic(code, base.componentKey, `Flexural interval is blocked: ${code}.`, { pathId: base.pathId, componentKey: base.componentKey })],
  };
  return deepFreeze({ ...payload, semanticHash: semanticHash(payload) });
}

function directEiTrace(result) {
  return deepFreeze({ formulaId: 'DIRECT_FLEXURAL_RIGIDITY_EVIDENCE_V1', formulaVersion: '1.0.0', canonicalUnits: 'N*m^2', substitutions: { flexuralRigidityNm2: result }, result });
}
function circularTrace(odM, wallM, idM, result) {
  return deepFreeze({ formulaId: FORMULA_IDS.CIRCULAR_I, formulaVersion: '1.0.0', canonicalUnits: 'm^4', substitutions: { outsideDiameterM: odM, wallThicknessM: wallM, insideDiameterM: idM }, result });
}
function eiTrace(elasticPa, secondMomentM4) {
  return deepFreeze({ formulaId: FORMULA_IDS.EI_FROM_E_I, formulaVersion: '1.0.0', canonicalUnits: 'N*m^2', substitutions: { elasticModulusPa: elasticPa, secondMomentAreaM4: secondMomentM4 }, result: elasticPa * secondMomentM4 });
}
function evidenceNumber(evidence) { return finitePositive(evidence?.value); }
function invalidField(component, field) {
  return (component?.diagnostics || []).some((row) => row.code === 'ENGINEERING_PROPERTY_INVALID' && row.field === field);
}
function isReady(row) { return row.qualification === QUALIFICATION.READY; }
function recordOrder(a, b) { return `${a.pathId}|${a.intervalStartM}|${a.componentKey}`.localeCompare(`${b.pathId}|${b.intervalStartM}|${b.componentKey}`); }
function validateRecord(row, errors) {
  if (!stringValue(row?.pathId) || !stringValue(row?.componentKey)) errors.push('Flexural-property record identity is required.');
  if (!(row?.lengthM > 0) || !(row?.intervalEndM > row?.intervalStartM)) errors.push(`Flexural-property interval ${row?.componentKey || ''} is invalid.`);
  if (row?.qualification === QUALIFICATION.READY && !finitePositive(row?.flexuralRigidityNm2)) errors.push(`Flexural-property interval ${row?.componentKey || ''} has invalid EI.`);
  if (row?.semanticHash !== semanticHash(withoutHash(row))) errors.push(`Flexural-property interval ${row?.componentKey || ''} hash mismatch.`);
}
function assertInputs(sharedModel, pathModel, profile) {
  const checks = [validateSharedPipingModel(sharedModel), validateVerticalLoadPathModel(pathModel), validateVerticalBeamSolverProfile(profile)];
  if (checks.some((row) => !row.ok)) throw new TypeError('Invalid flexural-property projection input.');
  if (pathModel.sharedModelSemanticHash !== sharedModel.semanticHash) throw new TypeError('Vertical load paths do not match the shared model.');
}
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
