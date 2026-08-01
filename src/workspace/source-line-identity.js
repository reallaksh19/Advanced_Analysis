/**
 * Extracts branch, service, line, nominal size, piping class, insulation code,
 * and branch suffix from an SJSON branch name without supplying fallbacks.
 */
export function parseSjsonBranchIdentity(value) {
  const branchName = String(value || '').trim();
  const match = branchName.match(/^(.*?)-(\d+(?:\.\d+)?")-([A-Za-z])(\d+)-([A-Za-z0-9]+)-([A-Za-z0-9]+)-([^/]+)\/(.+)$/);
  if (!match) return emptyIdentity(branchName);
  return Object.freeze({
    branchName,
    systemPrefix: match[1],
    nominalSize: match[2],
    nominalDiameterMm: null,
    service: match[3],
    lineNumber: match[4],
    lineKey: `${match[3]}${match[4]}`,
    pipingClass: match[5],
    insulationCode: match[6],
    sequence: match[7],
    branchSuffix: match[8],
  });
}

/** Propagates the root branch identity to every staged child record. */
export function inheritedSjsonBranchIdentity(item, parent, itemType) {
  if (itemType !== 'BRANCH') return {
    service: parent?.service || '', lineNumber: parent?.lineNumber || '',
    lineKey: parent?.lineKey || '', pipingClass: parent?.pipingClass || '',
    nominalDiameterMm: parent?.nominalDiameterMm || null,
    insulationCode: parent?.insulationCode || '', branchSuffix: parent?.branchSuffix || '',
  };
  const parsed = parseSjsonBranchIdentity(item.name || item.attributes?.NAME);
  const sourceBore = Number(item._boreValue);
  return { ...parsed, nominalDiameterMm: Number.isFinite(sourceBore) && sourceBore > 0 ? sourceBore : parsed.nominalDiameterMm };
}

function emptyIdentity(branchName) {
  return Object.freeze({
    branchName,
    systemPrefix: '', nominalSize: '', nominalDiameterMm: null,
    service: '', lineNumber: '', lineKey: '', pipingClass: '',
    insulationCode: '', sequence: '', branchSuffix: '',
  });
}
