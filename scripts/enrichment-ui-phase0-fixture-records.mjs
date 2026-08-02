import assert from 'node:assert/strict';
import { ENGINEERING_FIELDS, LINE_FLAG } from './enrichment-ui-phase0-fixture-schema.mjs';
import { componentTargetId, countFlag, hashFixture } from './enrichment-ui-phase0-fixture-build.mjs';
import { sha256Text, stableStringify } from './enrichment-ui-phase0-fixture-codec.mjs';

export function sourceLocatorsForLine(fixture, lineOrdinal) {
  assert(Number.isSafeInteger(lineOrdinal) && lineOrdinal >= 0 && lineOrdinal < fixture.manifest.lineCount,
    'E_QF_SCHEMA_INVALID: line ordinal');
  const count = fixture.lines.sourceLocatorCountByOrdinal[lineOrdinal];
  const locators = [{
    sourceKind: 'MODEL',
    sourceHash: fixture.sourceHashes.model,
    locator: fixture.lines.modelPathByOrdinal[lineOrdinal],
  }];
  if (count >= 2) {
    locators.push({
      sourceKind: 'LINE_LIST',
      sourceHash: fixture.sourceHashes.lineList,
      locator: `SyntheticLineList!${lineOrdinal + 2}`,
    });
  }
  if (count >= 3) {
    locators.push({
      sourceKind: 'PIPING_CLASS',
      sourceHash: fixture.sourceHashes.pipingClass,
      locator: `SyntheticPipingClass!${fixture.lines.classIdByOrdinal[lineOrdinal] + 2}`,
    });
  }
  return Object.freeze(locators.map((row) => Object.freeze(row)));
}

export function materializeLineRecord(fixture, lineOrdinal, fieldIds = ENGINEERING_FIELDS) {
  assert(Number.isSafeInteger(lineOrdinal) && lineOrdinal >= 0 && lineOrdinal < fixture.manifest.lineCount,
    'E_QF_SCHEMA_INVALID: line ordinal');
  const fields = Object.create(null);
  for (const fieldId of fieldIds) {
    const column = fixture.lines.engineeringColumns[fieldId];
    if (!column) throw new RangeError(`Unknown engineering field: ${fieldId}`);
    fields[fieldId] = Object.freeze({
      value: Number.isNaN(column.values[lineOrdinal]) ? null : column.values[lineOrdinal],
      status: column.statuses[lineOrdinal],
    });
  }
  return Object.freeze({
    targetId: fixture.lines.targetIdByOrdinal[lineOrdinal],
    targetKind: 'LINE',
    normalizedLineKey: fixture.lines.normalizedLineKeyByOrdinal[lineOrdinal],
    modelPath: fixture.lines.modelPathByOrdinal[lineOrdinal],
    sourceLocators: sourceLocatorsForLine(fixture, lineOrdinal),
    serviceId: fixture.lines.serviceIdByOrdinal[lineOrdinal],
    ratingId: fixture.lines.ratingIdByOrdinal[lineOrdinal],
    classId: fixture.lines.classIdByOrdinal[lineOrdinal],
    flags: fixture.lines.flagsByOrdinal[lineOrdinal],
    componentCount: fixture.lines.componentCountByLineOrdinal[lineOrdinal],
    fields: Object.freeze(fields),
  });
}

export function materializeComponentRecord(fixture, componentOrdinal) {
  const lineOrdinal = fixture.components.parentLineOrdinal[componentOrdinal];
  return Object.freeze({
    targetId: componentTargetId(fixture, componentOrdinal),
    targetKind: 'COMPONENT',
    parentLineTargetId: fixture.lines.targetIdByOrdinal[lineOrdinal],
    parentLineOrdinal: lineOrdinal,
    componentType: fixture.dictionaries.componentTypes[fixture.components.typeCode[componentOrdinal]],
    boreMm: fixture.components.boreMm[componentOrdinal],
  });
}

export function calculateFixtureSemanticHash(fixture) {
  return hashFixture(fixture);
}

export function fixtureSummary(fixture) {
  const flagCounts = Object.fromEntries(Object.entries(LINE_FLAG).map(([name, bit]) => [
    name,
    countFlag(fixture.lines.flagsByOrdinal, bit),
  ]));
  return Object.freeze({
    schema: fixture.schema,
    fixture: fixture.manifest.name,
    manifestHash: sha256Text(stableStringify(fixture.manifest)),
    semanticHash: fixture.semanticHash,
    lineCount: fixture.manifest.lineCount,
    componentCount: fixture.components.count,
    engineeringColumnCount: Object.keys(fixture.lines.engineeringColumns).length,
    flagCounts,
  });
}

