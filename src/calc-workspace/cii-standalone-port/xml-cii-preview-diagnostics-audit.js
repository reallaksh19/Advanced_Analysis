export function buildStandalonePreviewDiagnosticsAudit({ xmlText = '', config = {} } = {}) {
  return {
    totalDiagnostics: 0,
    items: [],
    status: 'ok'
  };
}
