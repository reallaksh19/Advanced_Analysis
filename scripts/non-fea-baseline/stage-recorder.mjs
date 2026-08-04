import { performance } from 'node:perf_hooks';
import { deepFreeze } from '../../src/core/shared-piping-model/immutable.js';
import {
  NON_FEA_PROCESS_LOG_SCHEMA,
  NON_FEA_STAGE_IDS,
  nonFeaFailure,
  roundMilliseconds,
} from './contracts.mjs';

export class NonFeaStageRecorder {
  constructor({ executionId, fixturePath = null, sampleKind = 'COLD', sampleIndex = 0 }) {
    if (typeof executionId !== 'string' || !executionId) {
      throw new TypeError('executionId is required.');
    }
    this.executionId = executionId;
    this.fixturePath = fixturePath;
    this.sampleKind = sampleKind;
    this.sampleIndex = sampleIndex;
    this.records = [];
    this.failures = [];
  }

  async capture(stageId, operation, evidence = {}) {
    if (!NON_FEA_STAGE_IDS.includes(stageId)) throw new RangeError(`Unknown stage ${stageId}.`);
    if (typeof operation !== 'function') {
      throw new TypeError(`Stage ${stageId} requires an operation.`);
    }
    const startedAt = performance.now();
    try {
      const value = await operation();
      this.records.push(deepFreeze({
        stageId,
        status: 'PASS',
        durationMs: roundMilliseconds(performance.now() - startedAt),
        evidence: deepFreeze({ ...evidence }),
      }));
      return value;
    } catch (error) {
      const failure = nonFeaFailure({
        classification: classifyError(error),
        code: error?.code || 'UNCLASSIFIED_ERROR',
        message: error instanceof Error ? error.message : String(error),
        stageId,
        details: evidence,
      });
      this.records.push(deepFreeze({
        stageId,
        status: 'FAIL',
        durationMs: roundMilliseconds(performance.now() - startedAt),
        evidence: deepFreeze({ ...evidence }),
        failure,
      }));
      this.failures.push(failure);
      throw error;
    }
  }

  blocked(stageId, code, message, details = null) {
    const failure = nonFeaFailure({
      classification: 'INFRASTRUCTURE_BLOCKER',
      code,
      message,
      stageId,
      details,
    });
    this.records.push(deepFreeze({
      stageId,
      status: 'BLOCKED',
      durationMs: null,
      evidence: deepFreeze({ details }),
    }));
    this.failures.push(failure);
  }

  snapshot() {
    return deepFreeze({
      schema: NON_FEA_PROCESS_LOG_SCHEMA,
      executionId: this.executionId,
      fixturePath: this.fixturePath,
      sampleKind: this.sampleKind,
      sampleIndex: this.sampleIndex,
      records: [...this.records],
      failures: [...this.failures],
    });
  }
}

function classifyError(error) {
  if (error?.code === 'ENOENT' || error?.code === 'ERR_MODULE_NOT_FOUND') {
    return 'INFRASTRUCTURE_BLOCKER';
  }
  const code = String(error?.code || '');
  if (code.includes('MISSING')) return 'MISSING_AUTHORITY';
  return 'PRE_EXISTING_CURRENT_MAIN_DEFECT';
}
