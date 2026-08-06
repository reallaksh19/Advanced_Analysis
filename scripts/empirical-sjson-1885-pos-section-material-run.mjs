import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { semanticHash } from '../src/core/empirical-piping-mechanics/identity.js';
import { resolvePosSectionMaterialStates } from '../src/calc-workspace/cii-standalone-port/core/pos-section-material-resolution.js';

const [profilePath, enrichedPath, topologyXmlPath, outputPath = '/tmp/empirical-sjson-1885-pos-section-material.json'] = process.argv.slice(2);
if (!profilePath || !enrichedPath || !topologyXmlPath) {
  throw new Error('Usage: node empirical-sjson-1885-pos-section-material-run.mjs <project-data-or-defaults.json> <EnrichedSjson> <topology.xml> [output.json]');
}

const profileText = await readFile(profilePath, 'utf8');
const sourceText = await readFile(enrichedPath, 'utf8');
const topologyXmlText = await readFile(topologyXmlPath, 'utf8');
const profile = JSON.parse(profileText.replace(/^\uFEFF/u, ''));
const sourceRoot = JSON.parse(sourceText.replace(/^\uFEFF/u, ''));
const configuredDefaults = profile.schema === 'project-data-profile/v1'
  ? profile.loadCalculation?.configuredDefaults?.value
  : profile.configuredDefaults;
if (!Array.isArray(configuredDefaults)) {
  throw new Error('Configured defaults must be an array in the Project Data profile or standalone defaults package.');
}

const calculation = resolvePosSectionMaterialStates({
  sourceRoot,
  topologyXmlText,
  projectId: profile.projectId,
  projectDataRevision: profile.revision,
  projectDataSemanticHash: semanticHash(profile),
  configuredDefaults,
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
  },
  calculation,
};
await writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
console.log('EMPIRICAL_SJSON_1885_POS_SECTION_MATERIAL_BEGIN');
console.log(JSON.stringify({
  status: calculation.status,
  resolvedRowCount: calculation.resolvedRowCount,
  blockedRowCount: calculation.blockedRowCount,
  defaultUsageSummary: calculation.resolutionReceipt.summary,
}, null, 2));
console.log('EMPIRICAL_SJSON_1885_POS_SECTION_MATERIAL_END');

if (calculation.blockedRowCount > 0) {
  const sample = calculation.rows.filter((row) => row.status !== 'RESOLVED').slice(0, 10)
    .map((row) => `${row.posId}: ${row.blockers.map((item) => `${item.field}=${item.status}`).join(', ')}`);
  throw new Error(`POS section/material resolution blocked ${calculation.blockedRowCount} row(s). ${sample.join(' | ')}`);
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
