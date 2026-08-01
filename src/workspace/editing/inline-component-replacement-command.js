import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { clonePlain, freezeDeep, stringValue } from '../dataset-utils.js';
import { rebuildWorkspaceDataset } from '../dataset-adapter.js';
import { projectDataValue, validateProjectDataProfile } from '../project-data/project-data-contract.js';

export const INLINE_COMPONENT_REPLACEMENT_SCHEMA = 'inline-component-replacement-command/v1';

/**
 * Prepares a deterministic replacement after validating Project Data, source
 * geometry, piping-class checks, and exact component-master rows.
 */
export function prepareInlineComponentReplacement(dataset, selectedEntityId, profile, masterData) {
  const editingAudit = validateProjectDataProfile(profile, 'editing', activeHashes(dataset, masterData));
  if (!editingAudit.valid) throw blocker('PROJECT_DATA_INCOMPLETE', editingAudit.errors);
  const selection = projectDataValue(profile, 'editing.componentCatalogSelection');
  const target = dataset.entities.find((entity) => entity.entityId === selectedEntityId);
  if (!target || !matchesTarget(target, selection.target)) throw blocker('TARGET_SELECTION_MISMATCH', [{ selectedEntityId, expected: selection.target }]);
  const retired = selection.retireSourceRefs.map((reference) => findByReference(dataset, reference));
  if (retired.some((entity) => !entity)) throw blocker('RETIRE_SET_NOT_FOUND', [{ references: selection.retireSourceRefs }]);
  if (new Set(retired.map((entity) => entity.entityId)).size !== 3) throw blocker('RETIRE_SET_NOT_EXACTLY_THREE', []);
  const retained = selection.retainSourceRefs.map((reference) => findByReference(dataset, reference));
  if (retained.some((entity) => !entity)) throw blocker('RETAINED_IDENTITY_NOT_FOUND', [{ references: selection.retainSourceRefs }]);
  validateLineIdentity(target, selection);
  const lineListRow = validateLineList(target, profile, masterData?.lineList?.rawRows || []);
  const catalogRows = exactCatalogRows(selection, masterData?.weight?.rawRows || []);
  const pipingClassRows = validatePipingClass(target, profile, masterData?.pipingClass?.rawRows || []);
  const connectionToleranceMm = projectDataValue(profile, 'editing.connectionToleranceMm');
  validateSourceGeometry(retired, selection, connectionToleranceMm);
  validateRetainedConnectivity(retired, retained, selection, connectionToleranceMm);
  const masterChecks = freezeDeep({ lineListRow, pipingClassRows });
  const command = commandContract(dataset, target, retired, retained, selection, catalogRows, masterChecks, profile);
  const entities = replaceEntities(dataset.entities, retired, command);
  return freezeDeep({ command, previewDataset: rebuildWorkspaceDataset(dataset, entities, command.audit) });
}

function commandContract(dataset, target, retired, retained, selection, catalogRows, masterChecks, profile) {
  const identity = { datasetId: dataset.datasetId, targetEntityId: target.entityId, retiredEntityIds: retired.map((entity) => entity.entityId), catalogRows, masterChecks };
  const commandId = `inline-replacement:${semanticHash(identity).slice(0, 16)}`;
  return freezeDeep({
    schema: INLINE_COMPONENT_REPLACEMENT_SCHEMA,
    commandId,
    datasetId: dataset.datasetId,
    targetEntityId: target.entityId,
    targetName: selection.target,
    retiredEntityIds: retired.map((entity) => entity.entityId),
    retainedEntityIds: retained.map((entity) => entity.entityId),
    replacement: clonePlain(selection),
    catalogRows,
    masterChecks,
    audit: {
      commandId,
      sourceDatasetHash: dataset.sourceSha256,
      projectDataHash: semanticHash(profile),
      masterChecks,
      retired: retired.map(provenance),
      retained: retained.map(provenance),
      invariants: ['SOURCE_SNAPSHOT_IMMUTABLE', 'ENDPOINTS_PRESERVED', 'BRANCH_ANCESTRY_PRESERVED', 'RETAINED_IDENTITIES_PRESERVED', 'PHYSICAL_NON_OVERLAP_VALIDATED', 'RETAINED_CONNECTIVITY_VALIDATED'],
    },
  });
}

function replaceEntities(entities, retired, command) {
  const retiredIds = new Set(retired.map((entity) => entity.entityId));
  const byRole = new Map([
    [retired.find((entity) => referenceEndsWith(entity, command.replacement.retireSourceRefs[0])).entityId, ['upstreamFlange', command.catalogRows.flange]],
    [retired.find((entity) => referenceEndsWith(entity, command.replacement.retireSourceRefs[1])).entityId, ['downstreamFlange', command.catalogRows.flange]],
    [retired.find((entity) => matchesTarget(entity, command.targetName)).entityId, ['valve', command.catalogRows.valve]],
  ]);
  return entities.map((entity) => {
    if (!retiredIds.has(entity.entityId)) return entity;
    const [role, catalogRow] = byRole.get(entity.entityId);
    return replacementEntity(entity, role, catalogRow, command);
  });
}

function replacementEntity(source, role, catalogRow, command) {
  const valve = role === 'valve';
  const selected = valve ? command.replacement.valve : command.replacement.flange;
  const entityId = `${command.commandId}:${role}`;
  const dtxr = valve ? selected.description : stringValue(source.properties?.attributes?.DTXR);
  const attributes = {
    ...clonePlain(source.properties?.attributes || {}),
    NAME: valve ? command.targetName : `/${entityId}`,
    TYPE: valve ? 'VALV' : 'FLAN',
    ABORE: `${selected.dnMm}mm`, LBORE: `${selected.dnMm}mm`,
    RATING: String(selected.ratingClass), DTXR: dtxr,
    CATALOG_KEY: selected.catalogKey,
    CATALOG_MASS_KG: selected.massKg,
    CATALOG_LENGTH_MM: selected.lengthMm,
    REPLACEMENT_COMMAND_ID: command.commandId,
  };
  return freezeDeep({
    ...clonePlain(source), entityId, sourceEntityId: entityId,
    componentReference: entityId,
    name: valve ? `VALV ${command.targetName}` : `FLAN ${role}`,
    entityType: valve ? 'VALV' : 'FLAN', category: 'component',
    properties: { ...clonePlain(source.properties), identity: { entityId, sourceEntityId: entityId, name: attributes.NAME, entityType: attributes.TYPE, sourcePath: source.sourcePath }, attributes, editProvenance: { commandId: command.commandId, retiredEntityId: source.entityId, catalogRow } },
  });
}

function exactCatalogRows(selection, rows) {
  const valve = rows.filter((row) => stringValue(row.Type) === selection.valve.componentType
    && Number(row.DN) === selection.valve.dnMm && Number(row.Rating) === selection.valve.ratingClass
    && Number(row['RF-F/F']) === selection.valve.lengthMm && Number(row['RF/RTJ KG']) === selection.valve.massKg
    && /reduced bore/i.test(stringValue(row.TypeDesc)));
  const flange = rows.filter((row) => stringValue(row.Type).toLowerCase() === 'flg'
    && Number(row.DN) === selection.flange.dnMm && Number(row.Rating) === selection.flange.ratingClass
    && Number(row['RF-F/F']) === selection.flange.lengthMm && Number(row['RF/RTJ KG']) === selection.flange.massKg
    && /weldneck flange/i.test(stringValue(row.TypeDesc)));
  if (valve.length !== 1 || flange.length !== 1) throw blocker('CATALOG_MATCH_NOT_EXACT', [{ valveMatches: valve.length, flangeMatches: flange.length }]);
  return freezeDeep({ valve: clonePlain(valve[0]), flange: clonePlain(flange[0]) });
}

function validatePipingClass(target, profile, rows) {
  const mappings = projectDataValue(profile, 'topology.pipingClassMappings') || {};
  const mapping = mappings[target.pipingClass];
  if (!mapping?.validation?.approved) throw blocker('PIPING_CLASS_MAPPING_NOT_APPROVED', [{ pipingClass: target.pipingClass }]);
  if (!['NPS', 'rating', 'material'].every((check) => mapping.requiredChecks?.includes(check))) throw blocker('PIPING_CLASS_REQUIRED_CHECKS_INCOMPLETE', [{ requiredChecks: mapping.requiredChecks }]);
  const check = mapping.validation;
  const matches = rows.filter((row) => stringValue(row['Piping Class']) === mapping.masterClass
    && Number(row.Size) === Number(check.npsIn) && Number(row.Rating) === Number(check.ratingClass)
    && stringValue(row.PMSMat_Categories).toLowerCase() === stringValue(check.masterMaterialCategory).toLowerCase());
  if (!matches.length) throw blocker('PIPING_CLASS_CHECK_FAILED', [{ mapping }]);
  return freezeDeep(matches.map((row) => ({ sourceSheet: row._sourceSheet, sourceRowNumber: row._sourceRowNumber, pipingClass: row['Piping Class'], npsIn: Number(row.Size), ratingClass: Number(row.Rating), materialName: row.Material_Name, materialCategory: row.PMSMat_Categories, schedule: row.SCH, wallThicknessMm: Number(row['Wall thickness']) })));
}

function validateLineList(target, profile, rows) {
  const source = projectDataValue(profile, 'sourcesAndUnits.lineListSource');
  const mapping = projectDataValue(profile, 'topology.pipingClassMappings')?.[target.pipingClass];
  const matches = rows.filter((row) => row._sourceSheet === source?.sheet && Number(row._sourceRowNumber) === Number(source?.row));
  if (matches.length !== 1) throw blocker('LINE_LIST_ROW_NOT_EXACT', [{ sheet: source?.sheet, row: source?.row, matches: matches.length }]);
  const row = matches[0];
  const valid = stringValue(row.NAME) === target.lineKey && stringValue(row['Piping Class']) === target.pipingClass
    && Number(row['Nominal Pipe Size\r\ninch']) === Number(mapping?.validation?.npsIn)
    && stringValue(row.Material) === stringValue(mapping?.validation?.lineListMaterialCode);
  if (!valid) throw blocker('LINE_LIST_IDENTITY_CHECK_FAILED', [{ lineKey: target.lineKey, pipingClass: target.pipingClass, sourceRowNumber: row._sourceRowNumber }]);
  return freezeDeep({ sourceSheet: row._sourceSheet, sourceRowNumber: row._sourceRowNumber, lineKey: row.NAME, pipingClass: row['Piping Class'], npsIn: Number(row['Nominal Pipe Size\r\ninch']), materialCode: row.Material, service: row.Service });
}

function validateLineIdentity(target, selection) {
  if (target.nominalDiameterMm !== selection.valve.dnMm) throw blocker('NOMINAL_DIAMETER_MISMATCH', [{ source: target.nominalDiameterMm, catalog: selection.valve.dnMm }]);
  const rating = stringValue(target.properties?.attributes?.DTXR).match(/\b(\d+)#/i)?.[1];
  if (Number(rating) !== selection.valve.ratingClass) throw blocker('RATING_MISMATCH', [{ source: rating, catalog: selection.valve.ratingClass }]);
}

function validateSourceGeometry(retired, selection, toleranceMm) {
  const valve = retired.find((entity) => matchesTarget(entity, selection.target));
  const flanges = retired.filter((entity) => entity.entityType === 'FLAN');
  if (distance(valve) !== selection.valve.lengthMm || flanges.some((entity) => distance(entity) !== selection.flange.lengthMm)) {
    throw blocker('SOURCE_ENDPOINT_DIMENSION_MISMATCH', retired.map((entity) => ({ entityId: entity.entityId, lengthMm: distance(entity) })));
  }
  if (flanges.some((entity) => !/sch\s*80/i.test(stringValue(entity.properties?.attributes?.DTXR)))) throw blocker('FLANGE_SCHEDULE_EVIDENCE_MISSING', flanges.map(provenance));
  const axis = segmentAxis(valve);
  const intervals = retired.map((entity) => projectedInterval(entity, valve.properties.geometry.start, axis, toleranceMm));
  for (let left = 0; left < intervals.length; left += 1) for (let right = left + 1; right < intervals.length; right += 1) {
    if (Math.min(intervals[left].end, intervals[right].end) - Math.max(intervals[left].start, intervals[right].start) > toleranceMm) throw blocker('REPLACEMENT_GEOMETRY_OVERLAPS', [{ left: retired[left].entityId, right: retired[right].entityId }]);
  }
}

function validateRetainedConnectivity(retired, retained, selection, toleranceMm) {
  const valve = retired.find((entity) => matchesTarget(entity, selection.target));
  const upstreamFlange = retired.find((entity) => referenceEndsWith(entity, selection.retireSourceRefs[0]));
  const downstreamFlange = retired.find((entity) => referenceEndsWith(entity, selection.retireSourceRefs[1]));
  const upstreamGasket = retained.find((entity) => referenceEndsWith(entity, selection.retainSourceRefs[0]));
  const downstreamGasket = retained.find((entity) => referenceEndsWith(entity, selection.retainSourceRefs[1]));
  const support = retained.find((entity) => referenceEndsWith(entity, selection.retainSourceRefs[2]));
  const carrier = retained.find((entity) => entity.entityId === selection.retainSourceRefs[3]);
  const checks = [minimumEndpointDistance(upstreamFlange, upstreamGasket), minimumEndpointDistance(upstreamGasket, valve), minimumEndpointDistance(valve, downstreamGasket), minimumEndpointDistance(downstreamGasket, downstreamFlange), minimumEndpointDistance(valve, support)];
  if (checks.some((distanceMm) => distanceMm > toleranceMm) || !sameEndpointSet(valve, carrier, toleranceMm)) throw blocker('RETAINED_CONNECTIVITY_MISMATCH', [{ checks, toleranceMm }]);
}

function segmentAxis(entity) { const { start, end } = entity.properties.geometry; const length = distance(entity); return { x: (end.x - start.x) / length, y: (end.y - start.y) / length, z: (end.z - start.z) / length }; }
function projectedInterval(entity, origin, axis, toleranceMm) { const points = endpoints(entity); const projection = points.map((point) => (point.x - origin.x) * axis.x + (point.y - origin.y) * axis.y + (point.z - origin.z) * axis.z); const offAxis = points.map((point, index) => Math.hypot(point.x - origin.x - projection[index] * axis.x, point.y - origin.y - projection[index] * axis.y, point.z - origin.z - projection[index] * axis.z)); if (offAxis.some((value) => value > toleranceMm)) throw blocker('REPLACEMENT_GEOMETRY_NOT_COLLINEAR', [{ entityId: entity.entityId, offAxis }]); return { start: Math.min(...projection), end: Math.max(...projection) }; }
function endpoints(entity) { const geometry = entity?.properties?.geometry; return geometry?.start && geometry?.end ? [geometry.start, geometry.end] : []; }
function pointDistance(left, right) { return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z); }
function minimumEndpointDistance(left, right) { const distances = endpoints(left).flatMap((a) => endpoints(right).map((b) => pointDistance(a, b))); return distances.length ? Math.min(...distances) : Number.POSITIVE_INFINITY; }
function sameEndpointSet(left, right, toleranceMm) { const a = endpoints(left); const b = endpoints(right); return a.length === 2 && b.length === 2 && ((pointDistance(a[0], b[0]) <= toleranceMm && pointDistance(a[1], b[1]) <= toleranceMm) || (pointDistance(a[0], b[1]) <= toleranceMm && pointDistance(a[1], b[0]) <= toleranceMm)); }

function activeHashes(dataset, masterData) { return { dataset: dataset.sourceSha256 || '', lineList: masterData?.lineList?.sourceHash || '', pipingClass: masterData?.pipingClass?.sourceHash || '', componentWeight: masterData?.weight?.sourceHash || '' }; }
function matchesTarget(entity, target) { return entity?.name === target || entity?.name === `INST ${target}` || stringValue(entity?.properties?.attributes?.NAME) === target; }
function findByReference(dataset, reference) { return dataset.entities.find((entity) => referenceEndsWith(entity, reference)); }
function referenceEndsWith(entity, reference) { return [entity.componentReference, entity.sourceEntityId, entity.properties?.attributes?.REF, entity.properties?.attributes?.NAME].map(stringValue).some((value) => value.endsWith(reference)); }
function distance(entity) { const start = entity.properties?.geometry?.start; const end = entity.properties?.geometry?.end; return start && end ? Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z) : null; }
function provenance(entity) { return { entityId: entity.entityId, sourceEntityId: entity.sourceEntityId, componentReference: entity.componentReference, jsonPointer: entity.jsonPointer, branchId: entity.branchId }; }
function blocker(code, details) { const error = new Error(`${code}: ${JSON.stringify(details)}`); error.code = code; error.details = details; return error; }
