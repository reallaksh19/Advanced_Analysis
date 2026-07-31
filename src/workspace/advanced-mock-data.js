/**
 * Provides deterministic [SIMULATED] inputs for interactive UI checks.
 *
 * These builders reuse qualified fixture constructors, but the returned values
 * are demonstration inputs only. They are passed through the same import and
 * validation boundaries as user-supplied files; no fallback calculation exists.
 */
import { sourceFixture as lafea1Source } from '../../scripts/lafea.1-fixtures.mjs';
import { screeningRequestFixture as lafea2Source } from '../../scripts/lafea.2-fixtures.mjs';
import { triangleSource as lafea3Source } from '../../scripts/lafea.3-fixtures.mjs';
import { triangleSource as lafea4Source } from '../../scripts/lafea.4-fixtures.mjs';
import { workflowSource as lafea5Source } from '../../scripts/lafea.5-fixtures.mjs';
import { rectangularQ4Package } from '../../scripts/lfea-005-fixtures.mjs';
import { lafeaPreviewGeometry } from './lafea-stage-preview.js';

function lafea6Source() {
  return {
    schema: 'lafea-weld-profile/v1',
    identity: 'WELD-PROFILE-STANDARD-001',
    profileType: 'I_BEAM_FILLET',
    weldThroatMm: 8.0,
    allowableShearMpa: 110.0,
    eccentricLoadN: 50000,
    leverArmDistanceMm: 450.0,
    nodes: [
      { nodeId: 'W1', x: 175, y: 150 },
      { nodeId: 'W2', x: 425, y: 150 },
      { nodeId: 'W3', x: 425, y: 210 },
      { nodeId: 'W4', x: 330, y: 210 },
      { nodeId: 'W5', x: 330, y: 390 },
      { nodeId: 'W6', x: 425, y: 390 },
      { nodeId: 'W7', x: 425, y: 450 },
      { nodeId: 'W8', x: 175, y: 450 },
      { nodeId: 'CENTROID', x: 300, y: 300 },
      { nodeId: 'LEVER-LOAD-P', x: 750, y: 100 },
    ],
    elements: [
      { elementId: 'WELD-TOE-TOP', nodes: ['W1', 'W2'], type: 'FILLET_WELD' },
      { elementId: 'WELD-TOE-BOT', nodes: ['W8', 'W7'], type: 'FILLET_WELD' },
      { elementId: 'ARM-X', nodes: ['CENTROID', 'LEVER-LOAD-P'], type: 'LEVER_ARM_X' },
    ],
  };
}

const LAFEA_BUILDERS = Object.freeze({
  'LAFEA.1': lafea1Source,
  'LAFEA.2': lafea2Source,
  'LAFEA.3': lafea3Source,
  'LAFEA.4': lafea4Source,
  'LAFEA.5': lafea5Source,
  'LAFEA.6': lafea6Source,
});

/**
 * Create a linked Workspace and Load Calc demonstration package.
 *
 * @returns {Record<string, unknown>} Fresh inputxml-managed-stage/v1 package.
 */
export function createWorkspaceMockPackage() {
  return {
    schema: 'inputxml-managed-stage/v1',
    packageHash: 'SIMULATED-ADVANCED-WORKSPACE-V1',
    unit: 'mm',
    project: { name: '[SIMULATED] Advanced Analysis demonstration' },
    objects: [
      {
        id: 'SIM-PIPES',
        name: 'Demonstration pipes',
        type: 'BRANCH',
        children: [
          pipe('SIM-PIPE-A', [0, 0, 0], [1000, 0, 0]),
          pipe('SIM-PIPE-B', [1000, 0, 0], [2000, 0, 0]),
        ],
      },
      {
        id: 'SIM-SUPPORTS',
        name: 'Demonstration supports',
        type: 'GROUP',
        children: [
          support('SIM-SUPPORT-A', [0, 0, 0], 'SIM-PIPE-A:port:start'),
          support('SIM-SUPPORT-B', [2000, 0, 0], 'SIM-PIPE-B:port:end'),
        ],
      },
    ],
  };
}

export function createStaggeredMockPackage() {
  const children = [];
  
  // Realistic 3D routing:
  // Starts (0,0,0) -> +X -> (2000,0,0)
  // Drops -Z -> (2000,0,-1500)
  // Turns +Y -> (2000,3000,-1500)
  // Tee at +Y=1000, branches to +X -> (3000,1000,-1500)
  // Drops -Z -> (3000,1000,-3000)
  
  // Segment 1: East (+X)
  children.push(pipe('ROUTE-PIPE-1', [0, 0, 0], [2000, 0, 0]));
  children.push(support('ROUTE-SUPP-1', [500, 0, 0], 'ROUTE-PIPE-1:port:mid'));
  children.push({
    id: 'ROUTE-ELBO-1', name: 'Elbow 1', type: 'ELBO', sourcePath: `/SIM/ELBO/1`, sourceAttributes: { POS: {x: 2000, y: 0, z: 0} }
  });

  // Segment 2: Down (-Z)
  children.push(pipe('ROUTE-PIPE-2', [2000, 0, 0], [2000, 0, -1500]));
  children.push({
    id: 'ROUTE-ELBO-2', name: 'Elbow 2', type: 'ELBO', sourcePath: `/SIM/ELBO/2`, sourceAttributes: { POS: {x: 2000, y: 0, z: -1500} }
  });

  // Segment 3: North (+Y)
  children.push(pipe('ROUTE-PIPE-3A', [2000, 0, -1500], [2000, 1000, -1500]));
  children.push({
    id: 'ROUTE-TEE-1', name: 'Tee 1', type: 'TEE', sourcePath: `/SIM/TEE/1`, sourceAttributes: { POS: {x: 2000, y: 1000, z: -1500} }
  });
  
  children.push(pipe('ROUTE-PIPE-3B', [2000, 1000, -1500], [2000, 3000, -1500]));
  children.push({
    id: 'ROUTE-VALV-1', name: 'Valve 1', type: 'VALV', sourcePath: `/SIM/VALV/1`, sourceAttributes: { POS: {x: 2000, y: 2000, z: -1500} }
  });
  children.push(support('ROUTE-SUPP-2', [2000, 3000, -1500], 'ROUTE-PIPE-3B:port:end'));

  // Segment 4: Branch East (+X)
  children.push(pipe('ROUTE-PIPE-4', [2000, 1000, -1500], [3000, 1000, -1500]));
  children.push({
    id: 'ROUTE-ELBO-3', name: 'Elbow 3', type: 'ELBO', sourcePath: `/SIM/ELBO/3`, sourceAttributes: { POS: {x: 3000, y: 1000, z: -1500} }
  });

  // Segment 5: Down (-Z)
  children.push(pipe('ROUTE-PIPE-5', [3000, 1000, -1500], [3000, 1000, -3000]));
  children.push(support('ROUTE-SUPP-3', [3000, 1000, -2500], 'ROUTE-PIPE-5:port:mid'));
  
  // Add some flanges
  children.push({
    id: 'ROUTE-FLAN-1', name: 'Flange 1', type: 'FLAN', sourcePath: `/SIM/FLAN/1`, sourceAttributes: { POS: {x: 3000, y: 1000, z: -3000} }
  });

  return {
    schema: 'inputxml-managed-stage/v1',
    packageHash: 'SIM-ROUTED-3D',
    unit: 'mm',
    project: { name: 'Realistic 3D Routed Pipe' },
    objects: [
      { id: 'ROUTE-ROOT', name: 'Main Route', type: 'BRANCH', children }
    ]
  };
}

/**
 * Create the default document for one LAFEA stage.
 *
 * @param {string} stageId Exact LAFEA.1 through LAFEA.5 identity.
 * @returns {Record<string, unknown>} Fresh stage input.
 */
export function createLafeaMockDocument(stageId) {
  const builder = LAFEA_BUILDERS[stageId];
  if (!builder) throw new TypeError(`No [SIMULATED] LAFEA input exists for ${stageId}.`);
  return structuredClone(builder());
}

/**
 * Create a hash-valid Q4 package for every LFEA editor collection.
 *
 * @returns {Record<string, unknown>} Fresh lfea-mesh-package/v1 input.
 */
export function createLfeaMockPackage() {
  return structuredClone(rectangularQ4Package({}));
}

function pipe(id, startPoint, endPoint) {
  return {
    id,
    name: id,
    type: 'PIPE',
    sourcePath: `/SIMULATED/PIPES/${id}`,
    sourceAttributes: {
      LINE_ID: 'SIM-LINE-1',
      SYSTEM_ID: 'SIM-SYSTEM-1',
      EI_N_M2: 2000000,
      UNIT_PIPE_WEIGHT_KG_PER_M: 10,
      INSULATION_THICKNESS_MM: 30,
      INSULATION_DENSITY_KG_M3: 120,
      FLUID_WT_OPE_KG_M: 2,
      FLUID_WT_HYD_KG_M: 3,
    },
    nativeParams: { startPoint, endPoint },
  };
}

function support(id, position, attachedPortId) {
  return {
    id,
    name: id,
    type: 'SUPPORT',
    sourcePath: `/SIMULATED/SUPPORTS/${id}`,
    sourceAttributes: {
      LINE_ID: 'SIM-LINE-1',
      SYSTEM_ID: 'SIM-SYSTEM-1',
      POS: { x: position[0], y: position[1], z: position[2] },
      ATTACHED_PORT_ID: attachedPortId,
      SUPPORT_TYPE: 'ANCHOR',
      VERTICAL_CAPABILITY: 'RESTRAINED',
    },
  };
}
