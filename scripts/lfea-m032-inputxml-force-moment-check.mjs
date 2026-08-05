#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  InputXmlForceMomentCompilationError,
  compileInputXmlForceMomentPrimitives,
} from '../src/core/linear-piping-inputxml-force-moment/index.js';

const sourceEvidence = Object.freeze({ sourceId: 'SYNTHETIC-INPUTXML', sourceRevision: 'R1' });
const geometry = Object.freeze({
  segments: Object.freeze([
    Object.freeze({
      id: 'S1',
      meta: Object.freeze({
        analysis: Object.freeze({
          forcesMoments: Object.freeze([
            Object.freeze({
              forceMomentNumber: 7,
              nodeId: '20',
              vectors: Object.freeze([
                Object.freeze({
                  number: 1,
                  force: Object.freeze({ fx: 10, fy: null, fz: -30 }),
                  moment: Object.freeze({ mx: null, my: 5, mz: null }),
                }),
                Object.freeze({
                  number: 2,
                  force: Object.freeze({ fx: null, fy: null, fz: null }),
                  moment: Object.freeze({ mx: null, my: null, mz: null }),
                }),
              ]),
            }),
          ]),
        }),
      }),
    }),
  ]),
});

const compiled = compileInputXmlForceMomentPrimitives({
  geometry,
  kernelNodeByReference: new Map([['20', 'MODEL.N20']]),
  vectorNumbers: [1],
  ...sourceEvidence,
});
assert.equal(compiled.summary.declarationCount, 1);
assert.equal(compiled.summary.primitiveCount, 1);
assert.equal(compiled.primitives[0].nodeId, 'MODEL.N20');
assert.deepEqual(compiled.primitives[0].basis, { kind: 'GLOBAL' });
assert.deepEqual(compiled.primitives[0].force, { fx: 10, fy: 0, fz: -30 });
assert.deepEqual(compiled.primitives[0].moment, { mx: 0, my: 5, mz: 0 });
assert.equal(compiled.primitives[0].signConvention, 'APPLIED_TO_STRUCTURE');
assert.equal(Object.isFrozen(compiled), true);
assert.equal(Object.isFrozen(compiled.primitives[0]), true);

const zero = compileInputXmlForceMomentPrimitives({
  geometry,
  kernelNodeByReference: (nodeId) => `MODEL.N${nodeId}`,
  vectorNumbers: [2],
  ...sourceEvidence,
});
assert.equal(zero.summary.primitiveCount, 0);
assert.equal(zero.diagnostics[0].code, 'INPUTXML_FORCE_MOMENT_VECTOR_ZERO');

assert.throws(
  () => compileInputXmlForceMomentPrimitives({
    geometry,
    kernelNodeByReference: new Map(),
    vectorNumbers: [1],
    ...sourceEvidence,
  }),
  (error) => error instanceof InputXmlForceMomentCompilationError
    && error.code === 'INPUTXML_FORCE_MOMENT_NODE_UNBOUND',
);
assert.throws(
  () => compileInputXmlForceMomentPrimitives({
    geometry,
    kernelNodeByReference: new Map([['20', 'MODEL.N20']]),
    vectorNumbers: [1, 1],
    ...sourceEvidence,
  }),
  (error) => error instanceof InputXmlForceMomentCompilationError
    && error.code === 'INPUTXML_FORCE_MOMENT_VECTOR_SELECTION_DUPLICATED',
);
assert.throws(
  () => compileInputXmlForceMomentPrimitives({
    geometry: {
      segments: [{
        id: 'BAD',
        meta: {
          analysis: {
            forcesMoments: [{
              forceMomentNumber: 1,
              nodeId: '20',
              vectors: [{
                number: 1,
                force: { fx: Number.NaN, fy: 0, fz: 0 },
                moment: { mx: 0, my: 0, mz: 0 },
              }],
            }],
          },
        },
      }],
    },
    kernelNodeByReference: new Map([['20', 'MODEL.N20']]),
    vectorNumbers: [1],
    ...sourceEvidence,
  }),
  (error) => error instanceof InputXmlForceMomentCompilationError
    && error.code === 'INPUTXML_FORCE_MOMENT_COMPONENT_NONFINITE',
);

console.log(JSON.stringify({
  check: 'm032-inputxml-force-moment-compiler',
  status: 'PASS',
  compiledPrimitiveCount: compiled.summary.primitiveCount,
  zeroVectorDiagnostic: zero.diagnostics[0].code,
}, null, 2));
