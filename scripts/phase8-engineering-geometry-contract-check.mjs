#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';
import { classifyEngineeringComponent } from '../src/workspace/engineering-component-classifier.js';
import { resolveEngineeringDimensions } from '../src/workspace/engineering-dimension-resolver.js';
import {
  buildResolvedEngineeringGeometry,
  RESOLVED_ENGINEERING_GEOMETRY_SCHEMA,
} from '../src/workspace/resolved-engineering-geometry.js';
import {
  buildViewportRenderModel,
  VIEWPORT_RENDER_MODEL_SCHEMA,
} from '../src/workspace/viewport-render-model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataset = normalizeWorkspaceDataset(fixture(), 'phase8.json');
const resolved = buildResolvedEngineeringGeometry(dataset);
const model = buildViewportRenderModel(resolved);

console.log('\n--- Phase 8 Resolved Engineering Geometry Contract Check ---');
assert.equal(resolved.schema, RESOLVED_ENGINEERING_GEOMETRY_SCHEMA);
assert.equal(model.schema, VIEWPORT_RENDER_MODEL_SCHEMA);
assert.equal(resolved.datasetId, 'PHASE8-GEOMETRY');
assert.equal(resolved.summary.renderableCount, 9);
assert.equal(resolved.summary.resolvedCount, 7);
assert.equal(resolved.summary.fallbackCount, 2);
assert.equal(resolved.summary.skippedCount, 1);
assert.deepEqual(resolved.skippedEntityIds, ['VALVE-SKIPPED']);
assert.deepEqual(Object.keys(resolved.summary.byKind).sort(), [
  'ELBOW', 'FLANGE', 'PIPE', 'REDUCER', 'SUPPORT', 'TEE', 'VALVE',
]);
console.log('✅ Dataset resolves seven engineering kinds with explicit fallback and skipped evidence.');

const byId = new Map(resolved.items.map((item) => [item.entityId, item]));
assert.equal(byId.get('PIPE-1').primitive.kind, 'tube');
assert.equal(byId.get('ELBOW-1').primitive.kind, 'swept-path');
assert.ok(byId.get('ELBOW-1').primitive.path.length >= 5);
assert.equal(byId.get('TEE-1').primitive.kind, 'junction');
assert.equal(byId.get('TEE-1').primitive.legs.length, 3);
assert.equal(byId.get('REDUCER-1').primitive.kind, 'frustum');
assert.equal(byId.get('FLANGE-1').primitive.kind, 'disc');
assert.equal(byId.get('VALVE-1').primitive.kind, 'valve-body');
assert.equal(byId.get('SUPPORT-1').primitive.kind, 'support-marker');
assert.equal(byId.get('PIPE-FALLBACK').resolutionStatus, 'fallback');
assert.equal(byId.get('PIPE-ZERO').primitive.kind, 'marker');
assert.equal(byId.get('PIPE-ZERO').resolutionStatus, 'fallback');
console.log('✅ Pipe, elbow, tee, reducer, flange, valve, support, and zero-span safeguards resolve deterministically.');

const pipeDimensions = resolveEngineeringDimensions(dataset.entities.find((item) => item.entityId === 'PIPE-1'));
assert.equal(pipeDimensions.values.outerDiameterMm, 168.3);
assert.match(pipeDimensions.evidence.outerDiameterMm.sourcePath, /sourceAttributes\.PIPE_OD/);
assert.equal(classifyEngineeringComponent({ entityType: 'BEND', properties: {} }).kind, 'ELBOW');
assert.equal(classifyEngineeringComponent({ entityType: 'OLET', properties: {} }).kind, 'TEE');
assert.equal(classifyEngineeringComponent({ entityType: '', name: 'Gate valve', properties: {} }).kind, 'VALVE');
console.log('✅ Classification and dimension aliases preserve deterministic source trace.');

assert.equal(model.summary.renderableCount, resolved.summary.renderableCount);
assert.equal(model.sourceSchema, RESOLVED_ENGINEERING_GEOMETRY_SCHEMA);
assert.ok(model.bounds.radius > 0);
assert.ok(Object.isFrozen(resolved));
assert.ok(Object.isFrozen(resolved.items[0]));
assert.ok(Object.isFrozen(model));
assertFiniteNumbers(resolved);
assertFiniteNumbers(model);
const serializedModel = JSON.stringify(model);
for (const forbidden of ['sourceAttributes', 'enrichedAttributes', 'nativeParams', 'inputxml-managed-stage']) {
  assert.ok(!serializedModel.includes(forbidden), `Render model leaks raw field ${forbidden}.`);
}
console.log('✅ Resolved and viewport contracts are immutable, finite, bounded, and raw-field free.');

const runtimeFiles = [
  'src/workspace/geometry-evidence.js',
  'src/workspace/engineering-component-classifier.js',
  'src/workspace/engineering-dimension-resolver.js',
  'src/workspace/engineering-geometry-math.js',
  'src/workspace/resolved-engineering-geometry.js',
  'src/workspace/viewport-render-model.js',
  'src/workspace/viewport-hit-test.js',
  'src/workspace/canvas2d-viewport-backend.js',
  'src/workspace/three-engineering-primitives.js',
  'src/workspace/three-viewport-backend.js',
  'src/workspace/viewport-panel.js',
];
for (const relativePath of runtimeFiles) {
  const source = await readFile(path.join(root, relativePath), 'utf8');
  const lineCount = source.split(/\r?\n/).length;
  assert.ok(lineCount <= 300, `${relativePath} exceeds 300 lines (${lineCount}).`);
  assert.doesNotMatch(source, /from ['"](?:zustand|react|react-dom)/, `${relativePath} imports React/Zustand.`);
  assert.doesNotMatch(source, /(?:Date\.now|performance\.now|Math\.random)/, `${relativePath} is non-deterministic.`);
  assert.doesNotMatch(source, /src\/(?:sketcher|calc-|pcf|vendors)/, `${relativePath} imports legacy runtime code.`);
}
const rendererSource = (await Promise.all([
  'src/workspace/canvas2d-viewport-backend.js',
  'src/workspace/three-engineering-primitives.js',
  'src/workspace/three-viewport-backend.js',
].map((file) => readFile(path.join(root, file), 'utf8')))).join('\n');
for (const forbidden of ['sourceAttributes', 'enrichedAttributes', 'nativeParams', 'PIPE_OD', 'FLANGE_OD']) {
  assert.ok(!rendererSource.includes(forbidden), `Renderer reinterprets raw engineering field ${forbidden}.`);
}
for (const expected of ['TubeGeometry', 'CylinderGeometry', 'SphereGeometry', 'BoxGeometry']) {
  assert.ok(rendererSource.includes(expected), `WebGL primitive factory misses ${expected}.`);
}
console.log('✅ Runtime size, determinism, dependency, and renderer-isolation guardrails pass.');
console.log('\n✅ Phase 8 resolved engineering geometry contract check passed.\n');

function fixture() {
  return {
    schema: 'inputxml-managed-stage/v1',
    packageHash: 'PHASE8-GEOMETRY',
    objects: [
      component('PIPE-1', 'PIPE', {
        nativeParams: { startPoint: [0, 0, 0], endPoint: [1000, 0, 0] },
        sourceAttributes: { PIPE_OD: 168.3, WALL_THICKNESS_MM: 7.11 },
      }),
      component('ELBOW-1', 'BEND', {
        points: [point(1000, 0, 0, 168.3), point(1500, 500, 0, 168.3)],
        centrePoint: point(1000, 500, 0),
        sourceAttributes: { PIPE_OD: 168.3 },
      }),
      component('TEE-1', 'TEE', {
        points: [point(1500, 500, 0), point(2500, 500, 0), point(2000, 1100, 0)],
        centrePoint: point(2000, 500, 0),
        sourceAttributes: { PIPE_OD: 168.3, BRANCH_OD: 114.3 },
      }),
      component('REDUCER-1', 'REDUCER', {
        nativeParams: { startPoint: [2500, 500, 0], endPoint: [3000, 500, 0] },
        sourceAttributes: { OD1: 168.3, OD2: 114.3 },
      }),
      component('FLANGE-1', 'FLANGE', {
        nativeParams: { startPoint: [3000, 500, 0], endPoint: [3060, 500, 0] },
        sourceAttributes: { FLANGE_OD: 285, FLANGE_THICKNESS: 30 },
      }),
      component('VALVE-1', 'VALVE', {
        nativeParams: { startPoint: [3060, 500, 0], endPoint: [3560, 500, 0] },
        sourceAttributes: { BODY_DIAMETER: 260 },
      }),
      component('SUPPORT-1', 'GUIDE', {
        sourceAttributes: { CENTER: '2100 0 -250', SUPPORT_SIZE: 180 },
      }),
      component('PIPE-FALLBACK', 'PIPE', {
        nativeParams: { startPoint: [0, 1000, 0], endPoint: [800, 1000, 0] },
      }),
      component('PIPE-ZERO', 'PIPE', {
        nativeParams: { startPoint: [100, 1500, 0], endPoint: [100, 1500, 0] },
      }),
      component('VALVE-SKIPPED', 'VALVE', {}),
    ],
  };
}

function component(id, type, extras) {
  return { id, name: id, type, sourcePath: `/AREA-8/LINE-8/${id}`, ...extras };
}

function point(x, y, z, bore) {
  return { x, y, z, ...(bore ? { bore } : {}) };
}

function assertFiniteNumbers(value, pathValue = '$') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${pathValue} is not finite.`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertFiniteNumbers(entry, `${pathValue}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, entry]) => assertFiniteNumbers(entry, `${pathValue}.${key}`));
  }
}
