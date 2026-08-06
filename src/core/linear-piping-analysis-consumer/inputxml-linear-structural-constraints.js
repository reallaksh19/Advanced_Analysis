import { InputXmlLinearStructuralPreparationError } from './inputxml-linear-structural-profile.js';

const DOFS = Object.freeze(['UX', 'UY', 'UZ', 'RX', 'RY', 'RZ']);
const ALLOWED_DISPOSITIONS = new Set([
  'IMPLEMENTED_EXACTLY',
  'IMPLEMENTED_WITH_DECLARED_APPROXIMATION',
]);

export function compileInputXmlStructuralConstraints({ inventory, modelId, analysisProfileId }) {
  const declarations = [];
  const bindings = [];
  const occupied = new Map();
  const restraints = inventory
    .filter((row) => row.active && row.sourceKind === 'RESTRAINT')
    .sort((left, right) => compareAscii(left.inventoryId, right.inventoryId));

  for (const item of restraints) {
    const disposition = item.dispositionByProfile[analysisProfileId] ?? null;
    if (!ALLOWED_DISPOSITIONS.has(disposition?.disposition)) {
      fail(
        'INPUTXML_STRUCTURAL_RESTRAINT_NOT_REPRESENTABLE',
        `Restraint ${item.inventoryId} is not representable under ${analysisProfileId}.`,
        { inventoryId: item.inventoryId, disposition },
      );
    }
    const sourceNodeId = item.classification.nodeId ?? null;
    const targetDof = item.classification.targetDof;
    if (sourceNodeId === null || targetDof === null) {
      fail(
        'INPUTXML_STRUCTURAL_RESTRAINT_TARGET_INVALID',
        `Restraint ${item.inventoryId} has no valid node/DOF target.`,
        { inventoryId: item.inventoryId, sourceNodeId, targetDof },
      );
    }
    const dofs = targetDof === 'ALL' ? DOFS : [targetDof];
    const declarationIds = [];
    for (const dof of dofs) {
      const key = `${sourceNodeId}:${dof}`;
      if (occupied.has(key)) {
        fail(
          'INPUTXML_STRUCTURAL_RESTRAINT_DOF_COLLISION',
          `Constraint target ${key} has more than one retained source declaration.`,
          { key, sourceFeatureIds: [occupied.get(key), item.sourceFeatureId] },
        );
      }
      occupied.set(key, item.sourceFeatureId);
      const declarationId = `${modelId}-C-${safe(item.sourceFeatureId)}-${dof}`;
      declarations.push(Object.freeze({
        declarationId,
        kind: 'NODAL_RESTRAINT',
        nodeId: `${modelId}.N${safe(sourceNodeId)}`,
        dof,
        behavior: 'FIXED',
      }));
      declarationIds.push(declarationId);
    }
    bindings.push(Object.freeze({
      sourceFeatureId: item.sourceFeatureId,
      inventoryId: item.inventoryId,
      sourceRecordSemanticHash: item.sourceRecordSemanticHash,
      sourceNodeId: String(sourceNodeId),
      targetDofs: Object.freeze([...dofs]),
      implementation: disposition.disposition,
      limitationCode: disposition.limitationCode,
      declarationIds: Object.freeze(declarationIds),
    }));
  }

  declarations.sort((left, right) => compareAscii(left.declarationId, right.declarationId));
  bindings.sort((left, right) => compareAscii(left.inventoryId, right.inventoryId));
  return Object.freeze({
    declarations: Object.freeze(declarations),
    bindings: Object.freeze(bindings),
  });
}

function fail(code, message, data) {
  throw new InputXmlLinearStructuralPreparationError(message, code, data);
}

function safe(value) {
  return String(value).replace(/[^A-Za-z0-9_.-]/gu, '-');
}

function compareAscii(left, right) {
  const a = String(left);
  const b = String(right);
  return a < b ? -1 : a > b ? 1 : 0;
}
