import { isPlainRecord } from './immutable.js';

export function createEvidenceIndex(roots) {
  const indexedRoots = roots.map(([rootPath, root]) => indexRoot(rootPath, root));
  return Object.freeze({ roots: Object.freeze(indexedRoots) });
}

export function findFirstIndexedEvidence(index, aliases) {
  for (const alias of aliases) {
    const wanted = normalizeEvidenceKey(alias);
    for (const root of index.roots) {
      const matches = root.matchesByKey[wanted];
      if (matches?.length) return matches[0];
    }
  }
  return null;
}

export function findAllIndexedEvidence(index, aliases) {
  const found = [];
  aliases.forEach((alias) => {
    const wanted = normalizeEvidenceKey(alias);
    index.roots.forEach((root) => {
      const matches = root.matchesByKey[wanted];
      if (matches?.length) found.push(...matches);
    });
  });
  return found;
}

function indexRoot(rootPath, root) {
  const matchesByKey = Object.create(null);
  indexValue(root, rootPath, rootPath, 0, matchesByKey);
  Object.values(matchesByKey).forEach((matches) => Object.freeze(matches));
  return Object.freeze({ rootPath, matchesByKey: Object.freeze(matchesByKey) });
}

function indexValue(value, path, rootPath, depth, matchesByKey) {
  if (!isPlainRecord(value) || depth > 5) return;
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  entries.forEach(([key, child]) => {
    const normalizedKey = normalizeEvidenceKey(key);
    const matches = matchesByKey[normalizedKey] || (matchesByKey[normalizedKey] = []);
    matches.push(Object.freeze({ value: child, sourcePath: `${path}.${key}`, rootPath }));
  });
  entries.forEach(([key, child]) => {
    indexValue(child, `${path}.${key}`, rootPath, depth + 1, matchesByKey);
  });
}

function normalizeEvidenceKey(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '').toUpperCase();
}
