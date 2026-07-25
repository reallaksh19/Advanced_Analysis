import {
  deepFreeze,
  semanticHash,
  stringValue,
  validateSharedPipingModel,
} from '../shared-piping-model/index.js';
import { validatePipingPortTopologyGraph } from '../piping-topology/index.js';
import { AUDIT_CODES, LOAD_SOURCE_PROJECTION_SCHEMA } from './constants.js';
import { distanceM, lengthFactorToM, normalizeLengthUnit, pointToMeters } from './units.js';

export function projectEngineeringLoadSources(sharedModel, topologyGraph) {
  assertInputs(sharedModel, topologyGraph);
  const lengthUnit = normalizeLengthUnit(sharedModel.units.length);
  const factor = lengthFactorToM(lengthUnit);
  const components = sharedModel.components.map((component) => projectComponent(component, lengthUnit, factor))
    .sort((left, right) => left.componentKey.localeCompare(right.componentKey));
  const diagnostics = components.flatMap((component) => component.diagnostics);
  const base = {
    schema: LOAD_SOURCE_PROJECTION_SCHEMA,
    datasetId: sharedModel.project.datasetId,
    sharedModelSemanticHash: sharedModel.semanticHash,
    topologySemanticHash: topologyGraph.semanticHash,
    units: { sourceLengthUnit: lengthUnit, canonicalLengthUnit: 'm', unitSupported: factor !== null },
    components,
    diagnostics,
    summary: {
      componentCount: components.length,
      linearGeometryCount: components.filter((row) => row.geometry.sourceLengthM > 0).length,
      explicitCenterCount: components.filter((row) => row.geometry.applicationPoint).length,
      diagnosticCount: diagnostics.length,
    },
  };
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

export function validateEngineeringLoadSourceProjection(value) {
  const errors = [];
  if (value?.schema !== LOAD_SOURCE_PROJECTION_SCHEMA) errors.push('Invalid load-source projection schema.');
  if (!Array.isArray(value?.components)) errors.push('Load-source components must be an array.');
  if (!value?.datasetId) errors.push('Load-source datasetId is required.');
  if (value?.semanticHash !== semanticHash(withoutHash(value))) errors.push('Load-source semantic hash mismatch.');
  return deepFreeze({ ok: errors.length === 0, errors });
}

function projectComponent(component, lengthUnit, factor) {
  const start = pointToMeters(component.geometry?.start, lengthUnit);
  const end = pointToMeters(component.geometry?.end, lengthUnit);
  const center = explicitCenter(component.geometry)
    ? pointToMeters(component.geometry.center, lengthUnit)
    : null;
  const cog = pointToMeters(component.loadEvidence?.componentCog?.value, component.loadEvidence?.componentCog?.unit || lengthUnit);
  const ports = (component.geometry?.ports || []).map((port) => ({
    portKey: port.portKey,
    position: pointToMeters(port.position, lengthUnit),
    sourceReference: port.sourceReference || null,
  }));
  const sourceLengthM = distanceM(start, end);
  const declaredLengthM = lengthFromEvidence(component, factor);
  const diagnostics = projectionDiagnostics(component.componentKey, factor, start, end, sourceLengthM, declaredLengthM);
  return deepFreeze({
    componentKey: component.componentKey,
    sourceEntityId: component.sourceEntityId ?? null,
    type: stringValue(component.type).toUpperCase() || 'UNKNOWN',
    identity: component.identity || {},
    geometry: { start, end, center, ports, applicationPoint: cog || center, sourceLengthM, declaredLengthM },
    engineeringProperties: component.engineeringProperties || {},
    loadEvidence: component.loadEvidence || {},
    sourceReferences: component.sourceReferences || {},
    diagnostics,
  });
}

function projectionDiagnostics(componentKey, factor, start, end, sourceLengthM, declaredLengthM) {
  const diagnostics = [];
  if (factor === null) diagnostics.push(diagnostic(AUDIT_CODES.UNIT_BLOCKED, componentKey));
  if (!start || !end || !(sourceLengthM > 0)) diagnostics.push(diagnostic(AUDIT_CODES.MISSING_GEOMETRY, componentKey));
  if (lengthsConflict(sourceLengthM, declaredLengthM)) {
    diagnostics.push(diagnostic(AUDIT_CODES.GEOMETRY_LENGTH_CONFLICT, componentKey));
  }
  return diagnostics;
}

function explicitCenter(geometry) {
  const source = String(geometry?.sources?.center || '');
  return Boolean(geometry?.center && source && !source.startsWith('derived.'));
}

function lengthFromEvidence(component, factor) {
  const evidence = component.compatibilityEvidence?.sourceLengthMm;
  if (!evidence || factor === null) return null;
  const unitFactor = lengthFactorToM(evidence.unit || 'mm');
  const value = Number(evidence.value);
  return unitFactor === null || !Number.isFinite(value) ? null : value * unitFactor;
}

function lengthsConflict(sourceLengthM, declaredLengthM) {
  if (declaredLengthM === null) return false;
  if (!(declaredLengthM > 0) || !(sourceLengthM > 0)) return true;
  const scale = Math.max(1, Math.abs(sourceLengthM), Math.abs(declaredLengthM));
  return Math.abs(sourceLengthM - declaredLengthM) > (scale * 1e-9);
}

function diagnostic(code, componentKey) {
  return deepFreeze({ code, severity: 'WARNING', componentKey });
}

function assertInputs(sharedModel, topologyGraph) {
  const shared = validateSharedPipingModel(sharedModel);
  const topology = validatePipingPortTopologyGraph(topologyGraph);
  if (!shared.ok) throw new TypeError(`Invalid shared model: ${shared.errors.join(' ')}`);
  if (!topology.ok) throw new TypeError(`Invalid topology graph: ${topology.errors.join(' ')}`);
  if (topologyGraph.sharedModelSemanticHash !== sharedModel.semanticHash) {
    throw new TypeError('Topology graph does not reference the supplied shared model.');
  }
}

function withoutHash(value) {
  const { semanticHash: _semanticHash, ...rest } = value || {};
  return rest;
}
