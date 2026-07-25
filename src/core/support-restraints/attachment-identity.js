import { deepFreeze, stringValue } from '../shared-piping-model/index.js';

export function assessAttachmentIdentity(supportIdentity, targetIdentity, explicit = false) {
  const system = compareField(supportIdentity?.systemId, targetIdentity?.systemId);
  const line = compareField(supportIdentity?.lineId, targetIdentity?.lineId);
  const branch = compareField(supportIdentity?.branchId, targetIdentity?.branchId);
  const blocked = !explicit && (system === 'CONFLICT' || line === 'CONFLICT');
  const matchCount = [system, line, branch].filter((state) => state === 'MATCH').length;
  return deepFreeze({
    system,
    line,
    branch,
    blocked,
    confidenceAdjustment: matchCount * 0.05,
  });
}

function compareField(leftValue, rightValue) {
  const left = stringValue(leftValue);
  const right = stringValue(rightValue);
  if (!left || !right) return 'NEUTRAL';
  return left === right ? 'MATCH' : 'CONFLICT';
}
