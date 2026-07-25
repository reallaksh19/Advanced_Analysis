import { deepFreeze } from '../shared-piping-model/immutable.js';
import { ELEMENT_TYPES, FORMULATIONS } from './constants.js';
import { constitutiveMatrix, principalStress, recoverSigmaZ, vonMisesStress } from './constitutive.js';
import { multiplyMatrixVector } from './matrix.js';
import { createQ4PointGeometry, q4ShapeFunctions } from './q4-geometry.js';
import { createT3Geometry } from './t3-geometry.js';
import { POINT_QUANTITIES } from './interpretation-constants.js';

export function recoverPointProbe(level, probe, mapping, quantity, coordinateTolerance) {
  const context = probeContext(level, probe, mapping, coordinateTolerance);
  const field = context.element.type === ELEMENT_TYPES.Q4 ? recoverQ4(context) : recoverT3(context);
  return deepFreeze({
    levelId: level.levelId,
    probeId: probe.probeId,
    quantity,
    value: pointScalar(field, quantity),
    elementId: context.element.elementId,
    elementType: context.element.type,
    reconstructedCoordinates: context.reconstructedCoordinates,
    reconstructionResidual: context.reconstructionResidual,
    recoveryEvidence: field.evidence,
  });
}

export function verifyProbeMapping(level, probe, mapping, coordinateTolerance) {
  const context = probeContext(level, probe, mapping, coordinateTolerance);
  return deepFreeze({
    levelId: level.levelId,
    probeId: probe.probeId,
    elementId: context.element.elementId,
    elementType: context.element.type,
    reconstructedCoordinates: context.reconstructedCoordinates,
    reconstructionResidual: context.reconstructionResidual,
  });
}

function probeContext(level, probe, mapping, tolerance) {
  assertQualified(level);
  if (mapping.probeId !== probe.probeId) throw new TypeError('Probe mapping identity mismatch.');
  const element = level.model.elements.find((row) => row.elementId === mapping.elementId);
  if (!element || element.type !== mapping.elementType) throw new TypeError('Probe mapping element identity or type is invalid.');
  const nodeMap = new Map(level.model.nodes.map((row) => [row.nodeId, row]));
  const nodes = element.nodeIds.map((id) => nodeMap.get(id));
  const reconstructedCoordinates = reconstructPoint(element, nodes, mapping, tolerance);
  const reconstructionResidual = distance(reconstructedCoordinates, probe.physicalCoordinates);
  if (reconstructionResidual > tolerance) throw new TypeError('Probe mapping does not reconstruct the declared physical point within tolerance.');
  assertDeclaredReconstruction(mapping, reconstructedCoordinates, reconstructionResidual, tolerance);
  return { level, probe, mapping, element, nodes, reconstructedCoordinates, reconstructionResidual, coordinateTolerance: tolerance };
}

function recoverQ4(context) {
  const point = q4Coordinates(context.mapping, context.coordinateTolerance);
  const localDisplacement = elementDisplacement(context.level.result, context.element);
  const geometry = createQ4PointGeometry(context.nodes, point);
  const strain = multiplyMatrixVector(geometry.B, localDisplacement);
  return continuumField(context, localDisplacement, strain, { naturalCoordinates: point, B: geometry.B });
}

function recoverT3(context) {
  const coordinates = t3Coordinates(context.mapping, context.coordinateTolerance);
  const localDisplacement = elementDisplacement(context.level.result, context.element);
  const geometry = createT3Geometry(context.nodes);
  const strain = multiplyMatrixVector(geometry.B, localDisplacement);
  return continuumField(context, localDisplacement, strain, { areaCoordinates: coordinates, B: geometry.B });
}

function continuumField(context, displacement, strain, locationEvidence) {
  const material = context.level.model.materials.find((row) => row.materialId === context.element.materialId);
  if (!material) throw new TypeError('Probe element material is missing.');
  const formulation = context.level.model.solverProfile.formulation;
  const stress = multiplyMatrixVector(constitutiveMatrix(material, formulation), strain);
  const sigmaZ = recoverSigmaZ(stress, material, formulation);
  const principal = principalStress(stress, sigmaZ, formulation);
  const shape = interpolationShape(context.mapping, context.element.type);
  const displacementVector = interpolateDisplacement(displacement, shape);
  return {
    displacement: displacementVector,
    strain,
    stress,
    sigmaZ,
    principal: fullPrincipal(principal, sigmaZ, formulation),
    vonMises: vonMisesStress(stress, sigmaZ),
    evidence: { recoveryLocation: 'FIXED_PHYSICAL_POINT_DIRECT_ELEMENT_RECOVERY', ...locationEvidence, shapeFunctions: shape },
  };
}

function pointScalar(field, quantity) {
  if (!POINT_QUANTITIES.includes(quantity)) throw new TypeError(`Unsupported point quantity: ${quantity}.`);
  const values = { UX: field.displacement[0], UY: field.displacement[1], DISPLACEMENT_MAGNITUDE: Math.hypot(...field.displacement), EX: field.strain[0], EY: field.strain[1], GXY: field.strain[2], SX: field.stress[0], SY: field.stress[1], TXY: field.stress[2], SIGMA_Z: field.sigmaZ, VON_MISES: field.vonMises, PRINCIPAL_1: field.principal[0], PRINCIPAL_2: field.principal[1], PRINCIPAL_3: field.principal[2] };
  return values[quantity];
}

function reconstructPoint(element, nodes, mapping, tolerance) {
  if (element.type === ELEMENT_TYPES.Q4) return createQ4PointGeometry(nodes, q4Coordinates(mapping, tolerance)).globalCoordinates;
  const coordinates = t3Coordinates(mapping, tolerance);
  return coordinates.reduce((point, value, index) => ({ x: point.x + value * nodes[index].x, y: point.y + value * nodes[index].y }), { x: 0, y: 0 });
}
function interpolationShape(mapping, type) { return type === ELEMENT_TYPES.Q4 ? q4ShapeFunctions(mapping.naturalCoordinates.xi, mapping.naturalCoordinates.eta) : mapping.areaCoordinates; }
function q4Coordinates(mapping, tolerance) {
  const row = mapping.naturalCoordinates;
  if (!row || !Number.isFinite(row.xi) || !Number.isFinite(row.eta) || Math.abs(row.xi) > 1 + tolerance || Math.abs(row.eta) > 1 + tolerance) throw new TypeError('Q4 probe natural coordinates must lie in [-1,1].');
  return { xi: row.xi, eta: row.eta };
}
function t3Coordinates(mapping, tolerance) {
  const rows = mapping.areaCoordinates;
  if (!Array.isArray(rows) || rows.length !== 3 || rows.some((value) => !Number.isFinite(value) || value < -tolerance || value > 1 + tolerance)) throw new TypeError('T3 probe area coordinates are invalid.');
  if (Math.abs(rows.reduce((sum, value) => sum + value, 0) - 1) > tolerance) throw new TypeError('T3 probe area coordinates must sum to one.');
  return rows;
}
function elementDisplacement(result, element) {
  const map = new Map(result.nodalDisplacements.map((row) => [`${row.nodeId}:${row.component}`, row.value]));
  const values = element.nodeIds.flatMap((nodeId) => ['UX','UY'].map((component) => map.get(`${nodeId}:${component}`)));
  if (values.some((value) => !Number.isFinite(value))) throw new TypeError('Probe recovery requires complete finite nodal displacements.');
  return values;
}
function interpolateDisplacement(values, shape) { return shape.reduce((row, value, index) => [row[0] + value * values[2 * index], row[1] + value * values[2 * index + 1]], [0, 0]); }
function fullPrincipal(principal, sigmaZ, formulation) { return formulation === FORMULATIONS.PLANE_STRAIN ? principal.values : [...principal.inPlane, sigmaZ].sort((a, b) => b - a); }
function assertQualified(level) {
  if (level.result?.status !== 'QUALIFIED' || level.result?.qualifiedResults !== 'complete') throw new TypeError('Point probes require a qualified complete LFEA result.');
  if (level.result.modelSemanticHash !== level.model.semanticHash || level.result.modelEvidence?.semanticHash !== level.model.semanticHash) throw new TypeError('Point probe model/result semantic hashes are stale or mismatched.');
}
function assertDeclaredReconstruction(mapping, point, residual, tolerance) {
  const declared = mapping.reconstructedCoordinates;
  if (!declared || distance(declared, point) > tolerance) throw new TypeError('Declared probe reconstructed coordinates are inconsistent.');
  if (!Number.isFinite(mapping.reconstructionResidual) || Math.abs(mapping.reconstructionResidual - residual) > tolerance) throw new TypeError('Declared probe reconstruction residual is inconsistent.');
}
function distance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y); }
