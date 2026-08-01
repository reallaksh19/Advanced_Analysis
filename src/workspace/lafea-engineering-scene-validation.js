import {
  SCHEMAS,
  SCENE_KEYS,
  assertExactKeys,
  contractError,
  deepFreeze,
  requireAsciiIdentity,
  requireSchema,
} from './lafea-canvas/contracts.js';
import {
  requireNullableHash,
  requireRevision,
  requireUnique,
  validateDiagnostic,
} from './lafea-engineering-scene-contracts.js';
import {
  validateSourcePrimitive,
} from './lafea-engineering-scene-primitives.js';

export function validateSourceScene(scene) {
  requireSchema(scene, SCHEMAS.scene);
  assertExactKeys(scene, SCENE_KEYS, 'LAFEA_SCENE_KEYS_INVALID');
  requireAsciiIdentity(scene.sceneId, 'sceneId');
  requireRevision(scene.sceneRevision);
  requireNullableHash(scene.sourceSemanticHash, 'sourceSemanticHash');
  forbidEngineeringEvidence(scene);
  requireSceneArrays(scene);
  if (scene.meshReferences.length || scene.resultFields.length) {
    throw contractError('LAFEA_SOURCE_SCENE_MESH_RESULT_FORBIDDEN');
  }
  scene.sourcePrimitives.forEach(validateSourcePrimitive);
  scene.diagnostics.forEach(validateDiagnostic);
  requireUnique(
    scene.sourcePrimitives.map((row) => row.primitiveId),
    'LAFEA_SOURCE_PRIMITIVE_ID_COLLISION',
  );
  requireUnique(
    scene.sourcePrimitives.map((row) => row.sceneEntityId),
    'LAFEA_SCENE_ENTITY_ID_COLLISION',
  );
  validateParentHash(scene);
  return deepFreeze(structuredClone(scene));
}

function forbidEngineeringEvidence(scene) {
  for (const field of [
    'topologySemanticHash', 'meshSemanticHash', 'recoverySemanticHash',
  ]) {
    if (scene[field] !== null) {
      throw contractError('LAFEA_SOURCE_SCENE_ENGINEERING_EVIDENCE_FORBIDDEN', { field });
    }
  }
}

function requireSceneArrays(scene) {
  for (const field of [
    'sourcePrimitives', 'meshReferences', 'resultFields',
    'labels', 'diagnostics', 'parentHashes',
  ]) {
    if (!Array.isArray(scene[field])) {
      throw contractError('LAFEA_SOURCE_SCENE_ARRAYS_REQUIRED');
    }
  }
}

function validateParentHash(scene) {
  if (scene.sourceSemanticHash === null && scene.parentHashes.length) {
    throw contractError('LAFEA_SOURCE_SCENE_PARENT_HASH_WITHOUT_AUTHORITY');
  }
  if (scene.sourceSemanticHash === null) return;
  if (scene.parentHashes.length !== 1
    || scene.parentHashes[0]?.authorityLayer !== 'SOURCE'
    || scene.parentHashes[0]?.hash !== scene.sourceSemanticHash) {
    throw contractError('LAFEA_SOURCE_SCENE_PARENT_HASH_INVALID');
  }
}
