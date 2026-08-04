import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildPipingPortTopologyGraph } from '../src/core/piping-topology/index.js';
import {
  buildRestraintCapabilityModel,
  buildSupportAttachmentModel,
} from '../src/core/support-restraints/index.js';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { finalizeCanonicalTopology } from '../src/workspace/topology-edit/topology-edit-canonical-state.js';
import { TopologyEditCertifiedSession } from '../src/workspace/topology-edit/topology-edit-certified-session.js';
import { buildCanonicalTopologyFromWorkspaceDataset } from '../src/workspace/topology-edit/topology-edit-source-adapter.js';

const DEMO_URL = new URL('../public/fixtures/topology-edit-20-element-demo.staged.json', import.meta.url);

test('diagnose P-001 split certification', async () => {
  const bytes = new Uint8Array(await readFile(DEMO_URL));
  const raw = JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/u, ''));
  const dataset = normalizeWorkspaceDataset(raw, 'topology-edit-demo', {
    sourceBytes: bytes,
    sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  });
  const graph = buildPipingPortTopologyGraph(dataset.sharedModel);
  const attachments = buildSupportAttachmentModel(dataset.sharedModel, graph);
  const restraints = buildRestraintCapabilityModel(attachments);
  const canonical = finalizeCanonicalTopology(buildCanonicalTopologyFromWorkspaceDataset(
    dataset,
    graph,
    attachments,
    restraints,
  ));
  const session = new TopologyEditCertifiedSession(canonical);
  const transition = session.execute('SPLIT_EDGE', { edgeId: 'edge:P-001', fraction: 0.5 });
  throw new Error(JSON.stringify({
    disposition: transition.disposition,
    reasonCodes: transition.reasonCodes,
    validation: transition.validation,
    certification: transition.certification,
    candidate: transition.candidate,
  }, null, 2));
});
