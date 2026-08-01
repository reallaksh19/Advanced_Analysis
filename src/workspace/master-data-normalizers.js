import { MASTER_FIELDS } from '../calc-workspace/cii-standalone-port/ui-adapted/xml-cii-adapted-fields-config.js';
import { computeLineNoKey } from '../calc-workspace/cii-standalone-port/core/linelist-mapping.js';

/**
 * Validates if the required fields in the mapping profile are met.
 */
export function validateMappingProfile(masterKey, fieldMap) {
  const schema = MASTER_FIELDS[masterKey];
  if (!schema) return { valid: false, errors: ['Unknown master key'] };
  
  const errors = [];
  schema.fields.forEach(field => {
    if (field.required && !fieldMap[field.name]) {
      errors.push(`Required field missing: ${field.label}`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Base normalizer that maps raw rows to canonical rows using the provided fieldMap.
 * Also preserves source provenance.
 */
function normalizeRows(masterKey, rawRows, fieldMap) {
  const schema = MASTER_FIELDS[masterKey];
  if (!schema) throw new Error('Unknown schema');

  return rawRows.map((rawRow, index) => {
    const canonical = {
      _sourceRowIndex: index,
      _sourceRowNumber: rawRow._sourceRowNumber ?? null,
      _sourceSheet: rawRow._sourceSheet || '',
      _sourceProvenance: rawRow
    };
    
    schema.fields.forEach(field => {
      const header = fieldMap[field.name];
      canonical[field.name] = header ? rawRow[header] : undefined;
    });

    return canonical;
  });
}

export function normalizeLineList(rawRows, fieldMap) {
  const validation = validateMappingProfile('lineList', fieldMap);
  if (!validation.valid) throw new Error(`Mapping invalid: ${validation.errors.join(', ')}`);
  
  const canonicalRows = normalizeRows('lineList', rawRows, fieldMap);
  return canonicalRows.map((row, idx) => {
    const rawRow = rawRows[idx];
    const key = computeLineNoKey(rawRow, fieldMap);
    return {
      ...row,
      lineKey: key,
      lineNoKey: key
    };
  });
}

export function normalizePipingClass(rawRows, fieldMap) {
  const validation = validateMappingProfile('pipingClass', fieldMap);
  if (!validation.valid) throw new Error(`Mapping invalid: ${validation.errors.join(', ')}`);
  
  return normalizeRows('pipingClass', rawRows, fieldMap);
}

export function normalizeWeight(rawRows, fieldMap) {
  const validation = validateMappingProfile('weight', fieldMap);
  if (!validation.valid) throw new Error(`Mapping invalid: ${validation.errors.join(', ')}`);
  
  return normalizeRows('weight', rawRows, fieldMap);
}

export function normalizeMaterialMap(rawRows, fieldMap) {
  const validation = validateMappingProfile('materialMap', fieldMap);
  if (!validation.valid) throw new Error(`Mapping invalid: ${validation.errors.join(', ')}`);
  
  return normalizeRows('materialMap', rawRows, fieldMap);
}
