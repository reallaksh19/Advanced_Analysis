/**
 * LFEA Engineering SVG Adapter
 * Binds LFEA domain models and command gateway to shared EngineeringSvgAdapter contract.
 */
import { createEngineeringSvgAdapter } from './core/engineering-svg-adapter.js';
import { createEngineeringSvgCommandGateway } from './core/engineering-svg-command-gateway.js';

export function createLfeaEngineeringSvgAdapter({
  getScene,
  subscribeScene,
  getRevision,
  executeCommand,
  propertyProvider = null,
  snapProviders = [],
} = {}) {
  const commandGateway = executeCommand && getRevision
    ? createEngineeringSvgCommandGateway({
        getCurrentRevision: getRevision,
        execute: executeCommand,
      })
    : null;

  const accessMode = commandGateway ? 'editable' : 'read_only';

  return createEngineeringSvgAdapter({
    descriptor: {
      adapterId: 'LFEA-ENGINEERING-SVG-R1',
      domainType: 'LFEA_PIPE_STRESS',
      accessMode,
      projections: ['ISO', 'XY', 'XZ', 'YZ'],
      capabilities: {
        selection: true,
        properties: true,
        parity: false,
        editing: accessMode === 'editable',
      },
      metadata: {
        owner: 'lfea-workbench',
      },
    },
    getScene,
    subscribeScene,
    propertyProvider: propertyProvider || {
      schema: 'EngineeringSvgPropertyProvider.v1',
      getPropertySets: () => [],
    },
    snapProviders,
    commandGateway,
  });
}
