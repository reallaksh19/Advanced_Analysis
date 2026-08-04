import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  rawHashFile,
  writeJson,
} from './lafea-bucket-01-controlled-replay-support.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function routePaths(namespace, routeKind) {
  const prefix = routeKind === 'CANDIDATE' ? 'candidate' : 'reference';
  return {
    projection: `${namespace}/${prefix}-projection.json`,
    execution: `${namespace}/${prefix}-execution.json`,
    response: `${namespace}/${prefix}-response.json`,
    stress: `${namespace}/${prefix}-stress.json`,
    kirsch: `${namespace}/kirsch.json`,
    exactHead: `${namespace}/exact-head.json`,
    runner: `${namespace}/${prefix}-runner.json`,
  };
}

export function ensureRouteOutputs({
  routeKind,
  routeId,
  exactHeadSha,
  designHash,
  paths,
  responseSpec,
}) {
  const counts = routeKind === 'CANDIDATE'
    ? [480, 1190, 4080, 14256]
    : [64, 256, 1024, 4096];
  if (!exists(paths.projection)) {
    writeJson(ROOT, paths.projection, fallbackProjection({
      routeKind,
      routeId,
      exactHeadSha,
      designHash,
      counts,
      responseSpec,
    }));
  }
  if (!exists(paths.execution)) {
    writeJson(ROOT, paths.execution, fallbackExecution({
      routeKind,
      routeId,
      exactHeadSha,
      designHash,
      counts,
    }));
  }
  if (!exists(paths.response)) {
    writeJson(ROOT, paths.response, fallbackEvidence({
      schema: routeKind === 'CANDIDATE'
        ? 'lafea-bucket-01-candidate-response-evidence/v1'
        : 'lafea-bucket-01-production-response-evidence/v2',
      producerRevision: 'B01-CONTROLLED-REPLAY-FALLBACK.1',
      routeId,
      routeKind,
      exactHeadSha,
      designHash,
      reason: 'RESPONSE_STAGE_DID_NOT_RETAIN_OUTPUT',
    }));
  }
  if (!exists(paths.stress)) {
    writeJson(ROOT, paths.stress, fallbackEvidence({
      schema: routeKind === 'CANDIDATE'
        ? 'lafea-bucket-01-probe-stable-v3-direct-point-receipt/v1'
        : 'lafea-bucket-01-production-lug-fixed-probe-evidence/v2',
      producerRevision: 'B01-CONTROLLED-REPLAY-FALLBACK.1',
      routeId,
      routeKind,
      exactHeadSha,
      designHash,
      reason: 'STRESS_STAGE_DID_NOT_RETAIN_OUTPUT',
    }));
  }
  if (!exists(paths.kirsch)) {
    writeJson(ROOT, paths.kirsch, fallbackEvidence({
      schema: 'lafea-bucket-01-kirsch-fixed-probe-evidence/v2',
      producerRevision: 'B01-CONTROLLED-REPLAY-FALLBACK.1',
      routeId,
      routeKind,
      exactHeadSha,
      designHash,
      reason: 'KIRSCH_STAGE_DID_NOT_RETAIN_OUTPUT',
    }));
  }
  if (!exists(paths.exactHead)) {
    writeJson(ROOT, paths.exactHead, {
      schema: 'lafea-bucket-01-exact-head-report/v18',
      exactHead: exactHeadSha,
      expectedHead: exactHeadSha,
      status: 'EXACT_HEAD_REPAIR_EVIDENCE_BLOCKED',
      blockingCheckIds: ['EXACT_HEAD_STAGE_DID_NOT_RETAIN_OUTPUT'],
      authority: {
        exactHeadRepairExecutableEvidence: false,
        bucketQualified: false,
      },
    });
  }
}

function fallbackProjection({
  routeKind,
  routeId,
  exactHeadSha,
  designHash,
  counts,
  responseSpec,
}) {
  return {
    schema: 'lafea-bucket-01-controlled-replay-fallback-projection/v1',
    routeId,
    routeKind,
    exactHeadSha,
    designHash,
    projectionHash: canonicalLafeaSha256({ routeId, routeKind, exactHeadSha, counts }),
    levels: counts.map((elementCount, index) => {
      const ordinal = index + 1;
      const mesh = {
        schema: 'lafea-bucket-01-controlled-replay-fallback-mesh/v1',
        meshIdentity: `${routeId}-FALLBACK-L${ordinal}`,
        nodes: [],
        elements: Array.from({ length: elementCount }, (_, row) => ({
          elementId: `BLOCKED-${row + 1}`,
        })),
      };
      const meshHash = canonicalLafeaSha256(mesh);
      const document = { nodes: [], elements: [], constraints: [] };
      return {
        ordinal,
        meshEvidence: {
          mesh,
          meshHash,
          artifactHash: canonicalLafeaSha256({ meshHash, ordinal }),
          status: 'BLOCKED',
          qualification: 'BLOCK',
        },
        document,
        documentRevisionDigest: canonicalLafeaSha256(document),
        mappingPackage: { status: 'BLOCKED' },
        loadEdges: [],
        boundaryEdges: [],
        loadResultant: null,
        mappingAuthority: {
          radialStart: responseSpec.load.selectedSegmentRadiusStart,
          radialEnd: responseSpec.load.selectedSegmentRadiusEnd,
        },
      };
    }),
  };
}

function fallbackExecution({
  routeKind, routeId, exactHeadSha, designHash, counts,
}) {
  const levelResults = counts.map((elementCount, index) => {
    const result = {
      schema: 'lafea-bucket-01-controlled-replay-fallback-result/v1',
      status: 'BLOCKED',
      qualification: { state: 'BLOCKED' },
      solver: { accepted: false },
      equilibrium: { accepted: false },
      energyQualification: { status: 'BLOCKED' },
      resultHash: canonicalLafeaSha256({ routeId, index, elementCount }),
    };
    return { ordinal: index + 1, result };
  });
  return {
    schema: 'lafea-bucket-01-controlled-replay-fallback-execution/v1',
    routeId,
    routeKind,
    exactHeadSha,
    designHash,
    executionHash: canonicalLafeaSha256({ routeId, routeKind, exactHeadSha, counts }),
    accepted: false,
    status: 'BLOCKED',
    controllerResult: { accepted: false, status: 'BLOCKED', levelResults },
  };
}

function fallbackEvidence({
  schema, producerRevision, routeId, routeKind, exactHeadSha, designHash, reason,
}) {
  return {
    schema,
    producerRevision,
    routeId,
    routeKind,
    exactHeadSha,
    designHash,
    status: 'BLOCKED',
    reasons: [reason],
    authority: {
      productionSwitchAuthorized: false,
      productionMeshAuthority: false,
      stressAcceptanceAuthority: false,
      qualificationAuthority: false,
      bucketQualified: false,
    },
  };
}

export function descriptor(value) {
  return {
    ...value,
    rawFileHash: rawHashFile(ROOT, value.relativePath),
  };
}

export function envelope(value) {
  return {
    artifactId: value.artifactId,
    artifactScope: value.artifactScope,
    role: value.role,
    relativePath: value.relativePath,
    routeId: value.routeId,
    levelOrdinal: value.levelOrdinal,
    exactHeadSha: value.exactHeadSha,
    designHash: value.designHash,
    parentArtifactHashes: value.parentArtifactHashes,
    declaredRawFileHash: value.rawFileHash,
    computedRawFileHash: rawHashFile(ROOT, value.relativePath),
    payload: readJson(value.relativePath),
  };
}

export function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(ROOT, relativePath), 'utf8'));
}
function exists(relativePath) {
  return fs.existsSync(path.resolve(ROOT, relativePath));
}
export function normalizedNamespace(value) {
  const normalized = String(value).replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '');
  if (!normalized || normalized.split('/').includes('..')) {
    throw runnerError('LAFEA_B01_CONTROLLED_REPLAY_NAMESPACE_INVALID');
  }
  return normalized;
}
export function runnerError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
