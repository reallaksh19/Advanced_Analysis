/** Shared pure construction helpers for governed visual components. */
import {
  createVisualComponent,
  createVisualDiagnostic,
  createVisualPrimitive,
  visualPrimitiveId,
} from './visual-geometry-contract.js';
import { sourcePaths, workspaceEntityIds } from './topology-edit-visual-policy.js';

export function visualPrimitive(entity, type, partRole, kind, parameters, evidence, policy) {
  return createVisualPrimitive({
    primitiveId: visualPrimitiveId(entity.id, partRole, policy.policyHash),
    canonicalEntityId: entity.id,
    canonicalType: type,
    modelRole: policy.modelRole,
    partRole,
    kind,
    sourcePaths: sourcePaths(entity, evidence),
    workspaceEntityIds: workspaceEntityIds(entity, evidence),
    parameters,
  });
}

export function visualComponent(entity, type, evidence, primitives, diagnostics) {
  return createVisualComponent({
    canonicalEntityId: entity.id,
    canonicalType: type,
    sourcePaths: sourcePaths(entity, evidence),
    workspaceEntityIds: workspaceEntityIds(entity, evidence),
    primitives,
    diagnostics,
  });
}

export function unresolvedVisualComponent(entity, type, evidence, code, message) {
  return visualComponent(entity, type, evidence, [], [
    visualDiagnostic(entity.id, code, message),
  ]);
}

export function diagnosticLinePrimitive(entity, type, start, end, evidence, policy, reason) {
  return visualPrimitive(entity, type, 'diagnostic-centerline', 'DIAGNOSTIC_CENTERLINE', {
    start,
    end,
    radiusMm: policy.diagnosticRadiusMm,
    reason,
  }, evidence, policy);
}

export function visualDiagnostic(entityId, code, message, details = {}) {
  return createVisualDiagnostic({
    code,
    severity: 'ERROR',
    message,
    canonicalEntityId: entityId,
    details,
  });
}

export function dimensionVisualDiagnostics(entityId, result) {
  return (result?.diagnostics || []).map((row) => createVisualDiagnostic({
    ...row,
    canonicalEntityId: entityId,
    sourceEvidenceIds: row.evidenceIds || row.sourceEvidenceIds || [],
  }));
}
