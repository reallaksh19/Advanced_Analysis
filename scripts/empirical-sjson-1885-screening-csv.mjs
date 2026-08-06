import { readFile, writeFile } from 'node:fs/promises';

const [resultPath, outputPath] = process.argv.slice(2);
if (!resultPath || !outputPath) {
  throw new Error('Usage: node empirical-sjson-1885-screening-csv.mjs <result.json> <output.csv>');
}
const result = JSON.parse((await readFile(resultPath, 'utf8')).replace(/^\uFEFF/u, ''));
if (result.sectionAuthority?.method !== 'COMMON_POS_SECTION_MATERIAL_V1') {
  throw new Error('Support-reaction CSV requires a COMMON_POS_SECTION_MATERIAL_V1 governed result.');
}
if (!Array.isArray(result.supportRows) || result.supportRows.length === 0) {
  throw new Error('Governed result contains no support rows.');
}
const header = [
  'siteId', 'supportTag', 'xMm', 'yMm', 'zMm', 'capabilities', 'directionAxes',
  'FxThermal_kN', 'FyThermal_kN', 'FzWeight_kN', 'componentVectorMagnitude_kN',
  'thermalMovementX_mm', 'thermalMovementY_mm',
];
const rows = result.supportRows.map((row) => [
  row.siteId,
  row.supportTag,
  row.sourceCoordinateMm?.x,
  row.sourceCoordinateMm?.y,
  row.sourceCoordinateMm?.z,
  [...(row.capabilities || [])].join('+'),
  [...(row.inferredDirections || [])].map((item) => `${item.capability}:${item.axis}`).join('+'),
  row.reactionsKn?.FxThermal,
  row.reactionsKn?.FyThermal,
  row.reactionsKn?.FzWeight,
  row.componentVectorMagnitudeKn,
  row.thermalMovementMm?.X,
  row.thermalMovementMm?.Y,
]);
const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
await writeFile(outputPath, csv);
console.log(`EMPIRICAL_SJSON_1885_SCREENING_CSV_OK rows=${rows.length}`);

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
