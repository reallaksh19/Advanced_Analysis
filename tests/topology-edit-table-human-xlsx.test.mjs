import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { semanticHash } from '../src/core/shared-piping-model/index.js';
import {
  TOPOLOGY_EDIT_TABLE_HUMAN_EXPORT_SCHEMA,
} from '../src/workspace/topology-edit/table/topology-edit-table-human-export.js';
import {
  topologyEditTableHumanXlsxBytes,
} from '../src/workspace/topology-edit/table/topology-edit-table-human-xlsx.js';

function exportModel() {
  const sheets = {
    Elements: { columns: ['Tag', 'Type', 'Canonical ID'], rows: [['P-001', 'PIPE', 'edge:P-001']] },
    Connections: { columns: ['Canonical ID', 'Port Role', 'Node ID'], rows: [['edge:P-001', 'start', 'node:N1']] },
    'Source Mapping': { columns: ['Canonical ID', 'Source Entity ID'], rows: [['edge:P-001', 'source:P-001']] },
    'Catalogue Evidence': { columns: ['Canonical ID', 'Authority'], rows: [['edge:P-001', 'UNRESOLVED']] },
    'Export Metadata': { columns: ['Key', 'Value'], rows: [['Canonical Hash', 'sha256:canonical']] },
  };
  const material = {
    schema: TOPOLOGY_EDIT_TABLE_HUMAN_EXPORT_SCHEMA,
    authority: {
      canonicalHash: 'sha256:canonical', projectionHash: 'sha256:projection', sourceHash: 'sha256:source',
      datasetId: 'dataset-xlsx', datasetVersion: 1, journalHash: 'sha256:journal',
      activeLedgerHash: 'sha256:ledger', sessionVersion: 4,
    },
    sheetNames: Object.keys(sheets),
    sheets,
  };
  return { ...material, exportHash: semanticHash(material) };
}

test('XLSX round-read preserves deterministic sheet names and authority cells', () => {
  const model = exportModel();
  const bytes = topologyEditTableHumanXlsxBytes(model);
  assert.ok(bytes.byteLength > 1000);
  const workbook = XLSX.read(bytes, { type: 'array' });
  assert.deepEqual(workbook.SheetNames, model.sheetNames);
  const elements = XLSX.utils.sheet_to_json(workbook.Sheets.Elements, { header: 1, raw: true });
  assert.deepEqual(elements.slice(0, 2), [
    ['Tag', 'Type', 'Canonical ID'],
    ['P-001', 'PIPE', 'edge:P-001'],
  ]);
  const metadata = XLSX.utils.sheet_to_json(workbook.Sheets['Export Metadata'], { header: 1, raw: true });
  assert.deepEqual(metadata[1], ['Canonical Hash', 'sha256:canonical']);
  assert.equal(workbook.Props.Title, '3D Edit Certified Engineering Table');
  assert.ok(String(workbook.Props.Comments).includes(model.exportHash));
});
