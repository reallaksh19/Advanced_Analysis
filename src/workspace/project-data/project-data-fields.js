/**
 * Defines every configurable Project Data field used by normalization, editing,
 * empirical loads, WebGL interaction, and benchmark acceptance.
 */
export const PROJECT_DATA_PROFILE_SCHEMA = 'project-data-profile/v1';

export const PROJECT_DATA_GROUPS = Object.freeze([
  group('sourcesAndUnits', 'Sources and units', [
    field('lengthUnit', 'Length unit', 'text', 'Normalization'),
    field('sourceUpAxis', 'Source up axis', 'text', 'Normalization'),
    field('coordinateTransform', 'Rendering coordinate transform', 'json', 'Rendering'),
    field('datasetSource', 'SJSON source', 'source', 'Normalization'),
    field('lineListSource', 'Line-list source', 'source', 'Loads'),
    field('pipingClassSource', 'Piping-class source', 'source', 'Loads'),
    field('componentWeightSource', 'Component-weight source', 'source', 'Editing and loads'),
  ]),
  group('topology', 'Topology', [
    field('portMatchToleranceMm', 'Port-match tolerance', 'number', 'mm'),
    field('supportSiteGroupingToleranceMm', 'Support-site grouping tolerance', 'number', 'mm'),
    field('autoCarrierCoincidenceToleranceMm', 'AUTO-carrier coincidence tolerance', 'number', 'mm'),
    field('routeJoiningRules', 'Route-joining rules', 'json', 'Topology'),
    field('supportTypeCapabilities', 'Support-type capability mapping', 'json', 'Loads'),
    field('pipingClassMappings', 'Approved piping-class mappings', 'json', 'Master matching'),
  ]),
  group('editing', 'Editing', [
    field('snapToleranceMm', 'Snap tolerance', 'number', 'mm'),
    field('connectionToleranceMm', 'Connection tolerance', 'number', 'mm'),
    field('dimensionSourcePrecedence', 'Dimension-source precedence', 'json', 'Editing'),
    field('componentCatalogSelection', 'Component catalog selection', 'json', 'Editing'),
  ]),
  group('loadCalculation', 'Load calculation', [
    field('gravityMPerS2', 'Gravity', 'number', 'm/s²'),
    field('loadFactor', 'Load factor', 'number', 'ratio'),
    field('materialDensitiesKgPerM3', 'Material densities', 'json', 'kg/m³'),
    field('pipeSectionProperties', 'Pipe section properties', 'json', 'Geometry and loads'),
    field('operatingFluidDensitiesKgPerM3', 'Operating fluid densities', 'json', 'kg/m³'),
    field('hydroFluidDensitiesKgPerM3', 'Hydro fluid densities', 'json', 'kg/m³'),
    field('insulationDensitiesKgPerM3', 'Insulation densities by code', 'json', 'kg/m³'),
    field('componentWeightsKg', 'Approved component weights', 'json', 'kg'),
    field('equilibriumTolerances', 'Equilibrium tolerances', 'json', 'Loads'),
    field('activeLoadCases', 'Active load cases', 'json', 'Loads'),
  ]),
  group('engineeringCalculationDefaults', 'Engineering calculation defaults', [
    field(
      'resolutionPolicy',
      'Resolution policy',
      'resolution-policy',
      'Fixed authority order. Values unresolved after the configured default stage block calculation.',
    ),
    field(
      'dimensionVerificationTolerancesMm',
      'Dimension verification tolerances',
      'dimension-tolerances',
      'Explicit OD and wall verification tolerances. No internal tolerance is permitted.',
    ),
    field(
      'configuredDefaults',
      'Configured default definitions',
      'configured-defaults',
      'Approved, scoped engineering defaults and their qualification basis.',
    ),
    field(
      'verticalContactScreening',
      'Vertical contact screening',
      'json',
      'Configurable retained-load model. A null or disabled record means the feature is not available.',
    ),
    field(
      'pDeltaScreening',
      'P-delta screening',
      'json',
      'Optional one-pass second-order screening configuration.',
    ),
    field(
      'solverTolerances',
      'Solver and equilibrium tolerances',
      'json',
      'Direct-solve, equilibrium, state-change, and reporting tolerances.',
    ),
    field(
      'applicabilityLimits',
      'Applicability limits',
      'json',
      'Qualified topology, temperature, restraint, support, and compression-ratio limits.',
    ),
    field(
      'reporting',
      'Reporting and fallback disclosure',
      'json',
      'Controls default-usage disclosure, raw-value retention, rounding, and blocked-result presentation.',
    ),
  ]),
  group('webglNavigation', 'WebGL and navigation', [
    field('supportMarkerSize', 'Support marker size', 'number', 'model units'),
    field('pickingRadius', 'Picking radius', 'number', 'model mm'),
    field('cameraFitMargin', 'Camera fit margin', 'number', 'ratio'),
    field('clickTimingMs', 'Click timing', 'number', 'ms'),
    field('doubleClickTimingMs', 'Double-click timing', 'number', 'ms'),
    field('clickTravelTolerancePx', 'Click travel tolerance', 'number', 'pixels'),
    field('zoomRate', 'Zoom rate', 'number', 'ratio'),
    field('navigationSensitivity', 'Navigation sensitivity', 'number', 'ratio'),
    field('perspectiveFovDeg', 'Perspective field of view', 'number', 'degrees'),
    field('meshRadialSegments', 'Round-mesh radial segments', 'number', 'count'),
    field('cameraNearMm', 'Camera near plane', 'number', 'model mm'),
    field('cameraFarMm', 'Camera far plane', 'number', 'model mm'),
  ]),
  group('benchmark', 'Benchmark acceptance', [
    field('targetBrowsers', 'Target browsers', 'json', 'Qualification'),
    field('webglReadyMaxMs', 'WebGL ready maximum', 'number', 'ms'),
    field('selectionP95MaxMs', 'Selection p95 maximum', 'number', 'ms'),
    field('editCommitMaxMs', 'Edit commit maximum', 'number', 'ms'),
    field('navigationMinFps', 'Navigation minimum', 'number', 'fps'),
  ]),
]);

export const PROJECT_DATA_REQUIREMENTS = Object.freeze({
  normalization: Object.freeze([
    'sourcesAndUnits.lengthUnit', 'sourcesAndUnits.sourceUpAxis',
    'sourcesAndUnits.coordinateTransform', 'sourcesAndUnits.datasetSource',
  ]),
  topology: Object.freeze([
    'topology.portMatchToleranceMm', 'topology.supportSiteGroupingToleranceMm',
    'topology.autoCarrierCoincidenceToleranceMm', 'topology.routeJoiningRules',
    'topology.supportTypeCapabilities',
  ]),
  editing: Object.freeze([
    'editing.snapToleranceMm', 'editing.connectionToleranceMm',
    'editing.dimensionSourcePrecedence', 'editing.componentCatalogSelection',
    'sourcesAndUnits.componentWeightSource',
  ]),
  loads: Object.freeze([
    'sourcesAndUnits.lineListSource', 'sourcesAndUnits.pipingClassSource',
    'sourcesAndUnits.componentWeightSource', 'loadCalculation.gravityMPerS2',
    'loadCalculation.loadFactor', 'loadCalculation.materialDensitiesKgPerM3',
    'loadCalculation.pipeSectionProperties',
    'loadCalculation.operatingFluidDensitiesKgPerM3',
    'loadCalculation.hydroFluidDensitiesKgPerM3',
    'loadCalculation.insulationDensitiesKgPerM3',
    'loadCalculation.componentWeightsKg', 'loadCalculation.equilibriumTolerances',
    'loadCalculation.activeLoadCases',
  ]),
  nonFeaPipingDefaults: Object.freeze([
    'engineeringCalculationDefaults.resolutionPolicy',
    'engineeringCalculationDefaults.dimensionVerificationTolerancesMm',
    'engineeringCalculationDefaults.configuredDefaults',
  ]),
  webgl: Object.freeze([
    'webglNavigation.supportMarkerSize', 'webglNavigation.pickingRadius',
    'webglNavigation.cameraFitMargin', 'webglNavigation.clickTimingMs',
    'webglNavigation.doubleClickTimingMs', 'webglNavigation.clickTravelTolerancePx', 'webglNavigation.zoomRate',
    'webglNavigation.navigationSensitivity',
    'webglNavigation.perspectiveFovDeg', 'webglNavigation.meshRadialSegments',
    'webglNavigation.cameraNearMm', 'webglNavigation.cameraFarMm',
  ]),
  benchmark: Object.freeze([
    'benchmark.targetBrowsers', 'benchmark.webglReadyMaxMs',
    'benchmark.selectionP95MaxMs', 'benchmark.editCommitMaxMs',
    'benchmark.navigationMinFps',
  ]),
});

function group(key, label, fields) {
  return Object.freeze({ key, label, fields: Object.freeze(fields) });
}

function field(key, label, inputType, usage) {
  return Object.freeze({ key, label, inputType, usage });
}
