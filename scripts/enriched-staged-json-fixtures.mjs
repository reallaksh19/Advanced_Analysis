import { codePointCompare, deepFreeze, semanticHash } from './enriched-staged-json-qualification-helpers.mjs';
import { BASELINE_SCHEMA, EXPECTED_FIXTURE_HASHES, FIXTURE_MANIFESTS, FIXTURE_SCHEMA, GENERATOR_VERSION, PINNED_TIMESTAMP, stableTargetId, vector } from './enriched-staged-json-fixture-schema.mjs';
import { buildBranch, buildComponent, buildTargetRecord } from './enriched-staged-json-fixture-records.mjs';

export { EXPECTED_FIXTURE_HASHES, FIXTURE_MANIFESTS } from './enriched-staged-json-fixture-schema.mjs';

export function buildQualificationFixture(name) {
  const manifest = FIXTURE_MANIFESTS[name];
  if (!manifest) throw new Error(`Unknown fixture ${name}`);
  const branches = [];
  const targetRecords = [];
  let componentOrdinal = 0;
  for (let branchOrdinal = 0; branchOrdinal < manifest.branchCount; branchOrdinal += 1) {
    const branch = buildBranch(manifest, branchOrdinal);
    targetRecords.push(branch.record);
    for (let local = 0; local < manifest.componentsPerBranch; local += 1) {
      const component = buildComponent(manifest, branchOrdinal, local, componentOrdinal, branch.node.targetId, branch.node.attributes.lineKey);
      branch.node.children.push(component.node);
      targetRecords.push(component.record);
      componentOrdinal += 1;
    }
    branches.push(branch.node);
  }
  const stagedJson = manifest.rootShape === 'SINGLE_ROOT_OBJECT' ? {
    type: 'MODEL', id: `MODEL:${manifest.seed}`, targetId: stableTargetId(manifest.seed, 'MODEL', 0), name: `/QUALIFICATION/${manifest.name}`,
    APOS: vector(manifest.seed, 0, 0), LPOS: vector(manifest.seed, 0, 1), POS: vector(manifest.seed, 0, 2), CENTER: vector(manifest.seed, 0, 3),
    attributes: { source: 'SYNTHETIC_QUALIFICATION', revision: 'R1', generatedAt: PINNED_TIMESTAMP },
    references: { project: `PROJECT:${manifest.seed}`, owner: 'AGENT_1_QUALIFICATION' }, children: branches,
  } : branches;
  if (manifest.rootShape === 'SINGLE_ROOT_OBJECT') targetRecords.push(buildTargetRecord(stagedJson.targetId, 'LINE', stagedJson.id, `MODEL-${manifest.seed}`, manifest.branchCount));
  const sourceModelHash = semanticHash(stagedJson);
  const baselineDraft = { schema: BASELINE_SCHEMA, baselineId: `ENR-Q405-${manifest.seed}`, projectId: `PROJECT-${manifest.seed}`, revision: 1,
    publishedAt: PINNED_TIMESTAMP, sourceModelHash, targetRecords: targetRecords.sort((a, b) => codePointCompare(a.targetId, b.targetId)) };
  const baseline = deepFreeze({ ...baselineDraft, semanticHash: semanticHash(baselineDraft) });
  const fixtureDraft = { schema: FIXTURE_SCHEMA, generatorVersion: GENERATOR_VERSION, generatedAt: PINNED_TIMESTAMP, manifest, stagedJson, baseline };
  return deepFreeze({ ...fixtureDraft, semanticHash: semanticHash(fixtureDraft) });
}

export function fixtureSummary(fixture) {
  let branchCount = 0; let componentCount = 0;
  visitSourceNodes(fixture.stagedJson, (node) => { if (node.type === 'BRANCH') branchCount += 1; else if (node.type !== 'MODEL') componentCount += 1; });
  return deepFreeze({ name: fixture.manifest.name, rootShape: fixture.manifest.rootShape, branchCount, componentCount,
    targetRecordCount: fixture.baseline.targetRecords.length, sourceModelHash: fixture.baseline.sourceModelHash,
    baselineSemanticHash: fixture.baseline.semanticHash, fixtureSemanticHash: fixture.semanticHash });
}

export function visitSourceNodes(root, visitor) {
  const stack = Array.isArray(root) ? root.map((node, index) => ({ node, path: `$[${index}]` })).reverse() : [{ node: root, path: '$' }];
  while (stack.length > 0) {
    const { node, path } = stack.pop(); visitor(node, path);
    const children = Array.isArray(node.children) ? node.children : [];
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push({ node: children[index], path: `${path}.children[${index}]` });
  }
}
