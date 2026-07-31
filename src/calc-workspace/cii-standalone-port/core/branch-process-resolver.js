import { cleanMaterialText, cleanMaterialCode, mapMaterialTextToCiiCode } from './linelist-mapping.js';
import { findBestPipingClassRow, normalizePipingClass } from './piping-class-resolver.js';
import { resolveConfiguredMaterialCode } from './piping-class-material-code-resolver.js';
import { resolveXmlCiiAutomaticRating } from './dtxr-rating-resolver.js';
import { selectXmlCiiRequestedPipingClass } from './piping-class-source-resolver.js';
import { toFiniteNumber } from './config.js';
import { buildXmlCiiServiceProcessFallback } from './service-process-fallback.js';

function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function headerKey(value) { return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, ''); }

function readAny(row, keys) {
  if (!row || typeof row !== 'object') return '';
  const wanted = (keys || []).map(headerKey).filter(Boolean);
  for (const source of [row, row._raw]) {
    if (!source || typeof source !== 'object') continue;
    for (const key of keys || []) if (text(source[key])) return text(source[key]);
    for (const [key, value] of Object.entries(source)) if (wanted.includes(headerKey(key)) && text(value)) return text(value);
  }
  return '';
}

function numberAny(row, keys) {
  const match = readAny(row, keys).replace(/,/g, '').match(/[-+]?\d*\.?\d+/);
  const value = match ? Number(match[0]) : NaN;
  return Number.isFinite(value) ? value : null;
}

function overrideValue(overrides, bucketName, keys = []) {
  const bucket = overrides?.[bucketName];
  if (bucket && typeof bucket === 'object' && !Array.isArray(bucket)) {
    for (const key of keys) if (key && Object.hasOwn(bucket, key) && text(bucket[key])) return text(bucket[key]);
  }
  return bucket !== undefined && (typeof bucket !== 'object' || bucket === null) ? text(bucket) : '';
}

function numericOverrideValue(overrides, bucketName, keys = []) {
  const value = toFiniteNumber(overrideValue(overrides, bucketName, keys));
  return value == null ? null : value;
}

function readClassRowRating(row) {
  return readAny(row, ['rating', 'Rating', 'RATING', 'Pressure Class', 'classRating', 'Class Rating', 'PRESSURE_CLASS']);
}

function classRowMaterial(row) {
  return readAny(row, ['materialName', 'Material_Name', 'Material Name', 'Material', 'material', 'MATERIAL', 'Mat', 'MAT', 'MOC']);
}

function materialMapRowCode(row) {
  return cleanMaterialCode(readAny(row, ['code', 'Code', 'materialCode', 'MaterialCode', 'Material Code', 'MAT_CODE', 'CII Code', 'CA3']));
}

function materialMapRowNames(row) {
  return [
    readAny(row, ['material', 'Material']),
    readAny(row, ['materialName', 'Material_Name', 'Material Name']),
    readAny(row, ['description', 'Description']),
    readAny(row, ['name', 'Name']),
  ].map(text).filter(Boolean);
}

function materialComparable(value) {
  return cleanMaterialText(value)
    .replace(/\b(ASTM|ASME|API)\b/g, ' ')
    .replace(/\bA\s*\/\s*SA\b/g, ' ')
    .replace(/\bSA\b/g, ' ')
    .replace(/\bGR(?:ADE)?\.?\b/g, ' ')
    .replace(/\bCL(?:ASS)?\.?\b/g, 'CL')
    .replace(/[^A-Z0-9]/g, '');
}

function robustMaterialMap(materialText, materialMap) {
  const exact = mapMaterialTextToCiiCode(materialText, materialMap);
  if (exact) return exact;
  const key = materialComparable(materialText);
  if (!key) return null;
  const rows = Array.isArray(materialMap) ? materialMap : [];
  const suffix = rows.find((row) => {
    if (!materialMapRowCode(row)) return false;
    return materialMapRowNames(row).some((candidate) => {
      const comparable = materialComparable(candidate);
      return comparable && (comparable === key || (comparable.length >= 4 && key.endsWith(comparable)) || (key.length >= 4 && comparable.endsWith(key)));
    });
  });
  if (suffix) return suffix;
  const matches = rows.flatMap((row, rowIndex) => materialMapRowNames(row).flatMap((candidate) => {
    const comparable = materialComparable(candidate);
    const position = key.indexOf(comparable);
    if (!materialMapRowCode(row) || comparable.length < 4 || position < 0) return [];
    return [{ row, rowIndex, position, length: comparable.length }];
  }));
  matches.sort((left, right) => left.position - right.position || right.length - left.length || left.rowIndex - right.rowIndex);
  if (matches.length) return matches[0].row;
  const designations = key.match(/[A-Z]\d{5}/g) || [];
  return designations.flatMap((designation) => rows.filter((row) => (
    materialMapRowCode(row) && materialMapRowNames(row).some((candidate) => materialComparable(candidate).includes(designation))
  )))[0] || null;
}

function shouldUseNumericOverride(value, classValue, config) {
  if (value == null) return false;
  if (value !== 0 || config?.allowZeroWallCorrosionOverrides === true) return true;
  return classValue == null || classValue === 0;
}

function normalKey(value) { return text(value).toUpperCase().replace(/\s+/g, ''); }
export function xmlCiiClassKey(pipingClass) { const value = normalKey(pipingClass); return value ? `PC:${value}` : ''; }
export function xmlCiiClassSizeKey(pipingClass, boreMm) {
  const value = normalKey(pipingClass);
  const bore = Number(boreMm);
  return value && Number.isFinite(bore) && bore > 0 ? `PC:${value}|DN:${Math.round(bore)}` : '';
}

function smartOverrideKeys({ lineKey, branchName, requestedPipingClass, resolvedPipingClass, boreMm }) {
  return [
    lineKey, branchName, requestedPipingClass, resolvedPipingClass,
    xmlCiiClassSizeKey(resolvedPipingClass, boreMm), xmlCiiClassSizeKey(requestedPipingClass, boreMm),
    xmlCiiClassKey(resolvedPipingClass), xmlCiiClassKey(requestedPipingClass),
  ].map(text).filter(Boolean);
}

const SERVICE_FIELDS = Object.freeze(['p1', 'hydroPressure', 't1', 't2', 't3', 'density']);
function hasExactLineListEvidence(lineRow) {
  if (!lineRow || typeof lineRow !== 'object') return false;
  if (lineRow._raw && typeof lineRow._raw === 'object') return true;
  return Object.keys(lineRow).some((key) => !['pipingClass', 'Piping Class', 'PIPING_CLASS'].includes(key) && text(lineRow[key]));
}

function ensureServiceFallback({ branchName, lineKey, lineRow, requestedPipingClass, href, tref, config, overrides }) {
  if (hasExactLineListEvidence(lineRow) || !config || typeof config !== 'object') return null;
  const targetKey = text(lineKey) || text(branchName);
  if (!targetKey) return null;
  const fallback = buildXmlCiiServiceProcessFallback({ branchName, lineRow, requestedPipingClass, href, tref, config, fields: SERVICE_FIELDS });
  if (!fallback?.stats?.resolvedFields) return fallback;
  config.overrides = config.overrides && typeof config.overrides === 'object' ? config.overrides : (overrides || {});
  config.overrides.processData = config.overrides.processData && typeof config.overrides.processData === 'object' ? config.overrides.processData : {};
  const row = config.overrides.processData[targetKey] && typeof config.overrides.processData[targetKey] === 'object' ? config.overrides.processData[targetKey] : {};
  let appliedFields = 0;
  for (const [field, info] of Object.entries(fallback.fields || {})) {
    if (text(row[field])) continue;
    row[field] = info.value;
    appliedFields += 1;
  }
  if (appliedFields) {
    row.__source = row.__source || {};
    row.__source.serviceProcessFallback = { source: 'service-match', service: fallback.service, matchedRows: fallback.stats.matchedRows, appliedFields, needsReview: true };
    config.overrides.processData[targetKey] = row;
  }
  return { ...fallback, appliedFields, targetKey };
}

export function resolveMaterialCodeFromLineMaterial({ lineRow, materialMap, pipingClassRow, pipingClass, overrides = {}, overrideKeys = [], xmlNode, xmlBranch, config = {} }) {
  const lineMaterialRaw = readAny(lineRow, ['material', 'Material', 'MATERIAL', 'Material_Name', 'Material Name', 'MOC']);
  const classMaterialRaw = classRowMaterial(pipingClassRow);
  const materialOverride = overrideValue(overrides, 'material', overrideKeys);
  const material = cleanMaterialText(materialOverride || classMaterialRaw || lineMaterialRaw);
  const explicitCode = overrideValue(overrides, 'materialCode', [...overrideKeys, classMaterialRaw, lineMaterialRaw, material].filter(Boolean));
  const legacyCode = overrideValue(overrides, 'material', [classMaterialRaw, lineMaterialRaw, material].filter(Boolean));
  const manualResult = explicitCode
    ? { material, materialCode: cleanMaterialCode(explicitCode), source: 'override' }
    : (legacyCode && legacyCode !== materialOverride ? { material, materialCode: cleanMaterialCode(legacyCode), source: 'override' } : null);
  const configured = resolveConfiguredMaterialCode({ pipingClass, config });
  const configuredResult = configured ? {
    material: material || cleanMaterialText(configured.materialName),
    materialCode: cleanMaterialCode(configured.materialCode),
    source: 'piping-class-config-map',
    matchedRow: configured.matchedRow,
    confidence: configured.confidence,
    matchMethod: configured.method,
  } : null;
  if (config?.pipingClassMaterialCodeMap?.manualOverrideWins !== false && manualResult) return manualResult;
  if (config?.pipingClassMaterialCodeMap?.exactPipingClassFirst !== false && configuredResult && configuredResult.matchMethod !== 'wildcard') return configuredResult;
  const directClassCode = cleanMaterialCode(readAny(pipingClassRow, ['materialCode', 'Material Code', 'MATERIAL_CODE', 'MAT_CODE', 'Mat Code', 'MatID', 'MaterialCode', 'CA3']));
  if (directClassCode) return { material: material || cleanMaterialText(classMaterialRaw), materialCode: directClassCode, source: 'piping-class-material-code', matchedRow: pipingClassRow };
  const directLineCode = cleanMaterialCode(readAny(lineRow, ['materialCode', 'Material Code', 'MATERIAL_CODE', 'MAT_CODE', 'Mat Code', 'MatID', 'MaterialCode', 'CA3']));
  if (directLineCode) return { material: material || cleanMaterialText(lineMaterialRaw), materialCode: directLineCode, source: materialOverride ? 'override-material-code' : 'line-list-material-code', matchedRow: lineRow };
  if (configuredResult) return configuredResult;
  if (manualResult) return manualResult;
  for (const [sourceText, source] of [[classMaterialRaw, 'piping-class-material-map'], [material || lineMaterialRaw, materialOverride ? 'override-material-map' : 'line-list-material-map']]) {
    const matched = robustMaterialMap(sourceText, materialMap);
    const code = materialMapRowCode(matched);
    if (code) return { material: cleanMaterialText(sourceText), materialCode: code, source, matchedRow: matched };
  }
  const xmlMaterial = cleanMaterialText(xmlNode?.material || xmlBranch?.material || '');
  const xmlMatched = robustMaterialMap(xmlMaterial, materialMap);
  const xmlCode = materialMapRowCode(xmlMatched);
  if (xmlCode) return { material: material || xmlMaterial, materialCode: xmlCode, source: 'xml-material-map', matchedRow: xmlMatched };
  return { material: material || xmlMaterial, materialCode: '', source: xmlMaterial ? 'xml-fallback' : 'blank', matchedRow: null };
}

function classCorrosion(row) { return numberAny(row, ['corrosion', 'Corrosion', 'corrosionAllowance', 'Corrosion Allowance', 'CORROSION_ALLOWANCE', 'CORR_ALLOW', 'CORR', 'CA']); }
function classWall(row) { return numberAny(row, ['wallThickness', 'WallThickness', 'Wall Thickness', 'Wall thickness', 'WALL_THICKNESS', 'WALL_THICK', 'WT', 'THK', 'Thickness']); }

export function resolveCorrosionFromPipingClass({ lineRow, boreMm, componentType, rating, pipingClassIndex, overrides = {}, overrideKeys = [], xmlNode, xmlBranch, config = {} }) {
  const pipingClass = readAny(lineRow, ['pipingClass', 'Piping Class', 'PIPING_CLASS']);
  const match = findBestPipingClassRow({ pipingClass, boreMm, componentType, rating, pipingClassIndex, overrides, config });
  const fromClass = classCorrosion(match?.row);
  const override = numericOverrideValue(overrides, 'corrosion', overrideKeys);
  if (shouldUseNumericOverride(override, fromClass, config)) return { corrosionAllowanceMm: override, source: 'override', matchedRow: null, needsReview: false };
  const legacyOverride = toFiniteNumber(overrides.corrosionAllowanceMm);
  if (shouldUseNumericOverride(legacyOverride, fromClass, config)) return { corrosionAllowanceMm: legacyOverride, source: 'override', matchedRow: null, needsReview: false };
  if (fromClass != null) return { corrosionAllowanceMm: fromClass, source: 'piping-class-master', matchedPipingClass: pipingClass, matchedRow: match.row, matchMethod: match.method, matchScore: match.score, matchReasons: match.reasons, needsReview: match.needsReview, candidates: match.candidates };
  const fromXml = toFiniteNumber(xmlNode?.corrosionAllowance ?? xmlNode?.CorrosionAllowance ?? xmlBranch?.corrosionAllowance);
  if (fromXml != null) return { corrosionAllowanceMm: fromXml, source: 'xml-fallback', matchedPipingClass: pipingClass, matchedRow: match?.row || null, matchMethod: match?.method || 'none', matchScore: match?.score || 0, matchReasons: match?.reasons || [], needsReview: match?.needsReview ?? true, candidates: match?.candidates || [] };
  const fallback = toFiniteNumber(config.defaultCorrosionAllowance);
  return { corrosionAllowanceMm: fallback ?? 0, source: fallback != null ? 'config-default' : 'default-zero', matchedPipingClass: pipingClass, matchedRow: match?.row || null, matchMethod: match?.method || 'none', matchScore: match?.score || 0, matchReasons: match?.reasons || [], needsReview: match?.needsReview ?? true, candidates: match?.candidates || [] };
}

export function resolveWallThicknessFromPipingClass({ pipingClassRow, overrides = {}, overrideKeys = [], xmlNode, xmlBranch, config = {} }) {
  const fromClass = classWall(pipingClassRow);
  const override = numericOverrideValue(overrides, 'wallThickness', overrideKeys);
  const dtxrApplied = override != null && overrideKeys.some((key) => overrides.__dtxrWallKeys?.[key]);
  if (!dtxrApplied && shouldUseNumericOverride(override, fromClass, config)) return { valueMm: override, source: 'override' };
  if (fromClass != null) return { valueMm: fromClass, source: 'piping-class-master' };
  if (shouldUseNumericOverride(override, fromClass, config)) return { valueMm: override, source: 'override' };
  const fromXml = toFiniteNumber(xmlNode?.wallThickness ?? xmlNode?.WallThickness ?? xmlBranch?.wallThickness);
  if (fromXml != null) return { valueMm: fromXml, source: 'xml-fallback' };
  const fallback = toFiniteNumber(config.defaultWallThickness);
  return { valueMm: fallback ?? 0, source: fallback != null ? 'config-default' : 'default-zero' };
}

export function resolveBranchProcessData({ branchName, lineKey, lineRow, boreMm, componentType, schedule, href, tref, materialMap, pipingClassIndex, overrides = {}, xmlNode, xmlBranch, config = {} }) {
  const lineListPipingClass = readAny(lineRow, ['pipingClass', 'Piping Class', 'PIPING_CLASS']);
  const classSource = selectXmlCiiRequestedPipingClass({ branchName, lineListPipingClass, config });
  const requestedPipingClass = classSource.requestedPipingClass;
  const classMatch = findBestPipingClassRow({ pipingClass: requestedPipingClass, boreMm, componentType, rating: '', schedule, pipingClassIndex, overrides, config });
  const pipingClassRow = classMatch?.row || null;
  const resolvedPipingClass = classMatch?.resolvedPipingClass || classMatch?.classMatch?.pipingClass || requestedPipingClass;
  const overrideKeys = smartOverrideKeys({ lineKey, branchName, requestedPipingClass, resolvedPipingClass, boreMm });
  const serviceProcessFallback = ensureServiceFallback({ branchName, lineKey, lineRow, requestedPipingClass, href, tref, config, overrides });
  const ratingAuthority = resolveXmlCiiAutomaticRating({ manualRating: overrideValue(overrides, 'rating', overrideKeys), pipingClassRating: readClassRowRating(pipingClassRow), pipingClass: resolvedPipingClass, branchName, config });
  const resolverLineRow = { ...(lineRow || {}), pipingClass: resolvedPipingClass };
  const material = resolveMaterialCodeFromLineMaterial({ lineRow: resolverLineRow, materialMap, pipingClassRow, pipingClass: resolvedPipingClass, overrides, overrideKeys, xmlNode, xmlBranch, config });
  const corrosion = resolveCorrosionFromPipingClass({ lineRow: resolverLineRow, boreMm, componentType, rating: ratingAuthority.rating, pipingClassIndex, overrides, overrideKeys, xmlNode, xmlBranch, config });
  const wall = resolveWallThicknessFromPipingClass({ pipingClassRow, overrides, overrideKeys, xmlNode, xmlBranch, config });
  return {
    branchName, lineKey, requestedPipingClass, branchPipingClass: classSource.branchPipingClass, lineListPipingClass: classSource.lineListPipingClass, pipingClassSource: classSource.source,
    resolvedPipingClass, normalizedPipingClass: normalizePipingClass(resolvedPipingClass), pipingClass: resolvedPipingClass,
    rating: ratingAuthority.rating, ratingSource: ratingAuthority.source,
    material: material.material, materialCode: material.materialCode, materialSource: material.source, materialCodeConfidence: material.confidence ?? null, materialCodeMatchMethod: material.matchMethod || null,
    corrosionAllowanceMm: corrosion.corrosionAllowanceMm, corrosionSource: corrosion.source,
    wallThicknessMm: wall.valueMm, wallThicknessSource: wall.source,
    wallThicknessKey: xmlCiiClassSizeKey(resolvedPipingClass || requestedPipingClass, boreMm) || lineKey || branchName,
    corrosionKey: xmlCiiClassKey(resolvedPipingClass || requestedPipingClass) || lineKey || branchName,
    materialCodeKey: xmlCiiClassKey(resolvedPipingClass || requestedPipingClass) || material.material || lineKey || branchName,
    serviceProcessFallback, pipingClassMatchedRow: pipingClassRow,
    pipingClassMatchMethod: classMatch.classMatch?.method || classMatch.method,
    pipingClassConfidence: classMatch.classMatch?.confidence ?? classMatch.confidence,
    pipingClassScore: classMatch.classMatch?.score ?? classMatch.score,
    pipingClassRowMethod: classMatch.method, pipingClassRowScore: classMatch.score, pipingClassRowReasons: classMatch.reasons,
    pipingClassNeedsReview: classMatch.classMatch?.needsReview || classMatch.needsReview,
    pipingClassCandidates: classMatch.classMatch?.candidates || classMatch.candidates || [],
  };
}
