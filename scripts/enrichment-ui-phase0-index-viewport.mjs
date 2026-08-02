import assert from 'node:assert/strict';
import {
  ENGINEERING_FIELDS,
  componentTargetId,
  sha256Text,
  stableStringify,
} from './enrichment-ui-phase0-fixtures.mjs';

export function materializeViewport({
  fixture,
  indexes,
  visibleOrder,
  rowStart = 0,
  viewportRowCount = 50,
  rowOverscan = 20,
  visibleColumnIds = ENGINEERING_FIELDS,
  columnStart = 0,
  viewportColumnCount = 12,
  columnOverscan = 2,
}) {
  assert(viewportRowCount >= 0 && rowOverscan >= 0, 'E_QF_SCHEMA_INVALID: viewport rows');
  assert(viewportColumnCount >= 0 && columnOverscan >= 0, 'E_QF_SCHEMA_INVALID: viewport columns');
  const firstRow = Math.max(0, rowStart - rowOverscan);
  const lastRowExclusive = Math.min(
    visibleOrder.length,
    rowStart + viewportRowCount + rowOverscan,
  );
  const firstColumn = Math.max(0, columnStart - columnOverscan);
  const lastColumnExclusive = Math.min(
    visibleColumnIds.length,
    columnStart + viewportColumnCount + columnOverscan,
  );
  const columns = visibleColumnIds.slice(firstColumn, lastColumnExclusive);
  const rows = [];

  for (let position = firstRow; position < lastRowExclusive; position += 1) {
    const ordinal = visibleOrder[position];
    rows.push(Object.freeze({
      kind: 'LINE',
      key: fixture.lines.targetIdByOrdinal[ordinal],
      ordinal,
      position,
      normalizedLineKey: fixture.lines.normalizedLineKeyByOrdinal[ordinal],
      cells: Object.freeze(columns.map((fieldId) => {
        const column = fixture.lines.engineeringColumns[fieldId];
        return Object.freeze({
          fieldId,
          value: Number.isNaN(column.values[ordinal]) ? null : column.values[ordinal],
          status: column.statuses[ordinal],
        });
      })),
    }));
  }

  return Object.freeze({
    rows: Object.freeze(rows),
    columns: Object.freeze(columns),
    rowRange: Object.freeze([firstRow, lastRowExclusive]),
    columnRange: Object.freeze([firstColumn, lastColumnExclusive]),
    totalDatasetLines: indexes.counts.lineCount,
    totalDatasetComponents: indexes.counts.componentCount,
    materializedLineRows: rows.length,
    materializedComponentRows: 0,
    materializedCells: rows.length * columns.length,
    digest: sha256Text(stableStringify(rows)),
  });
}

export function materializeComponentViewport({
  fixture,
  indexes,
  parentLineTargetId,
  componentStart = 0,
  viewportComponentCount = 30,
  overscan = 10,
}) {
  const lineOrdinal = indexes.lineOrdinalByTargetId.get(parentLineTargetId);
  if (lineOrdinal === undefined) throw new RangeError(`Unknown line target: ${parentLineTargetId}`);
  const start = indexes.componentsByLine.offsets[lineOrdinal];
  const end = indexes.componentsByLine.offsets[lineOrdinal + 1];
  const first = Math.max(start, start + componentStart - overscan);
  const last = Math.min(end, start + componentStart + viewportComponentCount + overscan);
  const rows = [];
  for (let cursor = first; cursor < last; cursor += 1) {
    const componentOrdinal = indexes.componentsByLine.componentOrdinals[cursor];
    rows.push(Object.freeze({
      key: componentTargetId(fixture, componentOrdinal),
      componentOrdinal,
      parentLineTargetId,
      typeCode: fixture.components.typeCode[componentOrdinal],
      boreMm: fixture.components.boreMm[componentOrdinal],
    }));
  }
  return Object.freeze({
    rows: Object.freeze(rows),
    totalComponentsForLine: end - start,
    materializedComponentRows: rows.length,
    digest: sha256Text(stableStringify(rows)),
  });
}

export function assertIndexInvariants(indexes, fixture) {
  assert.equal(indexes.lineOrdinalByTargetId.size, fixture.manifest.lineCount, 'E_QF_DUPLICATE_OVERWRITE');
  let totalKeyBindings = 0;
  let duplicateBuckets = 0;
  let duplicateTargets = 0;
  for (const bucket of indexes.lineOrdinalsByNormalizedKey.values()) {
    totalKeyBindings += bucket.length;
    if (bucket.length > 1) {
      duplicateBuckets += 1;
      duplicateTargets += bucket.length;
    }
  }
  assert.equal(totalKeyBindings, fixture.manifest.lineCount, 'E_QF_DUPLICATE_OVERWRITE');
  assert.equal(duplicateBuckets, fixture.manifest.duplicateKeyGroups, 'E_QF_DUPLICATE_OVERWRITE');
  assert.equal(duplicateTargets, fixture.manifest.duplicateKeyTargetCount, 'E_QF_DUPLICATE_OVERWRITE');
  assert.equal(indexes.componentsByLine.offsets.length, fixture.manifest.lineCount + 1, 'E_QF_COMPONENT_LOSS');
  assert.equal(indexes.componentsByLine.offsets[fixture.manifest.lineCount], fixture.components.count, 'E_QF_COMPONENT_LOSS');
  assert.equal(indexes.componentsByLine.componentOrdinals.length, fixture.components.count, 'E_QF_COMPONENT_LOSS');
  return true;
}

export function indexEvidence(indexes, fixture) {
  let locatorBindings = 0;
  for (const bucket of indexes.lineOrdinalsBySourceLocator.values()) locatorBindings += bucket.length;
  return Object.freeze({
    lineCount: indexes.counts.lineCount,
    componentCount: indexes.counts.componentCount,
    targetIdentityCount: indexes.lineOrdinalByTargetId.size,
    normalizedKeyBucketCount: indexes.lineOrdinalsByNormalizedKey.size,
    sourceLocatorBucketCount: indexes.lineOrdinalsBySourceLocator.size,
    sourceLocatorBindings: locatorBindings,
    structuralDigest: indexes.structuralDigest,
    fixtureSemanticHash: fixture.semanticHash,
  });
}

