import { DOFS } from './constants.js';
import { modelError } from './errors.js';
import { canonicalNumber, strictNumber } from './numeric.js';
import { convert } from './units.js';
import {
  arrayValue, codeUnitCompare, enumValue, exactRecord, nonEmptyString,
  uniqueIdentities,
} from './validation.js';

export function normalizeConstraints(values) {
  const rows = arrayValue(values, 'constraints').map((value, index) => {
    const path = `constraints[${index}]`;
    const row = exactRecord(
      value,
      ['constraintId', 'nodeId', 'dof', 'value', 'sourceReference'],
      path,
    );
    return {
      constraintId: nonEmptyString(row.constraintId, `${path}.constraintId`),
      nodeId: nonEmptyString(row.nodeId, `${path}.nodeId`),
      dof: enumValue(row.dof, DOFS, `${path}.dof`),
      value: strictNumber(row.value, `${path}.value`),
      sourceReference: nonEmptyString(row.sourceReference, `${path}.sourceReference`),
    };
  });
  uniqueIdentities(rows, 'constraintId', 'constraints');
  rejectDuplicateConstraintDofs(rows);
  return rows.sort((left, right) => codeUnitCompare(
    `${left.nodeId}\0${left.dof}\0${left.constraintId}`,
    `${right.nodeId}\0${right.dof}\0${right.constraintId}`,
  ));
}

function rejectDuplicateConstraintDofs(rows) {
  const dofs = new Map();
  rows.forEach((row) => {
    const key = `${row.nodeId}:${row.dof}`;
    if (dofs.has(key)) {
      const code = dofs.get(key) === row.value
        ? 'DUPLICATE_CONSTRAINT'
        : 'CONFLICTING_CONSTRAINT';
      throw modelError(code, 'constraints', `Multiple constraints target ${key}.`);
    }
    dofs.set(key, row.value);
  });
}

export function normalizeLoadCases(values) {
  const rows = arrayValue(values, 'loadCases').map((value, index) => {
    const path = `loadCases[${index}]`;
    const row = exactRecord(
      value,
      [
        'loadCaseId', 'nodalForces', 'edgeTractions', 'pressureLoads', 'bodyForces',
        'temperatureLoads', 'imposedDisplacements', 'sourceReference',
      ],
      path,
    );
    return {
      loadCaseId: nonEmptyString(row.loadCaseId, `${path}.loadCaseId`),
      nodalForces: normalizeForces(row.nodalForces, path),
      edgeTractions: normalizeTractions(row.edgeTractions, path),
      pressureLoads: normalizePressureLoads(row.pressureLoads, path),
      bodyForces: normalizeBodyForces(row.bodyForces, path),
      temperatureLoads: normalizeTemperatureLoads(row.temperatureLoads, path),
      imposedDisplacements: normalizeImposedDisplacements(row.imposedDisplacements, path),
      sourceReference: nonEmptyString(row.sourceReference, `${path}.sourceReference`),
    };
  });
  uniqueIdentities(rows, 'loadCaseId', 'loadCases');
  return rows.sort((left, right) => codeUnitCompare(left.loadCaseId, right.loadCaseId));
}

function normalizeForces(values, parent) {
  const rows = arrayValue(values, `${parent}.nodalForces`).map((value, index) => {
    const path = `${parent}.nodalForces[${index}]`;
    const row = exactRecord(
      value,
      ['loadId', 'nodeId', 'fx', 'fy', 'sourceReference'],
      path,
    );
    return {
      loadId: nonEmptyString(row.loadId, `${path}.loadId`),
      nodeId: nonEmptyString(row.nodeId, `${path}.nodeId`),
      fx: strictNumber(row.fx, `${path}.fx`),
      fy: strictNumber(row.fy, `${path}.fy`),
      sourceReference: nonEmptyString(row.sourceReference, `${path}.sourceReference`),
    };
  });
  uniqueIdentities(rows, 'loadId', `${parent}.nodalForces`);
  return rows.sort((left, right) => codeUnitCompare(left.loadId, right.loadId));
}

function normalizeTractions(values, parent) {
  const rows = arrayValue(values, `${parent}.edgeTractions`).map((value, index) => {
    const path = `${parent}.edgeTractions[${index}]`;
    const row = exactRecord(
      value,
      ['tractionId', 'elementId', 'edgeNodeIds', 'tx', 'ty', 'sourceReference'],
      path,
    );
    const edgeNodeIds = normalizeEdgeNodeIds(row.edgeNodeIds, path);
    return {
      tractionId: nonEmptyString(row.tractionId, `${path}.tractionId`),
      elementId: nonEmptyString(row.elementId, `${path}.elementId`),
      edgeNodeIds,
      tx: strictNumber(row.tx, `${path}.tx`),
      ty: strictNumber(row.ty, `${path}.ty`),
      sourceReference: nonEmptyString(row.sourceReference, `${path}.sourceReference`),
    };
  });
  uniqueIdentities(rows, 'tractionId', `${parent}.edgeTractions`);
  rejectDuplicatePhysicalEdges(rows, parent, `${parent}.edgeTractions`);
  return rows.sort((left, right) => codeUnitCompare(left.tractionId, right.tractionId));
}

/**
 * A physical edge is 2 node IDs (T3, straight) or 3 (T6/Q8, quadratic —
 * corner-midside-corner, order not yet known here). Full validation that the
 * declared set matches a real boundary edge (with its true node order)
 * happens later in `assembly.js`'s boundary-edge match.
 */
function normalizeEdgeNodeIds(value, path) {
  const edgeNodeIds = arrayValue(value, `${path}.edgeNodeIds`).map(
    (id, nodeIndex) => nonEmptyString(id, `${path}.edgeNodeIds[${nodeIndex}]`),
  );
  if (
    edgeNodeIds.length < 2 || edgeNodeIds.length > 3
    || new Set(edgeNodeIds).size !== edgeNodeIds.length
  ) {
    throw modelError(
      'EDGE_NODE_SET_REQUIRED',
      `${path}.edgeNodeIds`,
      'An edge load requires 2 (straight) or 3 (quadratic) distinct edge node IDs.',
    );
  }
  return [...edgeNodeIds].sort(codeUnitCompare);
}

function rejectDuplicatePhysicalEdges(rows, parent, path) {
  const edges = new Set();
  rows.forEach((row) => {
    const key = row.edgeNodeIds.join('\0');
    if (edges.has(key)) {
      throw modelError(
        'DUPLICATE_EDGE_LOAD',
        path ?? parent,
        `Duplicate physical-edge load ${key}.`,
      );
    }
    edges.add(key);
  });
}

function normalizePressureLoads(values, parent) {
  const rows = arrayValue(values, `${parent}.pressureLoads`).map((value, index) => {
    const path = `${parent}.pressureLoads[${index}]`;
    const row = exactRecord(
      value,
      ['pressureLoadId', 'elementId', 'edgeNodeIds', 'pressure', 'sourceReference'],
      path,
    );
    return {
      pressureLoadId: nonEmptyString(row.pressureLoadId, `${path}.pressureLoadId`),
      elementId: nonEmptyString(row.elementId, `${path}.elementId`),
      edgeNodeIds: normalizeEdgeNodeIds(row.edgeNodeIds, path),
      pressure: strictNumber(row.pressure, `${path}.pressure`),
      sourceReference: nonEmptyString(row.sourceReference, `${path}.sourceReference`),
    };
  });
  uniqueIdentities(rows, 'pressureLoadId', `${parent}.pressureLoads`);
  rejectDuplicatePhysicalEdges(rows, parent, `${parent}.pressureLoads`);
  return rows.sort((left, right) => codeUnitCompare(left.pressureLoadId, right.pressureLoadId));
}

function normalizeBodyForces(values, parent) {
  const rows = arrayValue(values, `${parent}.bodyForces`).map((value, index) => {
    const path = `${parent}.bodyForces[${index}]`;
    const row = exactRecord(
      value,
      ['bodyForceId', 'elementId', 'bx', 'by', 'sourceReference'],
      path,
    );
    return {
      bodyForceId: nonEmptyString(row.bodyForceId, `${path}.bodyForceId`),
      elementId: nonEmptyString(row.elementId, `${path}.elementId`),
      bx: strictNumber(row.bx, `${path}.bx`),
      by: strictNumber(row.by, `${path}.by`),
      sourceReference: nonEmptyString(row.sourceReference, `${path}.sourceReference`),
    };
  });
  uniqueIdentities(rows, 'bodyForceId', `${parent}.bodyForces`);
  return rows.sort((left, right) => codeUnitCompare(left.bodyForceId, right.bodyForceId));
}

function normalizeTemperatureLoads(values, parent) {
  const rows = arrayValue(values, `${parent}.temperatureLoads`).map((value, index) => {
    const path = `${parent}.temperatureLoads[${index}]`;
    const row = exactRecord(
      value,
      ['temperatureLoadId', 'elementId', 'thermalStrain', 'sourceReference'],
      path,
    );
    return {
      temperatureLoadId: nonEmptyString(row.temperatureLoadId, `${path}.temperatureLoadId`),
      elementId: nonEmptyString(row.elementId, `${path}.elementId`),
      thermalStrain: strictNumber(row.thermalStrain, `${path}.thermalStrain`),
      sourceReference: nonEmptyString(row.sourceReference, `${path}.sourceReference`),
    };
  });
  uniqueIdentities(rows, 'temperatureLoadId', `${parent}.temperatureLoads`);
  rejectDuplicateTemperatureElements(rows, parent);
  return rows.sort((left, right) => codeUnitCompare(left.temperatureLoadId, right.temperatureLoadId));
}

function rejectDuplicateTemperatureElements(rows, parent) {
  const elementIds = new Set();
  rows.forEach((row) => {
    if (elementIds.has(row.elementId)) {
      throw modelError(
        'DUPLICATE_TEMPERATURE_LOAD_ELEMENT',
        `${parent}.temperatureLoads`,
        `Multiple temperature loads target element ${row.elementId} in the same load case.`,
      );
    }
    elementIds.add(row.elementId);
  });
}

function normalizeImposedDisplacements(values, parent) {
  const rows = arrayValue(values, `${parent}.imposedDisplacements`).map((value, index) => {
    const path = `${parent}.imposedDisplacements[${index}]`;
    const row = exactRecord(
      value,
      ['imposedDisplacementId', 'nodeId', 'dof', 'value', 'sourceReference'],
      path,
    );
    return {
      imposedDisplacementId: nonEmptyString(row.imposedDisplacementId, `${path}.imposedDisplacementId`),
      nodeId: nonEmptyString(row.nodeId, `${path}.nodeId`),
      dof: enumValue(row.dof, DOFS, `${path}.dof`),
      value: strictNumber(row.value, `${path}.value`),
      sourceReference: nonEmptyString(row.sourceReference, `${path}.sourceReference`),
    };
  });
  uniqueIdentities(rows, 'imposedDisplacementId', `${parent}.imposedDisplacements`);
  rejectDuplicateImposedDisplacementDofs(rows, parent);
  return rows.sort((left, right) => codeUnitCompare(left.imposedDisplacementId, right.imposedDisplacementId));
}

function rejectDuplicateImposedDisplacementDofs(rows, parent) {
  const dofs = new Set();
  rows.forEach((row) => {
    const key = `${row.nodeId}:${row.dof}`;
    if (dofs.has(key)) {
      throw modelError(
        'DUPLICATE_IMPOSED_DISPLACEMENT',
        `${parent}.imposedDisplacements`,
        `Multiple imposed displacements target ${key} in the same load case.`,
      );
    }
    dofs.add(key);
  });
}

export function normalizeRequests(value, loadCases) {
  const row = exactRecord(value, ['loadCaseIds'], 'resultRequests');
  const ids = arrayValue(row.loadCaseIds, 'resultRequests.loadCaseIds').map(
    (id, index) => nonEmptyString(id, `resultRequests.loadCaseIds[${index}]`),
  );
  if (ids.length === 0) {
    throw modelError(
      'LOAD_CASE_REQUEST_REQUIRED',
      'resultRequests.loadCaseIds',
      'At least one load case must be requested.',
    );
  }
  if (new Set(ids).size !== ids.length) {
    throw modelError(
      'DUPLICATE_LOAD_CASE_REQUEST',
      'resultRequests.loadCaseIds',
      'Requested load cases must be unique.',
    );
  }
  const known = new Set(loadCases.map((item) => item.loadCaseId));
  ids.forEach((id) => {
    if (!known.has(id)) {
      throw modelError(
        'UNRESOLVED_LOAD_CASE_REQUEST',
        'resultRequests.loadCaseIds',
        `Unknown load case ${id}.`,
      );
    }
  });
  return { loadCaseIds: ids.sort(codeUnitCompare) };
}

export function validateReferences(context) {
  const materials = new Set(context.materials.map((row) => row.materialId));
  const nodes = new Set(context.nodes.map((row) => row.nodeId));
  const elements = new Map(context.elements.map((row) => [row.elementId, row]));
  context.elements.forEach((row) => {
    if (!materials.has(row.materialId)) {
      throw modelError(
        'UNRESOLVED_MATERIAL_REFERENCE',
        `elements.${row.elementId}.materialId`,
        `Unknown material ${row.materialId}.`,
      );
    }
  });
  rejectUnreferencedNodes(context.nodes, context.elements);
  context.constraints.forEach((row) => {
    if (!nodes.has(row.nodeId)) {
      throw modelError(
        'UNRESOLVED_CONSTRAINT_NODE',
        `constraints.${row.constraintId}`,
        `Unknown node ${row.nodeId}.`,
      );
    }
  });
  const constrainedDofs = new Set(context.constraints.map((row) => `${row.nodeId}:${row.dof}`));
  context.loadCases.forEach((loadCase) => (
    validateLoadReferences(loadCase, nodes, elements, constrainedDofs)
  ));
}

function rejectUnreferencedNodes(nodes, elements) {
  const referenced = new Set(elements.flatMap((row) => row.nodeIds));
  nodes.forEach((row) => {
    if (!referenced.has(row.nodeId)) {
      throw modelError(
        'DISCONNECTED_UNREFERENCED_NODE',
        `nodes.${row.nodeId}`,
        `Node ${row.nodeId} is not referenced by any element.`,
      );
    }
  });
}

function validateLoadReferences(loadCase, nodes, elements, constrainedDofs) {
  loadCase.nodalForces.forEach((row) => {
    if (!nodes.has(row.nodeId)) {
      throw modelError(
        'UNRESOLVED_FORCE_NODE',
        `loadCases.${loadCase.loadCaseId}.${row.loadId}`,
        `Unknown node ${row.nodeId}.`,
      );
    }
  });
  loadCase.edgeTractions.forEach((row) => validateEdgeElementReference(
    loadCase.loadCaseId, row.tractionId, row.elementId, row.edgeNodeIds, elements, 'TRACTION',
  ));
  loadCase.pressureLoads.forEach((row) => validateEdgeElementReference(
    loadCase.loadCaseId, row.pressureLoadId, row.elementId, row.edgeNodeIds, elements, 'PRESSURE_LOAD',
  ));
  loadCase.bodyForces.forEach((row) => validateElementReference(
    loadCase.loadCaseId, row.bodyForceId, row.elementId, elements, 'UNRESOLVED_BODY_FORCE_ELEMENT',
  ));
  loadCase.temperatureLoads.forEach((row) => validateElementReference(
    loadCase.loadCaseId, row.temperatureLoadId, row.elementId, elements, 'UNRESOLVED_TEMPERATURE_LOAD_ELEMENT',
  ));
  loadCase.imposedDisplacements.forEach((row) => {
    if (!nodes.has(row.nodeId)) {
      throw modelError(
        'UNRESOLVED_IMPOSED_DISPLACEMENT_NODE',
        `loadCases.${loadCase.loadCaseId}.${row.imposedDisplacementId}`,
        `Unknown node ${row.nodeId}.`,
      );
    }
    const key = `${row.nodeId}:${row.dof}`;
    if (constrainedDofs.has(key)) {
      throw modelError(
        'IMPOSED_DISPLACEMENT_CONFLICTS_WITH_MODEL_CONSTRAINT',
        `loadCases.${loadCase.loadCaseId}.${row.imposedDisplacementId}`,
        `DOF ${key} is already a model-level constraint; an imposed displacement must target a DOF the model itself leaves free.`,
      );
    }
  });
}

function validateElementReference(loadCaseId, loadId, elementId, elements, code) {
  if (!elements.has(elementId)) {
    throw modelError(code, `loadCases.${loadCaseId}.${loadId}`, `Unknown element ${elementId}.`);
  }
}

function validateEdgeElementReference(loadCaseId, loadId, elementId, edgeNodeIds, elements, kind) {
  const element = elements.get(elementId);
  if (!element) {
    throw modelError(
      `UNRESOLVED_${kind}_ELEMENT`,
      `loadCases.${loadCaseId}.${loadId}`,
      `Unknown element ${elementId}.`,
    );
  }
  if (!edgeNodeIds.every((id) => element.nodeIds.includes(id))) {
    throw modelError(
      `${kind}_EDGE_NOT_ON_ELEMENT`,
      `loadCases.${loadCaseId}.${loadId}`,
      'Edge load must belong to the declared element.',
    );
  }
}

export function canonicalConstraint(row, units) {
  return {
    ...row,
    value: convert(
      row.value,
      'length',
      units,
      `constraints.${row.constraintId}.value`,
    ),
    sourceUnit: units.declared.length,
    canonicalUnit: units.canonical.length,
  };
}

export function canonicalLoadCase(row, units) {
  return {
    ...row,
    nodalForces: row.nodalForces.map((force) => canonicalForce(row, force, units)),
    edgeTractions: row.edgeTractions.map((traction) => (
      canonicalTraction(row, traction, units)
    )),
    pressureLoads: row.pressureLoads.map((pressure) => canonicalPressureLoad(row, pressure, units)),
    bodyForces: row.bodyForces.map((bodyForce) => canonicalBodyForce(row, bodyForce, units)),
    temperatureLoads: row.temperatureLoads.map((temperature) => canonicalTemperatureLoad(temperature)),
    imposedDisplacements: row.imposedDisplacements.map((imposed) => (
      canonicalImposedDisplacement(row, imposed, units)
    )),
  };
}

function canonicalForce(loadCase, force, units) {
  const prefix = `loadCases.${loadCase.loadCaseId}.${force.loadId}`;
  return {
    ...force,
    fx: convert(force.fx, 'force', units, `${prefix}.fx`),
    fy: convert(force.fy, 'force', units, `${prefix}.fy`),
    sourceUnit: units.declared.force,
    canonicalUnit: units.canonical.force,
  };
}

function canonicalTraction(loadCase, traction, units) {
  const prefix = `loadCases.${loadCase.loadCaseId}.${traction.tractionId}`;
  return {
    ...traction,
    tx: convert(traction.tx, 'stress', units, `${prefix}.tx`),
    ty: convert(traction.ty, 'stress', units, `${prefix}.ty`),
    sourceUnit: units.declared.stress,
    canonicalUnit: units.canonical.stress,
  };
}

function canonicalPressureLoad(loadCase, pressureLoad, units) {
  const prefix = `loadCases.${loadCase.loadCaseId}.${pressureLoad.pressureLoadId}`;
  return {
    ...pressureLoad,
    pressure: convert(pressureLoad.pressure, 'stress', units, `${prefix}.pressure`),
    sourceUnit: units.declared.stress,
    canonicalUnit: units.canonical.stress,
  };
}

function canonicalBodyForce(loadCase, bodyForce, units) {
  const prefix = `loadCases.${loadCase.loadCaseId}.${bodyForce.bodyForceId}`;
  return {
    ...bodyForce,
    bx: convert(bodyForce.bx, 'bodyForceIntensity', units, `${prefix}.bx`),
    by: convert(bodyForce.by, 'bodyForceIntensity', units, `${prefix}.by`),
    sourceUnit: `${units.declared.stress}/${units.declared.length}`,
    canonicalUnit: units.canonical.bodyForceIntensity,
  };
}

function canonicalTemperatureLoad(temperatureLoad) {
  return {
    ...temperatureLoad,
    thermalStrain: canonicalNumber(temperatureLoad.thermalStrain, 'thermal strain'),
    sourceUnit: 'dimensionless',
    canonicalUnit: 'dimensionless',
  };
}

function canonicalImposedDisplacement(loadCase, imposed, units) {
  const prefix = `loadCases.${loadCase.loadCaseId}.${imposed.imposedDisplacementId}`;
  return {
    ...imposed,
    value: convert(imposed.value, 'length', units, `${prefix}.value`),
    sourceUnit: units.declared.length,
    canonicalUnit: units.canonical.length,
  };
}
