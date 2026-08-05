import { createHash } from 'node:crypto';

export function independentlyReconstructNc00Evidence({
  canonicalModel,
  deckArtifact,
  solverProfile,
  receipt = null,
}) {
  const reconstructedModelHash = hashWithout(canonicalModel, ['canonicalModelSemanticHash']);
  const reconstructedDeckHash = sha256(Buffer.from(deckArtifact.deckText, 'utf8'));
  const mapHashes = {
    nodeMapHash: sha256(canonicalJson(deckArtifact.maps.nodeMap)),
    elementMapHash: sha256(canonicalJson(deckArtifact.maps.elementMap)),
    surfaceMapHash: sha256(canonicalJson(deckArtifact.maps.surfaceMap)),
    contactMapHash: sha256(canonicalJson(deckArtifact.maps.contactMap)),
    loadStepMapHash: sha256(canonicalJson(deckArtifact.maps.loadStepMap)),
    rigidGeometryMapHash: sha256(canonicalJson(deckArtifact.maps.rigidGeometryMap ?? {})),
    outputRequestMapHash: sha256(canonicalJson(deckArtifact.maps.outputRequestMap ?? {})),
  };
  const reconstructedSolverProfileHash = hashWithout(
    solverProfile,
    ['solverProfileSemanticHash'],
  );
  const checks = {
    canonicalModelHash:
      reconstructedModelHash === canonicalModel.canonicalModelSemanticHash,
    deckFileHash: reconstructedDeckHash === deckArtifact.deckSha256,
    nodeMapHash: mapHashes.nodeMapHash === deckArtifact.nodeMapHash,
    elementMapHash: mapHashes.elementMapHash === deckArtifact.elementMapHash,
    surfaceMapHash: mapHashes.surfaceMapHash === deckArtifact.surfaceMapHash,
    contactMapHash: mapHashes.contactMapHash === deckArtifact.contactMapHash,
    loadStepMapHash: mapHashes.loadStepMapHash === deckArtifact.loadStepMapHash,
    rigidGeometryMapHash:
      mapHashes.rigidGeometryMapHash === deckArtifact.rigidGeometryMapHash,
    outputRequestMapHash:
      mapHashes.outputRequestMapHash === deckArtifact.outputRequestMapHash,
    solverProfileHash:
      reconstructedSolverProfileHash === solverProfile.solverProfileSemanticHash,
  };
  if (receipt !== null) {
    checks.receiptHash = hashWithout(receipt, ['semanticHash']) === receipt.semanticHash;
    checks.receiptModelBinding =
      receipt.canonicalModelHash === canonicalModel.canonicalModelSemanticHash;
    checks.receiptDeckBinding = receipt.deckSha256 === deckArtifact.deckSha256;
    checks.receiptSolverBinding =
      receipt.solverProfileHash === solverProfile.solverProfileSemanticHash;
  }
  return {
    status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
    checks,
    reconstructed: {
      canonicalModelHash: reconstructedModelHash,
      deckSha256: reconstructedDeckHash,
      ...mapHashes,
      solverProfileHash: reconstructedSolverProfileHash,
    },
  };
}

function hashWithout(value, fields) {
  const copy = JSON.parse(JSON.stringify(value));
  fields.forEach((field) => delete copy[field]);
  return sha256(canonicalJson(copy));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return Object.is(value, -0) ? 0 : value;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
