import { deepFreeze } from '../../src/core/shared-piping-model/immutable.js';
import { codeUnitCompare } from './contracts.mjs';

export const NON_FEA_FIXTURE_AUTHORITY_SCHEMA = 'non-fea-fixture-authority/v1';

export const NON_FEA_FIXTURE_AUTHORITIES = deepFreeze([
  {
    schema: NON_FEA_FIXTURE_AUTHORITY_SCHEMA,
    role: 'TOPOLOGY_EDIT_20_OBJECT',
    sourceKind: 'REPOSITORY_FILE',
    defaultPath: 'public/fixtures/topology-edit-20-element-demo.staged.json',
    expectedSourceSha256: null,
    expectedIdentity: {
      entityCount: 20,
      pipeCount: 15,
      supportCount: 5,
    },
    authoritySource: {
      path: 'e2e/topology-edit-20-element-demo-edit-flow.spec.js',
      evidence: 'Production UI loads the repository fixture and requires 20 entities, 15 piping objects, and 5 supports.',
    },
  },
  {
    schema: NON_FEA_FIXTURE_AUTHORITY_SCHEMA,
    role: 'REAL_1885_SUPPORT_BRANCH',
    sourceKind: 'REPOSITORY_FILE',
    defaultPath: 'benchmarks/Sjson.json',
    expectedSourceSha256: '6b2c8b01ab0ba6ec8e9e7c42eb4a719668ffd2dc4dbe4790d27cf426a1f60288',
    expectedIdentity: {
      entityCount: 279,
      supportSourceRecordCount: 139,
      supportAssemblyCount: 38,
      supportPhysicalLocationCount: 37,
      routeCount: 13,
      renderableCount: 150,
    },
    authoritySource: {
      path: 'tests/fixtures/topology-edit/1885s/fixture-manifest.json',
      evidence: 'Accepted M005 repository fixture manifest and production-adapter certification.',
    },
  },
  {
    schema: NON_FEA_FIXTURE_AUTHORITY_SCHEMA,
    role: 'LARGE_MODEL_4884_ENTITY',
    sourceKind: 'EXTERNAL_CONTENT_ADDRESSED_FILE',
    defaultPath: null,
    expectedSourceSha256: '88e62782772d743e9236d13775476826f9649ab06d3161de35dc500baa85a9c6',
    expectedIdentity: {
      entityCount: 4884,
      pipeCount: 3277,
      supportCount: 1331,
    },
    authoritySource: {
      path: 'public/qualification/advanced-tab-benchmarks.md',
      evidence: 'Accepted real-project benchmark; source bytes remain external and must be explicitly bound.',
    },
  },
].sort((left, right) => codeUnitCompare(left.role, right.role)));

export function nonFeaFixtureAuthority(role) {
  return NON_FEA_FIXTURE_AUTHORITIES.find((row) => row.role === role) ?? null;
}

export function nonFeaFixtureExecutionPaths(configuredPaths, cliBindings) {
  const values = [
    ...configuredPaths,
    ...NON_FEA_FIXTURE_AUTHORITIES.map((row) => row.defaultPath).filter(Boolean),
    ...Object.values(cliBindings),
  ];
  return [...new Set(values)].sort(codeUnitCompare);
}
