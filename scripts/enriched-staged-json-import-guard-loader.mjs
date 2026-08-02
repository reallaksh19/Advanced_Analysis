const FORBIDDEN = [
  '/src/',
  'project-data',
  'lfea',
  'solver',
  'empirical',
  'topology',
  'stagedjson-export',
];

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL ?? '';
  const isQualificationParent = parent.includes('/scripts/enriched-staged-json-');
  if (isQualificationParent) {
    const normalized = specifier.toLowerCase();
    if (FORBIDDEN.some((token) => normalized.includes(token)) && !normalized.includes('enriched-staged-json-')) {
      const error = new Error(`Forbidden qualification import: ${specifier}`);
      error.code = 'ENRICHED_STAGED_JSON_FORBIDDEN_IMPORT';
      throw error;
    }
  }
  return nextResolve(specifier, context);
}
