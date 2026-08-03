import path from 'node:path';

export const NON_FEA_DEFAULT_FIXTURES = Object.freeze([
  'benchmarks/ATTRIBUTE-AML_ASIM-1835_managed_stage_enriched_stage.json',
  'benchmarks/Sjson.json',
  'benchmarks/1885Sjson/EnrichedSjson',
]);

export const NON_FEA_REQUIRED_FIXTURE_ROLES = Object.freeze([
  'TOPOLOGY_EDIT_20_OBJECT',
  'LARGE_MODEL_4884_ENTITY',
  'REAL_1885_SUPPORT_BRANCH',
]);

export function parseNonFeaBaselineArguments(args) {
  const fixtures = [];
  const fixtureRoles = {};
  let output = 'reports/non-fea-current-main-baseline.json';
  let warmSamples = 1;
  let executionId = '';
  let runCommands = false;
  let failOnGate = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--fixture') fixtures.push(requireValue(args[index += 1], '--fixture'));
    else if (arg === '--fixture-role') {
      const binding = parseFixtureRoleBinding(requireValue(args[index += 1], '--fixture-role'));
      if (fixtureRoles[binding.role]) throw new TypeError(`Duplicate --fixture-role binding for ${binding.role}.`);
      fixtureRoles[binding.role] = binding.fixturePath;
    } else if (arg === '--output') output = requireValue(args[index += 1], '--output');
    else if (arg === '--warm-samples') warmSamples = Number(requireValue(args[index += 1], '--warm-samples'));
    else if (arg === '--execution-id') executionId = requireValue(args[index += 1], '--execution-id');
    else if (arg === '--run-commands') runCommands = true;
    else if (arg === '--fail-on-gate') failOnGate = true;
    else throw new TypeError(`Unsupported argument: ${arg}.`);
  }
  if (!Number.isInteger(warmSamples) || warmSamples < 0) throw new TypeError('--warm-samples must be a non-negative integer.');
  const selectedFixtures = fixtures.length ? fixtures : [...NON_FEA_DEFAULT_FIXTURES];
  for (const fixturePath of Object.values(fixtureRoles)) {
    if (!selectedFixtures.includes(fixturePath)) selectedFixtures.push(fixturePath);
  }
  return Object.freeze({ fixtures: selectedFixtures, fixtureRoles, output, warmSamples, executionId, runCommands, failOnGate });
}

function parseFixtureRoleBinding(value) {
  const separator = value.indexOf('=');
  if (separator <= 0 || separator === value.length - 1) {
    throw new TypeError('--fixture-role must use ROLE=repository/path syntax.');
  }
  const role = value.slice(0, separator);
  const fixturePath = value.slice(separator + 1);
  if (!NON_FEA_REQUIRED_FIXTURE_ROLES.includes(role)) throw new RangeError(`Unsupported P0 fixture role: ${role}.`);
  if (path.isAbsolute(fixturePath) || fixturePath.split(/[\\/]/u).includes('..')) {
    throw new TypeError('--fixture-role path must be repository-relative and may not traverse upward.');
  }
  return { role, fixturePath: normalizePath(path.normalize(fixturePath)) };
}

function requireValue(value, option) {
  if (typeof value !== 'string' || !value || value.startsWith('--')) throw new TypeError(`${option} requires a value.`);
  return value;
}

function normalizePath(value) { return value.split(path.sep).join('/'); }
