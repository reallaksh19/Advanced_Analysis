/**
 * Topology Edit Draft — Wave 5 qualification metrics.
 *
 * Release gates use percentiles and explicit correctness counters. Averages are
 * retained only as descriptive compatibility fields and never determine pass.
 */

export const DEFAULT_TOPOLOGY_EDIT_PERFORMANCE_BUDGETS = Object.freeze({
  firstValidFrameP95Ms: 5_000,
  pickP95Ms: 100,
  selectionHighlightP95Ms: 50,
  frameP95Ms: 33.3,
  commandPreparationP95Ms: 2_000,
  commitP95Ms: 12_000,
  heapGrowthBytes: 100 * 1024 * 1024,
  gpuResourceGrowth: 0,
});

const METRIC_ALIASES = Object.freeze({
  pickLatencies: 'pickMs',
  renderLatencies: 'frameMs',
  commandTimes: 'commandPreparationMs',
});

const REQUIRED_GATE_NAMES = Object.freeze([
  'firstValidFrame',
  'pick',
  'selectionHighlight',
  'navigation',
  'commandPreparation',
  'commit',
  'memory',
  'identity',
  'determinism',
  'scope',
]);

export class TopologyEditLargeModelController {
  constructor(input = 0) {
    const options = typeof input === 'number' ? { componentCount: input } : input;
    this.componentCount = nonNegativeInteger(
      options.componentCount,
      'componentCount',
    );
    this.sourceByteLength = nonNegativeInteger(
      options.sourceByteLength || 0,
      'sourceByteLength',
    );
    this.componentThreshold = positiveInteger(
      options.componentThreshold || 500,
      'componentThreshold',
    );
    this.byteThreshold = positiveInteger(
      options.byteThreshold || 5 * 1024 * 1024,
      'byteThreshold',
    );
    this.maxSamples = positiveInteger(options.maxSamples || 2_000, 'maxSamples');
    this.budgets = Object.freeze({
      ...DEFAULT_TOPOLOGY_EDIT_PERFORMANCE_BUDGETS,
      ...(options.budgets || {}),
    });
    this.isLargeModel =
      this.componentCount >= this.componentThreshold ||
      this.sourceByteLength >= this.byteThreshold;
    this.metrics = new Map();
    this.resourceSnapshots = [];
    this.counters = {
      wrongSelectionCount: 0,
      determinismHashDifferenceCount: 0,
      staleWorkerResponseCount: 0,
      scopeSemanticMismatchCount: 0,
    };
  }

  recordMetric(type, valueMs, metadata = null) {
    const normalizedType = METRIC_ALIASES[type] || String(type || '').trim();
    if (!normalizedType) throw new TypeError('Metric type is required.');
    const numeric = Number(valueMs);
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new TypeError(`${normalizedType} must be finite and non-negative.`);
    }
    const samples = this.metrics.get(normalizedType) || [];
    samples.push(Object.freeze({ valueMs: numeric, metadata }));
    if (samples.length > this.maxSamples) {
      samples.splice(0, samples.length - this.maxSamples);
    }
    this.metrics.set(normalizedType, samples);
  }

  recordIdentityResult(expectedCanonicalId, actualCanonicalId) {
    if (String(expectedCanonicalId) !== String(actualCanonicalId)) {
      this.counters.wrongSelectionCount += 1;
      return false;
    }
    return true;
  }

  recordDeterminismResult(expectedHash, actualHash) {
    if (String(expectedHash) !== String(actualHash)) {
      this.counters.determinismHashDifferenceCount += 1;
      return false;
    }
    return true;
  }

  recordStaleWorkerResponse() {
    this.counters.staleWorkerResponseCount += 1;
  }

  recordScopeSemanticResult(matches) {
    if (!matches) this.counters.scopeSemanticMismatchCount += 1;
    return Boolean(matches);
  }

  recordResourceSnapshot(snapshot = {}) {
    const normalized = Object.freeze({
      heapUsedBytes: nonNegativeNumber(
        snapshot.heapUsedBytes || 0,
        'heapUsedBytes',
      ),
      gpuGeometryCount: nonNegativeNumber(
        snapshot.gpuGeometryCount || 0,
        'gpuGeometryCount',
      ),
      gpuTextureCount: nonNegativeNumber(
        snapshot.gpuTextureCount || 0,
        'gpuTextureCount',
      ),
      gpuProgramCount: nonNegativeNumber(
        snapshot.gpuProgramCount || 0,
        'gpuProgramCount',
      ),
      listenerCount: nonNegativeNumber(
        snapshot.listenerCount || 0,
        'listenerCount',
      ),
      workerCount: nonNegativeNumber(
        snapshot.workerCount || 0,
        'workerCount',
      ),
      label: snapshot.label ? String(snapshot.label) : null,
    });
    this.resourceSnapshots.push(normalized);
    if (this.resourceSnapshots.length > this.maxSamples) {
      this.resourceSnapshots.shift();
    }
    return normalized;
  }

  getPerformanceReport() {
    const summaries = {};
    for (const [type, samples] of [...this.metrics.entries()].sort()) {
      summaries[type] = summarize(samples.map((sample) => sample.valueMs));
    }

    const resources = resourceGrowth(this.resourceSnapshots);
    const gates = {
      firstValidFrame:
        gatePercentile(
          summaries.firstValidFrameMs,
          'p95',
          this.budgets.firstValidFrameP95Ms,
        ),
      pick:
        gatePercentile(summaries.pickMs, 'p95', this.budgets.pickP95Ms),
      selectionHighlight:
        gatePercentile(
          summaries.selectionHighlightMs,
          'p95',
          this.budgets.selectionHighlightP95Ms,
        ),
      navigation:
        gatePercentile(summaries.frameMs, 'p95', this.budgets.frameP95Ms),
      commandPreparation:
        gatePercentile(
          summaries.commandPreparationMs,
          'p95',
          this.budgets.commandPreparationP95Ms,
        ),
      commit:
        gatePercentile(summaries.commitMs, 'p95', this.budgets.commitP95Ms),
      memory: resources
        ? {
            status:
              resources.heapGrowthBytes <= this.budgets.heapGrowthBytes &&
              resources.gpuResourceGrowth <= this.budgets.gpuResourceGrowth
                ? 'PASS'
                : 'FAIL',
            actual: resources,
            budget: {
              heapGrowthBytes: this.budgets.heapGrowthBytes,
              gpuResourceGrowth: this.budgets.gpuResourceGrowth,
            },
          }
        : { status: 'NOT_RUN' },
      identity: exactZeroGate(this.counters.wrongSelectionCount),
      determinism: exactZeroGate(
        this.counters.determinismHashDifferenceCount,
      ),
      scope: exactZeroGate(this.counters.scopeSemanticMismatchCount),
    };

    const requiredGates = REQUIRED_GATE_NAMES.map((name) => gates[name]);
    const status = requiredGates.some((gate) => gate.status === 'FAIL')
      ? 'FAIL'
      : requiredGates.every((gate) => gate.status === 'PASS')
        ? 'PASS'
        : 'INCOMPLETE';

    return Object.freeze({
      schema: 'advanced-topology-edit-performance-report/v2',
      componentCount: this.componentCount,
      sourceByteLength: this.sourceByteLength,
      isLargeModel: this.isLargeModel,
      budgets: this.budgets,
      metrics: Object.freeze(summaries),
      resources,
      counters: Object.freeze({ ...this.counters }),
      gates: Object.freeze(gates),
      status,
      // Compatibility fields. These are descriptive only.
      avgPickMs: summaries.pickMs?.mean ?? 0,
      avgRenderMs: summaries.frameMs?.mean ?? 0,
      avgCommandMs: summaries.commandPreparationMs?.mean ?? 0,
      budgetPass: status === 'PASS',
    });
  }
}

export function summarizePerformanceSamples(values = []) {
  return summarize(values);
}

function summarize(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return Object.freeze({
      count: 0,
      min: null,
      max: null,
      mean: null,
      p50: null,
      p95: null,
      p99: null,
    });
  }
  const sorted = values.map(Number).sort((left, right) => left - right);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  return Object.freeze({
    count: sorted.length,
    min: round(sorted[0]),
    max: round(sorted[sorted.length - 1]),
    mean: round(mean),
    p50: round(percentile(sorted, 0.5)),
    p95: round(percentile(sorted, 0.95)),
    p99: round(percentile(sorted, 0.99)),
  });
}

function percentile(sorted, probability) {
  const rank = Math.max(1, Math.ceil(probability * sorted.length));
  return sorted[Math.min(sorted.length - 1, rank - 1)];
}

function resourceGrowth(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length < 2) return null;
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  const firstGpu =
    first.gpuGeometryCount + first.gpuTextureCount + first.gpuProgramCount;
  const lastGpu =
    last.gpuGeometryCount + last.gpuTextureCount + last.gpuProgramCount;
  return Object.freeze({
    sampleCount: snapshots.length,
    heapGrowthBytes: last.heapUsedBytes - first.heapUsedBytes,
    gpuResourceGrowth: lastGpu - firstGpu,
    listenerGrowth: last.listenerCount - first.listenerCount,
    workerGrowth: last.workerCount - first.workerCount,
  });
}

function gatePercentile(summary, field, budget) {
  if (!summary || summary.count === 0) return { status: 'NOT_RUN' };
  return {
    status: summary[field] <= budget ? 'PASS' : 'FAIL',
    percentile: field,
    actualMs: summary[field],
    budgetMs: budget,
    sampleCount: summary.count,
  };
}

function exactZeroGate(value) {
  return {
    status: value === 0 ? 'PASS' : 'FAIL',
    actual: value,
    required: 0,
  };
}

function round(value) {
  return Number(value.toFixed(3));
}

function positiveInteger(value, label) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new TypeError(`${label} must be a positive integer.`);
  }
  return numeric;
}

function nonNegativeInteger(value, label) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new TypeError(`${label} must be a non-negative integer.`);
  }
  return numeric;
}

function nonNegativeNumber(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new TypeError(`${label} must be finite and non-negative.`);
  }
  return numeric;
}
