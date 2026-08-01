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

  const isXlsx = /\.(xlsx|xlsm|xlsb|xls|ods)$/i.test(fileName);

  if (isXlsx) {
    if (!XLSX) throw new Error('XLSX module is unavailable.');
    const data = new Uint8Array(buffer);
    const workbook = XLSX.read(data, { type: 'array', cellDates: false, raw: false });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    return { rawRows, fileName, sheetName };
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
      console.warn('CSV Parse Errors:', parsed.errors);
    }
    rawRows = parsed.data;
  }

  return { rawRows, fileName, sheetName: 'Sheet1' };
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
