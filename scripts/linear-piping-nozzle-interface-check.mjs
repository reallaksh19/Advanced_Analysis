#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  compileLinearPipingInterfaceSet,
  sealInterfaceProfile,
} from '../src/core/linear-piping-interface/index.js';
import { cantileverCompilation } from './lfea-b3.3-solver-fixtures.mjs';

const compilation = cantileverCompilation();
const node = compilation.model.nodes.find((row) => row.nodeId === 'N-000120');
const dofMappings = compilation.model.constraints
  .filter((row) => row.nodeId === node.nodeId)
  .map((row) => ({
    dof: row.dof,
    behavior: row.behavior,
    constraintId: row.constraintId,
    stiffness: row.stiffness ?? null,
  }));
const profile = sealInterfaceProfile({
  schema: 'linear-piping-interface-profile/v1',
  profileId: 'LINEAR-PIPING-NOZZLE-INTERFACE-R1',
  basisTolerance: { value: 1e-12, source: 'PHASE-3-NOZZLE-FIXTURE' },
  positionTolerance: { value: 1e-12, source: 'PHASE-3-NOZZLE-FIXTURE' },
  offsetTolerance: { value: 1e-12, source: 'PHASE-3-NOZZLE-FIXTURE' },
  semanticHash: '',
});

const definition = {
  interfaceId: 'IF-NOZZLE-01',
  interfaceKind: 'NOZZLE',
  nodeId: node.nodeId,
  sourceEntityId: 'PIPINGELEMENT-14',
  supportBinding: null,
  basis: {
    origin: node.position,
    e1: { x: 1, y: 0, z: 0 },
    e2: { x: 0, y: 1, z: 0 },
    e3: { x: 0, y: 0, z: 1 },
  },
  referencePointGlobal: { x: 0.1, y: 0, z: 0 },
  leverReferenceToNodeLocal: { x: -0.1, y: 0, z: 0 },
  dofMappings,
  reportingSignConvention: 'FORCE_ON_INTERFACE_FROM_PIPE',
  sourceEvidence: {
    sourceId: 'PROJECT-EQUIPMENT-NOZZLE-REGISTER',
    sourceRevision: '01',
    sourceSemanticHash: 'fnv1a64:cdcdcdcdcdcdcdcd',
  },
  allowableProfileHash: 'fnv1a64:efefefefefefefef',
};

const set = compileLinearPipingInterfaceSet({
  compilation,
  supportAttachmentModel: null,
  restraintCapabilityModel: null,
  definitions: [definition],
  profile,
});

assert.equal(set.interfaces[0].interfaceKind, 'NOZZLE');
assert.equal(set.interfaces[0].supportBinding, null);
assert.equal(set.interfaces[0].allowableProfileHash, 'fnv1a64:efefefefefefefef');
assert.equal(set.supportAttachmentModelSemanticHash, null);
assert.equal(set.restraintCapabilityModelSemanticHash, null);
assert.ok(Object.isFrozen(set));

console.log('FEA-IF-09 PASS explicit nozzle interface binds frame, reference point, DOFs and allowable-profile identity');
