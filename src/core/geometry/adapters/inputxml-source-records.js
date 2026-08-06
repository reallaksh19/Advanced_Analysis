import { attributeValue } from './inputxml-tag-scanner.js';
import { INPUTXML_ELEMENT_FIELD_REGISTRY, isKnownInputXmlElementAttribute } from './inputxml-feature-registry.js';
import { INPUTXML_SOURCE_RECORDS_SCHEMA } from './inputxml-source-bundle-contract.js';
import { directNumericValue, elementFieldRecord } from './inputxml-source-record-values.js';
import {
  childFeatureIdsForElement,
  collectChildFeatureRecords,
  collectTemperaturePressureRecords,
  compareAscii,
  compareSourceFeature,
} from './inputxml-source-record-features.js';

export function buildInputXmlSourceRecords({ edges, segments, unitSystem, diagnostics }) {
  const segmentByIndex = new Map(
    segments.map((segment) => [segment.meta?.sourceIndex, segment]),
  );
  const elementCarry = new Map();
  const temperatureCarry = new Map();
  const pressureCarry = new Map();
  const sourceRecords = {
    schema: INPUTXML_SOURCE_RECORDS_SCHEMA,
    restraints: [],
    bends: [],
    reducers: [],
    rigids: [],
    sifs: [],
    hangers: [],
    forcesMoments: [],
    prescribedMovements: [],
    temperatureSets: [],
    pressureSets: [],
    allowableStress: [],
    unknownActiveRecords: [],
  };

  const elementRecords = edges.map((edge) => {
    const segment = segmentByIndex.get(edge.index) ?? null;
    const sourcePath = elementSourcePath(edge.index);
    const fields = {};
    for (const [field, definition] of Object.entries(INPUTXML_ELEMENT_FIELD_REGISTRY)) {
      fields[field] = elementFieldRecord({
        edge,
        segment,
        field,
        definition,
        carry: elementCarry,
        unitSystem,
        diagnostics,
      });
    }
    const delta = Object.freeze({
      x: directNumericValue(edge.attrs, ['DELTA_X', 'DX'], 'LENGTH', unitSystem, diagnostics, edge.index),
      y: directNumericValue(edge.attrs, ['DELTA_Y', 'DY'], 'LENGTH', unitSystem, diagnostics, edge.index),
      z: directNumericValue(edge.attrs, ['DELTA_Z', 'DZ'], 'LENGTH', unitSystem, diagnostics, edge.index),
    });

    collectTemperaturePressureRecords(edge, unitSystem, temperatureCarry, pressureCarry, sourceRecords, diagnostics);
    collectChildFeatureRecords(edge, unitSystem, sourceRecords, diagnostics);

    return Object.freeze({
      sourceElementIndex: edge.index,
      sourceElementNumber: edge.index + 1,
      sourcePath,
      segmentId: segment?.id ?? null,
      fromNodeId: edge.fromNode,
      toNodeId: edge.toNode,
      delta,
      fields: Object.freeze(fields),
      childFeatureIds: Object.freeze(childFeatureIdsForElement(sourceRecords, edge.index)),
      unrecognizedAttributeNames: Object.freeze(
        Object.keys(edge.attrs)
          .filter((name) => !isKnownInputXmlElementAttribute(name))
          .sort(compareAscii),
      ),
    });
  });

  for (const [key, rows] of Object.entries(sourceRecords)) {
    if (key === 'schema') continue;
    rows.sort(compareSourceFeature);
    sourceRecords[key] = Object.freeze(rows);
  }
  return Object.freeze({
    elementRecords: Object.freeze(elementRecords),
    sourceRecords: Object.freeze(sourceRecords),
  });
}

function elementSourcePath(index) {
  return `PIPINGMODEL/PIPINGELEMENT[${index}]`;
}
