import assert from 'node:assert/strict';
import {
  createPcfIntakeSource,
  createPcfReviewExport,
  createPcfReviewModel,
  createPcfWorkspacePackage,
  validatePcfIntakeSource,
  validatePcfReviewModel,
  validatePcfWorkspacePackage,
} from '../src/core/pcf-intake/index.js';
import {
  CONSUMER_IDS,
  IMPLEMENTATION_STATUS,
  createApplicationViewStateV6,
  createWorkspaceConsumerContext,
  createWorkspaceConsumerReadinessRegistry,
  createWorkspaceConsumerRegistryV5,
  createWorkspaceConsumerRegistryV6,
  validateApplicationViewStateV6,
  validateWorkspaceConsumerRegistryV5,
  validateWorkspaceConsumerRegistryV6,
} from '../src/core/workspace-consumers/index.js';

const firstPipe = `PIPE\nEND-POINT 0 0 0 4\nEND-POINT 1000 0 0 4\nMATERIAL A106-B`;
const secondPipe = `PIPE\nEND-POINT 1000 0 0 4\nEND-POINT 2000 0 0 4\nMATERIAL A106-B`;
const header = `ISOGEN-FILES ISOGEN.FLS\nUNITS-CO-ORDS MM\nUNITS-BORE INCH`;
const sourceText = `${header}\n${firstPipe}\n${secondPipe}\n`;
const reorderedText = `${header}\n${secondPipe}\n${firstPipe}\n`;

const source = createPcfIntakeSource({ sourceName: 'mixed-units.pcf', sourceText });
assert.equal(source.schema, 'pcf-intake-source/v1');
assert.equal(source.adoption.allowed, true, source.diagnostics.map((row) => `${row.code}: ${row.message}`).join('\n'));
assert.equal(source.units.coordinate.unit, 'mm');
assert.equal(source.units.bore.unit, 'in');
assert.equal(source.components[0].pointsMm[0].bore, 101.6);
assert.equal(source.summary.modelComponentCount, 2);
assert.ok(validatePcfIntakeSource(source).ok);
assertDeepFrozen(source);

const review = createPcfReviewModel(source);
assert.equal(review.schema, 'pcf-review-model/v1');
assert.equal(review.components.length, 2);
assert.ok(validatePcfReviewModel(review, source).ok);
assertDeepFrozen(review);

const jsonExport = createPcfReviewExport(review, 'json');
const csvExport = createPcfReviewExport(review, 'csv');
assert.equal(jsonExport.semanticHash, createPcfReviewExport(review, 'json').semanticHash);
assert.match(jsonExport.content, /pcf-review-model\/v1/);
assert.match(csvExport.content, /source_index,component_id,type/);

const workspacePackage = createPcfWorkspacePackage(source);
assert.equal(workspacePackage.schema, 'inputxml-managed-stage/v1');
assert.equal(workspacePackage.objects.length, 2);
assert.equal(workspacePackage.objects[0].points[1].x, 1000);
assert.ok(validatePcfWorkspacePackage(workspacePackage, source).ok);
assertDeepFrozen(workspacePackage);

const reordered = createPcfIntakeSource({ sourceName: 'reordered.pcf', sourceText: reorderedText });
assert.equal(reordered.adoption.allowed, true);
assert.equal(reordered.semanticHash, source.semanticHash);
assert.notEqual(reordered.sourceTextHash, source.sourceTextHash);
assert.equal(createPcfReviewModel(reordered).semanticHash, review.semanticHash);

const invalidCoordinate = createPcfIntakeSource({
  sourceText: `${header}\nPIPE\nEND-POINT X 0 0 4\nEND-POINT 1000 0 0 4\n`,
});
assert.equal(invalidCoordinate.adoption.allowed, false);
assert.ok(invalidCoordinate.adoption.blockers.includes('PCF_COORD_INVALID_NUMBER'));
assert.throws(() => createPcfWorkspacePackage(invalidCoordinate));

const missingUnits = createPcfIntakeSource({ sourceText: `${firstPipe}\n` });
assert.equal(missingUnits.adoption.allowed, false);
assert.ok(missingUnits.adoption.blockers.includes('PCF_COORDINATE_UNITS_MISSING'));

const duplicate = createPcfIntakeSource({ sourceText: `${header}\n${firstPipe}\n${firstPipe}\n` });
assert.equal(duplicate.adoption.allowed, false);
assert.ok(duplicate.adoption.blockers.includes('PCF_DUPLICATE_CANONICAL_IDENTITY'));

const registryV5 = createWorkspaceConsumerRegistryV5();
const registryV6 = createWorkspaceConsumerRegistryV6();
assert.ok(validateWorkspaceConsumerRegistryV5(registryV5).ok);
assert.ok(validateWorkspaceConsumerRegistryV6(registryV6).ok);
assert.equal(registryV5.consumers.length, 11);
assert.equal(registryV6.consumers.length, 11);
assert.equal(descriptor(registryV5, CONSUMER_IDS.PCF).implementationStatus, IMPLEMENTATION_STATUS.RECOVERY_PENDING);
assert.equal(descriptor(registryV6, CONSUMER_IDS.PCF).implementationStatus, IMPLEMENTATION_STATUS.IMPLEMENTED);

const context = createWorkspaceConsumerContext({
  datasetId: null,
  workspaceVersion: 0,
  selectedEntityId: null,
  contracts: {},
});
const readiness = createWorkspaceConsumerReadinessRegistry(registryV6, context, { workspaceBooted: true });
const viewState = createApplicationViewStateV6(readiness, { activeViewId: CONSUMER_IDS.PCF });
assert.equal(viewState.activeViewId, CONSUMER_IDS.PCF);
assert.ok(validateApplicationViewStateV6(viewState).ok);

console.log('✅ W10.R2 PCF intake contracts, determinism, rejection and v6 evolution passed.');

function descriptor(registry, consumerId) {
  return registry.consumers.find((row) => row.consumerId === consumerId);
}

function assertDeepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.ok(Object.isFrozen(value), 'Expected reachable evidence to be frozen.');
  Object.values(value).forEach((child) => assertDeepFrozen(child, seen));
}
