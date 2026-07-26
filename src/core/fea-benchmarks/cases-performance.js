/**
 * Performance budget verification cases.
 *
 * These declare cost budgets that the application must meet for the workbench
 * to remain usable. They are engineering requirements, not micro-benchmarks:
 * a failure means an engineer waits, or the browser tab freezes.
 *
 * Budgets are declared generously so that CI hardware variation does not cause
 * flapping, while still catching order-of-magnitude regressions.
 */
import { hashBytes, semanticHash } from '../shared-piping-model/canonical-json.js';
import {
  createLfeaWorkbenchAdapterProfile, createLfeaWorkbenchReviewProfile, executeLfeaWorkbench,
} from '../../workspace/lfea-workbench-pipeline.js';
import { effectiveElementCeiling, preflightMeshPackage } from '../../workspace/lfea-preflight.js';
import {
  FIXED, FREE, denseProfile, pBoundary, pConstraint, pLoadCase, pMaterialAssignment,
  pPoint, pPointForce, pRegion, pThicknessAssignment, q4Grid, sealPackage, sparseProfile,
} from './builders.js';

const E_STEEL = 200000;
const NU = 0.3;

function passFail(checkId, quantity, ok, note) {
  return {
    checkId, quantity, unit: null,
    computed: ok ? 1 : 0, reference: 1,
    absoluteError: ok ? 0 : 1, relativeError: ok ? 0 : 1,
    tolerance: 0, toleranceType: 'BOOLEAN',
    status: ok ? 'PASS' : 'FAIL', note: note ?? null,
  };
}

function budget(checkId, quantity, unit, measured, limit, note) {
  return {
    checkId, quantity, unit,
    computed: measured, reference: limit,
    absoluteError: Math.max(0, measured - limit),
    relativeError: limit > 0 ? Math.max(0, measured - limit) / limit : 0,
    tolerance: 0, toleranceType: 'BUDGET',
    status: measured <= limit ? 'PASS' : 'FAIL',
    note: note ?? null,
  };
}

function now() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now() : Number(process.hrtime.bigint() / 1000n) / 1000;
}

/**
 * Reference FNV-1a 64 implementation using BigInt.
 *
 * Retained permanently so that any future change to `hashBytes` can be proven
 * bit-identical rather than merely assumed to be. Do not delete.
 */
function referenceHashBytes(bytes) {
  const OFFSET = 0xcbf29ce484222325n;
  const PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = OFFSET;
  for (const byte of bytes) hash = ((hash ^ BigInt(byte)) * PRIME) & MASK;
  return `fnv1a64:${hash.toString(16).padStart(16, '0')}`;
}

/** Deterministic PRNG. CORE_SPECIFICATION forbids Math.random in any path. */
function seededBytes(count, seed) {
  const out = new Uint8Array(count);
  let state = seed >>> 0;
  for (let i = 0; i < count; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = (state >>> 24) & 0xff;
  }
  return out;
}

/* ================================================================== */
/* Hash correctness and throughput                                     */
/* ================================================================== */

function hashCorrectnessAndThroughput() {
  const caseId = 'BM-T5-HASH';
  return {
    caseId,
    title: 'Semantic hash is bit-identical to the FNV-1a-64 reference and meets its throughput budget',
    tier: 'T5_PERFORMANCE',
    category: 'EVIDENCE_COST',
    kernel: 'shared-piping-model',
    reference: {
      type: 'INVARIANT',
      source: 'FNV-1a 64-bit (Fowler-Noll-Vo). Every committed evidence bundle depends on this value, '
        + 'so any implementation change must be proven bit-identical.',
    },
    run() {
      const encoder = new TextEncoder();
      const vectors = [
        new Uint8Array(0),
        encoder.encode('a'),
        encoder.encode('hello world'),
        encoder.encode(JSON.stringify({ a: 1, b: [1, 2, 3], c: 'x' })),
        encoder.encode('x'.repeat(4096)),
        encoder.encode('\u2211\u03c0\u2713 unicode \u6f22\u5b57 \ud83d\ude80'),
        ...Array.from({ length: 8 }, (_, i) => new Uint8Array([i])),
        seededBytes(1, 1), seededBytes(97, 7), seededBytes(4096, 13), seededBytes(65536, 29),
      ];
      let mismatches = 0;
      let firstMismatch = null;
      vectors.forEach((bytes, index) => {
        const actual = hashBytes(bytes);
        const expected = referenceHashBytes(bytes);
        if (actual !== expected) {
          mismatches += 1;
          firstMismatch = firstMismatch ?? `vector ${index}: ${actual} != ${expected}`;
        }
      });

      let randomMismatches = 0;
      for (let trial = 0; trial < 500; trial += 1) {
        const bytes = seededBytes(1 + (trial * 37) % 1024, 1000 + trial);
        if (hashBytes(bytes) !== referenceHashBytes(bytes)) randomMismatches += 1;
      }

      const payload = encoder.encode('y'.repeat(4 * 1024 * 1024));
      const started = now();
      hashBytes(payload);
      const elapsed = now() - started;
      const megabytesPerSecond = 4 / (elapsed / 1000);

      const format = /^fnv1a64:[0-9a-f]{16}$/.test(hashBytes(encoder.encode('format')));

      return {
        checks: [
          passFail(`${caseId}.BIT_IDENTICAL_VECTORS`,
            'Hash matches the BigInt reference on all fixed vectors',
            mismatches === 0, firstMismatch ?? `${vectors.length} vectors verified`),
          passFail(`${caseId}.BIT_IDENTICAL_RANDOM`,
            'Hash matches the BigInt reference on 500 seeded pseudo-random inputs',
            randomMismatches === 0, `${randomMismatches} mismatches`),
          passFail(`${caseId}.FORMAT`, 'Hash string format is preserved', format),
          budget(`${caseId}.THROUGHPUT`,
            'Hash throughput', 'MB/s', -megabytesPerSecond, -50,
            `measured ${megabytesPerSecond.toFixed(1)} MB/s over a 4 MB payload; budget is at least 50 MB/s. `
            + 'A BigInt-per-byte implementation measures roughly 15 MB/s.'),
        ],
        evidence: {
          megabytesPerSecond: Math.round(megabytesPerSecond * 10) / 10,
          elapsedMsFor4MB: Math.round(elapsed * 100) / 100,
          vectorCount: vectors.length + 500,
        },
      };
    },
  };
}

/* ================================================================== */
/* Pipeline stage cost                                                 */
/* ================================================================== */

function gridPackage(nx, ny) {
  const grid = q4Grid({ width: nx * 5, height: ny * 5, nx, ny });
  const points = [];
  const constraints = [];
  for (let j = 0; j <= ny; j += 1) {
    const pointId = `P_L${String(j).padStart(3, '0')}`;
    points.push(pPoint(pointId, grid.nodeId(0, j)));
    constraints.push(pConstraint(`C_L${String(j).padStart(3, '0')}`, 'POINT', pointId, FIXED, j === 0 ? FIXED : FREE));
  }
  points.push(pPoint('P_TIP', grid.nodeId(nx, ny)));
  return sealPackage({
    packageIdentity: `BM-PERF-${nx}x${ny}`,
    formulation: 'PLANE_STRESS',
    solverProfile: sparseProfile('PLANE_STRESS'),
    nodes: grid.nodes,
    elements: grid.elements,
    materials: [{ materialId: 'MAT1', E: E_STEEL, nu: NU, sourceSemanticHash: 'fea-benchmark-source:v1' }],
    regions: [pRegion('R_ALL', grid.elementIds)],
    boundaries: [pBoundary('B_LEFT', [{ elementId: grid.elements[0].elementId, localEdgeId: 'Q4_E4' }])],
    points,
    materialAssignments: [pMaterialAssignment('MA1', 'R_ALL', 'MAT1')],
    thicknessAssignments: [pThicknessAssignment('TA1', 'R_ALL', 1)],
    loadCase: pLoadCase('LC1', { pointForces: [pPointForce('F1', 'P_TIP', 0, -100)] }),
    constraints,
  });
}

function pipelineBudget() {
  const caseId = 'BM-T5-PIPELINE';
  const nx = 14;
  const ny = 14;   // 196 Q4 elements, 225 nodes, 450 DOF
  return {
    caseId,
    title: 'Workbench pipeline meets its interactive-latency budget on a small model',
    tier: 'T5_PERFORMANCE',
    category: 'INTERACTION_COST',
    kernel: 'lfea-workbench',
    reference: {
      type: 'ENGINEERING_REQUIREMENT',
      source: 'A 450-DOF model is trivially small for FEA. Anything beyond a few seconds on the UI thread '
        + 'is a frozen tab. Budget declared in advance: 6 s for the full evidence chain.',
    },
    run() {
      const packageValue = gridPackage(nx, ny);
      const started = now();
      const execution = executeLfeaWorkbench(packageValue, {});
      const elapsed = now() - started;
      const solved = execution.result?.status === 'QUALIFIED';
      return {
        checks: [
          passFail(`${caseId}.SOLVES`, 'Model reaches a qualified solver result', solved,
            `status = ${execution.status}, failedStage = ${execution.failedStage ?? 'none'}`),
          budget(`${caseId}.WALL_CLOCK`,
            'Full pipeline wall clock', 'ms', elapsed, 6000,
            `${nx * ny} Q4 elements, ${2 * packageValue.nodes.length} DOF.`),
        ],
        evidence: {
          elements: nx * ny,
          dof: 2 * packageValue.nodes.length,
          elapsedMs: Math.round(elapsed),
          pipelineStatus: execution.status,
          failedStage: execution.failedStage,
        },
      };
    },
  };
}

/* ================================================================== */
/* Capacity envelope consistency                                       */
/* ================================================================== */

function capacityEnvelope() {
  const caseId = 'BM-T5-CAPACITY-ENVELOPE';
  return {
    caseId,
    title: 'Declared capacity is reachable and preflight predicts the export cost before any work is spent',
    tier: 'T5_PERFORMANCE',
    category: 'CAPACITY',
    kernel: 'lfea-workbench',
    reference: {
      type: 'ENGINEERING_REQUIREMENT',
      source: 'A declared mesh capacity that the evidence chain cannot deliver is a false statement to the '
        + 'user. Preflight must predict the export cost in O(N+E) so a doomed run is never started.',
    },
    run() {
      const packageValue = gridPackage(30, 30);          // 900 Q4 elements, 961 nodes
      const adapterProfile = createLfeaWorkbenchAdapterProfile();
      const reviewProfile = createLfeaWorkbenchReviewProfile(true, false);

      const preflightStarted = now();
      const preflight = preflightMeshPackage(packageValue, adapterProfile, reviewProfile);
      const preflightMs = now() - preflightStarted;

      const execution = executeLfeaWorkbench(packageValue, {});
      const solved = execution.result?.status === 'QUALIFIED';
      const exported = execution.evidenceExport?.status === 'QUALIFIED_EXPORT';
      const actualBytes = (execution.evidenceExport?.files ?? [])
        .reduce((sum, file) => sum + file.byteLength, 0);
      const predictionError = actualBytes > 0
        ? Math.abs(preflight.estimatedExportBytes - actualBytes) / actualBytes
        : Number.POSITIVE_INFINITY;
      const ceiling = effectiveElementCeiling(reviewProfile.maximumExportBytes);
      const blocker = execution.diagnostics?.find((row) => String(row.code).includes('CAPACITY')) ?? null;

      return {
        checks: [
          passFail(`${caseId}.SOLVES`,
            'A 900-element model reaches a qualified solve', solved,
            `status = ${execution.status}`),
          passFail(`${caseId}.EXPORTS`,
            'The same model completes the evidence export', exported,
            blocker ? `blocked by ${blocker.code}: ${blocker.message}`
              : `export status = ${execution.evidenceExport?.status ?? 'NOT_REACHED'}`),
          passFail(`${caseId}.CAPACITY_CONSISTENT`,
            'Declared element capacity does not exceed what the evidence chain can deliver',
            adapterProfile.maximumElements <= ceiling,
            `declared maximumElements = ${adapterProfile.maximumElements}, `
            + `effective ceiling from the ${(reviewProfile.maximumExportBytes / (1024 * 1024)).toFixed(0)} MB `
            + `export cap = ${ceiling} elements`),
          budget(`${caseId}.PREFLIGHT_ACCURACY`,
            'Preflight export-size prediction error', '-', predictionError, 0.15,
            `predicted ${preflight.estimatedExportBytes} B, actual ${actualBytes} B`),
          budget(`${caseId}.PREFLIGHT_COST`,
            'Preflight wall clock', 'ms', preflightMs, 50,
            'Preflight must be cheap enough to run on every package change.'),
          passFail(`${caseId}.PREFLIGHT_STATUS`,
            'Preflight status agrees with the outcome actually observed',
            (preflight.status === 'WITHIN_CAPACITY') === exported,
            `preflight said ${preflight.status}; export ${exported ? 'succeeded' : 'failed'}`),
        ],
        evidence: {
          elements: 900,
          declaredMaximumElements: adapterProfile.maximumElements,
          effectiveElementCeiling: ceiling,
          predictedExportBytes: preflight.estimatedExportBytes,
          actualExportBytes: actualBytes,
          predictionErrorFraction: Number.isFinite(predictionError) ? predictionError : null,
          preflightMs: Math.round(preflightMs * 100) / 100,
          preflightStatus: preflight.status,
          pipelineStatus: execution.status,
          failedStage: execution.failedStage,
        },
      };
    },
  };
}

/* ================================================================== */
/* Registry                                                            */
/* ================================================================== */

/**
 * Performance and capacity verification cases.
 *
 * @returns {Array<Record<string, unknown>>} Case definitions.
 */
export function performanceBenchmarkCases() {
  return [hashCorrectnessAndThroughput(), pipelineBudget(), capacityEnvelope()];
}

export { referenceHashBytes, seededBytes };
