import { canonicalPrettyStringify, deepFreeze, semanticHash, utf8ByteLength } from '../shared-piping-model/index.js';
import { validateEngineeringSettingsProfile } from './profile.js';

export function applyReportTimestampPolicy(artifact, profile, generatedAt) {
  if (!validateEngineeringSettingsProfile(profile).ok) throw new TypeError('A valid engineering settings profile is required for report export.');
  const policy = profile.settings.reportTimestampPolicy;
  if (policy === 'exclude-from-deterministic-hash') return artifact;
  if (policy !== 'include-in-export-content') throw new TypeError(`Unsupported report timestamp policy: ${policy}.`);
  if (typeof generatedAt !== 'string' || !generatedAt) throw new TypeError('A generated UTC timestamp is required when export timestamps are enabled.');
  const timestamp = generatedAt;
  const content = appendTimestamp(artifact, timestamp);
  const base = {
    ...artifact,
    content,
    byteLength: utf8ByteLength(content),
    generatedAt: timestamp,
    settingsProfileId: profile.profileId,
    timestampPolicy: policy,
  };
  delete base.semanticHash;
  return deepFreeze({ ...base, semanticHash: semanticHash(base) });
}

function appendTimestamp(artifact, timestamp) {
  if (artifact.format === 'JSON') {
    const value = JSON.parse(artifact.content);
    return canonicalPrettyStringify({ ...value, generatedAt: timestamp });
  }
  if (artifact.format === 'CSV') {
    const row = ['metadata','','','','','','','','generatedAt',timestamp,'','','',''];
    return `${artifact.content}${row.map(csvCell).join(',')}\n`;
  }
  return `${artifact.content.trimEnd()}\n\nGenerated at: ${timestamp}\n`;
}
function csvCell(value) { const text = String(value); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
