import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import {
  createDefaultLoadCaseSet, createModelLoadReadinessAudit,
  MODEL_LOAD_PRIMITIVE_SET_SCHEMA,
} from '../src/core/model-loads/index.js';
import { createSharedPipingModel, deepFreeze, semanticHash } from '../src/core/shared-piping-model/index.js';
import { buildVerticalLoadPathFoundation } from '../src/core/support-load-screening/index.js';
import { buildRestraintCapabilityModel, buildSupportAttachmentModel } from '../src/core/support-restraints/index.js';
import { buildVerticalBeamFoundation, runVerticalBeamSolution } from '../src/core/vertical-beam-solver/index.js';

const TO_SOURCE = Object.freeze({ m: 1, mm: 1000, cm: 100, in: 39.37007874015748, ft: 3.280839895013123 });
const FIXTURE_GRAVITY_M_S2 = 9.80665;

export function buildBeamFixture(options = {}) {
  const datasetId = options.datasetId || 'W10.6-FIXTURE';
  const lengthUnit = options.lengthUnit || 'm';
  const intervals = normalizeIntervals(options);
  const components = intervals.map((row) => componentRecord(row, lengthUnit, options));
  const supports = (options.supportStationsM || [intervals[0].startM, intervals.at(-1).endM])
    .map((station, index) => supportRecord(station, index, intervals, lengthUnit, options));
  const sourceComponents = options.reverseInputOrder ? [...components].reverse() : components;
  const sourceSupports = options.reverseInputOrder ? [...supports].reverse() : supports;
  const sharedModel = createSharedPipingModel({
    project: { datasetId, name: datasetId, sourceName: `${datasetId}.json` },
    units: { length: lengthUnit, force: 'N', mass: 'kg' },
    sourceSnapshotRef: {
      schema: 'source-package-snapshot/v1', datasetId, sourceSchema: 'w10.6-fixture/v1',
      sourceSemanticHash: `fixture:${datasetId}`, sourceByteHash: null,
    },
    components: sourceComponents, supports: sourceSupports, sourceReferences: { nodes: [] }, diagnostics: [],
  });
  const topologyGraph = buildPipingPortTopologyGraph(sharedModel);
  const attachmentModel = buildSupportAttachmentModel(sharedModel, topologyGraph);
  const restraintModel = buildRestraintCapabilityModel(attachmentModel);
  const pathFoundation = buildVerticalLoadPathFoundation({ sharedModel, topologyGraph, attachmentModel, restraintModel });
  const loadFoundation = buildLoadFoundation(datasetId, intervals, options);
  const foundation = buildVerticalBeamFoundation({
    sharedModel, pathModel: pathFoundation.pathModel,
    loadCaseSet: loadFoundation.loadCaseSet,
    loadPrimitiveSet: loadFoundation.loadPrimitiveSet,
    modelLoadReadinessAudit: loadFoundation.readinessAudit,
  }, { profileOptions: options.profileOptions || {} });
  return { sharedModel, topologyGraph, attachmentModel, restraintModel, pathFoundation, loadFoundation, foundation };
}

export function solveBeamFixture(options = {}) {
  const fixture = buildBeamFixture(options);
  return { ...fixture, solved: runVerticalBeamSolution(fixture.foundation) };
}

function normalizeIntervals(options) {
  if (options.intervals) return options.intervals.map((row, index) => ({
    key: row.key || `COMP-${index + 1}`, type: row.type || 'PIPE',
    startM: row.startM, endM: row.endM, flexural: row.flexural || options.flexural || directEi(2e6),
  }));
  const lengths = options.lengthsM || [2, 2];
  let station = options.originM || 0;
  return lengths.map((length, index) => {
    const startM = station; station += length;
    return { key: `COMP-${index + 1}`, type: options.componentTypes?.[index] || 'PIPE', startM, endM: station, flexural: options.flexuralByComponent?.[index] || options.flexural || directEi(2e6) };
  });
}

function componentRecord(interval, unit, options) {
  const physicalStart = point(interval.startM, unit, options.translation || {});
  const physicalEnd = point(interval.endM, unit, options.translation || {});
  const [start, end] = options.reverseComponentGeometry ? [physicalEnd, physicalStart] : [physicalStart, physicalEnd];
  const center = midpoint(start, end);
  return {
    componentKey: interval.key, sourceEntityId: interval.key, name: interval.key, type: interval.type,
    identity: { lineId: 'LINE-W10.6', branchId: '', systemId: 'SYS-W10.6', zoneId: '' },
    geometry: {
      start, end, center, points: [start, end], branchPoints: [], explicitCenter: false,
      boreMm: null,
      ports: [port(interval.key, 'start', start), port(interval.key, 'end', end)],
      sources: { start: `${interval.key}.start`, end: `${interval.key}.end`, center: 'derived.midpoint', branches: [] },
    },
    engineeringProperties: flexuralEvidence(interval.flexural), compatibilityEvidence: {},
    sourceReferences: sourceReferences(interval.key), diagnostics: [],
  };
}

function supportRecord(stationM, index, intervals, unit, options) {
  const interval = intervalAtBoundary(intervals, stationM);
  const atStart = Math.abs(stationM - interval.startM) < 1e-12;
  const portRole = options.reverseComponentGeometry ? (atStart ? 'end' : 'start') : (atStart ? 'start' : 'end');
  const key = options.supportKeys?.[index] || `SUP-${index + 1}`;
  const vertical = options.supportStates?.[index] || 'RESTRAINED';
  return {
    supportKey: key, sourceEntityId: key, name: key, type: options.supportTypes?.[index] || 'ANCHOR',
    identity: { lineId: 'LINE-W10.6', branchId: '', systemId: 'SYS-W10.6', zoneId: '' },
    position: point(stationM, unit, options.translation || {}),
    engineeringProperties: {}, compatibilityEvidence: {},
    supportEvidence: {
      attachedPortReferences: [evidence(`${interval.key}:port:${portRole}`, '', 'ATTACHED_PORT_ID')],
      supportTypes: [evidence(options.supportTypes?.[index] || 'ANCHOR', '', 'SUPPORT_TYPE')],
      verticalCapabilities: [evidence(vertical, '', 'VERTICAL_CAPABILITY')],
    },
    sourceReferences: sourceReferences(key), diagnostics: [],
  };
}

function buildLoadFoundation(datasetId, intervals, options) {
  const loadCaseSet = createDefaultLoadCaseSet();
  const primitives = [];
  const loads = options.loads || defaultUniformLoads(intervals, options.uniformLoadNM ?? 1000);
  for (const loadCase of loadCaseSet.loadCases) {
    (loads[loadCase.loadCaseId] || []).forEach((row, index) => primitives.push(loadPrimitive(row, index, loadCase.loadCaseId, intervals, options)));
  }
  const blocked = options.blockedComponentsByCase || {};
  const componentOutcomes = loadCaseSet.loadCases.flatMap((loadCase) => intervals.map((interval) => {
    const isBlocked = (blocked[loadCase.loadCaseId] || []).includes(interval.key);
    return deepFreeze({
      loadCaseId: loadCase.loadCaseId, componentKey: interval.key,
      ready: !isBlocked, mode: isBlocked ? null : 'CUSTOM_FIXTURE',
      blockers: isBlocked ? ['FIXTURE_CASE_BLOCKED'] : [], diagnostics: [],
    });
  }));
  const base = {
    schema: MODEL_LOAD_PRIMITIVE_SET_SCHEMA, datasetId,
    loadCaseSetSemanticHash: loadCaseSet.semanticHash,
    sourceProjectionSemanticHash: `fixture:${datasetId}`,
    gravityProfile: { profileId: 'FIXTURE_EXPLICIT_LOADS' },
    compositionProfile: { profileId: 'FIXTURE_EXPLICIT_LOADS' },
    primitives: primitives.sort((a, b) => a.primitiveId.localeCompare(b.primitiveId)),
    componentOutcomes: componentOutcomes.sort((a, b) => `${a.loadCaseId}|${a.componentKey}`.localeCompare(`${b.loadCaseId}|${b.componentKey}`)),
    summary: {},
  };
  const loadPrimitiveSet = deepFreeze({ ...base, semanticHash: semanticHash(base) });
  const readinessAudit = createModelLoadReadinessAudit(loadCaseSet, loadPrimitiveSet);
  return { loadCaseSet, loadPrimitiveSet, readinessAudit };
}

function loadPrimitive(row, index, caseId, intervals, options) {
  const interval = intervals.find((item) => item.key === row.componentKey);
  if (row.type === 'POINT') return deepFreeze({
    primitiveId: `fixture-load:${caseId}:${index}:point`, loadCaseId: caseId,
    componentKey: row.componentKey, primitiveType: 'POINT_GRAVITY_LOAD',
    applicationPoint: canonicalPoint(row.stationM, options.translation),
    pointMassKg: row.forceN / FIXTURE_GRAVITY_M_S2, pointForceN: row.forceN,
    semanticDirection: 'GRAVITY_DOWN', globalVector: null, sourceEvidence: { fixture: true }, diagnostics: [],
  });
  if (row.type === 'MOMENT') return deepFreeze({
    primitiveId: `fixture-load:${caseId}:${index}:moment`, loadCaseId: caseId,
    componentKey: row.componentKey, primitiveType: 'EXPLICIT_POINT_MOMENT',
    applicationPoint: canonicalPoint(row.stationM, options.translation), momentMagnitudeNm: row.momentNm,
    axisEvidence: { value: 'UNMAPPED' }, globalVector: null, sourceEvidence: { fixture: true }, diagnostics: [],
  });
  return deepFreeze({
    primitiveId: `fixture-load:${caseId}:${index}:distributed`, loadCaseId: caseId,
    componentKey: row.componentKey, primitiveType: 'DISTRIBUTED_GRAVITY_LOAD',
    startPoint: canonicalPoint(interval.startM, options.translation), endPoint: canonicalPoint(interval.endM, options.translation),
    sourceLengthM: interval.endM - interval.startM,
    massPerLengthKgM: row.forcePerLengthNM / FIXTURE_GRAVITY_M_S2,
    forcePerLengthNM: row.forcePerLengthNM,
    semanticDirection: 'GRAVITY_DOWN', globalVector: null, sourceEvidence: { fixture: true }, diagnostics: [],
  });
}

function defaultUniformLoads(intervals, forcePerLengthNM) {
  const empty = intervals.map((row) => ({ type: 'DISTRIBUTED', componentKey: row.key, forcePerLengthNM }));
  return { EMPTY: empty, OPE: empty, HYD: empty };
}
function flexuralEvidence(value) {
  const result = {};
  if (value.ei !== undefined) result.flexuralRigidityNm2 = evidence(value.ei, 'N*m2', 'EI_N_M2');
  if (value.eMpa !== undefined) result.elasticModulusMpa = evidence(value.eMpa, 'MPa', 'ELASTIC_MODULUS_MPA');
  if (value.iMm4 !== undefined) result.secondMomentAreaMm4 = evidence(value.iMm4, 'mm4', 'SECOND_MOMENT_AREA_MM4');
  if (value.odMm !== undefined) result.outerDiameterMm = evidence(value.odMm, 'mm', 'OUTSIDE_DIAMETER_MM');
  if (value.wallMm !== undefined) result.wallThicknessMm = evidence(value.wallMm, 'mm', 'WALL_THICKNESS_MM');
  return result;
}
function directEi(ei) { return { ei }; }
function intervalAtBoundary(intervals, station) {
  return intervals.find((row) => Math.abs(row.startM - station) < 1e-12)
    || intervals.find((row) => Math.abs(row.endM - station) < 1e-12)
    || (() => { throw new TypeError('Fixture supports must be placed at component boundaries.'); })();
}
function point(stationM, unit, translation) { const factor = TO_SOURCE[unit]; return { x: (stationM + (translation.xM || 0)) * factor, y: (translation.yM || 0) * factor, z: (translation.zM || 0) * factor }; }
function canonicalPoint(stationM, translation = {}) { return { x: stationM + (translation?.xM || 0), y: translation?.yM || 0, z: translation?.zM || 0 }; }
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }; }
function port(key, role, position) { return { portKey: `${key}:port:${role}`, role, position, sourceReference: { sourcePath: `${key}.${role}` } }; }
function sourceReferences(key) { return { sourceNodeKey: `node:${key}`, sourceEntityId: key, jsonPointer: `/objects/${key}`, sourcePath: `/MODEL/${key}` }; }
function evidence(value, unit, field) { return { value, unit, sourcePath: `sourceAttributes.${field}`, sourceRoot: 'sourceAttributes', sourceKind: 'sourceAttributes' }; }
