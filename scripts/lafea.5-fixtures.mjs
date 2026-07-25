import {
  ACTION_SENSES, COORDINATE_SYSTEMS, END_CONDITIONS, MODEL_SCHEMA as ATTACHMENT_MODEL_SCHEMA,
  QUALIFICATION_PROFILE as ATTACHMENT_QUALIFICATION_PROFILE, REQUEST_TYPES, THICKNESS_POLICIES,
  createCanonicalLocalAttachmentFoundationModel, calculateLocalAttachmentFoundation,
} from '../src/core/local-stress/index.js';
import {
  FORMULATION as SHELL_FORMULATION,
  MODEL_SCHEMA as SHELL_MODEL_SCHEMA,
} from '../src/core/local-shell/index.js';
import {
  MANDATORY_LIMITATIONS,
  canonicalShellTemplateSemanticHash,
  QUALIFICATION_PROFILE_SCHEMA,
  RESULT_REQUESTS,
  SOURCE_SCHEMA,
  WORKFLOW_VERSION,
} from '../src/core/local-trunnion-footprint/index.js';

export function clone(value) { return structuredClone(value); }

export function workflowSource(options = {}) {
  const shellTemplate = options.shellTemplate ?? stableShellTemplate();
  const attachment = options.attachment ?? attachmentEvidence();
  const footprintIds = shellTemplate.nodes.filter((node) => node.nodeId.startsWith('F')).map((node) => node.nodeId).sort();
  const elementIds = shellTemplate.elements.map((element) => element.elementId).sort();
  const source = {
    schema: SOURCE_SCHEMA,
    workflowIdentity: options.workflowIdentity ?? 'TRUNNION-WORKFLOW-1',
    workflowVersion: WORKFLOW_VERSION,
    sourceAncestry: {
      attachmentCanonicalModelSemanticHash: attachment.model.semanticHash,
      attachmentResultPayloadSemanticHash: attachment.result.semanticHashes.resultPayloadSemanticHash,
      shellTemplateSemanticHash: canonicalShellTemplateSemanticHash(shellTemplate),
      sourceReference: 'owner-source-1',
    },
    attachmentEvidence: attachment,
    shellTemplate,
    pipeGeometry: {
      axisPoint: [0, 0, 0], axisDirection: [0, 0, 1], midsurfaceRadius: 10,
      radialTolerance: 1e-8, sourceReference: 'pipe-cylinder-1',
    },
    trunnionGeometry: {
      axisPoint: [0, 0, 0], axisDirection: [1, 0, 0], outerRadius: 10,
      intersectionTolerance: 1e-8, sourceReference: 'trunnion-cylinder-1',
    },
    footprint: {
      footprintIdentity: 'FP-1', orderedNodeIds: options.loop ?? footprintIds,
      referencePoint: options.referencePoint ?? [0, 0, 0], sourceReference: 'footprint-loop-1',
    },
    loadCaseMappings: options.mappings ?? [{
      workflowLoadCaseId: 'WF-COMB', attachmentLoadCaseId: options.attachmentLoadCaseId ?? 'COMBINED',
      shellLoadCaseId: 'SHELL-COMB', mechanicalScaleFactor: options.scale ?? 1,
      sourceReference: 'mapping-combined',
    }],
    assessmentRegions: [
      { regionId: 'R-FOOTPRINT', elementIds, classification: 'FOOTPRINT_ADJACENT', sourceReference: 'region-footprint' },
      { regionId: 'R-NEAR', elementIds: elementIds.slice(0, 8), classification: 'NEAR_FIELD', sourceReference: 'region-near' },
      { regionId: 'R-FAR', elementIds: elementIds.slice(-8), classification: 'FAR_FIELD', sourceReference: 'region-far' },
      { regionId: 'R-BOUNDARY', elementIds: elementIds.filter((_, index) => index % 2 === 0), classification: 'BOUNDARY_INFLUENCED', sourceReference: 'region-boundary' },
    ],
    qualificationProfile: workflowProfile(),
    resultRequests: { ...RESULT_REQUESTS },
    limitations: [...MANDATORY_LIMITATIONS],
  };
  return source;
}

export function refreshAncestry(source) {
  source.sourceAncestry.attachmentCanonicalModelSemanticHash = source.attachmentEvidence.model.semanticHash;
  source.sourceAncestry.attachmentResultPayloadSemanticHash = source.attachmentEvidence.result.semanticHashes.resultPayloadSemanticHash;
  source.sourceAncestry.shellTemplateSemanticHash = canonicalShellTemplateSemanticHash(source.shellTemplate);
  return source;
}

export function attachmentEvidence() {
  const model = createCanonicalLocalAttachmentFoundationModel(attachmentSource());
  const result = calculateLocalAttachmentFoundation(model);
  return { model, result };
}

export function attachmentSource() {
  const sourcePoint = [5, -3, 2];
  const targetPoint = [0, 0, 0];
  const reference = (path) => `ATTACHMENT-SOURCE@1#${path}`;
  return {
    schema: ATTACHMENT_MODEL_SCHEMA,
    modelIdentity: 'ATTACHMENT-1',
    modelVersion: '1',
    sourceAncestry: {
      sourceModelIdentity: 'ATTACHMENT-SOURCE', sourceVersion: '1',
      adapterIdentity: 'LAFEA5-TEST-ADAPTER', adapterVersion: '1',
    },
    units: { length: 'mm', force: 'N', moment: 'N·mm', pressure: 'MPa', stress: 'MPa' },
    pipeGeometry: { outsideDiameter: { value: 20, sourceRef: reference('pipe.outsideDiameter') } },
    pipeCoordinateSystem: {
      identity: 'PIPE-CS',
      origin: { value: [0, 0, 0], sourceRef: reference('coordinates.origin') },
      axialDirection: { value: [0, 0, 1], sourceRef: reference('coordinates.axial') },
      radialHint: { value: [1, 0, 0], sourceRef: reference('coordinates.radial') },
      circumferentialHint: { value: [0, -1, 0], sourceRef: reference('coordinates.circumferential') },
    },
    materials: [{ identity: 'PIPE-MATERIAL', role: 'PIPE', sourceRef: reference('materials.pipe') }],
    thicknessBasis: {
      policy: THICKNESS_POLICIES.NOMINAL_MINUS_CORROSION,
      nominalPipeThickness: { value: 1, sourceRef: reference('thickness.nominal') },
      corrosionAllowance: { value: 0, sourceRef: reference('thickness.corrosion') },
      assessmentPipeThickness: { value: 1, sourceRef: reference('thickness.assessment') },
      wearPadThickness: { value: 0, sourceRef: reference('thickness.pad') },
      cradleThickness: { value: 0, sourceRef: reference('thickness.cradle') },
      effectiveAnalyticalThickness: { value: 1, sourceRef: reference('thickness.effective') },
    },
    pressureDefinitions: [{
      identity: 'P-CLOSED', internalPressure: { value: 0, sourceRef: reference('pressure.internal') },
      externalPressure: { value: 0, sourceRef: reference('pressure.external') }, endCondition: END_CONDITIONS.CLOSED_END,
    }],
    loadReferencePoints: [
      { identity: 'SOURCE', coordinateSystem: COORDINATE_SYSTEMS.GLOBAL, point: { value: sourcePoint, sourceRef: reference('points.source') } },
      { identity: 'TARGET', coordinateSystem: COORDINATE_SYSTEMS.GLOBAL, point: { value: targetPoint, sourceRef: reference('points.target') } },
    ],
    loadCases: attachmentCases().map((row) => ({
      identity: row.identity, sourceCoordinateSystem: COORDINATE_SYSTEMS.GLOBAL,
      sourceReferencePointIdentity: 'SOURCE', targetReferencePointIdentity: 'TARGET',
      actionSense: ACTION_SENSES.SUPPORT_ON_PIPE,
      force: { value: row.force, sourceRef: reference(`loads.${row.identity}.force`) },
      moment: { value: row.moment, sourceRef: reference(`loads.${row.identity}.moment`) },
    })),
    resultRequests: {
      requestedAnalyses: [REQUEST_TYPES.LOAD_TRANSFER],
      transformedLoadCaseIdentities: attachmentCases().map((row) => row.identity),
      pressure: [],
    },
    qualificationProfile: clone(ATTACHMENT_QUALIFICATION_PROFILE),
    limitations: [],
  };
}

export function attachmentCases() {
  return [
    { identity: 'FX', force: [100, 0, 0], moment: [0, 0, 0] },
    { identity: 'FY', force: [0, 100, 0], moment: [0, 0, 0] },
    { identity: 'FZ', force: [0, 0, 100], moment: [0, 0, 0] },
    { identity: 'MX', force: [0, 0, 0], moment: [1000, 0, 0] },
    { identity: 'MY', force: [0, 0, 0], moment: [0, 1000, 0] },
    { identity: 'MZ', force: [0, 0, 0], moment: [0, 0, 1000] },
    { identity: 'COMBINED', force: [120, -80, 60], moment: [700, -500, 900] },
  ];
}

export function stableShellTemplate({ singular = false, segments = 12 } = {}) {
  const radius = 10, axialOffset = 5;
  const nodes = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = 2 * Math.PI * index / segments;
    const x = radius * Math.sin(angle), y = radius * Math.cos(angle), z = radius * Math.sin(angle);
    nodes.push(shellNode(`F${String(index).padStart(2, '0')}`, [x, y, z]));
    nodes.push(shellNode(`O${String(index).padStart(2, '0')}`, [x, y, z + axialOffset]));
  }
  const elements = [];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const f0 = `F${String(index).padStart(2, '0')}`, o0 = `O${String(index).padStart(2, '0')}`;
    const f1 = `F${String(next).padStart(2, '0')}`, o1 = `O${String(next).padStart(2, '0')}`;
    const id = String(index + 1).padStart(2, '0');
    elements.push({ elementId: `E${id}-A`, nodeIds: [f0, o0, o1], materialId: 'M1', thickness: 1, sourceReference: `mesh-E${id}-A` });
    elements.push({ elementId: `E${id}-B`, nodeIds: [f0, o1, f1], materialId: 'M1', thickness: 1, sourceReference: `mesh-E${id}-B` });
  }
  return {
    modelIdentity: 'SHELL-PATCH-1', modelVersion: '1', sourceAncestry: ['caller-shell-template-1'],
    units: { length: 'mm', force: 'N', moment: 'N*mm', pressure: 'MPa', modulus: 'MPa', rotation: 'rad' },
    formulation: SHELL_FORMULATION,
    materials: [{ materialId: 'M1', elasticModulus: 200000, poissonRatio: 0.3, sourceReference: 'steel' }],
    nodes, elements,
    constraints: singular ? [] : nodes.flatMap((node) => ['UX', 'UY', 'UZ', 'R1', 'R2'].map((dof) => ({ constraintId: `C-${node.nodeId}-${dof}`, nodeId: node.nodeId, dof, value: 0, sourceReference: 'caller-boundary' }))),
    qualificationProfile: shellProfile(),
    resultRequests: { stressSurfaces: ['BOTTOM', 'MIDSURFACE', 'TOP'], dktIntegrationRule: 'FIXED_THREE_POINT_DEGREE_TWO', retainElementMatrices: true },
    limitations: shellLimitations(),
  };
}
function shellNode(nodeId, position) {
  const [x, y] = position; const director = [x / 10, y / 10, 0];
  return { nodeId, position, director, rotationBasis1: [0, 0, 1], rotationBasis2: [director[1], -director[0], 0], sourceReference: `mesh-${nodeId}` };
}
function workflowProfile() {
  const d = { absolute: 1e-10, relative: 1e-12 }, l = { absolute: 1e-8, relative: 1e-12 }, m = { absolute: 1e-5, relative: 1e-12 };
  return {
    schema: QUALIFICATION_PROFILE_SCHEMA, identity: 'LAFEA5-TEST', axisUnitVector: d, axisNonParallel: d,
    pipeRadialDistance: l, pipeDirectorAlignment: d, trunnionIntersection: l,
    footprintMinimumEdge: l, footprintPerimeter: l, resultantFitPivot: d,
    forceReconstruction: { absolute: 1e-8, relative: 1e-12 }, momentReconstruction: m,
    referenceTransfer: m, shellHashReconstruction: d, assessmentEnvelope: d,
  };
}
function shellProfile() {
  const t = { absolute: 1e-8, relative: 1e-10 };
  return {
    minimumFacetArea: t, nodeBasisUnit: t, nodeBasisOrthogonality: t, nodeBasisHandedness: t,
    elementNormalDirectorAlignment: { minimum: 0.8 }, rotationMappingRank: t,
    membraneConstitutiveSymmetry: t, bendingConstitutiveSymmetry: t, elementStiffnessSymmetry: t,
    globalStiffnessSymmetry: t, rigidTranslation: t, rigidRotation: t, choleskyPivot: t,
    freeDofResidual: t, forceEquilibrium: t, momentEquilibrium: t, strainEnergyReconstruction: t,
    membranePatchResponse: t, bendingPatchResponse: t,
  };
}
function shellLimitations() {
  return [
    'NO_DRILLING_DOF','NO_DRILLING_PENALTY_OR_ARTIFICIAL_STIFFNESS','NO_REISSNER_MINDLIN_TRANSVERSE_SHEAR',
    'NO_SHEAR_CORRECTION_FACTOR','NO_THICK_SHELL_CLAIM','NO_CONTACT_OR_FRICTION','NO_LARGE_DISPLACEMENT',
    'NO_PLASTICITY','NO_MATERIAL_NONLINEARITY','NO_BUCKLING','NO_FATIGUE','NO_CRACK_OR_FRACTURE',
    'NO_AUTOMATIC_OR_ADAPTIVE_MESHING','NO_ATTACHMENT_TEMPLATE','NO_WELD_STRESS','NO_CODE_COMPLIANCE',
    'NO_NODAL_STRESS','NO_STRESS_AVERAGING_OR_SMOOTHING','NO_STRESS_EXTRAPOLATION','NO_CONTOUR_AUTHORITY',
    'NO_UI_OR_APPLICATION_INTEGRATION',
  ];
}