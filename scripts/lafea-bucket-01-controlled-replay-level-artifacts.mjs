import { canonicalLafeaSha256 } from '../src/workspace/lafea-canonical-sha256.js';
import {
  firstHash,
  receipt,
  writeHashedJson,
} from './lafea-bucket-01-controlled-replay-utils.mjs';

export function materializeControlledReplayLevelArtifacts({
  rootDirectory,
  namespace,
  routeId,
  routeKind,
  exactHeadSha,
  designHash,
  projection,
  execution,
  rootReceipt,
  expectedWindow,
}) {
  const scope = routeKind === 'CANDIDATE'
    ? 'CANDIDATE_MESH_BOUND' : 'REFERENCE_MESH_BOUND';
  const receipts = [];
  const executionReceipts = [];
  for (let index = 0; index < 4; index += 1) {
    const ordinal = index + 1;
    const projectionLevel = projection.levels[index];
    const levelResult = execution.controllerResult?.levelResults?.[index];
    if (!projectionLevel || !levelResult) {
      throw supportError('LAFEA_B01_CONTROLLED_REPLAY_LEVEL_PARENT_MISSING');
    }
    const meshEvidence = projectionLevel.meshEvidence;
    const mesh = meshEvidence?.mesh;
    const meshHash = firstHash(
      meshEvidence?.meshHash,
      meshEvidence?.artifactHash,
      mesh?.semanticHash,
      canonicalLafeaSha256(mesh),
    );
    const meshPayload = writeHashedJson(rootDirectory, namespace,
      `level-${ordinal}-analysis-mesh.json`, {
        schema: 'lafea-bucket-01-controlled-replay-analysis-mesh/v1',
        producerRevision: 'B01-CONTROLLED-REPLAY-MATERIALIZER.1',
        routeId,
        routeKind,
        exactHeadSha,
        designHash,
        levelOrdinal: ordinal,
        elementCount: mesh?.elements?.length ?? 0,
        nodeCount: mesh?.nodes?.length ?? 0,
        meshHash,
        qualityAccepted: meshEvidence?.qualification === 'PASS'
          && meshEvidence?.status === 'CURRENT',
        sourceArtifactHash: firstHash(
          meshEvidence?.artifactHash,
          canonicalLafeaSha256(meshEvidence),
        ),
        status: meshEvidence?.qualification === 'PASS'
          && meshEvidence?.status === 'CURRENT' ? 'PASS' : 'BLOCKED',
        reasons: meshEvidence?.qualification === 'PASS'
          && meshEvidence?.status === 'CURRENT'
          ? [] : ['ANALYSIS_MESH_EVIDENCE_NOT_CURRENT_AND_QUALIFIED'],
      });
    const meshReceipt = receipt(rootDirectory, {
      artifactId: `${routeId}:ANALYSIS_MESH_EVIDENCE:L${ordinal}`,
      artifactKind: 'ANALYSIS_MESH_EVIDENCE',
      artifactScope: scope,
      routeId,
      levelOrdinal: ordinal,
      exactHeadSha,
      designHash,
      parentArtifactHashes: [rootReceipt.semanticHash],
      relativePath: meshPayload.relativePath,
    });

    const document = projectionLevel.document;
    const documentHash = firstHash(
      projectionLevel.documentRevisionDigest,
      document?.semanticHash,
      canonicalLafeaSha256(document),
    );
    const documentAccepted = Array.isArray(document?.nodes)
      && document.nodes.length > 0
      && Array.isArray(document?.elements)
      && document.elements.length > 0;
    const documentPayload = writeHashedJson(rootDirectory, namespace,
      `level-${ordinal}-stage-document.json`, {
        schema: 'lafea-bucket-01-controlled-replay-stage-document/v1',
        producerRevision: 'B01-CONTROLLED-REPLAY-MATERIALIZER.1',
        routeId,
        routeKind,
        exactHeadSha,
        designHash,
        levelOrdinal: ordinal,
        documentHash,
        meshHash,
        nodeCount: document?.nodes?.length ?? 0,
        elementCount: document?.elements?.length ?? 0,
        status: documentAccepted ? 'PASS' : 'BLOCKED',
        reasons: documentAccepted ? [] : ['STAGE_DOCUMENT_INCOMPLETE'],
      });
    const documentReceipt = receipt(rootDirectory, {
      artifactId: `${routeId}:STAGE_DOCUMENT:L${ordinal}`,
      artifactKind: 'STAGE_DOCUMENT',
      artifactScope: scope,
      routeId,
      levelOrdinal: ordinal,
      exactHeadSha,
      designHash,
      parentArtifactHashes: [meshReceipt.semanticHash],
      relativePath: documentPayload.relativePath,
    });

    const mappingPackage = projectionLevel.mappingPackage
      ?? projection.mappingPackages?.[index]
      ?? projection.mappingPackage
      ?? projection.baseMappingPackage;
    const loadEvidence = mappingPackage?.loadEdgeEvidence;
    const boundaryEvidence = mappingPackage?.boundaryEdgeEvidence;
    const radialStart = projectionLevel.mappingAuthority?.radialStart
      ?? loadEvidence?.metrics?.radialStart
      ?? expectedWindow.start;
    const radialEnd = projectionLevel.mappingAuthority?.radialEnd
      ?? loadEvidence?.metrics?.radialEnd
      ?? expectedWindow.end;
    const windowExact = radialStart === expectedWindow.start
      && radialEnd === expectedWindow.end;
    const loadAccepted = windowExact
      && (loadEvidence?.qualification === 'PASS'
        || projectionLevel.loadResultant !== undefined);
    const loadPayload = writeHashedJson(rootDirectory, namespace,
      `level-${ordinal}-load-mapping.json`, {
        schema: 'lafea-bucket-01-controlled-replay-load-mapping/v1',
        producerRevision: 'B01-CONTROLLED-REPLAY-MATERIALIZER.1',
        routeId,
        routeKind,
        exactHeadSha,
        designHash,
        levelOrdinal: ordinal,
        meshHash,
        documentHash,
        mappingHash: firstHash(
          loadEvidence?.semanticHash,
          canonicalLafeaSha256({
            radialStart,
            radialEnd,
            loadEdges: projectionLevel.loadEdges ?? [],
            loadResultant: projectionLevel.loadResultant ?? null,
          }),
        ),
        radialStart,
        radialEnd,
        physicalWindowExact: windowExact,
        status: loadAccepted ? 'PASS' : 'BLOCKED',
        reasons: loadAccepted ? [] : ['LOAD_MAPPING_NOT_EXACT_OR_UNQUALIFIED'],
      });
    const loadReceipt = receipt(rootDirectory, {
      artifactId: `${routeId}:LOAD_MAPPING:L${ordinal}`,
      artifactKind: 'LOAD_MAPPING',
      artifactScope: scope,
      routeId,
      levelOrdinal: ordinal,
      exactHeadSha,
      designHash,
      parentArtifactHashes: [
        meshReceipt.semanticHash,
        documentReceipt.semanticHash,
      ],
      relativePath: loadPayload.relativePath,
    });

    const boundaryAccepted = windowExact
      && (boundaryEvidence?.qualification === 'PASS'
        || Array.isArray(document?.constraints));
    const boundaryPayload = writeHashedJson(rootDirectory, namespace,
      `level-${ordinal}-boundary-mapping.json`, {
        schema: 'lafea-bucket-01-controlled-replay-boundary-mapping/v1',
        producerRevision: 'B01-CONTROLLED-REPLAY-MATERIALIZER.1',
        routeId,
        routeKind,
        exactHeadSha,
        designHash,
        levelOrdinal: ordinal,
        meshHash,
        documentHash,
        mappingHash: firstHash(
          boundaryEvidence?.semanticHash,
          canonicalLafeaSha256({
            radialStart,
            radialEnd,
            boundaryEdges: projectionLevel.boundaryEdges ?? [],
            constraints: document?.constraints ?? [],
          }),
        ),
        radialStart,
        radialEnd,
        physicalWindowExact: windowExact,
        status: boundaryAccepted ? 'PASS' : 'BLOCKED',
        reasons: boundaryAccepted
          ? [] : ['BOUNDARY_MAPPING_NOT_EXACT_OR_UNQUALIFIED'],
      });
    const boundaryReceipt = receipt(rootDirectory, {
      artifactId: `${routeId}:BOUNDARY_MAPPING:L${ordinal}`,
      artifactKind: 'BOUNDARY_MAPPING',
      artifactScope: scope,
      routeId,
      levelOrdinal: ordinal,
      exactHeadSha,
      designHash,
      parentArtifactHashes: [
        meshReceipt.semanticHash,
        documentReceipt.semanticHash,
      ],
      relativePath: boundaryPayload.relativePath,
    });

    const mappingAccepted = mappingPackage?.status
      ? mappingPackage.status === 'MAPPING_EVIDENCE_QUALIFIED'
      : loadAccepted && boundaryAccepted;
    const mappingPayload = writeHashedJson(rootDirectory, namespace,
      `level-${ordinal}-mapping-package.json`, {
        schema: 'lafea-bucket-01-controlled-replay-mapping-package/v1',
        producerRevision: 'B01-CONTROLLED-REPLAY-MATERIALIZER.1',
        routeId,
        routeKind,
        exactHeadSha,
        designHash,
        levelOrdinal: ordinal,
        meshHash,
        documentHash,
        loadMappingHash: loadReceipt.semanticHash,
        boundaryMappingHash: boundaryReceipt.semanticHash,
        mappingPackageHash: firstHash(
          mappingPackage?.semanticHash,
          canonicalLafeaSha256(mappingPackage ?? {
            meshHash,
            documentHash,
            load: loadReceipt.semanticHash,
            boundary: boundaryReceipt.semanticHash,
          }),
        ),
        status: mappingAccepted ? 'PASS' : 'BLOCKED',
        reasons: mappingAccepted ? [] : ['MAPPING_PACKAGE_NOT_QUALIFIED'],
      });
    const mappingReceipt = receipt(rootDirectory, {
      artifactId: `${routeId}:MAPPING_PACKAGE:L${ordinal}`,
      artifactKind: 'MAPPING_PACKAGE',
      artifactScope: scope,
      routeId,
      levelOrdinal: ordinal,
      exactHeadSha,
      designHash,
      parentArtifactHashes: [
        meshReceipt.semanticHash,
        documentReceipt.semanticHash,
        loadReceipt.semanticHash,
        boundaryReceipt.semanticHash,
      ],
      relativePath: mappingPayload.relativePath,
    });

    const result = levelResult.result ?? levelResult.execution?.result;
    const loadCase = result?.loadCaseResults?.[0];
    const solverAccepted = result?.solver?.accepted === true
      || loadCase?.solverEvidence?.accepted === true;
    const equilibriumAccepted = result?.equilibrium?.accepted === true
      || loadCase?.equilibrium?.accepted === true;
    const energyAccepted = result?.energyQualification?.status === 'ACCEPTED'
      || loadCase?.energyQualification?.accepted === true;
    const resultAccepted = (result?.status === 'ACCEPTED'
      || result?.qualification?.state === 'ACCEPTED')
      && solverAccepted && equilibriumAccepted && energyAccepted;
    const resultHash = firstHash(
      result?.resultHash,
      result?.semanticHash,
      canonicalLafeaSha256(result),
    );
    const executionPayload = writeHashedJson(rootDirectory, namespace,
      `level-${ordinal}-execution-receipt.json`, {
        schema: 'lafea-bucket-01-controlled-replay-execution-receipt/v1',
        producerRevision: 'B01-CONTROLLED-REPLAY-MATERIALIZER.1',
        routeId,
        routeKind,
        exactHeadSha,
        designHash,
        levelOrdinal: ordinal,
        meshHash,
        documentHash,
        mappingPackageHash: mappingReceipt.semanticHash,
        resultHash,
        solverAccepted,
        equilibriumAccepted,
        energyAccepted,
        status: resultAccepted ? 'PASS' : 'BLOCKED',
        reasons: resultAccepted
          ? [] : ['SOLVER_EQUILIBRIUM_OR_ENERGY_NOT_ACCEPTED'],
      });
    const executionReceipt = receipt(rootDirectory, {
      artifactId: `${routeId}:EXECUTION_RECEIPT:L${ordinal}`,
      artifactKind: 'EXECUTION_RECEIPT',
      artifactScope: scope,
      routeId,
      levelOrdinal: ordinal,
      exactHeadSha,
      designHash,
      parentArtifactHashes: [
        meshReceipt.semanticHash,
        documentReceipt.semanticHash,
        mappingReceipt.semanticHash,
      ],
      relativePath: executionPayload.relativePath,
    });
    receipts.push(
      meshReceipt,
      documentReceipt,
      loadReceipt,
      boundaryReceipt,
      mappingReceipt,
      executionReceipt,
    );
    executionReceipts.push(executionReceipt);
  }
  return { receipts, executionReceipts };
}

function supportError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}
