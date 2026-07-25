import assert from 'node:assert/strict';
import {
  buildShellElementEvidence,
  createCanonicalLocalShellModel,
} from '../src/core/local-shell/index.js';
import { clone, triangleSource } from './lafea.4-fixtures.mjs';

const baseline = createCanonicalLocalShellModel(triangleSource());
const element = buildShellElementEvidence(baseline)[0];
close(element.area, 2500);
close(dot(cross(element.localFrame.ex, element.localFrame.ey), element.localFrame.ez), 1);
assert.ok(element.directorAlignment.every((row) => row.accepted));
assert.equal(element.nodalBasisTransformation.rank, 2);
assert.ok(element.nodalBasisTransformation.rigidReproduction.accepted);

const reversed = triangleSource((source) => { source.elements[0].nodeIds = ['C', 'B', 'A']; });
const cyclic = triangleSource((source) => { source.elements[0].nodeIds = ['B', 'C', 'A']; });
const reversedModel = createCanonicalLocalShellModel(reversed);
const cyclicModel = createCanonicalLocalShellModel(cyclic);
assert.equal(reversedModel.semanticHash, baseline.semanticHash);
assert.equal(cyclicModel.semanticHash, baseline.semanticHash);
assert.deepEqual(buildShellElementEvidence(reversedModel), buildShellElementEvidence(baseline));

const transformed = triangleSource((source) => transformGeometry(source));
const transformedElement = buildShellElementEvidence(createCanonicalLocalShellModel(transformed))[0];
assert.deepEqual(transformedElement.localCoordinates, element.localCoordinates);
assert.deepEqual(transformedElement.membraneStiffness, element.membraneStiffness);
assert.deepEqual(transformedElement.bendingStiffness, element.bendingStiffness);

reject((source) => { source.nodes[0].director = [0, 0, 2]; });
reject((source) => { source.nodes[0].rotationBasis1 = [0, 0, 1]; });
reject((source) => { source.nodes[0].rotationBasis2 = [0, -1, 0]; });
reject((source) => { source.nodes[2].director = [0, 0, -1]; });
reject((source) => { source.nodes[2].position = [200, 0, 0]; });
reject((source) => { source.nodes[2].position = [100, 1e-14, 0]; });

console.log('LAFEA.4 nodal bases, canonical facet frames, orientation and transformed geometry passed.');

function transformGeometry(source) {
  for (const node of source.nodes) {
    node.position = add(rotate(node.position), [10, -7, 3]);
    node.director = rotate(node.director);
    node.rotationBasis1 = rotate(node.rotationBasis1);
    node.rotationBasis2 = rotate(node.rotationBasis2);
  }
}

function rotate([x, y, z]) {
  return [-y, x, z];
}

function add(a, b) {
  return a.map((value, index) => value + b[index]);
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a, b) {
  return a.reduce((sum, value, index) => sum + value * b[index], 0);
}

function reject(mutator) {
  const source = clone(triangleSource());
  mutator(source);
  assert.throws(() => createCanonicalLocalShellModel(source));
}

function close(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
}
