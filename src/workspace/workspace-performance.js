const PREFIX = 'workspace:p1:';

export function measureWorkspaceStage(stage, callback, detail = undefined) {
  if (typeof callback !== 'function') throw new TypeError('Workspace performance stage requires a callback.');
  const performanceRef = globalThis.performance;
  if (!performanceRef?.now) return callback();
  const start = performanceRef.now();
  try {
    return callback();
  } finally {
    recordMeasure(performanceRef, `${PREFIX}stage:${stage}`, start, performanceRef.now(), detail);
  }
}

export function markWorkspaceInvocation(name, detail = undefined) {
  const performanceRef = globalThis.performance;
  if (!performanceRef?.mark) return;
  try {
    performanceRef.mark(`${PREFIX}call:${name}`, detail === undefined ? undefined : { detail });
  } catch {
    performanceRef.mark(`${PREFIX}call:${name}`);
  }
}

export function markWorkspaceMilestone(name, detail = undefined) {
  const performanceRef = globalThis.performance;
  if (!performanceRef?.mark) return;
  try {
    performanceRef.mark(`${PREFIX}milestone:${name}`, detail === undefined ? undefined : { detail });
  } catch {
    performanceRef.mark(`${PREFIX}milestone:${name}`);
  }
}

function recordMeasure(performanceRef, name, start, end, detail) {
  if (!performanceRef?.measure) return;
  try {
    performanceRef.measure(name, detail === undefined ? { start, end } : { start, end, detail });
  } catch {
    try {
      performanceRef.measure(name, { start, end });
    } catch {
      // Performance evidence must never alter production behavior.
    }
  }
}
