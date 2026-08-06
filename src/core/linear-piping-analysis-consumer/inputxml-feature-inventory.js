import { semanticHash } from '../shared-piping-model/canonical-json.js';
import {
  resolveRestraintTypeMutation,
  restraintTypeCodeLabel,
} from '../geometry/adapters/inputxml-restraint-type-mutation.js';
import {
  STRICT_INPUTXML_LINEAR_STATIC_PROFILE as STRICT,
  DISCLOSED_GENERIC_ANALYZER_APPROXIMATION_PROFILE as APPROXIMATE,
  exactDisposition,
  approximationDisposition,
  unsupportedDisposition,
  nonlinearDisposition,
  codeOnlyDisposition,
  invalidDisposition,
  inactiveDisposition,
} from './inputxml-model-health-profile.js';

const AXIS_TOLERANCE = 1e-12;
const BILATERAL_TRANSLATION_CODES = new Set(['2', '3', '5', '8', '9']);
const UNILATERAL_TRANSLATION_CODES = new Set(['13', '14', '15', '16', '17', '18']);
const SNUBBER_CODES = new Set(['10', '11', '12']);
const DIRECT_AXIS = Object.freeze({ 2: 'UX', 3: 'UY', 5: 'UZ' });

export function buildInputXmlFeatureInventory(sourceBundle) {
  if (!sourceBundle?.sourceRecords || !Array.isArray(sourceBundle.elementRecords)) {
    throw new TypeError('InputXML feature inventory requires a source bundle.');
  }
  const rows = [];
  for (const element of sourceBundle.elementRecords) rows.push(elementInventory(element, sourceBundle));
  const registry = sourceBundle.sourceRecords;
  for (const [collection, records] of Object.entries(registry)) {
    if (collection === 'schema') continue;
    for (const record of records) rows.push(sourceRecordInventory(collection, record));
  }
  rows.sort((left, right) => compareAscii(left.inventoryId, right.inventoryId));
  return Object.freeze(rows);
}

function elementInventory(element, sourceBundle) {
  const segment = sourceBundle.geometry.segments.find((row) => row.id === element.segmentId) ?? null;
  const records = recordsForSegment(sourceBundle.sourceRecords, element.segmentId);
  const componentKind = records.rigids.length > 0
    ? 'RIGID'
    : records.bends.length > 0
      ? 'BEND'
      : records.reducers.length > 0
        ? 'REDUCER'
        : records.sifs.length > 0 || segment?.type === 'TEE'
          ? 'TEE'
          : 'STRAIGHT_PIPE';
  const dispositions = componentDispositions(componentKind);
  return inventoryRow({
    inventoryId: `IXF:ELEMENT:E${element.sourceElementIndex}:R0`,
    sourceFeatureId: null,
    sourceKind: 'ELEMENT',
    sourceSetId: null,
    active: true,
    sourceElementIndex: element.sourceElementIndex,
    sourcePath: element.sourcePath,
    targetIds: { nodeIds: [element.fromNodeId, element.toNodeId], segmentIds: [element.segmentId] },
    sourceRecord: element,
    classification: { componentKind },
    dispositions,
  });
}

function sourceRecordInventory(collection, record) {
  const active = recordActive(collection, record);
  const classification = collection === 'restraints' ? classifyRestraint(record) : { collection };
  const dispositions = active
    ? featureDispositions(collection, classification)
    : { [STRICT]: inactiveDisposition(), [APPROXIMATE]: inactiveDisposition() };
  return inventoryRow({
    inventoryId: record.sourceFeatureId,
    sourceFeatureId: record.sourceFeatureId,
    sourceKind: sourceKind(collection),
    sourceSetId: record.sourceSetId ?? null,
    active,
    sourceElementIndex: record.sourceElementIndex,
    sourcePath: record.sourcePath,
    targetIds: {
      nodeIds: record.nodeId ? [record.nodeId] : [],
      segmentIds: record.segmentId ? [record.segmentId] : [],
    },
    sourceRecord: record,
    classification,
    dispositions,
  });
}

function featureDispositions(collection, classification) {
  if (collection === 'restraints') return restraintDispositions(classification);
  if (collection === 'bends') return componentDispositions('BEND');
  if (collection === 'reducers') return componentDispositions('REDUCER');
  if (collection === 'rigids') return componentDispositions('RIGID');
  if (collection === 'sifs') return both(codeOnlyDisposition('CODE_STRESS_INPUT_ONLY'));
  if (collection === 'hangers') return both(unsupportedDisposition('MODEL_HANGER_UNSUPPORTED'));
  if (collection === 'forcesMoments') return both(unsupportedDisposition('MODEL_NODAL_FORCE_VECTOR_NOT_COMPILED'));
  if (collection === 'prescribedMovements') return both(unsupportedDisposition('MODEL_PRESCRIBED_MOVEMENT_NOT_COMPILED'));
  if (collection === 'temperatureSets') return both(exactDisposition());
  if (collection === 'pressureSets') {
    return {
      [STRICT]: unsupportedDisposition('MODEL_PRESSURE_STRUCTURAL_EFFECT_UNDECLARED'),
      [APPROXIMATE]: approximationDisposition('GENERIC_APPROX_PRESSURE_CODE_ONLY'),
    };
  }
  if (collection === 'allowableStress') return both(codeOnlyDisposition('CODE_STRESS_INPUT_ONLY'));
  if (collection === 'unknownActiveRecords') return both(invalidDisposition('MODEL_UNKNOWN_ACTIVE_SOURCE_RECORD'));
  return both(invalidDisposition('MODEL_SOURCE_FEATURE_UNCLASSIFIED'));
}

function componentDispositions(componentKind) {
  if (componentKind === 'STRAIGHT_PIPE' || componentKind === 'RIGID') return both(exactDisposition());
  const limitation = componentKind === 'BEND'
    ? 'GENERIC_APPROX_BEND_STRAIGHT_CHORD'
    : componentKind === 'REDUCER'
      ? 'GENERIC_APPROX_REDUCER_UNIFORM_SECTION'
      : 'GENERIC_APPROX_TEE_FRAME_BRANCH_NO_FLEXIBILITY';
  return {
    [STRICT]: unsupportedDisposition(`MODEL_${componentKind}_EXACT_MECHANICS_UNAVAILABLE`),
    [APPROXIMATE]: approximationDisposition(limitation),
  };
}

function classifyRestraint(record) {
  const mutation = resolveRestraintTypeMutation(record.sourceTypeRaw);
  const typeCode = mutation.typeCode;
  const direction = normalizedDirection(record.directionCosines);
  const gapActive = finiteNonzero(record.gap?.canonicalValue);
  const frictionActive = finitePositive(record.frictionCoefficient?.parsedValue);
  const connectingNodeActive = record.connectingNodeId !== null;
  const finiteStiffnessActive = finitePositive(record.stiffness?.parsedValue)
    && !record.stiffness?.sentinel?.matched;
  return Object.freeze({
    typeCode,
    typeLabel: restraintTypeCodeLabel(typeCode),
    mutation,
    direction,
    targetDof: targetDof(typeCode, direction),
    gapActive,
    frictionActive,
    connectingNodeActive,
    finiteStiffnessActive,
  });
}

function restraintDispositions(classification) {
  if (!classification.typeCode || !classification.typeLabel) {
    return both(invalidDisposition('MODEL_RESTRAINT_SOURCE_INVALID'));
  }
  if (classification.gapActive) return both(nonlinearDisposition('MODEL_RESTRAINT_GAP_UNSUPPORTED'));
  if (classification.frictionActive) return both(nonlinearDisposition('MODEL_RESTRAINT_FRICTION_UNSUPPORTED'));
  if (classification.connectingNodeActive) return both(unsupportedDisposition('MODEL_RESTRAINT_CONNECTING_NODE_UNSUPPORTED'));
  if (classification.finiteStiffnessActive) return both(unsupportedDisposition('MODEL_RESTRAINT_FINITE_STIFFNESS_UNSUPPORTED'));
  if (classification.typeCode === '0') return both(exactDisposition());
  if (!classification.direction.valid) return both(invalidDisposition('MODEL_RESTRAINT_SOURCE_INVALID'));
  if (SNUBBER_CODES.has(classification.typeCode)) {
    return both(unsupportedDisposition('MODEL_RESTRAINT_SNUBBER_STATIC_SCOPE_UNSUPPORTED'));
  }
  if (UNILATERAL_TRANSLATION_CODES.has(classification.typeCode)) {
    return {
      [STRICT]: nonlinearDisposition('MODEL_RESTRAINT_UNILATERAL_UNSUPPORTED'),
      [APPROXIMATE]: approximationDisposition('GENERIC_APPROX_UNILATERAL_LINEARIZED'),
    };
  }
  if (BILATERAL_TRANSLATION_CODES.has(classification.typeCode)) {
    if (classification.direction.axisAligned) return both(exactDisposition());
    return {
      [STRICT]: unsupportedDisposition('MODEL_RESTRAINT_SKEW_UNSUPPORTED'),
      [APPROXIMATE]: approximationDisposition('GENERIC_APPROX_SKEW_DIRECTION_SNAPPED'),
    };
  }
  return both(unsupportedDisposition('MODEL_RESTRAINT_TYPE_UNSUPPORTED'));
}

function normalizedDirection(value) {
  const vector = [value?.x, value?.y, value?.z];
  const finite = vector.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
  const magnitude = finite ? Math.hypot(...vector) : null;
  if (!finite || !(magnitude > AXIS_TOLERANCE)) {
    return Object.freeze({ vector: Object.freeze(vector), magnitude, valid: false, axisAligned: false, dominantAxis: null });
  }
  const unit = vector.map((entry) => entry / magnitude);
  const valid = Math.abs(magnitude - 1) <= AXIS_TOLERANCE;
  const magnitudes = unit.map(Math.abs);
  const maximum = Math.max(...magnitudes);
  const dominantIndex = magnitudes.indexOf(maximum);
  const axisAligned = valid && Math.abs(maximum - 1) <= AXIS_TOLERANCE
    && magnitudes.filter((_entry, index) => index !== dominantIndex).every((entry) => entry <= AXIS_TOLERANCE);
  return Object.freeze({
    vector: Object.freeze(vector),
    unit: Object.freeze(unit),
    magnitude,
    valid,
    axisAligned,
    dominantAxis: ['UX', 'UY', 'UZ'][dominantIndex],
  });
}

function targetDof(typeCode, direction) {
  if (typeCode === '0') return 'ALL';
  if (DIRECT_AXIS[typeCode] && !direction.valid) return DIRECT_AXIS[typeCode];
  return direction.dominantAxis;
}

function recordActive(collection, record) {
  if (collection === 'temperatureSets') {
    return record.canonicalValue !== null && !record.sentinel?.matched;
  }
  if (collection === 'pressureSets') {
    return finiteNonzero(record.canonicalValue) && !record.sentinel?.matched;
  }
  return true;
}

function inventoryRow(value) {
  return Object.freeze({
    inventoryId: value.inventoryId,
    sourceFeatureId: value.sourceFeatureId,
    sourceKind: value.sourceKind,
    sourceSetId: value.sourceSetId,
    active: value.active,
    sourceElementIndex: value.sourceElementIndex,
    sourcePath: value.sourcePath,
    targetIds: Object.freeze({
      nodeIds: Object.freeze(uniqueAscii(value.targetIds.nodeIds)),
      segmentIds: Object.freeze(uniqueAscii(value.targetIds.segmentIds)),
    }),
    sourceRecordSemanticHash: semanticHash(value.sourceRecord),
    classification: Object.freeze(value.classification),
    dispositionByProfile: Object.freeze(value.dispositions),
  });
}

function recordsForSegment(sourceRecords, segmentId) {
  const result = {};
  for (const [key, rows] of Object.entries(sourceRecords)) {
    if (key === 'schema') continue;
    result[key] = rows.filter((row) => row.segmentId === segmentId);
  }
  return result;
}

function sourceKind(collection) {
  const map = {
    restraints: 'RESTRAINT', bends: 'BEND', reducers: 'REDUCER', rigids: 'RIGID',
    sifs: 'SIF', hangers: 'HANGER', forcesMoments: 'FORCES_MOMENTS',
    prescribedMovements: 'PRESCRIBED_MOVEMENT', temperatureSets: 'TEMPERATURE',
    pressureSets: 'PRESSURE', allowableStress: 'ALLOWABLE_STRESS',
    unknownActiveRecords: 'UNKNOWN_ACTIVE_RECORD',
  };
  return map[collection] ?? collection.toUpperCase();
}

function both(disposition) {
  return { [STRICT]: disposition, [APPROXIMATE]: disposition };
}

function finitePositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function finiteNonzero(value) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) > AXIS_TOLERANCE;
}

function uniqueAscii(values) {
  return [...new Set((values ?? []).filter((value) => value !== null && value !== undefined).map(String))].sort(compareAscii);
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
