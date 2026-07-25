import {
  CANONICAL_UNITS,
  DOFS,
  FORMULATION,
  PRESSURE_SENSES,
  RESULT_REQUEST,
} from './constants.js';
import { ShellModelError } from './errors.js';
import { positiveNumber, finiteNumber } from './numeric.js';
import {
  exactKeys,
  fixedVector,
  member,
  nonEmptyString,
  stringArray,
  uniqueBy,
} from './validation.js';
import { codeUnitCompare } from './json.js';

export function canonicalUnits(source) {
  exactKeys(source, Object.keys(CANONICAL_UNITS), 'units');
  const result = {};
  for (const [field, expected] of Object.entries(CANONICAL_UNITS)) {
    if (source[field] !== expected) throw new ShellModelError(`units.${field} must be ${expected}`);
    result[field] = expected;
  }
  return result;
}

export function canonicalMaterial(source) {
  exactKeys(source, ['materialId', 'elasticModulus', 'poissonRatio', 'sourceReference'], 'material');
  const elasticModulus = positiveNumber(source.elasticModulus, 'material.elasticModulus');
  const poissonRatio = finiteNumber(source.poissonRatio, 'material.poissonRatio');
  if (!(poissonRatio > -1 && poissonRatio < 0.5)) throw new ShellModelError('material.poissonRatio must satisfy -1 < nu < 0.5');
  return {
    materialId: nonEmptyString(source.materialId, 'material.materialId'),
    elasticModulus,
    poissonRatio,
    sourceReference: nonEmptyString(source.sourceReference, 'material.sourceReference'),
  };
}

export function canonicalNode(source) {
  exactKeys(source, ['nodeId', 'position', 'director', 'rotationBasis1', 'rotationBasis2', 'sourceReference'], 'node');
  return {
    nodeId: nonEmptyString(source.nodeId, 'node.nodeId'),
    position: fixedVector(source.position, 3, 'node.position'),
    director: fixedVector(source.director, 3, 'node.director'),
    rotationBasis1: fixedVector(source.rotationBasis1, 3, 'node.rotationBasis1'),
    rotationBasis2: fixedVector(source.rotationBasis2, 3, 'node.rotationBasis2'),
    sourceReference: nonEmptyString(source.sourceReference, 'node.sourceReference'),
  };
}

export function canonicalElement(source) {
  exactKeys(source, ['elementId', 'nodeIds', 'materialId', 'thickness', 'sourceReference'], 'element');
  const nodeIds = stringArray(source.nodeIds, 'element.nodeIds');
  if (nodeIds.length !== 3 || new Set(nodeIds).size !== 3) throw new ShellModelError('element.nodeIds must contain three unique node IDs');
  return {
    elementId: nonEmptyString(source.elementId, 'element.elementId'),
    nodeIds,
    materialId: nonEmptyString(source.materialId, 'element.materialId'),
    thickness: positiveNumber(source.thickness, 'element.thickness'),
    sourceReference: nonEmptyString(source.sourceReference, 'element.sourceReference'),
  };
}

export function canonicalConstraint(source) {
  exactKeys(source, ['constraintId', 'nodeId', 'dof', 'value', 'sourceReference'], 'constraint');
  return {
    constraintId: nonEmptyString(source.constraintId, 'constraint.constraintId'),
    nodeId: nonEmptyString(source.nodeId, 'constraint.nodeId'),
    dof: member(source.dof, DOFS, 'constraint.dof'),
    value: finiteNumber(source.value, 'constraint.value'),
    sourceReference: nonEmptyString(source.sourceReference, 'constraint.sourceReference'),
  };
}

export function canonicalNodalLoad(source) {
  exactKeys(source, ['loadId', 'nodeId', 'fx', 'fy', 'fz', 'm1', 'm2', 'sourceReference'], 'nodalLoad');
  return {
    loadId: nonEmptyString(source.loadId, 'nodalLoad.loadId'),
    nodeId: nonEmptyString(source.nodeId, 'nodalLoad.nodeId'),
    fx: finiteNumber(source.fx, 'nodalLoad.fx'),
    fy: finiteNumber(source.fy, 'nodalLoad.fy'),
    fz: finiteNumber(source.fz, 'nodalLoad.fz'),
    m1: finiteNumber(source.m1, 'nodalLoad.m1'),
    m2: finiteNumber(source.m2, 'nodalLoad.m2'),
    sourceReference: nonEmptyString(source.sourceReference, 'nodalLoad.sourceReference'),
  };
}

export function canonicalPressureLoad(source) {
  exactKeys(source, ['pressureLoadId', 'elementId', 'pressure', 'sense', 'sourceReference'], 'pressureLoad');
  const pressure = finiteNumber(source.pressure, 'pressureLoad.pressure');
  if (pressure < 0) throw new ShellModelError('pressureLoad.pressure must be non-negative; sense carries direction');
  return {
    pressureLoadId: nonEmptyString(source.pressureLoadId, 'pressureLoad.pressureLoadId'),
    elementId: nonEmptyString(source.elementId, 'pressureLoad.elementId'),
    pressure,
    sense: member(source.sense, PRESSURE_SENSES, 'pressureLoad.sense'),
    sourceReference: nonEmptyString(source.sourceReference, 'pressureLoad.sourceReference'),
  };
}

export function canonicalLoadCase(source) {
  exactKeys(source, ['loadCaseId', 'nodalLoads', 'pressureLoads', 'sourceReference'], 'loadCase');
  if (!Array.isArray(source.nodalLoads) || !Array.isArray(source.pressureLoads)) throw new ShellModelError('loadCase loads must be arrays');
  const nodalLoads = source.nodalLoads.map(canonicalNodalLoad).sort(by('loadId'));
  const pressureLoads = source.pressureLoads.map(canonicalPressureLoad).sort(by('pressureLoadId'));
  uniqueBy(nodalLoads, 'loadId', 'loadId');
  uniqueBy(pressureLoads, 'pressureLoadId', 'pressureLoadId');
  uniqueBy(pressureLoads, 'elementId', 'pressure application on element');
  return {
    loadCaseId: nonEmptyString(source.loadCaseId, 'loadCase.loadCaseId'),
    nodalLoads,
    pressureLoads,
    sourceReference: nonEmptyString(source.sourceReference, 'loadCase.sourceReference'),
  };
}

export function canonicalResultRequests(source) {
  exactKeys(source, ['stressSurfaces', 'dktIntegrationRule', 'retainElementMatrices'], 'resultRequests');
  const surfaces = stringArray(source.stressSurfaces, 'resultRequests.stressSurfaces').sort(codeUnitCompare);
  const expected = [...RESULT_REQUEST.stressSurfaces].sort(codeUnitCompare);
  if (JSON.stringify(surfaces) !== JSON.stringify(expected)) throw new ShellModelError('resultRequests.stressSurfaces must request all three fixed surfaces');
  if (source.dktIntegrationRule !== RESULT_REQUEST.dktIntegrationRule) throw new ShellModelError('Unsupported DKT integration rule');
  if (source.retainElementMatrices !== true) throw new ShellModelError('resultRequests.retainElementMatrices must be true');
  return { stressSurfaces: surfaces, dktIntegrationRule: source.dktIntegrationRule, retainElementMatrices: true };
}

export function canonicalFormulation(value) {
  if (value !== FORMULATION) throw new ShellModelError(`formulation must be ${FORMULATION}`);
  return value;
}

function by(field) {
  return (left, right) => codeUnitCompare(left[field], right[field]);
}
