import {
  INPUTXML_CAPABILITY_EFFECT_DISPOSITIONS,
  INPUTXML_MODEL_HEALTH_CAPABILITIES,
} from './inputxml-model-health-profile.js';

const RANK = Object.freeze({ PASS: 0, CONDITIONAL: 1, BLOCK: 2 });

export function foldInputXmlModelHealthCapabilities(findings, dependencyMap) {
  if (!Array.isArray(findings)) throw new TypeError('Capability folding requires findings.');
  const rows = new Map();
  for (const capabilityId of INPUTXML_MODEL_HEALTH_CAPABILITIES) {
    const dependencies = dependencyMap[capabilityId];
    if (!Array.isArray(dependencies)) {
      throw new TypeError(`Capability ${capabilityId} has no declared dependency list.`);
    }
    rows.set(capabilityId, {
      capabilityId,
      ownStatus: 'PASS',
      status: 'PASS',
      dependencyIds: [...dependencies],
      findingIds: [],
      limitationCodes: [],
      dependencyEffects: [],
    });
  }

  for (const finding of findings) {
    const effects = finding.capabilityEffects ?? {};
    for (const [capabilityId, effect] of Object.entries(effects)) {
      const row = rows.get(capabilityId);
      if (!row) throw new TypeError(`Finding ${finding.findingId} names unknown capability ${capabilityId}.`);
      requireEffect(effect, capabilityId);
      if (RANK[effect.disposition] > RANK[row.ownStatus]) row.ownStatus = effect.disposition;
      row.status = row.ownStatus;
      row.findingIds.push(finding.findingId);
      if (effect.limitationCode) row.limitationCodes.push(effect.limitationCode);
    }
  }

  for (let pass = 0; pass < INPUTXML_MODEL_HEALTH_CAPABILITIES.length; pass += 1) {
    let changed = false;
    for (const capabilityId of INPUTXML_MODEL_HEALTH_CAPABILITIES) {
      const row = rows.get(capabilityId);
      let status = row.ownStatus;
      const dependencyEffects = [];
      for (const dependencyId of row.dependencyIds) {
        const dependency = rows.get(dependencyId);
        if (!dependency) throw new TypeError(`Capability ${capabilityId} depends on unknown capability ${dependencyId}.`);
        if (RANK[dependency.status] > RANK[status]) status = dependency.status;
        if (dependency.status !== 'PASS') {
          dependencyEffects.push(Object.freeze({
            capabilityId: dependencyId,
            disposition: dependency.status,
          }));
        }
      }
      if (status !== row.status) changed = true;
      row.status = status;
      row.dependencyEffects = dependencyEffects;
    }
    if (!changed) break;
    if (pass === INPUTXML_MODEL_HEALTH_CAPABILITIES.length - 1) {
      throw new TypeError('Capability dependencies contain a cycle or did not converge.');
    }
  }

  return Object.freeze(INPUTXML_MODEL_HEALTH_CAPABILITIES.map((capabilityId) => {
    const row = rows.get(capabilityId);
    return Object.freeze({
      capabilityId,
      ownStatus: row.ownStatus,
      status: row.status,
      dependencyIds: Object.freeze(row.dependencyIds),
      dependencyEffects: Object.freeze(row.dependencyEffects),
      findingIds: Object.freeze(uniqueAscii(row.findingIds)),
      limitationCodes: Object.freeze(uniqueAscii(row.limitationCodes)),
    });
  }));
}

function requireEffect(effect, capabilityId) {
  if (!effect || !INPUTXML_CAPABILITY_EFFECT_DISPOSITIONS.includes(effect.disposition)) {
    throw new TypeError(`Capability effect for ${capabilityId} is invalid.`);
  }
  if (effect.limitationCode !== null && effect.limitationCode !== undefined
    && typeof effect.limitationCode !== 'string') {
    throw new TypeError(`Capability effect limitationCode for ${capabilityId} is invalid.`);
  }
}

function uniqueAscii(values) {
  return [...new Set(values)].sort(compareAscii);
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
