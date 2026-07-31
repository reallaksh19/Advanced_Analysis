import { getSavedMappingsForMaster, saveMappingForFile } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-state.js';
import { MASTER_FIELDS } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-fields-config.js';
import { fuzzyAutoMapFields } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-fuzzy-mapper.js';

async function getXlsxModule() {
  if (typeof window !== 'undefined' && typeof window.XLSX !== 'undefined' && typeof window.XLSX.read === 'function') {
    return window.XLSX;
  }
  try {
    const mod = await import(/* @vite-ignore */ 'https://cdn.sheetjs.com/xlsx-latest/package/xlsx.mjs');
    if (mod && typeof mod.read === 'function') return mod;
    if (mod && mod.default && typeof mod.default.read === 'function') return mod.default;
  } catch (e) {
    console.warn('CDN XLSX import failed:', e);
  }
  return null;
}

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
    const XLSX = await getXlsxModule();
    if (!XLSX) throw new Error('XLSX module is unavailable. Please check internet connection or load SheetJS script.');
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
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length > 0) {
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        const row = {};
        headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
        rawRows.push(row);
      }
    }
  }

  return { rawRows, fileName, sheetName: 'Sheet1' };
}

export function autoMapMasterColumns(rawRows, masterKey) {
  if (!rawRows || !rawRows.length) return {};
  const fields = MASTER_FIELDS[masterKey]?.fields || [];
  const headers = Object.keys(rawRows[0] || {}).filter(k => k !== '_rowIndex');
  return fuzzyAutoMapFields(masterKey, fields, headers, rawRows);
}
