#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  LAFEA_CONTINUUM_MAPPING_EVIDENCE_SCHEMA,
  LAFEA_CONTINUUM_PATH_MAPPING_EVIDENCE_SCHEMA,
  createContinuumApplicationMappingEvidence,
  createContinuumApplicationPathMappingEvidence,
  validateContinuumApplicationMappingEvidence,
  validateContinuumApplicationPathMappingEvidence,
} from '../src/core/lafea-application-templates/continuum-application-mapping-evidence.js';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';

const parents = {
  templateId: 'C2D-LUG-PINHOLE',
  stageId: 'LAFEA.3',
  sourceHash: hash('source'),
  canonicalModelHash: hash('model'),
  analysisGeometryHash: hash('geometry'),
  meshProfileHash: hash('profile'),
  meshHash: hash('mesh'),
  stageSourceHash: hash('stage-source'),
  applicationEvidenceHash: hash('application'),
  declarationHash: hash('declaration'),
};

const legacy = createContinuumApplicationMappingEvidence({
  ...parents,
  kind: 'LOAD_EDGE',
  qualification: 'PASS',
  metrics: {
    featureId: 'LOAD-EDGE',
    loadCaseId: 'LC1',
    edgeNodeIds: ['N1', 'N2', 'N3'],
    loadIds: ['L1', 'L2', 'L3'],
    expectedResultant: [1000, 250],
    observedResultant: [1000, 250],
    residual: [0, 0],
    tolerance: 1e-8,
    closureAccepted: true,
  },
  reasons: [],
});
assert.equal(legacy.schema, LAFEA_CONTINUUM_MAPPING_EVIDENCE_SCHEMA);
assert.equal(validateContinuumApplicationMappingEvidence(legacy).ok, true);
assert.equal(validateContinuumApplicationPathMappingEvidence(legacy).ok, false);

const loadPath = createContinuumApplicationPathMappingEvidence({
  ...parents,
  kind: 'LOAD_EDGE',
  qualification: 'PASS',
  metrics: {
    featureId: 'LOAD-EDGE',
    loadCaseId: 'LC1',
    edgeNodePaths: [
      ['N1', 'N2', 'N3'],
      ['N3', 'N4', 'N5'],
      ['N5', 'N6', 'N7'],
    ],
    pathNodeIds: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7'],
    radialStart: 20,
    radialEnd: 60,
    mappingWindowHash: hash('mapping-window'),
    loadIds: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'],
    expectedResultant: [1000, 250],
    observedResultant: [1000, 250],
    residual: [0, 0],
    tolerance: 1e-8,
    closureAccepted: true,
  },
  reasons: [],
});
assert.equal(loadPath.schema, LAFEA_CONTINUUM_PATH_MAPPING_EVIDENCE_SCHEMA);
assert.equal(validateContinuumApplicationPathMappingEvidence(loadPath).ok, true);
assert.equal(validateContinuumApplicationMappingEvidence(loadPath).ok, false);

const boundaryPath = createContinuumApplicationPathMappingEvidence({
  ...parents,
  kind: 'BOUNDARY_EDGE',
  qualification: 'PASS',
  metrics: {
    featureId: 'ROOT-REGION',
    edgeNodePaths: [
      ['R1', 'R2', 'R3'],
      ['R3', 'R4', 'R5'],
    ],
    pathNodeIds: ['R1', 'R2', 'R3', 'R4', 'R5'],
    radialStart: 20,
    radialEnd: 60,
    mappingWindowHash: hash('mapping-window'),
    constraintIds: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'],
    rigidBodyRank: 3,
    requiredRank: 3,
    restraintSufficient: true,
  },
  reasons: [],
});
assert.equal(
  validateContinuumApplicationPathMappingEvidence(boundaryPath).ok,
  true,
);

assert.throws(
  () => createContinuumApplicationPathMappingEvidence({
    ...parents,
    kind: 'LOAD_EDGE',
    qualification: 'PASS',
    metrics: {
      ...loadPath.metrics,
      edgeNodePaths: [
        ['N1', 'N2', 'N3'],
        ['N4', 'N5', 'N6'],
      ],
      pathNodeIds: ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'],
    },
    reasons: [],
  }),
  /ordered connected path/u,
);
assert.throws(
  () => createContinuumApplicationPathMappingEvidence({
    ...parents,
    kind: 'MATERIAL_REGION',
    qualification: 'PASS',
    metrics: {},
    reasons: [],
  }),
  /restricted to load and boundary paths/u,
);
assert.throws(
  () => createContinuumApplicationPathMappingEvidence({
    ...parents,
    kind: 'BOUNDARY_EDGE',
    qualification: 'PASS',
    metrics: {
      ...boundaryPath.metrics,
      rigidBodyRank: 2,
      restraintSufficient: false,
    },
    reasons: [],
  }),
  /Boundary-path restraint metrics are inconsistent/u,
);

console.log('PASS LAFEA Bucket-01 path mapping evidence compatibility checks');

function hash(label) {
  return canonicalLafeaSha256({ schema: 'path-mapping-test/v1', label });
}
