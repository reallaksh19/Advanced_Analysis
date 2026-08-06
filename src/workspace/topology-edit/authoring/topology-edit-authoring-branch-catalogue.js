import {
  deepFreeze,
  semanticHash,
  stringValue,
} from '../../../core/shared-piping-model/index.js';

export const TOPOLOGY_EDIT_AUTHORING_BRANCH_CATALOGUE_OPTIONS_SCHEMA =
  'TopologyEditAuthoringBranchCatalogueOptions.v1';

const BRANCH_TYPES = new Set(['TEE', 'OLET']);

export function deriveTopologyEditAuthoringBranchCatalogueOptions(input = {}) {
  const catalogue = catalogueValue(input.catalogue);
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
  const pressureClass = optionalUpper(input.pressureClass);
  const materialSpecification = optionalUpper(input.materialSpecification);

  const family = catalogue.records
    .filter((record) => BRANCH_TYPES.has(record.componentType))
    .filter((record) => !branchFamily || record.componentType === branchFamily)
    .sort((left, right) => left.recordId.localeCompare(right.recordId));
  const compatible = family.filter((record) => (
    record.nominalSizeMm === hostNominalSizeMm
    && record.outsideDiameterMm === hostOutsideDiameterMm
    && (!pipingClass || upper(record.pipingClass) === pipingClass)
    && (!pressureClass || upper(record.pressureClass) === pressureClass)
    && (
      !materialSpecification
      || upper(record.materialSpecification) === materialSpecification
    )
  ));

  const material = {
    schema: TOPOLOGY_EDIT_AUTHORING_BRANCH_CATALOGUE_OPTIONS_SCHEMA,
    catalogueHash: catalogue.catalogueHash,
    catalogueVersion: catalogue.version,
    branchFamily,
    hostNominalSizeMm,
    hostOutsideDiameterMm,
    pipingClass,
    pressureClass,
    materialSpecification,
    status: compatible.length ? 'AVAILABLE' : 'UNAVAILABLE',
    familyRecordIds: family.map((record) => record.recordId),
    optionRecordIds: compatible.map((record) => record.recordId),
    options: compatible.map(optionValue),
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

function catalogueValue(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.records)) {
    throw new TypeError(
      'TopologyEditAuthoringBranchCatalogueOptions: catalogue records are required.',
    );
  }
  const catalogueHash = requiredHash(value.catalogueHash, 'catalogueHash');
  const version = requiredText(
    value.catalogueVersion ?? value.version,
    'catalogueVersion',
  );
  const identities = new Set();
  const hashes = new Set();
  const records = value.records.map((record) => {
    const normalized = branchRecordValue(record);
    if (identities.has(normalized.recordId)) {
      throw new RangeError(
        `TopologyEditAuthoringBranchCatalogueOptions: duplicate record ID ${normalized.recordId}.`,
      );
    }
    if (hashes.has(normalized.recordHash)) {
      throw new RangeError(
        `TopologyEditAuthoringBranchCatalogueOptions: duplicate record hash ${normalized.recordHash}.`,
      );
    }
    identities.add(normalized.recordId);
    hashes.add(normalized.recordHash);
    return normalized;
  });
  return { catalogueHash, version, records };
}

function branchRecordValue(record) {
  const componentType = requiredText(
    record?.componentType,
    'componentType',
  ).toUpperCase();
  if (!BRANCH_TYPES.has(componentType)) {
    return {
      ...record,
      recordId: requiredText(record?.recordId, 'recordId'),
      recordHash: requiredHash(record?.recordHash, 'recordHash'),
      componentType,
    };
  }
  return {
    recordId: requiredText(record.recordId, 'recordId'),
    recordHash: requiredHash(record.recordHash, 'recordHash'),
    componentType,
    nominalSizeMm: positiveNumber(record.nominalSizeMm, 'nominalSizeMm'),
    outsideDiameterMm: positiveNumber(
      record.outsideDiameterMm,
      'outsideDiameterMm',
    ),
    secondaryNominalSizeMm: positiveNumber(
      record.secondaryNominalSizeMm,
      'secondaryNominalSizeMm',
    ),
    secondaryOutsideDiameterMm: positiveNumber(
      record.secondaryOutsideDiameterMm,
      'secondaryOutsideDiameterMm',
    ),
    pipingClass: optionalUpper(record.pipingClass),
    pressureClass: optionalUpper(record.pressureClass),
    materialSpecification: optionalUpper(record.materialSpecification),
    endConnectionFrom: optionalUpper(record.endConnectionFrom),
    endConnectionTo: optionalUpper(record.endConnectionTo),
    componentLengthMm: positiveNumber(
      record.componentLengthMm,
      'componentLengthMm',
    ),
    componentMassKg: positiveNumber(
      record.componentMassKg,
      'componentMassKg',
    ),
  };
}

function optionValue(record) {
  return {
    recordId: record.recordId,
    recordHash: record.recordHash,
    branchFamily: record.componentType,
    hostNominalSizeMm: record.nominalSizeMm,
    hostOutsideDiameterMm: record.outsideDiameterMm,
    branchNominalSizeMm: record.secondaryNominalSizeMm,
    branchOutsideDiameterMm: record.secondaryOutsideDiameterMm,
    pipingClass: record.pipingClass,
    pressureClass: record.pressureClass,
    materialSpecification: record.materialSpecification,
    hostEndConnection: record.endConnectionFrom,
    branchEndConnection: record.endConnectionTo,
    componentLengthMm: record.componentLengthMm,
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

function requiredHash(value, field) {
  const normalized = requiredText(value, field);
  if (!/^sha256:[0-9a-f]{64}$/u.test(normalized)) {
    throw new RangeError(
      `TopologyEditAuthoringBranchCatalogueOptions: ${field} must be a sha256 hash.`,
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
