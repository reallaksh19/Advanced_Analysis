/** Topology Edit Draft — Wave 0 baseline and containment authority. */

export const TOPOLOGY_EDIT_SOURCE_MANIFEST_SHA256 =
  '2d80305bca7a66d8972bf7d70b1a09b11822668ccbd52e87a44ecd4f1dbeecab';

export const TOPOLOGY_EDIT_BASELINE_MANIFEST = Object.freeze({
  schema: 'advanced-topology-edit-baseline-manifest/v2',
  sourceRepository: 'reallaksh19/XML_Compare_Utilities',
  sourceCommit: 'c20bb037566d52ba5b789712594b754a5fb94651',
  sourceManifestSha256: TOPOLOGY_EDIT_SOURCE_MANIFEST_SHA256,
  targetRepository: 'reallaksh19/Advanced_Analysis',
  targetCommit: '5b0dad3d1e5566a73d8e2f37420269476eaf15e9',
  targetBasis: 'WAVE_0_START_HEAD',
  sourceManifestPath: 'src/vendor/topology-edit/source-manifest.json',
  behaviorDispositionPath: 'src/vendor/topology-edit/behavior-disposition.json',
  phaseOneResultLabel: 'TOPOLOGY EDIT PHASE-ONE SMOKE CONTRACTS PASSED',
  isolationRules: Object.freeze([
    'WorkspaceState.dataset remains immutable during active Edit Draft sessions.',
    'Rendered Three.js object IDs never replace canonical engineering entity IDs.',
    'Draft edits remain isolated from workspace mutation until governed commit.',
    'Canonical Topology Edit modules cannot dispatch through SequentialCommandGateway.',
    'Downstream topology, load calculation, and FEA evidence invalidate only on governed workspace commit.',
  ]),
});

export function verifySourceImmutability(
  originalDatasetSnapshot,
  currentDatasetSnapshot,
) {
  if (!originalDatasetSnapshot || !currentDatasetSnapshot) return true;
  return (
    originalDatasetSnapshot.datasetId === currentDatasetSnapshot.datasetId &&
    originalDatasetSnapshot.version === currentDatasetSnapshot.version
  );
}
