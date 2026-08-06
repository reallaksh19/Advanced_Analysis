import {
  deepFreeze,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';
import {
  assertTopologyEditSpecificationCatalogue,
} from '../professional/topology-edit-spec-catalog.js';

export const TOPOLOGY_EDIT_AUTHORING_BRANCH_CATALOGUE_OPTIONS_SCHEMA =
  'TopologyEditAuthoringBranchCatalogueOptions.v1';

const BRANCH_TYPES = new Set(['TEE', 'OLET']);

export function deriveTopologyEditAuthoringBranchCatalogueOptions(input = {}) {
  const catalogue = assertTopologyEditSpecificationCatalogue(input.catalogue);
  const branchFamily = optionalBranchFamily(input.branchFamily);
  const hostNominalSizeMm = positiveNumber(
    input.hostNominalSizeMm,
    'hostNominalSizeMm',
  );
  const hostOutsideDiameterMm = positiveNumber(
    input.hostOutsideDiameterMm,
    'hostOutsideDiameterMm',
  );
  const pipingClass = optionalUpper(input.pipingClass);

  const family = catalogue.records
    .filter((record) => BRANCH_TYPES.has(record.componentType))
    .filter((record) => !branchFamily || record.componentType === branchFamily)
    .sort((left, right) => left.recordId.localeCompare(right.recordId));
  const compatible = family.filter((record) => (
    record.nominalSizeMm === hostNominalSizeMm
    && record.outsideDiameterMm === hostOutsideDiameterMm
    && (!pipingClass || upper(record.pipingClass) === pipingClass)
  ));

  const material = {
    schema: TOPOLOGY_EDIT_AUTHORING_BRANCH_CATALOGUE_OPTIONS_SCHEMA,
    catalogueHash: catalogue.catalogueHash,
    catalogueVersion: catalogue.catalogueVersion,
    catalogueSourceHash: catalogue.authority.sourceHash,
    branchFamily,
    hostNominalSizeMm,
    hostOutsideDiameterMm,
    pipingClass,
    status: compatible.length ? 'AVAILABLE' : 'UNAVAILABLE',
    familyRecordIds: family.map((record) => record.recordId),
    optionRecordIds: compatible.map((record) => record.recordId),
    options: compatible.map((record) => optionValue(catalogue, record)),
  };
  return deepFreeze({
    ...material,
    optionsHash: semanticHash(material),
  });
}

export function assertTopologyEditAuthoringBranchCatalogueOptions(value) {
  if (
    !value
    || value.schema !== TOPOLOGY_EDIT_AUTHORING_BRANCH_CATALOGUE_OPTIONS_SCHEMA
  ) {
    throw new TypeError(
      `TopologyEditAuthoringBranchCatalogueOptions: options must use ${TOPOLOGY_EDIT_AUTHORING_BRANCH_CATALOGUE_OPTIONS_SCHEMA}.`,
    );
  }
  const supplied = { ...value };
  delete supplied.optionsHash;
  if (value.optionsHash !== semanticHash(supplied)) {
    throw new RangeError(
      'TopologyEditAuthoringBranchCatalogueOptions: options hash mismatch.',
    );
  }
  if (!['AVAILABLE', 'UNAVAILABLE'].includes(value.status)) {
    throw new RangeError(
      `TopologyEditAuthoringBranchCatalogueOptions: unsupported status ${value.status}.`,
    );
  }
  return value;
}

export function requireTopologyEditAuthoringBranchCatalogueRecord(
  optionsInput,
  recordIdInput,
) {
  const options = assertTopologyEditAuthoringBranchCatalogueOptions(optionsInput);
  const recordId = requiredText(recordIdInput, 'recordId');
  const matches = options.options.filter((record) => record.recordId === recordId);
  if (matches.length !== 1) {
    throw new RangeError(
      `TopologyEditAuthoringBranchCatalogueOptions: record ${recordId} is not one exact compatible option.`,
    );
  }
  return matches[0];
}

function optionValue(catalogue, record) {
  const componentLengthMm = record.componentType === 'TEE'
    ? record.centerToBranchMm
    : record.projectionMm;
  return {
    catalogueHash: catalogue.catalogueHash,
    catalogueVersion: catalogue.catalogueVersion,
    catalogueSourceHash: catalogue.authority.sourceHash,
    recordId: record.recordId,
    recordHash: record.recordHash,
    sourceReference: { ...record.sourceReference },
    branchFamily: record.componentType,
    hostNominalSizeMm: record.nominalSizeMm,
    hostOutsideDiameterMm: record.outsideDiameterMm,
    branchNominalSizeMm: record.branchNominalSizeMm,
    branchOutsideDiameterMm: record.branchOutsideDiameterMm,
    branchAngleDeg: record.branchAngleDeg,
    pipingClass: record.pipingClass,
    pressureClass: record.pressureClass,
    materialSpecification: record.materialSpecification,
    hostEndConnection: record.endConnectionFrom,
    branchEndConnection: record.branchConnection,
    componentLengthMm,
    componentMassKg: record.componentMassKg,
  };
}

function optionalBranchFamily(value) {
  const normalized = optionalUpper(value);
  if (normalized && !BRANCH_TYPES.has(normalized)) {
    throw new RangeError(
      `TopologyEditAuthoringBranchCatalogueOptions: unsupported branch family ${normalized}.`,
    );
  }
  return normalized;
}

function requiredText(value, field) {
  const normalized = stringValue(value);
  if (!normalized) {
    throw new TypeError(
      `TopologyEditAuthoringBranchCatalogueOptions: ${field} is required.`,
    );
  }
  return normalized;
}

function optionalUpper(value) {
  const normalized = stringValue(value);
  return normalized ? normalized.toUpperCase() : null;
}

function upper(value) {
  return optionalUpper(value);
}

function positiveNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || !(number > 0)) {
    throw new RangeError(
      `TopologyEditAuthoringBranchCatalogueOptions: ${field} must be positive.`,
    );
  }
  return Object.is(number, -0) ? 0 : number;
}
