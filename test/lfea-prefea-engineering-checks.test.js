import test from 'node:test';
import assert from 'node:assert/strict';
import {
  diagnoseInputXmlLinearPreFeaEngineeringSanity,
} from '../src/core/linear-piping-analysis-consumer/inputxml-linear-prefea-engineering-checks.js';

function field(canonicalValue, disposition = 'EXPLICIT', rawValue = String(canonicalValue)) {
  return Object.freeze({ canonicalValue, disposition, rawValue });
}

function bundle(fieldEvidence) {
  return Object.freeze({
    elementRecords: Object.freeze([Object.freeze({
      sourceFeatureId: 'PIPINGELEMENT[0]',
      canonicalSegmentId: 'SEG-1',
      fieldEvidence: Object.freeze(fieldEvidence),
    })]),
  });
}

test('pre-FEA engineering sanity accepts physically valid source properties', () => {
  const report = diagnoseInputXmlLinearPreFeaEngineeringSanity(bundle({
    DIAMETER: field(0.1),
    WALL_THICK: field(0.005),
    MODULUS: field(2e11),
    POISSONS: field(0.3),
    PIPE_DENSITY: field(7850),
    FLUID_DENSITY: field(1000),
    INSUL_THICK: field(0),
    INSUL_DENSITY: field(0),
    CORR_ALLOW: field(0),
  }));
  assert.equal(report.summary.findingCount, 0);
  assert.equal(report.summary.blockingFindingCount, 0);
});

test('pre-FEA engineering sanity blocks invalid numeric source tokens', () => {
  const report = diagnoseInputXmlLinearPreFeaEngineeringSanity(bundle({
    DIAMETER: Object.freeze({ canonicalValue: null, disposition: 'INVALID', rawValue: 'not-a-number' }),
  }));
  assert.equal(report.summary.blockingFindingCount, 1);
  assert.equal(report.findings[0].code, 'PREFEA_SOURCE_NUMERIC_INVALID');
  assert.equal(report.findings[0].category, 'SECTION');
});

test('pre-FEA engineering sanity blocks non-physical section and material data', () => {
  const report = diagnoseInputXmlLinearPreFeaEngineeringSanity(bundle({
    DIAMETER: field(0.1),
    WALL_THICK: field(0.05),
    MODULUS: field(0),
    POISSONS: field(0.5),
    PIPE_DENSITY: field(-1),
  }));
  const codes = new Set(report.findings.map((row) => row.code));
  assert.equal(codes.has('PREFEA_PIPE_INNER_DIAMETER_NONPOSITIVE'), true);
  assert.equal(codes.has('PREFEA_ELASTIC_MODULUS_NONPOSITIVE'), true);
  assert.equal(codes.has('PREFEA_POISSON_RATIO_OUT_OF_RANGE'), true);
  assert.equal(codes.has('PREFEA_PIPE_DENSITY_NEGATIVE'), true);
  assert.equal(report.findings.every((row) => row.disposition === 'BLOCK'), true);
});

test('engineering findings carry stable source and canonical custody', () => {
  const report = diagnoseInputXmlLinearPreFeaEngineeringSanity(bundle({
    WALL_THICK: field(-0.001),
  }));
  const finding = report.findings.find((row) => row.code === 'PREFEA_WALL_THICKNESS_NONPOSITIVE');
  assert.deepEqual(finding.sourceFeatureIds, ['PIPINGELEMENT[0]']);
  assert.deepEqual(finding.sourcePaths, ['PIPINGELEMENT[0].WALL_THICK']);
  assert.deepEqual(finding.canonicalEntityIds, ['SEG-1']);
  assert.match(finding.findingId, /^PF-[A-F0-9]{24}$/u);
});
