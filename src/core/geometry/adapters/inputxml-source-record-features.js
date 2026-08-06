import { attributeValue, findAnyElements, findElements } from './inputxml-tag-scanner.js';
import { INPUTXML_FEATURE_TAGS, INPUTXML_KNOWN_CHILD_TAGS, INPUTXML_RESTRAINT_FIELD_NAMES } from './inputxml-feature-registry.js';
import { inputXmlSourceFeatureId } from './inputxml-source-bundle-contract.js';
import {
  cleanNodeId,
  convertDeclaredValue,
  convertOptionalAttribute,
  deferredTypeDependentValue,
  dimensionlessValue,
  directOptionalLength,
  inheritedSetRecord,
  nodeReferenceValue,
  rawFiniteNumber,
  sentinelRecord,
} from './inputxml-source-record-values.js';

export function collectTemperaturePressureRecords(edge, unitSystem, temperatureCarry, pressureCarry, sourceRecords, diagnostics) {
  for (let setNumber = 1; setNumber <= 9; setNumber += 1) {
    const temperature = inheritedSetRecord({
      edge,
      setNumber,
      attribute: `TEMP_EXP_C${setNumber}`,
      sourceKind: 'TEMPERATURE',
      quantity: 'TEMP',
      declaration: unitSystem.temperature,
      carry: temperatureCarry,
      diagnostics,
    });
    if (temperature) sourceRecords.temperatureSets.push(temperature);

    const pressure = inheritedSetRecord({
      edge,
      setNumber,
      attribute: `PRESSURE${setNumber}`,
      sourceKind: 'PRESSURE',
      quantity: 'PRESSURE',
      declaration: unitSystem.pressure,
      carry: pressureCarry,
      diagnostics,
    });
    if (pressure) sourceRecords.pressureSets.push(pressure);
  }
}

export function collectChildFeatureRecords(edge, unitSystem, sourceRecords, diagnostics) {
  collectRestraints(edge, unitSystem, sourceRecords.restraints, diagnostics);
  collectBends(edge, unitSystem, sourceRecords.bends, diagnostics);
  collectReducers(edge, unitSystem, sourceRecords.reducers, diagnostics);
  collectRigids(edge, unitSystem, sourceRecords.rigids, diagnostics);
  collectSifs(edge, sourceRecords.sifs);
  collectHangers(edge, sourceRecords.hangers);
  collectForcesMoments(edge, unitSystem, sourceRecords.forcesMoments, diagnostics);
  collectPrescribedMovements(edge, sourceRecords.prescribedMovements);
  collectAllowableStress(edge, sourceRecords.allowableStress);
  collectUnknownActiveRecords(edge, sourceRecords.unknownActiveRecords);
}

function collectRestraints(edge, unitSystem, output, diagnostics) {
  findAnyElements(edge.tag.inner, INPUTXML_FEATURE_TAGS.RESTRAINT).forEach((tag, ordinal) => {
    const attrs = tag.attributes;
    const nodeId = cleanNodeId(attributeValue(attrs, ...INPUTXML_RESTRAINT_FIELD_NAMES.node)) || null;
    const connectingNode = nodeReferenceValue(
      attributeValue(attrs, ...INPUTXML_RESTRAINT_FIELD_NAMES.connectingNode),
    );
    output.push(Object.freeze({
      ...featureBase('RESTRAINT', edge, ordinal, nodeId),
      sourceTypeRaw: attributeValue(attrs, ...INPUTXML_RESTRAINT_FIELD_NAMES.type) || null,
      directionCosines: Object.freeze({
        x: rawFiniteNumber(attributeValue(attrs, ...INPUTXML_RESTRAINT_FIELD_NAMES.xCosine)),
        y: rawFiniteNumber(attributeValue(attrs, ...INPUTXML_RESTRAINT_FIELD_NAMES.yCosine)),
        z: rawFiniteNumber(attributeValue(attrs, ...INPUTXML_RESTRAINT_FIELD_NAMES.zCosine)),
      }),
      stiffness: deferredTypeDependentValue(attributeValue(attrs, ...INPUTXML_RESTRAINT_FIELD_NAMES.stiffness)),
      gap: directOptionalLength(attributeValue(attrs, ...INPUTXML_RESTRAINT_FIELD_NAMES.gap), unitSystem, diagnostics, edge.index, 'GAP'),
      frictionCoefficient: dimensionlessValue(attributeValue(attrs, ...INPUTXML_RESTRAINT_FIELD_NAMES.frictionCoefficient)),
      connectingNode,
      connectingNodeId: connectingNode.nodeId,
    }));
  });
}

function collectBends(edge, unitSystem, output, diagnostics) {
  findAnyElements(edge.tag.inner, INPUTXML_FEATURE_TAGS.BEND).forEach((tag, ordinal) => {
    const attrs = tag.attributes;
    output.push(Object.freeze({
      ...featureBase('BEND', edge, ordinal),
      radius: directOptionalLength(attributeValue(attrs, 'RADIUS'), unitSystem, diagnostics, edge.index, 'RADIUS'),
      angle1: dimensionlessValue(attributeValue(attrs, 'ANGLE1')),
      angle2: dimensionlessValue(attributeValue(attrs, 'ANGLE2')),
      numMiter: dimensionlessValue(attributeValue(attrs, 'NUM_MITER')),
      node1: cleanNodeId(attributeValue(attrs, 'NODE1')) || null,
      node2: cleanNodeId(attributeValue(attrs, 'NODE2')) || null,
    }));
  });
}

function collectReducers(edge, unitSystem, output, diagnostics) {
  findAnyElements(edge.tag.inner, INPUTXML_FEATURE_TAGS.REDUCER).forEach((tag, ordinal) => {
    const attrs = tag.attributes;
    const length = (...names) => directOptionalLength(attributeValue(attrs, ...names), unitSystem, diagnostics, edge.index, names[0]);
    output.push(Object.freeze({
      ...featureBase('REDUCER', edge, ordinal),
      diameter2: length('DIAMETERS2', 'DIAMETER2'),
      thickness2: length('THICKNESS2'),
      alpha: dimensionlessValue(attributeValue(attrs, 'ALPHA')),
      radius1: length('R1'),
      radius2: length('R2'),
      length1: length('L1'),
      length2: length('L2'),
    }));
  });
}

function collectRigids(edge, unitSystem, output, diagnostics) {
  findAnyElements(edge.tag.inner, INPUTXML_FEATURE_TAGS.RIGID).forEach((tag, ordinal) => {
    const rawWeight = attributeValue(tag.attributes, 'WEIGHT');
    const parsed = rawFiniteNumber(rawWeight);
    const sentinel = sentinelRecord(parsed);
    const converted = parsed === null || sentinel.matched
      ? { value: sentinel.matched ? 0 : null, unit: 'N', evidence: null }
      : convertDeclaredValue(parsed, unitSystem.force, 'FORCE', diagnostics, edge.index, 'RIGID.WEIGHT');
    output.push(Object.freeze({
      ...featureBase('RIGID', edge, ordinal),
      rawType: attributeValue(tag.attributes, 'TYPE', 'RIGID_TYPE') || null,
      weight: Object.freeze({
        rawText: rawWeight || null,
        parsedValue: parsed,
        sentinel,
        canonicalValue: converted.value,
        canonicalUnit: converted.unit,
        conversionEvidence: converted.evidence,
      }),
    }));
  });
}

function collectSifs(edge, output) {
  findAnyElements(edge.tag.inner, INPUTXML_FEATURE_TAGS.SIF).forEach((tag, ordinal) => {
    const nodeId = cleanNodeId(attributeValue(tag.attributes, 'NODE')) || null;
    output.push(Object.freeze({
      ...featureBase('SIF', edge, ordinal, nodeId),
      typeCode: rawFiniteNumber(attributeValue(tag.attributes, 'TYPE')),
      inPlane: rawFiniteNumber(attributeValue(tag.attributes, 'SIF_IN')),
      outOfPlane: rawFiniteNumber(attributeValue(tag.attributes, 'SIF_OUT')),
    }));
  });
}

function collectHangers(edge, output) {
  findAnyElements(edge.tag.inner, INPUTXML_FEATURE_TAGS.HANGER).forEach((tag, ordinal) => {
    const nodeId = cleanNodeId(attributeValue(tag.attributes, 'NODE')) || null;
    output.push(Object.freeze({
      ...featureBase('HANGER', edge, ordinal, nodeId),
      hangerTable: rawFiniteNumber(attributeValue(tag.attributes, 'HGR_TABLE')),
      loadVariation: rawFiniteNumber(attributeValue(tag.attributes, 'LOAD_VAR')),
    }));
  });
}

function collectForcesMoments(edge, unitSystem, output, diagnostics) {
  findAnyElements(edge.tag.inner, INPUTXML_FEATURE_TAGS.FORCES_MOMENTS).forEach((tag, ordinal) => {
    const nodeId = cleanNodeId(attributeValue(tag.attributes, 'NODE_NUM', 'NODE')) || null;
    const vectors = findElements(tag.inner, 'VECTOR').map((vector) => Object.freeze({
      number: rawFiniteNumber(attributeValue(vector.attributes, 'NUMBER')),
      force: Object.freeze({
        fx: convertOptionalAttribute(vector.attributes, 'FX', unitSystem.force, 'FORCE', diagnostics, edge.index),
        fy: convertOptionalAttribute(vector.attributes, 'FY', unitSystem.force, 'FORCE', diagnostics, edge.index),
        fz: convertOptionalAttribute(vector.attributes, 'FZ', unitSystem.force, 'FORCE', diagnostics, edge.index),
      }),
      moment: Object.freeze({
        mx: convertOptionalAttribute(vector.attributes, 'MX', unitSystem.momentInput, 'MOMENT-INPUT', diagnostics, edge.index),
        my: convertOptionalAttribute(vector.attributes, 'MY', unitSystem.momentInput, 'MOMENT-INPUT', diagnostics, edge.index),
        mz: convertOptionalAttribute(vector.attributes, 'MZ', unitSystem.momentInput, 'MOMENT-INPUT', diagnostics, edge.index),
      }),
    }));
    output.push(Object.freeze({
      ...featureBase('FORCES_MOMENTS', edge, ordinal, nodeId),
      forceMomentNumber: rawFiniteNumber(attributeValue(tag.attributes, 'FORCMNT_NUM')),
      vectors: Object.freeze(vectors),
    }));
  });
}

function collectPrescribedMovements(edge, output) {
  findAnyElements(edge.tag.inner, INPUTXML_FEATURE_TAGS.PRESCRIBED_MOVEMENT).forEach((tag, ordinal) => {
    output.push(Object.freeze({
      ...featureBase('PRESCRIBED_MOVEMENT', edge, ordinal, cleanNodeId(attributeValue(tag.attributes, 'NODE')) || null),
      attributes: Object.freeze({ ...tag.attributes }),
    }));
  });
}

function collectAllowableStress(edge, output) {
  findAnyElements(edge.tag.inner, INPUTXML_FEATURE_TAGS.ALLOWABLE_STRESS).forEach((tag, ordinal) => {
    output.push(Object.freeze({
      ...featureBase('ALLOWABLE_STRESS', edge, ordinal),
      attributes: Object.freeze({ ...tag.attributes }),
    }));
  });
}

function collectUnknownActiveRecords(edge, output) {
  const names = childTagNames(edge.tag.inner);
  let ordinal = 0;
  for (const tagName of names) {
    if (INPUTXML_KNOWN_CHILD_TAGS.has(tagName)) continue;
    const matches = findElements(edge.tag.inner, tagName);
    for (const tag of matches) {
      if (Object.keys(tag.attributes).length === 0 && !String(tag.inner).trim()) continue;
      output.push(Object.freeze({
        ...featureBase('UNKNOWN_ACTIVE_RECORD', edge, ordinal),
        tagName,
        attributeNames: Object.freeze(Object.keys(tag.attributes).sort(compareAscii)),
        childTagNames: Object.freeze(childTagNames(tag.inner)),
      }));
      ordinal += 1;
    }
  }
}

function featureBase(kind, edge, ordinal, nodeId = null) {
  return {
    sourceFeatureId: inputXmlSourceFeatureId(kind, edge.index, ordinal),
    sourceElementIndex: edge.index,
    sourceElementNumber: edge.index + 1,
    sourcePath: `${elementSourcePath(edge.index)}/${kind}[${ordinal}]`,
    segmentId: `IX-S${edge.index + 1}`,
    nodeId,
  };
}

export function childFeatureIdsForElement(sourceRecords, sourceElementIndex) {
  const ids = [];
  for (const [key, rows] of Object.entries(sourceRecords)) {
    if (key === 'schema') continue;
    for (const row of rows) {
      if (row.sourceElementIndex === sourceElementIndex && row.sourceFeatureId) ids.push(row.sourceFeatureId);
    }
  }
  return ids.sort(compareAscii);
}

function childTagNames(inner) {
  const names = new Set();
  const pattern = /<\s*(?!\/)(?:[\w.-]+:)?([A-Za-z_][\w.-]*)\b/gu;
  let match = pattern.exec(inner);
  while (match) {
    names.add(match[1].toUpperCase());
    match = pattern.exec(inner);
  }
  return [...names].sort(compareAscii);
}

function elementSourcePath(index) {
  return `PIPINGMODEL/PIPINGELEMENT[${index}]`;
}

export function compareSourceFeature(left, right) {
  return compareAscii(left.sourceFeatureId ?? '', right.sourceFeatureId ?? '');
}

export function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = a.charCodeAt(index) - b.charCodeAt(index);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  if (a.length === b.length) return 0;
  return a.length < b.length ? -1 : 1;
}
