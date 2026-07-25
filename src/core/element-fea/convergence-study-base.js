import { deepFreeze } from '../shared-piping-model/immutable.js';
import { semanticHash } from '../shared-piping-model/canonical-json.js';
import { CONTINUUM_MODEL_SCHEMA, CONTINUUM_RESULT_SCHEMA, CONTINUUM_RESULT_SCHEMA_V2, ELEMENT_TYPES, FORMULATIONS } from './constants.js';
import { CONVERGENCE_STUDY_SCHEMA, POINT_QUANTITIES, RAW_STRESS_COMPONENTS } from './interpretation-constants.js';
import { deriveRegionMeshMetrics, refinementRatios } from './mesh-metrics.js';
import { recoverPointProbe, verifyProbeMapping } from './physical-probes.js';
export function createConvergenceStudy(input) {
  const source = record(input, 'convergence study');
  exactKeys(source, ['schema','studyIdentity','studyVersion','sourceSemanticHash','profile','canonicalProblem','probes','quantities','levels','singularFeatures','semanticHash'], 'convergence study');
  if (source.schema !== CONVERGENCE_STUDY_SCHEMA) throw new TypeError('Invalid fea-convergence-study/v1 schema.');
  const profile = normalizeProfile(source.profile); const canonicalProblem = normalizeCanonicalProblem(source.canonicalProblem);
  const probes = normalizeProbes(source.probes); const quantities = normalizeQuantities(source.quantities, probes);
  const orderedLevels = orderLevels(normalizeLevels(source.levels, canonicalProblem, probes, quantities, profile));
  const base = {
    schema: CONVERGENCE_STUDY_SCHEMA,
    studyIdentity: text(source.studyIdentity, 'studyIdentity'),
    studyVersion: text(source.studyVersion, 'studyVersion'),
    sourceSemanticHash: text(source.sourceSemanticHash, 'sourceSemanticHash'),
    profile,
    canonicalProblem,
    probes,
    quantities,
    levels: orderedLevels,
    refinementRatios: refinementRatios(orderedLevels.map((row) => ({ levelId: row.levelId, ...row.meshMetrics }))),
    singularFeatures: normalizeSingularFeatures(source.singularFeatures || [], canonicalProblem.sourceSemanticHash),
  };
  const hash = semanticHash(base);
  if (source.semanticHash !== undefined && source.semanticHash !== hash) throw new TypeError('Convergence study semantic hash mismatch.');
  return deepFreeze({ ...base, semanticHash: hash });
}
export function quantityHistory(study, quantity) {
  const rows = study.levels.map((level) => quantityAtLevel(study, level, quantity));
  return deepFreeze(rows.map((row, index) => ({ levelId: row.levelId, h: study.levels[index].meshMetrics.characteristicSize, value: row.value, location: row.location || null, evidence: row.evidence })));
}
function normalizeLevels(value, problem, probes, quantities, profile) {
  const rows = array(value, 'levels');
  if (rows.length < 3) throw new TypeError('A convergence study requires at least three mesh levels.');
  const normalized = rows.map((row) => normalizeLevel(row, problem, probes, quantities, profile));
  unique(normalized, 'levelId', 'level');
  unique(normalized, 'declaredOrder', 'declared level order');
  return normalized;
}
function normalizeLevel(value, problem, probes, quantities, profile) {
  const row = record(value, 'level');
  exactKeys(row, ['levelId','declaredOrder','sourceSemanticHash','modelIdentity','modelSemanticHash','resultIdentity','resultSemanticHash','model','result','studyRegion','geometryMappings','materialMappings','loadMappings','restraintMappings','probeMappings','quantityMappings'], 'level');
  validateModelResult(row.model, row.result, row.sourceSemanticHash);
  if (row.modelIdentity !== row.model.modelIdentity || row.modelSemanticHash !== row.model.semanticHash) throw new TypeError('Declared level model identity or hash is inconsistent.');
  if (typeof row.resultIdentity !== 'string' || !row.resultIdentity.trim() || row.resultSemanticHash !== row.result.semanticHash) throw new TypeError('Declared level result identity or hash is inconsistent.');
  validateProblemCompatibility(row, problem, quantities, profile);
  const studyRegion = normalizeRegion(row.studyRegion);
  const meshMetrics = deriveRegionMeshMetrics(row.model, studyRegion);
  const geometryMappings = normalizedMappings(row.geometryMappings, problem.geometryEntities, row.model.elements, 'geometry');
  const materialMappings = normalizedMappings(row.materialMappings, problem.materialEntities, row.model.materials, 'material');
  const loadMappings = normalizedLoadMappings(row.loadMappings, problem.loadEntities, row.model, row.result.loadCaseIdentity);
  const restraintMappings = normalizedConstraintMappings(row.restraintMappings, problem.restraintEntities, row.model);
  assertLevelMappingCoverage(row.model, studyRegion, geometryMappings, materialMappings, loadMappings, restraintMappings, row.result.loadCaseIdentity);
  const probeMappings = normalizeProbeMappings(row.probeMappings, probes, row, profile.coordinateResidualAbsolute);
  return {
    levelId: text(row.levelId, 'levelId'),
    modelIdentity: text(row.modelIdentity, 'level.modelIdentity'), modelSemanticHash: row.model.semanticHash,
    resultIdentity: text(row.resultIdentity, 'level.resultIdentity'), resultSemanticHash: row.result.semanticHash,
    declaredOrder: positiveInteger(row.declaredOrder, 'declaredOrder'),
    sourceSemanticHash: text(row.sourceSemanticHash, 'level.sourceSemanticHash'),
    model: row.model, result: row.result, studyRegion, meshMetrics,
    geometryMappings, materialMappings, loadMappings, restraintMappings, probeMappings,
    quantityMappings: normalizeQuantityMappings(row.quantityMappings || [], quantities),
  };
}
function orderLevels(levels) {
  const ordered = [...levels].sort((a, b) => b.meshMetrics.characteristicSize - a.meshMetrics.characteristicSize || compare(a.levelId, b.levelId));
  ordered.forEach((row, index) => { if (row.declaredOrder !== index + 1) throw new TypeError('Declared level order does not match characteristic mesh-size order; silent reclassification is prohibited.'); });
  for (let index = 1; index < ordered.length; index += 1) if (!(ordered[index - 1].meshMetrics.characteristicSize > ordered[index].meshMetrics.characteristicSize)) throw new TypeError('Characteristic mesh size must be strictly decreasing.');
  return ordered;
}
function validateProblemCompatibility(level, problem, quantities, profile) {
  const model = level.model; const result = level.result;
  if (model.solverProfile.formulation !== problem.formulation) throw new TypeError('Mesh levels use incomparable formulations.');
  if (JSON.stringify(model.solverProfile.units) !== JSON.stringify(problem.units)) throw new TypeError('Mesh levels use incomparable units.');
  if (result.loadCaseIdentity !== problem.loadCaseIdentity) throw new TypeError('Mesh levels use incomparable load-case identities.');
  compareTotals(result.appliedLoadTotals, problem.appliedLoadTotals, profile.comparabilityAbsolute);
  compareOutOfPlane(model, problem.outOfPlane, profile.comparabilityAbsolute);
  const requested = quantities.map((row) => row.quantityId).sort(compare);
  if (JSON.stringify(requested) !== JSON.stringify(problem.requestedQuantityIds)) throw new TypeError('Requested quantity identity is inconsistent with the canonical problem.');
}
function validateModelResult(model, result, levelHash) {
  if (model?.schema !== CONTINUUM_MODEL_SCHEMA) throw new TypeError('Study level model must be fea-continuum-model/v1.');
  if (![CONTINUUM_RESULT_SCHEMA, CONTINUUM_RESULT_SCHEMA_V2].includes(result?.schema) || result.status !== 'QUALIFIED' || result.qualifiedResults !== 'complete') throw new TypeError('Study level result must be a qualified LFEA result.');
  if (model.sourceSemanticHash !== levelHash || result.sourceSemanticHash !== levelHash) throw new TypeError('Study level source ancestry is stale or mixed.');
  if (model.semanticHash !== semanticHash(withoutHash(model))) throw new TypeError('Study level model semantic hash is stale.');
  if (result.semanticHash !== semanticHash(withoutHash(result))) throw new TypeError('Study level result semantic hash is stale.');
  if (result.modelSemanticHash !== model.semanticHash || result.modelEvidence?.semanticHash !== model.semanticHash) throw new TypeError('Study level model/result semantic hashes do not match.');
}
function normalizeCanonicalProblem(value) {
  const row = record(value, 'canonicalProblem');
  exactKeys(row, ['problemIdentity','sourceSemanticHash','formulation','units','loadCaseIdentity','appliedLoadTotals','outOfPlane','geometryEntities','materialEntities','loadEntities','restraintEntities','requestedQuantityIds'], 'canonicalProblem');
  if (!Object.values(FORMULATIONS).includes(row.formulation)) throw new TypeError('Canonical formulation is invalid.');
  const quantities = textArray(row.requestedQuantityIds, 'requestedQuantityIds');
  const normalized = {
    problemIdentity: text(row.problemIdentity, 'problemIdentity'),
    sourceSemanticHash: text(row.sourceSemanticHash, 'canonicalProblem.sourceSemanticHash'),
    formulation: row.formulation,
    units: normalizeUnits(row.units),
    loadCaseIdentity: text(row.loadCaseIdentity, 'loadCaseIdentity'),
    appliedLoadTotals: finiteTotals(row.appliedLoadTotals),
    outOfPlane: normalizeOutOfPlane(row.outOfPlane, row.formulation),
    geometryEntities: normalizeEntities(row.geometryEntities, 'geometry'),
    materialEntities: normalizeMaterialEntities(row.materialEntities),
    loadEntities: normalizeEntities(row.loadEntities, 'load'),
    restraintEntities: normalizeEntities(row.restraintEntities, 'restraint'),
    requestedQuantityIds: quantities,
  };
  assertCanonicalAncestry(normalized);
  return normalized;
}
function normalizeQuantities(value, probes) {
  const rows = array(value, 'quantities').map((row) => normalizeQuantity(row, probes));
  if (!rows.length) throw new TypeError('A convergence study requires at least one requested quantity.');
  unique(rows, 'quantityId', 'quantity');
  return rows.sort((a, b) => compare(a.quantityId, b.quantityId));
}
function normalizeQuantity(value, probes) {
  const row = record(value, 'quantity');
  const common = { quantityId: text(row.quantityId, 'quantityId'), quantityType: text(row.quantityType, 'quantityType'), sourceAuthority: text(row.sourceAuthority, 'sourceAuthority') };
  if (common.sourceAuthority !== 'RAW_QUALIFIED_RESULT') throw new TypeError('Projected or non-authoritative stress cannot be used for convergence quantities.');
  if (row.quantityType === 'POINT') return pointQuantity(row, common, probes);
  if (row.quantityType === 'REACTION_RESULTANT') return reactionQuantity(row, common);
  if (row.quantityType === 'STRAIN_ENERGY') return exactQuantityKeys(row, common, ['quantityId','quantityType','sourceAuthority']);
  if (row.quantityType === 'DISPLACEMENT_FUNCTIONAL') return exactQuantityKeys(row, common, ['quantityId','quantityType','sourceAuthority']);
  if (row.quantityType === 'MAX_RAW_STRESS') return maximumQuantity(row, common);
  throw new TypeError(`Unsupported convergence quantity type: ${row.quantityType}.`);
}
function quantityAtLevel(study, level, quantity) {
  if (quantity.quantityType === 'POINT') return pointValue(study, level, quantity);
  if (quantity.quantityType === 'REACTION_RESULTANT') return reactionValue(level, quantity);
  if (quantity.quantityType === 'STRAIN_ENERGY') return { levelId: level.levelId, value: finite(level.result.strainEnergy, 'strainEnergy'), evidence: { source: 'QUALIFIED_RESULT_GLOBAL_STRAIN_ENERGY' } };
  if (quantity.quantityType === 'DISPLACEMENT_FUNCTIONAL') return functionalValue(level, quantity);
  return maximumRawStress(level, quantity);
}
function pointValue(study, level, quantity) {
  const probe = study.probes.find((row) => row.probeId === quantity.probeId);
  const mapping = level.probeMappings.find((row) => row.probeId === quantity.probeId);
  const row = recoverPointProbe(level, probe, mapping, quantity.component, study.profile.coordinateResidualAbsolute);
  return { levelId: level.levelId, value: row.value, evidence: row };
}
function reactionValue(level, quantity) {
  const mapping = level.restraintMappings.filter((row) => quantity.restraintEntityIds.includes(row.entityId));
  const ids = new Set(mapping.flatMap((row) => row.targetIds));
  const equations = new Set(level.result.constraintPartition.constrainedEquations.filter((row) => ids.has(row.constraintId)).map((row) => row.equation));
  const reactions = level.result.reactions.filter((row) => equations.has(row.equation));
  if (!reactions.length) throw new TypeError('Reaction resultant mapping has no qualified reaction rows.');
  const nodeMap = new Map(level.model.nodes.map((row) => [row.nodeId, row]));
  const value = reactions.reduce((sum, row) => sum + reactionContribution(row, nodeMap.get(row.nodeId), quantity), 0);
  return { levelId: level.levelId, value, evidence: { constraintIds: [...ids].sort(compare), equations: [...equations].sort((a,b)=>a-b), component: quantity.component, referencePoint: quantity.referencePoint } };
}
function functionalValue(level, quantity) {
  const mapping = level.quantityMappings.find((row) => row.quantityId === quantity.quantityId);
  if (!mapping || !Array.isArray(mapping.terms) || !mapping.terms.length) throw new TypeError('Displacement functional requires explicit terms at every level.');
  const values = new Map(level.result.nodalDisplacements.map((row) => [`${row.nodeId}:${row.component}`, row.value]));
  const value = mapping.terms.reduce((sum, term) => { const displacement = values.get(`${term.nodeId}:${term.component}`); if (!Number.isFinite(displacement)) throw new TypeError('Displacement functional term is unavailable.'); return sum + term.coefficient * displacement; }, 0);
  return { levelId: level.levelId, value, evidence: { terms: mapping.terms } };
}
function maximumRawStress(level, quantity) {
  if (quantity.regionId !== level.studyRegion.regionId) throw new TypeError('Maximum raw-stress region mapping is inconsistent.');
  const elements = new Set(level.studyRegion.elementIds); const rows = rawStressRows(level.result, elements, quantity.component);
  if (!rows.length) throw new TypeError('Regional maximum raw stress has no eligible authoritative records.');
  const governing = [...rows].sort((a, b) => maximumCompare(a, b, quantity.maximumPolicy))[0];
  return { levelId: level.levelId, value: governing.value, location: governing, evidence: { regionId: level.studyRegion.regionId, authority: 'RAW_ELEMENT_OR_INTEGRATION_POINT_STRESS', maximumPolicy: quantity.maximumPolicy } };
}
function rawStressRows(result, elementIds, component) {
  if (!RAW_STRESS_COMPONENTS.includes(component)) throw new TypeError('Regional maximum requires a supported raw stress component.');
  if (result.schema === CONTINUUM_RESULT_SCHEMA) return result.elementStresses.filter((row) => elementIds.has(row.elementId)).map((row) => {
    const principal = result.principalStresses.find((item) => item.elementId === row.elementId);
    const vonMises = result.vonMisesStress.find((item) => item.elementId === row.elementId);
    return stressRow(row.elementId, 'T3_CONSTANT', row.values, row.sigmaZ, { principalStresses: principal?.values, inPlanePrincipalStresses: principal?.inPlane, vonMisesStress: vonMises?.value }, component);
  });
  return result.integrationPointResults.filter((row) => elementIds.has(row.elementId)).map((row) => stressRow(row.elementId, row.integrationPointId, row.stress, row.sigmaZ, row, component));
}
function stressRow(elementId, pointId, stress, sigmaZ, row, component) {
  const principal = row?.principalStresses || [...(row?.inPlanePrincipalStresses || []), sigmaZ].sort((a, b) => b - a);
  const values = { SX: stress[0], SY: stress[1], TXY: stress[2], SIGMA_Z: sigmaZ, VON_MISES: row?.vonMisesStress, PRINCIPAL_1: principal[0], PRINCIPAL_2: principal[1], PRINCIPAL_3: principal[2] };
  const value = values[component]; if (!Number.isFinite(value)) throw new TypeError(`Raw stress component ${component} is unavailable.`);
  return { elementId, integrationPointId: pointId, locationIdentity: `${elementId}:${pointId}`, value, globalCoordinates: row?.globalCoordinates || null };
}
function normalizeProfile(value) {
  const row = record(value, 'profile');
  exactKeys(row, ['coordinateResidualAbsolute','scalarAbsolute','relativeScaleFloor','constantRatioRelative','comparabilityAbsolute'], 'profile');
  return {
    coordinateResidualAbsolute: positive(row.coordinateResidualAbsolute, 'coordinateResidualAbsolute'),
    scalarAbsolute: positive(row.scalarAbsolute, 'scalarAbsolute'),
    relativeScaleFloor: positive(row.relativeScaleFloor, 'relativeScaleFloor'),
    constantRatioRelative: positive(row.constantRatioRelative, 'constantRatioRelative'),
    comparabilityAbsolute: positive(row.comparabilityAbsolute, 'comparabilityAbsolute'),
  };
}
function normalizeProbes(value) {
  const rows = array(value, 'probes').map((row) => {
    exactKeys(record(row, 'probe'), ['probeId','physicalCoordinates'], 'probe');
    return { probeId: text(row.probeId, 'probeId'), physicalCoordinates: point(row.physicalCoordinates, 'probe.physicalCoordinates') };
  });
  unique(rows, 'probeId', 'probe'); return rows.sort((a, b) => compare(a.probeId, b.probeId));
}
function normalizeProbeMappings(value, probes, level, tolerance) {
  const rows = array(value, 'probeMappings').map((row) => {
    exactKeys(record(row, 'probe mapping'), ['probeId','elementId','elementType','naturalCoordinates','areaCoordinates','reconstructedCoordinates','reconstructionResidual'], 'probe mapping');
    const base = { probeId: text(row.probeId, 'probeMapping.probeId'), elementId: text(row.elementId, 'probeMapping.elementId'), elementType: text(row.elementType, 'probeMapping.elementType'), reconstructedCoordinates: point(row.reconstructedCoordinates, 'probeMapping.reconstructedCoordinates'), reconstructionResidual: finite(row.reconstructionResidual, 'probeMapping.reconstructionResidual') };
    if (row.elementType === ELEMENT_TYPES.Q4) {
      if (row.areaCoordinates !== undefined || row.naturalCoordinates === undefined) throw new TypeError('Q4 probe mappings require only natural coordinates.');
      base.naturalCoordinates = pointNatural(row.naturalCoordinates);
    } else if (row.elementType === ELEMENT_TYPES.T3) {
      if (row.naturalCoordinates !== undefined || row.areaCoordinates === undefined) throw new TypeError('T3 probe mappings require only area coordinates.');
      base.areaCoordinates = [...row.areaCoordinates];
    } else throw new TypeError('Probe mapping element type is unsupported.');
    if (base.reconstructionResidual < 0) throw new TypeError('Probe reconstruction residual cannot be negative.');
    return base;
  });
  unique(rows, 'probeId', 'probe mapping');
  if (JSON.stringify(rows.map((row) => row.probeId).sort(compare)) !== JSON.stringify(probes.map((row) => row.probeId))) throw new TypeError('Every probe must have exactly one mapping at every level.');
  rows.forEach((mapping) => verifyProbeMapping(level, probes.find((row) => row.probeId === mapping.probeId), mapping, tolerance));
  return rows.sort((a, b) => compare(a.probeId, b.probeId));
}
function normalizeRegion(value) { const row = record(value, 'studyRegion'); exactKeys(row, ['regionId','elementIds'], 'studyRegion'); return { regionId: text(row.regionId, 'regionId'), elementIds: textArray(row.elementIds, 'studyRegion.elementIds') }; }
function normalizedMappings(value, entities, targets, label) {
  const targetMap = new Map(targets.map((row) => [targetIdentity(row), row]));
  const entityMap = new Map(entities.map((row) => [row.entityId, row]));
  const rows = array(value, `${label}Mappings`).map((row) => mappingRow(row, entityMap, targetMap, label));
  unique(rows, 'entityId', `${label} mapping`); assertMappingCoverage(rows, entities, label); return rows.sort(mappingCompare);
}
function mappingRow(value, entityMap, targetMap, label) {
  const row = record(value, `${label} mapping`); const allowed = ['entityId','sourceSemanticHash','targetIds']; if (label !== 'material') allowed.push('signature');
  exactKeys(row, allowed, `${label} mapping`); const entity = entityMap.get(text(row.entityId, `${label}.entityId`)); if (!entity) throw new TypeError(`${label} mapping references an undeclared canonical entity.`);
  if (row.sourceSemanticHash !== entity.sourceSemanticHash) throw new TypeError(`${label} mapping ancestry is stale.`);
  if (label !== 'material' && row.signature !== entity.signature) throw new TypeError(`${label} entity signature mismatch.`);
  const targetIds = textArray(row.targetIds, `${label}.targetIds`); if (!targetIds.length || targetIds.some((id) => !targetMap.has(id))) throw new TypeError(`${label} mapping references missing targets.`);
  if (label === 'material') targetIds.forEach((id) => compareMaterial(targetMap.get(id), entity));
  return { entityId: entity.entityId, sourceSemanticHash: entity.sourceSemanticHash, targetIds, ...(label !== 'material' ? { signature: entity.signature } : {}) };
}
function normalizedLoadMappings(value, entities, model, loadCaseIdentity) { const loadCase = model.loadCases.find((row) => row.loadCaseId === loadCaseIdentity); if (!loadCase) throw new TypeError('Mapped load case is missing.'); return normalizedMappings(value, entities, [...loadCase.nodalForces, ...loadCase.edgeLoads], 'load'); }
function normalizedConstraintMappings(value, entities, model) { return normalizedMappings(value, entities, [...model.restraints, ...model.prescribedDisplacements], 'restraint'); }
function normalizeQuantityMappings(value, quantities) {
  const allowed = new Set(quantities.filter((row) => row.quantityType === 'DISPLACEMENT_FUNCTIONAL').map((row) => row.quantityId));
  const rows = array(value, 'quantityMappings').map((row) => { exactKeys(record(row, 'quantity mapping'), ['quantityId','terms'], 'quantity mapping'); const quantityId = text(row.quantityId, 'quantityMapping.quantityId'); if (!allowed.has(quantityId)) throw new TypeError('Unexpected quantity mapping.'); return { quantityId, terms: normalizeTerms(row.terms) }; });
  unique(rows, 'quantityId', 'quantity mapping'); if (rows.length !== allowed.size) throw new TypeError('Every displacement functional requires a mapping at every level.'); return rows.sort((a, b) => compare(a.quantityId, b.quantityId));
}
function normalizeTerms(value) { return array(value, 'functional terms').map((row) => { exactKeys(record(row, 'functional term'), ['nodeId','component','coefficient'], 'functional term'); if (!['UX','UY'].includes(row.component)) throw new TypeError('Functional component is invalid.'); return { nodeId: text(row.nodeId, 'term.nodeId'), component: row.component, coefficient: finite(row.coefficient, 'term.coefficient') }; }).sort((a, b) => compare(a.nodeId, b.nodeId) || compare(a.component, b.component)); }
function normalizeEntities(value, label) { const rows = array(value, `${label}Entities`).map((row) => { exactKeys(record(row, `${label} entity`), ['entityId','sourceSemanticHash','signature'], `${label} entity`); return { entityId: text(row.entityId, `${label}.entityId`), sourceSemanticHash: text(row.sourceSemanticHash, `${label}.sourceSemanticHash`), signature: text(row.signature, `${label}.signature`) }; }); if (!rows.length) throw new TypeError(`At least one canonical ${label} entity is required.`); unique(rows, 'entityId', `${label} entity`); return rows.sort((a, b) => compare(a.entityId, b.entityId)); }
function normalizeMaterialEntities(value) { const rows = array(value, 'materialEntities').map((row) => { exactKeys(record(row, 'material entity'), ['entityId','sourceSemanticHash','E','nu'], 'material entity'); return { entityId: text(row.entityId, 'material.entityId'), sourceSemanticHash: text(row.sourceSemanticHash, 'material.sourceSemanticHash'), E: positive(row.E, 'material.E'), nu: finite(row.nu, 'material.nu') }; }); if (!rows.length) throw new TypeError('At least one canonical material entity is required.'); unique(rows, 'entityId', 'material entity'); return rows.sort((a, b) => compare(a.entityId, b.entityId)); }
function normalizeSingularFeatures(value, sourceHash) { const allowed=['RE_ENTRANT_CORNER','POINT_LOAD','POINT_RESTRAINT','ABRUPT_TRACTION_TERMINATION','GEOMETRIC_DISCONTINUITY','MATERIAL_DISCONTINUITY','THICKNESS_DISCONTINUITY','USER_DECLARED_IDEALIZATION_SINGULARITY']; const rows=array(value, 'singularFeatures').map((row) => { exactKeys(record(row, 'singular feature'), ['featureId','featureType','sourceSemanticHash'], 'singular feature'); if(!allowed.includes(row.featureType)||row.sourceSemanticHash!==sourceHash)throw new TypeError('Singular-feature type or ancestry is invalid.'); return { featureId: text(row.featureId, 'featureId'), featureType: row.featureType, sourceSemanticHash: sourceHash }; }); unique(rows,'featureId','singular feature'); return rows.sort((a, b) => compare(a.featureId, b.featureId)); }
function pointQuantity(row, common, probes) { exactKeys(row, ['quantityId','quantityType','sourceAuthority','probeId','component'], 'point quantity'); const probeId = text(row.probeId, 'quantity.probeId'); if (!probes.some((probe) => probe.probeId === probeId) || !POINT_QUANTITIES.includes(row.component)) throw new TypeError('Point quantity probe or component is invalid.'); return { ...common, probeId, component: row.component }; }
function reactionQuantity(row, common) { exactKeys(row, ['quantityId','quantityType','sourceAuthority','restraintEntityIds','component','referencePoint'], 'reaction quantity'); if (!['FX','FY','MZ'].includes(row.component)) throw new TypeError('Reaction resultant component is invalid.'); return { ...common, restraintEntityIds: textArray(row.restraintEntityIds, 'restraintEntityIds'), component: row.component, referencePoint: point(row.referencePoint, 'referencePoint') }; }
function maximumQuantity(row, common) { exactKeys(row, ['quantityId','quantityType','sourceAuthority','regionId','component','maximumPolicy'], 'maximum stress quantity'); if (!RAW_STRESS_COMPONENTS.includes(row.component)) throw new TypeError('Maximum raw-stress component is invalid.'); if (!['MAXIMUM_SIGNED','MAXIMUM_ABSOLUTE'].includes(row.maximumPolicy)) throw new TypeError('Maximum raw-stress policy is invalid.'); return { ...common, regionId: text(row.regionId, 'regionId'), component: row.component, maximumPolicy: row.maximumPolicy }; }
function exactQuantityKeys(row, common, keys) { exactKeys(row, keys, 'quantity'); return common; }
function normalizeUnits(value) { const row = record(value, 'units'); exactKeys(row, ['length','force','stress'], 'units'); return { length: text(row.length, 'units.length'), force: text(row.force, 'units.force'), stress: text(row.stress, 'units.stress') }; }
function normalizeOutOfPlane(value, formulation) { const row = record(value, 'outOfPlane'); exactKeys(row, ['mode','value'], 'outOfPlane'); const expected = formulation === FORMULATIONS.PLANE_STRESS ? 'THICKNESS' : 'OUT_OF_PLANE_SCALE'; if (row.mode !== expected) throw new TypeError(`outOfPlane.mode must equal ${expected}.`); return { mode: expected, value: positive(row.value, 'outOfPlane.value') }; }
function finiteTotals(value) { const row = record(value, 'appliedLoadTotals'); exactKeys(row, ['fx','fy','mz'], 'appliedLoadTotals'); return { fx: finite(row.fx, 'fx'), fy: finite(row.fy, 'fy'), mz: finite(row.mz, 'mz') }; }
function compareTotals(actual, expected, tolerance) { for (const key of ['fx','fy','mz']) if (!Number.isFinite(actual?.[key]) || Math.abs(actual[key] - expected[key]) > tolerance) throw new TypeError('Applied force or moment totals are incomparable.'); }
function compareOutOfPlane(model, expected, tolerance) { if (expected.mode === 'OUT_OF_PLANE_SCALE') { if (Math.abs(model.solverProfile.outOfPlaneScale - expected.value) > tolerance) throw new TypeError('Plane-strain out-of-plane scales are incomparable.'); return; } model.elements.forEach((row) => { if (Math.abs(row.thickness - expected.value) > tolerance) throw new TypeError('Plane-stress thicknesses are incomparable.'); }); }
function compareMaterial(actual, expected) { if (actual.E !== expected.E || actual.nu !== expected.nu) throw new TypeError('Material properties are incomparable.'); }
function reactionContribution(row, node, quantity) { if (quantity.component === 'FX') return row.component === 'UX' ? row.value : 0; if (quantity.component === 'FY') return row.component === 'UY' ? row.value : 0; const fx = row.component === 'UX' ? row.value : 0, fy = row.component === 'UY' ? row.value : 0; return (node.x - quantity.referencePoint.x) * fy - (node.y - quantity.referencePoint.y) * fx; }
function assertCanonicalAncestry(problem) {
  const rows = [...problem.geometryEntities, ...problem.materialEntities, ...problem.loadEntities, ...problem.restraintEntities];
  if (rows.some((row) => row.sourceSemanticHash !== problem.sourceSemanticHash)) throw new TypeError('Canonical physical-problem entity ancestry is stale or mixed.');
}
function assertLevelMappingCoverage(model, region, geometry, materials, loads, restraints, loadCaseIdentity) {
  assertTargetSet(geometry, region.elementIds, 'study-region geometry');
  const elementMap = new Map(model.elements.map((row) => [row.elementId, row]));
  const materialIds = [...new Set(region.elementIds.map((id) => elementMap.get(id).materialId))].sort(compare);
  assertTargetSet(materials, materialIds, 'study-region material');
  const loadCase = model.loadCases.find((row) => row.loadCaseId === loadCaseIdentity);
  assertTargetSet(loads, [...loadCase.nodalForces, ...loadCase.edgeLoads].map(targetIdentity), 'load-case load');
  assertTargetSet(restraints, [...model.restraints, ...model.prescribedDisplacements].map(targetIdentity), 'boundary-condition');
}
function assertTargetSet(mappings, expected, label) {
  const actual = [...new Set(mappings.flatMap((row) => row.targetIds))].sort(compare);
  const normalized = [...new Set(expected)].sort(compare);
  if (JSON.stringify(actual) !== JSON.stringify(normalized)) throw new TypeError(`Every ${label} target must be mapped exactly once.`);
  const count = mappings.flatMap((row) => row.targetIds).length;
  if (count !== actual.length) throw new TypeError(`${label} targets cannot appear in multiple canonical mappings.`);
}
function maximumCompare(left, right, policy) {
  const delta = policy === 'MAXIMUM_ABSOLUTE' ? Math.abs(right.value) - Math.abs(left.value) : right.value - left.value;
  return delta || compare(left.locationIdentity, right.locationIdentity);
}
function targetIdentity(row) { return row.elementId || row.materialId || row.loadId || row.constraintId; }
function assertMappingCoverage(rows, entities, label) { if (JSON.stringify(rows.map((row) => row.entityId).sort(compare)) !== JSON.stringify(entities.map((row) => row.entityId))) throw new TypeError(`Every canonical ${label} entity requires exactly one level mapping.`); }
function mappingCompare(a, b) { return compare(a.entityId, b.entityId); }
function point(value, name) { const row = record(value, name); exactKeys(row, ['x','y'], name); return { x: finite(row.x, `${name}.x`), y: finite(row.y, `${name}.y`) }; }
function pointNatural(value) { const row = record(value, 'naturalCoordinates'); exactKeys(row, ['xi','eta'], 'naturalCoordinates'); return { xi: finite(row.xi, 'xi'), eta: finite(row.eta, 'eta') }; }
function unique(rows, key, label) { if (new Set(rows.map((row) => row[key])).size !== rows.length) throw new TypeError(`Duplicate ${label} identity.`); }
function textArray(value, name) { const rows = array(value, name).map((item) => text(item, name)); if (new Set(rows).size !== rows.length) throw new TypeError(`${name} contains duplicates.`); return rows.sort(compare); }
function array(value, name) { if (!Array.isArray(value)) throw new TypeError(`${name} must be an array.`); return value; }
function record(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be a record.`); return value; }
function exactKeys(value, allowed, name) { const extras = Object.keys(value).filter((key) => !allowed.includes(key)); if (extras.length) throw new TypeError(`${name} contains unsupported fields: ${extras.sort(compare).join(', ')}.`); }
function text(value, name) { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} is required.`); return value.trim(); }
function finite(value, name) { if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite.`); return value; }
function positive(value, name) { const row = finite(value, name); if (!(row > 0)) throw new TypeError(`${name} must be positive.`); return row; }
function positiveInteger(value, name) { const row = positive(value, name); if (!Number.isInteger(row)) throw new TypeError(`${name} must be an integer.`); return row; }
function withoutHash(value) { const { semanticHash: _hash, ...base } = value || {}; return base; }
function compare(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
