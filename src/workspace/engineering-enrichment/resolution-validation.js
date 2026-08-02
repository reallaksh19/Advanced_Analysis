import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { isPlainRecord } from '../../core/shared-piping-model/immutable.js';
import { ENRICHMENT_RESOLUTION_SCHEMA } from './resolution.js';

const RESOLUTION_KEYS = Object.freeze([
  'schema',
  'sourceDatasetHash',
  'sourceSharedModelHash',
  'masterSnapshotHashes',
  'proposalHashes',
  'rows',
  'summary',
  'bindingCreated',
  'resolutionHash',
]);

export function assertEngineeringEnrichmentResolution(value) {
  assertExactKeys(value, RESOLUTION_KEYS, 'Engineering enrichment resolution');
  if (value.schema !== ENRICHMENT_RESOLUTION_SCHEMA) {
    fail(`schema must be ${ENRICHMENT_RESOLUTION_SCHEMA}.`);
  }
  if (value.bindingCreated !== false) {
    fail('foundation resolution must not create bindings.', RangeError);
  }
  if (!Array.isArray(value.masterSnapshotHashes) || !Array.isArray(value.proposalHashes)) {
    fail('snapshot and proposal hashes must be arrays.');
  }
  if (!Array.isArray(value.rows)) fail('rows must be an array.');
  value.rows.forEach((row, index) => {
    if (!isPlainRecord(row)) fail(`rows[${index}] must be an object.`);
    if (row.bindingCreated !== false) fail(`rows[${index}] created a binding.`, RangeError);
  });
  const material = {
    schema: value.schema,
    sourceDatasetHash: value.sourceDatasetHash,
    sourceSharedModelHash: value.sourceSharedModelHash,
    masterSnapshotHashes: value.masterSnapshotHashes,
    proposalHashes: value.proposalHashes,
    rows: value.rows,
    summary: value.summary,
    bindingCreated: value.bindingCreated,
  };
  if (value.resolutionHash !== semanticHash(material)) {
    fail('resolutionHash is invalid.', RangeError);
  }
  return value;
}

function assertExactKeys(value, expected, label) {
  if (!isPlainRecord(value)) fail(`${label} must be an object.`);
  const actual = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${label} keys must be exactly: ${wanted.join(', ')}.`);
  }
}
function compareAscii(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function fail(message, Constructor = TypeError) {
  throw new Constructor(`EngineeringEnrichmentValidation: ${message}`);
}
