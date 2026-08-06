import { readFile, writeFile } from 'node:fs/promises';

const [receiptPath, posCsvPath, usageCsvPath] = process.argv.slice(2);
if (!receiptPath || !posCsvPath || !usageCsvPath) {
  throw new Error('Usage: node empirical-pos-section-material-csv.mjs <receipt.json> <pos.csv> <default-usage.csv>');
}
const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
const calculation = receipt.calculation;
if (!calculation || !Array.isArray(calculation.rows)) throw new Error('Invalid POS section/material receipt.');

const posFields = [
  'posId', 'entityId', 'fromNode', 'toNode', 'componentType', 'componentName', 'lineId',
  'branchName', 'branchPath', 'sourceRecordName', 'nominalBoreMm', 'nps', 'schedule',
  'outsideDiameterMm', 'wallThicknessMm', 'metalMassPerLengthKgM',
  'dimensionResolutionKind', 'dimensionDefaultUsageId', 'dimensionVerificationStatus',
  'topologyWallThicknessMm', 'masterWallThicknessMm', 'topologyWallUsedForCalculation',
  'materialFamilyDefaultUsageId', 'elasticModulusDefaultUsageId', 'poissonsRatioDefaultUsageId',
  'densityDefaultUsageId', 'thermalExpansionDefaultUsageId', 'corrosionAllowanceDefaultUsageId',
  'codeStressWallRuleDefaultUsageId', 'semanticIdentity',
];
const posRows = calculation.rows.map((row) => {
  const verification = row.dimensionVerification || {};
  const resolutions = row.resolutions || {};
  return {
    posId: row.posId,
    entityId: row.entityId,
    fromNode: row.fromNode,
    toNode: row.toNode,
    componentType: row.componentType,
    componentName: row.componentName,
    lineId: row.lineId,
    branchName: row.branchName,
    branchPath: row.branchPath,
    sourceRecordName: row.sourceRecordName,
    nominalBoreMm: row.nominalBoreMm,
    nps: row.nps,
    schedule: row.schedule,
    outsideDiameterMm: row.outsideDiameterMm,
    wallThicknessMm: row.wallThicknessMm,
    metalMassPerLengthKgM: row.metalMassPerLengthKgM,
    dimensionResolutionKind: resolutions.dimensionsMm?.kind,
    dimensionDefaultUsageId: resolutions.dimensionsMm?.defaultUsageId,
    dimensionVerificationStatus: verification.status,
    topologyWallThicknessMm: verification.sourceWallThicknessMm,
    masterWallThicknessMm: verification.masterWallThicknessMm,
    topologyWallUsedForCalculation: verification.topologyWallUsedForCalculation,
    materialFamilyDefaultUsageId: resolutions.materialFamily?.defaultUsageId,
    elasticModulusDefaultUsageId: resolutions.elasticModulusPa?.defaultUsageId,
    poissonsRatioDefaultUsageId: resolutions.poissonsRatio?.defaultUsageId,
    densityDefaultUsageId: resolutions.densityKgM3?.defaultUsageId,
    thermalExpansionDefaultUsageId: resolutions.thermalExpansionPerC?.defaultUsageId,
    corrosionAllowanceDefaultUsageId: resolutions.corrosionAllowanceMm?.defaultUsageId,
    codeStressWallRuleDefaultUsageId: resolutions.codeStressWallRule?.defaultUsageId,
    semanticIdentity: row.semanticIdentity,
  };
});

const usageFields = [
  'usageId', 'defaultId', 'field', 'effectiveValue', 'unit', 'entityId', 'posId',
  'fromNode', 'toNode', 'sourceMissingReason', 'projectDataRevision',
  'projectDataSemanticHash', 'affectedCalculations', 'qualification', 'reason',
];
const usageRows = (calculation.resolutionReceipt?.configuredDefaultUsages || []).map((usage) => ({
  ...usage,
  effectiveValue: encodeValue(usage.effectiveValue),
  affectedCalculations: (usage.affectedCalculations || []).join('|'),
}));

await writeFile(posCsvPath, csv(posFields, posRows));
await writeFile(usageCsvPath, csv(usageFields, usageRows));
console.log(`EMPIRICAL_POS_SECTION_CSV_OK rows=${posRows.length} defaultUsages=${usageRows.length}`);

function csv(fields, rows) {
  return `${fields.join(',')}\n${rows.map((row) => fields.map((field) => quote(row[field])).join(',')).join('\n')}\n`;
}
function quote(value) {
  if (value === undefined || value === null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function encodeValue(value) {
  return value && typeof value === 'object' ? JSON.stringify(value) : value;
}
