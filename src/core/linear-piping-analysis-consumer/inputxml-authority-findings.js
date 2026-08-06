import {
  createInputXmlModelHealthFinding as finding,
  inputXmlCapabilityEffect as effect,
  inputXmlBothProfileEffects as bothProfiles,
} from './inputxml-model-health-finding.js';
import { resolveInputXmlThermalExpansionAuthority } from './inputxml-thermal-authority.js';

const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);

export function buildInputXmlAuthorityFindings(sourceBundle, inventory) {
  return Object.freeze([
    ...materialFindings(sourceBundle),
    ...restraintCollisionFindings(inventory),
    ...thermalFindings(sourceBundle),
  ]);
}

function materialFindings(sourceBundle) {
  const rows = [];
  for (const element of sourceBundle.elementRecords) {
    const fields = element.fields;
    const invalid = [];
    if (!(fields.diameter?.canonicalValue > 0)) invalid.push('diameter');
    if (!(fields.wallThickness?.canonicalValue > 0)) invalid.push('wallThickness');
    if (!(fields.elasticModulus?.canonicalValue > 0)) invalid.push('elasticModulus');
    if (!(fields.poissonRatio?.canonicalValue > 0 && fields.poissonRatio.canonicalValue < 0.5)) invalid.push('poissonRatio');
    if (!(fields.pipeDensity?.canonicalValue > 0)) invalid.push('pipeDensity');
    if (invalid.length === 0) continue;
    rows.push(finding({
      code: 'MODEL_MATERIAL_OR_SECTION_FIELD_INVALID',
      category: 'AUTHORITY',
      severity: 'error',
      message: `Source element ${element.sourceElementNumber} has invalid required fields: ${invalid.join(', ')}.`,
      entities: { segmentIds: [element.segmentId], sourceElementIndices: [element.sourceElementIndex] },
      evidence: { invalidFields: invalid, sourcePath: element.sourcePath },
      authority: 'INPUTXML_SOURCE_BUNDLE',
      remediation: 'Declare valid pipe dimensions, modulus, Poisson ratio, and pipe density.',
      capabilityEffects: bothProfiles('BLOCK', 'MODEL_MATERIAL_OR_SECTION_FIELD_INVALID'),
    }));
  }
  return rows;
}

function restraintCollisionFindings(inventory) {
  const byKey = new Map();
  for (const item of inventory.filter((row) => row.active && row.sourceKind === 'RESTRAINT')) {
    const nodeId = item.targetIds.nodeIds[0];
    const target = item.classification.targetDof;
    if (!nodeId || !target) continue;
    const dofs = target === 'ALL' ? DOFS : [target];
    for (const dof of dofs) {
      const key = `${nodeId}:${dof}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(item);
    }
  }
  const rows = [];
  for (const [key, items] of byKey.entries()) {
    if (items.length < 2) continue;
    const [nodeId, dof] = key.split(':');
    rows.push(finding({
      code: 'MODEL_RESTRAINT_DUPLICATE_DOF_DECLARATION',
      category: 'RESTRAINT',
      severity: 'error',
      message: `${items.length} source restraint declarations map to ${nodeId}:${dof}.`,
      entities: { nodeIds: [nodeId], sourceFeatureIds: items.map((item) => item.sourceFeatureId) },
      evidence: { nodeId, dof, inventoryIds: items.map((item) => item.inventoryId) },
      authority: 'INPUTXML_SOURCE_BUNDLE_PRECOMPILATION',
      remediation: 'Resolve duplicate or conflicting declarations before constraint compilation.',
      capabilityEffects: bothProfiles('BLOCK', 'MODEL_RESTRAINT_DUPLICATE_DOF_DECLARATION'),
    }));
  }
  return rows;
}

function thermalFindings(sourceBundle) {
  const active = sourceBundle.sourceRecords.temperatureSets.filter(
    (row) => row.canonicalValue !== null && !row.sentinel?.matched,
  );
  if (active.length === 0) {
    return [finding({
      code: 'MODEL_OPERATING_TEMPERATURE_NOT_DECLARED',
      category: 'LOAD',
      severity: 'warning',
      message: 'No active operating temperature set is declared; an operating thermal case is not available.',
      entities: {},
      evidence: { activeTemperatureRecordCount: 0 },
      authority: 'INPUTXML_SOURCE_BUNDLE',
      remediation: 'Declare an operating temperature set when an operating thermal case is required.',
      capabilityEffects: {
        OPERATING_CASE_STRICT: effect('BLOCK', 'MODEL_OPERATING_TEMPERATURE_NOT_DECLARED'),
        OPERATING_CASE_APPROXIMATE: effect('BLOCK', 'MODEL_OPERATING_TEMPERATURE_NOT_DECLARED'),
      },
    })];
  }
  const unresolved = sourceBundle.elementRecords
    .map((element) => ({
      element,
      authority: resolveInputXmlThermalExpansionAuthority(
        element.fields.materialNumber?.canonicalValue,
      ),
    }))
    .filter((row) => row.authority.status !== 'RESOLVED');
  if (unresolved.length === 0) return [];
  return [finding({
    code: 'MODEL_THERMAL_EXPANSION_AUTHORITY_UNRESOLVED',
    category: 'AUTHORITY',
    severity: 'error',
    message: `${unresolved.length} source element(s) have no qualified thermal-expansion authority.`,
    entities: {
      segmentIds: unresolved.map((row) => row.element.segmentId),
      sourceElementIndices: unresolved.map((row) => row.element.sourceElementIndex),
    },
    evidence: {
      unresolvedMaterials: unresolved.map((row) => ({
        sourceElementIndex: row.element.sourceElementIndex,
        materialNumber: row.authority.materialNumber,
      })),
      activeTemperatureRecordCount: active.length,
    },
    authority: 'INPUTXML_THERMAL_EXPANSION_AUTHORITY_REGISTRY',
    remediation: 'Add a reviewed material-specific thermal-expansion authority before operating analysis.',
    capabilityEffects: {
      THERMAL_AUTHORITY: effect('BLOCK', 'MODEL_THERMAL_EXPANSION_AUTHORITY_UNRESOLVED'),
    },
  })];
}
