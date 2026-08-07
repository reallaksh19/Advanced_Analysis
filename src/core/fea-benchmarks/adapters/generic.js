import { semanticHash } from '../../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../../shared-piping-model/immutable.js';
import { compareAscii, normalizeBenchmarkResultRows } from '../qualification-contract.js';

/**
 * Adapter factory for BM1/BM2/BM3 and future benchmarks whose source parsers
 * are supplied by the benchmark package. Model-specific parsing stays outside
 * the shared solve/comparison pipeline.
 */
export function createBenchmarkQualificationAdapter({
  adapterId,
  benchmarkId,
  caseIds,
  parseModel,
  parseReference,
  normalizeReferenceCase = defaultNormalizeReferenceCase,
}) {
  const acceptedAdapterId = nonempty(adapterId, 'adapterId');
  const acceptedBenchmarkId = nonempty(benchmarkId, 'benchmarkId');
  if (!Array.isArray(caseIds) || caseIds.length === 0) throw new TypeError('caseIds must be a non-empty array.');
  const acceptedCaseIds = Object.freeze([...new Set(caseIds.map((row) => nonempty(row, 'caseId')))].sort(compareAscii));
  requireFunction(parseModel, 'parseModel');
  requireFunction(parseReference, 'parseReference');
  requireFunction(normalizeReferenceCase, 'normalizeReferenceCase');

  return Object.freeze({
    adapterId: acceptedAdapterId,
    benchmarkId: acceptedBenchmarkId,
    caseIds: acceptedCaseIds,
    ingest(source) {
      const modelInput = parseModel(source);
      const parsedReference = parseReference(source);
      const references = Object.fromEntries(acceptedCaseIds.map((caseId) => [
        caseId,
        normalizeBenchmarkResultRows(normalizeReferenceCase({
          caseId,
          parsedReference,
          source,
          modelInput,
        }), caseId),
      ]));
      const modelIdentity = modelInput?.semanticHash
        ?? modelInput?.mechanicalModelSemanticHash
        ?? semanticHash(modelInput);
      return deepFreeze({
        benchmarkId: acceptedBenchmarkId,
        adapterId: acceptedAdapterId,
        caseIds: acceptedCaseIds,
        modelInput,
        modelIdentity,
        references,
        semanticHash: semanticHash({
          benchmarkId: acceptedBenchmarkId,
          adapterId: acceptedAdapterId,
          caseIds: acceptedCaseIds,
          modelIdentity,
          references,
        }),
      });
    },
    referenceRows({ caseId, ingestion }) {
      if (!acceptedCaseIds.includes(caseId)) throw new TypeError(`Unknown ${acceptedBenchmarkId} qualification case ${caseId}.`);
      return ingestion.references[caseId];
    },
  });
}

function defaultNormalizeReferenceCase({ caseId, parsedReference }) {
  const value = parsedReference?.[caseId];
  if (!Array.isArray(value)) throw new TypeError(`Reference rows for ${caseId} must be an array.`);
  return value;
}

function requireFunction(value, field) {
  if (typeof value !== 'function') throw new TypeError(`${field} must be a function.`);
}

function nonempty(value, field) {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${field} is required.`);
  return text;
}
