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

const LAFEA_BUILDERS = Object.freeze({
  'LAFEA.1': lafea1Source,
  'LAFEA.2': lafea2Source,
  'LAFEA.3': lafea3Source,
  'LAFEA.4': lafea4Source,
  'LAFEA.5': lafea5Source,
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
