import { getSavedMappingsForMaster, saveMappingForFile } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-state.js';
import { MASTER_FIELDS } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-fields-config.js';
import { fuzzyAutoMapFields } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-fuzzy-mapper.js';
import { detectLineListFieldMap } from '../calc-workspace/cii-standalone-port/core/linelist-mapping.js';

import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export async function parseMasterFile(fileOrBuffer, fileName, masterKey) {
  let buffer;
  if (typeof fileOrBuffer === 'string') {
    buffer = new TextEncoder().encode(fileOrBuffer);
  } else if (fileOrBuffer instanceof ArrayBuffer) {
    buffer = fileOrBuffer;
  } else if (fileOrBuffer && typeof fileOrBuffer.arrayBuffer === 'function') {
    buffer = await fileOrBuffer.arrayBuffer();
  } else {
    throw new Error('Invalid file format');
  }

  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const sourceHash = await sha256(bytes);
  const sourceMetadata = { sourceHash, byteLength: bytes.byteLength };
  const isXlsx = /\.(xlsx|xlsm|xlsb|xls|ods)$/i.test(fileName);

  if (isXlsx) {
    if (!XLSX) throw new Error('XLSX module is unavailable.');
    const workbook = XLSX.read(bytes, { type: 'array', cellDates: false, raw: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = masterKey === 'lineList'
      ? parseThreeRowLineList(sheet, sheetName)
      : XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false }).map((row, index) => ({ ...row, _sourceRowNumber: index + 2, _sourceSheet: sheetName }));
    return { rawRows, fileName, sheetName, sourceMetadata };
  }

  if (/\.json$/i.test(fileName)) {
    const parsed = JSON.parse(new TextDecoder('utf-8').decode(buffer));
    if (!Array.isArray(parsed)) throw new Error('JSON master must contain one top-level row array.');
    const rawRows = parsed.map((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`JSON master row ${index + 1} must be an object.`);
      return { ...row, _sourceRowNumber: index + 1, _sourceSheet: 'JSON' };
    });
    return { rawRows, fileName, sheetName: 'JSON', sourceMetadata };
  }

  // Handle TXT / CSV
  const text = new TextDecoder('utf-8').decode(buffer);
  let rawRows = [];

  if (masterKey === 'materialMap' && /\.(txt|map)$/i.test(fileName)) {
    rawRows = text.split(/\r?\n/).map(line => {
      const match = line.match(/^\s*(\d+)\s+(.+?)\s*$/);
      return match ? { code: match[1], material: match[2] } : null;
    }).filter(Boolean);
  } else {
    // CSV parser fallback
    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: true
    });
    if (parsed.errors.length) {
      throw new Error(`CSV master parsing failed: ${parsed.errors.map((error) => `${error.code} at row ${error.row ?? 'unknown'}: ${error.message}`).join('; ')}`);
    }
    rawRows = parsed.data;
  }

  return { rawRows: rawRows.map((row, index) => ({ ...row, _sourceRowNumber: index + 2, _sourceSheet: 'Sheet1' })), fileName, sheetName: 'Sheet1', sourceMetadata };
}

export function parseThreeRowLineList(sheet, sheetName) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  const headerStart = rows.findIndex((row) => row.some((cell) => String(cell).trim().toLowerCase() === 'line number'));
  if (headerStart < 0 || rows.length <= headerStart + 3) {
    throw new Error('Line-list workbook must contain the three-row header beginning with "Line number".');
  }
  const headers = combineHeaders(rows.slice(headerStart, headerStart + 3));
  return rows.slice(headerStart + 3).map((values, index) => {
    const row = Object.fromEntries(headers.map((header, column) => [header, values[column] ?? '']));
    row._sourceRowNumber = headerStart + 4 + index;
    row._sourceSheet = sheetName;
    return row;
  }).filter((row) => headers.some((header) => String(row[header]).trim() !== ''));
}

function combineHeaders(headerRows) {
  const width = Math.max(...headerRows.map((row) => row.length));
  let group = '';
  const counts = new Map();
  return Array.from({ length: width }, (_, column) => {
    const top = String(headerRows[0][column] || '').trim();
    if (top) group = top;
    const parts = [top || group, headerRows[1][column], headerRows[2][column]]
      .map((value) => String(value || '').trim()).filter(Boolean);
    const base = parts.join(' | ') || `Column ${column + 1}`;
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable in this runtime.');
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function headersFromRows(rows) {
  const headers = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    for (const key of Object.keys(row || {})) {
      if (key !== '_rowIndex' && !headers.includes(key)) headers.push(key);
    }
    if (headers.length >= 30) break;
  }
  return headers;
}

export function autoMapMasterColumns(rawRows, masterKey, currentMap = {}, config = {}) {
  if (!rawRows || !rawRows.length) return {};
  const fields = MASTER_FIELDS[masterKey]?.fields || [];
  const headers = headersFromRows(rawRows);
  
  const fuzzyMap = fuzzyAutoMapFields(headers, fields, rawRows);
  if (masterKey !== 'lineList') return fuzzyMap;

  const lineListMap = detectLineListFieldMap(rawRows, currentMap || {}, config?.linelist || config || null);
  const mergedMap = { ...fuzzyMap, ...lineListMap };
  if (headers.includes('Phase')) mergedMap.phase = 'Phase';
  if (headers.includes('From')) mergedMap.from = 'From';
  if (headers.includes('To')) mergedMap.to = 'To';

  // Keep dynamic standalone-only fields that the core XML->CII line-list detector
  // intentionally does not own yet, such as From/To equipment columns.
  for (const field of fields) {
    if (!(field.name in mergedMap)) mergedMap[field.name] = fuzzyMap[field.name] || '';
  }
  if (mergedMap.lineKey2 && !mergedMap.lineSeqNo) {
    mergedMap.lineSeqNo = mergedMap.lineKey2;
  }
  return mergedMap;
}
