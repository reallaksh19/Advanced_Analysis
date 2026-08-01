import { semanticHash } from '../../core/shared-piping-model/canonical-json.js';
import { freezeDeep, stringValue } from '../dataset-utils.js';
import { projectDataEntry, projectDataValue, validateProjectDataProfile } from '../project-data/project-data-contract.js';

export const SUPPORT_LOAD_DISTRIBUTION_SCHEMA = 'support-load-distribution/v3';
export const EMPIRICAL_LOAD_METHOD = 'CHAINAGE_TRIBUTARY_SPAN_V2';

/**
 * Calculates vertical gravity reactions by route. Any missing Project Data,
 * mass evidence, support capability, attachment, or bracketing support blocks
 * the affected case; qualified partials remain completeness-audit data only.
 */
export function calculateSupportLoadDistribution(input) {
  assertInput(input);
  const activeHashes = masterHashes(input.masterData, input.dataset);
  const profileAudit = validateProjectDataProfile(input.profile, 'loads', activeHashes);
  const topologyAudit = validateProjectDataProfile(input.profile, 'topology', activeHashes);
  const globalBlockers = [...profileAudit.errors, ...topologyAudit.errors];
  const caseIds = projectDataValue(input.profile, 'loadCalculation.activeLoadCases') || [];
  const cases = caseIds.map((caseId) => calculateCase(String(caseId), input, globalBlockers));
  const sourceHash = input.dataset.sourceSha256 || null;
  return freezeDeep({
    schema: SUPPORT_LOAD_DISTRIBUTION_SCHEMA,
    method: EMPIRICAL_LOAD_METHOD,
    datasetId: input.dataset.datasetId,
    datasetVersion: input.dataset.version || null,
    hashes: {
      dataset: sourceHash,
      masters: activeHashes,
      projectDataProfile: semanticHash(input.profile),
      supportSiteModel: semanticHash(input.supportSiteModel),
      routePartitionModel: semanticHash(input.routePartitionModel),
    },
    sourceAxisBasis: 'Z_UP',
    verticalForceConvention: 'positive reaction opposes source-axis gravity',
    status: cases.length > 0 && cases.every((row) => row.status === 'CALCULATED') ? 'CALCULATED' : 'BLOCKED',
    loadCases: cases,
    freshness: { status: 'CURRENT', datasetId: input.dataset.datasetId, datasetVersion: input.dataset.version || null },
  });
}

function calculateCase(caseId, input, globalBlockers) {
  const state = createCaseState(caseId, globalBlockers);
  const entityById = new Map(input.dataset.entities.map((entity) => [entity.entityId, entity]));
  if (globalBlockers.length === 0) {
    input.routePartitionModel.routes.forEach((route) => calculateRoute(route, input, entityById, state));
  }
  const equilibrium = globalBlockers.length ? blockedEquilibrium() : equilibriumCheck(state, input.profile);
  if (globalBlockers.length === 0 && !equilibrium.passed) state.blockers.push(...equilibrium.blockers);
  const blocked = state.blockers.length > 0 || state.excludedInputs.length > 0;
  return freezeDeep({
    loadCaseId: caseId,
    status: blocked ? 'BLOCKED' : 'CALCULATED',
    verticalForceUnit: 'N',
    supportResults: supportResults(input.supportSiteModel, state, blocked),
    contributionLedger: state.ledger,
    excludedInputs: state.excludedInputs,
    blockers: dedupeRows(state.blockers),
    equilibrium,
    completenessAudit: {
      status: blocked ? 'PARTIAL_NOT_A_CALCULATED_REACTION' : 'COMPLETE',
      qualifiedAppliedForceN: state.ledger.length ? state.appliedForceN : null,
      qualifiedReactionCandidateN: state.ledger.length ? sum([...state.reactions.values()]) : null,
      qualifiedContributionCount: state.ledger.length,
      excludedContributionCount: state.excludedInputs.length,
    },
  });
}

function calculateRoute(route, input, entityById, state) {
  if (route.status !== 'READY') {
    state.blockers.push(...route.blockers.map((row) => ({ ...row, routeId: route.routeId })));
    return;
  }
  const edgeById = new Map(input.routePartitionModel.edges.map((edge) => [edge.entityId, edge]));
  const supports = routeSupports(route, input.supportSiteModel, edgeById, input.profile, state);
  if (supports.length < 2) {
    state.blockers.push({ code: 'ROUTE_REQUIRES_TWO_QUALIFIED_VERTICAL_SUPPORTS', routeId: route.routeId, qualifiedSupportCount: supports.length });
  }
  route.physicalEdgeIds.forEach((entityId) => {
    const entity = entityById.get(entityId);
    const edge = edgeById.get(entityId);
    const chainage = route.entityChainages.find((row) => row.entityId === entityId);
    if (!entity || !edge || !chainage || !Number.isFinite(chainage.pointMm)) {
      state.excludedInputs.push({ code: 'MISSING_ROUTE_CHAINAGE', routeId: route.routeId, entityId });
      return;
    }
    const mass = resolveCaseMass(entity, edge, state.caseId, input.profile);
    if (!mass.qualified) {
      state.excludedInputs.push({ ...mass.exclusion, routeId: route.routeId, entityId });
      return;
    }
    const forceN = mass.massKg * projectDataValue(input.profile, 'loadCalculation.gravityMPerS2')
      * projectDataValue(input.profile, 'loadCalculation.loadFactor');
    const allocations = edge.entityType === 'PIPE' && edge.lengthMm > 0
      ? distributeUniform(chainage.startMm, chainage.endMm, forceN, supports)
      : distributePoint(chainage.pointMm, forceN, supports);
    if (!allocations) {
      state.excludedInputs.push({ code: 'UNBRACKETED_ROUTE_LOAD', routeId: route.routeId, entityId, chainageMm: chainage.pointMm });
      return;
    }
    recordContribution(state, route, entity, chainage, mass, forceN, allocations);
  });
}

function resolveCaseMass(entity, edge, caseId, profile) {
  if (entity.entityType !== 'PIPE') return componentMass(entity, profile);
  const sections = projectDataValue(profile, 'loadCalculation.pipeSectionProperties') || {};
  const section = sections[entity.lineKey];
  if (!section) return excluded('MISSING_PIPE_SECTION', 'loadCalculation.pipeSectionProperties');
  const materialDensities = projectDataValue(profile, 'loadCalculation.materialDensitiesKgPerM3') || {};
  const materialDensity = materialDensities[section.materialCode];
  if (!positive(materialDensity)) return excluded('MISSING_MATERIAL_DENSITY', 'loadCalculation.materialDensitiesKgPerM3');
  if (!positive(section.outsideDiameterMm) || !positive(section.wallThicknessMm)) return excluded('INVALID_PIPE_SECTION', 'loadCalculation.pipeSectionProperties');
  const insideDiameterMm = section.outsideDiameterMm - (2 * section.wallThicknessMm);
  if (!positive(insideDiameterMm)) return excluded('INVALID_PIPE_INSIDE_DIAMETER', 'loadCalculation.pipeSectionProperties');
  const lengthM = edge.lengthMm / 1000;
  const metalKg = annulusAreaM2(section.outsideDiameterMm, insideDiameterMm) * lengthM * materialDensity;
  const insulation = insulationMass(section, entity, lengthM, profile);
  if (!insulation.qualified) return insulation;
  const fluid = fluidMass(caseId, section, entity, insideDiameterMm, lengthM, profile);
  if (!fluid.qualified) return fluid;
  return { qualified: true, massKg: metalKg + insulation.massKg + fluid.massKg, formula: { metalKg, insulationKg: insulation.massKg, fluidKg: fluid.massKg, lengthM, outsideDiameterMm: section.outsideDiameterMm, insideDiameterMm, projectDataSources: [sourceRef(profile, 'loadCalculation.pipeSectionProperties'), sourceRef(profile, 'loadCalculation.materialDensitiesKgPerM3'), insulation.source, fluid.source].filter(Boolean) } };
}

function insulationMass(section, entity, lengthM, profile) {
  const thickness = section.insulationThicknessMm;
  if (thickness === 0) return { qualified: true, massKg: 0, source: sourceRef(profile, 'loadCalculation.pipeSectionProperties') };
  if (!positive(thickness)) return excluded('MISSING_INSULATION_THICKNESS', 'loadCalculation.pipeSectionProperties');
  const densities = projectDataValue(profile, 'loadCalculation.insulationDensitiesKgPerM3') || {};
  const density = densities[entity.insulationCode];
  if (!positive(density)) return excluded('MISSING_INSULATION_DENSITY', 'loadCalculation.insulationDensitiesKgPerM3');
  return { qualified: true, massKg: annulusAreaM2(section.outsideDiameterMm + (2 * thickness), section.outsideDiameterMm) * lengthM * density, source: sourceRef(profile, 'loadCalculation.insulationDensitiesKgPerM3') };
}

function fluidMass(caseId, section, entity, insideDiameterMm, lengthM, profile) {
  if (caseId === 'EMPTY') return { qualified: true, massKg: 0, source: null };
  const path = caseId === 'OPE' ? 'loadCalculation.operatingFluidDensitiesKgPerM3' : 'loadCalculation.hydroFluidDensitiesKgPerM3';
  const densities = projectDataValue(profile, path) || {};
  const value = densities[entity.lineKey];
  const density = typeof value === 'number' ? value : value?.selected;
  if (!positive(density)) return excluded('MISSING_FLUID_DENSITY', path);
  return { qualified: true, massKg: Math.PI * insideDiameterMm ** 2 / 4e6 * lengthM * density, source: sourceRef(profile, path) };
}

function componentMass(entity, profile) {
  const weights = projectDataValue(profile, 'loadCalculation.componentWeightsKg') || {};
  const attributes = entity.properties?.attributes || {};
  const key = stringValue(attributes.CATALOG_KEY) || stringValue(entity.sourceEntityId);
  const qualifiedWeight = typeof weights[key] === 'object' ? weights[key]?.massKg : weights[key];
  if (!key || !positive(qualifiedWeight)) return excluded('MISSING_COMPONENT_MASS', 'loadCalculation.componentWeightsKg');
  const value = typeof weights[key] === 'object' ? weights[key].massKg : weights[key];
  return { qualified: true, massKg: Number(value), formula: { catalogKey: key, massKg: Number(value), projectDataSources: [sourceRef(profile, 'loadCalculation.componentWeightsKg')] } };
}

function routeSupports(route, supportModel, edgeById, profile, state) {
  const tolerance = projectDataValue(profile, 'topology.portMatchToleranceMm');
  const capabilities = projectDataValue(profile, 'topology.supportTypeCapabilities') || {};
  return supportModel.sites.flatMap((site) => {
    const vertical = site.assemblies.some((assembly) => assembly.members.some((member) => capabilities[member.sourceType]?.vertical === true));
    if (!vertical) return [];
    const chainageMm = projectPointToRoute(site.positionMm, route, edgeById, tolerance);
    if (!Number.isFinite(chainageMm)) return [];
    return [{ siteId: site.siteId, chainageMm }];
  }).sort((left, right) => left.chainageMm - right.chainageMm);
}

function projectPointToRoute(point, route, edgeById, tolerance) {
  for (const row of route.entityChainages) {
    const edge = edgeById.get(row.entityId);
    if (!edge || edge.pointComponent || edge.topologyCarrier || edge.lengthMm <= 0) continue;
    const projection = projectToSegment(point, edge.startMm, edge.endMm);
    if (projection.distanceMm > tolerance) continue;
    return row.sourceStartChainageMm + projection.ratio * (row.sourceEndChainageMm - row.sourceStartChainageMm);
  }
  return null;
}

function distributeUniform(startMm, endMm, forceN, supports) {
  const lower = Math.min(startMm, endMm); const upper = Math.max(startMm, endMm);
  const cuts = [lower, ...supports.map((row) => row.chainageMm).filter((value) => value > lower && value < upper), upper];
  const allocations = [];
  for (let index = 0; index < cuts.length - 1; index += 1) {
    const span = cuts[index + 1] - cuts[index];
    const pieceForce = forceN * span / Math.max(upper - lower, Number.EPSILON);
    const piece = distributePoint((cuts[index] + cuts[index + 1]) / 2, pieceForce, supports);
    if (!piece) return null;
    allocations.push(...piece);
  }
  return mergeAllocations(allocations);
}

function distributePoint(chainageMm, forceN, supports) {
  const exact = supports.find((support) => support.chainageMm === chainageMm);
  if (exact) return [{ siteId: exact.siteId, verticalForceN: forceN, chainageMm: exact.chainageMm }];
  const lower = [...supports].reverse().find((support) => support.chainageMm < chainageMm);
  const upper = supports.find((support) => support.chainageMm > chainageMm);
  if (!lower || !upper) return null;
  const span = upper.chainageMm - lower.chainageMm;
  return [
    { siteId: lower.siteId, verticalForceN: forceN * (upper.chainageMm - chainageMm) / span, chainageMm: lower.chainageMm },
    { siteId: upper.siteId, verticalForceN: forceN * (chainageMm - lower.chainageMm) / span, chainageMm: upper.chainageMm },
  ];
}

function recordContribution(state, route, entity, chainage, mass, forceN, allocations) {
  allocations.forEach((allocation) => state.reactions.set(allocation.siteId, (state.reactions.get(allocation.siteId) ?? 0) + allocation.verticalForceN));
  state.appliedForceN += forceN;
  state.appliedMomentNmm += forceN * chainage.pointMm;
  state.reactionMomentNmm += sum(allocations.map((allocation) => allocation.verticalForceN * allocation.chainageMm));
  state.ledger.push({ contributionId: `${state.caseId}:${entity.entityId}`, routeId: route.routeId, entityId: entity.entityId, source: { sourceEntityId: entity.sourceEntityId, jsonPointer: entity.jsonPointer, componentReference: entity.componentReference, masterRow: entity.properties?.editProvenance?.catalogRow || null }, massKg: mass.massKg, verticalForceN: forceN, chainageMm: chainage.pointMm, formula: mass.formula, allocations });
}

function supportResults(model, state, blocked) {
  return model.sites.map((site) => { const contributorIds = state.ledger.filter((row) => row.allocations.some((allocation) => allocation.siteId === site.siteId)).map((row) => row.contributionId); const reaction = state.reactions.get(site.siteId) ?? 0; return { supportSiteId: site.siteId, tags: site.tags, sourceAxisBasis: 'Z_UP', status: blocked ? 'BLOCKED' : 'CALCULATED', verticalForceN: blocked ? null : reaction, qualifiedReactionCandidateN: blocked && contributorIds.length === 0 ? null : reaction, contributorIds }; });
}

function equilibriumCheck(state, profile) {
  const tolerance = projectDataValue(profile, 'loadCalculation.equilibriumTolerances') || {};
  const reactionN = sum([...state.reactions.values()]);
  const reactionMomentNmm = state.reactionMomentNmm;
  const forceResidualN = reactionN - state.appliedForceN;
  const momentResidualNmm = reactionMomentNmm - state.appliedMomentNmm;
  const forceLimit = tolerance.forceN; const momentLimit = tolerance.momentNmm;
  const blockers = [];
  if (!positiveOrZero(forceLimit) || !positiveOrZero(momentLimit)) blockers.push({ code: 'MISSING_EQUILIBRIUM_TOLERANCE', projectDataPath: 'loadCalculation.equilibriumTolerances' });
  else if (Math.abs(forceResidualN) > forceLimit || Math.abs(momentResidualNmm) > momentLimit) blockers.push({ code: 'EQUILIBRIUM_CHECK_FAILED', forceResidualN, momentResidualNmm });
  return { status: blockers.length === 0 ? 'PASSED' : 'FAILED', passed: blockers.length === 0, appliedForceN: state.appliedForceN, reactionN, forceResidualN, appliedMomentNmm: state.appliedMomentNmm, reactionMomentNmm, momentResidualNmm, blockers };
}

function blockedEquilibrium() { return { status: 'NOT_RUN_PROJECT_DATA_BLOCKED', passed: false, appliedForceN: null, reactionN: null, forceResidualN: null, appliedMomentNmm: null, reactionMomentNmm: null, momentResidualNmm: null, blockers: [] }; }
function sourceRef(profile, path) { const entry = projectDataEntry(profile, path); return entry ? { projectDataPath: path, evidence: entry.evidence } : null; }
function createCaseState(caseId, blockers) { return { caseId, blockers: [...blockers], excludedInputs: [], ledger: [], reactions: new Map(), appliedForceN: 0, appliedMomentNmm: 0, reactionMomentNmm: 0 }; }
function excluded(code, projectDataPath) { return { qualified: false, exclusion: { code, projectDataPath } }; }
function annulusAreaM2(outerMm, innerMm) { return Math.PI * (outerMm ** 2 - innerMm ** 2) / 4e6; }
function projectToSegment(point, start, end) { const dx = end.x - start.x; const dy = end.y - start.y; const dz = end.z - start.z; const length2 = dx ** 2 + dy ** 2 + dz ** 2; const ratio = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / length2)); const projected = { x: start.x + ratio * dx, y: start.y + ratio * dy, z: start.z + ratio * dz }; return { ratio, distanceMm: Math.hypot(point.x - projected.x, point.y - projected.y, point.z - projected.z) }; }
function mergeAllocations(rows) { const map = new Map(); rows.forEach((row) => map.set(row.siteId, { ...row, verticalForceN: (map.get(row.siteId)?.verticalForceN ?? 0) + row.verticalForceN })); return [...map.values()]; }
function masterHashes(masterData, dataset) { return { dataset: dataset.sourceSha256 || '', lineList: masterData?.lineList?.sourceHash || '', pipingClass: masterData?.pipingClass?.sourceHash || '', componentWeight: masterData?.weight?.sourceHash || '' }; }
function dedupeRows(rows) { const seen = new Set(); return rows.filter((row) => { const key = JSON.stringify(row); if (seen.has(key)) return false; seen.add(key); return true; }); }
function positive(value) { return Number.isFinite(Number(value)) && Number(value) > 0; }
function positiveOrZero(value) { return Number.isFinite(Number(value)) && Number(value) >= 0; }
function sum(values) { return values.reduce((total, value) => total + value, 0); }
function assertInput(input) { if (!input?.dataset || !input.profile || !input.supportSiteModel || !input.routePartitionModel) throw new TypeError('Support load distribution requires dataset, profile, support-site model, and route-partition model.'); }
