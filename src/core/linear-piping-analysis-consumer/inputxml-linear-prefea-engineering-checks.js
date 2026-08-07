import { deepFreeze } from '../shared-piping-model/immutable.js';
import { compareAscii, makeFinding } from './inputxml-linear-prefea-contract.js';

const NONNEGATIVE_FIELDS = Object.freeze([
  ['FLUID_DENSITY', 'Density cannot be negative.'],
  ['PIPE_DENSITY', 'Density cannot be negative.'],
  ['INSUL_DENSITY', 'Density cannot be negative.'],
  ['INSUL_THICK', 'Insulation thickness cannot be negative.'],
  ['CORR_ALLOW', 'Corrosion allowance cannot be negative.'],
]);

/**
 * Conservative source-level engineering checks that complement topology,
 * representability and numerical stiffness preflight. These checks do not
 * assemble stiffness or infer missing engineering authority.
 */
export function diagnoseInputXmlLinearPreFeaEngineeringSanity(sourceBundle) {
  if (!sourceBundle || !Array.isArray(sourceBundle.elementRecords)) {
    throw new TypeError('InputXML source bundle with elementRecords is required.');
  }
  const findings = [];
  for (const record of sourceBundle.elementRecords) {
    const evidence = record.fieldEvidence ?? {};
    appendInvalidNumeric(findings, record, evidence);
    appendPositiveCheck(findings, record, evidence, 'DIAMETER', 'PREFEA_DIAMETER_NONPOSITIVE', 'SECTION');
    appendPositiveCheck(findings, record, evidence, 'WALL_THICK', 'PREFEA_WALL_THICKNESS_NONPOSITIVE', 'SECTION');
    appendPositiveCheck(findings, record, evidence, 'MODULUS', 'PREFEA_ELASTIC_MODULUS_NONPOSITIVE', 'MATERIAL');
    appendPoissonCheck(findings, record, evidence.POISSONS);
    appendWallGeometryCheck(findings, record, evidence);
    for (const [fieldName, basis] of NONNEGATIVE_FIELDS) {
      appendNonnegativeCheck(findings, record, evidence[fieldName], fieldName, basis);
    }
  }
  findings.sort((left, right) => compareAscii(left.findingId, right.findingId));
  return deepFreeze({
    findings,
    summary: {
      checkedElementCount: sourceBundle.elementRecords.length,
      findingCount: findings.length,
      blockingFindingCount: findings.filter((row) => row.disposition === 'BLOCK').length,
      affectedSourceFeatureCount: new Set(findings.flatMap((row) => row.sourceFeatureIds)).size,
    },
  });
}

function appendInvalidNumeric(target, record, evidence) {
  for (const fieldName of Object.keys(evidence).sort(compareAscii)) {
    const field = evidence[fieldName];
    if (field?.disposition !== 'INVALID') continue;
    target.push(finding(record, fieldName, {
      code: 'PREFEA_SOURCE_NUMERIC_INVALID',
      category: categoryFor(fieldName),
      message: `${fieldName} contains a non-numeric source value.`,
      technicalBasis: 'An invalid numeric token cannot be converted into deterministic FEA authority.',
      evidence: { fieldName, rawValue: field.rawValue ?? null, disposition: field.disposition },
      remediation: `Correct ${fieldName} in the source model before FEA preparation.`,
    }));
  }
}

function appendPositiveCheck(target, record, evidence, fieldName, code, category) {
  const field = evidence[fieldName];
  const value = finiteCanonical(field);
  if (value === null || value > 0) return;
  target.push(finding(record, fieldName, {
    code,
    category,
    message: `${fieldName} must be greater than zero for an active piping element.`,
    technicalBasis: 'Non-positive section or elastic properties cannot define a physical linear frame stiffness.',
    evidence: { fieldName, canonicalValue: value, disposition: field?.disposition ?? null },
    remediation: `Provide a positive ${fieldName} authority and rerun pre-FEA diagnostics.`,
  }));
}

function appendPoissonCheck(target, record, field) {
  const value = finiteCanonical(field);
  if (value === null || (value > -1 && value < 0.5)) return;
  target.push(finding(record, 'POISSONS', {
    code: 'PREFEA_POISSON_RATIO_OUT_OF_RANGE',
    category: 'MATERIAL',
    message: 'Poisson ratio is outside the stable isotropic elastic range (-1, 0.5).',
    technicalBasis: 'The isotropic constitutive law requires -1 < nu < 0.5; endpoint or exterior values are non-physical/singular.',
    evidence: { fieldName: 'POISSONS', canonicalValue: value, disposition: field?.disposition ?? null },
    remediation: 'Correct the material Poisson ratio or provide a supported constitutive authority.',
  }));
}

function appendWallGeometryCheck(target, record, evidence) {
  const diameter = finiteCanonical(evidence.DIAMETER);
  const thickness = finiteCanonical(evidence.WALL_THICK);
  if (diameter === null || thickness === null || diameter <= 0 || thickness <= 0 || 2 * thickness < diameter) return;
  target.push(finding(record, 'WALL_THICK', {
    code: 'PREFEA_PIPE_INNER_DIAMETER_NONPOSITIVE',
    category: 'SECTION',
    message: 'Pipe wall thickness leaves a non-positive inner diameter.',
    technicalBasis: 'A hollow pipe section requires outside diameter greater than twice wall thickness.',
    evidence: { diameter, wallThickness: thickness, innerDiameter: diameter - 2 * thickness },
    remediation: 'Correct diameter/wall-thickness authority before section-property preparation.',
  }));
}

function appendNonnegativeCheck(target, record, field, fieldName, basis) {
  const value = finiteCanonical(field);
  if (value === null || value >= 0) return;
  target.push(finding(record, fieldName, {
    code: `PREFEA_${fieldName}_NEGATIVE`,
    category: fieldName.includes('DENSITY') ? 'LOAD' : 'SECTION',
    message: `${fieldName} cannot be negative.`,
    technicalBasis: basis,
    evidence: { fieldName, canonicalValue: value, disposition: field?.disposition ?? null },
    remediation: `Correct ${fieldName} source authority before FEA preparation.`,
  }));
}

function finding(record, fieldName, value) {
  const sourceFeatureId = String(record.sourceFeatureId);
  return makeFinding({
    ...value,
    severity: 'ERROR',
    disposition: 'BLOCK',
    capabilityEffects: ['LINEAR_STRUCTURAL_MODEL'],
    sourceFeatureIds: [sourceFeatureId],
    sourcePaths: [`${sourceFeatureId}.${fieldName}`],
    canonicalEntityIds: record.canonicalSegmentId ? [record.canonicalSegmentId] : [],
    physicalCaseIds: [],
    approximationEligible: false,
    authorizationRequired: false,
  });
}

function finiteCanonical(field) {
  const value = field?.canonicalValue;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function categoryFor(fieldName) {
  if (['MODULUS', 'POISSONS', 'MATERIAL_NAME'].includes(fieldName)) return 'MATERIAL';
  if (['DIAMETER', 'WALL_THICK', 'INSUL_THICK', 'CORR_ALLOW'].includes(fieldName)) return 'SECTION';
  if (fieldName.includes('DENSITY')) return 'LOAD';
  if (fieldName.includes('TEMP')) return 'THERMAL';
  if (fieldName.includes('PRESSURE')) return 'PRESSURE';
  return 'SCHEMA';
}
