export function makeDiagnostic({ code, severity = 'INFO', message, source, details = {} }) {
  if (!code || !message) throw new Error('Diagnostic requires code and message.');
  return { code, severity, message, source, details };
}

export function hasBlockingDiagnostics(diagnostics = []) {
  return diagnostics.some((d) => ['ERROR', 'FATAL'].includes(d.severity));
}
