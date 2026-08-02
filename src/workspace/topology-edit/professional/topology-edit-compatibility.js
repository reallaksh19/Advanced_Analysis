import {
  deepFreeze,
  isPlainRecord,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditOperationPlan,
  createTopologyEditOperationPlan,
} from './topology-edit-operation-plan.js';
import {
  assertTopologyEditSpecificationCatalogue,
  createTopologyEditSpecificationRecord,
  topologyEditSpecificationRecordKey,
} from './topology-edit-spec-catalog.js';

export const TOPOLOGY_EDIT_SPEC_QUERY_SCHEMA =
  'TopologyEditSpecificationQuery.v1';
export const TOPOLOGY_EDIT_COMPATIBILITY_SCHEMA =
  'TopologyEditSpecificationCompatibility.v1';
export const TOPOLOGY_EDIT_COMPATIBILITY_STATUSES = Object.freeze([
  'COMPATIBLE', 'UNAVAILABLE', 'AMBIGUOUS', 'INCOMPATIBLE',
]);

const STATUSES = new Set(TOPOLOGY_EDIT_COMPATIBILITY_STATUSES);
const CANONICAL_ID = /^(node|edge|junction|support|boundary|rigid):\S+$/u;
const IDENTITY_FIELDS = Object.freeze([
  'componentType', 'nominalSizeMm', 'secondaryNominalSizeMm', 'pipingClass',
]);

export function createTopologyEditSpecificationQuery(input = {}) {
  const normalized = createTopologyEditSpecificationRecord({
    ...input,
    recordId: 'QUERY',
    sourceReference: {
      documentId: 'QUERY',
      revision: '1',
      path: '/query',
    },
  });
  const material = {
    schema: TOPOLOGY_EDIT_SPEC_QUERY_SCHEMA,
    expectedCatalogueHash: requiredText(
      input.expectedCatalogueHash,
      'expectedCatalogueHash',
    ),
    targetIds: normalizeTargetIds(input.targetIds),
    key: topologyEditSpecificationRecordKey(normalized),
  };
  return deepFreeze({ ...material, queryHash: semanticHash(material) });
}

export function resolveTopologyEditSpecificationCompatibility(input = {}) {
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const query = createTopologyEditSpecificationQuery(input.request);
  if (query.expectedCatalogueHash !== catalogue.catalogueHash) {
    fail(
      `stale catalogue ${query.expectedCatalogueHash}; current catalogue is ${catalogue.catalogueHash}.`,
      RangeError,
    );
  }
  const rows = catalogue.records.map((record) => ({
    record,
    key: topologyEditSpecificationRecordKey(record),
  }));
  const exact = rows.filter((row) => sameKey(row.key, query.key));
  const family = rows.filter((row) => IDENTITY_FIELDS.every((field) => (
    sameValue(row.key[field], query.key[field])
  )));
  const status = exact.length === 1
    ? 'COMPATIBLE'
    : exact.length > 1
      ? 'AMBIGUOUS'
      : family.length > 0
        ? 'INCOMPATIBLE'
        : 'UNAVAILABLE';
  const candidates = (exact.length ? exact : family).map((row) => candidate(
    row.record,
    mismatchFields(row.key, query.key),
  )).sort((left, right) => left.recordId.localeCompare(right.recordId));
  const material = {
    schema: TOPOLOGY_EDIT_COMPATIBILITY_SCHEMA,
    status,
    catalogueId: catalogue.catalogueId,
    catalogueVersion: catalogue.catalogueVersion,
    catalogueHash: catalogue.catalogueHash,
    query,
    selectedRecordId: status === 'COMPATIBLE' ? candidates[0].recordId : null,
    candidates,
    diagnostics: diagnostics(status, candidates),
  };
  return deepFreeze({ ...material, compatibilityHash: semanticHash(material) });
}

export function assertTopologyEditSpecificationCompatibility(value) {
  if (!isPlainRecord(value)) fail('compatibility result must be an object.');
  if (value.schema !== TOPOLOGY_EDIT_COMPATIBILITY_SCHEMA) {
    fail(`result must use ${TOPOLOGY_EDIT_COMPATIBILITY_SCHEMA}.`);
  }
  if (!STATUSES.has(value.status)) fail(`unsupported status ${value.status}.`, RangeError);
  const supplied = { ...value };
  delete supplied.compatibilityHash;
  if (value.compatibilityHash !== semanticHash(supplied)) {
    fail('compatibility hash does not match normalized authority.', RangeError);
  }
  if (value.status === 'COMPATIBLE' && !stringValue(value.selectedRecordId)) {
    fail('COMPATIBLE result requires selectedRecordId.', RangeError);
  }
  if (value.status !== 'COMPATIBLE' && value.selectedRecordId !== null) {
    fail(`${value.status} result must not select a record.`, RangeError);
  }
  return value;
}

export function bindTopologyEditCompatibilityToPlan(planInput, resultInput) {
  const plan = assertTopologyEditOperationPlan(planInput);
  const result = assertTopologyEditSpecificationCompatibility(resultInput);
  const planTargets = new Set(plan.targetIds);
  const undeclared = result.query.targetIds.filter((id) => !planTargets.has(id));
  if (undeclared.length) {
    fail(`compatibility target IDs are absent from plan: ${undeclared.join(', ')}.`, RangeError);
  }
  const unresolvedEvidence = plan.unresolvedEvidence.filter((row) => (
    row.code !== 'CATALOGUE_COMPATIBILITY_NOT_EVALUATED'
  ));
  if (result.status !== 'COMPATIBLE') {
    unresolvedEvidence.push({
      code: `CATALOGUE_${result.status}`,
      status: result.status,
      targetIds: result.query.targetIds,
      field: 'specificationCompatibility',
      details: {
        catalogueHash: result.catalogueHash,
        queryHash: result.query.queryHash,
        compatibilityHash: result.compatibilityHash,
        candidateRecordIds: result.candidates.map((row) => row.recordId),
      },
    });
  }
  return createTopologyEditOperationPlan({
    ...plan,
    parameters: {
      ...plan.parameters,
      catalogueCompatibility: {
        status: result.status,
        catalogueHash: result.catalogueHash,
        queryHash: result.query.queryHash,
        compatibilityHash: result.compatibilityHash,
        selectedRecordId: result.selectedRecordId,
      },
    },
    unresolvedEvidence,
  });
}

export function assertTopologyEditOperationPlanCatalogueReady(planInput) {
  const plan = assertTopologyEditOperationPlan(planInput);
  const compatibility = plan.parameters.catalogueCompatibility;
  if (!isPlainRecord(compatibility) || compatibility.status !== 'COMPATIBLE') {
    fail('operation plan is blocked until catalogue compatibility is COMPATIBLE.', RangeError);
  }
  if (!stringValue(compatibility.selectedRecordId)) {
    fail('catalogue-ready plan requires selectedRecordId.', RangeError);
  }
  const unresolved = plan.unresolvedEvidence.find((row) => row.code.startsWith('CATALOGUE_'));
  if (unresolved) fail(`operation plan remains blocked by ${unresolved.code}.`, RangeError);
  return plan;
}

function candidate(record, mismatch) {
  return {
    recordId: record.recordId,
    recordHash: record.recordHash,
    sourceReference: record.sourceReference,
    mismatchFields: mismatch,
  };
}
function mismatchFields(left, right) {
  return Object.keys(right).filter((field) => !sameValue(left[field], right[field])).sort();
}
function sameKey(left, right) {
  return semanticHash(left) === semanticHash(right);
}
function sameValue(left, right) {
  return Object.is(left, right);
}
function diagnostics(status, candidates) {
  const messages = {
    COMPATIBLE: 'Exactly one source-backed catalogue record matches the request.',
    UNAVAILABLE: 'No catalogue record exists for the requested component identity.',
    AMBIGUOUS: 'Multiple source-backed catalogue records match exactly.',
    INCOMPATIBLE: 'Catalogue records exist for the component identity but exact engineering fields differ.',
  };
  return [{
    code: `CATALOGUE_${status}`,
    severity: status === 'COMPATIBLE' ? 'INFO' : 'ERROR',
    message: messages[status],
    candidateRecordIds: candidates.map((row) => row.recordId),
  }];
}
function normalizeTargetIds(value) {
  if (!Array.isArray(value) || value.length === 0) fail('targetIds must be a non-empty array.');
  const ids = value.map((row, index) => requiredText(row, `targetIds[${index}]`));
  if (ids.some((id) => !CANONICAL_ID.test(id))) {
    fail('targetIds must contain exact canonical identities.', RangeError);
  }
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}
function requiredText(value, label) {
  const text = stringValue(value);
  if (!text) fail(`${label} is required.`);
  return text;
}
function fail(message, Constructor = TypeError) {
  throw new Constructor(`TopologyEditSpecificationCompatibility: ${message}`);
}
