import { deepFreeze } from '../../core/shared-piping-model/index.js';
import {
  projectDataValue,
  validateProjectDataProfile,
} from '../project-data/project-data-contract.js';

export const TOPOLOGY_EDIT_VIEWPORT_CONFIGURATION = 'TopologyEditViewportConfiguration.v1';
export const TOPOLOGY_EDIT_VIEWPORT_CONFIGURATION_REJECTION = 'TOPOLOGY_EDIT_VIEWPORT_CONFIGURATION_INVALID';

const REQUIRED_FIELDS = deepFreeze([
  'supportMarkerSize',
  'pickingRadius',
  'cameraFitMargin',
  'clickTimingMs',
  'doubleClickTimingMs',
  'clickTravelTolerancePx',
  'zoomRate',
  'navigationSensitivity',
  'perspectiveFovDeg',
  'meshRadialSegments',
  'cameraNearMm',
  'cameraFarMm',
]);

export function createTopologyEditViewportConfiguration(profile) {
  const audit = validateProjectDataProfile(profile, 'webgl', null);
  if (!audit.valid) {
    throw rejection(`Approved Project Data is invalid for WebGL: ${audit.errors.map((row) => `${row.path} ${row.code}`).join('; ')}.`);
  }
  return assertTopologyEditViewportConfiguration(Object.fromEntries(
    REQUIRED_FIELDS.map((field) => [field, projectDataValue(profile, `webglNavigation.${field}`)]),
  ));
}

export function assertTopologyEditViewportConfiguration(input) {
  if (!input || typeof input !== 'object') {
    throw rejection('Topology edit viewport configuration is required.');
  }
  const values = Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, Number(input[field])]));
  const missing = REQUIRED_FIELDS.filter((field) => !Number.isFinite(values[field]) || values[field] <= 0);
  if (missing.length) {
    throw rejection(`Positive approved values are required for ${missing.join(', ')}.`);
  }
  if (!Number.isInteger(values.meshRadialSegments)) {
    throw rejection('meshRadialSegments must be an integer.');
  }
  if (values.cameraFarMm <= values.cameraNearMm) {
    throw rejection('cameraFarMm must be greater than cameraNearMm.');
  }
  if (!(values.perspectiveFovDeg > 0 && values.perspectiveFovDeg < 180)) {
    throw rejection('perspectiveFovDeg must be greater than 0 and less than 180.');
  }
  return deepFreeze({
    schema: TOPOLOGY_EDIT_VIEWPORT_CONFIGURATION,
    ...values,
  });
}

function rejection(message) {
  const error = new Error(`${TOPOLOGY_EDIT_VIEWPORT_CONFIGURATION_REJECTION}: ${message}`);
  error.code = TOPOLOGY_EDIT_VIEWPORT_CONFIGURATION_REJECTION;
  return error;
}
