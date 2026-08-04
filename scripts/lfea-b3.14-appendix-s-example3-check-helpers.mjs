/**
 * M018 ASME B31.3-2006 Appendix S Example 3 (Moment Reversal).
 *
 * Appendix S states that the tabulated actions are averages from commercial
 * programs and are affected by modelling choices for relatively rigid inline
 * bodies. The benchmark therefore keeps the established Appendix-S discipline:
 * 10% relative tolerances for recovered actions and calculated stresses, with
 * small absolute floors only for quantities published as zero. Allowables are
 * independently derived scalars and remain tight equality checks.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  compileCodeResult,
} from '../src/core/linear-fea-b31-code-engine/index.js';
import {
  B31_APPLICATION_REQUEST_SCHEMA,
  compileLinearPipingB31Application,
} from '../src/core/linear-piping-code-application/index.js';
import {
  APPENDIX_S3_SOURCE,
  BRANCH_OUTER_DIAMETER,
  CODE_SOURCES,
  COLD_ALLOWABLE,
  CYCLE_REDUCTION_FACTOR,
  HEADER_OUTER_DIAMETER,
  HOT_ALLOWABLE,
  INSTALLATION_TEMPERATURE,
  JUNCTION_POINTS,
  MASS_DENSITY,
  METER_DERIVATION,
  METER_LENGTH,
  METER_WEIGHT,
  NOMINAL_WALL_THICKNESS,
  OPERATING_PRESSURE,
  OPERATING_TEMPERATURE,
  PUBLISHED_CASE_1,
  PUBLISHED_CASE_2,
  PUBLISHED_CASE_RANGE,
  PUBLISHED_DISPLACEMENT_ALLOWABLE,
  PUBLISHED_EXPANSION_ALLOWABLE,
  PUBLISHED_SUSTAINED_STRESS,
  TABLE_ACTION_SOURCES,
  TEE_DERIVATION,
  THERMAL_EXPANSION_COEFFICIENT,
  codeProfile,
  componentCodePoint,
  componentFrameElement,
  editionDataset,
  elementAction,
  solveAppendixS3,
  straightFrameElement,
  stressFactorSet,
} from './lfea-b3.14-appendix-s-example3-fixtures.mjs';

export const ACTION_RELATIVE_TOLERANCE = 0.10;
export const STRESS_RELATIVE_TOLERANCE = 0.10;
export const SUSTAINED_RELATIVE_TOLERANCE = 0.10;
export const ZERO_FORCE_FLOOR_N = 300;
export const ZERO_MOMENT_FLOOR_NM = 300;
export const SYMMETRY_TOLERANCE = 1e-4;
export const ALLOWABLE_TOLERANCE = 1e-12;
const LOCAL_FIELDS = Object.freeze(['fx', 'fy', 'fz', 'mx', 'my', 'mz']);
export const TEE_LABELS = Object.freeze(['20', '30', '40', '340', '330', '320']);
const TEE_COMPONENT_BY_LABEL = Object.freeze({
  '20': 'APP-S3.T20',
  '30': 'APP-S3.T30',
  '40': 'APP-S3.T40',
  '340': 'APP-S3.T340',
  '330': 'APP-S3.T330',
  '320': 'APP-S3.T320',
});

export function assertWithin(actual, expected, relativeTolerance, absoluteFloor, message) {
  const tolerance = Math.max(Math.abs(expected) * relativeTolerance, absoluteFloor);
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: ${actual} differs from ${expected} by ${Math.abs(actual - expected)}, tolerance ${tolerance}`,
  );
}

export function assertClose(actual, expected, relativeTolerance, message) {
  const scale = Math.max(Math.abs(expected), 1e-300);
  assert.ok(
    Math.abs(actual - expected) <= relativeTolerance * scale,
    `${message}: ${actual} differs from ${expected} beyond ${relativeTolerance} relative`,
  );
}

function tableSourceAction(analysis, label) {
  const source = TABLE_ACTION_SOURCES[label];
  assert.notEqual(source, undefined, `missing table action source for node ${label}`);
  if (source.kind === 'ELEMENT') return elementAction(analysis, source.elementId, source.end);
  const point = componentCodePoint(analysis, source.componentId, source.stationId);
  return { local: point.local, global: point.global, elementId: point.elementId, end: point.end };
}

/*
 * Owner review correction: the selected Table-S303.3 source ends already
 * report `my` in the published Appendix S sign convention directly, with no
 * reversal needed. Verified empirically across every I- and J-end source
 * (nodes 10, 20, 110, 120, 140, 210, 220, 310): the raw recovered `global.my`
 * sign matches the published sign at every one of them. The original claim
 * that B-3.4's joint-action-on-element convention required negation did not
 * hold up against the real recovered actions and has been removed.
 */
export function publishedConventionAction(analysis, label) {
  const action = tableSourceAction(analysis, label).global;
  return { fx: action.fx, my: action.my };
}

function codeSource(analysis, label) {
  const source = CODE_SOURCES[label];
  assert.notEqual(source, undefined, `missing code source for node ${label}`);
  if (source.kind === 'ELEMENT') {
    const action = elementAction(analysis, source.elementId, source.end);
    return {
      local: action.local,
      frameElementRecord: straightFrameElement(analysis, source.elementId),
      componentId: `APP-S3.CODE-${label}`,
      sectionKey: source.section,
      tee: false,
    };
  }
  const point = componentCodePoint(analysis, source.componentId, source.stationId);
  return {
    local: point.local,
    frameElementRecord: componentFrameElement(analysis, source.componentId, point.elementId),
    componentId: source.componentId,
    sectionKey: source.section,
    tee: true,
  };
}

function subtractActions(toAction, fromAction) {
  return Object.fromEntries(LOCAL_FIELDS.map((field) => [field, toAction[field] - fromAction[field]]));
}

export function compileRangeResult(derived, label, category, fromCaseKey, toCaseKey, forceUnityTeeSifs = false) {
  const from = codeSource(derived.analyses[fromCaseKey], label);
  const to = codeSource(derived.analyses[toCaseKey], label);
  assert.equal(from.componentId, to.componentId);
  const localAction = subtractActions(to.local, from.local);
  return compileCodeResult({
    codeProfile: codeProfile(),
    editionDataset: editionDataset(),
    stressFactorSet: stressFactorSet(to.componentId, {
      tee: to.tee,
      forceUnityTeeSifs,
    }),
    category,
    codePointId: `APP-S3-${label}-${category.replaceAll('_', '-')}`,
    componentId: to.componentId,
    combinationId: `${toCaseKey}-MINUS-${fromCaseKey}`,
    frameElementRecord: to.frameElementRecord,
    sectionResolution: derived.sections[to.sectionKey],
    materialResolution: derived.material,
    localAction,
    pressureStressContribution: null,
    coldTemperature: {
      value: INSTALLATION_TEMPERATURE,
      source: 'ASME B31.3-2006 Appendix S Example 3 installation temperature, 40°F',
    },
    sustainedStress: category === 'EXPANSION_RANGE_ENVELOPE'
      ? { value: PUBLISHED_SUSTAINED_STRESS, source: 'Appendix S Table S303.7.3 note, nodes 20/320' }
      : null,
    occasionalCategoryId: null,
  });
}

export function teeApplication(derived, category, fromCaseId, toCaseId, forceUnityTeeSifs = false) {
  const cases = [
    ['INSTALL', derived.analyses.INSTALL],
    ['CASE1', derived.analyses.CASE1],
    ['CASE2', derived.analyses.CASE2],
  ].map(([caseId, analysis]) => ({ caseId, loadCase: analysis.loadCase, recovery: analysis.recovery }));
  const checks = TEE_LABELS.map((label) => {
    const componentId = TEE_COMPONENT_BY_LABEL[label];
    const point = componentCodePoint(derived.analyses[toCaseId], componentId, `${componentId}.CP1`);
    const source = CODE_SOURCES[label];
    return {
      checkId: `APP-S3-${category}-${label}`,
      category,
      codePointId: `${componentId}.CP1`,
      componentId,
      combinationId: `${toCaseId}-MINUS-${fromCaseId}`,
      actionSource: { kind: 'CASE_RANGE', fromCaseId, toCaseId },
      frameElementRecord: componentFrameElement(derived.analyses[toCaseId], componentId, point.elementId),
      sectionResolution: derived.sections[source.section],
      sustainedSectionResolution: null,
      materialResolution: derived.material,
      stressFactorSet: stressFactorSet(componentId, { tee: true, forceUnityTeeSifs }),
      pressureStressContribution: null,
      coldTemperature: {
        value: INSTALLATION_TEMPERATURE,
        source: 'ASME B31.3-2006 Appendix S Example 3 installation temperature, 40°F',
      },
      sustainedStress: category === 'EXPANSION_RANGE_ENVELOPE'
        ? { value: PUBLISHED_SUSTAINED_STRESS, source: 'Appendix S Table S303.7.3 note, nodes 20/320' }
        : null,
      occasionalCategoryId: null,
    };
  });
  return compileLinearPipingB31Application({
    schema: B31_APPLICATION_REQUEST_SCHEMA,
    applicationId: `APP-S3-${category}-${toCaseId}-MINUS-${fromCaseId}`,
    codeProfile: codeProfile(),
    editionDataset: editionDataset(),
    cases,
    checks,
  });
}

export function sustainedApplication(derived, caseKey) {
  const analysis = derived.analyses[caseKey];
  const caseId = caseKey;
  const labels = ['20', '320'];
  return compileLinearPipingB31Application({
    schema: B31_APPLICATION_REQUEST_SCHEMA,
    applicationId: `APP-S3-SUSTAINED-${caseKey}`,
    codeProfile: codeProfile(),
    editionDataset: editionDataset(),
    cases: [{ caseId, loadCase: analysis.loadCase, recovery: analysis.recovery }],
    checks: labels.map((label) => {
      const componentId = TEE_COMPONENT_BY_LABEL[label];
      const point = componentCodePoint(analysis, componentId, `${componentId}.CP1`);
      return {
        checkId: `APP-S3-SUSTAINED-${caseKey}-${label}`,
        category: 'SUSTAINED',
        codePointId: `${componentId}.CP1`,
        componentId,
        combinationId: caseKey,
        actionSource: { kind: 'SINGLE_CASE', caseId },
        frameElementRecord: componentFrameElement(analysis, componentId, point.elementId),
        sectionResolution: derived.sections.header,
        sustainedSectionResolution: null,
        materialResolution: derived.material,
        stressFactorSet: stressFactorSet(componentId, { tee: true }),
        pressureStressContribution: null,
        coldTemperature: null,
        sustainedStress: null,
        occasionalCategoryId: null,
      };
    }),
  });
}

export function resultByLabel(application, category, label) {
  const checkId = `APP-S3-${category}-${label}`;
  const found = application.results.find((entry) => entry.checkId === checkId);
  assert.notEqual(found, undefined, `missing application result ${checkId}`);
  return found.codeResult;
}

export function relativeErrorScore(rows) {
  return Math.sqrt(rows.reduce((sum, row) => {
    const scale = Math.max(Math.abs(row.expected), 1);
    return sum + ((row.actual - row.expected) / scale) ** 2;
  }, 0) / rows.length);
}

export function packageRegistrationEvidence() {
  const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(
    packageJson.scripts['check:lfea-b3.14'],
    'node scripts/lfea-b3.14-appendix-s-example3-check.mjs',
  );
  const linearCore = packageJson.scripts['check:lfea-linear-core'];
  const b313 = linearCore.indexOf('npm run check:lfea-b3.13');
  const b314 = linearCore.indexOf('npm run check:lfea-b3.14');
  const b40 = linearCore.indexOf('npm run check:lfea-b4.0');
  assert.ok(b313 >= 0, 'linear core must contain B3.13');
  assert.ok(b314 > b313, 'B3.14 must run after B3.13');
  assert.ok(b40 > b314, 'B3.14 must run before B4.0');
  return { b313, b314, b40 };
}
