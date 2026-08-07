import * as XLSX from 'xlsx';
import { assertTopologyEditTableHumanExport } from './topology-edit-table-human-export.js';

export const TOPOLOGY_EDIT_TABLE_HUMAN_XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function topologyEditTableHumanWorkbook(exportInput) {
  const exportModel = assertTopologyEditTableHumanExport(exportInput);
  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: '3D Edit Certified Engineering Table',
    Subject: `Canonical ${exportModel.authority.canonicalHash}`,
    Author: 'Advanced Analysis',
    Company: 'Advanced Analysis',
    Comments: `Export authority ${exportModel.exportHash}`,
  };
  for (const name of exportModel.sheetNames) {
    const sheet = exportModel.sheets[name];
    const worksheet = XLSX.utils.aoa_to_sheet([sheet.columns, ...sheet.rows]);
    if (sheet.columns.length) {
      worksheet['!autofilter'] = {
        ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: sheet.rows.length, c: sheet.columns.length - 1 } }),
      };
    }
    worksheet['!cols'] = sheet.columns.map((column, columnIndex) => ({
      wch: columnWidth(column, sheet.rows, columnIndex),
    }));
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  }
  return workbook;
}

export function topologyEditTableHumanXlsxBytes(exportInput) {
  return XLSX.write(topologyEditTableHumanWorkbook(exportInput), {
    type: 'array',
    bookType: 'xlsx',
    compression: true,
  });
}

function columnWidth(header, rows, index) {
  const body = rows.slice(0, 200).map((row) => String(row[index] ?? '').length);
  return Math.min(48, Math.max(10, String(header).length + 2, ...body) + 1);
}
