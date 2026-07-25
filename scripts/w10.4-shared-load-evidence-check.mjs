import assert from 'node:assert/strict';
import { normalizeWorkspaceDataset } from '../src/workspace/dataset-adapter.js';

const source = {
  schema: 'inputxml-managed-stage/v1',
  packageHash: 'W10.4-EVIDENCE',
  unit: 'mm',
  objects: [{
    id: 'VALVE-COG',
    name: 'Valve COG',
    type: 'VALVE',
    sourcePath: '/MODEL/VALVE-COG',
    sourceAttributes: {
      COMPONENT_WEIGHT_KG: 12,
      COG_X: 100,
      COG_Y: 200,
      COG_Z: 300,
      POINT_MOMENT_NM: 45,
      POINT_MOMENT_AXIS: 'LOCAL_Z',
    },
  }],
};
const before = JSON.stringify(source);
const dataset = normalizeWorkspaceDataset(source, 'w10.4-evidence.json');
const valve = dataset.sharedModel.components.find((row) => row.sourceEntityId === 'VALVE-COG');
assert(valve);
assert.deepEqual(valve.loadEvidence.componentCog.value, { x: 100, y: 200, z: 300 });
assert.equal(valve.loadEvidence.componentCog.unit, 'mm');
assert(valve.loadEvidence.componentCog.axes.x.sourcePath.includes('COG_X'));
assert.equal(valve.loadEvidence.explicitPointMomentNm.value, 45);
assert.equal(valve.loadEvidence.explicitPointMomentNm.unit, 'N*m');
assert.equal(valve.loadEvidence.momentAxis.value, 'LOCAL_Z');
assert.equal(JSON.stringify(source), before);
assert(Object.isFrozen(dataset.sharedModel));
console.log('W10.4 shared load-evidence preservation checks passed.');
