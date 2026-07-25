import { END_CONDITIONS, FORMULA_IDS, PRESSURE_LIMITATIONS } from './constants.js';
import { modelError, unsupportedError } from './errors.js';
import { canonicalNumber, toleranceFor } from './numeric.js';
const PRESSURE_WALL_BASIS = 'ASSESSMENT_PIPE_THICKNESS_ONLY';
export function calculateRequestedPressureResults(model) {
  const definitions = new Map(model.pressureDefinitions.map((row) => [row.identity, row]));
  return model.resultRequests.pressure.map((request) => calculatePressure(model, definitions.get(request.pressureDefinitionIdentity), request));
}
export function calculatePressure(model, definition, request) {
  validatePressureRequest(model, definition, request);
  const state = pressureState(model, definition);
  const points = request.requestedRadii.map((radius) => pressurePoint(radius.value, state.ri, state.ro, state.a, state.b, model));
  const inner = pressurePoint(state.ri, state.ri, state.ro, state.a, state.b, model);
  const outer = pressurePoint(state.ro, state.ri, state.ro, state.a, state.b, model);
  const boundaryEvidence = boundaryAssessment(model, definition, inner, outer);
  const axial = axialEvidence(definition, request.includeAxialPressureStress, state.a);
  const result = pressureResult(model, definition, request, state, points, boundaryEvidence, axial);
  if (request.includeThinWallComparison) addThinWallComparison(result, state);
  result.formulaIds.sort();
  return result;
}
function validatePressureRequest(model, definition, request) {
  if (!definition) throw modelError('PRESSURE_DEFINITION_MISSING', request.identity, 'Pressure definition is missing.');
  if (model.thicknessBasis.pressureWallBasis !== PRESSURE_WALL_BASIS) {
    throw modelError('PRESSURE_WALL_BASIS_INVALID', 'thicknessBasis.pressureWallBasis', 'Pressure must use assessment pipe thickness only.');
  }
  if (definition.endCondition === END_CONDITIONS.UNSPECIFIED && request.includeAxialPressureStress) {
    throw unsupportedError('UNSPECIFIED_AXIAL_PRESSURE_REQUEST', request.identity, 'Axial pressure stress requires a declared end condition.');
  }
}
function pressureState(model, definition) {
  const ro = canonicalNumber(model.pipeGeometry.outsideDiameter.value / 2, 'outer radius');
  const t = model.thicknessBasis.assessmentPipeThickness.value;
  const ri = canonicalNumber(ro - t, 'inner radius');
  if (!(ri > 0 && ro > ri)) throw modelError('INVALID_PIPE_RADII', 'pipeGeometry', 'Pipe radii are invalid.');
  const pi = definition.internalPressure.value;
  const po = definition.externalPressure.value;
  const denominator = canonicalNumber(ro ** 2 - ri ** 2, 'Lamé denominator');
  const a = canonicalNumber((pi * ri ** 2 - po * ro ** 2) / denominator, 'Lamé A');
  const b = canonicalNumber(((pi - po) * ri ** 2 * ro ** 2) / denominator, 'Lamé B');
  return { ro, t, ri, pi, po, a, b };
}
function pressureResult(model, definition, request, state, points, boundaryEvidence, axial) {
  return {
    identity: request.identity,
    pressureDefinitionIdentity: definition.identity,
    innerRadius: state.ri,
    outerRadius: state.ro,
    assessmentPipeThickness: state.t,
    pressureWallBasis: PRESSURE_WALL_BASIS,
    internalPressure: state.pi,
    externalPressure: state.po,
    coefficientA: state.a,
    coefficientB: state.b,
    requestedPoints: points,
    boundaryEvidence,
    endCondition: definition.endCondition,
    axialPressureStress: axial.axialPressureStress,
    explicitAxialResultant: axial.explicitAxialResultant,
    limitations: state.po > 0 ? PRESSURE_LIMITATIONS : ['ELASTIC_PRESSURE_STRESS_ONLY'],
    sourceReferences: pressureSourceReferences(model, definition),
    formulaIds: baseFormulaIds(axial),
  };
}
function pressureSourceReferences(model, definition) {
  return {
    internalPressure: definition.internalPressure.sourceRef,
    externalPressure: definition.externalPressure.sourceRef,
    assessmentPipeThickness: model.thicknessBasis.assessmentPipeThickness.sourceRef,
  };
}
function baseFormulaIds(axial) {
  return [FORMULA_IDS.LAME_A, FORMULA_IDS.LAME_B, FORMULA_IDS.RADIAL_STRESS, FORMULA_IDS.HOOP_STRESS, FORMULA_IDS.PRESSURE_BOUNDARY, ...axial.formulaIds];
}
function addThinWallComparison(result, state) {
  result.thinWallComparison = thinWallComparison(state.pi, state.po, state.ri, state.ro, state.t);
  result.formulaIds.push(FORMULA_IDS.THIN_WALL_COMPARISON);
}
function pressurePoint(radius, ri, ro, a, b, model) {
  const tolerance = toleranceFor(model.qualificationProfile, 'length', radius, ri, ro);
  if (radius < ri - tolerance || radius > ro + tolerance) {
    throw modelError('REQUESTED_RADIUS_OUTSIDE_WALL', 'resultRequests.pressure.requestedRadii', 'Requested radius lies outside the pipe wall.');
  }
  const clamped = Math.abs(radius - ri) <= tolerance ? ri : Math.abs(radius - ro) <= tolerance ? ro : radius;
  return {
    radius: canonicalNumber(clamped, 'requested radius'),
    radialStress: canonicalNumber(a - b / clamped ** 2, 'radial stress'),
    hoopStress: canonicalNumber(a + b / clamped ** 2, 'hoop stress'),
  };
}
function boundaryAssessment(model, definition, inner, outer) {
  const innerExpected = canonicalNumber(-definition.internalPressure.value, 'inner expected pressure');
  const outerExpected = canonicalNumber(-definition.externalPressure.value, 'outer expected pressure');
  const innerResidual = canonicalNumber(inner.radialStress - innerExpected, 'inner boundary residual');
  const outerResidual = canonicalNumber(outer.radialStress - outerExpected, 'outer boundary residual');
  const innerTolerance = toleranceFor(model.qualificationProfile, 'stress', inner.radialStress, innerExpected);
  const outerTolerance = toleranceFor(model.qualificationProfile, 'stress', outer.radialStress, outerExpected);
  const accepted = Math.abs(innerResidual) <= innerTolerance && Math.abs(outerResidual) <= outerTolerance;
  if (!accepted) throw modelError('PRESSURE_BOUNDARY_FAILURE', definition.identity, 'Lamé pressure boundaries did not qualify.');
  return { innerExpected, outerExpected, innerResidual, outerResidual, innerTolerance, outerTolerance, accepted };
}
function axialEvidence(definition, requested, a) {
  if (!requested) return { axialPressureStress: null, explicitAxialResultant: definition.explicitAxialResultant?.value ?? null, formulaIds: [] };
  if (definition.endCondition === END_CONDITIONS.CLOSED_END) return { axialPressureStress: a, explicitAxialResultant: null, formulaIds: [FORMULA_IDS.CLOSED_END_AXIAL] };
  if (definition.endCondition === END_CONDITIONS.OPEN_END) return { axialPressureStress: 0, explicitAxialResultant: null, formulaIds: [FORMULA_IDS.OPEN_END_AXIAL] };
  if (definition.endCondition === END_CONDITIONS.EXPLICIT_AXIAL_RESULTANT) return { axialPressureStress: null, explicitAxialResultant: definition.explicitAxialResultant.value, formulaIds: [FORMULA_IDS.EXPLICIT_AXIAL] };
  return { axialPressureStress: null, explicitAxialResultant: null, formulaIds: [] };
}
function thinWallComparison(pi, po, ri, ro, thickness) {
  const meanRadius = canonicalNumber((ri + ro) / 2, 'mean radius');
  return {
    authority: 'NON_AUTHORITATIVE_COMPARISON_ONLY',
    differentialPressure: canonicalNumber(pi - po, 'differential pressure'),
    meanRadius,
    hoopStress: canonicalNumber((pi - po) * meanRadius / thickness, 'thin-wall hoop stress'),
  };
}
