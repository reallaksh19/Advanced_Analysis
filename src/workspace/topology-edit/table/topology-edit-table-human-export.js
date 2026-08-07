import { deepFreeze, semanticHash } from '../../../core/shared-piping-model/index.js';
import { assertTopologyEditTableProjection } from './topology-edit-table-projection.js';

export const TOPOLOGY_EDIT_TABLE_HUMAN_EXPORT_SCHEMA = 'TopologyEditTableHumanExport.v1';

const ELEMENT_COLUMNS = Object.freeze([
  'Tag', 'Type', 'Line', 'Connect From', 'Connect To', 'DN In (mm)', 'DN Out (mm)',
  'Length (mm)', 'Schedule', 'Material', 'Piping Class', 'Pressure Class',
  'Catalogue Authority', 'Source Status', 'Canonical ID',
]);

export function buildTopologyEditTableHumanExport(input = {}) {
  const projection = assertTopologyEditTableProjection(input.projection);
  const authority = exportAuthority(input, projection);
  const sheets = {
    Elements: sheet(ELEMENT_COLUMNS, projection.rows.map(elementRow)),
    Connections: sheet(
      ['Canonical ID', 'Element Type', 'Port Role', 'Port Key', 'Node ID'],
      projection.rows.flatMap(connectionRows),
    ),
    'Source Mapping': sheet(
      ['Canonical ID', 'Component Key', 'Entity ID', 'Source Entity ID', 'Source Path', 'Source Node Key', 'JSON Pointer', 'Source Status', 'Source Hash'],
      projection.rows.map(sourceRow),
    ),
    'Catalogue Evidence': sheet(
      ['Canonical ID', 'Authority', 'Catalogue ID', 'Catalogue Version', 'Catalogue Hash', 'Source Hash', 'Record ID', 'Record Hash', 'Source Reference'],
      projection.rows.map(catalogueRow),
    ),
    'Export Metadata': sheet(
      ['Key', 'Value'],
      metadataRows(authority, projection),
    ),
  };
  const material = {
    schema: TOPOLOGY_EDIT_TABLE_HUMAN_EXPORT_SCHEMA,
    authority,
    sheetNames: Object.keys(sheets),
    sheets,
  };
  return deepFreeze({ ...material, exportHash: semanticHash(material) });
}

export function assertTopologyEditTableHumanExport(value) {
  if (value?.schema !== TOPOLOGY_EDIT_TABLE_HUMAN_EXPORT_SCHEMA) {
    throw new TypeError(`Table human export must use ${TOPOLOGY_EDIT_TABLE_HUMAN_EXPORT_SCHEMA}.`);
  }
  const material = { ...value };
  delete material.exportHash;
  if (semanticHash(material) !== value.exportHash) {
    throw new Error('TopologyEditTableHumanExport: export hash mismatch.');
  }
  return value;
}

export function topologyEditTableHumanCsv(exportInput) {
  const exportModel = assertTopologyEditTableHumanExport(exportInput);
  const rows = [exportModel.sheets.Elements.columns, ...exportModel.sheets.Elements.rows];
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

function exportAuthority(input, projection) {
  const session = input.sessionSnapshot;
  if (!session || typeof session !== 'object') {
    throw new TypeError('TopologyEditTableHumanExport: sessionSnapshot is required.');
  }
  const canonicalHash = session.activeCanonicalTopologyHash ?? session.currentCanonicalHash ?? null;
  if (!canonicalHash || canonicalHash !== projection.authority.canonicalTopologyHash) {
    throw new RangeError('TopologyEditTableHumanExport: projection is stale relative to certified canonical authority.');
  }
  if (input.hasUnappliedChanges === true) {
    throw new RangeError('TopologyEditTableHumanExport: unapplied Table changes must be applied or discarded before export.');
  }
  const sourceHash = projection.authority.sourceHash ?? null;
  if (session.sourceHash && sourceHash && session.sourceHash !== sourceHash) {
    throw new RangeError('TopologyEditTableHumanExport: source authority differs from the certified session.');
  }
  return deepFreeze({
    canonicalHash,
    projectionHash: projection.projectionHash,
    sourceHash,
    datasetId: projection.authority.datasetId,
    datasetVersion: projection.authority.datasetVersion,
    journalHash: session.journalHash ?? null,
    activeLedgerHash: session.activeLedgerHash ?? null,
    sessionVersion: session.sessionVersion ?? null,
  });
}

function sheet(columns, rows) {
  return deepFreeze({ columns: [...columns], rows: rows.map((row) => [...row]) });
}
function elementRow(row) {
  const field = row.fields ?? {};
  return [
    field.tag, row.elementType, field.line, field.connectFrom, field.connectTo,
    field.dnInMm, field.dnOutMm, field.lengthMm ?? field.componentLengthMm,
    field.schedule, field.material, field.pipingClass, field.pressureClass ?? field.rating,
    field.catalogueAuthority, field.sourceStatus, row.identity.canonicalId,
  ].map(cellValue);
}
function connectionRows(row) {
  const bindings = row.identity.portBindings ?? [];
  if (bindings.length) {
    return bindings.map((binding) => [
      row.identity.canonicalId,
      row.elementType,
      binding.portRole,
      binding.portKey,
      binding.nodeId,
    ].map(cellValue));
  }
  return (row.identity.nodeIds ?? []).map((nodeId) => [
    row.identity.canonicalId, row.elementType, null, null, nodeId,
  ].map(cellValue));
}
function sourceRow(row) {
  const source = row.custody?.sourceIdentity ?? {};
  return [
    row.identity.canonicalId, row.identity.componentKey, row.identity.entityId,
    row.identity.sourceEntityId, source.sourcePath, source.sourceNodeKey,
    source.jsonPointer, row.custody?.sourceStatus, source.sourceHash,
  ].map(cellValue);
}
function catalogueRow(row) {
  const catalogue = row.custody?.catalogue ?? {};
  return [
    row.identity.canonicalId,
    row.custody?.catalogueAuthority,
    catalogue.catalogueId,
    catalogue.catalogueVersion,
    catalogue.catalogueHash,
    catalogue.sourceHash,
    catalogue.recordId,
    catalogue.recordHash,
    catalogue.sourceReference ? JSON.stringify(catalogue.sourceReference) : null,
  ].map(cellValue);
}
function metadataRows(authority, projection) {
  return [
    ['Schema', TOPOLOGY_EDIT_TABLE_HUMAN_EXPORT_SCHEMA],
    ['Canonical Hash', authority.canonicalHash],
    ['Projection Hash', authority.projectionHash],
    ['Source Hash', authority.sourceHash],
    ['Dataset ID', authority.datasetId],
    ['Dataset Version', authority.datasetVersion],
    ['Journal Hash', authority.journalHash],
    ['Active Ledger Hash', authority.activeLedgerHash],
    ['Session Version', authority.sessionVersion],
    ['Row Count', projection.rows.length],
    ['Ordering', 'DETERMINISTIC_CANONICAL_ROW_ID'],
    ['Authority', 'CERTIFIED_CANONICAL_PROJECTION_ONLY'],
  ].map((row) => row.map(cellValue));
}
function cellValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
