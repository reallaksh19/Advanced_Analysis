import assert from 'node:assert/strict';
import {
  createNonFeaThermalAssignmentAuthority,
  createNonFeaThermalFreeMovementBasis,
  validateNonFeaThermalAssignmentAuthority,
  validateNonFeaThermalFreeMovementBasis,
} from '../src/core/non-fea-engineering-foundation/index.js';
import { buildBranchFixture, buildStraightFixture } from './w10.5-screening-fixtures.mjs';

const straight = buildStraightFixture({ lengthsM: [1, 1] });
const explicitProfile = thermalProjectProfile({
  temperatures: [
    temperature('TEMP-1', 'COMP-1', 'OPE', 120),
    temperature('TEMP-2', 'COMP-2', 'OPE', 80),
  ],
  expansions: [
    expansion('ALPHA-1', 'COMP-1', 12e-6),
    expansion('ALPHA-2', 'COMP-2', 12e-6),
  ],
});
const authority = createNonFeaThermalAssignmentAuthority({ projectDataProfile: explicitProfile });
assert.equal(authority.state, 'READY', JSON.stringify(authority.blockers));
assert.equal(validateNonFeaThermalAssignmentAuthority(authority).ok, true);
assert.equal(authority.installationTemperatureC, 20);
assert.equal(authority.temperatureAssignments.length, 2);
assert.equal(authority.expansionAssignments.length, 2);
assert.equal(authority.policy.fuzzySelectorPermitted, false);
assert.equal(authority.policy.implicitDefaultPermitted, false);

const basis = createNonFeaThermalFreeMovementBasis({
  sharedModel: straight.sharedModel,
  topologyGraph: straight.topologyGraph,
  thermalAssignmentAuthority: authority,
  requestedLoadCaseIds: ['OPE'],
});
const basisAgain = createNonFeaThermalFreeMovementBasis({
  sharedModel: straight.sharedModel,
  topologyGraph: straight.topologyGraph,
  thermalAssignmentAuthority: authority,
  requestedLoadCaseIds: ['OPE'],
});
assert.equal(basis.state, 'READY', JSON.stringify(basis.blockers));
assert.equal(validateNonFeaThermalFreeMovementBasis(basis).ok, true);
assert.equal(basis.semanticHash, basisAgain.semanticHash, 'thermal free-movement basis must be deterministic');
assert.equal(basis.components.length, 2);
assert.equal(basis.loadCases[0].state, 'READY');
assert(Math.abs(basis.components[0].freeMovementM[0] - 0.0012) < 1e-12);
assert(Math.abs(basis.components[1].freeMovementM[0] - 0.00072) < 1e-12);
assert(Math.abs(basis.loadCases[0].vectorSumM[0] - 0.00192) < 1e-12);
assert(basis.limitations.includes('COLD_SPRING_NOT_INCLUDED'));
assert(basis.limitations.includes('EQUIPMENT_BOUNDARY_MOTION_NOT_INCLUDED'));
assert.equal(basis.policy.implicitTemperatureInheritancePermitted, false);
assert.equal(basis.policy.calculationAuthorizationAuthority, false);

const legacyProfile = {
  revision: 8,
  thermoMechanicalBasis: {
    installationTemperatureC: evidence(20),
    operatingTemperaturesC: evidence({ OPE: 120 }),
    materialElasticProperties: evidence({ DEFAULT: { thermalExpansionPerC: 12e-6 } }),
  },
};
const legacyAuthority = createNonFeaThermalAssignmentAuthority({ projectDataProfile: legacyProfile });
assert.equal(legacyAuthority.state, 'BLOCKED');
assert(legacyAuthority.blockers.some((row) => row.code === 'THERMAL_TEMPERATURE_ASSIGNMENT_SCHEMA_REQUIRED'));
assert(legacyAuthority.blockers.some((row) => row.code === 'THERMAL_EXPANSION_ASSIGNMENT_SCHEMA_REQUIRED'));
assert.equal(legacyAuthority.temperatureAssignments.length, 0);
assert.equal(legacyAuthority.expansionAssignments.length, 0);

const incompleteAuthority = createNonFeaThermalAssignmentAuthority({
  projectDataProfile: thermalProjectProfile({
    temperatures: [temperature('TEMP-1', 'COMP-1', 'OPE', 120)],
    expansions: [expansion('ALPHA-1', 'COMP-1', 12e-6)],
  }),
});
assert.equal(incompleteAuthority.state, 'READY');
const incompleteBasis = createNonFeaThermalFreeMovementBasis({
  sharedModel: straight.sharedModel,
  topologyGraph: straight.topologyGraph,
  thermalAssignmentAuthority: incompleteAuthority,
  requestedLoadCaseIds: ['OPE'],
});
assert.equal(incompleteBasis.state, 'PARTIALLY_READY');
assert.equal(incompleteBasis.components.length, 1);
assert.equal(incompleteBasis.loadCases[0].state, 'BLOCKED');
assert(incompleteBasis.blockers.some((row) => row.code === 'THERMAL_TEMPERATURE_ASSIGNMENT_MISSING'));

const branch = buildBranchFixture();
const branchComponentKey = branch.topologyGraph.components[0].componentKey;
const branchAuthority = createNonFeaThermalAssignmentAuthority({
  projectDataProfile: thermalProjectProfile({
    temperatures: [temperature('TEMP-BRANCH', branchComponentKey, 'OPE', 120)],
    expansions: [expansion('ALPHA-BRANCH', branchComponentKey, 12e-6)],
  }),
});
const branchBasis = createNonFeaThermalFreeMovementBasis({
  sharedModel: branch.sharedModel,
  topologyGraph: branch.topologyGraph,
  thermalAssignmentAuthority: branchAuthority,
  requestedLoadCaseIds: ['OPE'],
});
assert.equal(branchBasis.state, 'BLOCKED');
assert(branchBasis.blockers.some((row) => row.code === 'THERMAL_BRANCH_PATH_DECOMPOSITION_REQUIRED'));
assert.equal(branchBasis.components.length, 0);

const duplicateAuthority = createNonFeaThermalAssignmentAuthority({
  projectDataProfile: thermalProjectProfile({
    temperatures: [
      temperature('T1', 'COMP-1', 'OPE', 120),
      temperature('T2', 'COMP-1', 'OPE', 121),
    ],
    expansions: [expansion('A1', 'COMP-1', 12e-6)],
  }),
});
assert.equal(duplicateAuthority.state, 'BLOCKED');
assert(duplicateAuthority.blockers.some((row) => row.code === 'THERMAL_TEMPERATURE_ASSIGNMENT_INVALID'));

console.log(JSON.stringify({
  check: 'non-fea-thermal-free-movement',
  status: 'PASS',
  exactEntityAssignmentsRequired: true,
  legacyFreeFormMapsBlocked: true,
  nonuniformTemperatureByComponent: true,
  analyticalFreeMovementVector: true,
  missingCoverageFailsClosed: true,
  branchPathDecompositionFailsClosed: true,
  duplicateAssignmentsFailClosed: true,
  coldSpringNotImplicit: true,
  equipmentMotionNotImplicit: true,
  authorizationAuthority: false,
  deterministic: true,
}, null, 2));

function thermalProjectProfile({ temperatures, expansions }) {
  return {
    revision: 8,
    thermoMechanicalBasis: {
      installationTemperatureC: evidence(20),
      operatingTemperaturesC: evidence({
        schema: 'non-fea-operating-temperature-assignment-set/v1',
        assignments: temperatures,
      }),
      materialElasticProperties: evidence({
        schema: 'non-fea-thermal-expansion-assignment-set/v1',
        assignments: expansions,
      }),
    },
  };
}
function temperature(assignmentId, entityId, loadCaseId, temperatureC) {
  return {
    assignmentId,
    selectorKind: 'ENTITY',
    entityId,
    loadCaseId,
    temperatureC,
    basis: 'SIMULATED_EXACT_ENTITY_TEMPERATURE',
  };
}
function expansion(assignmentId, entityId, thermalExpansionPerC) {
  return {
    assignmentId,
    selectorKind: 'ENTITY',
    entityId,
    thermalExpansionPerC,
    basis: 'SIMULATED_EXACT_ENTITY_MATERIAL',
  };
}
function evidence(value) {
  return { value, evidence: { source: 'SIMULATED-THERMAL-AUTHORITY' }, approved: true };
}
