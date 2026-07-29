import {
  canonicalStringify,
  semanticHash as hashCanonicalValue,
} from '../shared-piping-model/canonical-json.js';
import { canonicalizeLinearFeaModel } from './model-canonicalization.js';
import { canonicalDiagnosticEvidence } from './model-diagnostics.js';

export function computeValidationProfileSemanticHash(profile) {
  return hashCanonicalValue({
    profileId: profile.profileId,
    zeroLengthTolerance: profile.zeroLengthTolerance,
    unitVectorTolerance: profile.unitVectorTolerance,
    orthogonalityTolerance: profile.orthogonalityTolerance,
    handednessTolerance: profile.handednessTolerance,
  });
}

function stiffnessConstraintProjection(constraint) {
  if (constraint.behavior === 'LINEAR_SPRING') {
    return {
      nodeId: constraint.nodeId,
      dof: constraint.dof,
      behavior: constraint.behavior,
      basis: constraint.basis,
      stiffness: constraint.stiffness,
    };
  }
  return {
    nodeId: constraint.nodeId,
    dof: constraint.dof,
    basis: constraint.basis,
    partition: 'CONSTRAINED',
  };
}

function compareCanonicalProjection(left, right) {
  const a = canonicalStringify(left);
  const b = canonicalStringify(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function canonicalizeProjectionRecords(records) {
  return [...records].sort(compareCanonicalProjection);
}

export function stiffnessStateProjection(candidate) {
  const model = canonicalizeLinearFeaModel(candidate);
  const materials = new Map(model.materialStates.map((state) => [state.materialStateId, state]));
  const sections = new Map(model.sectionStates.map((state) => [state.sectionStateId, state]));
  const elementProjections = model.elements.map((element) => {
    const material = materials.get(element.materialStateId);
    const section = sections.get(element.sectionStateId);
    return {
      formulationId: element.formulationId,
      nodeI: element.nodeI,
      nodeJ: element.nodeJ,
      localAxes: {
        x: element.localAxes.x,
        y: element.localAxes.y,
        z: element.localAxes.z,
      },
      material: {
        elasticModulus: material?.elasticModulus,
        shearModulus: material?.shearModulus,
      },
      section: {
        area: section?.area,
        secondMomentY: section?.secondMomentY,
        secondMomentZ: section?.secondMomentZ,
        polarMoment: section?.polarMoment,
      },
    };
  });
  const constraintProjections = model.constraints.map(stiffnessConstraintProjection);
  return {
    schema: model.schema,
    units: model.units,
    conventions: model.conventions,
    formulationRegistryVersion: model.formulationRegistryVersion,
    nodes: model.nodes.map((node) => ({
      nodeId: node.nodeId,
      position: node.position,
    })),
    elements: canonicalizeProjectionRecords(elementProjections),
    constraints: canonicalizeProjectionRecords(constraintProjections),
    limitations: model.limitations
      .filter((limitation) => limitation.stiffnessRelevant)
      .map((limitation) => ({
        code: limitation.code,
        severity: limitation.severity,
        scope: limitation.scope,
        details: limitation.details,
      })),
  };
}

export function semanticProjection(candidate) {
  const model = canonicalizeLinearFeaModel(candidate);
  const {
    diagnostics: _diagnostics,
    stiffnessStateHash: _stiffnessStateHash,
    semanticHash: _semanticHash,
    evidenceHash: _evidenceHash,
    ...semanticModel
  } = model;
  return semanticModel;
}

export function evidenceProjection(candidate) {
  const model = canonicalizeLinearFeaModel(candidate);
  return {
    semanticHash: model.semanticHash,
    diagnostics: canonicalDiagnosticEvidence(model.diagnostics),
  };
}

export function computeStiffnessStateHash(candidate) {
  return hashCanonicalValue(stiffnessStateProjection(candidate));
}

export function computeSemanticHash(candidate) {
  return hashCanonicalValue(semanticProjection(candidate));
}

export function computeEvidenceHash(candidate) {
  return hashCanonicalValue(evidenceProjection(candidate));
}
