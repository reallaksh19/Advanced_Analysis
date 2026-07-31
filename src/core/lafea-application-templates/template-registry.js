import { deepFreeze } from '../shared-piping-model/index.js';
import { createApplicationTemplate, asciiCompare } from './contracts.js';
import {
  LAFEA_BUCKET_IDS,
  LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  requireLafeaComputationalBucket,
  requireLafeaStageDependencyEntry,
} from './bucket-registry.js';

export const LAFEA_APPLICATION_TEMPLATE_REGISTRY_SCHEMA =
  'lafea-application-template-registry/v1';

const SHELL_AUTHORITY_PENDING =
  'PRODUCTION_SHELL_AUTHORITY_PENDING_AGENT_1';
const SHELL_ATTACHMENT_AUTHORITY_PENDING =
  'PRODUCTION_SHELL_ATTACHMENT_AUTHORITY_PENDING_AGENT_1';
const AXISYMMETRIC_AUTHORITY_PENDING =
  'AXISYMMETRIC_CONTINUUM_AUTHORITY_PENDING_QUALIFICATION';

export const LAFEA_APPLICATION_TEMPLATE_REGISTRY = Object.freeze([
  analytical({
    templateId: 'ALG-LOAD-REFERENCE-TRANSFER',
    label: 'Load reference transfer',
    applicationFamily: 'LOAD_TRANSFER',
    stageId: 'LAFEA.1',
    solverProfileId: 'RESULTANT_TRANSFER_V1',
    releaseStatus: 'CONCEPT',
    limitations: [
      'No footprint stiffness or local attachment stress.',
      'No template compiler or independent template benchmark is implemented in T1.',
    ],
  }),
  analytical({
    templateId: 'ALG-NOZZLE-NECK-SECTION',
    label: 'Nozzle neck nominal section screening',
    applicationFamily: 'NOZZLE_SECTION',
    stageId: 'LAFEA.2',
    solverProfileId: 'NOZZLE_NECK_SCREENING_V1',
    releaseStatus: 'CONCEPT',
    limitations: [
      'Nominal section screening only.',
      'No local nozzle-junction stress or code assessment.',
    ],
  }),
  analytical({
    templateId: 'ALG-PIPE-SECTION-COMBINED',
    label: 'Combined pipe-section screening',
    applicationFamily: 'PIPE_SECTION',
    stageId: 'LAFEA.2',
    solverProfileId: 'PIPE_SECTION_SCREENING_V1',
    releaseStatus: 'CONCEPT',
    limitations: [
      'Nominal far-field pipe-section mechanics only.',
      'No local discontinuity or attachment-stress authority.',
    ],
  }),
  analytical({
    templateId: 'ALG-PRESSURE-BASELINE-CYLINDER',
    label: 'Pressure baseline cylinder',
    applicationFamily: 'PRESSURE_BASELINE',
    stageId: 'LAFEA.1',
    solverProfileId: 'PRESSURE_BASELINE_CYLINDER_V1',
    releaseStatus: 'CONCEPT',
    limitations: [
      'Elastic pressure baseline only.',
      'Pressure thrust requires explicit area, normal and end-condition semantics.',
    ],
  }),
  analytical({
    templateId: 'ALG-WELD-GROUP-CIRCULAR',
    label: 'Circular weld-group screening',
    applicationFamily: 'WELD_GROUP',
    stageId: 'LAFEA.6',
    solverProfileId: 'WELD_GROUP_SCREENING_V1_PENDING',
    releaseStatus: 'BLOCKED',
    limitations: [
      'LAFEA.6 engine is not implemented.',
      'No analytical weld-group result or allowable claim is authorized.',
    ],
  }),
  analytical({
    templateId: 'ALG-WELD-GROUP-RECTANGULAR',
    label: 'Rectangular weld-group screening',
    applicationFamily: 'WELD_GROUP',
    stageId: 'LAFEA.6',
    solverProfileId: 'WELD_GROUP_SCREENING_V1_PENDING',
    releaseStatus: 'BLOCKED',
    limitations: [
      'LAFEA.6 engine is not implemented.',
      'No analytical weld-group result or allowable claim is authorized.',
    ],
  }),

  continuum({
    templateId: 'C2D-BRACKET-GUSSET',
    label: 'Bracket and gusset continuum',
    applicationFamily: 'STRUCTURAL_BRACKET',
    formulationProfileId: 'PLANE_STRESS',
    releaseStatus: 'CONCEPT',
    limitations: [
      'Linear plane-stress idealization only.',
      'No contact, buckling or plasticity.',
    ],
  }),
  continuum({
    templateId: 'C2D-CLAMP-EAR',
    label: 'Clamp ear continuum',
    applicationFamily: 'CLAMP_EAR',
    formulationProfileId: 'PLANE_STRESS',
    releaseStatus: 'CONCEPT',
    limitations: [
      'No bolt contact or bearing redistribution.',
      'No template compiler or qualified mesh request exists in T1.',
    ],
  }),
  continuum({
    templateId: 'C2D-FLANGE-HUB',
    label: 'Axisymmetric flange hub continuum',
    applicationFamily: 'FLANGE_HUB',
    formulationProfileId: 'AXISYMMETRIC_PROFILE_PENDING',
    requiredStageAuthority: AXISYMMETRIC_AUTHORITY_PENDING,
    releaseStatus: 'BLOCKED',
    limitations: [
      'Axisymmetric formulation is not registered as qualified.',
      'Pressure and bolt-load semantics remain unresolved.',
    ],
  }),
  continuum({
    templateId: 'C2D-LUG-PINHOLE',
    label: 'Lug with pinhole continuum',
    applicationFamily: 'LUG_PINHOLE',
    formulationProfileId: 'PLANE_STRESS',
    releaseStatus: 'CONCEPT',
    limitations: [
      'No contact or pin-bearing redistribution.',
      'No template compiler or independent golden benchmark exists in T1.',
    ],
  }),
  continuum({
    templateId: 'C2D-NOZZLE-REPAD-SECTION',
    label: 'Nozzle repad section continuum',
    applicationFamily: 'NOZZLE_REPAD_SECTION',
    formulationProfileId: 'PLANE_STRESS_OR_STRAIN_PROFILE_PENDING',
    releaseStatus: 'CONCEPT',
    limitations: [
      'Plane or axisymmetric applicability must be selected explicitly.',
      'No shell-junction or three-dimensional attachment authority.',
    ],
  }),
  continuum({
    templateId: 'C2D-PIPE-PAD-SECTION',
    label: 'Pipe and pad section continuum',
    applicationFamily: 'PIPE_PAD_SECTION',
    formulationProfileId: 'PLANE_STRESS_OR_STRAIN_PROFILE_PENDING',
    releaseStatus: 'CONCEPT',
    limitations: [
      'Plane-stress versus plane-strain applicability remains template input.',
      'No curved-shell attachment bending authority.',
    ],
  }),

  shell({
    templateId: 'SHL-PIPE-ELBOW-90',
    label: 'Pipe elbow shell template',
    applicationFamily: 'PIPE_COMPONENT',
    stageId: 'LAFEA.4',
  }),
  shell({
    templateId: 'SHL-PIPE-LOCAL-PATCH',
    label: 'Pipe local shell patch',
    applicationFamily: 'PIPE_LOCAL_PATCH',
    stageId: 'LAFEA.4',
  }),
  shell({
    templateId: 'SHL-PIPE-REDUCER',
    label: 'Pipe reducer shell template',
    applicationFamily: 'PIPE_COMPONENT',
    stageId: 'LAFEA.4',
  }),
  shell({
    templateId: 'SHL-PIPE-SHOE',
    label: 'Pipe shoe shell attachment',
    applicationFamily: 'PIPE_ATTACHMENT',
    stageId: 'LAFEA.5',
  }),
  shell({
    templateId: 'SHL-PIPE-TEE',
    label: 'Pipe tee shell template',
    applicationFamily: 'PIPE_COMPONENT',
    stageId: 'LAFEA.4',
  }),
  shell({
    templateId: 'SHL-PIPE-TRUNNION',
    label: 'Pipe trunnion shell attachment',
    applicationFamily: 'PIPE_ATTACHMENT',
    stageId: 'LAFEA.5',
  }),
  shell({
    templateId: 'SHL-PIPE-TRUNNION-PAD',
    label: 'Pipe trunnion with reinforcement pad',
    applicationFamily: 'PIPE_ATTACHMENT',
    stageId: 'LAFEA.5',
  }),
  shell({
    templateId: 'SHL-VESSEL-LUG',
    label: 'Vessel lug shell attachment',
    applicationFamily: 'VESSEL_ATTACHMENT',
    stageId: 'LAFEA.5',
  }),
  shell({
    templateId: 'SHL-VESSEL-NOZZLE',
    label: 'Vessel nozzle shell template',
    applicationFamily: 'VESSEL_NOZZLE',
    stageId: 'LAFEA.4',
  }),
  shell({
    templateId: 'SHL-VESSEL-NOZZLE-REPAD',
    label: 'Vessel nozzle with reinforcement pad',
    applicationFamily: 'VESSEL_NOZZLE',
    stageId: 'LAFEA.5',
  }),

  recovery({
    templateId: 'REC-NOZZLE-JUNCTION-SCL',
    label: 'Nozzle-junction stress classification line',
    applicationFamily: 'STRESS_CLASSIFICATION',
    stageId: 'LAFEA.4',
    recoveryProfileId: 'NOZZLE_JUNCTION_SCL_PROFILE_PENDING',
  }),
  recovery({
    templateId: 'REC-PIPE-WALL-SCL',
    label: 'Pipe-wall stress classification line',
    applicationFamily: 'STRESS_CLASSIFICATION',
    stageId: 'LAFEA.4',
    recoveryProfileId: 'PIPE_WALL_SCL_PROFILE_PENDING',
  }),
  recovery({
    templateId: 'REC-SHOE-WELD-STRUCTURAL',
    label: 'Shoe weld structural stress',
    applicationFamily: 'WELD_STRUCTURAL_STRESS',
    stageId: 'LAFEA.5',
    recoveryProfileId: 'SHOE_WELD_STRUCTURAL_STRESS_PROFILE_PENDING',
  }),
  recovery({
    templateId: 'REC-TRUNNION-WELD-STRUCTURAL',
    label: 'Trunnion weld structural stress',
    applicationFamily: 'WELD_STRUCTURAL_STRESS',
    stageId: 'LAFEA.5',
    recoveryProfileId: 'TRUNNION_WELD_STRUCTURAL_STRESS_PROFILE_PENDING',
  }),
  recovery({
    templateId: 'REC-VIII2-ESA',
    label: 'Configured VIII-2 elastic stress assessment',
    applicationFamily: 'CODE_ASSESSMENT',
    stageId: 'LAFEA.4',
    recoveryProfileId: 'VIII2_ESA_RECOVERY_PROFILE_PENDING',
    assessmentProfileIds: ['ASME_VIII2_ESA_PROFILE_PENDING'],
  }),
].sort((left, right) => asciiCompare(left.templateId, right.templateId)));

export const LAFEA_APPLICATION_TEMPLATE_IDS = Object.freeze(
  LAFEA_APPLICATION_TEMPLATE_REGISTRY.map((entry) => entry.templateId),
);

export const LAFEA_APPLICATION_TEMPLATE_REGISTRY_RECORD = deepFreeze({
  schema: LAFEA_APPLICATION_TEMPLATE_REGISTRY_SCHEMA,
  parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
  templateIds: LAFEA_APPLICATION_TEMPLATE_IDS,
  templates: LAFEA_APPLICATION_TEMPLATE_REGISTRY,
});

export function requireLafeaApplicationTemplate(templateId) {
  const result = LAFEA_APPLICATION_TEMPLATE_REGISTRY
    .find((entry) => entry.templateId === templateId);
  if (!result) throw new TypeError(`Unsupported LAFEA application template: ${templateId}.`);
  return result;
}

function analytical({
  templateId,
  label,
  applicationFamily,
  stageId,
  solverProfileId,
  releaseStatus,
  limitations,
}) {
  return define({
    templateId,
    label,
    applicationFamily,
    bucketId: 'ANALYTICAL_MECHANICS',
    stageId,
    solverProfileId,
    releaseStatus,
    limitations,
  });
}

function continuum({
  templateId,
  label,
  applicationFamily,
  formulationProfileId,
  releaseStatus,
  limitations,
  requiredStageAuthority = null,
}) {
  return define({
    templateId,
    label,
    applicationFamily,
    bucketId: 'CONTINUUM_2D_FEA',
    stageId: 'LAFEA.3',
    formulationProfileId,
    meshProfileId: 'CONTINUUM_TEMPLATE_MESH_PROFILE_PENDING',
    solverProfileId: 'REGISTERED_LOCAL_CONTINUUM_ROUTE',
    recoveryProfileId: 'CONTINUUM_RECOVERY_PROFILE_PENDING',
    releaseStatus,
    limitations,
    requiredStageAuthority,
  });
}

function shell({
  templateId,
  label,
  applicationFamily,
  stageId,
}) {
  return define({
    templateId,
    label,
    applicationFamily,
    bucketId: 'SURFACE_SHELL_FEA',
    stageId,
    formulationProfileId: 'PRODUCTION_SHELL_FORMULATION_PENDING',
    meshProfileId: 'SHELL_TEMPLATE_MESH_PROFILE_PENDING',
    solverProfileId: 'REGISTERED_PRODUCTION_SHELL_ROUTE_PENDING',
    recoveryProfileId: 'SHELL_RECOVERY_PROFILE_PENDING',
    releaseStatus: 'BLOCKED',
    limitations: [
      'Agent 1 production shell-formulation authority is unresolved.',
      'No template may infer formulation authority from visual MITC geometry.',
      'No shell template compiler or independent golden benchmark exists in T1.',
    ],
    requiredStageAuthority:
      stageId === 'LAFEA.5'
        ? SHELL_ATTACHMENT_AUTHORITY_PENDING
        : SHELL_AUTHORITY_PENDING,
  });
}

function recovery({
  templateId,
  label,
  applicationFamily,
  stageId,
  recoveryProfileId,
  assessmentProfileIds = [],
}) {
  return define({
    templateId,
    label,
    applicationFamily,
    bucketId: 'RECOVERY_ASSESSMENT',
    stageId,
    recoveryProfileId,
    assessmentProfileIds,
    releaseStatus: 'BLOCKED',
    limitations: [
      'Required recovery and convergence consumer is not qualified.',
      'Assessment cannot consume nodal display projection or raw singular peaks.',
      'No code or allowable profile is implied by the template label.',
    ],
  });
}

function define({
  templateId,
  label,
  applicationFamily,
  bucketId,
  stageId,
  releaseStatus,
  limitations,
  formulationProfileId = null,
  meshProfileId = null,
  solverProfileId = null,
  recoveryProfileId = null,
  assessmentProfileIds = [],
  requiredStageAuthority = null,
}) {
  if (!LAFEA_BUCKET_IDS.includes(bucketId)) {
    throw new TypeError(`Unknown bucket ${bucketId}.`);
  }
  requireLafeaComputationalBucket(bucketId);
  const stage = requireLafeaStageDependencyEntry(stageId);
  return createApplicationTemplate({
    templateId,
    templateRevision: 1,
    label,
    applicationFamily,
    bucketId,
    entryStageId: stageId,
    compatibleStageIds: [stageId],
    requiredStageEngineState: 'QUALIFIED_ROUTE_REGISTERED',
    requiredEnginePackage: stage.enginePackage,
    requiredStageAuthority: requiredStageAuthority ?? stage.authority,
    requiredInputContractRole: stage.inputContractRole,
    requiredResultContractRole: stage.resultContractRole,
    parameterSchemaId: `${templateId.toLowerCase()}-parameters/v1`,
    geometryCompilerId: null,
    loadCompilerId: null,
    boundaryCompilerId: null,
    formulationProfileId,
    meshProfileId,
    solverProfileId,
    recoveryProfileId,
    assessmentProfileIds,
    benchmarkManifestId: `BM-${templateId}-001`,
    parentRegistryHash: LAFEA_STAGE_REGISTRY_DEPENDENCY_HASH,
    releaseStatus,
    limitations,
  });
}
