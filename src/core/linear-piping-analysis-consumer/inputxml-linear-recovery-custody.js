import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { inputXmlRecoveryFailure as fail } from './inputxml-linear-recovery-error.js';

export function buildInputXmlRecoveredElementResults(request) {
  const { structural, execution, frameElements, genericRecovery } = request;
  const actionById = new Map(genericRecovery.elementActions.map((row) => [row.elementId, row]));
  const fieldById = new Map(genericRecovery.forceFields.map((row) => [row.elementId, row]));
  const frameById = new Map(frameElements.map((row) => [row.elementId, row]));
  const caseLedger = new Map(execution.elementLedger.map((row) => [row.elementId, row]));
  const segmentById = new Map(structural.normalizedGeometry.segments.map((row) => [row.id, row]));
  const bindingByElement = new Map(structural.materialBindings.map((row) => [row.elementId, row]));
  const sectionByElement = new Map(structural.sectionBindings.map((row) => [row.elementId, row]));
  const componentByElement = new Map(structural.componentBindings.map((row) => [row.elementId, row]));
  const modelElementById = new Map(structural.compilation.model.elements.map((row) => [row.elementId, row]));

  return [...caseLedger.keys()].sort(compareAscii).map((elementId) => {
    const ledger = caseLedger.get(elementId);
    const action = actionById.get(elementId);
    const forceField = fieldById.get(elementId);
    const frame = frameById.get(elementId);
    const binding = bindingByElement.get(elementId);
    const section = sectionByElement.get(elementId);
    const component = componentByElement.get(elementId);
    const modelElement = modelElementById.get(elementId);
    const segment = binding ? segmentById.get(binding.segmentId) : null;
    if (!ledger || !action || !forceField || !frame || !binding || !section
      || !component || !modelElement || !segment) fail(
      `InputXML recovery contribution for ${elementId} is incomplete.`,
      'INPUTXML_RECOVERY_CONTRIBUTION_MISSING',
    );
    const expectedI = `${structural.modelId}.N${segment.startNodeId}`;
    const expectedJ = `${structural.modelId}.N${segment.endNodeId}`;
    const orientation = modelElement.nodeI === expectedI && modelElement.nodeJ === expectedJ
      ? 'ALIGNED'
      : modelElement.nodeI === expectedJ && modelElement.nodeJ === expectedI
        ? 'REVERSED'
        : fail(
          `InputXML source orientation for ${elementId} is inconsistent.`,
          'INPUTXML_RECOVERY_SOURCE_MAPPING_GAP',
        );
    return {
      elementId,
      sourceSegmentId: binding.segmentId,
      sourceElementIndex: binding.sourceElementIndex,
      sourceRecordSemanticHash: binding.sourceRecordSemanticHash,
      sourceStartNodeId: String(segment.startNodeId),
      sourceEndNodeId: String(segment.endNodeId),
      sourceComponentUid: segment.sourceComponentUid ?? null,
      structuralNodeI: modelElement.nodeI,
      structuralNodeJ: modelElement.nodeJ,
      orientation,
      componentKind: component.componentKind,
      implementation: component.implementation,
      limitationCodes: uniqueAscii([
        component.limitationCode,
        ...frame.limitations.map((row) => row.code),
      ].filter(Boolean)),
      rigidElementId: section.rigidElementId,
      physicalSectionStateId: section.physicalSectionStateId,
      analysisSectionStateId: section.analysisSectionStateId,
      frameElementSemanticHash: ledger.frameElementSemanticHash,
      qualifiedStiffnessHash: ledger.qualifiedStiffnessHash,
      localActions: action.local,
      globalActions: action.global,
      forceField: {
        length: forceField.length,
        method: forceField.method,
        stations: forceField.stations,
      },
      loadActionCustody: {
        distributedPrimitiveIds: [...ledger.distributedPrimitiveIds],
        temperaturePrimitiveId: ledger.temperaturePrimitiveId,
        codeOnlyPrimitiveIds: [...ledger.codeOnlyPrimitiveIds],
        equivalentLoadLocal: [...frame.equivalentLoadVector.local],
        initialStrainLoadLocal: [...frame.initialStrainLoadVector.local],
      },
    };
  });
}

export function buildInputXmlSourceStations(elementResults) {
  return elementResults.flatMap((row) => {
    const aligned = row.orientation === 'ALIGNED';
    const interior = row.forceField.stations.slice(1, -1).map((entry) => ({
      stationId: `${row.sourceSegmentId}:INTERIOR-${entry.index}`,
      sourceStationKind: 'INTERIOR_FORCE_FIELD',
      sourceSegmentId: row.sourceSegmentId,
      sourceNodeId: null,
      sourceElementIndex: row.sourceElementIndex,
      sourceRecordSemanticHash: row.sourceRecordSemanticHash,
      sourceComponentUid: row.sourceComponentUid,
      elementId: row.elementId,
      elementEnd: null,
      sourceSide: 'INTERIOR',
      sourceFraction: aligned ? entry.fraction : 1 - entry.fraction,
      structuralFraction: entry.fraction,
      actionBasis: 'STRUCTURAL_ELEMENT_LOCAL',
      cutConvention: 'STRUCTURAL_I_SUBSPAN_CLOSURE',
      jointOnElementLocalAction: null,
      jointOnElementGlobalAction: null,
      internalSectionLocalAction: entry.action,
      limitationCodes: [...row.limitationCodes],
      implementation: row.implementation,
    }));
    return [
      station(row, {
        suffix: 'START-RIGHT',
        sourceNodeId: row.sourceStartNodeId,
        elementEnd: aligned ? 'I' : 'J',
        sourceSide: 'RIGHT',
        fraction: 0,
        negate: aligned,
      }),
      ...interior,
      station(row, {
        suffix: 'END-LEFT',
        sourceNodeId: row.sourceEndNodeId,
        elementEnd: aligned ? 'J' : 'I',
        sourceSide: 'LEFT',
        fraction: 1,
        negate: !aligned,
      }),
    ];
  }).sort((left, right) => compareAscii(left.stationId, right.stationId));
}

export function buildInputXmlPressureCustody(loadCase) {
  return loadCase.primitives.filter((row) => row.kind === 'PRESSURE')
    .map((primitive) => ({
      primitiveId: primitive.primitiveId,
      primitiveSemanticHash: primitive.semanticHash,
      elementId: primitive.elementId,
      pressure: primitive.pressure,
      pressureBasis: primitive.pressureBasis,
      authorizedEffects: primitive.authorizedEffects,
      sourceEvidence: primitive.sourceEvidence,
      structuralEffect: 'NONE',
      futureUse: 'CODE_STRESS_CUSTODY_ONLY',
    }))
    .sort((left, right) => compareAscii(left.primitiveId, right.primitiveId));
}

export function buildInputXmlUnrepresentedSources(loadLedger) {
  return loadLedger.filter((row) => row.primitiveIds.length === 0)
    .map((row) => ({
      ledgerId: row.ledgerId,
      disposition: row.disposition,
      primitiveIds: [],
      caseIds: [...row.caseIds],
      evidence: row.evidence,
      structuralResult: null,
    }))
    .sort((left, right) => compareAscii(left.ledgerId, right.ledgerId));
}

export function requireInputXmlCaseElementCustody(actual, expected) {
  if (semanticHash(actual) !== semanticHash(expected)) fail(
    'InputXML recovery element ledger differs from the executed case ledger.',
    'INPUTXML_RECOVERY_ELEMENT_LEDGER_MISMATCH',
  );
}

function station(element, request) {
  const local = element.localActions[request.elementEnd];
  const global = element.globalActions[request.elementEnd];
  return {
    stationId: `${element.sourceSegmentId}:${request.suffix}`,
    sourceStationKind: 'END_SIDE',
    sourceSegmentId: element.sourceSegmentId,
    sourceNodeId: request.sourceNodeId,
    sourceElementIndex: element.sourceElementIndex,
    sourceRecordSemanticHash: element.sourceRecordSemanticHash,
    sourceComponentUid: element.sourceComponentUid,
    elementId: element.elementId,
    elementEnd: request.elementEnd,
    sourceSide: request.sourceSide,
    sourceFraction: request.fraction,
    structuralFraction: request.elementEnd === 'I' ? 0 : 1,
    actionBasis: 'STRUCTURAL_ELEMENT_LOCAL',
    cutConvention: request.negate
      ? 'NEGATE_JOINT_ON_ELEMENT'
      : 'USE_JOINT_ON_ELEMENT',
    jointOnElementLocalAction: local,
    jointOnElementGlobalAction: global,
    internalSectionLocalAction: request.negate ? negateAction(local) : { ...local },
    limitationCodes: [...element.limitationCodes],
    implementation: element.implementation,
  };
}

function negateAction(action) {
  return Object.fromEntries(Object.entries(action).map(([key, value]) => [key, -value]));
}

export function uniqueAscii(values) {
  return [...new Set(values.map(String))].sort(compareAscii);
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
