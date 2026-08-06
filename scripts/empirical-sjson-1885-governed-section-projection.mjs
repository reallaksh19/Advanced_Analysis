import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/empirical-piping-mechanics/identity.js';

const [topologyXmlPath, posReceiptPath, outputXmlPath, outputEvidencePath] = process.argv.slice(2);
if (!topologyXmlPath || !posReceiptPath || !outputXmlPath || !outputEvidencePath) {
  throw new Error('Usage: node empirical-sjson-1885-governed-section-projection.mjs <topology.xml> <pos-receipt.json> <output.xml> <evidence.json>');
}

const sourceXml = await readFile(topologyXmlPath, 'utf8');
const receiptText = await readFile(posReceiptPath, 'utf8');
const receipt = JSON.parse(receiptText.replace(/^\uFEFF/u, ''));
const calculation = receipt.calculation;
if (calculation?.status === 'BLOCKED_MISSING_REQUIRED_INPUT' || calculation?.blockedRowCount !== 0) {
  throw new Error('Governed section projection requires an unblocked POS section/material receipt.');
}
const rows = calculation?.rows;
if (!Array.isArray(rows) || rows.length === 0) {
  throw new Error('POS section/material receipt must contain resolved rows.');
}

let positionIndex = 0;
const projectionRows = [];
const projectedXml = sourceXml.replace(/<PIPINGELEMENT\b([^>]*)>/g, (openingTag, attributesText) => {
  const row = rows[positionIndex];
  if (!row) throw new Error(`Topology contains more PIPINGELEMENT rows than the POS receipt at index ${positionIndex}.`);
  if (row.status !== 'RESOLVED') throw new Error(`${row.posId} is not resolved.`);
  const sourceId = readAttribute(attributesText, 'ID');
  if (String(sourceId) !== String(row.entityId)) {
    throw new Error(`POS order/identity mismatch at ${row.posId}: topology ID=${sourceId}, receipt entityId=${row.entityId}.`);
  }
  const originalOutsideDiameterMm = finiteAttribute(attributesText, 'DIAMETER');
  const originalWallThicknessMm = finiteAttribute(attributesText, 'WALL_THICK');
  const effectiveOutsideDiameterMm = requirePositive(row.outsideDiameterMm, `${row.posId}.outsideDiameterMm`);
  const effectiveWallThicknessMm = requirePositive(row.wallThicknessMm, `${row.posId}.wallThicknessMm`);
  if (!(effectiveOutsideDiameterMm > 2 * effectiveWallThicknessMm)) {
    throw new Error(`${row.posId} effective section is not a positive annulus.`);
  }

  let result = setAttribute(openingTag, 'DIAMETER', formatNumber(effectiveOutsideDiameterMm));
  result = setAttribute(result, 'WALL_THICK', formatNumber(effectiveWallThicknessMm));
  result = setAttribute(result, 'SECTION_AUTHORITY', 'COMMON_POS_SECTION_MATERIAL_V1');
  result = setAttribute(result, 'SECTION_POS_REF', row.posId);
  result = setAttribute(result, 'SECTION_SCHEDULE', row.schedule);

  projectionRows.push(Object.freeze({
    positionRef: row.posId,
    entityId: row.entityId,
    fromNode: row.fromNode,
    toNode: row.toNode,
    componentType: row.componentType,
    componentName: row.componentName,
    nominalBoreMm: row.nominalBoreMm,
    nps: row.nps,
    schedule: row.schedule,
    originalOutsideDiameterMm,
    originalWallThicknessMm,
    effectiveOutsideDiameterMm,
    effectiveWallThicknessMm,
    dimensionResolutionKind: row.resolutions?.dimensionsMm?.kind ?? null,
    dimensionAuthority: row.resolutions?.dimensionsMm?.authority ?? null,
    dimensionDefaultUsageId: row.resolutions?.dimensionsMm?.defaultUsageId ?? null,
    dimensionVerification: row.dimensionVerification,
    posSemanticIdentity: row.semanticIdentity,
  }));
  positionIndex += 1;
  return result;
});

if (positionIndex !== rows.length) {
  throw new Error(`Topology/POS row-count mismatch: projected ${positionIndex}, receipt contains ${rows.length}.`);
}

const projection = {
  schema: 'empirical-sjson-governed-section-projection/v1',
  method: 'COMMON_POS_SECTION_MATERIAL_V1',
  sourceTopologyPath: topologyXmlPath,
  sourceTopologySha256: sha256(sourceXml),
  posReceiptPath,
  posReceiptSha256: sha256(receiptText),
  posCalculationSemanticIdentity: calculation.semanticIdentity,
  projectedTopologyPath: outputXmlPath,
  projectedTopologySha256: sha256(projectedXml),
  rowCount: projectionRows.length,
  changedOutsideDiameterCount: projectionRows.filter((row) => !close(row.originalOutsideDiameterMm, row.effectiveOutsideDiameterMm)).length,
  changedWallThicknessCount: projectionRows.filter((row) => !close(row.originalWallThicknessMm, row.effectiveWallThicknessMm)).length,
  configuredDimensionApplicationCount: projectionRows.filter((row) => row.dimensionResolutionKind === 'PROJECT_CONFIGURED_DEFAULT').length,
  scheduleDefaultApplicationCount: calculation.resolutionReceipt?.configuredDefaultUsages
    ?.filter((usage) => usage.field === 'section.schedule').length ?? null,
  rows: Object.freeze(projectionRows),
};
const evidence = Object.freeze({ ...projection, semanticIdentity: semanticHash(projection) });
await writeFile(outputXmlPath, projectedXml);
await writeFile(outputEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
console.log('EMPIRICAL_SJSON_GOVERNED_SECTION_PROJECTION_BEGIN');
console.log(JSON.stringify({
  rowCount: evidence.rowCount,
  changedOutsideDiameterCount: evidence.changedOutsideDiameterCount,
  changedWallThicknessCount: evidence.changedWallThicknessCount,
  configuredDimensionApplicationCount: evidence.configuredDimensionApplicationCount,
  scheduleDefaultApplicationCount: evidence.scheduleDefaultApplicationCount,
  semanticIdentity: evidence.semanticIdentity,
}, null, 2));
console.log('EMPIRICAL_SJSON_GOVERNED_SECTION_PROJECTION_END');

function readAttribute(text, name) {
  const match = text.match(new RegExp(`\\b${escapeRegExp(name)}="([^"]*)"`));
  return match ? decodeXml(match[1]) : null;
}
function finiteAttribute(text, name) {
  const value = Number(readAttribute(text, name));
  return Number.isFinite(value) ? value : null;
}
function setAttribute(tag, name, value) {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}="[^"]*"`);
  if (pattern.test(tag)) return tag.replace(pattern, `${name}="${escapeXml(value)}"`);
  return tag.replace(/>$/, ` ${name}="${escapeXml(value)}">`);
}
function formatNumber(value) {
  return Number(value).toFixed(6).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}
function requirePositive(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || !(number > 0)) throw new RangeError(`${field} must be positive.`);
  return number;
}
function close(a, b) {
  return Number.isFinite(Number(a)) && Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= 1e-9;
}
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function escapeXml(value) { return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function decodeXml(value) { return String(value).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
