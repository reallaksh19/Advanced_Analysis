/**
 * Engineering SVG Adapter Core (Ported & Hardened for LFEA SVG)
 * Enforces ASCII sorting, non-numerical scene contracts, and editable command gateway.
 */
import { asciiSort } from '../lfea-svg-contracts.js';
import { ENGINEERING_SVG_COMMAND_GATEWAY_SCHEMA } from './engineering-svg-command-gateway.js';

export const ENGINEERING_SVG_ADAPTER_SCHEMA = 'EngineeringSvgAdapter.v1';
export const ENGINEERING_SVG_ADAPTER_ACCESS_MODE = Object.freeze({
  READ_ONLY: 'read_only',
  EDITABLE: 'editable',
});

function snapProviders(values = []) {
  if (!Array.isArray(values)) throw new TypeError('Engineering SVG adapter snap providers must be an array.');
  values.forEach((provider, index) => {
    if (!provider?.id || typeof provider.provide !== 'function') {
      throw new TypeError(`snapProviders[${index}] must expose id and provide function.`);
    }
  });
  const sorted = [...values].sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  const ids = sorted.map((provider) => provider.id);
  if (new Set(ids).size !== ids.length) throw new TypeError('Engineering SVG adapter snap provider IDs must be unique.');
  return Object.freeze(sorted);
}

function commandGateway(descriptor, value) {
  const editable = descriptor.accessMode === ENGINEERING_SVG_ADAPTER_ACCESS_MODE.EDITABLE;
  if (editable && (value?.schema !== ENGINEERING_SVG_COMMAND_GATEWAY_SCHEMA || typeof value.execute !== 'function')) {
    throw new TypeError('Editable engineering SVG adapters require EngineeringSvgCommandGateway.v1.');
  }
  if (!editable && value != null) {
    throw new TypeError('Read-only engineering SVG adapters cannot expose a command gateway.');
  }
  return value ?? null;
}

export function createEngineeringSvgAdapter(options = {}) {
  const descriptor = Object.freeze({
    adapterId: options.descriptor?.adapterId || 'LFEA-ENGINEERING-SVG-R1',
    domainType: options.descriptor?.domainType || 'LFEA_PIPE_STRESS',
    accessMode: options.descriptor?.accessMode || ENGINEERING_SVG_ADAPTER_ACCESS_MODE.EDITABLE,
    projections: Object.freeze(options.descriptor?.projections || ['ISO', 'XY', 'XZ', 'YZ']),
    capabilities: Object.freeze({
      selection: true,
      properties: true,
      parity: false,
      editing: options.descriptor?.accessMode === ENGINEERING_SVG_ADAPTER_ACCESS_MODE.EDITABLE,
      ...(options.descriptor?.capabilities || {}),
    }),
    metadata: Object.freeze({ owner: 'lfea-workbench', ...(options.descriptor?.metadata || {}) }),
  });

  if (typeof options.getScene !== 'function' || typeof options.subscribeScene !== 'function') {
    throw new TypeError('Engineering SVG adapters require getScene and subscribeScene functions.');
  }

  const providers = snapProviders(options.snapProviders || []);
  const gateway = commandGateway(descriptor, options.commandGateway);

  async function getScene() {
    return await options.getScene();
  }

  function subscribeScene(listener) {
    if (typeof listener !== 'function') throw new TypeError('Engineering SVG adapter listener must be a function.');
    return options.subscribeScene((value) => {
      listener(Object.freeze({
        type: 'sceneChanged',
        scene: value?.scene ?? value,
        reason: String(value?.reason || 'adapter-scene-update'),
      }));
    });
  }

  return Object.freeze({
    schema: ENGINEERING_SVG_ADAPTER_SCHEMA,
    descriptor,
    getScene,
    subscribeScene,
    propertyProvider: options.propertyProvider || null,
    commandGateway: gateway,
    snapProviders: providers,
  });
}
