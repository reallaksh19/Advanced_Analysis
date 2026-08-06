import { semanticHash } from '../../core/shared-piping-model/index.js';
import { createPipeSegmentCatalogueBinding } from '../topology-edit/topology-edit-pipe-segment-contract.js';
import { topologyEditDiagnosticFingerprint } from '../topology-edit/professional/topology-edit-validation-diagnostics.js';
import {
  compileTypedStartRouteIntent,
  compileViewportStartRouteIntent,
} from '../topology-edit/authoring/topology-edit-start-route-intent.js';
import { createStartRoutePlan } from '../topology-edit/authoring/topology-edit-start-route-plan.js';
import { prepareStartRouteCandidate } from '../topology-edit/authoring/topology-edit-start-route-candidate.js';
import {
  cancelStartRoutePreview,
  createStartRoutePreview,
  createStartRouteValidation,
  executeStartRouteTransaction,
  redoStartRouteTransaction,
  undoStartRouteTransaction,
} from '../topology-edit/authoring/topology-edit-start-route-transaction.js';
import { createStartRouteValidationOperationPlan } from '../topology-edit/authoring/topology-edit-start-route-validation-plan.js';

export function startRouteCoordinateDatumHash(controller) {
  const dataset = controller.workspaceDataset;
  if (!dataset?.datasetId) throw new Error('Start Route coordinate dataset is unavailable.');
  return semanticHash({
    schema: 'TopologyEditCoordinateDatum.v1',
    datasetId: dataset.datasetId,
    coordinateSystem: dataset.nativeAuthoring?.coordinateSystem ?? null,
    axisTransform: dataset.axisTransform ?? null,
  });
}

export function startRouteExactSnapAcquisition(controller) {
  const result = controller.interactionControllerRuntime?.snapResult;
  if (result?.status !== 'RESOLVED' || result.compatibility !== 'EXACT'
    || result.candidateCount !== 1 || !result.snappedWorldPoint) {
    throw new RangeError('One current unambiguous EXACT deterministic snap is required.');
  }
  return {
    status: 'EXACT',
    ambiguityCount: 0,
    coordinateDatumHash: startRouteCoordinateDatumHash(controller),
    modelPointMm: result.snappedWorldPoint,
  };
}

export function startRoutePipeOptions(catalogue) {
  return (catalogue?.records ?? []).filter((row) => row.componentType === 'PIPE')
    .map((row) => ({
      recordId: row.recordId,
      label: `${row.recordId} · DN ${row.nominalSizeMm} · ${row.schedule} · ${row.materialSpecification}`,
    }));
}

export function compileStartRouteHudIntent({
  controller, values, startAcquisition, endAcquisition, catalogue,
}) {
  const common = {
    unitSystem: { length: 'MM', angle: 'DEG' },
    axisLock: values.axisLock,
    coordinateDatumHash: startRouteCoordinateDatumHash(controller),
    catalogueBinding: createPipeSegmentCatalogueBinding({
      catalogue,
      recordId: values.catalogueRecordId,
    }),
    segmentPolicy: {
      minimumLengthMm: values.minimumLengthMm,
      overlapToleranceMm: values.overlapToleranceMm,
    },
  };
  if (values.inputMode === 'VIEWPORT') {
    return compileViewportStartRouteIntent({
      ...common,
      startAcquisition,
      endAcquisition,
    });
  }
  return compileTypedStartRouteIntent({
    ...common,
    startPointMm: point(values, 'start'),
    endPointMm: point(values, 'end'),
  });
}

export async function prepareStartRouteAuthoring(input) {
  const intent = compileStartRouteHudIntent(input);
  const plan = createStartRoutePlan({ intent, session: input.controller.session });
  const candidate = await prepareStartRouteCandidate({
    plan,
    session: input.controller.session,
    catalogue: input.catalogue,
  });
  const preview = createStartRoutePreview({ plan, candidate });
  return { intent, plan, candidate, preview };
}

export async function validateStartRouteAuthoring({
  controller, validationClient, plan, candidate,
}) {
  const workerPlan = createStartRouteValidationOperationPlan({ plan, candidate });
  const result = await validationClient.validate({
    operationPlan: workerPlan,
    canonicalTopology: candidate.canonicalTopology,
    previousDiagnostics: controller.issues ?? [],
    performancePolicy: {
      fastPathBudgetMs: 16,
      warningBudgetMs: 100,
      hysteresisMs: 4,
    },
    blockingSeverities: ['HIGH'],
  });
  const validation = createStartRouteValidation({
    candidate,
    diagnostics: introducedDiagnostics(result.response.receipt),
  });
  return { validation, workerReceipt: result.response.receipt };
}

export async function applyStartRouteAuthoring(input) {
  return executeStartRouteTransaction({
    session: input.controller.session,
    plan: input.plan,
    candidate: input.candidate,
    preview: input.preview,
    validation: input.validation,
    catalogue: input.catalogue,
  });
}

export function cancelStartRouteAuthoring(controller, preview) {
  return preview && controller.session
    ? cancelStartRoutePreview({ preview, session: controller.session })
    : null;
}

export function undoStartRouteAuthoring(controller, transaction) {
  return undoStartRouteTransaction(controller.session, transaction);
}

export function redoStartRouteAuthoring(controller, transaction) {
  return redoStartRouteTransaction(controller.session, transaction);
}

function point(values, role) {
  return {
    x: values[`${role}X`],
    y: values[`${role}Y`],
    z: values[`${role}Z`],
  };
}
function introducedDiagnostics(receipt) {
  const inherited = new Set((receipt.baselineDiagnostics ?? []).map(
    topologyEditDiagnosticFingerprint,
  ));
  return (receipt.finalDiagnostics ?? []).filter((row) => (
    !inherited.has(topologyEditDiagnosticFingerprint(row))
  ));
}
