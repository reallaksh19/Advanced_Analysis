import { getPipeDimensions } from '../../../core/geometry/pipeSchedules.js';
import { resolveNominalPipeSizeFromOutsideDiameter } from '../../../core/geometry/nominal-pipe-size-resolution.js';
import {
  RESOLUTION_KINDS,
  RESOLUTION_STATUSES,
  createConfiguredResolutionSession,
} from '../../../core/empirical-piping-mechanics/configured-resolution.js';
import { deepFreeze } from '../../../core/empirical-piping-mechanics/contracts.js';
import { semanticHash } from '../../../core/empirical-piping-mechanics/identity.js';
import { resolveSectionStates } from '../../../core/empirical-piping-mechanics/section.js';
import { buildBranchScheduleIndex, resolveNominalBoreMm } from './branch-schedule-resolution.js';
import { buildSourceRecordTargets, buildTopologyPositionTargets } from './pos-topology-crosswalk.js';

export const POS_SECTION_MATERIAL_SCHEMA = 'empirical-pos-section-material-state/v1';
export const POS_SECTION_MATERIAL_RECEIPT_SCHEMA = 'empirical-pos-section-material-receipt/v1';
const SECTION_TYPE = /^(PIPE|ELBO|BEND|FLAN|VALV|GASK|OLET|REDU|TEE|COUP|CAP|INST)$/;

/** One common immutable POS state for weight, stiffness, displacement and stress. */
export function resolvePosSectionMaterialStates(input) {
  if (!input?.sourceRoot) throw new TypeError('sourceRoot is required.');
  const scheduleIndex = buildBranchScheduleIndex(input.sourceRoot);
  const session = createConfiguredResolutionSession({
    projectDataRevision: input.projectDataRevision ?? 0,
    projectDataSemanticHash: input.projectDataSemanticHash ?? null,
    defaults: input.configuredDefaults ?? [],
  });
  const dimensionVerificationTolerancesMm = normalizeDimensionVerificationTolerances(
    input.dimensionVerificationTolerancesMm,
    Boolean(input.topologyXmlText),
  );
  const targets = input.topologyXmlText
    ? buildTopologyPositionTargets(input.topologyXmlText, scheduleIndex)
    : buildSourceRecordTargets(scheduleIndex, (record) => SECTION_TYPE.test(record.type));
  const rows = targets.map((target) => resolveTarget(
    target,
    session,
    input.projectId ?? null,
    dimensionVerificationTolerancesMm,
  ));
  const resolutionReceipt = session.receipt();
  const blockedRowCount = rows.filter((row) => row.status !== 'RESOLVED').length;
  const result = {
    schema: POS_SECTION_MATERIAL_RECEIPT_SCHEMA,
    status: blockedRowCount > 0 ? 'BLOCKED_MISSING_REQUIRED_INPUT'
      : resolutionReceipt.summary.configuredDefaultApplicationCount > 0
        ? 'CALCULATED_WITH_CONFIGURED_DEFAULTS' : 'CALCULATED_SOURCE_ONLY',
    targetAuthority: input.topologyXmlText ? 'TOPOLOGY_PIPINGELEMENT_POSITIONS' : 'ENRICHED_SOURCE_RECORDS',
    topologyElementCount: input.topologyXmlText ? targets.length : null,
    sourceRecordCount: scheduleIndex.items.length,
    dimensionVerificationTolerancesMm,
    dimensionVerificationStatusCounts: countBy(rows, (row) => row.dimensionVerification?.status),
    rows: Object.freeze(rows),
    resolvedRowCount: rows.length - blockedRowCount,
    blockedRowCount,
    branchScheduleSummary: scheduleIndex.summary,
    resolutionReceipt,
  };
  return deepFreeze({ ...result, semanticIdentity: semanticHash(result) });
}

function resolveTarget(target, session, projectId, verificationTolerances) {
  const record = target.record;
  const item = record?.item || {};
  const attrs = { ...(item.engineeringProperties || {}), ...(item.attributes || {}) };
  const enriched = item.enrichedAttributes || {};
  const entity = buildEntity(target, attrs, enriched, projectId);
  const values = {};
  const nominalSize = target.edge
    ? resolveNominalPipeSizeFromOutsideDiameter(
      target.edge.outsideDiameterMm,
      verificationTolerances.outsideDiameterMm,
    )
    : null;

  values.nominalBoreMm = resolveField(session, target.edge ? {
    field: 'section.nominalBoreMm', entity, unit: 'mm',
    value: nominalSize?.exact ? nominalSize.dn : null,
    kind: RESOLUTION_KINDS.CONFIGURED_DERIVATION,
    authority: 'TOPOLOGY_OD_TO_STANDARD_NOMINAL_SIZE',
    sourcePath: `${target.positionRef}.DIAMETER`,
    reason: 'Exact nominal size derived from the source-explicit topology outside diameter within the configured verification tolerance.',
    missing: nominalSize?.status || 'TOPOLOGY_OUTSIDE_DIAMETER_UNRESOLVED',
    validate: positive('Nominal bore must be positive.'),
    affected: ['SECTION_LOOKUP', 'WEIGHT', 'STIFFNESS', 'STRESS'],
  } : {
    field: 'section.nominalBoreMm', entity, unit: 'mm',
    value: record ? resolveNominalBoreMm(item) : null,
    kind: RESOLUTION_KINDS.SOURCE_EXPLICIT,
    authority: 'SOURCE_NOMINAL_BORE', sourcePath: sourcePath(target, 'nominal bore'),
    missing: record ? 'SOURCE_NOMINAL_BORE_UNRESOLVED' : 'SOURCE_RECORD_UNMATCHED',
    validate: positive('Nominal bore must be positive.'),
    affected: ['SECTION_LOOKUP', 'WEIGHT', 'STIFFNESS', 'STRESS'],
  });
  values.schedule = session.resolve({
    field: 'section.schedule', entity: addScope(entity, { nominalBoreMm: read(values.nominalBoreMm) }),
    candidates: scheduleCandidates(record, target.scheduleEvidence),
    sourceMissingReason: target.scheduleEvidence?.status || (record ? 'SOURCE_SCHEDULE_UNRESOLVED' : 'SOURCE_RECORD_UNMATCHED'),
    validate: text('Schedule must be a non-empty string.'),
    affectedCalculations: ['SECTION_LOOKUP', 'WEIGHT', 'STIFFNESS', 'STRESS'],
  });
  const dn = read(values.nominalBoreMm);
  const schedule = read(values.schedule);
  const lookup = dn != null && schedule != null ? getPipeDimensions(dn, schedule) : null;
  const topologyDimensions = validTopologyDimensions(target.edge)
    ? {
      outsideDiameterMm: target.edge.outsideDiameterMm,
      wallThicknessMm: target.edge.wallThicknessMm,
      nps: nominalSize?.nps ?? lookup?.nps ?? null,
    }
    : null;
  const effectiveDimensions = topologyDimensions || (lookup?.exact
    ? { outsideDiameterMm: lookup.od, wallThicknessMm: lookup.wt, nps: lookup.nps }
    : null);

  values.dimensionsMm = resolveField(session, {
    field: 'section.dimensionsMm', entity: addScope(entity, { nominalBoreMm: dn, schedule }), unit: 'mm',
    value: effectiveDimensions,
    kind: topologyDimensions ? RESOLUTION_KINDS.SOURCE_EXPLICIT : RESOLUTION_KINDS.CONFIGURED_DERIVATION,
    authority: topologyDimensions ? 'TOPOLOGY_DIAMETER_AND_WALL_THICKNESS'
      : lookup?.source?.id || 'ENGINEERING_PIPE_SCHEDULE_DATASET',
    sourcePath: topologyDimensions ? `${target.positionRef}.DIAMETER|WALL_THICK`
      : `getPipeDimensions(DN=${dn}, schedule=${schedule})`,
    reason: topologyDimensions
      ? 'Source-explicit topology OD and wall are the calculation section authority.'
      : 'Exact schedule-dataset lookup from resolved nominal bore and schedule.',
    missing: topologyDimensions ? 'TOPOLOGY_DIMENSIONS_INVALID'
      : lookup?.diagnostics?.map((row) => row.code).join(',') || 'PIPE_DIMENSION_LOOKUP_UNRESOLVED',
    validate: dimensions,
    affected: ['SECTION_PROPERTIES', 'WEIGHT', 'STIFFNESS', 'STRESS'],
  });
  const dimensionVerification = verifyDimensions({
    topologyDimensions,
    lookup,
    dn,
    schedule,
    tolerances: verificationTolerances,
  });
  values.dimensionVerification = resolveField(session, {
    field: 'section.dimensionVerification', entity: addScope(entity, { nominalBoreMm: dn, schedule }),
    value: dimensionVerification,
    kind: RESOLUTION_KINDS.CONFIGURED_DERIVATION,
    authority: 'SOURCE_SECTION_VS_SCHEDULE_MASTER_VERIFICATION',
    sourcePath: `topology-vs-getPipeDimensions(DN=${dn}, schedule=${schedule})`,
    reason: dimensionVerification.message,
    missing: dimensionVerification.status,
    validate: (value) => value?.acceptable === true ? true : value?.message || 'Source dimensions do not agree with the schedule master.',
    affected: ['SECTION_QUALITY_GATE', 'WEIGHT', 'STIFFNESS', 'STRESS'],
  });

  values.materialFamily = resolveField(session, {
    field: 'material.family', entity,
    value: first([enriched.materialFamily, enriched.material, attrs.MATERIAL_FAMILY, attrs.MATERIAL, attrs.MATM}οή…ªμ¶»§q«^