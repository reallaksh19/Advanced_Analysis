import {
  topologyEditTableRowIdsForCanonicalSelection,
} from '../topology-edit/table/topology-edit-table-view-state.js';

/** Presentation-only bridge. Canonical selection remains owned by the existing editor store. */
export class TopologyEditTableCanvasCoordinator {
  constructor(controller, runtime) {
    if (!controller?.selectionCoordinator) {
      throw new TypeError('TopologyEditTableCanvasCoordinator: controller selectionCoordinator is required.');
    }
    if (!runtime) throw new TypeError('TopologyEditTableCanvasCoordinator: runtime is required.');
    this.controller = controller;
    this.runtime = runtime;
    this.lastSelectionHash = null;
    this.lastCanonicalHash = null;
  }

  tableSelection(action, rowIds, primaryRowId = null) {
    const projection = this.runtime.projection;
    if (!projection) return { disposition: 'IGNORED' };
    const rows = exactRows(projection, rowIds);
    const primary = primaryRowId
      ? exactRows(projection, [primaryRowId])[0]
      : rows.at(-1) ?? null;
    return this.controller.selectionCoordinator.requestCanonical(
      action,
      rows.map((row) => row.identity.canonicalId),
      'table',
      {
        primaryId: primary?.identity.canonicalId ?? null,
        anchorId: action === 'REPLACE' ? primary?.identity.canonicalId ?? null : undefined,
      },
    );
  }

  selectionChanged(payload) {
    const selection = payload?.selection;
    if (!selection || selection.selectionHash === this.lastSelectionHash) return;
    this.lastSelectionHash = selection.selectionHash;
    const projection = this.runtime.projection;
    if (!projection) return;
    const rowIds = topologyEditTableRowIdsForCanonicalSelection(
      projection,
      selection.canonicalIds,
    );
    const primaryRowId = projection.rows.find((row) => (
      row.identity.canonicalId === selection.primaryId
    ))?.rowId ?? null;
    const anchorRowId = projection.rows.find((row) => (
      row.identity.canonicalId === selection.anchorId
    ))?.rowId ?? null;
    this.runtime.applyCanonicalSelection({ rowIds, primaryRowId, anchorRowId });
  }

  canonicalChanged(canonical) {
    const canonicalHash = canonical?.canonicalTopologyHash ?? null;
    if (!canonicalHash || canonicalHash === this.lastCanonicalHash) return;
    this.lastCanonicalHash = canonicalHash;
    this.runtime.canonicalChanged(canonical);
  }

  reset() {
    this.lastSelectionHash = null;
    this.lastCanonicalHash = null;
  }
}

function exactRows(projection, rowIds) {
  const byId = new Map(projection.rows.map((row) => [row.rowId, row]));
  return [...new Set(rowIds ?? [])].map((rowId) => {
    const row = byId.get(rowId);
    if (!row) throw new RangeError(`TopologyEditTableCanvasCoordinator: unknown row ${rowId}.`);
    return row;
  });
}
