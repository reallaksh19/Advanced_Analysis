import { deepFreeze, stringValue } from '../shared-piping-model/index.js';

export function evaluateIdentityCompatibility(left, right) {
  const line = compareIdentity(left?.lineId, right?.lineId);
  const system = compareIdentity(left?.systemId, right?.systemId);
  const branch = compareIdentity(left?.branchId, right?.branchId);
  const zone = compareIdentity(left?.zoneId, right?.zoneId);
  const conflict = line === 'CONFLICT' || system === 'CONFLICT';
  const matchCount = [line, system, branch, zone].filter((value) => value === 'MATCH').length;
  return deepFreeze({
    status: conflict ? 'CONFLICT' : matchCount ? 'MATCH' : 'NEUTRAL',
    line,
    system,
    branch,
    zone,
    matchCount,
    compatibleForInferred: !conflict,
  });
}

export function identityConflictDiagnostics(portA, portB, compatibility, evidenceType) {
  const diagnostics = [];
  if (compatibility.system === 'CONFLICT') diagnostics.push(conflictDiagnostic(
    'TOPOLOGY_SYSTEM_IDENTITY_CONFLICT',
    portA,
    portB,
    evidenceType,
    'Conflicting non-empty system identity blocks inferred connectivity.',
  ));
  if (compatibility.line === 'CONFLICT') diagnostics.push(conflictDiagnostic(
    'TOPOLOGY_LINE_IDENTITY_CONFLICT',
    portA,
    portB,
    evidenceType,
    'Conflicting non-empty line identity requires explicit connection evidence.',
  ));
  return deepFreeze(diagnostics);
}

function compareIdentity(left, right) {
  const a = stringValue(left);
  const b = stringValue(right);
  if (!a || !b) return 'EMPTY';
  return a === b ? 'MATCH' : 'CONFLICT';
}

function conflictDiagnostic(code, portA, portB, evidenceType, message) {
  return deepFreeze({
    code,
    severity: 'WARNING',
    scope: pairScope(portA.portKey, portB.portKey),
    evidenceType,
    portAKey: portA.portKey,
    portBKey: portB.portKey,
    message,
  });
}

function pairScope(left, right) {
  return [left, right].sort().join('<->');
}
