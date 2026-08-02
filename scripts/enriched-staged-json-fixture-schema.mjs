import { deepFreeze } from './enriched-staged-json-qualification-helpers.mjs';

export const FIXTURE_SCHEMA = 'enriched-staged-json-qualification-fixture/v1';
export const BASELINE_SCHEMA = 'common-enriched-properties-baseline/v1';
export const TARGET_RECORD_SCHEMA = 'common-enriched-target-record/v1';
export const FIELD_SCHEMA = 'common-enriched-properties-field/v1';
export const GENERATOR_VERSION = '1.0.0';
export const PINNED_TIMESTAMP = '2026-08-02T00:00:00.000Z';

export const FIXTURE_MANIFESTS = deepFreeze({
  singleRoot: { name: 'singleRoot', seed: 405101, rootShape: 'SINGLE_ROOT_OBJECT', branchCount: 4, componentsPerBranch: 6 },
  branchArray: { name: 'branchArray', seed: 405202, rootShape: 'BRANCH_ARRAY_ROOT', branchCount: 5, componentsPerBranch: 7 },
  large: { name: 'large', seed: 405303, rootShape: 'BRANCH_ARRAY_ROOT', branchCount: 500, componentsPerBranch: 20 },
});

export const EXPECTED_FIXTURE_HASHES = deepFreeze({
  singleRoot: 'sha256:23626b7572a2ae9ebc74cc8cc23c9b878ea359652dca6ec6d8c1f4c34f86ab00',
  branchArray: 'sha256:926418d5307f382f7533c0fe31822efe6420c1ab2648c4d6a0b847a1d721f2ef',
  large: 'sha256:f5be5ade789df9e89906362e18045dced474d27402cc4b46fbeb21d7df4ea27e',
});

export function stableTargetId(seed, kind, ordinal) {
  return `TARGET:${seed}:${kind}:${String(ordinal).padStart(8, '0')}`;
}

export function vector(seed, ordinal, salt) {
  const base = (seed % 1000) + ordinal * 3 + salt;
  return { x: base + 0.125, y: base + 0.25, z: base + 0.5 };
}
