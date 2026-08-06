import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/empirical-piping-mechanics/identity.js';
import { resolvePosSectionMaterialStates } from '../src/calc-workspace/cii-standalone-port/core/pos-section-material-resolution.js';
import { resolveProjectDataConfiguredDefaultsAuthority } from '../src/workspace/project-data/project-data-configured-resolution.js';

const [profilePath, enrichedPath, topologyXmlPath, outputPath = '/tmp/empirical-sjson-1885-pos-section-material.json'] = process.argv.slice(2);
if (!profilePath || !enrichedPath || !topologyXmlPath) {
  throw new Error('Usage: node empirical-sjson-1885-pos-section-material-run.mjs <project-data-or-defaults.json> <EnrichedSjson> <topology.xml> [output.json]');
}

const profileText = await readFile(profilePath, 'utf8');
const sourceText = await readFile(enrichedPath, 'utf8');
const topologyXmlText = await readFile(topologyXmlPath, 'utf8');
const profile = JSON.parse(profileText.replace(/^\uFEFF/u, ''));
const sourceRoot = JSON.parse(sourceText.replace(/^\uFEFF/u, ''));
const projectDataAuthority = profile.schema === 'project-data-profile/v1'
  ? resolveProjectDataConfiguredDefaultsAuthority(profile)
  : null;
if (projectDataAuthority && projectDataAuthority.status !== 'READY') {
  throw new Error(`Project Data configured-default authority is blocked: ${projectDataAuthority.blockers
    .map((row) => `${row.path}=${row.code}:${row.message}`).join(' | ')}`);
}
const configuredDefaults = projectDataAuthority
  ? projectDataAuthority.configuredDefaults
  : profile.configuredDefaults;
const dimensionVerificationTolerancesMm = projectDataAuthority
  ? projectDataAuthority.dimensionVerificationTolerancesMm
  : profile.dimensionVerificationTolerancesMm;
if (!Array.isArray(configuredDefaults)) {
  throw new Error('Configured defaults must be an array in the Project Data profile or standalone defaults package.');
}
if (!dimensionVerificationTolerancesMm || typeof dimensionVerificationTolerancesMm !== 'object') {
  throw new Error('Dimension verification tolerances must be configured in Project Data or the standalone defaults package.');
}

const calculation = resolvePosSectionMaterialStates({
  sourceRoot,
  topologyXmlText,
  projectId: profile.projectId,
  projectDataRevision: projectDataAuthority?.projectDataRevision ?? profile.revision,
  projectDataSemanticHash: projectDataAuthority?.projectDataSemanticHash ?? semanticHash(profile),
  configuredDefaults,
  dimensionVerificationTolerancesMm,
});
const receipt = {
  schema: 'empirical-sjson-1885-pos-section-material-audit/v1',
  source: {
    profilePath,
    enrichedPath,
    topologyXmlPath,
    profileSha256: sha256(profileText),
    enrichedSha256: sha256(sourceText),
    topologyXmlSha256: sha256(topologyXmlText),
    projectDataConfiguredDefaultsAuthority: projectDataAuthority
      ? {
        schema: projectDataAuthority.schema,
        semanticIdentity: projectDataAuthority.semanticIdentity,
        projectDataPath: projectDataAuthority.projectDataPaths.configuredDefaults,
      }
      : null,
  },
  calculation,
};
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log('EMPIRICAL_SJSON_1885_POS_SECTION_MATERIAL_BEGIN');
console.log(JSON.stringify({
  status: calculation.status,
  resolvedRowCount: calculation.resolvedRowCount,
  blockedRowCount: calculation.blockedRowCount,
  dimensionVerificationTolerancesMm: calculation.dimensionVerificationTolerancesMm,
  dimensionVerificationStatusCounts: calculation.dimensionVerificationStatusCounts,
  branchScheduleSummary: calculation.branchScheduleSummary,
  blockedDimensionInputs: countBy(
    calculation.rows.filter((row) => row.blockers.some((item) => item.field.startsWith('section.dimension'))),
    (row) => `DN=${row.nominalBoreMm}|SCH=${row.schedule}|BRANCH=${row.branchPath}`,
  ),
  defaultUsageSummary: calculation.resolutionReceipt.summary,
}, null, 2));
console.log('EMPIRICAL_SJSON_1885_POS_SECTION_MATERIAL_END');

if (calculation.blockedRowCount > 0) {
  const sample = calculation.rows.filter((row) => row.status !== 'RESOLVED').slice(0, 30)
    .map((row) => [
      row.posId,
      `topology=${row.componentType}:${row.componentName}`,
      `source=${row.sourceRecordMatched ? `${row.sourceRecordName}:${row.branchPath}` : 'UNMATCHED'}`,
      `DN=${row.nominalBoreMm}`,
      `SCH=${row.schedule}`,
      `dimensionStatus=${row.dimensionVerification?.status || 'NONE'}`,
      `blockers=${row.blockers.map((item) => `${item.field}=${item.status}:${item.reason}`).join(', ')}`,
    ].join(' '));
  throw new Error(`POS section/material resolution blocked ${calculation.blockedRowCount} row(s). ${sample.join(' | ')}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function countBy(values, keyFn) {
  const counts = {};
  for (const value of values) {
    const key = keyFn(value);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
