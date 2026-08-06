import { semanticHash } from '../shared-piping-model/canonical-json.js';
import {
  createInputXmlModelHealthFinding as finding,
  inputXmlCapabilityEffect as effect,
  inputXmlBothProfileEffects as bothProfiles,
} from './inputxml-model-health-finding.js';

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
  const signatures = new Map();
  for (const element of sourceBundle.elementRecords) {
    const fields = element.fields;
    const invalid = [];
    if (!(fields.diameter?.canonicalValue > 0)) invalid.push('diameter');
    if (!(fields.wallThickness?.canonicalValue > 0)) invalid.push('wallThickness');
    if (!(fields.elasticModulus?.canonicalValue > 0)) invalid.push('elasticModulus');
    if (!(fields.poissonRatio?.canonicalValue > 0 && fields.poissonRatio.canonicalValue < 0.5)) invalid.push('poissonRatio');
    if (!(fields.pipeDensity?.canonicalValue > 0)) invalid.push('pipeDensity');
    if (invalid.length > 0) {
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
      continue;
    }
    const signature = semanticHash({
      elasticModulus: fields.elasticModulus.canonicalValue,
      poissonRatio: fields.poissonRatio.canonicalValue,
      pipeDensity: fields.pipeDensity.canonicalValue,
    });
    if (!signatures.has(signature)) signatures.set(signature, []);
    signatures.get(signature).push(element.segmentId);
  }
  if (signatures.size > 1) {
    rows.push(finding({
      code: 'MODEL_PER_ELEMENT_MATERIAL_BINDING_REQUIRED',
      category: 'AUTHORITY',
      severity: 'error',
      message: `The model contains ${signatures.size} distinct material states; the current generic compiler binds one material state to every element.`,
      entities: { segmentIds: [...signatures.values()].flat() },
      evidence: { materialStateCount: signatures.size, groups: [...signatures.entries()] },
      authority: 'GENERIC_INPUTXML_CURRENT_COMPILER',
      remediation: 'Use per-element material authority binding before strict analysis.',
      capabilityEffects: {
        STRICT_LINEAR_STATIC: effect('BLOCK', 'MODEL_PER_ELEMENT_MATERIAL_BINDING_REQUIRED'),
        APPROXIMATE_LINEAR_STATIC: effect('CONDITIONAL', 'GENERIC_APPROX_SINGLE_MATERIAL_STATE'),
      },
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
  return [finding({
    code: 'MODEL_THERMAL_AUTHORITY_NOT_PROFILE_BOUND',
    category: 'AUTHORITY',
    severity: 'error',
    message: 'Temperature records are retained, but per-element thermal-expansion authority is not yet bound by the model-health preparation pipeline.',
    entities: {
      sourceFeatureIds: active.map((row) => row.sourceFeatureId),
      segmentIds: active.map((row) => row.segmentId),
    },
    evidence: { activeTemperatureRecordCount: active.length },
    authority: 'MODEL_HEALTH_IMPLEMENTATION_BOUNDARY',
    remediation: 'Bind each element to a resolved material and thermal-expansion state before operating analysis.',
    capabilityEffects: { THERMAL_AUTHORITY: effect('BLOCK', 'MODEL_THERMAL_AUTHORITY_NOT_PROFILE_BOUND') },
  })];
}
