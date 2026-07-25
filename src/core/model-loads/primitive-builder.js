import { deepFreeze, semanticHash } from '../shared-piping-model/index.js';
import { GRAVITY_DIRECTION, MODEL_LOAD_PRIMITIVE_SET_SCHEMA, PRIMITIVE_TYPES } from './constants.js';
import { massToWeightForce } from './formulas.js';
import { resolveComponentCaseMass } from './component-mass-resolver.js';

export function buildModelLoadPrimitiveSet(projection, loadCaseSet, gravityProfile, compositionProfile) {
  const state = { primitives: [], componentOutcomes: [] };
  loadCaseSet.loadCases.forEach((loadCase) => buildCase(projection.components, loadCase, gravityProfile, compositionProfile, state));
  const primitives = state.primitives.sort((left, right) => left.primitiveId.localeCompare(right.primitiveId));
  const componentOutcomes = state.componentOutcomes.sort(outcomeOrder);
  const base = {
    schema: MODEL_LOAD_PRIMITIVE_SET_SCHEMA,
    datasetId: projection.datasetId,
    loadCaseSetSemanticHash: loadCaseSet.semanticHash,
    sourceProjectionSemanticHash: projection.semanticHash,
    gravityProfile,
    compositionProfile,
    primitives,
    componentOutcomes,
    summary: primitiveSummary(primitives),
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateModelLoadPrimitiveSet(value) {
  const errors = [];
  if (value?.schema !== MODEL_LOAD_PRIMITIVE_SET_SCHEMA) errors.push('Invalid model-load primitive-set schema.');
  const ids = (value?.primitives || []).map((row) => row.primitiveId);
  if (new Set(ids).size !== ids.length) errors.push('Primitive IDs must be unique.');
  if ((value?.primitives || []).some((row) => row.globalVector !== null && row.primitiveType !== PRIMITIVE_TYPES.MOMENT)) {
    errors.push('Gravity primitives must not contain global vectors.');
  }
  if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('Primitive-set semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function buildCase(components, loadCase, gravity, composition, state) {
  components.forEach((component) => {
    const result = resolveComponentCaseMass(component, loadCase.loadCaseId, composition);
    state.componentOutcomes.push(outcome(component, loadCase, result));
    const moment = explicitMomentPrimitive(component, loadCase);
    if (moment) state.primitives.push(moment);
    if (!result.ok) return;
    if (result.mode === 'DISTRIBUTED') state.primitives.push(distributedPrimitive(component, loadCase, result, gravity));
    if (result.mode === 'POINT') state.primitives.push(pointPrimitive(component, loadCase, result, gravity));
  });
}

function distributedPrimitive(component, loadCase, result, gravity) {
  const force = massToWeightForce(result.massPerLengthKgM, gravity, true, result.massSourceBreakdown.map((row) => row.sourceEvidence).filter(Boolean));
  return deepFreeze({
    primitiveId: primitiveId(loadCase.loadCaseId, component.componentKey, 'distributed'),
    loadCaseId: loadCase.loadCaseId,
    componentKey: component.componentKey,
    primitiveType: PRIMITIVE_TYPES.DISTRIBUTED,
    startPoint: component.geometry.start,
    endPoint: component.geometry.end,
    sourceLengthM: component.geometry.sourceLengthM,
    massPerLengthKgM: result.massPerLengthKgM,
    forcePerLengthNM: force.value,
    semanticDirection: GRAVITY_DIRECTION,
    globalVector: null,
    massSourceBreakdown: result.massSourceBreakdown,
    formulaTrace: [...result.formulaTrace, force.trace],
    sourceEvidence: component.sourceReferences,
    diagnostics: result.diagnostics || [],
  });
}

function pointPrimitive(component, loadCase, result, gravity) {
  const force = massToWeightForce(result.pointMassKg, gravity, false, [result.sourceEvidence].filter(Boolean));
  return deepFreeze({
    primitiveId: primitiveId(loadCase.loadCaseId, component.componentKey, 'point'),
    loadCaseId: loadCase.loadCaseId,
    componentKey: component.componentKey,
    primitiveType: PRIMITIVE_TYPES.POINT,
    applicationPoint: result.applicationPoint,
    pointMassKg: result.pointMassKg,
    pointForceN: force.value,
    semanticDirection: GRAVITY_DIRECTION,
    globalVector: null,
    formulaTrace: [force.trace],
    sourceEvidence: result.sourceEvidence || null,
    diagnostics: result.diagnostics || [],
  });
}

function explicitMomentPrimitive(component, loadCase) {
  const moment = Number(component.loadEvidence?.explicitPointMomentNm?.value);
  const axis = component.loadEvidence?.momentAxis?.value;
  const applicationPoint = component.geometry.applicationPoint;
  if (!Number.isFinite(moment) || moment < 0 || !axis || !applicationPoint) return null;
  return deepFreeze({
    primitiveId: primitiveId(loadCase.loadCaseId, component.componentKey, 'moment'),
    loadCaseId: loadCase.loadCaseId,
    componentKey: component.componentKey,
    primitiveType: PRIMITIVE_TYPES.MOMENT,
    applicationPoint,
    momentMagnitudeNm: moment,
    axisEvidence: component.loadEvidence.momentAxis,
    globalVector: null,
    sourceEvidence: component.loadEvidence.explicitPointMomentNm,
    diagnostics: [],
  });
}

function outcome(component, loadCase, result) {
  return deepFreeze({
    loadCaseId: loadCase.loadCaseId,
    componentKey: component.componentKey,
    ready: result.ok,
    mode: result.ok ? result.mode : null,
    blockers: result.ok ? [] : result.blockers,
    diagnostics: result.diagnostics || [],
  });
}

function primitiveSummary(primitives) {
  return {
    primitiveCount: primitives.length,
    distributedPrimitiveCount: primitives.filter((row) => row.primitiveType === PRIMITIVE_TYPES.DISTRIBUTED).length,
    pointPrimitiveCount: primitives.filter((row) => row.primitiveType === PRIMITIVE_TYPES.POINT).length,
    explicitMomentCount: primitives.filter((row) => row.primitiveType === PRIMITIVE_TYPES.MOMENT).length,
  };
}
function primitiveId(caseId, componentKey, suffix) { return `load-primitive:${caseId}:${componentKey}:${suffix}`; }
function outcomeOrder(left, right) { return `${left.loadCaseId}\0${left.componentKey}`.localeCompare(`${right.loadCaseId}\0${right.componentKey}`); }
function withoutHash(value) { const { semanticHash: _semanticHash, ...rest } = value || {}; return rest; }
