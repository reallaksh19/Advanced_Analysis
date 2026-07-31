export const TRACE_AMBIGUITY_POLICIES = Object.freeze([
  { id: 'first', label: 'Use first match' },
  { id: 'all', label: 'Concatenate all matches' }
]);

export function getTraceTableProfiles() {
  return [
    { id: 'default', label: 'Default Profile' }
  ];
}

export function activeProfileFor(profileId) {
  return getTraceTableProfiles()[0];
}

export function createDefaultTraceTableConfig() {
  return {
    tolerance: 0.1,
    ambiguityMode: 'first',
    rules: []
  };
}

export function normalizeTraceTableConfig(config = {}) {
  return {
    ...createDefaultTraceTableConfig(),
    ...config
  };
}
