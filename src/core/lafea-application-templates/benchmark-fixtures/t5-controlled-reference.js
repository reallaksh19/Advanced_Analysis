import { deepFreeze, semanticHash } from '../../shared-piping-model/index.js';

export const LAFEA_T5_CONTROLLED_REFERENCE_DATASET_SCHEMA =
  'lafea-template-compiler-reference-dataset/v1';

export const LAFEA_T5_QUALIFICATION_TEMPLATE_IDS = deepFreeze([
  'ALG-LOAD-REFERENCE-TRANSFER',
  'ALG-PIPE-SECTION-COMBINED',
  'C2D-LUG-PINHOLE',
  'C2D-PIPE-PAD-SECTION',
]);

const RAW_CASES = {
  "ALG-LOAD-REFERENCE-TRANSFER": [
    {
      "caseSuffix": "BOUNDARY-01",
      "category": "BOUNDARY_RECONSTRUCTION",
      "expected": {
        "boundaryKinds": [],
        "templateId": "ALG-LOAD-REFERENCE-TRANSFER"
      },
      "expectedResultHash": "fnv1a64:1cd67ecd4b0d3754"
    },
    {
      "caseSuffix": "FAIL-01",
      "category": "UNSUPPORTED_COMBINATION",
      "expected": {
        "blocked": true,
        "errorCode": "TEMPLATE_PARAMETERS_BLOCKED",
        "templateId": "ALG-LOAD-REFERENCE-TRANSFER"
      },
      "expectedResultHash": "fnv1a64:b060fb8d05f7c702"
    },
    {
      "caseSuffix": "GEOMETRY-01",
      "category": "GEOMETRY_FEATURE",
      "expected": {
        "coordinateIdentity": "PIPE-CS-1",
        "featureKinds": [
          "PIPE_SECTION_CONTEXT",
          "REFERENCE_POINT"
        ],
        "templateId": "ALG-LOAD-REFERENCE-TRANSFER"
      },
      "expectedResultHash": "fnv1a64:cdaa85ce94ca01bb"
    },
    {
      "caseSuffix": "HANDOFF-01",
      "category": "STAGE_HANDOFF",
      "expected": {
        "engineExecuted": false,
        "entryStageId": "LAFEA.1",
        "meshRequestPresent": false,
        "stageSourceSchema": "local-attachment-foundation-model/v1",
        "templateId": "ALG-LOAD-REFERENCE-TRANSFER"
      },
      "expectedResultHash": "fnv1a64:3e7290437341490f"
    },
    {
      "caseSuffix": "HASH-01",
      "category": "DETERMINISM",
      "expected": {
        "compilationHashEqual": true,
        "handoffHashEqual": true,
        "templateId": "ALG-LOAD-REFERENCE-TRANSFER"
      },
      "expectedResultHash": "fnv1a64:1abe9bcf9762ec84"
    },
    {
      "caseSuffix": "LOAD-01",
      "category": "LOAD_RECONSTRUCTION",
      "expected": {
        "loadKinds": [
          "FORCE_RESULTANT",
          "MOMENT_RESULTANT"
        ],
        "templateId": "ALG-LOAD-REFERENCE-TRANSFER"
      },
      "expectedResultHash": "fnv1a64:7d8692aac793ccad"
    },
    {
      "caseSuffix": "PARAM-01",
      "category": "PARAMETER_BOUNDARY",
      "expected": {
        "parameterIds": [
          "identity",
          "limitations",
          "loadTransfer",
          "pipeContext",
          "qualificationProfile",
          "units"
        ],
        "states": [
          "VALUE",
          "VALUE",
          "VALUE",
          "VALUE",
          "VALUE",
          "VALUE"
        ],
        "templateId": "ALG-LOAD-REFERENCE-TRANSFER"
      },
      "expectedResultHash": "fnv1a64:79f05eddfbdde908"
    }
  ],
  "ALG-PIPE-SECTION-COMBINED": [
    {
      "caseSuffix": "BOUNDARY-01",
      "category": "BOUNDARY_RECONSTRUCTION",
      "expected": {
        "boundaryKinds": [],
        "templateId": "ALG-PIPE-SECTION-COMBINED"
      },
      "expectedResultHash": "fnv1a64:83ade46c74f22eae"
    },
    {
      "caseSuffix": "FAIL-01",
      "category": "UNSUPPORTED_COMBINATION",
      "expected": {
        "blocked": true,
        "errorCode": "TEMPLATE_PARAMETERS_BLOCKED",
        "templateId": "ALG-PIPE-SECTION-COMBINED"
      },
      "expectedResultHash": "fnv1a64:d6e598e038e825d8"
    },
    {
      "caseSuffix": "GEOMETRY-01",
      "category": "GEOMETRY_FEATURE",
      "expected": {
        "coordinateIdentity": "PIPE-CS-1",
        "featureKinds": [
          "PIPE_SECTION_CONTEXT",
          "PIPE_WALL_EVALUATION_LOCATION"
        ],
        "templateId": "ALG-PIPE-SECTION-COMBINED"
      },
      "expectedResultHash": "fnv1a64:3623e979fc65a99f"
    },
    {
      "caseSuffix": "HANDOFF-01",
      "category": "STAGE_HANDOFF",
      "expected": {
        "engineExecuted": false,
        "entryStageId": "LAFEA.2",
        "meshRequestPresent": false,
        "stageSourceSchema": "local-attachment-screening-request/v1",
        "templateId": "ALG-PIPE-SECTION-COMBINED"
      },
      "expectedResultHash": "fnv1a64:25b25e5f19bfec47"
    },
    {
      "caseSuffix": "HASH-01",
      "category": "DETERMINISM",
      "expected": {
        "compilationHashEqual": true,
        "handoffHashEqual": true,
        "templateId": "ALG-PIPE-SECTION-COMBINED"
      },
      "expectedResultHash": "fnv1a64:2918b2fcb427ad5e"
    },
    {
      "caseSuffix": "LOAD-01",
      "category": "LOAD_RECONSTRUCTION",
      "expected": {
        "loadKinds": [
          "RETAINED_MECHANICAL_RESULTANT_FACTOR",
          "RETAINED_PRESSURE_DEFINITION_FACTOR"
        ],
        "templateId": "ALG-PIPE-SECTION-COMBINED"
      },
      "expectedResultHash": "fnv1a64:94de6d2af6543bf7"
    },
    {
      "caseSuffix": "PARAM-01",
      "category": "PARAMETER_BOUNDARY",
      "expected": {
        "parameterIds": [
          "envelopeQuantities",
          "evaluationLocations",
          "limitations",
          "qualificationProfile",
          "requestIdentity",
          "requestVersion",
          "screeningCases",
          "sourceEvidence"
        ],
        "states": [
          "VALUE",
          "VALUE",
          "VALUE",
          "VALUE",
          "VALUE",
          "VALUE",
          "VALUE",
          "VALUE"
        ],
        "templateId": "ALG-PIPE-SECTION-COMBINED"
      },
      "expectedResultHash": "fnv1a64:5cb6b4e79d85d793"
    }
  ],
  "C2D-LUG-PINHOLE": [
    {
      "caseSuffix": "BOUNDARY-01",
      "category": "BOUNDARY_RECONSTRUCTION",
      "expected": {
        "boundaryKinds": [
          "PRESCRIBED_DISPLACEMENT"
        ],
        "templateId": "C2D-LUG-PINHOLE"
      },
      "expectedResultHash": "fnv1a64:2bf9840b11555f08"
    },
    {
      "caseSuffix": "FAIL-01",
      "category": "UNSUPPORTED_COMBINATION",
      "expected": {
        "blocked": true,
        "errorCode": "T3_FALLBACK_NOT_AUTHORIZED_FOR_T4_TEMPLATE_COMPILERS",
        "templateId": "C2D-LUG-PINHOLE"
      },
      "expectedResultHash": "fnv1a64:094baafe18e95bcc"
    },
    {
      "caseSuffix": "GEOMETRY-01",
      "category": "GEOMETRY_FEATURE",
      "expected": {
        "applicationGeometryClass": "LUG_PINHOLE",
        "coordinateIdentity": "LAFEA3-CONTINUUM-XY",
        "featureKinds": [
          "APPLICATION_GEOMETRY_DECLARATION",
          "CALLER_SUPPLIED_CONTINUUM_DOMAIN",
          "MATERIAL_REGION_REFERENCE"
        ],
        "templateId": "C2D-LUG-PINHOLE"
      },
      "expectedResultHash": "fnv1a64:429e6b818b852396"
    },
    {
      "caseSuffix": "HANDOFF-01",
      "category": "STAGE_HANDOFF",
      "expected": {
        "engineExecuted": false,
        "entryStageId": "LAFEA.3",
        "meshRequestPresent": true,
        "stageSourceSchema": "local-continuum-model/v1",
        "templateId": "C2D-LUG-PINHOLE"
      },
      "expectedResultHash": "fnv1a64:a374c920273bfb98"
    },
    {
      "caseSuffix": "HASH-01",
      "category": "DETERMINISM",
      "expected": {
        "compilationHashEqual": true,
        "handoffHashEqual": true,
        "templateId": "C2D-LUG-PINHOLE"
      },
      "expectedResultHash": "fnv1a64:b57843157918fc79"
    },
    {
      "caseSuffix": "LOAD-01",
      "category": "LOAD_RECONSTRUCTION",
      "expected": {
        "loadKinds": [
          "EDGE_NORMAL_PRESSURE",
          "EDGE_TRACTION",
          "ELEMENT_BODY_FORCE",
          "ELEMENT_THERMAL_STRAIN",
          "IMPOSED_DISPLACEMENT",
          "NODAL_FORCE"
        ],
        "templateId": "C2D-LUG-PINHOLE"
      },
      "expectedResultHash": "fnv1a64:46d723c75f098446"
    },
    {
      "caseSuffix": "MESH-REQUEST-01",
      "category": "MESH_REQUEST",
      "expected": {
        "compilerGeneratedMesh": false,
        "elementTypes": [
          "T6"
        ],
        "formulation": "PLANE_STRESS",
        "meshProfileId": "T5-CONTROLLED-T6-MESH/V1",
        "qualityProfileId": "T5-CONTROLLED-T6-QUALITY/V1",
        "templateId": "C2D-LUG-PINHOLE"
      },
      "expectedResultHash": "fnv1a64:b79c109f3591a2a0"
    },
    {
      "caseSuffix": "PARAM-01",
      "category": "PARAMETER_BOUNDARY",
      "expected": {
        "parameterIds": [
          "applicationEvidence",
          "featureSizing",
          "limitations",
          "meshProvenance",
          "stageSource"
        ],
        "states": [
          "VALUE",
          "VALUE",
          "VALUE",
          "VALUE",
          "VALUE"
        ],
        "templateId": "C2D-LUG-PINHOLE"
      },
      "expectedResultHash": "fnv1a64:6c3aa40584e4551f"
    }
  ],
  "C2D-PIPE-PAD-SECTION": [
    {
      "caseSuffix": "BOUNDARY-01",
      "category": "BOUNDARY_RECONSTRUCTION",
      "expected": {
        "boundaryKinds": [
          "PRESCRIBED_DISPLACEMENT"
        ],
        "templateId": "C2D-PIPE-PAD-SECTION"
      },
      "expectedResultHash": "fnv1a64:55df978d9c96ef58"
    },
    {
      "caseSuffix": "FAIL-01",
      "category": "UNSUPPORTED_COMBINATION",
      "expected": {
        "blocked": true,
        "errorCode": "UNKNOWN_FEATURE_SIZING_ID",
        "templateId": "C2D-PIPE-PAD-SECTION"
      },
      "expectedResultHash": "fnv1a64:456ccedf890ac183"
    },
    {
      "caseSuffix": "GEOMETRY-01",
      "category": "GEOMETRY_FEATURE",
      "expected": {
        "applicationGeometryClass": "PIPE_PAD_SECTION",
        "coordinateIdentity": "LAFEA3-CONTINUUM-XY",
        "featureKinds": [
          "APPLICATION_GEOMETRY_DECLARATION",
          "CALLER_SUPPLIED_CONTINUUM_DOMAIN",
          "MATERIAL_REGION_REFERENCE"
        ],
        "templateId": "C2D-PIPE-PAD-SECTION"
      },
      "expectedResultHash": "fnv1a64:7ff118f4b566c35a"
    },
    {
      "caseSuffix": "HANDOFF-01",
      "category": "STAGE_HANDOFF",
      "expected": {
        "engineExecuted": false,
        "entryStageId": "LAFEA.3",
        "meshRequestPresent": true,
        "stageSourceSchema": "local-continuum-model/v1",
        "templateId": "C2D-PIPE-PAD-SECTION"
      },
      "expectedResultHash": "fnv1a64:b60bbd954eae9de8"
    },
    {
      "caseSuffix": "HASH-01",
      "category": "DETERMINISM",
      "expected": {
        "compilationHashEqual": true,
        "handoffHashEqual": true,
        "templateId": "C2D-PIPE-PAD-SECTION"
      },
      "expectedResultHash": "fnv1a64:5524970b35876b23"
    },
    {
      "caseSuffix": "LOAD-01",
      "category": "LOAD_RECONSTRUCTION",
      "expected": {
        "loadKinds": [
          "EDGE_NORMAL_PRESSURE",
          "EDGE_TRACTION",
          "ELEMENT_BODY_FORCE",
          "ELEMENT_THERMAL_STRAIN",
          "IMPOSED_DISPLACEMENT",
          "NODAL_FORCE"
        ],
        "templateId": "C2D-PIPE-PAD-SECTION"
      },
      "expectedResultHash": "fnv1a64:8fe8d02f9a1490a6"
    },
    {
      "caseSuffix": "MESH-REQUEST-01",
      "category": "MESH_REQUEST",
      "expected": {
        "compilerGeneratedMesh": false,
        "elementTypes": [
          "T6"
        ],
        "formulation": "PLANE_STRAIN",
        "meshProfileId": "T5-CONTROLLED-T6-MESH/V1",
        "qualityProfileId": "T5-CONTROLLED-T6-QUALITY/V1",
        "templateId": "C2D-PIPE-PAD-SECTION"
      },
      "expectedResultHash": "fnv1a64:03d54522010d0b65"
    },
    {
      "caseSuffix": "PARAM-01",
      "category": "PARAMETER_BOUNDARY",
      "expected": {
        "parameterIds": [
          "applicationEvidence",
          "featureSizing",
          "limitations",
          "meshProvenance",
          "stageSource"
        ],
        "states": [
          "VALUE",
          "VALUE",
          "VALUE",
          "VALUE",
          "VALUE"
        ],
        "templateId": "C2D-PIPE-PAD-SECTION"
      },
      "expectedResultHash": "fnv1a64:a810c2e7e9bb2869"
    }
  ]
};

export const LAFEA_T5_CONTROLLED_REFERENCE_CASES = deepFreeze(
  LAFEA_T5_QUALIFICATION_TEMPLATE_IDS.flatMap((templateId) => (
    RAW_CASES[templateId].map((record) => {
      const expectedResultHash = semanticHash(record.expected);
      if (expectedResultHash !== record.expectedResultHash) {
        throw new TypeError(
          `T5_REFERENCE_HASH_DRIFT:${templateId}:${record.caseSuffix}`,
        );
      }
      return {
        schema: LAFEA_T5_CONTROLLED_REFERENCE_DATASET_SCHEMA,
        templateId,
        benchmarkId: `${templateId}-${record.caseSuffix}`,
        caseSuffix: record.caseSuffix,
        category: record.category,
        evidenceBasis: 'CONTROLLED_REFERENCE_DATASET',
        independenceRule:
          'EXPECTED_PROJECTION_AUTHORED_WITHOUT_IMPORTING_PRODUCTION_COMPILER',
        expected: record.expected,
        expectedResultHash: record.expectedResultHash,
        toleranceProfileId: 'T5-EXACT-SEMANTIC-PROJECTION-V1',
      };
    })
  )),
);

export function requireT5CompilerReferenceCase(templateId, caseSuffix) {
  const result = LAFEA_T5_CONTROLLED_REFERENCE_CASES.find(
    (record) => record.templateId === templateId && record.caseSuffix === caseSuffix,
  );
  if (!result) {
    throw new TypeError(`Unknown T5 compiler reference case: ${templateId}:${caseSuffix}.`);
  }
  return result;
}

export function listT5CompilerReferenceCases(templateId) {
  if (!LAFEA_T5_QUALIFICATION_TEMPLATE_IDS.includes(templateId)) {
    throw new TypeError(`Unsupported T5 qualification template: ${templateId}.`);
  }
  return LAFEA_T5_CONTROLLED_REFERENCE_CASES.filter(
    (record) => record.templateId === templateId,
  );
}
