import { semanticHash } from '../shared-piping-model/canonical-json.js';

export function createInputXmlModelHealthFinding(value) {
  const entities = normalizeEntities(value.entities);
  const evidence = structuredClone(value.evidence ?? {});
  const occurrence = semanticHash({ code: value.code, entities, evidence });
  return Object.freeze({
    findingId: `IMH:${value.code}:${occurrence}`,
    code: value.code,
    category: value.category,
    severity: value.severity,
    message: value.message,
    entities: Object.freeze(entities),
    evidence: Object.freeze(evidence),
    authority: value.authority,
    remediation: value.remediation,
    capabilityEffects: Object.freeze(value.capabilityEffects ?? {}),
  });
}

export function inputXmlCapabilityEffect(disposition, limitationCode) {
  return Object.freeze({ disposition, limitationCode: limitationCode ?? null });
}

export function inputXmlBothProfileEffects(disposition, limitationCode) {
  return {
    STRICT_LINEAR_STATIC: inputXmlCapabilityEffect(disposition, limitationCode),
    APPROXIMATE_LINEAR_STATIC: inputXmlCapabilityEffect(disposition, limitationCode),
  };
}

export function compareInputXmlModelHealthFinding(left, right) {
  return compareAscii(left.code, right.code) || compareAscii(left.findingId, right.findingId);
}

export function normalizeInputXmlSeverity(value) {
  const text = String(value ?? 'info').toLowerCase();
  return text === 'error' ? 'error' : text === 'warn' || text === 'warning' ? 'warning' : 'info';
}

export function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeEntities(entities) {
  return Object.fromEntries(Object.entries(entities ?? {}).map(([key, values]) => [
    key,
    Object.freeze([...new Set((values ?? []).filter((value) => value !== null && value !== undefined).map(String))].sort(compareAscii)),
  ]));
}
