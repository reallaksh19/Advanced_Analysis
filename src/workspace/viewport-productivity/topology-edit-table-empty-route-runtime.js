export function topologyEditTableEmptyRoutePipeOptions(runtime) {
  const records = runtime.controller.professionalRuntime?.catalogue?.records ?? [];
  const options = records.filter((record) => record.componentType === 'PIPE');
  if (!runtime.emptyRouteValues.catalogueRecordId && options.length) {
    runtime.emptyRouteValues = {
      ...runtime.emptyRouteValues,
      catalogueRecordId: options[0].recordId,
    };
  }
  return options;
}

export function topologyEditTableEmptyRoutePhase(runtime) {
  return runtime.controller.authoringRuntime?.startRouteRuntime?.phase ?? 'IDLE';
}

export async function runTopologyEditTableEmptyRouteAction(runtime, kind) {
  const authoring = runtime.controller.authoringRuntime;
  if (!authoring || runtime.pending) return true;
  try {
    runtime.pending = true;
    runtime.error = null;
    if (kind === 'empty-route-preview') {
      authoring.activateStartRoute();
      writeTopologyEditTableEmptyRouteToAuthoring(runtime, authoring);
      await authoring.previewOperation();
    } else if (kind === 'empty-route-validate') {
      await authoring.validateOperation();
    } else if (kind === 'empty-route-apply') {
      await authoring.applyOperation();
    } else if (kind === 'empty-route-cancel') {
      authoring.clear(true, false);
    }
    runtime.error = authoring.error || null;
    runtime.message = authoring.message || 'First-pipe authoring state updated.';
  } catch (error) {
    runtime.error = errorMessage(error);
  } finally {
    runtime.pending = false;
    runtime.render();
  }
  return true;
}

export function writeTopologyEditTableEmptyRouteToAuthoring(runtime, authoring) {
  const values = {
    inputMode: 'TYPED',
    ...runtime.emptyRouteValues,
    axisLock: 'FREE',
    minimumLengthMm: '6',
    overlapToleranceMm: '0.001',
  };
  for (const [key, value] of Object.entries(values)) {
    const control = authoring.element?.querySelector(`[data-start-route-field="${key}"]`);
    if (!control) throw new Error(`First-pipe field ${key} is unavailable.`);
    control.value = String(value);
  }
  authoring.handleFieldChange();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
