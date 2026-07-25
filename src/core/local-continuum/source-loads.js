import { DOFS } from './constants.js';
import { modelError } from './errors.js';
import { strictNumber } from './numeric.js';
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
      ['loadCaseId', 'nodalForces', 'edgeTractions', 'sourceReference'],
      path,
    );
    return {
      loadCaseId: nonEmptyString(row.loadCaseId, `${path}.loadCaseId`),
      nodalForces: normalizeForces(row.nodalForces, path),
      edgeTractions: normalizeTractions(row.edgeTractions, path),
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
    const edgeNodeIds = arrayValue(row.edgeNodeIds, `${path}.edgeNodeIds`).map(
      (id, nodeIndex) => nonEmptyString(id, `${path}.edgeNodeIds[${nodeIndex}]`),
    );
    if (edgeNodeIds.length !== 2 || edgeNodeIds[0] === edgeNodeIds[1]) {
      throw modelError(
        'EDGE_NODE_PAIR_REQUIRED',
        `${path}.edgeNodeIds`,
        'A traction requires two distinct edge node IDs.',
      );
    }
    return {
      tractionId: nonEmptyString(row.tractionId, `${path}.tractionId`),
      elementId: nonEmptyString(row.elementId, `${path}.elementId`),
      edgeNodeIds: [...edgeNodeIds].sort(codeUnitCompare),
      tx: strictNumber(row.tx, `${path}.tx`),
      ty: strictNumber(row.ty, `${path}.ty`),
      sourceReference: nonEmptyString(row.sourceReference, `${path}.sourceReference`),
    };
  });
  uniqueIdentities(rows, 'tractionId', `${parent}.edgeTractions`);
  rejectDuplicatePhysicalEdges(rows, parent);
  return rows.sort((left, right) => codeUnitCompare(left.tractionId, right.tractionId));
}

function rejectDuplicatePhysicalEdges(rows, parent) {
  const edges = new Set();
  rows.forEach((row) => {
    const key = row.edgeNodeIds.join('\0');
    if (edges.has(key)) {
      throw modelError(
        'DUPLICATE_EDGE_TRACTION',
        parent,
        `Duplicate physical-edge traction ${key}.`,
      );
    }
    edges.add(key);
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
  context.loadCases.forEach((loadCase) => (
    validateLoadReferences(loadCase, nodes, elements)
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

function validateLoadReferences(loadCase, nodes, elements) {
  loadCase.nodalForces.forEach((row) => {
    if (!nodes.has(row.nodeId)) {
      throw modelError(
        'UNRESOLVED_FORCE_NODE',
        `loadCases.${loadCase.loadCaseId}.${row.loadId}`,
        `Unknown node ${row.nodeId}.`,
      );
    }
  });
  loadCase.edgeTractions.forEach((row) => validateTractionReference(
    loadCase.loadCaseId,
    row,
    elements,
  ));
}

function validateTractionReference(loadCaseId, traction, elements) {
  const element = elements.get(traction.elementId);
  if (!element) {
    throw modelError(
      'UNRESOLVED_TRACTION_ELEMENT',
      `loadCases.${loadCaseId}.${traction.tractionId}`,
      `Unknown element ${traction.elementId}.`,
    );
  }
  if (!traction.edgeNodeIds.every((id) => element.nodeIds.includes(id))) {
    throw modelError(
      'TRACTION_EDGE_NOT_ON_ELEMENT',
      `loadCases.${loadCaseId}.${traction.tractionId}`,
      'Traction edge must belong to the declared element.',
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
