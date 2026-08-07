import { deepFreeze, semanticHash, stringValue } from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_TABLE_CUSTODY_SCHEMA = 'TopologyEditTableCustody.v1';
export const TOPOLOGY_EDIT_TABLE_CATALOGUE_AUTHORITY = Object.freeze({
  EXACT: 'EXACT',
  UNRESOLVED: 'UNRESOLVED',
});

export function buildTopologyEditTableCustody({ dataset, entity, canonicalRecord } = {}) {
  const sourceSnapshot = dataset?.sourceSnapshot ?? null;
  const sourceIdentity = {
    datasetId: stringValue(dataset?.datasetId) || null,
    datasetVersion: Number(dataset?.version || 0),
    sourceSchema: stringValue(dataset?.sourceSchema) || null,
    sourceName: stringValue(dataset?.sourceName) || null,
    sourceHash: sourceSnapshot?.sourceSemanticHash ?? null,
    sourceByteHash: sourceSnapshot?.sourceByteHash ?? null,
    sourceEntityId: stringValue(entity?.sourceEntityId) || null,
    sourcePath: stringValue(entity?.sourcePath ?? canonicalRecord?.sourcePath) || null,
    sourceNodeKey: stringValue(entity?.sourceNodeKey) || null,
    jsonPointer: stringValue(entity?.jsonPointer) || null,
  };
  const opaqueEvidence = sourceOpaqueEvidence(entity);
  const catalogue = exactCatalogueEvidence(canonicalRecord, entity);
  const identityKind = stringValue(
    canonicalRecord?.identityKind
      ?? entity?.properties?.identity?.identityKind
      ?? entity?.properties?.nativeParams?.identityKind,
  ) || null;
  const sourceStatus = identityKind === 'NATIVE_COMMAND'
    ? 'NATIVE'
    : sourceIdentity.sourceEntityId || sourceIdentity.sourcePath
      ? 'IMPORTED'
      : 'UNSOURCED';
  const material = {
    schema: TOPOLOGY_EDIT_TABLE_CUSTODY_SCHEMA,
    sourceStatus,
    identityKind,
    sourceIdentity,
    opaqueEvidence,
    catalogueAuthority: catalogue ? TOPOLOGY_EDIT_TABLE_CATALOGUE_AUTHORITY.EXACT
      : TOPOLOGY_EDIT_TABLE_CATALOGUE_AUTHORITY.UNRESOLVED,
    catalogue,
  };
  return deepFreeze({ ...material, custodyHash: semanticHash(material) });
}

function sourceOpaqueEvidence(entity) {
  if (!entity) return null;
  const material = {
    sourceAttributes: entity.properties?.sourceAttributes ?? {},
    attributes: entity.properties?.attributes ?? {},
    enrichedAttributes: entity.properties?.enrichedAttributes ?? {},
    nativeParams: entity.properties?.nativeParams ?? {},
  };
  return deepFreeze({ opaqueHash: semanticHash(material) });
}

function exactCatalogueEvidence(record, entity) {
  const binding = record?.catalogueBinding ?? null;
  const native = entity?.properties?.nativeParams ?? {};
  const catalogue = native.catalogue ?? {};
  const candidate = {
    catalogueId: binding?.catalogueId ?? record?.catalogueId ?? catalogue.catalogueId ?? null,
    catalogueVersion: binding?.catalogueVersion ?? record?.catalogueVersion
      ?? catalogue.catalogueVersion ?? null,
    catalogueHash: binding?.catalogueHash ?? record?.catalogueHash ?? catalogue.catalogueHash ?? null,
    sourceHash: binding?.sourceHash ?? binding?.catalogueSourceHash
      ?? record?.catalogueSourceHash ?? catalogue.catalogueSourceHash ?? null,
    recordId: binding?.recordId ?? record?.catalogueRecordId ?? catalogue.catalogueRecordId ?? null,
    recordHash: binding?.recordHash ?? record?.catalogueRecordHash
      ?? catalogue.catalogueRecordHash ?? null,
    sourceReference: binding?.sourceReference ?? record?.catalogueSourceReference
      ?? catalogue.catalogueSourceReference ?? null,
  };
  if (!candidate.catalogueHash || !candidate.recordId || !candidate.recordHash) return null;
  return deepFreeze(candidate);
}
