import { freezeDeep, stringValue } from './dataset-utils.js';

export const ENGINEERING_COMPONENT_KINDS = Object.freeze([
  'PIPE',
  'ELBOW',
  'TEE',
  'REDUCER',
  'FLANGE',
  'VALVE',
  'SUPPORT',
  'GENERIC',
]);

const TYPE_ALIASES = new Map([
  ['PIPE', 'PIPE'], ['LINE', 'PIPE'], ['SEGMENT', 'PIPE'],
  ['ELBOW', 'ELBOW'], ['ELBO', 'ELBOW'], ['BEND', 'ELBOW'],
  ['TEE', 'TEE'], ['OLET', 'TEE'], ['WELDOLET', 'TEE'], ['SOCKOLET', 'TEE'], ['CROSS', 'TEE'],
  ['REDUCER', 'REDUCER'], ['REDU', 'REDUCER'], ['REDUCERCONCENTRIC', 'REDUCER'], ['REDUCERECCENTRIC', 'REDUCER'],
  ['FLANGE', 'FLANGE'], ['FLAN', 'FLANGE'], ['BLINDFLANGE', 'FLANGE'],
  ['VALVE', 'VALVE'], ['VALV', 'VALVE'], ['GATEVALVE', 'VALVE'], ['BALLVALVE', 'VALVE'],
  ['SUPPORT', 'SUPPORT'], ['ATTA', 'SUPPORT'], ['GUIDE', 'SUPPORT'], ['REST', 'SUPPORT'],
  ['LINESTOP', 'SUPPORT'], ['LINE_STOP', 'SUPPORT'], ['ANCHOR', 'SUPPORT'], ['SPRING', 'SUPPORT'], ['SHOE', 'SUPPORT'],
]);

export function classifyEngineeringComponent(entity) {
  const direct = normalizeToken(entity?.entityType);
  const directKind = TYPE_ALIASES.get(direct);
  if (directKind) return freezeDeep({ kind: directKind, source: 'entity.entityType', sourceType: direct });

  const nativeRole = normalizeToken(entity?.properties?.nativeParams?.role);
  const nativeKind = TYPE_ALIASES.get(nativeRole);
  if (nativeKind) return freezeDeep({ kind: nativeKind, source: 'properties.nativeParams.role', sourceType: nativeRole });

  const text = [
    entity?.name,
    entity?.entityType,
    entity?.properties?.identity?.name,
    entity?.properties?.sourceAttributes?.DESCRIPTION,
    entity?.properties?.attributes?.DESCRIPTION,
    entity?.properties?.enrichedAttributes?.DESCRIPTION,
  ].map(stringValue).filter(Boolean).join(' ').toUpperCase();

  const inferred = inferFromText(text);
  if (inferred) return freezeDeep({ kind: inferred, source: 'entity.text', sourceType: direct || 'UNKNOWN' });
  return freezeDeep({ kind: 'GENERIC', source: 'fallback', sourceType: direct || 'UNKNOWN' });
}

function inferFromText(text) {
  if (/\b(SHOE|GUIDE|REST|LINE\s*STOP|LINESTOP|ANCHOR|SPRING|SUPPORT)\b/.test(text)) return 'SUPPORT';
  if (/\b(FLANGE|WELD\s*NECK|WELDNECK|BLIND\s*FLANGE)\b/.test(text)) return 'FLANGE';
  if (/\b(GATE|GLOBE|BALL|CHECK|BUTTERFLY|VALVE)\b/.test(text)) return 'VALVE';
  if (/\b(ELBOW|BEND)\b/.test(text)) return 'ELBOW';
  if (/\b(TEE|OLET|WELDOLET|SOCKOLET|CROSS)\b/.test(text)) return 'TEE';
  if (/\b(REDUCER|CONCENTRIC|ECCENTRIC)\b/.test(text)) return 'REDUCER';
  if (/\b(PIPE|LINE|RUN|SEGMENT)\b/.test(text)) return 'PIPE';
  return '';
}

function normalizeToken(value) {
  return stringValue(value).toUpperCase().replace(/[^A-Z0-9_]+/g, '');
}
