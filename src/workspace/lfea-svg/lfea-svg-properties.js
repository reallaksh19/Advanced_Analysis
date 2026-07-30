/**
 * LFEA SVG Property Inspector Provider
 * Provides entity property sets for selected piping entities.
 */
import { asciiSort } from './lfea-svg-contracts.js';

export const LFEA_SVG_PROPERTY_PROVIDER_SCHEMA = 'EngineeringSvgPropertyProvider.v1';

export function createLfeaSvgPropertyProvider({ model = null } = {}) {
  function getPropertySets(selectedIds = []) {
    if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
      return [];
    }
    const sorted = asciiSort(selectedIds);
    const sets = [];

    sorted.forEach((id) => {
      sets.push(Object.freeze({
        schema: 'EngineeringPropertySet.v1',
        entityId: id,
        category: 'Entity Properties',
        properties: Object.freeze([
          { name: 'Entity ID', value: String(id), type: 'string', readonly: true },
          { name: 'Selection State', value: 'Selected', type: 'string', readonly: true },
        ]),
      }));
    });

    return Object.freeze(sets);
  }

  return Object.freeze({
    schema: LFEA_SVG_PROPERTY_PROVIDER_SCHEMA,
    getPropertySets,
  });
}
