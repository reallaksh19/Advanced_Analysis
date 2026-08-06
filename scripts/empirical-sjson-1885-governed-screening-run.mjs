import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const [profilePath, enrichedPath, projectedXmlPath, projectionEvidencePath, outputPath = '/tmp/empirical-sjson-1885-screening-result.json'] = process.argv.slice(2);
if (!profilePath || !enrichedPath || !projectedXmlPath || !projectionEvidencePath) {
  throw new Error('Usage: node empirical-sjson-1885-governed-screening-run.mjs <profile.json> <EnrichedSjson> <governed-topology.xml> <projection-evidence.json> [output.json]');
}

const governedRunnerPath = fileURLToPath(import.meta.url);
const [profileText, projectedXml, evidenceText, governedRunnerText] = await Promise.all([
  readFile(profilePath, 'utf8'),
  readFile(projectedXmlPath, 'utf8'),
  readFile(projectionEvidencePath, 'utf8'),
  readFile(governedRunnerPath, 'utf8'),
]);
const profile = JSON.parse(profileText.replace(/^\uFEFF/u, ''));
const evidence = JSON.parse(evidenceText.replace(/^\uFEFF/u, ''));
const sectionAudit = Object.freeze({
  ...validateGovernedInput(profile, projectedXml, evidence),
  governedRunnerSha256: sha256(governedRunnerText),
});

const scriptDirectory = dirname(governedRunnerPath);
const legacyRunnerPath = resolve(scriptDirectory, 'empirical-sjson-1885-configurable-screening-run.mjs');
const run = spawnSync(process.execPath, [legacyRunnerPath, profilePath, enrichedPath, projectedXmlPath, outputPath], {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
if (run.status !== 0) {
  process.stdout.write(run.stdout || '');
  process.stderr.write(run.stderr || '');
  throw new Error(`Governed screening delegate failed with exit code ${run.status}.`);
}

const delegatedText = await readFile(outputPath, 'utf8');
const delegated = JSON.parse(delegatedText.replace(/^\uFEFF/u, ''));
if (delegated.source?.hashes?.topologyInputXmlSha256 !== evidence.projectedTopologySha256) {
  throw new Error('Delegated result topology hash does not match the governed projection evidence.');
}
const result = {
  ...delegated,
  sectionAuthority: sectionAudit,
};
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log('EMPIRICAL_SJSON_1885_GOVERNED_SCREENING_RESULT_BEGIN');
console.log(JSON.stringify({
  status: result.status,
  sectionAuthority: result.sectionAuthority,
  totalModelMassKg: result.verticalWeight?.totalModelMassKg,
  totalWeightKn: result.verticalWeight?.totalWeightKn,
  maximumComponentVectorKn: result.componentVectorScreening?.maximumMagnitudeKn,
}, null, 2));
console.log('EMPIRICAL_SJSON_1885_GOVERNED_SCREENING_RESULT_END');

function validateGovernedInput(profile, projectedXml, evidence) {
  const requiredMethod = profile.sectionResolution?.method;
  if (requiredMethod !== 'COMMON_POS_SECTION_MATERIAL_V1') {
    throw new Error(`Profile sectionResolution.method must be COMMON_POS_SECTION_MATERIAL_V1; received ${requiredMethod}.`);
  }
  if (profile.sectionResolution?.blockedPolicy !== 'BLOCK_CALCULATION') {
    throw new Error('Profile section-resolution blocked policy must be BLOCK_CALCULATION.');
  }
  if (profile.sectionResolution?.scheduleDefaultPolicy !== 'PROHIBITED') {
    throw new Error('Profile schedule-default policy must be PROHIBITED.');
  }
  if (evidence.schema !== profile.sectionResolution?.governedProjectionSchema) {
    throw new Error(`Projection schema mismatch: expected ${profile.sectionResolution?.governedProjectionSchema}, received ${evidence.schema}.`);
  }
  if (evidence.method !== requiredMethod) {
    throw new Error(`Projection method mismatch: expected ${requiredMethod}, received ${evidence.method}.`);
  }
  const projectedTopologySha256 = sha256(projectedXml);
  if (projectedTopologySha256 !== evidence.projectedTopologySha256) {
    throw new Error('Governed topology hash does not match projection evidence.');
  }
  if (evidence.scheduleDefaultApplicationCount !== 0) {
    throw new Error(`Schedule defaults are prohibited; received ${evidence.scheduleDefaultApplicationCount} application(s).`);
  }
  if (!Array.isArray(evidence.rows) || evidence.rows.length !== evidence.rowCount) {
    throw new Error('Projection evidence rows do not match its declared row count.');
  }

  const openings = [...projectedXml.matchAll(/<PIPINGELEMENT\b([^>]*)>/g)];
  if (openings.length !== evidence.rowCount) {
    throw new Error(`Governed topology contains ${openings.length} PIPINGELEMENT rows; evidence declares ${evidence.rowCount}.`);
  }
  const schedules = {};
  const positionRefs = new Set();
  for (let index = 0; index < openings.length; index += 1) {
    const attrs = parseAttrs(openings[index][1]);
    const evidenceRow = evidence.rows[index];
    if (attrs.SECTION_AUTHORITY !== requiredMethod) {
      throw new Error(`PIPINGELEMENT ${index + 1} lacks ${requiredMethod} section authority.`);
    }
    if (attrs.SECTION_POS_REF !== evidenceRow.positionRef) {
      throw new Error(`PIPINGELEMENT ${index + 1} POS identity mismatch: XML=${attrs.SECTION_POS_REF}, evidence=${evidenceRow.positionRef}.`);
    }
    if (attrs.SECTION_SCHEDULE !== String(evidenceRow.schedule)) {
      throw new Error(`PIPINGELEMENT ${attrs.SECTION_POS_REF} schedule mismatch: XML=${attrs.SECTION_SCHEDULE}, evidence=${evidenceRow.schedule}.`);
    }
    if (String(attrs.ID) !== String(evidenceRow.entityId)) {
      throw new Error(`PIPINGELEMENT ${attrs.SECTION_POS_REF} entity identity mismatch.`);
    }
    const outsideDiameterMm = Number(attrs.DIAMETER);
    const wallThicknessMm = Number(attrs.WALL_THICK);
    if (!(outsideDiameterMm > 0) || !(wallThicknessMm > 0) || !(outsideDiameterMm > 2 * wallThicknessMm)) {
      throw new Error(`PIPINGELEMENT ${attrs.SECTION_POS_REF} does not define a positive governed annulus.`);
    }
    close(outsideDiameterMm, evidenceRow.effectiveOutsideDiameterMm, 1e-6, `${attrs.SECTION_POS_REF} outside diameter`);
    close(wallThicknessMm, evidenceRow.effectiveWallThicknessMm, 1e-6, `${attrs.SECTION_POS_REF} wall thickness`);
    if (positionRefs.has(attrs.SECTION_POS_REF)) throw new Error(`Duplicate governed POS reference ${attrs.SECTION_POS_REF}.`);
    positionRefs.add(attrs.SECTION_POS_REF);
    schedules[attrs.SECTION_SCHEDULE] = (schedules[attrs.SECTION_SCHEDULE] || 0) + 1;
  }

  return {
    method: requiredMethod,
    projectionSchema: evidence.schema,
    projectionSemanticIdentity: evidence.semanticIdentity,
    posCalculationSemanticIdentity: evidence.posCalculationSemanticIdentity,
    sourceTopologySha256: evidence.sourceTopologySha256,
    projectedTopologySha256,
    posReceiptSha256: evidence.posReceiptSha256,
    rowCount: openings.length,
    uniquePositionRefCount: positionRefs.size,
    scheduleCounts: schedules,
    configuredDimensionApplicationCount: evidence.configuredDimensionApplicationCount,
    scheduleDefaultApplicationCount: evidence.scheduleDefaultApplicationCount,
    changedOutsideDiameterCount: evidence.changedOutsideDiameterCount,
    changedWallThicknessCount: evidence.changedWallThicknessCount,
  };
}

function parseAttrs(text) {
  const attrs = {};
  const pattern = /([A-Za-z0-9_:.-]+)="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(text))) attrs[match[1]] = decodeXml(match[2]);
  return attrs;
}
function decodeXml(value) {
  return String(value).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
function close(actual, expected, tolerance, label) {
  if (!Number.isFinite(Number(expected)) || Math.abs(Number(actual) - Number(expected)) > tolerance) {
    throw new Error(`${label}: expected ${expected} ± ${tolerance}; received ${actual}.`);
  }
}
