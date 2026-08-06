import {
  compilePhysicalLoadCase,
  modelReferenceFromCompilation,
} from '../linear-fea-load-case/index.js';
import { inputXmlLinearLoadCaseProfile } from './inputxml-linear-load-profile.js';

export function compileInputXmlPhysicalCases(request) {
  const {
    report,
    structuralPreparation,
    loadProfile,
    weightAuthorities,
    sourceAuthorities,
  } = request;
  const modelReference = modelReferenceFromCompilation(structuralPreparation.compilation);
  const caseProfile = inputXmlLinearLoadCaseProfile();
  const cases = [];

  requireCapability(report, loadProfile.sustainedCapabilityId, 'weight physical case');
  cases.push(caseRecord({
    structuralPreparation,
    caseProfile,
    modelReference,
    caseToken: 'W',
    caseRole: 'WEIGHT_BASE',
    sourceSetIds: [],
    sourceFeatureIds: weightAuthorities.ledger.map((row) => row.sourceFeatureId).filter(Boolean),
    primitives: weightAuthorities.primitives,
    loadCaseClass: 'WEIGHT',
    label: 'W',
    description: 'InputXML self-weight physical case.',
  }));

  for (const [sourceSetId, set] of sortedEntries(sourceAuthorities.pressureBySet)) {
    requireCapability(report, loadProfile.sustainedCapabilityId, `pressure set ${sourceSetId}`);
    cases.push(caseRecord({
      structuralPreparation,
      caseProfile,
      modelReference,
      caseToken: sourceSetId,
      caseRole: 'WEIGHT_PRESSURE',
      sourceSetIds: [sourceSetId],
      sourceFeatureIds: set.sourceFeatureIds,
      primitives: [...weightAuthorities.primitives, ...set.primitives],
      loadCaseClass: 'MIXED_PHYSICAL',
      label: `W+${sourceSetId}`,
      description: `InputXML self-weight and pressure set ${sourceSetId}.`,
    }));
  }

  for (const [temperatureSetId, temperature] of sortedEntries(sourceAuthorities.temperatureBySet)) {
    requireCapability(report, loadProfile.operatingCapabilityId, `temperature set ${temperatureSetId}`);
    if (temperature.primitives.length !== structuralPreparation.sectionBindings.length) {
      const error = new Error(`InputXML temperature set ${temperatureSetId} does not cover every prepared element.`);
      error.name = 'InputXmlLinearLoadPreparationError';
      error.code = 'INPUTXML_LOAD_TEMPERATURE_SET_INCOMPLETE';
      error.data = {
        sourceSetId: temperatureSetId,
        temperaturePrimitiveCount: temperature.primitives.length,
        elementCount: structuralPreparation.sectionBindings.length,
      };
      throw error;
    }
    const pressureSetId = matchingPressureSetId(temperatureSetId);
    const pressure = sourceAuthorities.pressureBySet.get(pressureSetId) ?? null;
    const sourceSetIds = pressure === null
      ? [temperatureSetId]
      : [pressureSetId, temperatureSetId];
    const sourceFeatureIds = pressure === null
      ? temperature.sourceFeatureIds
      : [...pressure.sourceFeatureIds, ...temperature.sourceFeatureIds];
    const caseRole = pressure === null
      ? 'WEIGHT_TEMPERATURE'
      : 'WEIGHT_PRESSURE_TEMPERATURE';
    const pressurePrimitives = pressure?.primitives ?? [];
    cases.push(caseRecord({
      structuralPreparation,
      caseProfile,
      modelReference,
      caseToken: temperatureSetId,
      caseRole,
      sourceSetIds,
      sourceFeatureIds,
      primitives: [
        ...weightAuthorities.primitives,
        ...pressurePrimitives,
        ...temperature.primitives,
      ],
      loadCaseClass: 'MIXED_PHYSICAL',
      label: pressure === null
        ? `W+${temperatureSetId}`
        : `W+${pressureSetId}+${temperatureSetId}`,
      description: `InputXML operating physical case for ${sourceSetIds.join(' and ')}.`,
    }));
  }

  for (const [sourceSetId, set] of sortedEntries(sourceAuthorities.forceMomentBySet)) {
    cases.push(caseRecord({
      structuralPreparation,
      caseProfile,
      modelReference,
      caseToken: sourceSetId,
      caseRole: 'APPLIED_FORCE_MOMENT',
      sourceSetIds: [sourceSetId],
      sourceFeatureIds: set.sourceFeatureIds,
      primitives: set.primitives,
      loadCaseClass: 'APPLIED_MECHANICAL',
      label: sourceSetId,
      description: `InputXML applied nodal force/moment set ${sourceSetId}.`,
    }));
  }

  cases.sort((left, right) => compareAscii(left.caseId, right.caseId));
  const primitiveCases = indexPrimitiveCases(cases);
  const ledger = [...weightAuthorities.ledger, ...sourceAuthorities.ledger]
    .map((row) => Object.freeze({
      ...row,
      caseIds: Object.freeze(uniqueAscii(
        row.primitiveIds.flatMap((primitiveId) => primitiveCases.get(primitiveId) ?? []),
      )),
    }))
    .sort((left, right) => compareAscii(left.ledgerId, right.ledgerId));
  return Object.freeze({
    loadCaseProfile: caseProfile,
    physicalCases: Object.freeze(cases),
    loadLedger: Object.freeze(ledger),
  });
}

function caseRecord(request) {
  const caseId = `${request.structuralPreparation.modelId}-C-${safe(request.caseToken)}`;
  const loadCase = compilePhysicalLoadCase({
    loadCaseId: caseId,
    loadCaseClass: request.loadCaseClass,
    presentation: { label: request.label, description: request.description },
    modelReference: request.modelReference,
    primitives: request.primitives,
    profile: request.caseProfile,
  });
  return Object.freeze({
    caseId,
    caseRole: request.caseRole,
    sourceSetIds: Object.freeze(uniqueAscii(request.sourceSetIds)),
    sourceFeatureIds: Object.freeze(uniqueAscii(request.sourceFeatureIds)),
    primitiveIds: Object.freeze(loadCase.primitives.map((row) => row.primitiveId)),
    loadCase,
  });
}

function requireCapability(report, capabilityId, subject) {
  const capability = report.capabilities.find((row) => row.capabilityId === capabilityId);
  if (!capability || capability.status === 'BLOCK') {
    const error = new Error(`InputXML ${subject} is blocked by capability ${capabilityId}.`);
    error.name = 'InputXmlLinearLoadPreparationError';
    error.code = 'INPUTXML_LOAD_CASE_CAPABILITY_BLOCKED';
    error.data = { capabilityId, findingIds: capability?.findingIds ?? [] };
    throw error;
  }
  return capability;
}

function matchingPressureSetId(temperatureSetId) {
  return `P${String(temperatureSetId).replace(/^T/u, '')}`;
}

function indexPrimitiveCases(cases) {
  const index = new Map();
  for (const row of cases) {
    for (const primitiveId of row.primitiveIds) {
      if (!index.has(primitiveId)) index.set(primitiveId, []);
      index.get(primitiveId).push(row.caseId);
    }
  }
  return index;
}

function sortedEntries(map) {
  return [...map.entries()].sort(([left], [right]) => compareAscii(left, right));
}

function uniqueAscii(values) {
  return [...new Set((values ?? []).filter(Boolean).map(String))].sort(compareAscii);
}

function safe(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]/gu, '-');
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
