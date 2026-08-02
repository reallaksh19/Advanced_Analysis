import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  process.env.ENRICHMENT_UI_PHASE0_IMPORT_ROOT
    ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
);

export async function resolve(specifier, context, nextResolve) {
  const result = await nextResolve(specifier, context);
  if (process.env.ENRICHMENT_UI_PHASE0_RUNTIME_GUARD !== '1') return result;
  if (!result.url.startsWith('file:')) return result;

  const absolutePath = fileURLToPath(result.url);
  const relativePath = path.relative(repositoryRoot, absolutePath).split(path.sep).join('/');
  if (isForbiddenRuntimePath(relativePath)) {
    const error = new Error(`E_QF_FORBIDDEN_IMPORT: ${relativePath}`);
    error.code = 'E_QF_FORBIDDEN_IMPORT';
    throw error;
  }
  return result;
}

function isForbiddenRuntimePath(relativePath) {
  return relativePath.startsWith('src/')
    || relativePath.includes('common-enriched-properties')
    || relativePath.includes('empirical')
    || relativePath.includes('/solver')
    || relativePath.includes('staged-json')
    || relativePath.includes('stagedJson')
    || relativePath.includes('topology-autofix');
}
