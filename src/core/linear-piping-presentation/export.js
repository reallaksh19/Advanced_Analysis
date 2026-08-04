import {
  canonicalPrettyStringify,
  semanticHash,
} from '../shared-piping-model/canonical-json.js';
import { deepFreeze } from '../shared-piping-model/immutable.js';
import {
  failPresentation,
  requireCurrentLinearPipingPresentation,
} from './contracts.js';

export const EXPORT_RECORD_SCHEMA = 'linear-piping-export-record/v1';

export function createLinearPipingAuditJsonExport(presentation, applicationResult) {
  const accepted = requireCurrentLinearPipingPresentation(presentation, applicationResult);
  const content = canonicalPrettyStringify(accepted);
  return sealExportRecord({
    role: 'CURRENT_AUDIT_EVIDENCE',
    fileName: `${safeName(accepted.applicationId)}-piping-audit.json`,
    mediaType: 'application/json',
    applicationId: accepted.applicationId,
    presentationSemanticHash: accepted.semanticHash,
    qualificationStatus: accepted.status,
    content,
  });
}

export function createQualifiedLinearPipingEngineeringExports(presentation, applicationResult) {
  const accepted = requireCurrentLinearPipingPresentation(presentation, applicationResult);
  if (accepted.exportEligibility !== 'ENGINEERING_EXPORT_ALLOWED') {
    failPresentation(
      'Engineering issue exports require a CURRENT QUALIFIED application with no unconfigured nozzle profiles.',
      'PIPING_PRESENTATION_ENGINEERING_EXPORT_BLOCKED',
      {
        status: accepted.status,
        exportEligibility: accepted.exportEligibility,
        notConfigured: accepted.notConfigured,
      },
    );
  }
  const base = safeName(accepted.applicationId);
  return deepFreeze([
    sealExportRecord({
      role: 'INTERFACE_LOADS_CSV',
      fileName: `${base}-interface-loads.csv`,
      mediaType: 'text/csv',
      applicationId: accepted.applicationId,
      presentationSemanticHash: accepted.semanticHash,
      qualificationStatus: accepted.status,
      content: interfaceCsv(accepted),
    }),
    sealExportRecord({
      role: 'NOZZLE_ASSESSMENTS_CSV',
      fileName: `${base}-nozzle-assessments.csv`,
      mediaType: 'text/csv',
      applicationId: accepted.applicationId,
      presentationSemanticHash: accepted.semanticHash,
      qualificationStatus: accepted.status,
      content: nozzleCsv(accepted),
    }),
    sealExportRecord({
      role: 'B31_CODE_RESULTS_CSV',
      fileName: `${base}-b31-code-results.csv`,
      mediaType: 'text/csv',
      applicationId: accepted.applicationId,
      presentationSemanticHash: accepted.semanticHash,
      qualificationStatus: accepted.status,
      content: codeCsv(accepted),
    }),
  ]);
}

function interfaceCsv(presentation) {
  const headers = [
    'application_id', 'presentation_hash', 'interface_id', 'interface_kind', 'node_id',
    'load_case_id', 'status', 'sign_convention', 'force_unit', 'moment_unit', 'length_unit',
    'fx_global', 'fy_global', 'fz_global', 'mx_node_global', 'my_node_global', 'mz_node_global',
    'fx_local', 'fy_local', 'fz_local', 'mx_reference_local', 'my_reference_local', 'mz_reference_local',
    'reference_x', 'reference_y', 'reference_z', 'frame_hash', 'result_hash',
    'recovery_hash', 'recovery_evidence_hash',
  ];
  const rows = presentation.interfaceRows.map((row) => [
    presentation.applicationId, presentation.semanticHash, row.interfaceId, row.interfaceKind, row.nodeId,
    row.loadCaseId, row.status, row.reportingSignConvention,
    row.units.force, row.units.moment, row.units.length,
    row.forceGlobal.x, row.forceGlobal.y, row.forceGlobal.z,
    row.momentAtNodeGlobal.x, row.momentAtNodeGlobal.y, row.momentAtNodeGlobal.z,
    row.forceLocal.x, row.forceLocal.y, row.forceLocal.z,
    row.momentAtReferenceLocal.x, row.momentAtReferenceLocal.y, row.momentAtReferenceLocal.z,
    row.referencePointGlobal.x, row.referencePointGlobal.y, row.referencePointGlobal.z,
    row.frameSemanticHash, row.resultSemanticHash, row.recoverySemanticHash, row.recoveryEvidenceHash,
  ]);
  return createCsvContent(headers, rows);
}

function nozzleCsv(presentation) {
  const headers = [
    'application_id', 'presentation_hash', 'profile_id', 'profile_hash', 'interface_id',
    'load_case_id', 'assessment_status', 'qualification_status', 'sign_convention',
    'force_unit', 'moment_unit', 'fx_local', 'fy_local', 'fz_local',
    'mx_reference_local', 'my_reference_local', 'mz_reference_local',
    'governing_term', 'governing_term_ratio', 'interaction_value', 'interaction_limit',
    'utilization', 'assessment_hash', 'assessment_evidence_hash',
  ];
  const rows = presentation.nozzleRows.map((row) => [
    presentation.applicationId, presentation.semanticHash, row.profileId, row.profileSemanticHash,
    row.interfaceId, row.loadCaseId, row.assessmentStatus, row.qualificationStatus,
    row.reportingSignConvention, row.units.force, row.units.moment,
    row.forceLocal.x, row.forceLocal.y, row.forceLocal.z,
    row.momentAtReferenceLocal.x, row.momentAtReferenceLocal.y, row.momentAtReferenceLocal.z,
    row.governingTerm.termId, row.governingTerm.value, row.interactionValue,
    row.interactionLimit, row.utilization, row.semanticHash, row.evidenceHash,
  ]);
  return createCsvContent(headers, rows);
}

function codeCsv(presentation) {
  const headers = [
    'application_id', 'presentation_hash', 'check_id', 'category', 'component_id',
    'code_point_id', 'combination_id', 'status', 'calculated_stress_pa',
    'allowable_stress_pa', 'utilization', 'governing_rule_id',
    'source_recovery_hashes', 'code_result_hash', 'code_result_evidence_hash',
  ];
  const rows = presentation.codeRows.map((row) => [
    presentation.applicationId, presentation.semanticHash, row.checkId, row.category,
    row.componentId, row.codePointId, row.combinationId, row.status,
    row.calculatedStress, row.allowableStress, row.utilization, row.governingRuleId,
    row.sourceRecoveryHashes.join('|'), row.semanticHash, row.evidenceHash,
  ]);
  return createCsvContent(headers, rows);
}

export function createCsvContent(headers, rows) {
  return `${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function csvCell(value) {
  const text = value === null || value === undefined
    ? ''
    : typeof value === 'number'
      ? numberText(value)
      : String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function numberText(value) {
  if (!Number.isFinite(value)) {
    failPresentation('CSV export encountered a non-finite number.', 'PIPING_PRESENTATION_EXPORT_NUMBER_INVALID');
  }
  return String(Object.is(value, -0) ? 0 : value);
}

function safeName(value) {
  const normalized = String(value).replace(/[^A-Za-z0-9._-]+/gu, '_');
  if (!normalized) {
    failPresentation('Application identity cannot form an export file name.', 'PIPING_PRESENTATION_EXPORT_NAME_INVALID');
  }
  return normalized;
}

export function sealExportRecord(input) {
  const contentHash = semanticHash({ mediaType: input.mediaType, content: input.content });
  return deepFreeze({
    schema: EXPORT_RECORD_SCHEMA,
    role: input.role,
    fileName: input.fileName,
    mediaType: input.mediaType,
    applicationId: input.applicationId,
    presentationSemanticHash: input.presentationSemanticHash,
    qualificationStatus: input.qualificationStatus,
    byteLength: new TextEncoder().encode(input.content).length,
    contentHash,
    content: input.content,
  });
}
