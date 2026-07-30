import {
  asciiSort,
  canonicalComponentType,
  isRouteComponent,
  pointFrom,
  stableToken,
} from './sequential-sketcher-contract.js';

const SUPPORT_SOURCE_TYPES = new Set(['SUPPORT', 'ATTA', 'ANCI']);

function sourceRecords(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object' && Array.isArray(parsed.branches)) return parsed.branches;
  throw new Error('Source JSON root must be a branch array or an envelope containing branches.');
}

export function parseStagedJson(text) {
  let parsed;
  try { parsed = JSON.parse(String(text || '')); }
  catch (error) { throw new Error(`Source JSON is invalid: ${error.message}`); }
  return sourceRecords(parsed);
}

export function branchIdentity(record) {
  return String(record?.attributes?.NAME || record?.name || '').trim();
}

export function listBranchIds(records) {
  return asciiSort(records
    .filter((record) => String(record?.type || '').toUpperCase() === 'BRANCH')
    .map(branchIdentity).filter(Boolean));
}

export function selectExactBranch(records, branchId) {
  const target = String(branchId || '').trim();
  const matches = records.filter((record) => branchIdentity(record) === target);
  if (!matches.length) throw new Error(`Exact branch was not found: ${target || '(blank)'}`);
  if (matches.length > 1) throw new Error(`Exact branch is duplicated ${matches.length} times: ${target}`);
  return matches[0];
}

function componentIdentity(child, branchId, sourceIndex) {
  return String(
    child?.attributes?.NAME || child?.attributes?.REF || child?.name ||
    `${branchId}#CHILD-${sourceIndex + 1}`
  ).trim();
}

function sourceTypeOf(child) {
  return String(child?.type || child?.attributes?.RAW_TYPE || child?.attributes?.TYPE || '').trim().toUpperCase();
}

function isSupportSource(child) {
  return SUPPORT_SOURCE_TYPES.has(sourceTypeOf(child))
    || SUPPORT_SOURCE_TYPES.has(String(child?.attributes?.TYPE || '').trim().toUpperCase());
}

function supportEvidenceRecord(child, branchId, sourceIndex) {
  return Object.freeze({
    ...child,
    sourceBranchName: String(child?.sourceBranchName || child?.sourceBranchId || child?.attributes?.OWNER || branchId),
    sourceBranchId: String(child?.sourceBranchId || child?.sourceBranchName || child?.attributes?.OWNER || branchId),
    sourceSequenceIndex: Number.isFinite(Number(child?.sourceSequenceIndex)) ? Number(child.sourceSequenceIndex) : sourceIndex,
    path: Array.isArray(child?.path) ? child.path : Object.freeze(['children', sourceIndex]),
  });
}

export function buildBranchInventory(branch) {
  const branchId = branchIdentity(branch);
  const children = Array.isArray(branch?.children) ? branch.children : [];
  const routeComponents = [];
  const supportRecords = [];
  const ignoredRecords = [];
  children.forEach((child, sourceIndex) => {
    const sourceType = sourceTypeOf(child);
    if (!isRouteComponent(sourceType)) {
      if (isSupportSource(child)) supportRecords.push(supportEvidenceRecord(child, branchId, sourceIndex));
      ignoredRecords.push(Object.freeze({
        sourceIndex,
        sourceType,
        recordClass: isSupportSource(child) ? 'SUPPORT_EVIDENCE' : 'NON_ROUTE_RECORD',
        name: componentIdentity(child, branchId, sourceIndex),
      }));
      return;
    }
    const attributes = child?.attributes && typeof child.attributes === 'object' ? child.attributes : {};
    const canonicalType = canonicalComponentType(sourceType);
    const componentId = componentIdentity(child, branchId, sourceIndex);
    const a = pointFrom(attributes.APOS || attributes.HPOS);
    const b = pointFrom(attributes.LPOS || attributes.TPOS);
    const position = pointFrom(attributes.POS || attributes.BPOS) || a || b;
    routeComponents.push(Object.freeze({
      id: `${canonicalType}-${stableToken(`${branchId}|${componentId}|${sourceIndex}`)}`,
      componentId, branchId, sourceIndex, sourceType, canonicalType,
      a, b, position,
      cref: String(attributes.CREF || '').trim(),
      attributes,
      sourcePath: Object.freeze(['children', sourceIndex]),
    }));
  });
  return Object.freeze({
    branchId,
    attributes: branch?.attributes || {},
    routeComponents: Object.freeze(routeComponents),
    supportRecords: Object.freeze(supportRecords),
    ignoredRecords: Object.freeze(ignoredRecords),
    sourceChildCount: children.length,
  });
}
