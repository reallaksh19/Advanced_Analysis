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

const NUMERIC_TOLERANCE = 1e-12;
const CAESAR_UNSET_SENTINEL = -1.0101;
const CAESAR_SENTINEL_TOLERANCE = 0.001;
const RESTRAINT_DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const GENERIC_LINEARIZED_UNILATERAL_CODES = new Set(['14', '15']);
const SIF_TEE_CODES = new Set([3, 5]);

export function buildInputXmlFeatureInventory(sourceBundle) {
  if (!sourceBundle || !Array.isArray(sourceBundle.elementRecords)
    || !Array.isArray(sourceBundle.geometry?.segments)) {
    throw new TypeError('InputXML feature inventory requires a retained source bundle.');
  }
  const segmentById = new Map(
    sourceBundle.geometry.segments.map((segment) => [String(segment.id), segment]),
  );
  const rows = [];
  for (const element of sourceBundle.elementRecords) {
    const segment = element.canonicalSegmentId === null
      ? null
      : segmentById.get(String(element.canonicalSegmentId)) ?? null;
    const componentKind = componentKindOf(element, segment);
    const componentInventoryId = `${element.sourceFeatureId}/COMPONENT`;
    rows.push(inventoryRow({
      inventoryId: componentInventoryId,
      sourceFeatureId: element.sourceFeatureId,
      sourceKind: 'ELEMENT_COMPONENT',
      active: true,
      sourceIndex: element.sourceIndex,
      targetIds: {
        nodeIds: [element.fromNodeId, element.toNodeId],
        segmentIds: [element.canonicalSegmentId],
      },
      sourceRecord: element,
      classification: {
        componentKind,
        canonicalStatus: element.canonicalStatus,
        canonicalSegmentType: segment?.type ?? element.canonicalSegmentType ?? null,
      },
      dispositions: componentDispositions(componentKind, element.canonicalStatus),
    }));

    for (const feature of element.childFeatures ?? []) {
      rows.push(childInventory({
        element,
        feature,
        segment,
        componentInventoryId,
      }));
    }
    rows.push(...fieldInventory(element, segment));
  }
  rows.sort((left, right) => compareAscii(left.inventoryId, right.inventoryId));
  requireUniqueInventory(rows);
  return Object.freeze(rows);
}

function childInventory({ element, feature, segment, componentInventoryId }) {
  const kind = String(feature.kind ?? 'UNKNOWN').toUpperCase();
  const sourceFeatureId = String(feature.sourceFeatureId);
  const common = {
    inventoryId: sourceFeatureId,
    sourceFeatureId,
    sourceKind: kind,
    active: true,
    sourceIndex: element.sourceIndex,
    targetIds: {
      nodeIds: childNodeIds(feature.rawAttributes, element),
      segmentIds: [element.canonicalSegmentId],
    },
    sourceRecord: feature,
  };
  if (['BEND', 'REDUCER', 'RIGID'].includes(kind)) {
    return inventoryRow({
      ...common,
      classification: {
        kind,
        mechanicsOwnedByInventoryId: componentInventoryId,
      },
      dispositions: componentDispositions(kind, element.canonicalStatus),
    });
  }
  if (kind === 'SIF') {
    const typeCode = numericAttribute(feature.rawAttributes, ['TYPE']);
    return inventoryRow({
      ...common,
      classification: {
        kind,
        typeCode,
        codeInputSupported: typeCode !== null && SIF_TEE_CODES.has(typeCode),
      },
      dispositions: both(codeOnlyDisposition('CODE_STRESS_INPUT_ONLY')),
    });
  }
  if (kind === 'ALLOWABLE_STRESS') {
    return inventoryRow({
      ...common,
      classification: { kind },
      dispositions: both(codeOnlyDisposition('CODE_STRESS_INPUT_ONLY')),
    });
  }
  if (kind === 'HANGER') {
    return inventoryRow({
      ...common,
      classification: { kind },
      dispositions: both(unsupportedDisposition('MODEL_HANGER_UNSUPPORTED')),
    });
  }
  if (kind === 'FORCES_MOMENTS') {
    return inventoryRow({
      ...common,
      classification: { kind },
      dispositions: both(unsupportedDisposition('MODEL_NODAL_FORCE_VECTOR_NOT_COMPILED')),
    });
  }
  if (kind === 'RESTRAINT') {
    const classification = classifyRestraint(feature.rawAttributes, element, segment);
    return inventoryRow({
      ...common,
      active: classification.active,
      classification,
      dispositions: restraintDispositions(classification),
    });
  }
  return inventoryRow({
    ...common,
    classification: { kind },
    dispositions: both(invalidDisposition('MODEL_SOURCE_FEATURE_UNCLASSIFIED')),
  });
}

function fieldInventory(element, segment) {
  const rows = [];
  const temperature = element.fieldEvidence?.TEMP_EXP_C1;
  if (temperature) {
    const active = finiteNumber(temperature.canonicalValue) !== null;
    rows.push(inventoryRow({
      inventoryId: `${element.sourceFeatureId}/FIELD[TEMP_EXP_C1]`,
      sourceFeatureId: `${element.sourceFeatureId}/FIELD[TEMP_EXP_C1]`,
      sourceKind: 'TEMPERATURE_INPUT',
      active,
      sourceIndex: element.sourceIndex,
      targetIds: { nodeIds: [], segmentIds: [element.canonicalSegmentId] },
      sourceRecord: temperature,
      classification: {
        field: 'TEMP_EXP_C1',
        sourceDisposition: temperature.disposition,
        canonicalValue: temperature.canonicalValue,
      },
      dispositions: active ? both(exactDisposition()) : both(inactiveDisposition()),
    }));
  }
  const pressure = element.fieldEvidence?.PRESSURE1;
  if (pressure) {
    const value = finiteNumber(pressure.canonicalValue);
    const active = value !== null && Math.abs(value) > NUMERIC_TOLERANCE;
    rows.push(inventoryRow({
      inventoryId: `${element.sourceFeatureId}/FIELD[PRESSURE1]`,
      sourceFeatureId: `${element.sourceFeatureId}/FIELD[PRESSURE1]`,
      sourceKind: 'PRESSURE_INPUT',
      active,
      sourceIndex: element.sourceIndex,
      targetIds: { nodeIds: [], segmentIds: [element.canonicalSegmentId] },
      sourceRecord: pressure,
      classification: {
        field: 'PRESSURE1',
        sourceDisposition: pressure.disposition,
        canonicalValue: pressure.canonicalValue,
        currentAuthorizedEffects: segment?.meta?.analysis?.pressure == null
          ? null
          : Object.freeze({ codeStress: true, pressureStiffening: false, axialThrust: false, bourdon: false }),
      },
      dispositions: active
        ? {
          [STRICT]: unsupportedDisposition('MODEL_PRESSURE_STRUCTURAL_EFFECTS_UNREPRESENTED'),
          [APPROXIMATE]: approximationDisposition('GENERIC_APPROX_PRESSURE_CODE_ONLY'),
        }
        : both(inactiveDisposition()),
    }));
  }
  return rows;
}

function componentKindOf(element, segment) {
  const childKinds = new Set((element.childFeatures ?? []).map((feature) => String(feature.kind).toUpperCase()));
  if (childKinds.has('RIGID') || ['VALVE', 'FLANGE'].includes(segment?.type)) return 'RIGID';
  if (childKinds.has('BEND') || segment?.type === 'BEND') return 'BEND';
  if (childKinds.has('REDUCER')) return 'REDUCER';
  if (segment?.type === 'TEE' || hasTeeSif(element.childFeatures ?? [])) return 'TEE';
  if (segment?.type === 'PIPE') return 'STRAIGHT_PIPE';
  return segment?.type ? String(segment.type) : 'UNRESOLVED';
}

function hasTeeSif(features) {
  return features.some((feature) => (
    String(feature.kind).toUpperCase() === 'SIF'
      && SIF_TEE_CODES.has(numericAttribute(feature.rawAttributes, ['TYPE']))
  ));
}

function componentDispositions(componentKind, canonicalStatus = 'RECONCILED') {
  if (canonicalStatus !== 'RECONCILED') {
    return both(invalidDisposition('MODEL_COMPONENT_SOURCE_UNRECONCILED'));
  }
  if (componentKind === 'STRAIGHT_PIPE' || componentKind === 'RIGID') {
    return both(exactDisposition());
  }
  const limitation = componentKind === 'BEND'
    ? 'GENERIC_APPROX_BEND_STRAIGHT_CHORD'
    : componentKind === 'REDUCER'
      ? 'GENERIC_APPROX_REDUCER_UNIFORM_SECTION'
      : componentKind === 'TEE'
        ? 'GENERIC_APPROX_TEE_FRAME_BRANCH_NO_FLEXIBILITY'
        : null;
  if (limitation === null) {
    return both(unsupportedDisposition('MODEL_COMPONENT_TYPE_UNSUPPORTED'));
  }
  return {
    [STRICT]: unsupportedDisposition(`MODEL_${componentKind}_EXACT_MECHANICS_UNAVAILABLE`),
    [APPROXIMATE]: approximationDisposition(limitation),
  };
}

function classifyRestraint(attributes, element, segment) {
  const rawType = attribute(attributes, ['TYPE']);
  const mutation = resolveRestraintTypeMutation(rawType);
  const typeCode = mutation.typeCode;
  const nodeId = normalizedNodeAttribute(attributes, ['NODE'])
    ?? element.toNodeId
    ?? element.fromNodeId
    ?? null;
  const direction = directionOf(attributes);
  const gap = caesarOptionalNumber(attributes, ['GAP', 'GAP1']);
  const friction = caesarOptionalNumber(attributes, ['FRIC_COEF', 'FRICTION', 'MU']);
  const connectingNodeId = normalizedNodeAttribute(attributes, ['CNODE', 'CONNECTING_NODE', 'NODE2']);
  const stiffness = caesarOptionalNumber(attributes, ['STIFF', 'STIFFNESS', 'K']);
  const targetDofs = targetDofsOf(typeCode, direction);
  const targetDof = targetDofs.length === RESTRAINT_DOFS.length ? 'ALL' : targetDofs[0] ?? null;
  const active = rawType !== null || nodeId !== null;
  return Object.freeze({
    active,
    rawType,
    typeCode,
    typeLabel: restraintTypeCodeLabel(typeCode),
    mutation,
    nodeId,
    targetDof,
    targetDofs: Object.freeze(targetDofs),
    direction,
    gapActive: finiteNonzero(gap),
    frictionActive: finitePositive(friction),
    connectingNodeActive: connectingNodeId !== null,
    connectingNodeId,
    finiteStiffnessActive: finitePositive(stiffness),
    canonicalNodeRestraint: canonicalNodeRestraint(segment, nodeId),
  });
}

function restraintDispositions(classification) {
  if (!classification.active) return both(inactiveDisposition());
  if (classification.typeCode === null || classification.typeLabel === null || classification.nodeId === null) {
    return both(invalidDisposition('MODEL_RESTRAINT_SOURCE_INVALID'));
  }
  if (classification.gapActive) return both(nonlinearDisposition('MODEL_RESTRAINT_GAP_UNSUPPORTED'));
  if (classification.frictionActive) return both(nonlinearDisposition('MODEL_RESTRAINT_FRICTION_UNSUPPORTED'));
  if (classification.connectingNodeActive) {
    return both(unsupportedDisposition('MODEL_RESTRAINT_CONNECTING_NODE_UNSUPPORTED'));
  }
  if (classification.finiteStiffnessActive) {
    return both(unsupportedDisposition('MODEL_RESTRAINT_FINITE_STIFFNESS_UNSUPPORTED'));
  }
  if (classification.typeCode === '0') return both(exactDisposition());
  if (GENERIC_LINEARIZED_UNILATERAL_CODES.has(classification.typeCode)) {
    if (!classification.direction.valid || classification.targetDofs.length !== 1) {
      return both(invalidDisposition('MODEL_RESTRAINT_DIRECTION_INVALID'));
    }
    return {
      [STRICT]: nonlinearDisposition('MODEL_RESTRAINT_UNILATERAL_UNSUPPORTED'),
      [APPROXIMATE]: approximationDisposition('GENERIC_APPROX_UNILATERAL_LINEARIZED'),
    };
  }
  return both(unsupportedDisposition('MODEL_RESTRAINT_TYPE_NOT_COMPILED'));
}

function targetDofsOf(typeCode, direction) {
  if (typeCode === '0') return [...RESTRAINT_DOFS];
  if (!direction.valid || direction.dominantAxis === null) return [];
  return [direction.dominantAxis];
}

function directionOf(attributes) {
  const vector = [
    numericAttribute(attributes, ['XCOSINE']),
    numericAttribute(attributes, ['YCOSINE']),
    numericAttribute(attributes, ['ZCOSINE']),
  ];
  if (vector.every((value) => value === null)) {
    return Object.freeze({ vector: Object.freeze(vector), valid: false, dominantAxis: null });
  }
  if (!vector.every((value) => value !== null)) {
    return Object.freeze({ vector: Object.freeze(vector), valid: false, dominantAxis: null });
  }
  const magnitude = Math.hypot(...vector);
  if (!(magnitude > NUMERIC_TOLERANCE)) {
    return Object.freeze({ vector: Object.freeze(vector), magnitude, valid: false, dominantAxis: null });
  }
  const unit = vector.map((value) => value / magnitude);
  const absolute = unit.map(Math.abs);
  const dominantIndex = absolute.indexOf(Math.max(...absolute));
  return Object.freeze({
    vector: Object.freeze(vector),
    unit: Object.freeze(unit),
    magnitude,
    valid: Math.abs(magnitude - 1) <= 1e-9,
    dominantAxis: ['UX', 'UY', 'UZ'][dominantIndex],
  });
}

function canonicalNodeRestraint(segment, nodeId) {
  if (!segment || nodeId === null) return null;
  if (String(segment.startNodeId) === String(nodeId)) return 'START_NODE';
  if (String(segment.endNodeId) === String(nodeId)) return 'END_NODE';
  return 'UNBOUND_NODE';
}

function childNodeIds(attributes, element) {
  const nodeId = normalizedNodeAttribute(attributes, ['NODE', 'NODE_NUM']);
  return [nodeId, element.fromNodeId, element.toNodeId];
}

function inventoryRow(value) {
  return Object.freeze({
    inventoryId: value.inventoryId,
    sourceFeatureId: value.sourceFeatureId,
    sourceKind: value.sourceKind,
    active: value.active,
    sourceIndex: value.sourceIndex,
    targetIds: Object.freeze({
      nodeIds: Object.freeze(uniqueAscii(value.targetIds.nodeIds)),
      segmentIds: Object.freeze(uniqueAscii(value.targetIds.segmentIds)),
    }),
    sourceRecordSemanticHash: semanticHash(value.sourceRecord),
    classification: Object.freeze(value.classification),
    dispositionByProfile: Object.freeze(value.dispositions),
  });
}

function requireUniqueInventory(rows) {
  const ids = new Set();
  for (const row of rows) {
    if (ids.has(row.inventoryId)) {
      throw new TypeError(`InputXML feature inventory identity ${row.inventoryId} is duplicated.`);
    }
    ids.add(row.inventoryId);
  }
}

function both(disposition) {
  return Object.freeze({ [STRICT]: disposition, [APPROXIMATE]: disposition });
}

function attribute(attributes, names) {
  for (const name of names) {
    const key = Object.keys(attributes ?? {}).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    if (key !== undefined) {
      const text = String(attributes[key] ?? '').trim();
      return text.length > 0 ? text : null;
    }
  }
  return null;
}

function numericAttribute(attributes, names) {
  const value = attribute(attributes, names);
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function caesarOptionalNumber(attributes, names) {
  const value = numericAttribute(attributes, names);
  if (value === null) return null;
  return Math.abs(value - CAESAR_UNSET_SENTINEL) < CAESAR_SENTINEL_TOLERANCE
    ? null
    : value;
}

function normalizedNodeAttribute(attributes, names) {
  const value = attribute(attributes, names);
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : value;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function finitePositive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > NUMERIC_TOLERANCE;
}

function finiteNonzero(value) {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) > NUMERIC_TOLERANCE;
}

function uniqueAscii(values) {
  return [...new Set((values ?? [])
    .filter((value) => value !== null && value !== undefined)
    .map(String))].sort(compareAscii);
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
