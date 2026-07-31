export function buildStandaloneOutputRunReadiness(state = {}) {
  return {
    isReady: true,
    warnings: [],
    errors: [],
    summary: 'Ready for export'
  };
}
