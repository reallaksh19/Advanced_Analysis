import { createSharedPipingModel, deepFreeze, semanticHash } from '../src/core/shared-piping-model/index.js';
import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import { buildModelLoadFoundation } from '../src/core/model-loads/index.js';
import {
  buildVerticalLoadPathFoundation,
  runTributarySupportLoadScreening,
} from '../src/core/support-load-screening/index.js';

const UNIT_TO_M = Object.freeze({ mm: 0.001, cm: 0.01, m: 1, in: 0.0254, ft: 0.3048 });

export function buildStraightFixture(options = {}) {
  const lengthUnit = options.lengthUnit || 'mm';
  const lengthsM = options.lengthsM || [1, 1];
  const componentTypes = options.componentTypes || lengthsM.map(() => 'PIPE');
  const components = buildComponents(lengthsM, componentTypes, lengthUnit, options);
  const totalLengthM = lengthsM.reduce((sum, value) => sum + value, 0);
  const supports = (options.supports || defaultSupports(totalLengthM)).map((row, index) => (
    buildSupport(row, index, components, lengthsM, lengthUnit, options)
  ));
  const sourceComponents = options.reverseInputOrder ? [...components].reverse() : components;
  const sourceSupports = options.reverseInputOrder ? [...supports].reverse() : supports;
  const sharedModel = buildSharedModel(sourceComponents, sourceSupports, lengthUnit, options.datasetId || 'W10.5-FIXTURE');
  return buildFromSharedModel(sharedModel, options);
}

export function buildBranchFixture() {
  const center = point(0, 0, 0, 'm');
  const component = componentRecord({
    key: 'TEE-1', type: 'TEE', start: center, end: point(1, 0, 0, 'm'), center,
    branchPoints: [point(0, 1, 0, 'm')], explicitCenter: true,
    engineeringProperties: { componentWeightKg: evidence(10, 'kg', 'COMPONENT_WEIGHT_KG') },
  });
  return buildFromSharedModel(buildSharedModel([component], [], 'm', 'W10.5-BRANCH'));
}

export function buildCycleFixture() {
  const components = [
    pipeRecord('CYCLE-A', point(0, 0, 0, 'm'), point(1, 0, 0, 'm')),
    pipeRecord('CYCLE-B', point(1, 0, 0, 'm'), point(0.5, 1, 0, 'm')),
    pipeRecord('CYCLE-C', point(0.5, 1, 0, 'm'), point(0, 0, 0, 'm')),
  ];
  return buildFromSharedModel(buildSharedModel(components, [], 'm', 'W10.5-CYCLE'));
}

export function buildDisconnectedFixture() {
  const components = [
    pipeRecord('LINE-A', point(0, 0, 0, 'm'), point(1, 0, 0, 'm')),
    pipeRecord('LINE-B', point(10, 0, 0, 'm'), point(11, 0, 0, 'm')),
  ];
  const supports = [
    supportAtPort('SA-0', 'LINE-A:port:start', point(0, 0, 0, 'm')),
    supportAtPort('SA-1', 'LINE-A:port:end', point(1, 0, 0, 'm')),
    supportAtPort('SB-0', 'LINE-B:port:start', point(10, 0, 0, 'm')),
    supportAtPort('SB-1', 'LINE-B:port:end', point(11, 0, 0, 'm')),
  ];
  return buildFromSharedModel(buildSharedModel(components, supports, 'm', 'W10.5-DISCONNECTED'));
}

export function buildUnavailableStationFixture() {
  const fixture = buildStraightFixture({
    lengthsM: [1],
    supports: [
      { key: 'SUP-A', stationM: 0, verticalState: 'RESTRAINED' },
      { key: 'SUP-B', stationM: 1, verticalState: 'RESTRAINED' },
      { key: 'SUP-NO-STATION', stationM: 0.5, verticalState: 'RESTRAINED', attachedComponentKey: 'COMP-1' },
    ],
  });
  const attachmentModel = withoutAttachmentStation(fixture.attachmentModel, 'SUP-NO-STATION');
  const restraintModel = buildRestraintCapabilityModel(attachmentModel);
  const pathFoundation = buildVerticalLoadPathFoundation({
    sharedModel: fixture.sharedModel,
    topologyGraph: fixture.topologyGraph,
    attachmentModel,
    restraintModel,
  });
  return { ...fixture, attachmentModel, restraintModel, pathFoundation };
}

export function runFixture(fixture) {
  return runTributarySupportLoadScreening(fixture.pathFoundation, {
    loadCaseSet: fixture.modelLoads.loadCaseSet,
    loadPrimitiveSet: fixture.modelLoads.loadPrimitiveSet,
    modelLoadReadinessAudit: fixture.modelLoads.readinessAudit,
  });
}

function buildFromSharedModel(sharedModel, options = {}) {
  const topologyGraph = buildPipingPortTopologyGraph(sharedModel);
  const attachmentModel = buildSupportAttachmentModel(sharedModel, topologyGraph);
  const restraintModel = buildRestraintCapabilityModel(attachmentModel);
  const modelLoads = buildModelLoadFoundation(sharedModel, topologyGraph, options.modelLoadOptions || {});
  const pathFoundation = buildVerticalLoadPathFoundation({
    sharedModel,
    topologyGraph,
    attachmentModel,
    restraintModel,
  });
  return { sharedModel, topologyGraph, attachmentModel, restraintModel, modelLoads, pathFoundation };
}

function buildComponents(lengthsM, types, unit, options) {
  let stationM = options.originM || 0;
  return lengthsM.map((lengthM, index) => {
    const start = point(stationM, options.yM || 0, options.zM || 0, unit);
    stationM += lengthM;
    const end = point(stationM, options.yM || 0, options.zM || 0, unit);
    const type = types[index];
    const endpoints = options.reverseComponentGeometry ? [end, start] : [start, end];
    if (type === 'PIPE') return pipeRecord(`COMP-${index + 1}`, endpoints[0], endpoints[1], options);
    return lumpedRecord(`COMP-${index + 1}`, type, endpoints[0], endpoints[1], options);
  });
}

function pipeRecord(key, start, end, options = {}) {
  const engineeringProperties = {
    unitPipeWeightKgPerM: evidence(options.pipeMassKgM ?? 10, 'kg/m', 'UNIT_PIPE_WEIGHT_KG_PER_M'),
    insulationThicknessMm: evidence(options.insulationThicknessMm ?? 0, 'mm', 'INSULATION_THICKNESS_MM'),
  };
  if (options.opeFluidKgM !== null) engineeringProperties.fluidWeightOpeKgPerM = evidence(options.opeFluidKgM ?? 2, 'kg/m', 'FLUID_WEIGHT_OPE_KG_PER_M');
  if (options.hydFluidKgM !== null) engineeringProperties.fluidWeightHydKgPerM = evidence(options.hydFluidKgM ?? 3, 'kg/m', 'FLUID_WEIGHT_HYD_KG_PER_M');
  return componentRecord({ key, type: 'PIPE', start, end, engineeringProperties });
}

function lumpedRecord(key, type, start, end, options = {}) {
  const center = interpolate(start, end, options.cogFraction ?? 0.5);
  return componentRecord({
    key, type, start, end, center, explicitCenter: true,
    engineeringProperties: { componentWeightKg: evidence(options.componentMassKg ?? 20, 'kg', 'COMPONENT_WEIGHT_KG') },
    loadEvidence: options.explicitPointMomentNm !== undefined ? {
      explicitPointMomentNm: evidence(options.explicitPointMomentNm, 'N*m', 'POINT_MOMENT_NM'),
      momentAxis: evidence(options.momentAxis || 'LOCAL_Z', '', 'MOMENT_AXIS'),
    } : undefined,
  });
}

function componentRecord(input) {
  const ports = [
    port(input.key, 'start', input.start),
    port(input.key, 'end', input.end),
    ...(input.branchPoints || []).map((position, index) => port(input.key, `branch-${index + 1}`, position)),
  ];
  return {
    componentKey: input.key,
    sourceEntityId: input.key,
    name: input.key,
    type: input.type,
    identity: { lineId: 'LINE-W10.5', branchId: '', systemId: 'SYS-W10.5', zoneId: '' },
    geometry: {
      start: input.start,
      end: input.end,
      center: input.center || midpoint(input.start, input.end),
      points: [input.start, input.end],
      branchPoints: input.branchPoints || [],
      explicitCenter: Boolean(input.explicitCenter),
      boreMm: null,
      ports,
      sources: {
        start: `${input.key}.start`,
        end: `${input.key}.end`,
        center: input.explicitCenter ? `${input.key}.center` : 'derived.midpoint',
        branches: (input.branchPoints || []).map((_, index) => `${input.key}.branch[${index}]`),
      },
    },
    engineeringProperties: input.engineeringProperties || {},
    compatibilityEvidence: {},
    ...(input.loadEvidence ? { loadEvidence: input.loadEvidence } : {}),
    sourceReferences: sourceReferences(input.key),
    diagnostics: [],
  };
}

function buildSupport(row, index, components, lengthsM, unit, options) {
  const key = row.key || `SUP-${index + 1}`;
  const position = row.missingPosition ? null : point((options.originM || 0) + row.stationM, options.yM || 0, options.zM || 0, unit);
  const reference = attachmentReference(row, components, lengthsM, options);
  const supportEvidence = {
    supportTypes: [evidence(row.supportType || 'ANCHOR', '', 'SUPPORT_TYPE')],
    ...(reference ? reference : {}),
    ...(row.verticalState ? { verticalCapabilities: stateEvidence(row.verticalState) } : {}),
    ...(row.verticalGapMm !== undefined ? { verticalGaps: [evidence(row.verticalGapMm, 'mm', 'VERTICAL_GAP_MM')] } : {}),
  };
  return {
    supportKey: key,
    sourceEntityId: key,
    name: key,
    type: 'SUPPORT',
    identity: { lineId: row.lineId ?? 'LINE-W10.5', branchId: '', systemId: 'SYS-W10.5', zoneId: '' },
    position,
    engineeringProperties: {},
    compatibilityEvidence: {},
    supportEvidence,
    sourceReferences: sourceReferences(key),
    diagnostics: [],
  };
}

function attachmentReference(row, components, lengthsM, options) {
  if (row.unattached) return null;
  if (row.attachedPortKey) return { attachedPortReferences: [evidence(row.attachedPortKey, '', 'ATTACHED_PORT_ID')] };
  if (row.attachedComponentKey) return { attachedComponentReferences: [evidence(row.attachedComponentKey, '', 'ATTACHED_COMPONENT_ID')] };
  if (row.ambiguousComponents) {
    return { attachedComponentReferences: row.ambiguousComponents.map((value) => evidence(value, '', 'ATTACHED_COMPONENT_ID')) };
  }
  let cumulative = 0;
  for (let index = 0; index < lengthsM.length; index += 1) {
    const start = cumulative, end = cumulative + lengthsM[index];
    const component = components[index];
    const startRole = options.reverseComponentGeometry ? 'end' : 'start';
    const endRole = options.reverseComponentGeometry ? 'start' : 'end';
    if (Math.abs(row.stationM - start) < 1e-12) return { attachedPortReferences: [evidence(`${component.componentKey}:port:${startRole}`, '', 'ATTACHED_PORT_ID')] };
    if (Math.abs(row.stationM - end) < 1e-12) return { attachedPortReferences: [evidence(`${component.componentKey}:port:${endRole}`, '', 'ATTACHED_PORT_ID')] };
    if (row.stationM > start && row.stationM < end) return { attachedComponentReferences: [evidence(component.componentKey, '', 'ATTACHED_COMPONENT_ID')] };
    cumulative = end;
  }
  return { attachedComponentReferences: [evidence(components.at(-1).componentKey, '', 'ATTACHED_COMPONENT_ID')] };
}

function supportAtPort(key, portKey, position) {
  return {
    supportKey: key, sourceEntityId: key, name: key, type: 'SUPPORT', position,
    identity: { lineId: '', branchId: '', systemId: '', zoneId: '' },
    engineeringProperties: {}, compatibilityEvidence: {},
    supportEvidence: {
      attachedPortReferences: [evidence(portKey, '', 'ATTACHED_PORT_ID')],
      supportTypes: [evidence('ANCHOR', '', 'SUPPORT_TYPE')],
      verticalCapabilities: [evidence('RESTRAINED', '', 'VERTICAL_CAPABILITY')],
    },
    sourceReferences: sourceReferences(key), diagnostics: [],
  };
}

function buildSharedModel(components, supports, lengthUnit, datasetId) {
  return createSharedPipingModel({
    project: { datasetId, name: datasetId, sourceName: `${datasetId}.json` },
    units: { length: lengthUnit, force: 'N', mass: 'kg' },
    sourceSnapshotRef: {
      schema: 'source-package-snapshot/v1', datasetId, sourceSchema: 'w10.5-fixture/v1',
      sourceSemanticHash: `fixture:${datasetId}`, sourceByteHash: null,
    },
    components,
    supports,
    sourceReferences: { nodes: [] },
    diagnostics: [],
  });
}

function withoutAttachmentStation(model, supportKey) {
  const attachment = model.attachments.find((row) => row.supportKey === supportKey);
  const targets = model.targets.map((row) => row.targetId === attachment.targetId
    ? { ...row, pointCanonical: null, startCanonical: null, endCanonical: null }
    : row);
  const attachments = model.attachments.map((row) => row.supportKey === supportKey
    ? { ...row, projectedPointCanonical: null, distanceCanonical: null, segmentParameter: null }
    : row);
  const base = { ...model, targets, attachments };
  delete base.semanticHash;
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function port(componentKey, role, position) {
  return { portKey: `${componentKey}:port:${role}`, role, position, sourceReference: { sourcePath: `${componentKey}.${role}` } };
}
function point(xM, yM, zM, unit) { const factor = UNIT_TO_M[unit]; return { x: xM / factor, y: yM / factor, z: zM / factor }; }
function midpoint(left, right) { return interpolate(left, right, 0.5); }
function interpolate(left, right, fraction) { return { x: left.x + (right.x - left.x) * fraction, y: left.y + (right.y - left.y) * fraction, z: left.z + (right.z - left.z) * fraction }; }
function evidence(value, unit, field) { return { value, unit, sourcePath: `sourceAttributes.${field}`, sourceRoot: 'sourceAttributes', sourceKind: 'sourceAttributes' }; }
function stateEvidence(value) {
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => evidence(item, '', 'VERTICAL_CAPABILITY'));
}
function sourceReferences(key) { return { sourceNodeKey: `node:${key}`, sourceEntityId: key, jsonPointer: `/objects/${key}`, sourcePath: `/MODEL/${key}` }; }
function defaultSupports(totalLengthM) { return [{ key: 'SUP-START', stationM: 0, verticalState: 'RESTRAINED' }, { key: 'SUP-END', stationM: totalLengthM, verticalState: 'RESTRAINED' }]; }
