export function installNonFeaBrowserBaseline({ executionId, fixtureId }) {
  if (typeof executionId !== 'string' || !executionId) throw new TypeError('executionId is required.');
  if (typeof fixtureId !== 'string' || !fixtureId) throw new TypeError('fixtureId is required.');
  const longTasks = [];
  let observer = null;
  if (typeof PerformanceObserver === 'function') {
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTasks.push({ startTimeMs: entry.startTime, durationMs: entry.duration });
        }
      });
      observer.observe({ type: 'longtask', buffered: true });
    } catch {
      observer = null;
    }
  }
  const prefix = `non-fea:${executionId}:${fixtureId}`;
  return Object.freeze({
    mark(stageId) { performance.mark(`${prefix}:${stageId}`); },
    measure(stageId, startStageId, endStageId) {
      return performance.measure(`${prefix}:${stageId}`, `${prefix}:${startStageId}`, `${prefix}:${endStageId}`);
    },
    snapshot() {
      return Object.freeze({
        executionId,
        fixtureId,
        longTaskSupport: Boolean(observer),
        longTasks: Object.freeze(longTasks.map((row) => Object.freeze({ ...row }))),
        canvasCount: document.querySelectorAll('canvas').length,
        webglCanvasCount: document.querySelectorAll('canvas[data-viewport-backend="webgl"]').length,
      });
    },
    destroy() { observer?.disconnect(); observer = null; },
  });
}
