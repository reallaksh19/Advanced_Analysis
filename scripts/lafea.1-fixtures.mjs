import {
  ACTION_SENSES, COORDINATE_SYSTEMS, END_CONDITIONS, MODEL_SCHEMA,
  QUALIFICATION_PROFILE, REQUEST_TYPES, THICKNESS_POLICIES,
  createCanonicalLocalAttachmentFoundationModel,
} from '../src/core/local-stress/index.js';
export function sourceFixture(mutator = () => {}) {
  const sourceIdentity = 'SOURCE-PIPE-MODEL';
  const sourceVersion = '7';
  const ref = (path) => `${sourceIdentity}@${sourceVersion}#${path}`;
  const model = fixtureModel(sourceIdentity, sourceVersion, ref);
  mutator(model, ref);
  return model;
}
export function canonicalFixture(mutator = () => {}) {
  return createCanonicalLocalAttachmentFoundationModel(sourceFixture(mutator));
}
function fixtureModel(sourceIdentity, sourceVersion, ref) {
  return {
    schema: MODEL_SCHEMA,
    modelIdentity: 'ATTACHMENT-FOUNDATION-001',
    modelVersion: '1',
    sourceAncestry: sourceAncestry(sourceIdentity, sourceVersion),
    units: { length: 'mm', force: 'N', moment: 'N·mm', pressure: 'MPa', stress: 'MPa' },
    pipeGeometry: { outsideDiameter: { value: 1000, sourceRef: ref('geometry.outsideDiameter') } },
    pipeCoordinateSystem: pipeCoordinateSystem(ref),
    materials: [{ identity: 'PIPE-MATERIAL', role: 'PIPE', sourceRef: ref('materials.pipe') }],
    thicknessBasis: thicknessBasis(ref),
    pressureDefinitions: pressureDefinitions(ref),
    loadReferencePoints: loadReferencePoints(ref),
    loadCases: loadCases(ref),
    resultRequests: resultRequests(ref),
    qualificationProfile: JSON.parse(JSON.stringify(QUALIFICATION_PROFILE)),
    limitations: [],
  };
}
function sourceAncestry(sourceModelIdentity, sourceVersion) {
  return { sourceModelIdentity, sourceVersion, adapterIdentity: 'TEST-ADAPTER', adapterVersion: '1' };
}
function pipeCoordinateSystem(ref) {
  return {
    identity: 'PIPE-CS-1',
    origin: { value: [0, 0, 0], sourceRef: ref('coordinates.origin') },
    axialDirection: { value: [1, 0, 0], sourceRef: ref('coordinates.axial') },
    radialHint: { value: [0, 0, 1], sourceRef: ref('coordinates.radial') },
    circumferentialHint: { value: [0, 1, 0], sourceRef: ref('coordinates.circumferential') },
  };
}
function thicknessBasis(ref) {
  return {
    policy: THICKNESS_POLICIES.NOMINAL_MINUS_CORROSION,
    nominalPipeThickness: { value: 10, sourceRef: ref('thickness.nominal') },
    corrosionAllowance: { value: 0, sourceRef: ref('thickness.corrosion') },
    assessmentPipeThickness: { value: 10, sourceRef: ref('thickness.assessment') },
    wearPadThickness: { value: 20, sourceRef: ref('thickness.pad') },
    cradleThickness: { value: 30, sourceRef: ref('thickness.cradle') },
    effectiveAnalyticalThickness: { value: 50, sourceRef: ref('thickness.effective') },
  };
}
function pressureDefinitions(ref) {
  return [
    pressure('P-CLOSED', END_CONDITIONS.CLOSED_END, ref),
    pressure('P-OPEN', END_CONDITIONS.OPEN_END, ref),
    pressure('P-EXPLICIT', END_CONDITIONS.EXPLICIT_AXIAL_RESULTANT, ref, 12345),
    pressure('P-UNSPECIFIED', END_CONDITIONS.UNSPECIFIED, ref),
  ];
}
function loadReferencePoints(ref) {
  return [
    { identity: 'SOURCE', coordinateSystem: COORDINATE_SYSTEMS.GLOBAL, point: { value: [0, 0, 1000], sourceRef: ref('points.source') } },
    { identity: 'TARGET', coordinateSystem: COORDINATE_SYSTEMS.GLOBAL, point: { value: [0, 0, 0], sourceRef: ref('points.target') } },
  ];
}
function loadCases(ref) {
  return [{
    identity: 'LC-1',
    sourceCoordinateSystem: COORDINATE_SYSTEMS.GLOBAL,
    sourceReferencePointIdentity: 'SOURCE',
    targetReferencePointIdentity: 'TARGET',
    actionSense: ACTION_SENSES.SUPPORT_ON_PIPE,
    force: { value: [1000, 0, 0], sourceRef: ref('loads.LC-1.force') },
    moment: { value: [0, 0, 0], sourceRef: ref('loads.LC-1.moment') },
  }];
}
function resultRequests(ref) {
  return {
    requestedAnalyses: [REQUEST_TYPES.LOAD_TRANSFER, REQUEST_TYPES.PRESSURE_STRESS],
    transformedLoadCaseIdentities: ['LC-1'],
    pressure: [{
      identity: 'PR-1', pressureDefinitionIdentity: 'P-CLOSED',
      requestedRadii: [
        { value: 490, sourceRef: ref('requests.PR-1.radius.inner') },
        { value: 500, sourceRef: ref('requests.PR-1.radius.outer') },
      ],
      includeAxialPressureStress: true,
      includeThinWallComparison: true,
    }],
  };
}
function pressure(identity, endCondition, ref, explicitValue) {
  const row = {
    identity,
    internalPressure: { value: 2, sourceRef: ref(`pressure.${identity}.internal`) },
    externalPressure: { value: 0, sourceRef: ref(`pressure.${identity}.external`) },
    endCondition,
  };
  if (explicitValue !== undefined) row.explicitAxialResultant = { value: explicitValue, sourceRef: ref(`pressure.${identity}.axialResultant`) };
  return row;
}
