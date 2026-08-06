import assert from 'node:assert/strict';
import { COLD_TEMPERATURE, codeProfile, editionDataset, stressFactorSet } from '../../../../scripts/lfea-b4.0-code-engine-fixtures.mjs';
import {
  INPUTXML_LINEAR_B31_EVALUATION_REQUEST_SCHEMA,
  evaluateInputXmlLinearB31,
} from '../index.js';
import { approval, preflight, solve } from './inputxml-analysis-result-package-source.js';
import { derived, expansion, occasional, operating, pressure, sustained } from './inputxml-analysis-result-package-derived.js';

const station = sustained.resultState.sourceStations.find((row) =>
  row.sourceStationKind === 'END_SIDE' && row.internalSectionLocalAction !== null);
assert.ok(station);
const materialId = solve.structuralPreparation.materialResolutions[0].materialState.materialId;
const dataset = editionDataset({ materialId,
  allowablePoints: [250, 293.15, 373.15, 500].map((absoluteTemperature, index) => ({
    absoluteTemperature,
    allowableStress: { value: [110, 100, 90, 80][index] * 1e6,
      source: 'FIXTURE-EDITION-DATASET-NOT-ASME' },
  })),
});
const componentId = 'IXCOMP-PR10';
const factors = stressFactorSet({ factorSetId: 'SF-IXCOMP-PR10', componentId });
const check = (checkId, category, derivedCase, source, extra) => ({
  checkId, category, derivedCaseId: derivedCase.derivedCaseId,
  sourceStationId: station.stationId, sourceElementId: station.elementId,
  sourceRecoveredCaseId: source.recoveredCaseId, componentId,
  stressFactorSet: factors, sustainedSectionResolution: null,
  coldTemperature: null, sustainedCheckId: null, occasionalCategoryId: null,
  approximationApproval: approval(), ...extra,
});
const checks = [
  check('IX-PKG-SUS', 'SUSTAINED', sustained, pressure, {}),
  check('IX-PKG-OCC', 'OCCASIONAL', occasional, operating,
    { occasionalCategoryId: 'WIND_FIXTURE' }),
  check('IX-PKG-EXP', 'DISPLACEMENT_STRESS_RANGE', expansion, operating,
    { coldTemperature: { value: COLD_TEMPERATURE,
      source: 'FIXTURE-EDITION-DATASET-NOT-ASME' } }),
  check('IX-PKG-EXP-ENV', 'EXPANSION_RANGE_ENVELOPE', expansion, operating,
    { coldTemperature: { value: COLD_TEMPERATURE,
      source: 'FIXTURE-EDITION-DATASET-NOT-ASME' }, sustainedCheckId: 'IX-PKG-SUS' }),
];

export const evaluation = evaluateInputXmlLinearB31({
  schema: INPUTXML_LINEAR_B31_EVALUATION_REQUEST_SCHEMA,
  evaluationId: 'IX-B31-EVAL-MHPR10', solvePreparation: solve, preflight,
  derivedCases: derived, codeProfile: codeProfile(), editionDataset: dataset, checks,
});
