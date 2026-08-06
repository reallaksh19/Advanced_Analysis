import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { INPUTXML_GRAVITATIONAL_ACCELERATION } from './inputxml-linear-load-profile.js';

export function compileInputXmlWeightAuthorities(request) {
  const { sourceBundle, structuralPreparation, gravityDirection } = request;
  const elementBySegment = new Map(sourceBundle.elementRecords.map((row) => [row.segmentId, row]));
  const physicalSectionById = new Map(
    structuralPreparation.sectionResolutions.map((row) => [row.sectionState.sectionStateId, row]),
  );
  const rigidById = new Map(
    structuralPreparation.rigidAuthorities.map((row) => [row.rigidElementId, row]),
  );
  const primitives = [];
  const ledger = [];

  for (const binding of structuralPreparation.sectionBindings) {
    const element = elementBySegment.get(binding.segmentId);
    const physicalSection = physicalSectionById.get(binding.physicalSectionStateId);
    const materialBinding = structuralPreparation.materialBindings.find(
      (row) => row.segmentId === binding.segmentId,
    );
    if (!element || !physicalSection || !materialBinding) {
      throw loadError(
        'INPUTXML_LOAD_WEIGHT_BINDING_MISSING',
        `Segment ${binding.segmentId} lacks retained element, material or physical-section authority.`,
      );
    }
    const rigid = binding.rigidElementId === null ? null : rigidById.get(binding.rigidElementId);
    const rigidRecord = binding.rigidElementId === null ? null : sourceBundle.sourceRecords.rigids.find(
      (row) => row.segmentId === binding.segmentId,
    ) ?? null;
    const authority = rigid === null
      ? physicalWeightAuthority(element, physicalSection)
      : rigidWeightAuthority(rigid);
    const primitiveId = `${structuralPreparation.modelId}-LOAD-W-${safe(binding.elementId)}`;
    const intensity = scaleDirection(gravityDirection, authority.totalLineWeight);
    primitives.push(Object.freeze({
      schema: 'fea-linear-load-primitive/v1',
      primitiveId,
      kind: 'DISTRIBUTED_LOAD',
      sourceEvidence: sourceEvidence({
        sourceId: rigidRecord?.sourceFeatureId ?? `IXW-E${element.sourceElementIndex}`,
        sourceRevision: sourceBundle.semanticHash,
        sourceRecordSemanticHash: materialBinding.sourceRecordSemanticHash,
        physicalSectionSemanticHash: physicalSection.semanticHash,
        rigidAuthoritySemanticHash: rigid?.semanticHash ?? null,
        authority,
        gravityDirection,
      }),
      elementId: binding.elementId,
      basis: 'GLOBAL',
      variation: 'UNIFORM',
      startIntensity: intensity,
      endIntensity: intensity,
      units: { distributedForce: 'N/m', length: 'm' },
    }));
    ledger.push(...weightLedgerRows({
      element,
      binding,
      physicalSection,
      materialBinding,
      rigid,
      rigidRecord,
      authority,
      primitiveId,
    }));
  }
  primitives.sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
  ledger.sort((left, right) => compareAscii(left.ledgerId, right.ledgerId));
  return Object.freeze({ primitives: Object.freeze(primitives), ledger: Object.freeze(ledger) });
}

function physicalWeightAuthority(element, section) {
  const fields = element.fields;
  const pipeDensity = finiteNonnegative(fields.pipeDensity?.canonicalValue);
  const fluidDensity = finiteNonnegative(fields.fluidDensity?.canonicalValue);
  const insulationDensity = finiteNonnegative(fields.insulationDensity?.canonicalValue);
  const insulationThickness = finiteNonnegative(fields.insulationThickness?.canonicalValue);
  if (!(pipeDensity > 0)) {
    throw loadError('INPUTXML_LOAD_PIPE_DENSITY_INVALID', `Element ${element.sourceElementNumber} has no positive pipe density.`);
  }
  const pipeMass = pipeDensity * section.sectionState.area;
  const contentsArea = Math.PI * section.dimensions.innerDiameter ** 2 / 4;
  const contentsMass = fluidDensity * contentsArea;
  const insulatedDiameter = section.dimensions.outerDiameter + 2 * insulationThickness;
  const insulationArea = Math.PI
    * (insulatedDiameter ** 2 - section.dimensions.outerDiameter ** 2) / 4;
  const insulationMass = insulationDensity * insulationArea;
  const components = Object.freeze({
    PIPE_WALL: pipeMass,
    CONTENTS: contentsMass,
    INSULATION: insulationMass,
  });
  return Object.freeze({
    kind: 'PHYSICAL_SECTION_MASS_DERIVATION',
    components,
    totalMassPerUnitLength: pipeMass + contentsMass + insulationMass,
    totalLineWeight: (pipeMass + contentsMass + insulationMass) * INPUTXML_GRAVITATIONAL_ACCELERATION,
  });
}

function rigidWeightAuthority(rigid) {
  const lineWeight = rigid?.gravity?.totalLineWeight;
  if (typeof lineWeight !== 'number' || !Number.isFinite(lineWeight) || lineWeight < 0) {
    throw loadError('INPUTXML_LOAD_RIGID_WEIGHT_INVALID', `Rigid authority ${String(rigid?.rigidElementId)} has invalid total line weight.`);
  }
  return Object.freeze({
    kind: 'CAESAR_RIGID_TOTAL_LINE_WEIGHT',
    components: Object.freeze({}),
    totalMassPerUnitLength: lineWeight / INPUTXML_GRAVITATIONAL_ACCELERATION,
    totalLineWeight: lineWeight,
  });
}

function weightLedgerRows(request) {
  const { element, binding, physicalSection, materialBinding, rigid, rigidRecord, authority, primitiveId } = request;
  if (rigid) {
    return [ledgerRow({
      ledgerId: `IXL:WEIGHT:E${element.sourceElementIndex}:RIGID_TOTAL`,
      sourceKind: 'RIGID_WEIGHT',
      sourceFeatureId: rigidRecord?.sourceFeatureId ?? binding.rigidElementId,
      sourceElementIndex: element.sourceElementIndex,
      segmentId: binding.segmentId,
      elementId: binding.elementId,
      disposition: 'COMPILED',
      primitiveIds: [primitiveId],
      sourceRecordSemanticHash: rigidRecord ? semanticHash(rigidRecord) : materialBinding.sourceRecordSemanticHash,
      evidence: {
        totalLineWeight: authority.totalLineWeight,
        totalMassPerUnitLength: authority.totalMassPerUnitLength,
        rigidAuthoritySemanticHash: rigid.semanticHash,
      },
    })];
  }
  return Object.entries(authority.components).map(([component, massPerUnitLength]) => ledgerRow({
    ledgerId: `IXL:WEIGHT:E${element.sourceElementIndex}:${component}`,
    sourceKind: component,
    sourceFeatureId: null,
    sourceElementIndex: element.sourceElementIndex,
    segmentId: binding.segmentId,
    elementId: binding.elementId,
    disposition: massPerUnitLength > 0 ? 'COMPILED' : 'INACTIVE',
    primitiveIds: massPerUnitLength > 0 ? [primitiveId] : [],
    sourceRecordSemanticHash: materialBinding.sourceRecordSemanticHash,
    evidence: {
      massPerUnitLength,
      lineWeight: massPerUnitLength * INPUTXML_GRAVITATIONAL_ACCELERATION,
      physicalSectionSemanticHash: physicalSection.semanticHash,
    },
  }));
}

function ledgerRow(value) {
  return Object.freeze({
    ...value,
    sourceSetId: null,
    sourceRecordSemanticHash: value.sourceRecordSemanticHash,
    caseIds: Object.freeze([]),
    primitiveIds: Object.freeze(value.primitiveIds),
    limitationCode: null,
    evidence: Object.freeze(value.evidence),
  });
}

function sourceEvidence(value) {
  return {
    sourceId: value.sourceId,
    sourceRevision: value.sourceRevision,
    sourceSemanticHash: semanticHash(value),
  };
}

function scaleDirection(direction, magnitude) {
  return Object.freeze({
    fx: direction.x * magnitude,
    fy: direction.y * magnitude,
    fz: direction.z * magnitude,
  });
}

function finiteNonnegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function safe(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]/gu, '-');
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function loadError(code, message) {
  const error = new Error(message);
  error.name = 'InputXmlLinearLoadPreparationError';
  error.code = code;
  return error;
}
