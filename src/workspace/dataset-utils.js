export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function stringValue(value) {
  return String(value ?? '').trim();
}

export function clonePlain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

export function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
}

export function deterministicDatasetId(packageJson, sourceName) {
  const candidates = [
    packageJson?.packageHash,
    packageJson?.datasetId,
    packageJson?.source?.datasetId,
    packageJson?.source?.sourceFileName,
    sourceName,
  ];
  const selected = candidates.map(stringValue).find(Boolean);
  if (selected) return normalizeIdentifier(selected);
  return normalizeIdentifier(packageJson?.schema || 'workspace-dataset');
}

export function normalizeIdentifier(value) {
  const normalized = stringValue(value)
    .replace(/\.[A-Za-z0-9]+$/, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'workspace-dataset';
}
