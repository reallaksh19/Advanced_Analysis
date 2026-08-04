import { FRAME_LOCAL_AXIS_PROFILE, resolveFrameLocalAxes } from '../src/core/centerline-beam-fea/index.js';
import {
  LINEAR_FEA_MATERIAL_RESOLUTION_PROFILE,
  resolveLinearFeaMaterialState,
  sealMaterialTable,
} from '../src/core/linear-fea-material/index.js';
import {
  PIPE_SECTION_FORMULATION_ID,
  PIPE_SECTION_PROFILE,
  PIPE_SECTION_REQUEST_SCHEMA,
  computePipeSectionRequestSemanticHash,
  resolvePipeSection,
} from '../src/core/linear-fea-section/index.js';
import { compileFrameElement } from '../src/core/linear-fea-frame-element/index.js';
import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
} from '../src/core/linear-fea-load-case/index.js';
import { compileMechanicalModel } from '../src/core/linear-fea-model-compiler/index.js';
import {
  compilePipingComponent,
  sealComponentFactorSet,
} from '../src/core/linear-fea-piping-components/index.js';
import {
  augmentPipingComponentTemperatureAuthorities,
  expandPipeWallGravitySourceAuthorities,
} from '../src/core/linear-piping-analysis-consumer/index.js';
import {
  compileSolverExecution,
  elementContributionFromFrameElement,
  elementContributionsFromPipingComponent,
} from '../src/core/linear-fea-solver/index.js';
import { compileResultRecovery } from '../src/core/linear-fea-result-recovery/index.js';
import {
  sealCodeProfile,
  sealEditionDataset,
  sealStressFactorSet,
} from '../src/core/linear-fea-b31-code-engine/index.js';
import { semanticHash } from '../src/core/shared-piping-model/canonical-json.js';
import { compilerProfile } from './lfea-b2.5-model-compiler-fixtures.mjs';
import { eulerBernoulliProfile } from './lfea-b3.1-frame-element-fixtures.mjs';
import { componentProfile } from './lfea-b3.2-piping-component-fixtures.mjs';
import { loadCaseProfile, solverProfile } from './lfea-b3.3-solver-fixtures.mjs';
import { recoveryProfile } from './lfea-b3.4-recovery-fixtures.mjs';

export const APPENDIX_S3_SOURCE = 'ASME-B31.3-2006-APPENDIX-S-EXAMPLE-3';
export const INSTALLATION_TEMPERATURE = 277.65;
export const OPERATING_TEMPERATURE = 394.15;
export const OPERATING_PRESSURE = 1.724e6;
export const ELASTIC_MODULUS = 203.4e9;
export const POISSON_RATIO = 0.3;
export const SHEAR_MODULUS = ELASTIC_MODULUS / (2 * (1 + POISSON_RATIO));
export const MASS_DENSITY = 7833.4;
export const GRAVITATIONAL_ACCELERATION = 9.80665;
export const HEADER_OUTER_DIAMETER = 0.6096;
export const BRANCH_OUTER_DIAMETER = 0.5080;
export const NOMINAL_WALL_THICKNESS = 0.00953;
export const METER_WEIGHT = 8890;
export const METER_LENGTH = 1.52;
export const METER_MASS = METER_WEIGHT / GRAVITATIONAL_ACCELERATION;
export const TEE_STUB_LENGTH = 0.10;
export const CYCLE_REDUCTION_FACTOR = 1.20;
export const COLD_ALLOWABLE = 137.85733333333334e6;
export const HOT_ALLOWABLE = 138.04666666666665e6;
export const PUBLISHED_SUSTAINED_STRESS = 28.380e6;
export const PUBLISHED_DISPLACEMENT_ALLOWABLE = 248.2e6;
export const PUBLISHED_EXPANSION_ALLOWABLE = 379.8e6;

/*
 * ASME B31.3-2006 Appendix C Table C-1, Carbon Steel:
 * 250°F total expansion = 1.40 in/100 ft from the table reference
 * (Owner-verified directly against the table: the 250°F Carbon Steel row
 * reads 1.40, not 1.37 -- corrected during Owner review, see M018 PR
 * discussion);
 * 40°F is linearly interpolated between 25°F (-0.32) and 50°F (-0.14),
 * giving -0.212 in/100 ft. B-3.1 consumes one mean coefficient:
 *
 * epsilon = [1.40 - (-0.212)] / 1200 = 0.0013433333333333333
 * alpha   = epsilon / (121°C - 4.5°C)
 */
export const THERMAL_EXPANSION_COEFFICIENT =
  ((1.40 - (-0.212)) / 1200)
  / (OPERATING_TEMPERATURE - INSTALLATION_TEMPERATURE);

/*
 * ASME B31.3-2006 Appendix D Table D300, welding tee:
 * r = (D - T)/2; h = 3.1T/r; k = 1.0;
 * i_o = 0.9/h^(2/3); i_i = 0.75 i_o + 0.25.
 */
const teeMeanRadius = (HEADER_OUTER_DIAMETER - NOMINAL_WALL_THICKNESS) / 2;
const teeFlexibilityCharacteristic = 3.1 * NOMINAL_WALL_THICKNESS / teeMeanRadius;
export const TEE_DERIVATION = Object.freeze({
  source: 'ASME B31.3-2006 Appendix D Table D300 welding tee',
  meanRadius: teeMeanRadius,
  flexibilityCharacteristic: teeFlexibilityCharacteristic,
  flexibilityFactor: 1,
  outOfPlaneSif: 0.9 / teeFlexibilityCharacteristic ** (2 / 3),
  inPlaneSif: 0.75 * (0.9 / teeFlexibilityCharacteristic ** (2 / 3)) + 0.25,
});

/*
 * Table S303.3 gives one 2,000-lb meter in each 5-ft branch segment. The
 * Appendix discussion warns that relatively rigid inline-component stiffness
 * affects the published commercial-program average. Represent each meter as a
 * finite semi-rigid body whose equivalent annular area is derived from its
 * stated mass, length, A53 density, and connected NPS20 OD. No target result
 * enters this derivation and no duplicate point weight is applied.
 */
const meterEquivalentArea = METER_MASS / (MASS_DENSITY * METER_LENGTH);
const meterInnerDiameter = Math.sqrt(
  BRANCH_OUTER_DIAMETER ** 2 - (4 * meterEquivalentArea) / Math.PI,
);
export const METER_DERIVATION = Object.freeze({
  source: 'ASME B31.3-2006 Appendix S Table S303.3: 2,000-lb meter over one 5-ft segment',
  weight: METER_WEIGHT,
  mass: METER_MASS,
  length: METER_LENGTH,
  density: MASS_DENSITY,
  connectedOuterDiameter: BRANCH_OUTER_DIAMETER,
  equivalentArea: meterEquivalentArea,
  equivalentInnerDiameter: meterInnerDiameter,
  equivalentWallThickness: (BRANCH_OUTER_DIAMETER - meterInnerDiameter) / 2,
});

export const JUNCTION_POINTS = Object.freeze({
  'APP-S3.N10': [0.00, 0, 0.00],
  'APP-S3.T20': [1.52, 0, 0.00],
  'APP-S3.T30': [1.52, 0, 1.52],
  'APP-S3.N35': [1.52, 0, 2.28],
  'APP-S3.T40': [1.52, 0, -1.52],
  'APP-S3.N45': [1.52, 0, -2.28],
  'APP-S3.N110': [3.04, 0, -1.52],
  'APP-S3.N120': [4.56, 0, -1.52],
  'APP-S3.N130': [6.08, 0, -1.52],
  'APP-S3.N140': [7.60, 0, -1.52],
  'APP-S3.T340': [9.12, 0, -1.52],
  'APP-S3.N210': [3.04, 0, 1.52],
  'APP-S3.N220': [4.56, 0, 1.52],
  'APP-S3.N230': [6.08, 0, 1.52],
  'APP-S3.N240': [7.60, 0, 1.52],
  'APP-S3.T330': [9.12, 0, 1.52],
  'APP-S3.T320': [9.12, 0, 0.00],
  'APP-S3.N310': [10.64, 0, 0.00],
  'APP-S3.N335': [9.12, 0, 2.28],
  'APP-S3.N345': [9.12, 0, -2.28],
});

export const PUBLISHED_CASE_1 = Object.freeze([
  { label: '10', fx: 0, my: 147470, stress: 55.610e6, kind: 'STRAIGHT' },
  { label: '20', fx: 0, my: -147470, stress: 189.945e6, kind: 'TEE' },
  { label: '30', fx: -78485, my: 45900, stress: 84.360e6, kind: 'TEE' },
  { label: '40', fx: 78485, my: 45900, stress: 84.360e6, kind: 'TEE' },
  { label: '110', fx: 78485, my: 45900, stress: 25.155e6, kind: 'STRAIGHT' },
  { label: '120', fx: 78485, my: 45900, stress: 25.155e6, kind: 'STRAIGHT' },
  { label: '130', fx: 78485, my: 45900, stress: 25.155e6, kind: 'STRAIGHT' },
  { label: '140', fx: 78485, my: 45900, stress: 25.155e6, kind: 'STRAIGHT' },
  { label: '340', fx: 78485, my: 45900, stress: 84.360e6, kind: 'TEE' },
  { label: '210', fx: -78485, my: 45900, stress: 25.155e6, kind: 'STRAIGHT' },
  { label: '220', fx: -78485, my: 45900, stress: 25.155e6, kind: 'STRAIGHT' },
  { label: '230', fx: -78485, my: 45900, stress: 25.155e6, kind: 'STRAIGHT' },
  { label: '240', fx: -78485, my: 45900, stress: 25.155e6, kind: 'STRAIGHT' },
  { label: '330', fx: -78485, my: 45900, stress: 84.360e6, kind: 'TEE' },
  { label: '310', fx: 0, my: -147470, stress: 55.610e6, kind: 'STRAIGHT' },
  { label: '320', fx: 0, my: 147470, stress: 189.945e6, kind: 'TEE' },
]);

export const PUBLISHED_CASE_2 = Object.freeze(PUBLISHED_CASE_1.map((row) => Object.freeze({
  ...row,
  fx: -row.fx,
  my: -row.my,
})));

export const PUBLISHED_CASE_RANGE = Object.freeze(PUBLISHED_CASE_1.map((row) => Object.freeze({
  ...row,
  fx: 2 * row.fx,
  my: 2 * row.my,
  stress: 2 * row.stress,
})));

export const TEE_DEFINITIONS = Object.freeze([
  teeDefinition('APP-S3.T20', 'header', [-1, 0, 0], [0, 0, -1], [0, 0, 1]),
  teeDefinition('APP-S3.T30', 'west', [1, 0, 0], [0, 0, -1], [0, 0, 1]),
  teeDefinition('APP-S3.T40', 'east', [1, 0, 0], [0, 0, -1], [0, 0, 1]),
  teeDefinition('APP-S3.T320', 'header', [1, 0, 0], [0, 0, -1], [0, 0, 1]),
  teeDefinition('APP-S3.T330', 'west', [-1, 0, 0], [0, 0, -1], [0, 0, 1]),
  teeDefinition('APP-S3.T340', 'east', [-1, 0, 0], [0, 0, -1], [0, 0, 1]),
]);

export const STRAIGHT_SPANS = Object.freeze([
  span('APP-S3.E10-T20', 'APP-S3.N10', 'APP-S3.T20.N1', 'header'),
  span('APP-S3.ET20-T30', 'APP-S3.T20.N3', 'APP-S3.T30.N2', 'header'),
  span('APP-S3.ET30-35', 'APP-S3.T30.N3', 'APP-S3.N35', 'header'),
  span('APP-S3.ET20-T40', 'APP-S3.T20.N2', 'APP-S3.T40.N3', 'header'),
  span('APP-S3.ET40-45', 'APP-S3.T40.N2', 'APP-S3.N45', 'header'),
  span('APP-S3.ET30-210', 'APP-S3.T30.N1', 'APP-S3.N210', 'west'),
  span('APP-S3.E210-220', 'APP-S3.N210', 'APP-S3.M230.N0', 'west'),
  span('APP-S3.E230-240', 'APP-S3.M230.N1', 'APP-S3.N240', 'west'),
  span('APP-S3.E240-T330', 'APP-S3.N240', 'APP-S3.T330.N1', 'west'),
  span('APP-S3.ET40-110', 'APP-S3.T40.N1', 'APP-S3.N110', 'east'),
  span('APP-S3.E110-120', 'APP-S3.N110', 'APP-S3.M130.N0', 'east'),
  span('APP-S3.E130-140', 'APP-S3.M130.N1', 'APP-S3.N140', 'east'),
  span('APP-S3.E140-T340', 'APP-S3.N140', 'APP-S3.T340.N1', 'east'),
  span('APP-S3.ET330-T320', 'APP-S3.T330.N2', 'APP-S3.T320.N3', 'header'),
  span('APP-S3.ET330-335', 'APP-S3.T330.N3', 'APP-S3.N335', 'header'),
  span('APP-S3.ET320-T340', 'APP-S3.T320.N2', 'APP-S3.T340.N3', 'header'),
  span('APP-S3.ET340-345', 'APP-S3.T340.N2', 'APP-S3.N345', 'header'),
  span('APP-S3.ET320-310', 'APP-S3.T320.N1', 'APP-S3.N310', 'header'),
]);

export const TABLE_ACTION_SOURCES = Object.freeze({
  '10': { kind: 'ELEMENT', elementId: 'APP-S3.E10-T20', end: 'I' },
  '20': { kind: 'ELEMENT', elementId: 'APP-S3.E10-T20', end: 'J' },
  '30': { kind: 'COMPONENT', componentId: 'APP-S3.T30', stationId: 'APP-S3.T30.CP1' },
  '40': { kind: 'COMPONENT', componentId: 'APP-S3.T40', stationId: 'APP-S3.T40.CP1' },
  '110': { kind: 'ELEMENT', elementId: 'APP-S3.ET40-110', end: 'J' },
  '120': { kind: 'ELEMENT', elementId: 'APP-S3.E110-120', end: 'J' },
  '130': { kind: 'COMPONENT', componentId: 'APP-S3.M130', stationId: 'APP-S3.M130.CP-J' },
  '140': { kind: 'ELEMENT', elementId: 'APP-S3.E130-140', end: 'J' },
  '340': { kind: 'ELEMENT', elementId: 'APP-S3.E140-T340', end: 'J' },
  '210': { kind: 'ELEMENT', elementId: 'APP-S3.ET30-210', end: 'J' },
  '220': { kind: 'ELEMENT', elementId: 'APP-S3.E210-220', end: 'J' },
  '230': { kind: 'COMPONENT', componentId: 'APP-S3.M230', stationId: 'APP-S3.M230.CP-J' },
  '240': { kind: 'ELEMENT', elementId: 'APP-S3.E230-240', end: 'J' },
  '330': { kind: 'ELEMENT', elementId: 'APP-S3.E240-T330', end: 'J' },
  '310': { kind: 'ELEMENT', elementId: 'APP-S3.ET320-310', end: 'J' },
  '320': { kind: 'ELEMENT', elementId: 'APP-S3.ET320-310', end: 'I' },
});

export const CODE_SOURCES = Object.freeze({
  '10': { kind: 'ELEMENT', elementId: 'APP-S3.E10-T20', end: 'I', section: 'header' },
  '20': { kind: 'COMPONENT', componentId: 'APP-S3.T20', stationId: 'APP-S3.T20.CP1', section: 'header' },
  '30': { kind: 'COMPONENT', componentId: 'APP-S3.T30', stationId: 'APP-S3.T30.CP1', section: 'branch' },
  '40': { kind: 'COMPONENT', componentId: 'APP-S3.T40', stationId: 'APP-S3.T40.CP1', section: 'branch' },
  '110': { kind: 'ELEMENT', elementId: 'APP-S3.ET40-110', end: 'J', section: 'branch' },
  '120': { kind: 'ELEMENT', elementId: 'APP-S3.E110-120', end: 'J', section: 'branch' },
  '130': { kind: 'ELEMENT', elementId: 'APP-S3.E130-140', end: 'I', section: 'branch' },
  '140': { kind: 'ELEMENT', elementId: 'APP-S3.E130-140', end: 'J', section: 'branch' },
  '340': { kind: 'COMPONENT', componentId: 'APP-S3.T340', stationId: 'APP-S3.T340.CP1', section: 'branch' },
  '210': { kind: 'ELEMENT', elementId: 'APP-S3.ET30-210', end: 'J', section: 'branch' },
  '220': { kind: 'ELEMENT', elementId: 'APP-S3.E210-220', end: 'J', section: 'branch' },
  '230': { kind: 'ELEMENT', elementId: 'APP-S3.E230-240', end: 'I', section: 'branch' },
  '240': { kind: 'ELEMENT', elementId: 'APP-S3.E230-240', end: 'J', section: 'branch' },
  '330': { kind: 'COMPONENT', componentId: 'APP-S3.T330', stationId: 'APP-S3.T330.CP1', section: 'branch' },
  '310': { kind: 'ELEMENT', elementId: 'APP-S3.ET320-310', end: 'J', section: 'header' },
  '320': { kind: 'COMPONENT', componentId: 'APP-S3.T320', stationId: 'APP-S3.T320.CP1', section: 'header' },
});

function teeDefinition(componentId, branchRegion, branchDirection, runNegativeDirection, runPositiveDirection) {
  return Object.freeze({
    componentId,
    junctionPosition: JUNCTION_POINTS[componentId],
    legs: Object.freeze([
      Object.freeze({ legId: 'A-BRANCH', direction: branchDirection, region: branchRegion, section: branchRegion === 'header' ? 'header' : 'branch' }),
      Object.freeze({ legId: 'B-RUN-NEG', direction: runNegativeDirection, region: 'header', section: 'header' }),
      Object.freeze({ legId: 'C-RUN-POS', direction: runPositiveDirection, region: 'header', section: 'header' }),
    ]),
  });
}

function span(elementId, nodeI, nodeJ, region) {
  return Object.freeze({ elementId, nodeI, nodeJ, region, section: region === 'header' ? 'header' : 'branch' });
}
